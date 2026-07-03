import { Router, type Request, type Response } from "express";
import {
  db,
  quizzesTable,
  leadsTable,
  leadEventsTable,
  submitQuizSchema,
  LEAD_STATUSES,
  type Quiz,
  type QuizQuestion,
  type ResultBand,
  type LeadAnswer,
  type LeadStatus,
} from "@workspace/db";
import { and, desc, eq, sql, count } from "drizzle-orm";
import { DEFAULT_QUIZZES } from "../lib/salesSeed";

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

  const { name, phone, email, source, answers } = parsed.data;
  const { score, temperature, segment, band, leadAnswers } = scoreSubmission(quiz, answers);

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
      resultShown: resultMessage,
    })
    .returning();

  await db.insert(leadEventsTable).values({
    leadId: lead.id,
    type: "created",
    payload: { via: "quiz", slug: quiz.slug, score, temperature },
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

export default router;
