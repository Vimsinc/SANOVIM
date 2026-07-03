import { pgTable, text, serial, timestamp, integer, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// Sales / Lead-generation funnel schema
// Quiz (isca) -> Lead (captura + scoring) -> handoff WhatsApp -> CRM/eventos
// ---------------------------------------------------------------------------

export type QuizOption = {
  /** Texto mostrado ao paciente */
  label: string;
  /** Pontos que esta resposta soma no score (qualificação) */
  points: number;
  /** Tag opcional para inferência de persona/segmento (ex: "corredor") */
  tag?: string;
};

export type QuizQuestion = {
  /** Identificador estável da pergunta (usado nas respostas) */
  id: string;
  /** Enunciado da pergunta */
  question: string;
  /** Texto auxiliar opcional */
  help?: string;
  /** Alternativas (radio). A pontuação vem da opção escolhida. */
  options: QuizOption[];
};

export type ResultBand = {
  /** Score mínimo (inclusive) para cair nesta faixa */
  min: number;
  /** Temperatura do lead nesta faixa */
  level: "frio" | "morno" | "quente";
  /** Título do resultado mostrado ao paciente */
  title: string;
  /** Mensagem personalizada de resultado (nomeia problema + próximo passo) */
  message: string;
};

// Quizzes / iscas de engajamento
export const quizzesTable = pgTable(
  "vibe_quizzes",
  {
  id: serial("id").primaryKey(),
  // Dono (vibe_users.id) — escopo multi-clínica. Null = legado/global.
  ownerId: integer("owner_id"),
  // URL pública: /q/:slug
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  // Área/vertical: ortopedia | medicina-esportiva | capilar | ...
  specialty: text("specialty").notNull().default("ortopedia"),
  // Persona/segmento alvo (ICP) — opcional
  segment: text("segment"),
  description: text("description"),
  // Número da clínica no formato E.164 sem "+" (ex: 5511999998888)
  whatsappNumber: text("whatsapp_number").notNull(),
  // Perguntas do quiz
  questions: jsonb("questions").notNull().$type<QuizQuestion[]>().default([]),
  // Faixas de resultado por score (ordem crescente de min)
  resultBands: jsonb("result_bands").notNull().$type<ResultBand[]>().default([]),
  active: boolean("active").notNull().default(true),
  // ---- SEO ----
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  keywords: jsonb("keywords").$type<string[]>().default([]),
  // Temas mais pesquisados que embasaram a geração (Google/PAA etc.)
  sourceTopics: jsonb("source_topics").$type<string[]>().default([]),
  aiGenerated: boolean("ai_generated").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_quizzes_owner").on(t.ownerId)],
);

export type Quiz = typeof quizzesTable.$inferSelect;
export type InsertQuiz = typeof quizzesTable.$inferInsert;

export type LeadAnswer = {
  questionId: string;
  question: string;
  label: string;
  points: number;
};

// Status do lead no funil / CRM
export const LEAD_STATUSES = [
  "novo",
  "contatado",
  "agendado",
  "compareceu",
  "fechado",
  "perdido",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

// Leads capturados
export const leadsTable = pgTable(
  "vibe_leads",
  {
  id: serial("id").primaryKey(),
  // Dono (vibe_users.id) — herdado do quiz de origem
  ownerId: integer("owner_id"),
  quizId: integer("quiz_id"),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  specialty: text("specialty").notNull().default("ortopedia"),
  // Persona inferida a partir das tags das respostas
  segment: text("segment"),
  answers: jsonb("answers").notNull().$type<LeadAnswer[]>().default([]),
  score: integer("score").notNull().default(0),
  // frio | morno | quente
  temperature: text("temperature").notNull().default("frio"),
  // Estágio de consciência (1..5) — opcional, inferido/manual
  consciousness: integer("consciousness"),
  status: text("status").notNull().default("novo"),
  lostReason: text("lost_reason"),
  // Origem: utm_source / parceria / anúncio
  source: text("source"),
  // Código do programa de indicação que trouxe este lead (se houver)
  referredByCode: text("referred_by_code"),
  // Mensagem de resultado mostrada ao paciente
  resultShown: text("result_shown"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_leads_owner").on(t.ownerId),
    index("idx_leads_quiz").on(t.quizId),
    index("idx_leads_status").on(t.status),
    index("idx_leads_temperature").on(t.temperature),
    index("idx_leads_source").on(t.source),
    index("idx_leads_referred_by").on(t.referredByCode),
    index("idx_leads_created").on(t.createdAt),
  ],
);

export type Lead = typeof leadsTable.$inferSelect;
export type InsertLead = typeof leadsTable.$inferInsert;

// Linha do tempo / eventos do lead (mudança de status, notas, follow-up)
export const leadEventsTable = pgTable(
  "vibe_lead_events",
  {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull(),
  // status_change | note | message | follow_up | created
  type: text("type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_lead_events_lead").on(t.leadId)],
);

export type LeadEvent = typeof leadEventsTable.$inferSelect;

// Status de uma tarefa de follow-up
export const FOLLOWUP_STATUSES = ["pending", "done", "skipped", "cancelled"] as const;
export type FollowupStatus = (typeof FOLLOWUP_STATUSES)[number];

// Fila de follow-up (cadência de valor) — uma linha por toque planejado
export const followupsTable = pgTable(
  "vibe_followups",
  {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull(),
  // ordem do toque na cadência (1, 2, 3...)
  stepOrder: integer("step_order").notNull().default(1),
  // whatsapp | email
  channel: text("channel").notNull().default("whatsapp"),
  title: text("title").notNull(),
  // mensagem sugerida (já com o nome do paciente)
  message: text("message").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  // pending | done | skipped | cancelled
  status: text("status").notNull().default("pending"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_followups_lead").on(t.leadId),
    index("idx_followups_status_due").on(t.status, t.dueAt),
  ],
);

export type Followup = typeof followupsTable.$inferSelect;
export type InsertFollowup = typeof followupsTable.$inferInsert;

// Programa de indicação — um código por paciente que indica
export const referralsTable = pgTable(
  "vibe_referrals",
  {
  id: serial("id").primaryKey(),
  // Dono (vibe_users.id)
  ownerId: integer("owner_id"),
  code: text("code").notNull().unique(),
  // Nome de quem indica (paciente embaixador)
  patientName: text("patient_name").notNull(),
  patientPhone: text("patient_phone"),
  specialty: text("specialty").notNull().default("ortopedia"),
  // Quiz-alvo para onde o link de indicação aponta
  quizSlug: text("quiz_slug"),
  // Vantagem oferecida a quem indica (ex: "1 reavaliação grátis")
  rewardNote: text("reward_note"),
  // Cliques no link de indicação
  clicks: integer("clicks").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_referrals_owner").on(t.ownerId)],
);

export type Referral = typeof referralsTable.$inferSelect;
export type InsertReferral = typeof referralsTable.$inferInsert;

// Zod para validar submissão pública do quiz
export const submitQuizSchema = z.object({
  name: z.string().min(2).max(120),
  phone: z.string().min(8).max(30),
  email: z.string().email().max(160).optional().or(z.literal("")),
  source: z.string().max(120).optional(),
  ref: z.string().max(60).optional(),
  answers: z
    .array(
      z.object({
        questionId: z.string().max(80),
        optionIndex: z.number().int().min(0).max(50),
      }),
    )
    .min(1)
    .max(50),
});
export type SubmitQuizInput = z.infer<typeof submitQuizSchema>;
