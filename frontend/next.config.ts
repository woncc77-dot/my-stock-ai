import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

// CSP connect-src 허용 출처. 빌드 env 값 + 알려진 백엔드 도메인(빌드 env 누락 대비 안전장치).
const connectSrc = Array.from(
  new Set(
    [
      "'self'",
      apiUrl,
      "https://my-stock-ai-api.onrender.com",
      supabaseUrl,
      "https://*.supabase.co",
      "wss://*.supabase.co",
    ].filter(Boolean),
  ),
).join(" ");

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
]
  .filter(Boolean)
  .join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Vercel 정적 파일 기본값 ACAO:* 를 특정 출처로 덮어써 와일드카드 제거
  { key: "Access-Control-Allow-Origin", value: "https://my-stock-ai-lime.vercel.app" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
