"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchMarketOverview, type MarketQuote } from "@/lib/api";
import { cn } from "@/lib/utils";

function formatValue(quote: MarketQuote) {
  if (quote.unit === "KRW") {
    return quote.value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
  }
  return quote.value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

function QuoteItem({ quote }: { quote: MarketQuote }) {
  const hasChange = quote.change_pct != null;
  const positive = (quote.change_pct ?? 0) >= 0;

  return (
    <div className="flex min-w-[140px] shrink-0 items-center gap-3 border-r border-hairline pr-4 last:border-r-0">
      <div>
        <p className="type-caption normal-case tracking-normal text-ink/50">
          {quote.label}
        </p>
        <p className="tabular-nums type-body-sm font-semibold">
          {formatValue(quote)}
        </p>
      </div>
      {hasChange ? (
        <Badge variant={positive ? "positive" : "negative"}>
          {positive ? "+" : ""}
          {quote.change_pct!.toFixed(2)}%
        </Badge>
      ) : (
        <Badge variant="secondary">—</Badge>
      )}
    </div>
  );
}

export function MarketOverviewBar() {
  const [quotes, setQuotes] = useState<MarketQuote[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchMarketOverview();
        if (!cancelled) {
          setQuotes(data.quotes);
          setUpdatedAt(data.updated_at);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "시장 지표를 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      className="border-b border-hairline bg-canvas"
      aria-label="시장 지표"
    >
      <div className="mx-auto max-w-[1280px] px-6 py-3 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="type-eyebrow text-ink/60">Market Overview</p>
          {updatedAt && (
            <p className="type-caption normal-case tracking-normal text-ink/40">
              업데이트 {updatedAt}
            </p>
          )}
        </div>
        {loading ? (
          <div className="mt-2 flex gap-4 overflow-x-auto pb-1">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-36 shrink-0" />
            ))}
          </div>
        ) : error ? (
          <p className={cn("mt-2 type-body-sm text-ink/60")}>{error}</p>
        ) : (
          <div className="mt-2 flex gap-4 overflow-x-auto pb-1">
            {quotes.map((quote) => (
              <QuoteItem key={quote.symbol} quote={quote} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
