export function formatAuthError(err: unknown): string {
  if (err instanceof TypeError && err.message === "Failed to fetch") {
    return "Supabase 서버에 연결할 수 없습니다. 프로젝트가 일시 중지·삭제되었거나 .env.local 설정이 잘못되었을 수 있습니다.";
  }

  if (err instanceof Error) {
    return err.message;
  }

  return "알 수 없는 오류가 발생했습니다.";
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
