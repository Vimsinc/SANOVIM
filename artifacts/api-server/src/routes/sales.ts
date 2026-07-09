import { Router, type Request, type Response } from "express";
import {
  db,
  usersTable,
  quizzesTable,
  leadsTable,
  leadEventsTable,
  followupsTable,
  referralsTable,
  submitQuizSchema,
  quizQuestionsSchema,
  resultBandsSchema,
  LEAD_STATUSES,
  FOLLOWUP_STATUSES,
  type Quiz,
  type QuizQuestion,
  type ResultBand,
  type LeadAnswer,
  type LeadStatus,
} from "@workspace/db";
import { and, desc, asc, eq, lte, lt, count, sql } from "drizzle-orm";
import { DEFAULT_QUIZZES } from "../lib/salesSeed";
import { CADENCE_BY_TEMPERATURE, renderMessage } from "../lib/salesCadence";
import { gatherThemeSignals, flattenSignals, countSignals, isTheme, THEMES } from "../lib/salesTopics";
import { generateQuizForTheme } from "../lib/salesQuizAI";

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

/** Monta as linhas da fila de follow-up conforme a cadência da temperatura. */
function buildFollowupRows(leadId: number, temperature: string, name: string) {
  const steps = CADENCE_BY_TEMPERATURE[temperature] ?? CADENCE_BY_TEMPERATURE.frio;
  const now = Date.now();
  return steps.map((s) => ({
    leadId,
    stepOrder: s.order,
    channel: s.channel,
    title: s.title,
    message: renderMessage(s.message, firstName(name)),
    dueAt: new Date(now + s.offsetHours * 3600 * 1000),
    status: "pending" as const,
  }));
}

const router = Router();

// --- helpers ---------------------------------------------------------------

/**
 * Resolve o id do usuário logado (vibe_users.id) para escopo por dono.
 * Responde 401/403 e retorna null se não autenticado / sem cadastro.
 */
async function currentUserId(req: Request, res: Response): Promise<number | null> {
  const email = req.user?.email;
  if (!email) {
    res.status(401).json({ error: "Não autenticado" });
    return null;
  }
  const [u] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!u) {
    res.status(403).json({ error: "Usuário sem cadastro" });
    return null;
  }
  return u.id;
}

/** Lê e valida um id numérico de rota; responde 400 e retorna null se inválido. */
function parseId(req: Request, res: Response): number | null {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "id inválido" });
    return null;
  }
  return id;
}

/** Remove os pontos das opções antes de expor o quiz publicamente. */
function toPublicQuiz(quiz: Quiz) {
  return {
    slug: quiz.slug,
    title: quiz.title,
    specialty: quiz.specialty,
    description: quiz.description,
    metaTitle: quiz.metaTitle,
    metaDescription: quiz.metaDescription,
    keywords: quiz.keywords,
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
  const seen = new Set<string>();

  for (const ans of answers) {
    // conta cada pergunta só uma vez (impede inflar score repetindo a resposta)
    if (seen.has(ans.questionId)) continue;
    const question = questions.find((q) => q.id === ans.questionId);
    if (!question) continue;
    const option = question.options[ans.optionIndex];
    if (!option) continue;
    seen.add(ans.questionId);
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
    // só atribui se o código de indicação pertencer ao mesmo dono do quiz
    const [referral] = await db
      .select({ code: referralsTable.code })
      .from(referralsTable)
      .where(
        and(
          eq(referralsTable.code, ref),
          eq(referralsTable.active, true),
          quiz.ownerId != null ? eq(referralsTable.ownerId, quiz.ownerId) : sql`false`,
        ),
      )
      .limit(1);
    if (referral) referredByCode = referral.code;
  }

  const resultTitle = band?.title ?? "Recebemos suas respostas";
  const resultMessage =
    band?.message ?? "Com base no que você respondeu, uma avaliação pode ajudar a identificar a causa.";

  // Lead + evento + cadência num único commit (evita lead órfão em falha parcial)
  const lead = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(leadsTable)
      .values({
        ownerId: quiz.ownerId,
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
    await tx.insert(leadEventsTable).values({
      leadId: created.id,
      type: "created",
      payload: { via: "quiz", slug: quiz.slug, score, temperature },
    });
    const fuRows = buildFollowupRows(created.id, temperature, name);
    if (fuRows.length) await tx.insert(followupsTable).values(fuRows);
    return created;
  });

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
  const uid = await currentUserId(req, res);
  if (uid === null) return;

  const { status, temperature } = req.query as { status?: string; temperature?: string };
  const conditions = [eq(leadsTable.ownerId, uid)];
  if (status && (LEAD_STATUSES as readonly string[]).includes(status)) {
    conditions.push(eq(leadsTable.status, status));
  }
  if (temperature && ["frio", "morno", "quente"].includes(temperature)) {
    conditions.push(eq(leadsTable.temperature, temperature));
  }

  const rows = await db
    .select()
    .from(leadsTable)
    .where(and(...conditions))
    .orderBy(desc(leadsTable.createdAt))
    .limit(500);

  res.json(rows);
});

router.get("/leads/:id", async (req: Request, res: Response): Promise<void> => {
  const uid = await currentUserId(req, res);
  if (uid === null) return;
  const id = parseId(req, res);
  if (id === null) return;
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.id, id), eq(leadsTable.ownerId, uid)))
    .limit(1);
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
  const uid = await currentUserId(req, res);
  if (uid === null) return;
  const id = parseId(req, res);
  if (id === null) return;
  const { status, notes, lostReason, consciousness } = req.body as {
    status?: LeadStatus;
    notes?: string;
    lostReason?: string;
    consciousness?: number;
  };

  const [existing] = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.id, id), eq(leadsTable.ownerId, uid)))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Lead não encontrado" });
    return;
  }

  const update: Partial<typeof leadsTable.$inferInsert> = { updatedAt: new Date() };
  if (status && (LEAD_STATUSES as readonly string[]).includes(status)) update.status = status;
  if (typeof notes === "string") update.notes = notes;
  if (typeof lostReason === "string") update.lostReason = lostReason;
  if (typeof consciousness === "number" && consciousness >= 1 && consciousness <= 5)
    update.consciousness = Math.round(consciousness);

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
  if (typeof notes === "string" && notes.trim() && notes.trim() !== (existing.notes ?? "").trim()) {
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
  const uid = await currentUserId(req, res);
  if (uid === null) return;
  const own = eq(leadsTable.ownerId, uid);

  const [byStatus, byTemperature, bySpecialty, [total]] = await Promise.all([
    db.select({ status: leadsTable.status, total: count() }).from(leadsTable).where(own).groupBy(leadsTable.status),
    db.select({ temperature: leadsTable.temperature, total: count() }).from(leadsTable).where(own).groupBy(leadsTable.temperature),
    db.select({ specialty: leadsTable.specialty, total: count() }).from(leadsTable).where(own).groupBy(leadsTable.specialty),
    db.select({ total: count() }).from(leadsTable).where(own),
  ]);

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

// ---- KPIs (dashboard completo) --------------------------------------------

router.get("/kpis", async (req: Request, res: Response): Promise<void> => {
  const uid = await currentUserId(req, res);
  if (uid === null) return;
  const own = eq(leadsTable.ownerId, uid);
  const notNullRef = sql`${leadsTable.referredByCode} IS NOT NULL`;

  // Todas as queries são independentes → rodam em paralelo
  const [
    [total],
    byStatus,
    byTemperature,
    bySpecialty,
    bySource,
    timeline,
    topQuizzes,
    [refLeads],
    [refWon],
    [activeCodes],
    fuByStatus,
    [overdue],
  ] = await Promise.all([
    db.select({ total: count() }).from(leadsTable).where(own),
    db.select({ status: leadsTable.status, total: count() }).from(leadsTable).where(own).groupBy(leadsTable.status),
    db.select({ temperature: leadsTable.temperature, total: count() }).from(leadsTable).where(own).groupBy(leadsTable.temperature),
    db.select({ specialty: leadsTable.specialty, total: count() }).from(leadsTable).where(own).groupBy(leadsTable.specialty),
    db.select({ source: leadsTable.source, total: count() }).from(leadsTable).where(own).groupBy(leadsTable.source),
    db.execute<{ day: string; total: string }>(
      sql`SELECT DATE_TRUNC('day', created_at)::date AS day, COUNT(*) AS total
          FROM vibe_leads
          WHERE created_at >= NOW() - INTERVAL '30 days' AND owner_id = ${uid}
          GROUP BY 1 ORDER BY 1`,
    ),
    db
      .select({ title: quizzesTable.title, slug: quizzesTable.slug, total: count(leadsTable.id) })
      .from(quizzesTable)
      .leftJoin(leadsTable, eq(leadsTable.quizId, quizzesTable.id))
      .where(eq(quizzesTable.ownerId, uid))
      .groupBy(quizzesTable.id, quizzesTable.title, quizzesTable.slug)
      .orderBy(desc(count(leadsTable.id)))
      .limit(8),
    db.select({ total: count() }).from(leadsTable).where(and(own, notNullRef)),
    db.select({ total: count() }).from(leadsTable).where(and(own, notNullRef, eq(leadsTable.status, "fechado"))),
    db.select({ total: count() }).from(referralsTable).where(and(eq(referralsTable.ownerId, uid), eq(referralsTable.active, true))),
    db
      .select({ status: followupsTable.status, total: count() })
      .from(followupsTable)
      .innerJoin(leadsTable, eq(followupsTable.leadId, leadsTable.id))
      .where(own)
      .groupBy(followupsTable.status),
    db
      .select({ total: count() })
      .from(followupsTable)
      .innerJoin(leadsTable, eq(followupsTable.leadId, leadsTable.id))
      .where(and(own, eq(followupsTable.status, "pending"), lt(followupsTable.dueAt, new Date()))),
  ]);

  const totalLeads = Number(total.total);
  const statusMap: Record<string, number> = {};
  for (const s of LEAD_STATUSES) statusMap[s] = 0;
  for (const r of byStatus) statusMap[r.status] = Number(r.total);
  const fuMap: Record<string, number> = {};
  for (const r of fuByStatus) fuMap[r.status] = Number(r.total);

  const agendados = statusMap["agendado"] + statusMap["compareceu"] + statusMap["fechado"];
  const fechados = statusMap["fechado"];

  res.json({
    totalLeads,
    funnel: LEAD_STATUSES.map((stage) => ({ stage, count: statusMap[stage] })),
    byTemperature: Object.fromEntries(byTemperature.map((r) => [r.temperature, Number(r.total)])),
    bySpecialty: bySpecialty.map((r) => ({ specialty: r.specialty, total: Number(r.total) })),
    bySource: (() => {
      // funde null e "direto" no mesmo balde
      const m = new Map<string, number>();
      for (const r of bySource) m.set(r.source ?? "direto", (m.get(r.source ?? "direto") ?? 0) + Number(r.total));
      return Array.from(m, ([source, total]) => ({ source, total })).sort((a, b) => b.total - a.total);
    })(),
    timeline: (timeline.rows as { day: string; total: string }[]).map((r) => ({
      day: r.day,
      total: Number(r.total),
    })),
    topQuizzes: topQuizzes.map((q) => ({ title: q.title, slug: q.slug, total: Number(q.total) })),
    referrals: {
      leads: Number(refLeads.total),
      conversions: Number(refWon.total),
      activeCodes: Number(activeCodes.total),
    },
    followups: {
      done: fuMap["done"] ?? 0,
      pending: fuMap["pending"] ?? 0,
      cancelled: fuMap["cancelled"] ?? 0,
      overdue: Number(overdue.total),
    },
    conversion: {
      leadToAgendamento: totalLeads ? Math.round((agendados / totalLeads) * 100) : 0,
      agendamentoToFechado: agendados ? Math.round((fechados / agendados) * 100) : 0,
      leadToFechado: totalLeads ? Math.round((fechados / totalLeads) * 100) : 0,
    },
  });
});

// ---- Quizzes --------------------------------------------------------------

router.get("/quizzes", async (req: Request, res: Response): Promise<void> => {
  const uid = await currentUserId(req, res);
  if (uid === null) return;
  const rows = await db
    .select()
    .from(quizzesTable)
    .where(eq(quizzesTable.ownerId, uid))
    .orderBy(desc(quizzesTable.createdAt));

  // anexa contagem de leads por quiz (só deste dono)
  const counts = await db
    .select({ quizId: leadsTable.quizId, total: count() })
    .from(leadsTable)
    .where(eq(leadsTable.ownerId, uid))
    .groupBy(leadsTable.quizId);
  const countMap = new Map(counts.map((c) => [c.quizId, Number(c.total)]));

  res.json(rows.map((q) => ({ ...q, leadCount: countMap.get(q.id) ?? 0 })));
});

router.get("/quizzes/:id", async (req: Request, res: Response): Promise<void> => {
  const uid = await currentUserId(req, res);
  if (uid === null) return;
  const id = parseId(req, res);
  if (id === null) return;
  const [quiz] = await db
    .select()
    .from(quizzesTable)
    .where(and(eq(quizzesTable.id, id), eq(quizzesTable.ownerId, uid)))
    .limit(1);
  if (!quiz) {
    res.status(404).json({ error: "Quiz não encontrado" });
    return;
  }
  res.json(quiz);
});

router.post("/quizzes", async (req: Request, res: Response): Promise<void> => {
  const uid = await currentUserId(req, res);
  if (uid === null) return;
  const { slug, title, specialty, segment, description, whatsappNumber, questions, resultBands } =
    req.body as Partial<typeof quizzesTable.$inferInsert>;

  if (!slug || !title || !whatsappNumber) {
    res.status(400).json({ error: "slug, title e whatsappNumber são obrigatórios" });
    return;
  }
  // Valida a definição do quiz (perguntas/faixas) — protege o funil público
  const vq = quizQuestionsSchema.safeParse(questions ?? []);
  if (!vq.success) {
    res.status(400).json({ error: "Perguntas inválidas", details: vq.error.issues });
    return;
  }
  const vb = resultBandsSchema.safeParse(resultBands ?? []);
  if (!vb.success) {
    res.status(400).json({ error: "Faixas de resultado inválidas", details: vb.error.issues });
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

  try {
    const [created] = await db
      .insert(quizzesTable)
      .values({
        ownerId: uid,
        slug,
        title,
        specialty: specialty ?? "ortopedia",
        segment: segment ?? null,
        description: description ?? null,
        whatsappNumber,
        questions: vq.data,
        resultBands: vb.data,
      })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    // corrida no slug único (23505) → 409 em vez de 500
    if ((err as { code?: string }).code === "23505") {
      res.status(409).json({ error: "Já existe um quiz com esse slug" });
      return;
    }
    throw err;
  }
});

router.patch("/quizzes/:id", async (req: Request, res: Response): Promise<void> => {
  const uid = await currentUserId(req, res);
  if (uid === null) return;
  const id = parseId(req, res);
  if (id === null) return;
  const body = req.body as Partial<typeof quizzesTable.$inferInsert>;
  // valida perguntas/faixas quando presentes
  if ("questions" in body) {
    const v = quizQuestionsSchema.safeParse(body.questions);
    if (!v.success) {
      res.status(400).json({ error: "Perguntas inválidas", details: v.error.issues });
      return;
    }
    body.questions = v.data;
  }
  if ("resultBands" in body) {
    const v = resultBandsSchema.safeParse(body.resultBands);
    if (!v.success) {
      res.status(400).json({ error: "Faixas de resultado inválidas", details: v.error.issues });
      return;
    }
    body.resultBands = v.data;
  }
  const allowed: Partial<typeof quizzesTable.$inferInsert> = {};
  for (const k of ["title", "specialty", "segment", "description", "whatsappNumber", "questions", "resultBands", "active"] as const) {
    if (k in body) (allowed as Record<string, unknown>)[k] = body[k];
  }
  if (Object.keys(allowed).length === 0) {
    res.status(400).json({ error: "Nada para atualizar" });
    return;
  }
  const [updated] = await db
    .update(quizzesTable)
    .set(allowed)
    .where(and(eq(quizzesTable.id, id), eq(quizzesTable.ownerId, uid)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Quiz não encontrado" });
    return;
  }
  res.json(updated);
});

// Gera automaticamente um quiz por tema, embasado nos temas mais pesquisados
// (Google/People Also Ask) e otimizado para SEO, via IA.
router.post("/quizzes/generate", async (req: Request, res: Response): Promise<void> => {
  const uid = await currentUserId(req, res);
  if (uid === null) return;
  const { theme, whatsappNumber } = req.body as { theme?: string; whatsappNumber?: string };

  if (!theme || !isTheme(theme)) {
    res.status(400).json({ error: "Tema inválido", themes: Object.keys(THEMES) });
    return;
  }
  const wa = (whatsappNumber ?? "").replace(/\D/g, "");
  if (wa.length < 10) {
    res.status(400).json({ error: "Informe o WhatsApp da clínica (com DDI e DDD)" });
    return;
  }

  try {
    const signals = await gatherThemeSignals(theme);
    const generated = await generateQuizForTheme(theme, signals);

    // Garante slug único
    let slug = generated.slug;
    for (let i = 2; i < 30; i++) {
      const [exists] = await db
        .select({ id: quizzesTable.id })
        .from(quizzesTable)
        .where(eq(quizzesTable.slug, slug))
        .limit(1);
      if (!exists) break;
      slug = `${generated.slug}-${i}`;
    }

    const [created] = await db
      .insert(quizzesTable)
      .values({
        ownerId: uid,
        slug,
        title: generated.title,
        specialty: theme,
        description: generated.description,
        whatsappNumber: wa,
        questions: generated.questions,
        resultBands: generated.resultBands,
        metaTitle: generated.metaTitle,
        metaDescription: generated.metaDescription,
        keywords: generated.keywords,
        sourceTopics: flattenSignals(signals).slice(0, 40),
        aiGenerated: true,
      })
      .returning();

    res.status(201).json({
      quiz: created,
      basedOn: {
        total: countSignals(signals),
        google: signals.googleQuestions.length + signals.googleRelated.length,
        googleTrends: signals.googleTrends.length,
        instagram: signals.instagramTopics.length + signals.instagramHashtags.length,
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      res.status(409).json({ error: "Conflito de slug ao gerar. Tente novamente." });
      return;
    }
    req.log.error({ err }, "quiz generate error");
    res.status(500).json({ error: "Não foi possível gerar o quiz agora. Tente novamente." });
  }
});

// Cria os quizzes padrão do playbook (ortopedia) se ainda não existirem
router.post("/quizzes/seed", async (req: Request, res: Response): Promise<void> => {
  const uid = await currentUserId(req, res);
  if (uid === null) return;
  const { whatsappNumber } = req.body as { whatsappNumber?: string };

  // Quais slugs padrão este dono já tem
  const mine = await db
    .select({ slug: quizzesTable.slug })
    .from(quizzesTable)
    .where(eq(quizzesTable.ownerId, uid));
  const mySlugs = new Set(mine.map((q) => q.slug));
  // Slugs globalmente ocupados (slug é único no sistema — URL pública)
  const all = await db.select({ slug: quizzesTable.slug }).from(quizzesTable);
  const takenSlugs = new Set(all.map((q) => q.slug));

  const toCreate = DEFAULT_QUIZZES
    // pula os que este dono já tem (por slug base ou já sufixado)
    .filter((q) => !mySlugs.has(q.slug) && !mySlugs.has(`${q.slug}-u${uid}`))
    .map((q) => {
      // se o slug base estiver ocupado por outra clínica, sufixa com o dono
      const slug = takenSlugs.has(q.slug) ? `${q.slug}-u${uid}` : q.slug;
      return {
        ...q,
        slug,
        ownerId: uid,
        whatsappNumber: whatsappNumber?.replace(/\D/g, "") || q.whatsappNumber,
      };
    })
    // evita colisão entre os próprios sufixos já ocupados
    .filter((q) => !takenSlugs.has(q.slug));

  if (toCreate.length === 0) {
    res.json({ created: 0, message: "Quizzes padrão já existem" });
    return;
  }

  try {
    const created = await db.insert(quizzesTable).values(toCreate).returning({ slug: quizzesTable.slug });
    res.status(201).json({ created: created.length, slugs: created.map((c) => c.slug) });
  } catch (err) {
    // corrida de slug entre clínicas → conflito em vez de 500
    if ((err as { code?: string }).code === "23505") {
      res.status(409).json({ error: "Conflito de slug ao criar. Tente novamente." });
      return;
    }
    throw err;
  }
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
    .set({ clicks: sql`${referralsTable.clicks} + 1` })
    .where(eq(referralsTable.id, referral.id));
  res.json({
    code: referral.code,
    quizSlug: referral.quizSlug,
    referrer: firstName(referral.patientName),
  });
});

router.get("/referrals", async (req: Request, res: Response): Promise<void> => {
  const uid = await currentUserId(req, res);
  if (uid === null) return;
  const own = eq(leadsTable.ownerId, uid);

  const [referrals, generated, won] = await Promise.all([
    db.select().from(referralsTable).where(eq(referralsTable.ownerId, uid)).orderBy(desc(referralsTable.createdAt)),
    db.select({ code: leadsTable.referredByCode, total: count() }).from(leadsTable).where(own).groupBy(leadsTable.referredByCode),
    db
      .select({ code: leadsTable.referredByCode, total: count() })
      .from(leadsTable)
      .where(and(own, eq(leadsTable.status, "fechado")))
      .groupBy(leadsTable.referredByCode),
  ]);

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
  const uid = await currentUserId(req, res);
  if (uid === null) return;
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
      ownerId: uid,
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
  const uid = await currentUserId(req, res);
  if (uid === null) return;
  const id = parseId(req, res);
  if (id === null) return;
  const body = req.body as Partial<typeof referralsTable.$inferInsert>;
  const allowed: Partial<typeof referralsTable.$inferInsert> = {};
  for (const k of ["patientName", "patientPhone", "specialty", "quizSlug", "rewardNote", "active"] as const) {
    if (k in body) (allowed as Record<string, unknown>)[k] = body[k];
  }
  if (Object.keys(allowed).length === 0) {
    res.status(400).json({ error: "Nada para atualizar" });
    return;
  }
  const [updated] = await db
    .update(referralsTable)
    .set(allowed)
    .where(and(eq(referralsTable.id, id), eq(referralsTable.ownerId, uid)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Indicação não encontrada" });
    return;
  }
  res.json(updated);
});

// ---- Follow-ups (cadência) ------------------------------------------------

// Fila de retornos. scope=due (vencidos + de hoje) | upcoming | all
router.get("/followups", async (req: Request, res: Response): Promise<void> => {
  const uid = await currentUserId(req, res);
  if (uid === null) return;
  const scope = String(req.query.scope ?? "due");

  const conditions = [eq(followupsTable.status, "pending"), eq(leadsTable.ownerId, uid)];
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
  const uid = await currentUserId(req, res);
  if (uid === null) return;
  const id = parseId(req, res);
  if (id === null) return;
  const { status } = req.body as { status?: string };
  if (!status || !(FOLLOWUP_STATUSES as readonly string[]).includes(status)) {
    res.status(400).json({ error: "status inválido" });
    return;
  }
  // confirma que o follow-up é de um lead deste dono
  const [owned] = await db
    .select({ id: followupsTable.id })
    .from(followupsTable)
    .innerJoin(leadsTable, eq(followupsTable.leadId, leadsTable.id))
    .where(and(eq(followupsTable.id, id), eq(leadsTable.ownerId, uid)))
    .limit(1);
  if (!owned) {
    res.status(404).json({ error: "Follow-up não encontrado" });
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
