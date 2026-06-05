export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Vercel 등 프로덕션에서 localhost API URL을 쓰는 경우 */
export function isProductionApiMisconfigured(): boolean {
  if (typeof window === "undefined") return false;
  const onLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  if (onLocalhost) return false;
  return (
    API_BASE.includes("localhost") ||
    API_BASE.includes("127.0.0.1") ||
    API_BASE.includes("xxx.up.railway.app") ||
    API_BASE.includes("your-app.vercel.app") ||
    API_BASE.includes("Railway") ||
    API_BASE.includes("Render") ||
    !API_BASE.startsWith("http")
  );
}

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
  period_high?: number | null;
  period_low?: number | null;
  per?: number | null;
  pbr?: number | null;
  dividend_yield?: number | null;
};

export type PricePeriod = {
  days: number;
  label: string;
};

export const PRICE_PERIODS: PricePeriod[] = [
  { days: 30, label: "30일" },
  { days: 90, label: "90일" },
  { days: 180, label: "6개월" },
  { days: 365, label: "1년" },
];

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

export type MarketNewsItem = {
  title: string;
  url: string;
  source: string;
  published_at: string;
};

export type MarketNewsResponse = {
  count: number;
  region?: string;
  source: string;
  source_url: string;
  cached: boolean;
  items: MarketNewsItem[];
};

export type MarketQuote = {
  symbol: string;
  label: string;
  value: number;
  change: number | null;
  change_pct: number | null;
  date: string;
  unit: string;
};

export type MarketOverviewResponse = {
  updated_at: string;
  cached: boolean;
  quotes: MarketQuote[];
};

export type ThemeLeader = {
  code: string;
  name: string;
  change_pct: number | null;
};

export type StockTheme = {
  no: string;
  name: string;
  change_pct: number | null;
  rising: number;
  falling: number;
  flat: number;
  stock_count: number;
  leaders: ThemeLeader[];
};

export type ThemesResponse = {
  updated_at: string;
  cached: boolean;
  source: string;
  source_url: string;
  themes: StockTheme[];
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type WatchlistItem = {
  id: string;
  stock_code: string;
  stock_name: string;
  created_at: string;
};

export function buildStockQuery(code: string, name: string): string {
  const c = code.trim();
  const n = name.trim();
  if (c && n) return `${c} ${n}`;
  if (c) return c;
  if (n) return n;
  return "";
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (accessTokenProvider) {
    const token = await accessTokenProvider();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function consumeSseStream(
  url: string,
  onEvent: (data: Record<string, unknown>) => void,
  timeoutMs = 90_000,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = await authHeaders();

  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(
        typeof body?.detail === "string" ? body.detail : `요청 실패 (${res.status})`,
      );
    }
    if (!res.body) throw new Error("스트림 응답이 비어 있습니다.");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const line = part
          .split("\n")
          .find((l) => l.startsWith("data: "));
        if (!line) continue;
        const payload = line.slice(6);
        if (payload === "[DONE]") return;
        onEvent(JSON.parse(payload) as Record<string, unknown>);
      }
    }
  } finally {
    clearTimeout(timer);
  }
}

async function postSseStream(
  url: string,
  body: unknown,
  onEvent: (data: Record<string, unknown>) => void,
  timeoutMs = 90_000,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    "Content-Type": "application/json",
    ...(await authHeaders()),
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(
        typeof errBody?.detail === "string" ? errBody.detail : `요청 실패 (${res.status})`,
      );
    }
    if (!res.body) throw new Error("스트림 응답이 비어 있습니다.");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        const payload = line.slice(6);
        if (payload === "[DONE]") return;
        onEvent(JSON.parse(payload) as Record<string, unknown>);
      }
    }
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson<T>(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers = await authHeaders();

  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      if (typeof body?.detail === "string") {
        throw new Error(body.detail);
      }
      if (res.status === 404) {
        throw new Error(
          `API 주소를 찾을 수 없습니다 (404). 백엔드 URL(${API_BASE})이 맞는지 확인하세요. ` +
            `로컬: backend 서버 실행 + NEXT_PUBLIC_API_URL=http://localhost:8000 · ` +
            `Vercel: Railway/Render 배포 URL을 환경변수에 설정해야 합니다.`,
        );
      }
      throw new Error(`요청에 실패했습니다. (${res.status})`);
    }
    return res.json();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `서버 응답 시간이 초과되었습니다. 백엔드(${API_BASE})를 확인해 주세요.`,
      );
    }
    if (err instanceof TypeError && err.message === "Failed to fetch") {
      throw new Error(
        `백엔드(${API_BASE})에 연결할 수 없습니다. 서버가 실행 중인지, URL이 올바른지 확인하세요.`,
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

export async function fetchMarketOverview(): Promise<MarketOverviewResponse> {
  return fetchJson(`${API_BASE}/api/market/overview`, 20_000);
}

export async function fetchThemes(limit = 12): Promise<ThemesResponse> {
  return fetchJson(`${API_BASE}/api/themes?limit=${limit}`, 20_000);
}

export async function fetchMarketNews(
  limit = 8,
  region: "domestic" | "global" = "domestic",
): Promise<MarketNewsResponse> {
  return fetchJson(
    `${API_BASE}/api/news/market?limit=${limit}&region=${region}`,
    20_000,
  );
}

export async function streamStockAnalysis(
  stockQuery: string,
  handlers: {
    onMeta?: (meta: { stock_code?: string; stock_name?: string }) => void;
    onChunk: (text: string) => void;
    onCached?: () => void;
    onError?: (message: string) => void;
  },
): Promise<void> {
  const encoded = encodeURIComponent(stockQuery.trim());
  await consumeSseStream(
    `${API_BASE}/api/stock/analysis/stream?q=${encoded}`,
    (data) => {
      if (typeof data.error === "string") {
        handlers.onError?.(data.error);
        return;
      }
      if (data.meta && typeof data.meta === "object") {
        handlers.onMeta?.(data.meta as { stock_code?: string; stock_name?: string });
      }
      if (data.cached) handlers.onCached?.();
      if (typeof data.text === "string") handlers.onChunk(data.text);
    },
    90_000,
  );
}

export async function streamStockChat(
  stockQuery: string,
  messages: ChatMessage[],
  handlers: {
    onChunk: (text: string) => void;
    onError?: (message: string) => void;
  },
): Promise<void> {
  await postSseStream(
    `${API_BASE}/api/stock/chat`,
    { stock_query: stockQuery, messages },
    (data) => {
      if (typeof data.error === "string") {
        handlers.onError?.(data.error);
        return;
      }
      if (typeof data.text === "string") handlers.onChunk(data.text);
    },
    90_000,
  );
}

export async function fetchStockSuggestions(
  query: string,
  limit = 8,
): Promise<StockSuggestResponse> {
  const encoded = encodeURIComponent(query.trim());
  return fetchJson(
    `${API_BASE}/api/stock/suggest?q=${encoded}&limit=${limit}`,
    60_000,
  );
}

export async function fetchStockPrices(
  stockQuery: string,
  days = 30,
): Promise<StockPricesResponse> {
  const encoded = encodeURIComponent(stockQuery.trim());
  return fetchJson(
    `${API_BASE}/api/stock/prices?q=${encoded}&days=${days}`,
    30_000,
  );
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
