import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger";
import { THEMES, type ThemeKey, type ThemeSignals } from "./salesTopics";
import type { QuizQuestion, ResultBand } from "@workspace/db";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface GeneratedQuiz {
  slug: string;
  title: string;
  description: string;
  questions: QuizQuestion[];
  resultBands: ResultBand[];
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

/** Garante ids estáveis, pontos numéricos e faixas válidas. */
function sanitize(raw: any, theme: ThemeKey): GeneratedQuiz {
  const questions: QuizQuestion[] = Array.isArray(raw.questions)
    ? raw.questions.slice(0, 8).map((q: any, i: number) => ({
        id: typeof q.id === "string" && q.id ? q.id : `q${i + 1}`,
        question: String(q.question ?? "").slice(0, 240),
        help: q.help ? String(q.help).slice(0, 200) : undefined,
        options: Array.isArray(q.options)
          ? q.options.slice(0, 5).map((o: any) => ({
              label: String(o.label ?? "").slice(0, 160),
              points: Number.isFinite(Number(o.points)) ? Math.round(Number(o.points)) : 0,
              tag: o.tag ? String(o.tag).slice(0, 40) : undefined,
            }))
          : [],
      }))
    : [];

  let resultBands: ResultBand[] = Array.isArray(raw.resultBands)
    ? raw.resultBands
        .map((b: any) => ({
          min: Number.isFinite(Number(b.min)) ? Math.round(Number(b.min)) : 0,
          level: ["frio", "morno", "quente"].includes(b.level) ? b.level : "morno",
          title: String(b.title ?? "").slice(0, 120),
          message: String(b.message ?? "").slice(0, 600),
        }))
        .sort((a: ResultBand, b: ResultBand) => a.min - b.min)
    : [];

  if (resultBands.length === 0) {
    resultBands = [
      { min: 0, level: "frio", title: "Vale acompanhar", message: "Sinais leves — o ideal é prevenir. Podemos te orientar." },
      { min: 4, level: "morno", title: "Merece uma avaliação", message: "Há sinais que costumam se agravar sem tratamento. Uma avaliação ajuda a identificar a causa." },
      { min: 7, level: "quente", title: "Recomendamos avaliar logo", message: "O quadro já impacta seu dia a dia. Quanto antes avaliarmos, mais simples a recuperação." },
    ];
  }

  const title = String(raw.title ?? THEMES[theme].label).slice(0, 120);
  return {
    slug: slugify(raw.slug || title) || `quiz-${theme}`,
    title,
    description: String(raw.description ?? "").slice(0, 300),
    questions,
    resultBands,
    metaTitle: String(raw.metaTitle ?? title).slice(0, 70),
    metaDescription: String(raw.metaDescription ?? raw.description ?? "").slice(0, 160),
    keywords: Array.isArray(raw.keywords) ? raw.keywords.slice(0, 12).map((k: any) => String(k)) : [],
  };
}

/**
 * Gera um quiz de captação completo para um tema, embasado nas perguntas mais
 * pesquisadas pelas pessoas, e otimizado para SEO.
 */
function signalsBlock(s: ThemeSignals): string {
  const parts: string[] = [];
  if (s.googleQuestions.length)
    parts.push(`GOOGLE — Perguntas mais feitas (People Also Ask):\n${s.googleQuestions.map((q) => `- ${q}`).join("\n")}`);
  if (s.googleRelated.length)
    parts.push(`GOOGLE — Buscas relacionadas:\n${s.googleRelated.map((q) => `- ${q}`).join("\n")}`);
  if (s.googleTrends.length)
    parts.push(`GOOGLE TRENDS — Consultas em alta:\n${s.googleTrends.map((q) => `- ${q}`).join("\n")}`);
  if (s.instagramTopics.length)
    parts.push(`INSTAGRAM — Temas dos posts que mais engajaram o público:\n${s.instagramTopics.map((q) => `- ${q}`).join("\n")}`);
  if (s.instagramHashtags.length)
    parts.push(`INSTAGRAM — Hashtags recorrentes (use como sementes de palavras-chave):\n${s.instagramHashtags.map((q) => `- ${q}`).join("\n")}`);
  return parts.length
    ? `SINAIS REAIS DO QUE O PÚBLICO MAIS BUSCA E ENGAJA (use como base para os temas do quiz e para o SEO):\n\n${parts.join("\n\n")}`
    : "Não há dados de busca/engajamento disponíveis; use seu conhecimento sobre as dúvidas mais comuns do público brasileiro sobre o tema.";
}

export async function generateQuizForTheme(
  theme: ThemeKey,
  signals: ThemeSignals,
): Promise<GeneratedQuiz> {
  const themeLabel = THEMES[theme].label;
  const searchedBlock = signalsBlock(signals);

  const system = `Você é especialista em marketing de saúde e copywriting de conversão no Brasil.
Cria quizzes de captação de leads que engajam e qualificam pacientes, seguindo as normas do CFM (Resolução 2.336/2023): NÃO prometa cura ou resultado garantido, NÃO use sensacionalismo, foque em educar e convidar para uma avaliação. Responda SEMPRE em JSON válido, sem texto fora do JSON.`;

  const prompt = `Crie um quiz de captação de leads sobre o tema "${themeLabel}" para uma clínica no Brasil.

${searchedBlock}

O quiz deve:
- Ter um título curto e atraente (linguagem do paciente, não técnica).
- Ter 5 a 6 perguntas de múltipla escolha que ajudem a pessoa a se auto-avaliar e que qualifiquem o lead (tempo do sintoma, impacto na vida, urgência, comportamento).
- Cada opção tem "points" (0 a 3): quanto mais grave/urgente/engajado, mais pontos. Some ~10 pontos no máximo.
- Use "tag" em opções que revelem um segmento/persona (ex: "corredor", "atleta", "queda-intensa") — opcional.
- Ter 3 faixas de resultado (frio, morno, quente) com título e mensagem que nomeiam o problema e convidam para avaliação (sem prometer resultado).
- SEO: metaTitle (até 60 caracteres, com a palavra-chave principal), metaDescription (até 155 caracteres, persuasiva), e 6-10 keywords baseadas nas buscas reais acima.
- slug: curto, com a palavra-chave principal, em kebab-case.

Retorne EXATAMENTE este JSON:
{
  "slug": "palavra-chave-principal",
  "title": "Título do quiz",
  "description": "Uma frase convidando a responder",
  "questions": [
    { "id": "q1", "question": "Pergunta?", "options": [ { "label": "Opção", "points": 2, "tag": "opcional" } ] }
  ],
  "resultBands": [
    { "min": 0, "level": "frio", "title": "...", "message": "..." },
    { "min": 4, "level": "morno", "title": "...", "message": "..." },
    { "min": 7, "level": "quente", "title": "...", "message": "..." }
  ],
  "metaTitle": "...",
  "metaDescription": "...",
  "keywords": ["...", "..."]
}`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 3000,
    system,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.error("Quiz AI: JSON not found in response");
    throw new Error("Resposta da IA inválida");
  }
  const parsed = JSON.parse(jsonMatch[0]);
  return sanitize(parsed, theme);
}
