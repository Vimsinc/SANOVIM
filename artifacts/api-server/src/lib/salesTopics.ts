import { logger } from "./logger";

// Descobre os temas/perguntas mais pesquisados por tema de saúde no Brasil,
// usando o Serper (Google). O bloco "People Also Ask" e "Related Searches"
// representam, na prática, o que as pessoas mais buscam sobre o assunto.

export const THEMES = {
  "medicina-esportiva": {
    label: "Medicina Esportiva",
    seeds: [
      "dor ao correr",
      "lesão no joelho esporte",
      "dor muscular treino",
      "tratamento tendinite atleta",
    ],
  },
  ortopedia: {
    label: "Ortopedia",
    seeds: ["dor no joelho", "dor no ombro", "dor na coluna", "dor no quadril"],
  },
  tricologia: {
    label: "Tricologia",
    seeds: ["queda de cabelo", "calvície", "cabelo afinando", "couro cabeludo"],
  },
  "terapia-capilar": {
    label: "Terapia Capilar",
    seeds: ["tratamento capilar queda", "cabelo ralo o que fazer", "caspa e queda", "cabelo sem volume"],
  },
} as const;

export type ThemeKey = keyof typeof THEMES;

export function isTheme(v: string): v is ThemeKey {
  return v in THEMES;
}

interface SerperSearchResponse {
  peopleAlsoAsk?: { question: string }[];
  relatedSearches?: { query: string }[];
  organic?: { title: string; snippet?: string }[];
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

/**
 * Retorna as perguntas/temas mais pesquisados sobre um tema.
 * Combina People Also Ask + Related Searches de várias sementes.
 * Se o SERPER_KEY não estiver configurado, devolve lista vazia (a IA usa
 * o próprio conhecimento como fallback).
 */
export async function fetchMostSearched(theme: ThemeKey): Promise<{
  questions: string[];
  related: string[];
}> {
  const { seeds } = THEMES[theme];
  const results = await Promise.all(seeds.map((s) => serperSearch(s)));

  const questions = new Set<string>();
  const related = new Set<string>();

  for (const r of results) {
    if (!r) continue;
    for (const paa of r.peopleAlsoAsk ?? []) {
      if (paa.question) questions.add(paa.question.trim());
    }
    for (const rs of r.relatedSearches ?? []) {
      if (rs.query) related.add(rs.query.trim());
    }
  }

  return {
    questions: Array.from(questions).slice(0, 20),
    related: Array.from(related).slice(0, 20),
  };
}
