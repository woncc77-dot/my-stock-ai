# 원채 주식 AI — 배포 가이드

프론트엔드(Vercel) + 백엔드(Railway/Render) + Supabase Auth

## 1. Supabase

1. [Supabase Dashboard](https://supabase.com/dashboard)에서 프로젝트 생성
2. **Authentication → Providers**: Email, Google 활성화
3. **Authentication → URL Configuration**
   - Site URL: `http://localhost:3000` (개발), 배포 후 Vercel URL 추가
   - Redirect URLs:
     - `http://localhost:3000/auth/callback`
     - `https://your-app.vercel.app/auth/callback`
4. **SQL**: `supabase/migrations/20260604120000_create_profiles.sql` 적용 (profiles + RLS + 트리거)
5. **Project Settings → API**에서 URL, anon key, JWT Secret 복사

### Google OAuth

1. [Google Cloud Console](https://console.cloud.google.com/) → OAuth 클라이언트 ID 생성
2. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
3. Client ID/Secret을 Supabase Google Provider에 등록
4. Authorized JavaScript origins에 Vercel URL 추가

## 2. 로컬 개발

```bash
# backend/.env — backend/.env.example 참고
GEMINI_API_KEY=...
ALLOWED_ORIGINS=http://localhost:3000
# SUPABASE_JWT_SECRET=...  (선택, 없으면 JWT 검증 생략)

# frontend/.env.local — frontend/.env.example 참고
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_API_URL=http://localhost:8000
```

터미널 1:

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

터미널 2:

```bash
cd frontend
npm install
npm run dev
```

`http://localhost:3000/signup` → 가입 후 대시보드 접근 확인

## 3. Railway (백엔드)

1. GitHub 저장소 연결
2. **Root Directory**: `backend`
3. **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT` (`railway.toml` 참고)
4. 환경 변수:

| 변수 | 값 |
|------|-----|
| `GEMINI_API_KEY` | Google AI Studio 키 |
| `ALLOWED_ORIGINS` | `https://your-app.vercel.app,http://localhost:3000` |
| `SUPABASE_JWT_SECRET` | Supabase JWT Secret |

5. `/api/recommend`는 2~4분 소요 — Railway 타임아웃 300초 이상 권장

배포 URL 예: `https://my-stock-ai-api.up.railway.app`

## 4. Render (백엔드 대안)

1. Web Service 생성, Root: `backend`
2. Build: `pip install -r requirements.txt`
3. Start: `uvicorn main:app --host 0.0.0.0 --port $PORT` (`Procfile` 참고)
4. 동일 환경 변수 설정

## 5. Vercel (프론트엔드)

1. GitHub 저장소 연결
2. **Root Directory**: `frontend`
3. Framework: Next.js (자동 감지)
4. 환경 변수:

| 변수 | 값 |
|------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
| `NEXT_PUBLIC_API_URL` | Railway/Render 백엔드 URL |

5. 배포 후 Supabase Redirect URL에 `https://your-app.vercel.app/auth/callback` 추가

## 6. 인증 흐름

- 미로그인 → `/login` 리다이렉트 (`middleware.ts`)
- 로그인/회원가입 → Supabase Auth (이메일 + Google)
- API 호출 → `Authorization: Bearer <access_token>` (`lib/api.ts` + `ApiAuthProvider`)
- FastAPI → `SUPABASE_JWT_SECRET`으로 JWT 검증 (`backend/auth.py`)

## 7. 보안 참고

- `.env`, `.env.local`은 Git에 커밋하지 않음
- 프로덕션에서 `SUPABASE_JWT_SECRET` 필수 (미설정 시 API가 공개됨)
- Gemini 무료 한도(일 ~20회) — 추후 사용자별 제한은 Supabase DB로 2차 구현 가능
