import { logger } from "./logger";
import { searchGoogleTrends } from "./serper";
import { getTopPosts } from "./instagram";

// Descobre os temas/perguntas mais buscados e mais engajados por tema de saúde,
// combinando três fontes: Google (People Also Ask + related), Google Trends e
// Instagram (posts com mais engajamento da conta correspondente).

export const THEMES = {
  "medicina-esportiva": {
    label: "Medicina Esportiva",
    seeds: [
      "dor ao correr",
      "lesão no joelho esporte",
      "dor muscular treino",
      "tratamento tendinite atleta",
    ],
    // conta do Instagram que representa esse tema (lib/instagram.ts)
    instagramAccount: "loysby",
  },
  ortopedia: {
    label: "Ortopedia",
    seeds: ["dor no joelho", "dor no ombro", "dor na coluna", "dor no quadril"],
    instagramAccount: "loysby",
  },
  tricologia: {
    label: "Tricologia",
    seeds: ["queda de cabelo", "calvície", "cabelo afinando", "couro cabeludo"],
    instagramAccount: "drdaniel",
  },
  "terapia-capilar": {
    label: "Terapia Capilar",
    seeds: ["tratamento capilar queda", "cabelo ralo o que fazer", "caspa e queda", "cabelo sem volume"],
    instagramAccount: "drdaniel",
  },
} as const;

export type ThemeKey = keyof typeof THEMES;

export function isTheme(v: string): v is ThemeKey {
  return Object.prototype.hasOwnProperty.call(THEMES, v);
}

export interface ThemeSignals {
  googleQuestions: string[]; // People Also Ask
  googleRelated: string[]; // buscas relacionadas
  googleTrends: string[]; // Google Trends (consultas em alta)
  instagramTopics: string[]; // temas dos posts que mais engajaram
  instagramHashtags: string[]; // hashtags que mais aparecem
}

interface SerperSearchResponse {
  peopleAlsoAsk?: { question: string }[];
  relatedSearches?: { query: string }[];
}

async function serperSearch(query: string): Promise<SerperSearchResponse | null> {
  const key = process.env.SERPER_KEY;
  if (!key) return null;
  try {
    const resp = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, gl: "br", hl: "pt-br", num: 10 }),
    });
    if (!resp.ok) {
      logger.error({ status: resp.status }, "Serper search error (topics)");
      return null;
    }
    return (await resp.json()) as SerperSearchResponse;
  } catch (err) {
    logger.error({ err }, "Serper search failed (topics)");
    return null;
  }
}

const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;

/** Extrai temas (1ª frase, sem hashtags) e hashtags das legendas do Instagram. */
function extractFromCaptions(captions: string[]): { topics: string[]; hashtags: string[] } {
  const topics = new Set<string>();
  const hashtags = new Set<string>();
  for (const raw of captions) {
    if (!raw) continue;
    for (const tag of raw.match(HASHTAG_RE) ?? []) hashtags.add(tag.toLowerCase());
    const clean = raw.replace(HASHTAG_RE, "").trim();
    // primeira frase/linha como "tema"
    const firstLine = clean.split(/[.\n!?]/)[0]?.trim();
    if (firstLine && firstLine.length > 12) topics.add(firstLine.slice(0, 100));
  }
  return { topics: Array.from(topics).slice(0, 10), hashtags: Array.from(hashtags).slice(0, 15) };
}

async function fetchInstagramSignals(account: string): Promise<{ topics: string[]; hashtags: string[] }> {
  try {
    const posts = await getTopPosts(account);
    return extractFromCaptions(posts.map((p) => p.caption ?? ""));
  } catch (err) {
    logger.warn({ err, account }, "Instagram signals unavailable");
    return { topics: [], hashtags: [] };
  }
}

async function fetchGoogleTrends(seed: string): Promise<string[]> {
  try {
    const topics = await searchGoogleTrends(seed);
    return topics.map((t) => t.query).filter(Boolean).slice(0, 12);
  } catch (err) {
    logger.warn({ err, seed }, "Google Trends unavailable");
    return [];
  }
}

/**
 * Agrega todos os sinais de um tema (Google buscas + Google Trends + Instagram).
 * Fontes indisponíveis (sem chave/token) simplesmente retornam vazio, e a IA
 * usa o que houver — no limite, o próprio conhecimento.
 */
export async function gatherThemeSignals(theme: ThemeKey): Promise<ThemeSignals> {
  const cfg = THEMES[theme];

  const [searchResults, trends, ig] = await Promise.all([
    Promise.all(cfg.seeds.map((s) => serperSearch(s))),
    fetchGoogleTrends(cfg.seeds[0]),
    fetchInstagramSignals(cfg.instagramAccount),
  ]);

  const googleQuestions = new Set<string>();
  const googleRelated = new Set<string>();
  for (const r of searchResults) {
    if (!r) continue;
    for (const paa of r.peopleAlsoAsk ?? []) if (paa.question) googleQuestions.add(paa.question.trim());
    for (const rs of r.relatedSearches ?? []) if (rs.query) googleRelated.add(rs.query.trim());
  }

  return {
    googleQuestions: Array.from(googleQuestions).slice(0, 18),
    googleRelated: Array.from(googleRelated).slice(0, 18),
    googleTrends: trends,
    instagramTopics: ig.topics,
    instagramHashtags: ig.hashtags,
  };
}

export function countSignals(s: ThemeSignals): number {
  return (
    s.googleQuestions.length +
    s.googleRelated.length +
    s.googleTrends.length +
    s.instagramTopics.length +
    s.instagramHashtags.length
  );
}

export function flattenSignals(s: ThemeSignals): string[] {
  return [
    ...s.googleQuestions,
    ...s.googleRelated,
    ...s.googleTrends,
    ...s.instagramTopics,
    ...s.instagramHashtags,
  ];
}
