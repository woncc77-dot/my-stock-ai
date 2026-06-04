"use client";

import { useEffect, useState } from "react";

import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured } from "@/lib/supabase/env";

type Status = "checking" | "ok" | "unreachable";

export function SupabaseConnectionBanner() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    if (!isSupabaseConfigured() || !getSupabaseAnonKey()) {
      setStatus("unreachable");
      return;
    }

    const url = getSupabaseUrl();
    const key = getSupabaseAnonKey();

    let cancelled = false;

    async function check() {
      try {
        const res = await fetch(`${url}/auth/v1/health`, {
          method: "GET",
          headers: { apikey: key },
        });
        if (!cancelled) {
          setStatus(res.ok ? "ok" : "unreachable");
        }
      } catch {
        if (!cancelled) {
          setStatus("unreachable");
        }
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status !== "unreachable") {
    return null;
  }

  return (
    <div className="border-b border-accent-magenta/30 bg-accent-magenta/10 px-6 py-4">
      <p className="type-body-sm font-[540] text-ink">
        Supabase에 연결할 수 없습니다 (Failed to fetch)
      </p>
      <p className="type-caption mt-2 text-ink/70">
        현재 프로젝트 URL(
        <code className="text-ink/80">{getSupabaseUrl() || "(URL 미설정)"}</code>
        )이 삭제되었거나 일시 중지된 상태입니다.
      </p>
      <ol className="type-caption mt-3 list-decimal space-y-1 pl-5 text-ink/70">
        <li>
          <a
            href="https://supabase.com/dashboard/projects"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4"
          >
            Supabase Dashboard
          </a>
          에서 프로젝트 <strong>Restore</strong> 또는 <strong>New project</strong>
        </li>
        <li>Project Settings → API에서 URL·anon key 복사</li>
        <li>
          <code className="text-ink/80">frontend/.env.local</code> 수정 후 dev 서버 재시작
        </li>
        <li>Authentication → Redirect URL에 <code>http://localhost:3000/auth/callback</code> 추가</li>
      </ol>
    </div>
  );
}
