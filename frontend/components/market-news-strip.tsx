"use client";

import { useEffect, useState } from "react";

import { fetchMarketNews, type MarketNewsItem } from "@/lib/api";

function LoadingSpinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />
  );
}

function formatPublishedAt(value: string): string {
  if (!value) return "";
  const match = value.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
  if (match) {
    return `${match[1]} ${match[2]}`;
  }
  return value;
}

export function MarketNewsStrip() {
  const [items, setItems] = useState<MarketNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchMarketNews(8);
        if (!cancelled) {
          setItems(data.items);
          setSourceUrl(data.source_url);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "뉴스를 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      className="border-b border-hairline bg-surface-soft"
      aria-label="시장 주요 뉴스"
    >
      <div className="mx-auto max-w-[1280px] px-6 py-4 lg:px-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="type-eyebrow text-ink/70">Market News</p>
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="type-caption normal-case tracking-normal text-ink/50 underline-offset-2 hover:text-ink hover:underline"
            >
              출처: 네이버 금융
            </a>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-2 type-body-sm text-ink/60">
            <LoadingSpinner />
            주요 뉴스 불러오는 중…
          </div>
        ) : error ? (
          <p className="type-body-sm text-ink/70">{error}</p>
        ) : items.length === 0 ? (
          <p className="type-body-sm text-ink/60">표시할 뉴스가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {items.map((item) => (
              <li key={item.url}>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <span className="type-body-sm font-[480] leading-snug group-hover:underline">
                    {item.title}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 type-caption normal-case tracking-normal text-ink/50">
                    {item.source && <span>{item.source}</span>}
                    {item.source && item.published_at && (
                      <span aria-hidden="true">·</span>
                    )}
                    {item.published_at && (
                      <time dateTime={item.published_at}>
                        {formatPublishedAt(item.published_at)}
                      </time>
                    )}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
