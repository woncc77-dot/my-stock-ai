"use client";

import { useEffect } from "react";

import { setAccessTokenProvider } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";

export function ApiAuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setAccessTokenProvider(async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    });
  }, []);

  return children;
}
