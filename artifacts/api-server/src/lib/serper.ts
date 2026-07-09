import { logger } from "./logger";

const SERPER_API_URL = "https://google.serper.dev/search";

interface SerperResult {
  title: string;
  snippet: string;
  link: string;
  source?: string;
}

interface SerperResponse {
  organic?: SerperResult[];
  news?: SerperResult[];
}

export interface GoogleTrendsTopic {
  query: string;
  values: { date: string; value: number }[];
  peakValue: number;
  trend: "up" | "down" | "stable";
}

interface SerperTrendsResponse {
  interest?: {
    title: string;
    timelineData?: { date: string; value: number }[];
  }[];
  relatedQueries?: {
    query: string;
    values?: { date: string; value: number }[];
  }[];
  trendingSearches?: { title: string; traffic: string }[];
}

export async function searchTrends(query: string, count = 5): Promise<SerperResult[]> {
  const key = process.env.SERPER_KEY;
  if (!key) {
    logger.warn("SERPER_KEY not configured");
    return [];
  }

  try {
    const resp = await fetch(SERPER_API_URL, {
      method: "POST",
      headers: {
        "X-API-KEY": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: count, gl: "br", hl: "pt-br" }),
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) {
      logger.error({ status: resp.status }, "Serper API error");
      return [];
    }

    const data = (await resp.json()) as SerperResponse;
    const results = data.organic || data.news || [];
    return results.slice(0, count);
  } catch (err) {
    logger.error({ err }, "Failed to fetch from Serper");
    return [];
  }
}

export async function searchNews(query: string, count = 5): Promise<SerperResult[]> {
  const key = process.env.SERPER_KEY;
  if (!key) return [];

  try {
    const resp = await fetch("https://google.serper.dev/news", {
      method: "POST",
      headers: {
        "X-API-KEY": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: count, gl: "br", hl: "pt-br" }),
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) return [];
    const data = (await resp.json()) as SerperResponse;
    return (data.news || []).slice(0, count);
  } catch (err) {
    logger.error({ err }, "Failed to fetch news from Serper");
    return [];
  }
}

export async function searchGoogleTrends(keyword: string): Promise<GoogleTrendsTopic[]> {
  const key = process.env.SERPER_KEY;
  if (!key) {
    logger.warn("SERPER_KEY not configured");
    return [];
  }

  try {
    const resp = await fetch("https://google.serper.dev/trends", {
      method: "POST",
      headers: {
        "X-API-KEY": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: keyword, gl: "BR", hl: "pt-BR", type: "trending" }),
    });

    if (!resp.ok) {
      logger.error({ status: resp.status }, "Serper Trends API error");
      return [];
    }

    const data = (await resp.json()) as SerperTrendsResponse;
    const results: GoogleTrendsTopic[] = [];

    if (data.interest && data.interest.length > 0) {
      for (const item of data.interest) {
        const values = (item.timelineData || []).map((d) => ({ date: d.date, value: d.value }));
        const peakValue = values.length > 0 ? Math.max(...values.map((v) => v.value)) : 0;
        const recent = values.slice(-3);
        const older = values.slice(-6, -3);
        const recentAvg = recent.length ? recent.reduce((s, v) => s + v.value, 0) / recent.length : 0;
        const olderAvg = older.length ? older.reduce((s, v) => s + v.value, 0) / older.length : 0;
        const trend = recentAvg > olderAvg * 1.1 ? "up" : recentAvg < olderAvg * 0.9 ? "down" : "stable";
        results.push({ query: item.title, values, peakValue, trend });
      }
    }

    if (data.relatedQueries && results.length < 8) {
      for (const rq of data.relatedQueries.slice(0, 8 - results.length)) {
        const values = (rq.values || []).map((d) => ({ date: d.date, value: d.value }));
        const peakValue = values.length > 0 ? Math.max(...values.map((v) => v.value)) : 0;
        results.push({ query: rq.query, values, peakValue, trend: "up" });
      }
    }

    if (data.trendingSearches && results.length < 8) {
      for (const ts of data.trendingSearches.slice(0, 8 - results.length)) {
        results.push({ query: ts.title, values: [], peakValue: 0, trend: "up" });
      }
    }

    return results.slice(0, 10);
  } catch (err) {
    logger.error({ err }, "Failed to fetch Google Trends from Serper");
    return [];
  }
}
