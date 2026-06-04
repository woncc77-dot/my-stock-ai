# Vercel 환경변수 (Settings → Environment Variables)

아래 값을 **그대로 복사**하세요. 설명 문구를 Value에 넣지 마세요.

## 필수 3개

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://fwbjwdlfdstdcnqnrkko.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_5U-D0i4Gev1U-aHe71Gnmg_86kuSd8m` |
| `NEXT_PUBLIC_API_URL` | Railway 백엔드 URL (예: `https://my-stock-ai-production.up.railway.app`) |

## Vercel 프로젝트 설정

1. **Root Directory:** `frontend` (반드시!)
2. Framework: Next.js
3. 환경변수 저장 후 **Redeploy**

## Supabase (배포 URL 확정 후)

Authentication → URL Configuration:
- Site URL: `https://your-app.vercel.app`
- Redirect: `https://your-app.vercel.app/auth/callback`

## Railway 백엔드

상세 절차는 [RAILWAY.md](./RAILWAY.md) 참고.

1. https://railway.app → GitHub `woncc77-dot/my-stock-ai` 연결
2. **Root Directory:** `backend`
3. Variables: `GEMINI_API_KEY`, `ALLOWED_ORIGINS`, `SUPABASE_JWT_SECRET`
4. **Networking → Generate Domain** → URL 복사
5. Vercel `NEXT_PUBLIC_API_URL`에 Railway URL 입력 후 **Redeploy**
