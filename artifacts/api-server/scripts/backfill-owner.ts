/**
 * Backfill de owner_id para dados legados (criados antes do multi-tenancy).
 * Atribui todo quiz/lead/indicação com owner_id NULO ao usuário informado.
 *
 * Uso:
 *   OWNER_EMAIL=clinica@exemplo.com DATABASE_URL=... \
 *     pnpm --filter @workspace/api-server run backfill:owner
 *
 * É idempotente: só toca linhas com owner_id nulo.
 */
import { db, usersTable, quizzesTable, leadsTable, referralsTable } from "@workspace/db";
import { eq, isNull } from "drizzle-orm";

async function main() {
  const email = process.env.OWNER_EMAIL;
  if (!email) {
    console.error("Defina OWNER_EMAIL=<email do dono> (usuário existente em vibe_users).");
    process.exit(2);
  }

  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  if (!user) {
    console.error(`Usuário não encontrado para o email: ${email}`);
    process.exit(2);
  }
  const uid = user.id;

  const quizzes = await db
    .update(quizzesTable)
    .set({ ownerId: uid })
    .where(isNull(quizzesTable.ownerId))
    .returning({ id: quizzesTable.id });
  const leads = await db
    .update(leadsTable)
    .set({ ownerId: uid })
    .where(isNull(leadsTable.ownerId))
    .returning({ id: leadsTable.id });
  const referrals = await db
    .update(referralsTable)
    .set({ ownerId: uid })
    .where(isNull(referralsTable.ownerId))
    .returning({ id: referralsTable.id });

  console.log(`Backfill concluído para ${email} (id=${uid}):`);
  console.log(`  quizzes atribuídos: ${quizzes.length}`);
  console.log(`  leads atribuídos:   ${leads.length}`);
  console.log(`  indicações atribuídas: ${referrals.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Erro no backfill:", err);
  process.exit(1);
});
