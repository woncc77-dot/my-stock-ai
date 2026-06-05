"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { formatAuthError } from "@/lib/auth-errors";
import { safeRelativePath } from "@/lib/safe-redirect";

function authErrorFromParam(value: string | null): string | null {
  if (value === "supabase_config") {
    return "Supabase Project URL이 설정되지 않았습니다. frontend/.env.local의 NEXT_PUBLIC_SUPABASE_URL을 확인해 주세요.";
  }
  if (value) {
    return "로그인에 실패했습니다. 다시 시도해 주세요.";
  }
  return null;
}

export default function LoginPage() {
  const router = useRouter();
  const [redirect, setRedirect] = useState("/");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRedirect(safeRelativePath(params.get("redirect")));
    setError(authErrorFromParam(params.get("error")));
  }, []);

  async function handleEmailLogin(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    let signInError;

    try {
      ({ error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      }));
    } catch (err) {
      setError(formatAuthError(err));
      setLoading(false);
      return;
    }

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    router.push(redirect);
    router.refresh();
  }

  async function handleGoogleLogin() {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirect)}`,
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas page-shell py-12 sm:py-16">
      <div className="mx-auto w-full max-w-md">
        <p className="type-eyebrow mb-4">원채 주식 AI</p>
        <h1 className="type-headline mb-2">로그인</h1>
        <p className="type-body-sm mb-8 text-ink/70">
          이메일 또는 Google 계정으로 로그인하세요.
        </p>

        <button
          type="button"
          onClick={() => void handleGoogleLogin()}
          disabled={loading}
          className="btn-secondary mb-6 w-full justify-center py-3"
        >
          Google로 계속하기
        </button>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-hairline" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-canvas px-3 type-caption text-ink/50">또는</span>
          </div>
        </div>

        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="type-caption mb-2 block">
              이메일
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="text-input"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="type-caption mb-2 block">
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="text-input"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="type-body-sm text-ink underline decoration-accent-magenta decoration-2 underline-offset-4">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full py-3">
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <p className="type-body-sm mt-8 text-center text-ink/70">
          계정이 없으신가요?{" "}
          <Link href="/signup" className="font-semibold text-ink underline underline-offset-4">
            회원가입
          </Link>
        </p>
      </div>
    </div>
  );
}
