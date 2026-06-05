"use client";

import { Star, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";

type WatchlistRow = {
  id: string;
  stock_code: string;
  stock_name: string;
};

type WatchlistBarProps = {
  activeCode?: string;
  activeName?: string;
  onSelect: (name: string, code: string) => void;
};

export function WatchlistBar({
  activeCode = "",
  activeName = "",
  onSelect,
}: WatchlistBarProps) {
  const [items, setItems] = useState<WatchlistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("watchlists")
      .select("id, stock_code, stock_name")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      setItems([]);
    } else {
      setItems(data ?? []);
      setMessage(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addCurrent() {
    const code = activeCode.trim();
    const name = activeName.trim();
    if (!code || !name) {
      setMessage("먼저 종목을 검색해 주세요.");
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setMessage("로그인이 필요합니다.");
      return;
    }

    const { error } = await supabase.from("watchlists").upsert(
      {
        user_id: user.id,
        stock_code: code,
        stock_name: name,
      },
      { onConflict: "user_id,stock_code" },
    );

    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage(null);
    await load();
  }

  async function remove(id: string) {
    const supabase = createClient();
    await supabase.from("watchlists").delete().eq("id", id);
    await load();
  }

  return (
    <section className="border-b border-hairline bg-canvas" aria-label="관심종목">
      <div className="mx-auto max-w-[1280px] page-shell py-3 lg:px-8">
        <Card className="border-hairline bg-surface-soft shadow-none">
          <CardHeader className="flex-col items-stretch gap-3 space-y-0 pb-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">관심종목</CardTitle>
            <button
              type="button"
              onClick={() => void addCurrent()}
              className="inline-flex w-full items-center justify-center gap-1 rounded-pill border border-hairline bg-canvas px-3 py-1.5 type-caption normal-case tracking-normal hover:bg-surface-soft sm:w-auto"
            >
              <Star className="h-3.5 w-3.5" />
              현재 종목 추가
            </button>
          </CardHeader>
          <CardContent>
            {message && <p className="mb-2 type-caption normal-case text-ink/60">{message}</p>}
            {loading ? (
              <div className="flex gap-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-8 w-24" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <p className="type-body-sm text-ink/60">
                관심 종목을 검색한 뒤 「현재 종목 추가」를 눌러 보세요.
              </p>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="inline-flex shrink-0 items-center gap-1 rounded-pill border border-hairline bg-canvas pl-3 pr-1"
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(item.stock_name, item.stock_code)}
                      className="type-caption normal-case tracking-normal hover:underline"
                    >
                      {item.stock_name}
                      <Badge variant="secondary" className="ml-2">
                        {item.stock_code}
                      </Badge>
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(item.id)}
                      className="rounded-full p-1 hover:bg-surface-soft"
                      aria-label={`${item.stock_name} 제거`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
