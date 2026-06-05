"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { SectionNavCompact } from "@/components/section-nav";
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
      <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <Link href="/" className="type-body-sm font-[540] tracking-[-0.26px]">
            원채 주식 AI
          </Link>
        </div>
        <SectionNavCompact />
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <span className="type-caption hidden text-ink/70 sm:inline">
                {user.displayName}
              </span>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="btn-secondary px-4 py-2 text-base"
              >
                로그아웃
              </button>
            </>
          ) : (
            <Link href="/login" className="btn-primary px-4 py-2 text-base">
              로그인
            </Link>
          )}
          <a
            href={`${API_BASE}/docs`}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary hidden px-4 py-2 text-base sm:inline-flex"
          >
            API
          </a>
        </div>
      </div>
    </header>
  );
}
