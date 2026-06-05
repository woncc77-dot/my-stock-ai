"use client";

import { setAccessTokenProvider } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";

// 렌더 시점에 동기적으로 1회 등록합니다.
// (useEffect에 두면 React가 자식 컴포넌트의 effect를 먼저 실행해
//  첫 API 호출이 토큰 없이 나가 401이 되는 문제가 있습니다.)
let registered = false;

function registerTokenProvider() {
  if (registered || typeof window === "undefined") return;
  registered = true;
  setAccessTokenProvider(async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  });
}

export function ApiAuthProvider({ children }: { children: React.ReactNode }) {
  registerTokenProvider();
  return children;
}
