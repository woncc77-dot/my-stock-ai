"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchThemes, type StockTheme } from "@/lib/api";

type ThemeBoardProps = {
  onSelect: (name: string, code: string) => void;
};

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function toneClass(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) return "text-ink/60";
  return value > 0 ? "text-positive" : "text-negative";
}

function badgeClass(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) {
    return "bg-ink/10 text-ink/70";
  }
  return value > 0
    ? "bg-positive/15 text-positive"
    : "bg-negative/15 text-negative";
}

function ThemeCard({
  theme,
  onSelect,
}: {
  theme: StockTheme;
  onSelect: ThemeBoardProps["onSelect"];
}) {
  return (
    <Card className="border-hairline bg-canvas shadow-none">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="type-body-sm font-semibold leading-snug">
          {theme.name}
        </CardTitle>
        <Badge
          className={`shrink-0 border-0 font-semibold ${badgeClass(theme.change_pct)}`}
        >
          {formatPct(theme.change_pct)}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3 type-caption normal-case tracking-normal text-ink/50">
          <span className="text-positive">상승 {theme.rising}</span>
          <span className="text-negative">하락 {theme.falling}</span>
          <span>전체 {theme.stock_count}종목</span>
        </div>
        <ul className="space-y-1">
          {theme.leaders.map((leader) => (
            <li key={leader.code}>
              <button
                type="button"
                onClick={() => onSelect(leader.name, leader.code)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-soft"
              >
                <span className="truncate type-body-sm font-medium">
                  {leader.name}
                </span>
                <span
                  className={`shrink-0 type-caption normal-case tracking-normal font-semibold ${toneClass(leader.change_pct)}`}
                >
                  {formatPct(leader.change_pct)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function ThemeBoard({ onSelect }: ThemeBoardProps) {
  const [themes, setThemes] = useState<StockTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchThemes(12);
      setThemes(data.themes);
      setSourceUrl(data.source_url);
      setSourceLabel(data.source);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "테마 시세를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="type-caption normal-case tracking-normal text-ink/50">
          등락률 상위 테마 · 주도주를 누르면 차트·AI 분석으로 이동합니다
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : error ? (
        <p className="type-body-sm text-ink/70">{error}</p>
      ) : themes.length === 0 ? (
        <p className="type-body-sm text-ink/60">표시할 테마가 없습니다.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {themes.map((theme) => (
            <ThemeCard key={theme.no} theme={theme} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}
