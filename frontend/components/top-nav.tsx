"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { SectionNavCompact } from "@/components/section-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { API_BASE } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";

type UserInfo = {
  email: string;
  displayName: string;
};

export function TopNav() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        setUser({
          email: data.user.email ?? "",
          displayName:
            (data.user.user_metadata?.full_name as string | undefined) ??
            data.user.email?.split("@")[0] ??
            "회원",
        });
      }
    }

    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          email: session.user.email ?? "",
          displayName:
            (session.user.user_metadata?.full_name as string | undefined) ??
            session.user.email?.split("@")[0] ??
            "회원",
        });
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-hairline bg-canvas">
      <div className="mx-auto max-w-[1280px] page-shell lg:px-8">
        <div className="flex h-14 items-center justify-between gap-1 sm:gap-2">
          <Link
            href="/"
            className="type-caption shrink-0 font-semibold tracking-[-0.26px] sm:type-body-sm"
          >
            <span className="sm:hidden">주식 AI</span>
            <span className="hidden sm:inline">원채 주식 AI</span>
          </Link>
          <SectionNavCompact />
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <ThemeToggle />
            {user ? (
              <>
                <span className="type-caption hidden max-w-[72px] truncate text-ink/70 md:inline">
                  {user.displayName}
                </span>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="btn-secondary btn-compact sm:min-h-[44px] sm:px-4 sm:py-2 sm:text-base"
                >
                  로그아웃
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="btn-primary btn-compact sm:min-h-[44px] sm:px-4 sm:py-2 sm:text-base"
              >
                로그인
              </Link>
            )}
            <a
              href={`${API_BASE}/docs`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary btn-compact hidden sm:inline-flex sm:min-h-[44px] sm:px-4 sm:py-2 sm:text-base"
            >
              API
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
