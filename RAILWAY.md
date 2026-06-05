# Railway 백엔드 배포 가이드

FastAPI 백엔드를 Railway에 배포하고 Vercel 프론트와 연결합니다.

## 1. Railway 프로젝트 생성

1. [Railway](https://railway.app) → **Login with GitHub**
2. **New Project** → **Deploy from GitHub repo**
3. `woncc77-dot/my-stock-ai` 선택
4. **Settings → Root Directory** → `backend` 입력 (필수!)
5. **Settings → Deploy** → Start Command (자동 감지):
   ```
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```
   (`backend/railway.toml` 참고)

## 2. 환경 변수 (Variables)

Railway → 서비스 → **Variables** 탭:

| 변수 | 값 |
|------|-----|
| `GEMINI_API_KEY` | Google AI Studio 키 |
| `ALLOWED_ORIGINS` | `https://your-app.vercel.app,http://localhost:3000` |
| `SUPABASE_JWT_SECRET` | Supabase → Settings → API → **JWT Secret** |

> `ALLOWED_ORIGINS`의 Vercel URL은 실제 배포 주소로 바꾸세요.

## 3. 공개 URL 발급

1. Railway → 서비스 → **Settings → Networking**
2. **Generate Domain** 클릭
3. URL 복사 (예: `https://my-stock-ai-production.up.railway.app`)
4. 브라우저에서 `https://your-url/` 접속 → JSON 메시지 확인

## 4. Vercel 연동

Vercel → **Settings → Environment Variables**:

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
NEXT_PUBLIC_API_URL=https://your-url.up.railway.app
```

> 실제 Supabase URL/키는 Dashboard → Project Settings → API 에서 확인하세요.
> 키를 문서에 커밋하지 마세요.

- Vercel **Root Directory:** `frontend`
- 저장 후 **Redeploy**

## 5. Supabase

Authentication → URL Configuration:
- Redirect: `https://your-app.vercel.app/auth/callback`

## 6. 로컬 CLI (선택)

```powershell
cd backend
npx @railway/cli login
npx @railway/cli link
npx @railway/cli up
```

## 참고

- `/api/recommend`는 2~4분 소요 → Railway Pro/설정에서 타임아웃 넉넉히
- 무료 체험: $5 크레dit (소진 후 유료)
- 헬스체크: `GET /` (`railway.toml`의 `healthcheckPath`)
