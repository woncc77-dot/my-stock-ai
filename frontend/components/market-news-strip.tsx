"use client";

import { useCallback, useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchMarketNews, type MarketNewsItem } from "@/lib/api";

function formatPublishedAt(value: string): string {
  if (!value) return "";
  const iso = value.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
  if (iso) return `${iso[1]} ${iso[2]}`;
  return value.length > 16 ? value.slice(0, 16) : value;
}

function NewsList({ items }: { items: MarketNewsItem[] }) {
  if (items.length === 0) {
    return <p className="type-body-sm text-ink/60">표시할 뉴스가 없습니다.</p>;
  }

  return (
    <ul className="divide-y divide-hairline">
      {items.map((item) => (
        <li key={item.url}>
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="group flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <span className="type-body-sm font-semibold leading-snug group-hover:underline">
              {item.title}
            </span>
            <span className="flex shrink-0 items-center gap-2 type-caption normal-case tracking-normal text-ink/50">
              {item.source && <span>{item.source}</span>}
              {item.source && item.published_at && <span aria-hidden="true">·</span>}
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
  );
}

function NewsPanel({ region }: { region: "domestic" | "global" }) {
  const [items, setItems] = useState<MarketNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMarketNews(8, region);
      setItems(data.items);
      setSourceUrl(data.source_url);
      setSourceLabel(data.source);
    } catch (err) {
      setError(err instanceof Error ? err.message : "뉴스를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [region]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="type-caption normal-case tracking-normal text-ink/50">
          {region === "domestic" ? "국내 시장 헤드라인" : "글로벌 금융 헤드라인"}
        </p>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="type-caption normal-case tracking-normal text-ink/50 underline-offset-2 hover:text-ink hover:underline"
          >
            출처: {sourceLabel}
          </a>
        )}
      </div>
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : error ? (
        <p className="type-body-sm text-ink/70">{error}</p>
      ) : (
        <NewsList items={items} />
      )}
    </div>
  );
}

export function MarketNewsStrip() {
  return (
    <section className="border-b border-hairline bg-surface-soft" aria-label="시장 뉴스">
      <div className="mx-auto max-w-[1280px] page-shell py-4 lg:px-8">
        <Card className="border-hairline bg-canvas shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Market News</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="domestic">
              <TabsList>
                <TabsTrigger value="domestic">국내</TabsTrigger>
                <TabsTrigger value="global">해외</TabsTrigger>
              </TabsList>
              <TabsContent value="domestic">
                <NewsPanel region="domestic" />
              </TabsContent>
              <TabsContent value="global">
                <NewsPanel region="global" />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
