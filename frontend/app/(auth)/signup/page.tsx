"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { formatAuthError } from "@/lib/auth-errors";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    let data;
    let signUpError;

    try {
      ({ data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: displayName || undefined },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/`,
        },
      }));
    } catch (err) {
      setError(formatAuthError(err));
      setLoading(false);
      return;
    }

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      router.push("/");
      router.refresh();
      return;
    }

    setMessage("가입 확인 메일을 발송했습니다. 이메일을 확인해 주세요.");
    setPendingEmail(email);
    setLoading(false);
  }

  async function handleResendConfirmation() {
    if (!pendingEmail) return;

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: pendingEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/`,
      },
    });

    if (resendError) {
      setError(resendError.message);
    } else {
      setMessage("인증 메일을 다시 보냈습니다. 받은편지함과 스팸함을 확인해 주세요.");
    }
    setLoading(false);
  }

  async function handleGoogleSignup() {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/`,
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6 py-16">
      <div className="mx-auto w-full max-w-md">
        <p className="type-eyebrow mb-4">원채 주식 AI</p>
        <h1 className="type-headline mb-2">회원가입</h1>
        <p className="type-body-sm mb-8 text-ink/70">
          이메일 또는 Google 계정으로 시작하세요.
        </p>

        <button
          type="button"
          onClick={() => void handleGoogleSignup()}
          disabled={loading}
          className="btn-secondary mb-6 w-full justify-center py-3"
        >
          Google로 가입하기
        </button>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-hairline" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-canvas px-3 type-caption text-ink/50">또는</span>
          </div>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label htmlFor="displayName" className="type-caption mb-2 block">
              이름 <span className="text-ink/40">(선택)</span>
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="text-input"
              placeholder="원채"
            />
          </div>
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
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="text-input"
              placeholder="6자 이상"
            />
          </div>

          {error && (
            <p className="type-body-sm text-ink underline decoration-accent-magenta decoration-2 underline-offset-4">
              {error}
            </p>
          )}
          {message && (
            <div className="space-y-3 rounded-lg border border-hairline bg-canvas p-4">
              <p className="type-body-sm text-ink/80">{message}</p>
              <p className="type-caption text-ink/60">
                메일의 <strong>가입 확인</strong> 링크를 누르면 자동으로 로그인됩니다.
                이미 가입한 계정이면{" "}
                <Link href="/login" className="underline underline-offset-4">
                  로그인
                </Link>
                으로 이동하세요.
              </p>
              {pendingEmail && (
                <button
                  type="button"
                  onClick={() => void handleResendConfirmation()}
                  disabled={loading}
                  className="btn-secondary w-full justify-center py-2 text-sm"
                >
                  인증 메일 다시 보내기
                </button>
              )}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full py-3">
            {loading ? "가입 중..." : "회원가입"}
          </button>
        </form>

        <p className="type-body-sm mt-8 text-center text-ink/70">
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="font-[540] text-ink underline underline-offset-4">
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}
