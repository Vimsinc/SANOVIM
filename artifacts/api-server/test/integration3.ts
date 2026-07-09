/* Suíte 3: rate limiting. Roda com RL_PUBLIC_PER_MIN baixo. */
import express from "express";
import salesRouter from "../src/routes/sales";
import { db, usersTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const TRUNCATE = sql`TRUNCATE vibe_users, vibe_quizzes, vibe_leads, vibe_lead_events, vibe_followups, vibe_referrals RESTART IDENTITY CASCADE`;

let passed = 0, failed = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra !== undefined ? "  →  " + JSON.stringify(extra) : ""}`); }
}

async function main() {
  await db.execute(TRUNCATE);
  await db.insert(usersTable).values({ email: "rl@t.com", name: "RL" });

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
  const A = { "x-test-email": "rl@t.com", "content-type": "application/json" };

  // cria um quiz para submeter
  await fetch(`${b}/quizzes`, {
    method: "POST",
    headers: A,
    body: JSON.stringify({
      slug: "rl", title: "RL", whatsappNumber: "5511999998888",
      questions: [{ id: "q", question: "?", options: [{ label: "a", points: 1 }, { label: "b", points: 0 }] }],
      resultBands: [{ min: 0, level: "frio", title: "F", message: "m" }],
    }),
  });

  console.log("\n[Rate limiting] (limite público = 3/min)");
  const codes: number[] = [];
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`${b}/public/quiz/rl/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: `Lead ${i}`, phone: "11999990000", answers: [{ questionId: "q", optionIndex: 0 }] }),
    });
    codes.push(r.status);
  }
  ok("primeiras 3 submissões passam (200)", codes.slice(0, 3).every((c) => c === 200), codes);
  ok("submissões acima do limite → 429", codes.slice(3).some((c) => c === 429), codes);

  // ---- Geração por IA (modo fake) — caminho de sucesso ----
  console.log("\n[Geração por IA — fake]");
  const g = await fetch(`${b}/quizzes/generate`, {
    method: "POST",
    headers: A,
    body: JSON.stringify({ theme: "ortopedia", whatsappNumber: "5511999998888" }),
  });
  const gd = await g.json();
  ok("POST /quizzes/generate → 201", g.status === 201, g.status);
  ok("quiz gerado tem perguntas válidas", Array.isArray(gd.quiz?.questions) && gd.quiz.questions.length >= 1, gd.quiz?.questions?.length);
  ok("quiz gerado marcado aiGenerated", gd.quiz?.aiGenerated === true, gd.quiz?.aiGenerated);

  console.log(`\n──────────────\nSUÍTE 3: ${passed} passaram, ${failed} falharam`);
  server.close();
  await new Promise((r) => setTimeout(r, 100));
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((err) => { console.error("ERRO FATAL:", err); process.exit(2); });
