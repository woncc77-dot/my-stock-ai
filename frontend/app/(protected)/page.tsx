"use client";

import { FormEvent, useEffect, useState } from "react";

import { MarketNewsStrip } from "@/components/market-news-strip";
import { ThemeBoard } from "@/components/theme-board";
import { MarketOverviewBar } from "@/components/market-overview-bar";
import { MarqueeStrip } from "@/components/marquee-strip";
import { SiteFooter } from "@/components/site-footer";
import { StockChatPanel } from "@/components/stock-chat-panel";
import { StockNameAutocomplete } from "@/components/stock-name-autocomplete";
import { StockPriceChart } from "@/components/stock-price-chart";
import { TodayIntradayChart } from "@/components/today-intraday-chart";
import { SectionQuickLinks } from "@/components/section-nav";
import { TopNav } from "@/components/top-nav";
import { WatchlistBar } from "@/components/watchlist-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  API_BASE,
  buildStockQuery,
  fetchRecommendations,
  fetchStockPrices,
  isProductionApiMisconfigured,
  PRICE_PERIODS,
  streamStockAnalysis,
  type PricePoint,
  type Recommendation,
  type TodayIntraday,
  type TodayQuote,
} from "@/lib/api";

type PriceStats = {
  period_high?: number | null;
  period_low?: number | null;
  per?: number | null;
  pbr?: number | null;
  dividend_yield?: number | null;
};

const asText = (value: string | null | undefined) => value ?? "";

function LoadingSpinner({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 ${
        dark
          ? "border-white/30 border-t-white"
          : "border-ink/20 border-t-ink"
      }`}
    />
  );
}

export default function Home() {
  const [inputCode, setInputCode] = useState("");
  const [inputName, setInputName] = useState("");
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [activeCode, setActiveCode] = useState<string>("");
  const [activeName, setActiveName] = useState<string>("");

  const [isLoadingPrices, setIsLoadingPrices] = useState(false);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);

  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isLoadingRecommend, setIsLoadingRecommend] = useState(true);
  const [recommendError, setRecommendError] = useState<string | null>(null);
  const [analysisCached, setAnalysisCached] = useState(false);
  const [analysisUpdatedAt, setAnalysisUpdatedAt] = useState<string | null>(null);
  const [todayQuote, setTodayQuote] = useState<TodayQuote | null>(null);
  const [todayIntraday, setTodayIntraday] = useState<TodayIntraday | null>(null);
  const [period, setPeriod] = useState<number>(30);
  const [priceStats, setPriceStats] = useState<PriceStats>({});

  useEffect(() => {
    let cancelled = false;

    async function loadRecommendations() {
      setIsLoadingRecommend(true);
      setRecommendError(null);
      try {
        const data = await fetchRecommendations();
        if (!cancelled) {
          setRecommendations(data.recommendations);
        }
      } catch (err) {
        if (!cancelled) {
          setRecommendError(
            err instanceof Error ? err.message : "추천 종목을 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingRecommend(false);
        }
      }
    }

    loadRecommendations();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void loadPrices("삼성전자");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPrices(query: string, periodDays: number = period) {
    setIsLoadingPrices(true);
    setStockError(null);
    setAnalysis(null);
    setAnalysisError(null);
    setAnalysisCached(false);

    try {
      const priceData = await fetchStockPrices(query, periodDays);
      setActiveCode(asText(priceData.stock_code));
      setActiveName(asText(priceData.stock_name));
      setInputCode(asText(priceData.stock_code));
      setInputName(asText(priceData.stock_name));
      setPriceHistory(priceData.price_history);
      setTodayQuote(priceData.today_quote ?? null);
      setTodayIntraday(priceData.today_intraday ?? null);
      setPriceStats({
        period_high: priceData.period_high,
        period_low: priceData.period_low,
        per: priceData.per,
        pbr: priceData.pbr,
        dividend_yield: priceData.dividend_yield,
      });
    } catch (err) {
      setPriceHistory([]);
      setTodayQuote(null);
      setTodayIntraday(null);
      setPriceStats({});
      setStockError(
        err instanceof Error ? err.message : "주가 데이터를 불러오지 못했습니다.",
      );
    } finally {
      setIsLoadingPrices(false);
    }
  }

  function changePeriod(days: number) {
    if (days === period) return;
    setPeriod(days);
    const query = buildStockQuery(
      asText(activeCode || inputCode),
      asText(activeName || inputName),
    );
    if (query) {
      void loadPrices(query, days);
    }
  }

  async function runAnalysis() {
    const query = buildStockQuery(
      asText(activeCode || inputCode),
      asText(activeName || inputName),
    );
    if (!query || priceHistory.length === 0) {
      setAnalysisError("먼저 종목을 검색해 주세요.");
      return;
    }

    setIsLoadingAnalysis(true);
    setAnalysis("");
    setAnalysisError(null);
    setAnalysisCached(false);
    setAnalysisUpdatedAt(null);

    try {
      await streamStockAnalysis(query, {
        onMeta: (meta) => {
          if (meta.stock_code) setActiveCode(meta.stock_code);
          if (meta.stock_name) setActiveName(meta.stock_name);
        },
        onCached: () => setAnalysisCached(true),
        onChunk: (text) => {
          setAnalysis((prev) => `${prev ?? ""}${text}`);
        },
        onError: (message) => setAnalysisError(message),
      });
      setAnalysisUpdatedAt(
        new Date().toLocaleString("ko-KR", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    } catch (err) {
      setAnalysis(null);
      setAnalysisError(
        err instanceof Error ? err.message : "AI 분석 중 오류가 발생했습니다.",
      );
    } finally {
      setIsLoadingAnalysis(false);
    }
  }

  async function runSearch(query: string) {
    await loadPrices(query);
  }

  async function handleSearch(e?: FormEvent) {
    e?.preventDefault();
    const query = buildStockQuery(inputCode, inputName);
    if (!query) {
      setStockError("종목명 또는 종목코드를 입력해 주세요.");
      return;
    }
    await runSearch(query);
  }

  function handleStockPick(name: string, code = "") {
    setInputCode(asText(code));
    setInputName(asText(name));
    void runSearch(buildStockQuery(code, name));
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-canvas text-ink">
      <TopNav />
      {isProductionApiMisconfigured() && (
        <div className="border-b border-accent-magenta/30 bg-accent-magenta/10 page-shell py-4">
          <p className="type-body-sm font-semibold">
            Vercel 배포: 백엔드 API URL이 설정되지 않았습니다.
          </p>
          <p className="type-caption mt-2 text-ink/70">
            현재 API 주소: <code>{API_BASE}</code> — Railway/Render에 FastAPI를 배포한 뒤,
            Vercel 환경변수 <code>NEXT_PUBLIC_API_URL</code>에 그 URL을 넣고 Redeploy 하세요.
          </p>
        </div>
      )}
      <MarketOverviewBar />
      <MarqueeStrip onTickerClick={(name) => handleStockPick(name)} />
      <WatchlistBar
        activeCode={activeCode || inputCode}
        activeName={activeName || inputName}
        onSelect={handleStockPick}
      />
      <MarketNewsStrip />

      {/* Hero — white canvas */}
      <section className="mx-auto max-w-[1280px] page-shell pb-12 pt-12 sm:pb-16 sm:pt-16 lg:px-8 lg:pb-24 lg:pt-28">
        <p className="type-eyebrow mb-6">국내 주식 · Gemini AI</p>
        <h1 className="type-display-lg max-w-4xl text-ink">
          원채 주식 AI
          <br />
          대시보드
        </h1>
        <p className="type-subhead mt-8 max-w-2xl text-ink">
          FinanceDataReader로 실시간 주가를 불러오고, Google Gemini가 단기 흐름과
          전망을 친절한 한국어로 요약해 드립니다.
        </p>

        <SectionQuickLinks />

        <form
          onSubmit={handleSearch}
          className="mt-12 flex max-w-3xl flex-col gap-4 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <label htmlFor="stock-code" className="type-caption mb-2 block">
              종목코드 <span className="text-ink/40">(선택)</span>
            </label>
            <input
              id="stock-code"
              type="text"
              inputMode="numeric"
              placeholder="비워두면 종목명만으로 검색"
              value={asText(inputCode)}
              onChange={(e) => setInputCode(e.target.value)}
              className="text-input"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="stock-name" className="type-caption mb-2 block">
              종목명
            </label>
            <StockNameAutocomplete
              value={asText(inputName)}
              onChange={setInputName}
              onSelect={(suggestion) =>
                handleStockPick(suggestion.name, suggestion.code)
              }
              disabled={isLoadingPrices}
            />
          </div>
          <button type="submit" disabled={isLoadingPrices} className="btn-primary shrink-0">
            {isLoadingPrices ? (
              <>
                <LoadingSpinner dark />
                조회 중
              </>
            ) : (
              "검색"
            )}
          </button>
        </form>
        <p className="type-caption mt-3 text-ink/60">
          종목명 입력 시 유사 종목이 표시됩니다 · 클릭하면 바로 검색
        </p>

        {stockError && (
          <p className="type-body-sm mt-4 text-ink underline decoration-accent-magenta decoration-2 underline-offset-4">
            {stockError}
          </p>
        )}
      </section>

      <div className="mx-auto max-w-[1280px] page-shell lg:px-8">
        <div className="grid min-w-0 gap-8 pb-16 sm:gap-12 sm:pb-24 lg:grid-cols-3 lg:gap-8">
          {/* Left column */}
          <div className="min-w-0 space-y-8 sm:space-y-12 lg:col-span-2 lg:space-y-24">
            {/* Lime color block — chart */}
            <section className="data-card">
              <p className="type-eyebrow mb-4">Price Trend</p>
              <h2 className="type-headline mb-2">최근 주가 추이</h2>
              {todayQuote?.date && (
                <p className="type-caption mb-4 normal-case tracking-normal text-ink/50">
                  데이터 기준 {todayQuote.date}
                </p>
              )}
              <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="조회 기간">
                {PRICE_PERIODS.map((p) => (
                  <button
                    key={p.days}
                    type="button"
                    onClick={() => changePeriod(p.days)}
                    disabled={isLoadingPrices}
                    aria-pressed={period === p.days}
                    className={`rounded-pill border px-3 py-1.5 type-caption normal-case tracking-normal transition-colors disabled:opacity-50 ${
                      period === p.days
                        ? "border-primary bg-primary text-on-primary"
                        : "border-hairline bg-canvas text-ink hover:bg-surface-soft"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {isLoadingPrices ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <StockPriceChart
                  data={priceHistory}
                  stockCode={activeCode || inputCode}
                  stockName={activeName}
                  todayQuote={todayQuote}
                  periodHigh={priceStats.period_high}
                  periodLow={priceStats.period_low}
                  per={priceStats.per}
                  pbr={priceStats.pbr}
                  dividendYield={priceStats.dividend_yield}
                  periodLabel={
                    PRICE_PERIODS.find((p) => p.days === period)?.label
                  }
                />
              )}
            </section>

            {/* Sky block — today intraday */}
            <section className="data-card">
              <p className="type-eyebrow mb-4">Today Intraday</p>
              <h2 className="type-headline mb-8">오늘의 종목 그래프</h2>
              {isLoadingPrices ? (
                <Skeleton className="h-56 w-full" />
              ) : (
                <TodayIntradayChart
                  data={todayIntraday}
                  stockCode={activeCode || inputCode}
                  stockName={activeName}
                />
              )}
            </section>

            {/* Lilac color block — AI analysis */}
            <section id="stock-analysis" className="data-card space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="type-eyebrow mb-4">Gemini AI Report</p>
                  <h2 className="type-headline">주가 분석 리포트</h2>
                </div>
                {priceHistory.length > 0 && !isLoadingAnalysis && (
                  <button
                    type="button"
                    onClick={() => void runAnalysis()}
                    disabled={isLoadingAnalysis}
                    className="btn-primary shrink-0"
                  >
                    {analysis ? "AI 분석 다시 받기" : "AI 분석 받기"}
                  </button>
                )}
              </div>

              {isLoadingAnalysis && !analysis ? (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-4/6" />
                  <p className="type-body-sm text-ink/60">Gemini가 분석 중입니다…</p>
                </div>
              ) : analysis ? (
                <div className="space-y-3">
                  {analysisCached && (
                    <p className="type-caption normal-case text-ink/60">
                      저장된 분석 결과입니다 (API 호출 없음)
                    </p>
                  )}
                  {analysisUpdatedAt && (
                    <p className="type-caption normal-case text-ink/50">
                      마지막 업데이트 {analysisUpdatedAt}
                    </p>
                  )}
                  <div className="max-w-3xl whitespace-pre-wrap type-body leading-relaxed">
                    {analysis}
                  </div>
                  <p className="type-caption normal-case text-ink/50">
                    본 내용은 AI 참고용이며 투자 권유가 아닙니다. 데이터: FinanceDataReader ·
                    Google Gemini
                  </p>
                </div>
              ) : analysisError ? (
                <div className="rounded-md border border-hairline bg-surface-soft p-6 type-body-sm leading-relaxed">
                  {analysisError}
                </div>
              ) : (
                <p className="type-body-sm max-w-xl text-ink/80">
                  종목 검색 후 <strong className="font-semibold">AI 분석 받기</strong> 버튼을
                  누르면 Gemini가 주가 흐름과 전망을 실시간으로 요약합니다.
                </p>
              )}

              <StockChatPanel
                stockQuery={buildStockQuery(
                  asText(activeCode || inputCode),
                  asText(activeName || inputName),
                )}
                stockName={asText(activeName || inputName)}
                disabled={priceHistory.length === 0}
              />
            </section>
          </div>

          {/* Right column — coral block */}
          <aside className="min-w-0 lg:col-span-1">
            <Card id="recommendations" className="border-hairline shadow-none lg:sticky lg:top-24">
              <CardHeader>
                <p className="type-eyebrow mb-2">Multi-Strategy Screen</p>
                <CardTitle>10대 투자기법 종목 추천</CardTitle>
                <p className="type-caption normal-case tracking-normal text-ink/60">
                  수급·모멘텀·골든크로스·돌파·RSI·MACD·추세·볼린저·상대강도·MA20
                </p>
              </CardHeader>
              <CardContent>
              {isLoadingRecommend ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                  <p className="type-caption normal-case text-ink/60">스크리닝 중 · 최대 2~4분</p>
                </div>
              ) : recommendError ? (
                <div className="rounded-md border border-hairline bg-canvas p-4 type-body-sm leading-relaxed">
                  {recommendError}
                  <p className="type-caption mt-2 text-ink/60">
                    현재 API: {API_BASE}
                    {API_BASE.includes("localhost") && (
                      <> · 로컬 백엔드: <code>cd backend && uvicorn main:app --reload</code></>
                    )}
                    {!API_BASE.includes("localhost") && (
                      <> · Vercel/Railway URL이 실제 배포 주소와 일치하는지 확인하세요.</>
                    )}
                  </p>
                </div>
              ) : recommendations.length === 0 ? (
                <p className="type-body-sm py-8 text-center text-ink/70">
                  조건에 맞는 추천 종목이 없습니다.
                </p>
              ) : (
                <ul className="space-y-3">
                  {recommendations.map((item, index) => (
                    <li key={item.code}>
                      <button
                        type="button"
                        onClick={() => handleStockPick(item.name, item.code)}
                        className="template-card w-full"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="type-caption text-ink/60">#{index + 1}</span>
                            <p className="type-body-sm mt-1 font-semibold">{item.name}</p>
                            <p className="type-caption mt-0.5 text-ink/50">{item.code}</p>
                          </div>
                          <span className="inline-flex min-h-[28px] max-w-[96px] shrink-0 items-center justify-center truncate rounded-pill bg-primary px-2 type-caption text-on-primary sm:max-w-[120px] sm:px-3">
                            {item.strategy_name}
                          </span>
                        </div>
                        <dl className="mt-4 grid grid-cols-2 gap-3 type-caption text-ink/70">
                          <div>
                            <dt>기법 점수</dt>
                            <dd className="mt-1 type-body-sm font-semibold text-ink">
                              {item.score.toFixed(0)}점
                            </dd>
                          </div>
                          <div>
                            <dt>20일 수익률</dt>
                            <dd
                              className={`mt-1 type-body-sm font-semibold ${
                                item.return_20d_pct >= 0
                                  ? "text-positive"
                                  : "text-negative"
                              }`}
                            >
                              {item.return_20d_pct >= 0 ? "+" : ""}
                              {item.return_20d_pct.toFixed(1)}%
                            </dd>
                          </div>
                          <div>
                            <dt>RSI(14)</dt>
                            <dd className="mt-1 type-body-sm font-semibold text-ink">
                              {item.rsi_14.toFixed(0)}
                            </dd>
                          </div>
                          <div>
                            <dt>거래량 배율</dt>
                            <dd className="mt-1 type-body-sm font-semibold text-ink">
                              ×{item.volume_ratio.toFixed(1)}
                            </dd>
                          </div>
                        </dl>
                        <p className="mt-3 line-clamp-2 type-caption normal-case tracking-normal text-ink/60">
                          {item.reason}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <p className="type-caption mt-8 border-t border-hairline pt-6 normal-case tracking-normal text-ink/50">
                {recommendations.length}종목 · 기법별 스크리닝 · 투자 권유 아님
              </p>
              </CardContent>
            </Card>
          </aside>
        </div>

        {/* Theme board */}
        <section id="themes" className="mb-16 scroll-mt-24 sm:mb-24">
          <h2 className="type-subhead mb-1 text-ink">테마별 시세</h2>
          <p className="type-body-sm mb-6 text-ink/60">
            오늘 강세를 보이는 테마와 주도주를 확인하세요.
          </p>
          <ThemeBoard onSelect={handleStockPick} />
        </section>

        {/* Navy promo block */}
        <section className="color-block mb-16 sm:mb-24 bg-block-navy text-inverse-ink">
          <div className="max-w-2xl">
            <p className="type-eyebrow mb-4 text-inverse-ink/70">Powered by</p>
            <h2 className="type-headline mb-4 text-inverse-ink">
              FinanceDataReader + Gemini 2.5 Flash
            </h2>
            <p className="type-body-sm text-inverse-ink/80">
              국내 KRX 상장 종목의 주가·거래량 데이터와 AI 분석을 한 화면에서
              확인하세요.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button type="button" className="btn-primary bg-canvas text-ink hover:opacity-90">
                종목 검색하기
              </button>
              <a
                href={`${API_BASE}/docs`}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary border border-inverse-ink/20 bg-transparent text-inverse-ink hover:bg-white/10"
              >
                API 문서
              </a>
            </div>
          </div>
        </section>
      </div>

      <SiteFooter />
    </div>
  );
}
