"""Supabase JWT 인증.

Supabase는 프로젝트에 따라 두 가지 방식으로 access token에 서명합니다.
- HS256: 공유 비밀키(JWT Secret)로 서명 (레거시)
- ES256/RS256: 비대칭 서명키(JWT Signing Keys) → JWKS 공개키로 검증 (최신)

둘 다 지원하기 위해 토큰 헤더의 alg를 보고 검증 방식을 선택합니다.
"""

import os
from functools import lru_cache
from typing import Any

import jwt
from fastapi import Header, HTTPException
from jwt import PyJWKClient

SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
ALLOW_DEV_AUTH_BYPASS = os.getenv("ALLOW_DEV_AUTH_BYPASS", "").lower() in {
    "1",
    "true",
    "yes",
}

# 비대칭 토큰(ES256/RS256) 검증용 JWKS URL
SUPABASE_JWKS_URL = (
    f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json" if SUPABASE_URL else ""
)

# HS256 또는 JWKS 중 하나라도 구성되면 인증 가능
AUTH_CONFIGURED = bool(SUPABASE_JWT_SECRET or SUPABASE_JWKS_URL)

_ASYMMETRIC_ALGS = {"ES256", "ES384", "ES512", "RS256", "RS384", "RS512"}


@lru_cache(maxsize=1)
def _get_jwks_client() -> PyJWKClient:
    """JWKS 클라이언트(공개키 캐시 포함)를 1회만 생성합니다."""
    return PyJWKClient(SUPABASE_JWKS_URL)


def get_current_user(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    """
    Authorization: Bearer <supabase_access_token> 검증.

    인증 미구성(시크릿/JWKS 모두 없음) 시 ALLOW_DEV_AUTH_BYPASS=true(로컬 전용)이면
    검증을 건너뛰고, 아니면 무인증 개방을 막기 위해 503으로 거부합니다(fail-closed).
    """
    if not AUTH_CONFIGURED:
        if ALLOW_DEV_AUTH_BYPASS:
            return {"sub": "local-dev", "email": "dev@local"}
        raise HTTPException(
            status_code=503,
            detail="서버 인증이 구성되지 않았습니다.",
        )

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")

    token = authorization.removeprefix("Bearer ").strip()
    try:
        alg = jwt.get_unverified_header(token).get("alg", "")

        if alg in _ASYMMETRIC_ALGS:
            if not SUPABASE_JWKS_URL:
                raise HTTPException(
                    status_code=503,
                    detail="서버 인증(JWKS)이 구성되지 않았습니다.",
                )
            signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=[alg],
                audience="authenticated",
            )
        else:
            if not SUPABASE_JWT_SECRET:
                raise HTTPException(
                    status_code=503,
                    detail="서버 인증(JWT Secret)이 구성되지 않았습니다.",
                )
            payload = jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
            )
        return payload
    except HTTPException:
        raise
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=401,
            detail="유효하지 않은 인증 토큰입니다.",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=401,
            detail="인증 토큰 검증에 실패했습니다.",
        ) from exc
