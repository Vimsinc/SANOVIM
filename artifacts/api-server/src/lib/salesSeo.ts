import { db, quizzesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "./logger";

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Monta o <title> e as meta tags (SEO + Open Graph + JSON-LD) de um quiz
 * público, para injeção server-side na página /q/:slug. Retorna null se o quiz
 * não existir/estiver inativo (aí serve a index.html padrão).
 */
export async function buildQuizHead(
  slug: string,
  origin: string,
): Promise<{ title: string; head: string } | null> {
  try {
    const [quiz] = await db
      .select()
      .from(quizzesTable)
      .where(and(eq(quizzesTable.slug, slug), eq(quizzesTable.active, true)))
      .limit(1);
    if (!quiz) return null;

    const title = quiz.metaTitle || quiz.title;
    const description =
      quiz.metaDescription ||
      quiz.description ||
      `Responda o quiz "${quiz.title}" e descubra o próximo passo para cuidar da sua saúde.`;
    const keywords = (quiz.keywords as string[] | null) ?? [];
    const url = `${origin}/q/${quiz.slug}`;

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "MedicalWebPage",
      name: title,
      description,
      url,
      inLanguage: "pt-BR",
      keywords: keywords.join(", "),
      audience: { "@type": "MedicalAudience", audienceType: "Patient" },
    };

    const head = [
      `<meta name="description" content="${esc(description)}" />`,
      keywords.length ? `<meta name="keywords" content="${esc(keywords.join(", "))}" />` : "",
      `<link rel="canonical" href="${esc(url)}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:title" content="${esc(title)}" />`,
      `<meta property="og:description" content="${esc(description)}" />`,
      `<meta property="og:url" content="${esc(url)}" />`,
      `<meta property="og:locale" content="pt_BR" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${esc(title)}" />`,
      `<meta name="twitter:description" content="${esc(description)}" />`,
      `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
    ]
      .filter(Boolean)
      .join("\n");

    return { title: esc(title), head };
  } catch (err) {
    logger.error({ err }, "buildQuizHead failed");
    return null;
  }
}
