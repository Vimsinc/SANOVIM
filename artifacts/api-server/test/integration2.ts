/* Bateria ampliada: cross-tenant PATCH, indicações, follow-ups, seed multi-clínica, bordas. */
import express from "express";
import salesRouter from "../src/routes/sales";
import { db, usersTable, leadsTable, followupsTable, quizzesTable, referralsTable, leadEventsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const TRUNCATE = sql`TRUNCATE vibe_users, vibe_quizzes, vibe_leads, vibe_lead_events, vibe_followups, vibe_referrals RESTART IDENTITY CASCADE`;

let passed = 0, failed = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra !== undefined ? "  →  " + JSON.stringify(extra) : ""}`); }
}

async function main() {
  await db.execute(TRUNCATE);
  const [ua] = await db.insert(usersTable).values({ email: "a@t.com", name: "A" }).returning();
  const [ub] = await db.insert(usersTable).values({ email: "b@t.com", name: "B" }).returning();

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const email = req.header("x-test-email");
    if (email) (req as express.Request & { user?: { email: string } }).user = { email };
    next();
  });
  app.use("/api/sales", salesRouter);
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const port = (server.address() as import("net").AddressInfo).port;
  const b = `http://127.0.0.1:${port}/api/sales`;
  const A = { "x-test-email": "a@t.com", "content-type": "application/json" };
  const B = { "x-test-email": "b@t.com", "content-type": "application/json" };
  const J = { "content-type": "application/json" };
  const post = (h: Record<string,string>, p: string, body: unknown) => fetch(`${b}${p}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const patch = (h: Record<string,string>, p: string, body: unknown) => fetch(`${b}${p}`, { method: "PATCH", headers: h, body: JSON.stringify(body) });

  const quizBody = (slug: string) => ({
    slug, title: "Q " + slug, whatsappNumber: "5511999998888",
    questions: [{ id: "urg", question: "?", options: [{ label: "muito", points: 5 }, { label: "não", points: 0 }] }],
    resultBands: [{ min: 0, level: "frio", title: "F", message: "m" }, { min: 4, level: "quente", title: "Q", message: "m" }],
  });

  // ---- Seed multi-clínica ----
  console.log("\n[Seed multi-clínica]");
  let r = await post(A, "/quizzes/seed", { whatsappNumber: "5511999998888" });
  let d = await r.json();
  ok("A seed cria quizzes padrão", r.status === 201 && d.created > 0, d);
  r = await post(A, "/quizzes/seed", { whatsappNumber: "5511999998888" });
  d = await r.json();
  ok("A seed de novo → 0 (idempotente)", d.created === 0, d);
  r = await post(B, "/quizzes/seed", { whatsappNumber: "5522888887777" });
  d = await r.json();
  ok("B seed cria (slugs sufixados, sem colisão)", r.status === 201 && d.created > 0, d);
  const allSlugs = (await db.select({ slug: quizzesTable.slug }).from(quizzesTable)).map((q) => q.slug);
  ok("slugs únicos no banco (sem duplicata)", new Set(allSlugs).size === allSlugs.length, allSlugs);
  ok("B recebeu slug sufixado -u", allSlugs.some((s) => s.includes(`-u${ub.id}`)), allSlugs);

  // ---- Quizzes de teste com scoring ----
  await post(A, "/quizzes", quizBody("qa"));
  await post(B, "/quizzes", quizBody("qb"));

  // ---- Indicações ----
  console.log("\n[Indicações]");
  r = await post(A, "/referrals", { patientName: "Ana Indicadora", quizSlug: "qa" });
  const refA = await r.json();
  ok("A cria código de indicação (ownerId=A)", r.status === 201 && refA.ownerId === ua.id, refA);
  r = await fetch(`${b}/public/referral/${refA.code}`);
  const clickInfo = await r.json();
  ok("clique público conta + retorna referrer", r.status === 200 && clickInfo.referrer === "Ana", clickInfo);
  // submit com ?ref → atribuição
  r = await post(J, `/public/quiz/qa/submit`, { name: "Ref Lead", phone: "11999990000", ref: refA.code, answers: [{ questionId: "urg", optionIndex: 0 }] });
  ok("submit com ?ref → 200", r.status === 200, r.status);
  const [refLead] = await db.select().from(leadsTable).where(eq(leadsTable.name, "Ref Lead")).limit(1);
  ok("lead atribuído ao código de indicação", refLead?.referredByCode === refA.code, refLead?.referredByCode);
  r = await fetch(`${b}/referrals`, { headers: A });
  const refsA = await r.json();
  ok("GET /referrals (A): 1 lead gerado no código", refsA[0]?.leadsGenerated === 1, refsA[0]);
  ok("GET /referrals (A): clicks = 1", refsA[0]?.clicks === 1, refsA[0]?.clicks);
  r = await fetch(`${b}/referrals`, { headers: B });
  ok("GET /referrals (B): vazio (isolado)", (await r.json()).length === 0);
  // cross-tenant PATCH referral
  r = await patch(B, `/referrals/${refA.id}`, { active: false });
  ok("B PATCH referral de A → 404", r.status === 404, r.status);
  const [refStill] = await db.select().from(referralsTable).where(eq(referralsTable.id, refA.id)).limit(1);
  ok("referral de A permanece ativo", refStill?.active === true);

  // ---- Cross-tenant PATCH lead & quiz ----
  console.log("\n[Cross-tenant PATCH bloqueado]");
  r = await patch(B, `/leads/${refLead.id}`, { status: "fechado" });
  ok("B PATCH lead de A → 404", r.status === 404, r.status);
  const [leadStill] = await db.select().from(leadsTable).where(eq(leadsTable.id, refLead.id)).limit(1);
  ok("status do lead de A inalterado", leadStill?.status === "novo", leadStill?.status);
  const [qa] = await db.select().from(quizzesTable).where(eq(quizzesTable.slug, "qa")).limit(1);
  r = await patch(B, `/quizzes/${qa.id}`, { title: "hackeado" });
  ok("B PATCH quiz de A → 404", r.status === 404, r.status);

  // ---- Follow-ups ----
  console.log("\n[Follow-ups]");
  const fusA = await db.select().from(followupsTable).where(eq(followupsTable.leadId, refLead.id));
  ok("cadência gerada para o lead", fusA.length > 0, fusA.length);
  r = await fetch(`${b}/followups?scope=all`, { headers: A });
  const fuListA = await r.json();
  ok("GET /followups (A) traz retornos do próprio lead", Array.isArray(fuListA) && fuListA.length > 0, fuListA.length);
  r = await fetch(`${b}/followups?scope=all`, { headers: B });
  ok("GET /followups (B) vazio (isolado)", (await r.json()).length === 0);
  const firstFu = fusA[0];
  r = await patch(B, `/followups/${firstFu.id}`, { status: "done" });
  ok("B PATCH follow-up de A → 404", r.status === 404, r.status);
  r = await patch(A, `/followups/${firstFu.id}`, { status: "done" });
  ok("A PATCH follow-up → 200", r.status === 200, r.status);
  const ev = await db.select().from(leadEventsTable).where(and(eq(leadEventsTable.leadId, refLead.id), eq(leadEventsTable.type, "follow_up")));
  ok("evento follow_up registrado", ev.length === 1, ev.length);

  // ---- Cancelamento em estágio terminal ----
  console.log("\n[Cadência: cancelamento terminal]");
  const pendBefore = (await db.select().from(followupsTable).where(and(eq(followupsTable.leadId, refLead.id), eq(followupsTable.status, "pending")))).length;
  await patch(A, `/leads/${refLead.id}`, { status: "agendado" });
  const pendAfter = (await db.select().from(followupsTable).where(and(eq(followupsTable.leadId, refLead.id), eq(followupsTable.status, "pending")))).length;
  ok("agendar cancela follow-ups pendentes", pendBefore > 0 && pendAfter === 0, { pendBefore, pendAfter });

  // ---- Bordas ----
  console.log("\n[Bordas]");
  r = await patch(A, `/leads/${refLead.id}`, {});
  ok("PATCH lead sem campos válidos ainda 200 (updatedAt)", r.status === 200, r.status);
  r = await patch(A, `/quizzes/${qa.id}`, { foo: 1 });
  ok("PATCH quiz sem campos permitidos → 400", r.status === 400, r.status);
  // consciousness range
  await patch(A, `/leads/${refLead.id}`, { consciousness: 99 });
  let [l2] = await db.select().from(leadsTable).where(eq(leadsTable.id, refLead.id)).limit(1);
  ok("consciousness=99 ignorado (fora de 1..5)", l2?.consciousness === null, l2?.consciousness);
  await patch(A, `/leads/${refLead.id}`, { consciousness: 3 });
  [l2] = await db.select().from(leadsTable).where(eq(leadsTable.id, refLead.id)).limit(1);
  ok("consciousness=3 aceito", l2?.consciousness === 3, l2?.consciousness);
  // note dedup
  const noteCountBefore = (await db.select().from(leadEventsTable).where(and(eq(leadEventsTable.leadId, refLead.id), eq(leadEventsTable.type, "note")))).length;
  await patch(A, `/leads/${refLead.id}`, { notes: "ligar amanhã" });
  await patch(A, `/leads/${refLead.id}`, { notes: "ligar amanhã" });
  const noteCountAfter = (await db.select().from(leadEventsTable).where(and(eq(leadEventsTable.leadId, refLead.id), eq(leadEventsTable.type, "note")))).length;
  ok("nota idêntica repetida gera só 1 evento", noteCountAfter - noteCountBefore === 1, { noteCountBefore, noteCountAfter });

  // ---- Validação de quiz na escrita ----
  console.log("\n[Validação de quiz]");
  r = await post(A, "/quizzes", {
    slug: "quiz-ruim",
    title: "Ruim",
    whatsappNumber: "5511999998888",
    questions: [{ id: "x", question: "?", options: [{ label: "só uma", points: 1 }] }], // < 2 opções
    resultBands: [{ min: 0, level: "frio", title: "F", message: "m" }],
  });
  ok("POST /quizzes com <2 opções → 400", r.status === 400, r.status);
  r = await post(A, "/quizzes", {
    slug: "quiz-sem-perguntas",
    title: "Sem",
    whatsappNumber: "5511999998888",
    questions: [],
    resultBands: [{ min: 0, level: "frio", title: "F", message: "m" }],
  });
  ok("POST /quizzes sem perguntas → 400", r.status === 400, r.status);
  r = await patch(A, `/quizzes/${qa.id}`, { resultBands: [{ min: 0, level: "invalido", title: "x", message: "m" }] });
  ok("PATCH /quizzes com faixa inválida → 400", r.status === 400, r.status);

  // ---- Atribuição de indicação cross-tenant NÃO ocorre ----
  console.log("\n[Indicação cross-tenant]");
  r = await post(J, "/public/quiz/qb/submit", { name: "Cross Lead", phone: "11955554444", ref: refA.code, answers: [{ questionId: "urg", optionIndex: 0 }] });
  ok("submit no quiz de B com ref de A → 200", r.status === 200, r.status);
  const [crossLead] = await db.select().from(leadsTable).where(eq(leadsTable.name, "Cross Lead")).limit(1);
  ok("ref de A NÃO é atribuído em lead de B (referredByCode null)", crossLead?.referredByCode === null, crossLead?.referredByCode);

  // ---- Stats escopado ----
  console.log("\n[Stats]");
  r = await fetch(`${b}/stats`, { headers: A });
  const statsA = await r.json();
  ok("stats (A): totalLeads = 1", statsA.totalLeads === 1, statsA.totalLeads);
  r = await fetch(`${b}/stats`, { headers: B });
  const statsB = await r.json();
  ok("stats (B): totalLeads = 1 (o cross-tenant, atribuído a B)", statsB.totalLeads === 1, statsB.totalLeads);

  console.log(`\n──────────────\nRESULTADO: ${passed} passaram, ${failed} falharam`);
  server.close();
  await new Promise((r) => setTimeout(r, 100));
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((err) => { console.error("ERRO FATAL:", err); process.exit(2); });
