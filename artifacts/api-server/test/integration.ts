/* Teste de integração das rotas de vendas contra um Postgres real.
   Sobe o router real com autenticação simulada (header x-test-email). */
import express from "express";
import salesRouter from "../src/routes/sales";
import { buildQuizHead } from "../src/lib/salesSeo";
import { db, usersTable, leadsTable, followupsTable, quizzesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const TRUNCATE = sql`TRUNCATE vibe_users, vibe_quizzes, vibe_leads, vibe_lead_events, vibe_followups, vibe_referrals RESTART IDENTITY CASCADE`;

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${extra !== undefined ? "  →  " + JSON.stringify(extra) : ""}`);
  }
}

async function main() {
  await db.execute(TRUNCATE);
  // usuários (duas clínicas)
  const [ua] = await db.insert(usersTable).values({ email: "clinicaA@test.com", name: "Clínica A" }).returning();
  await db.insert(usersTable).values({ email: "clinicaB@test.com", name: "Clínica B" }).returning();

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
  const base = `http://127.0.0.1:${port}/api/sales`;

  const A = { "x-test-email": "clinicaA@test.com", "content-type": "application/json" };
  const B = { "x-test-email": "clinicaB@test.com", "content-type": "application/json" };

  console.log("\n[Auth & escopo]");
  let r = await fetch(`${base}/leads`);
  ok("GET /leads sem login → 401", r.status === 401, r.status);

  const quizBody = {
    slug: "dor-no-joelho",
    title: "Dor no joelho",
    whatsappNumber: "5511999998888",
    questions: [
      { id: "tempo", question: "Há quanto tempo?", options: [{ label: "<2 sem", points: 1 }, { label: ">3 meses", points: 3 }] },
      { id: "urg", question: "Urgência?", options: [{ label: "muita", points: 2, tag: "corredor" }, { label: "nenhuma", points: 0 }] },
    ],
    resultBands: [
      { min: 0, level: "frio", title: "Frio", message: "leve" },
      { min: 4, level: "quente", title: "Quente", message: "avalie logo" },
    ],
  };
  r = await fetch(`${base}/quizzes`, { method: "POST", headers: A, body: JSON.stringify(quizBody) });
  const createdQuiz = await r.json();
  ok("POST /quizzes (A) → 201", r.status === 201, r.status);
  ok("quiz criado com ownerId = A", createdQuiz.ownerId === ua.id, createdQuiz.ownerId);

  r = await fetch(`${base}/quizzes`, { headers: A });
  ok("A enxerga o próprio quiz", (await r.json()).length === 1);
  r = await fetch(`${base}/quizzes`, { headers: B });
  ok("B NÃO enxerga o quiz de A (isolamento)", (await r.json()).length === 0);
  r = await fetch(`${base}/quizzes/${createdQuiz.id}`, { headers: B });
  ok("B GET quiz de A → 404", r.status === 404, r.status);

  r = await fetch(`${base}/leads/abc`, { headers: A });
  ok("GET /leads/abc → 400 (guarda NaN)", r.status === 400, r.status);

  r = await fetch(`${base}/quizzes/generate`, { method: "POST", headers: A, body: JSON.stringify({ theme: "constructor", whatsappNumber: "5511999998888" }) });
  ok("generate theme='constructor' → 400 (não 500)", r.status === 400, r.status);

  console.log("\n[Funil público]");
  r = await fetch(`${base}/public/quiz/dor-no-joelho`);
  const pub = await r.json();
  ok("público não expõe 'points'", !JSON.stringify(pub).includes('"points"'));

  r = await fetch(`${base}/public/quiz/dor-no-joelho/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "João Silva", phone: "11988887777", answers: [{ questionId: "tempo", optionIndex: 1 }, { questionId: "urg", optionIndex: 0 }] }),
  });
  const sub = await r.json();
  ok("submit → 200", r.status === 200, r.status);
  ok("temperatura = quente (score 5 ≥ 4)", sub.result?.temperature === "quente", sub.result);
  ok("whatsappUrl aponta pro número do quiz", typeof sub.whatsappUrl === "string" && sub.whatsappUrl.includes("5511999998888"));

  const [leadRow] = await db.select().from(leadsTable).where(eq(leadsTable.name, "João Silva")).limit(1);
  ok("lead persistido", !!leadRow);
  ok("lead herdou ownerId = A", leadRow?.ownerId === ua.id, leadRow?.ownerId);
  ok("lead score = 5", leadRow?.score === 5, leadRow?.score);
  ok("lead segment inferido = corredor", leadRow?.segment === "corredor", leadRow?.segment);
  const fus = await db.select().from(followupsTable).where(eq(followupsTable.leadId, leadRow.id));
  ok("cadência de follow-up gerada (>0)", fus.length > 0, fus.length);

  r = await fetch(`${base}/public/quiz/dor-no-joelho/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Maria Dup", phone: "11977776666", answers: [{ questionId: "urg", optionIndex: 0 }, { questionId: "urg", optionIndex: 0 }, { questionId: "urg", optionIndex: 0 }] }),
  });
  await r.json();
  const [dup] = await db.select().from(leadsTable).where(eq(leadsTable.name, "Maria Dup")).limit(1);
  ok("dedup: 3× a mesma resposta conta 1× (score = 2)", dup?.score === 2, dup?.score);

  console.log("\n[Leads / KPIs escopados]");
  r = await fetch(`${base}/leads`, { headers: A });
  ok("A vê seus 2 leads", (await r.json()).length === 2);
  r = await fetch(`${base}/leads`, { headers: B });
  ok("B vê 0 leads (isolamento)", (await r.json()).length === 0);
  r = await fetch(`${base}/kpis`, { headers: A });
  const kpis = await r.json();
  ok("KPIs (A): totalLeads = 2", kpis.totalLeads === 2, kpis.totalLeads);
  ok("KPIs (A): funil tem 6 etapas", Array.isArray(kpis.funnel) && kpis.funnel.length === 6, kpis.funnel?.length);

  console.log("\n[SEO / segurança]");
  await db.insert(quizzesTable).values({
    ownerId: ua.id,
    slug: "xss-test",
    title: "</script><script>alert(1)</script>",
    whatsappNumber: "5511999998888",
    metaDescription: 'aspas " e <tag>',
  });
  const head = await buildQuizHead("xss-test", "https://ex.com");
  const html = head ? head.head : "";
  ok("buildQuizHead retornou algo", !!head);
  ok("sem breakout </script><script> literal", !html.includes("</script><script>"), html.slice(0, 80));
  ok("'<' escapado como \\u003c no JSON-LD", html.includes("\\u003c"));
  ok("meta description com aspas escapada (&quot;)", html.includes("&quot;"));

  console.log(`\n──────────────\nSUÍTE 1: ${passed} passaram, ${failed} falharam`);
  server.close();
  await new Promise((r) => setTimeout(r, 100));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("ERRO FATAL NO TESTE:", err);
  process.exit(2);
});
