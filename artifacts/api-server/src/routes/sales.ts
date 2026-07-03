import { Router, type Request, type Response } from "express";
import {
  db,
  quizzesTable,
  leadsTable,
  leadEventsTable,
  followupsTable,
  referralsTable,
  submitQuizSchema,
  LEAD_STATUSES,
  FOLLOWUP_STATUSES,
  type Quiz,
  type QuizQuestion,
  type ResultBand,
  type LeadAnswer,
  type LeadStatus,
} from "@workspace/db";
import { and, desc, asc, eq, lte, count } from "drizzle-orm";
import { DEFAULT_QUIZZES } from "../lib/salesSeed";
import { CADENCE_BY_TEMPERATURE, renderMessage } from "../lib/salesCadence";

// Estágios em que a captação terminou → cancela follow-ups pendentes
const TERMINAL_STATUSES = new Set(["agendado", "compareceu", "fechado", "perdido"]);

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name.trim();
}

/** Gera um código de indicação único (ex: IND-A1B2C3). */
async function generateReferralCode(): Promise<string> {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 8; attempt++) {
    let suffix = "";
    for (let i = 0; i < 6; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
    const code = `IND-${suffix}`;
    const [exists] = await db
      .select({ id: referralsTable.id })
      .from(referralsTable)
      .where(eq(referralsTable.code, code))
      .limit(1);
    if (!exists) return code;
  }
  return `IND-${Date.now().toString(36).toUpperCase()}`;
}

/** Gera a fila de follow-up de um lead conforme a cadência da sua temperatura. */
async function generateFollowups(leadId: number, temperature: string, name: string): Promise<void> {
  const steps = CADENCE_BY_TEMPERATURE[temperature] ?? CADENCE_BY_TEMPERATURE.frio;
  const now = Date.now();
  const rows = steps.map((s) => ({
    leadId,
    stepOrder: s.order,
    channel: s.channel,
    title: s.title,
    message: renderMessage(s.message, firstName(name)),
    dueAt: new Date(now + s.offsetHours * 3600 * 1000),
    status: "pending" as const,
  }));
  if (rows.length) await db.insert(followupsTable).values(rows);
}

const router = Router();

// --- helpers ---------------------------------------------------------------

function requireAuth(req: Request, res: Response): boolean {
  if (!req.user?.email) {
    res.status(401).json({ error: "Não autenticado" });
    return false;
  }
  return true;
}

/** Remove os pontos das opções antes de expor o quiz publicamente. */
function toPublicQuiz(quiz: Quiz) {
  return {
    slug: quiz.slug,
    title: quiz.title,
    specialty: quiz.specialty,
    description: quiz.description,
    questions: (quiz.questions as QuizQuestion[]).map((q) => ({
      id: q.id,
      question: q.question,
      help: q.help,
      options: q.options.map((o) => ({ label: o.label })),
    })),
  };
}

/** Calcula score, temperatura, segmento e resultado a partir das respostas. */
function scoreSubmission(
  quiz: Quiz,
  answers: { questionId: string; optionIndex: number }[],
): { score: number; temperature: string; segment: string | null; band: ResultBand | null; leadAnswers: LeadAnswer[] } {
  const questions = quiz.questions as QuizQuestion[];
  const bands = (quiz.resultBands as ResultBand[]).slice().sort((a, b) => a.min - b.min);

  let score = 0;
  const tagCounts = new Map<string, number>();
  const leadAnswers: LeadAnswer[] = [];

  for (const ans of answers) {
    const question = questions.find((q) => q.id === ans.questionId);
    if (!question) continue;
    const option = question.options[ans.optionIndex];
    if (!option) continue;
    score += option.points;
    if (option.tag) tagCounts.set(option.tag, (tagCounts.get(option.tag) ?? 0) + 1);
    leadAnswers.push({
      questionId: question.id,
      question: question.question,
      label: option.label,
      points: option.points,
    });
  }

  // Faixa de resultado: a maior faixa cujo min <= score
  let band: ResultBand | null = null;
  for (const b of bands) {
    if (score >= b.min) band = b;
  }
  const temperature = band?.level ?? "frio";

  // Segmento = tag mais frequente
  let segment: string | null = null;
  let best = 0;
  for (const [tag, c] of tagCounts) {
    if (c > best) {
      best = c;
      segment = tag;
    }
  }

  return { score, temperature, segment, band, leadAnswers };
}

function buildWhatsappUrl(numberE164: string, message: string): string {
  const clean = numberE164.replace(/\D/g, "");
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

// ===========================================================================
// PÚBLICO (sem autenticação) — o paciente responde o quiz
// ===========================================================================

router.get("/public/quiz/:slug", async (req: Request, res: Response): Promise<void> => {
  const slug = String(req.params.slug);
  const [quiz] = await db
    .select()
    .from(quizzesTable)
    .where(and(eq(quizzesTable.slug, slug), eq(quizzesTable.active, true)))
    .limit(1);
  if (!quiz) {
    res.status(404).json({ error: "Quiz não encontrado" });
    return;
  }
  res.json(toPublicQuiz(quiz));
});

router.post("/public/quiz/:slug/submit", async (req: Request, res: Response): Promise<void> => {
  const parsed = submitQuizSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
    return;
  }

  const slug = String(req.params.slug);
  const [quiz] = await db
    .select()
    .from(quizzesTable)
    .where(and(eq(quizzesTable.slug, slug), eq(quizzesTable.active, true)))
    .limit(1);
  if (!quiz) {
    res.status(404).json({ error: "Quiz não encontrado" });
    return;
  }

  const { name, phone, email, source, ref, answers } = parsed.data;
  const { score, temperature, segment, band, leadAnswers } = scoreSubmission(quiz, answers);

  // Atribuição de indicação: valida o código e conta a conversão
  let referredByCode: string | null = null;
  if (ref) {
    const [referral] = await db
      .select({ code: referralsTable.code })
      .from(referralsTable)
      .where(and(eq(referralsTable.code, ref), eq(referralsTable.active, true)))
      .limit(1);
    if (referral) referredByCode = referral.code;
  }

  const resultTitle = band?.title ?? "Recebemos suas respostas";
  const resultMessage =
    band?.message ?? "Com base no que você respondeu, uma avaliação pode ajudar a identificar a causa.";

  const [lead] = await db
    .insert(leadsTable)
    .values({
      quizId: quiz.id,
      name: name.trim(),
      phone: phone.trim(),
      email: email ? email.trim() : null,
      specialty: quiz.specialty,
      segment,
      answers: leadAnswers,
      score,
      temperature,
      status: "novo",
      source: source ?? null,
      referredByCode,
      resultShown: resultMessage,
    })
    .returning();

  await db.insert(leadEventsTable).values({
    leadId: lead.id,
    type: "created",
    payload: { via: "quiz", slug: quiz.slug, score, temperature },
  });

  // Gera a cadência de follow-up automática conforme a temperatura
  await generateFollowups(lead.id, temperature, name);

  const waMessage =
    `Olá! Fiz o quiz "${quiz.title}" e quero agendar uma avaliação.\n` +
    `Nome: ${name.trim()}\n` +
    `Meu resultado: ${resultTitle}`;

  res.json({
    result: { title: resultTitle, message: resultMessage, temperature },
    whatsappUrl: buildWhatsappUrl(quiz.whatsappNumber, waMessage),
  });
});

// ===========================================================================
// AUTENTICADO — painel da clínica (leads, quizzes, stats)
// ===========================================================================

// ---- Leads ----------------------------------------------------------------

router.get("/leads", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const { status, temperature } = req.query as { status?: string; temperature?: string };
  const conditions = [];
  if (status && (LEAD_STATUSES as readonly string[]).includes(status)) {
    conditions.push(eq(leadsTable.status, status));
  }
  if (temperature && ["frio", "morno", "quente"].includes(temperature)) {
    conditions.push(eq(leadsTable.temperature, temperature));
  }

  const rows = await db
    .select()
    .from(leadsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(leadsTable.createdAt))
    .limit(500);

  res.json(rows);
});

router.get("/leads/:id", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = Number(req.params.id);
  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, id)).limit(1);
  if (!lead) {
    res.status(404).json({ error: "Lead não encontrado" });
    return;
  }
  const events = await db
    .select()
    .from(leadEventsTable)
    .where(eq(leadEventsTable.leadId, id))
    .orderBy(desc(leadEventsTable.createdAt));
  res.json({ ...lead, events });
});

router.patch("/leads/:id", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = Number(req.params.id);
  const { status, notes, lostReason, consciousness } = req.body as {
    status?: LeadStatus;
    notes?: string;
    lostReason?: string;
    consciousness?: number;
  };

  const [existing] = await db.select().from(leadsTable).where(eq(leadsTable.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Lead não encontrado" });
    return;
  }

  const update: Partial<typeof leadsTable.$inferInsert> = { updatedAt: new Date() };
  if (status && (LEAD_STATUSES as readonly string[]).includes(status)) update.status = status;
  if (typeof notes === "string") update.notes = notes;
  if (typeof lostReason === "string") update.lostReason = lostReason;
  if (typeof consciousness === "number") update.consciousness = consciousness;

  const [updated] = await db.update(leadsTable).set(update).where(eq(leadsTable.id, id)).returning();

  if (status && status !== existing.status) {
    await db.insert(leadEventsTable).values({
      leadId: id,
      type: "status_change",
      payload: { from: existing.status, to: status, by: req.user?.email },
    });
    // Ao entrar num estágio terminal, cancela follow-ups pendentes deste lead
    if (TERMINAL_STATUSES.has(status)) {
      await db
        .update(followupsTable)
        .set({ status: "cancelled" })
        .where(and(eq(followupsTable.leadId, id), eq(followupsTable.status, "pending")));
    }
  }
  if (typeof notes === "string" && notes.trim()) {
    await db.insert(leadEventsTable).values({
      leadId: id,
      type: "note",
      payload: { text: notes.trim(), by: req.user?.email },
    });
  }

  res.json(updated);
});

// ---- Stats (funil) --------------------------------------------------------

router.get("/stats", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;

  const byStatus = await db
    .select({ status: leadsTable.status, total: count() })
    .from(leadsTable)
    .groupBy(leadsTable.status);

  const byTemperature = await db
    .select({ temperature: leadsTable.temperature, total: count() })
    .from(leadsTable)
    .groupBy(leadsTable.temperature);

  const bySpecialty = await db
    .select({ specialty: leadsTable.specialty, total: count() })
    .from(leadsTable)
    .groupBy(leadsTable.specialty);

  const [total] = await db.select({ total: count() }).from(leadsTable);

  const statusMap: Record<string, number> = {};
  for (const s of LEAD_STATUSES) statusMap[s] = 0;
  for (const r of byStatus) statusMap[r.status] = Number(r.total);

  const totalLeads = Number(total.total);
  const agendados = statusMap["agendado"] + statusMap["compareceu"] + statusMap["fechado"];
  const fechados = statusMap["fechado"];

  res.json({
    totalLeads,
    byStatus: statusMap,
    byTemperature: Object.fromEntries(byTemperature.map((r) => [r.temperature, Number(r.total)])),
    bySpecialty: bySpecialty.map((r) => ({ specialty: r.specialty, total: Number(r.total) })),
    conversion: {
      leadToAgendamento: totalLeads ? Math.round((agendados / totalLeads) * 100) : 0,
      leadToFechado: totalLeads ? Math.round((fechados / totalLeads) * 100) : 0,
    },
  });
});

// ---- Quizzes --------------------------------------------------------------

router.get("/quizzes", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const rows = await db.select().from(quizzesTable).orderBy(desc(quizzesTable.createdAt));

  // anexa contagem de leads por quiz
  const counts = await db
    .select({ quizId: leadsTable.quizId, total: count() })
    .from(leadsTable)
    .groupBy(leadsTable.quizId);
  const countMap = new Map(counts.map((c) => [c.quizId, Number(c.total)]));

  res.json(rows.map((q) => ({ ...q, leadCount: countMap.get(q.id) ?? 0 })));
});

router.post("/quizzes", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const { slug, title, specialty, segment, description, whatsappNumber, questions, resultBands } =
    req.body as Partial<typeof quizzesTable.$inferInsert>;

  if (!slug || !title || !whatsappNumber) {
    res.status(400).json({ error: "slug, title e whatsappNumber são obrigatórios" });
    return;
  }

  const [existing] = await db
    .select({ id: quizzesTable.id })
    .from(quizzesTable)
    .where(eq(quizzesTable.slug, slug))
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "Já existe um quiz com esse slug" });
    return;
  }

  const [created] = await db
    .insert(quizzesTable)
    .values({
      slug,
      title,
      specialty: specialty ?? "ortopedia",
      segment: segment ?? null,
      description: description ?? null,
      whatsappNumber,
      questions: (questions as QuizQuestion[]) ?? [],
      resultBands: (resultBands as ResultBand[]) ?? [],
    })
    .returning();
  res.status(201).json(created);
});

router.patch("/quizzes/:id", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = Number(req.params.id);
  const body = req.body as Partial<typeof quizzesTable.$inferInsert>;
  const allowed: Partial<typeof quizzesTable.$inferInsert> = {};
  for (const k of ["title", "specialty", "segment", "description", "whatsappNumber", "questions", "resultBands", "active"] as const) {
    if (k in body) (allowed as Record<string, unknown>)[k] = body[k];
  }
  const [updated] = await db.update(quizzesTable).set(allowed).where(eq(quizzesTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Quiz não encontrado" });
    return;
  }
  res.json(updated);
});

// Cria os quizzes padrão do playbook (ortopedia) se ainda não existirem
router.post("/quizzes/seed", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const { whatsappNumber } = req.body as { whatsappNumber?: string };

  const existing = await db.select({ slug: quizzesTable.slug }).from(quizzesTable);
  const existingSlugs = new Set(existing.map((q) => q.slug));

  const toCreate = DEFAULT_QUIZZES.filter((q) => !existingSlugs.has(q.slug)).map((q) => ({
    ...q,
    whatsappNumber: whatsappNumber?.replace(/\D/g, "") || q.whatsappNumber,
  }));

  if (toCreate.length === 0) {
    res.json({ created: 0, message: "Quizzes padrão já existem" });
    return;
  }

  const created = await db.insert(quizzesTable).values(toCreate).returning({ slug: quizzesTable.slug });
  res.status(201).json({ created: created.length, slugs: created.map((c) => c.slug) });
});

// ---- Indicações (referral) ------------------------------------------------

// PÚBLICO: registra um clique no link de indicação e devolve para onde ir
router.get("/public/referral/:code", async (req: Request, res: Response): Promise<void> => {
  const code = String(req.params.code);
  const [referral] = await db
    .select()
    .from(referralsTable)
    .where(and(eq(referralsTable.code, code), eq(referralsTable.active, true)))
    .limit(1);
  if (!referral) {
    res.status(404).json({ error: "Indicação inválida" });
    return;
  }
  await db
    .update(referralsTable)
    .set({ clicks: referral.clicks + 1 })
    .where(eq(referralsTable.id, referral.id));
  res.json({
    code: referral.code,
    quizSlug: referral.quizSlug,
    referrer: firstName(referral.patientName),
  });
});

router.get("/referrals", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const referrals = await db.select().from(referralsTable).orderBy(desc(referralsTable.createdAt));

  // leads gerados e conversões por código
  const generated = await db
    .select({ code: leadsTable.referredByCode, total: count() })
    .from(leadsTable)
    .groupBy(leadsTable.referredByCode);
  const won = await db
    .select({ code: leadsTable.referredByCode, total: count() })
    .from(leadsTable)
    .where(eq(leadsTable.status, "fechado"))
    .groupBy(leadsTable.referredByCode);

  const genMap = new Map(generated.map((g) => [g.code, Number(g.total)]));
  const wonMap = new Map(won.map((w) => [w.code, Number(w.total)]));

  res.json(
    referrals.map((r) => ({
      ...r,
      leadsGenerated: genMap.get(r.code) ?? 0,
      conversions: wonMap.get(r.code) ?? 0,
    })),
  );
});

router.post("/referrals", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const { patientName, patientPhone, specialty, quizSlug, rewardNote } = req.body as {
    patientName?: string;
    patientPhone?: string;
    specialty?: string;
    quizSlug?: string;
    rewardNote?: string;
  };
  if (!patientName || patientName.trim().length < 2) {
    res.status(400).json({ error: "Informe o nome de quem indica" });
    return;
  }
  const code = await generateReferralCode();
  const [created] = await db
    .insert(referralsTable)
    .values({
      code,
      patientName: patientName.trim(),
      patientPhone: patientPhone?.trim() || null,
      specialty: specialty ?? "ortopedia",
      quizSlug: quizSlug || null,
      rewardNote: rewardNote?.trim() || null,
    })
    .returning();
  res.status(201).json(created);
});

router.patch("/referrals/:id", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = Number(req.params.id);
  const body = req.body as Partial<typeof referralsTable.$inferInsert>;
  const allowed: Partial<typeof referralsTable.$inferInsert> = {};
  for (const k of ["patientName", "patientPhone", "specialty", "quizSlug", "rewardNote", "active"] as const) {
    if (k in body) (allowed as Record<string, unknown>)[k] = body[k];
  }
  const [updated] = await db.update(referralsTable).set(allowed).where(eq(referralsTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Indicação não encontrada" });
    return;
  }
  res.json(updated);
});

// ---- Follow-ups (cadência) ------------------------------------------------

// Fila de retornos. scope=due (vencidos + de hoje) | upcoming | all
router.get("/followups", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const scope = String(req.query.scope ?? "due");

  const conditions = [eq(followupsTable.status, "pending")];
  if (scope === "due") {
    // vence até o fim do dia de hoje
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    conditions.push(lte(followupsTable.dueAt, endOfToday));
  }

  const rows = await db
    .select({
      id: followupsTable.id,
      leadId: followupsTable.leadId,
      stepOrder: followupsTable.stepOrder,
      channel: followupsTable.channel,
      title: followupsTable.title,
      message: followupsTable.message,
      dueAt: followupsTable.dueAt,
      status: followupsTable.status,
      leadName: leadsTable.name,
      leadPhone: leadsTable.phone,
      leadTemperature: leadsTable.temperature,
      leadStatus: leadsTable.status,
    })
    .from(followupsTable)
    .innerJoin(leadsTable, eq(followupsTable.leadId, leadsTable.id))
    .where(and(...conditions))
    .orderBy(asc(followupsTable.dueAt))
    .limit(300);

  res.json(rows);
});

router.patch("/followups/:id", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const id = Number(req.params.id);
  const { status } = req.body as { status?: string };
  if (!status || !(FOLLOWUP_STATUSES as readonly string[]).includes(status)) {
    res.status(400).json({ error: "status inválido" });
    return;
  }
  const completedAt = status === "done" || status === "skipped" ? new Date() : null;
  const [updated] = await db
    .update(followupsTable)
    .set({ status, completedAt })
    .where(eq(followupsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Follow-up não encontrado" });
    return;
  }
  if (status === "done") {
    await db.insert(leadEventsTable).values({
      leadId: updated.leadId,
      type: "follow_up",
      payload: { title: updated.title, by: req.user?.email },
    });
  }
  res.json(updated);
});

export default router;
