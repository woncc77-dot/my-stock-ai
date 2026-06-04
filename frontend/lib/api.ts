export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const FETCH_TIMEOUT_MS = 60_000;

let accessTokenProvider: (() => Promise<string | null>) | null = null;

export function setAccessTokenProvider(
  provider: () => Promise<string | null>,
) {
  accessTokenProvider = provider;
}

export type PricePoint = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type TodayQuote = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number | null;
  change_pct: number | null;
  is_today: boolean;
};

export type IntradayPoint = {
  time: string;
  price: number;
  volume: number;
};

export type TodayIntraday = {
  date: string;
  points: IntradayPoint[];
  open: number;
  high: number;
  low: number;
  close: number;
  change: number | null;
  change_pct: number | null;
  is_today: boolean;
};

export type StockPricesResponse = {
  stock_code: string;
  stock_name: string;
  period_days: number;
  price_history: PricePoint[];
  today_quote?: TodayQuote | null;
  today_intraday?: TodayIntraday | null;
};

export type StockAnalysisOnlyResponse = {
  stock_code: string;
  stock_name: string;
  analysis: string | null;
  analysis_error?: string;
  cached?: boolean;
};

export type StockAnalysisResponse = StockPricesResponse & {
  analysis: string | null;
  analysis_error?: string;
};

export type InvestmentStrategy = {
  id: string;
  name: string;
  category: string;
};

export type Recommendation = {
  code: string;
  name: string;
  marcap: number;
  strategy_id: string;
  strategy_name: string;
  strategy_category: string;
  score: number;
  volume_ratio: number;
  return_20d_pct: number;
  rsi_14: number;
  avg_volume_recent_3d: number;
  avg_volume_baseline_20d: number;
  reason: string;
};

export type RecommendResponse = {
  count: number;
  strategies: InvestmentStrategy[];
  criteria: {
    top_marcap: number;
    max_recommendations: number;
    techniques_count: number;
    history_days: number;
  };
  recommendations: Recommendation[];
  disclaimer: string;
};

export type StockSuggestion = {
  code: string;
  name: string;
};

export type StockSuggestResponse = {
  query: string;
  count: number;
  suggestions: StockSuggestion[];
};

export function buildStockQuery(code: string, name: string): string {
  const c = code.trim();
  const n = name.trim();
  if (c && n) return `${c} ${n}`;
  if (c) return c;
  if (n) return n;
  return "";
}

async function fetchJson<T>(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {};
  if (accessTokenProvider) {
    const token = await accessTokenProvider();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const message =
        body?.detail ?? `요청에 실패했습니다. (${res.status})`;
      throw new Error(typeof message === "string" ? message : JSON.stringify(message));
    }
    return res.json();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `서버 응답 시간이 초과되었습니다. 백엔드(${API_BASE})를 확인해 주세요.`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function stockQueryUrl(query: string, mode: "prices" | "analysis" | "full" = "full"): string {
  const encoded = encodeURIComponent(query.trim());
  if (mode === "prices") {
    return `${API_BASE}/api/stock/prices?q=${encoded}`;
  }
  if (mode === "analysis") {
    return `${API_BASE}/api/stock/analysis?q=${encoded}`;
  }
  return `${API_BASE}/api/stock/${encoded}`;
}

export async function fetchStockSuggestions(
  query: string,
  limit = 8,
): Promise<StockSuggestResponse> {
  const encoded = encodeURIComponent(query.trim());
  return fetchJson(
    `${API_BASE}/api/stock/suggest?q=${encoded}&limit=${limit}`,
    10_000,
  );
}

export async function fetchStockPrices(stockQuery: string): Promise<StockPricesResponse> {
  return fetchJson(stockQueryUrl(stockQuery, "prices"), 30_000);
}

export async function fetchStockAnalysisOnly(
  stockQuery: string,
): Promise<StockAnalysisOnlyResponse> {
  return fetchJson(stockQueryUrl(stockQuery, "analysis"), 90_000);
}

export async function fetchStockAnalysis(
  stockQuery: string,
): Promise<StockAnalysisResponse> {
  return fetchJson(stockQueryUrl(stockQuery, "full"));
}

export async function fetchRecommendations(): Promise<RecommendResponse> {
  return fetchJson(`${API_BASE}/api/recommend`, 300_000);
}

export function formatMarcap(marcap: number): string {
  if (marcap >= 1_0000_0000_0000) {
    return `${(marcap / 1_0000_0000_0000).toFixed(1)}조`;
  }
  if (marcap >= 1_0000_0000) {
    return `${(marcap / 1_0000_0000).toFixed(0)}억`;
  }
  return marcap.toLocaleString("ko-KR");
}

export function formatVolume(volume: number): string {
  if (volume >= 1_0000_0000) {
    return `${(volume / 1_0000_0000).toFixed(1)}억`;
  }
  if (volume >= 1_0000) {
    return `${(volume / 1_0000).toFixed(0)}만`;
  }
  return volume.toLocaleString("ko-KR");
}
