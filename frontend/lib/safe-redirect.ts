/**
 * 오픈 리다이렉트 방지: 같은 출처의 상대 경로만 허용합니다.
 *
 * 거부: 빈 값, 절대 URL(`https://..`), protocol-relative(`//evil.com`),
 * 역슬래시(`/\evil.com`), 스킴 포함(`://`), 제어문자.
 * 허용: `/`, `/dashboard`, `/foo?bar=1#baz` 등 단일 슬래시로 시작하는 경로.
 */
export function safeRelativePath(
  value: string | null | undefined,
  fallback = "/",
): string {
  if (!value) return fallback;
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\")
  ) {
    return fallback;
  }
  if (/[\u0000-\u001f\\]/.test(value) || value.includes("://")) {
    return fallback;
  }
  return value;
}
