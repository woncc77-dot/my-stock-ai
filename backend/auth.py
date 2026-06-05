"""Supabase JWT 인증."""

import os
from typing import Any

import jwt
from fastapi import Header, HTTPException

SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
ALLOW_DEV_AUTH_BYPASS = os.getenv("ALLOW_DEV_AUTH_BYPASS", "").lower() in {
    "1",
    "true",
    "yes",
}


def get_current_user(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    """
    Authorization: Bearer <supabase_access_token> 검증.

    SUPABASE_JWT_SECRET가 없을 때는 ALLOW_DEV_AUTH_BYPASS=true(로컬 전용)인 경우에만
    검증을 건너뜁니다. 그 외에는 무인증 개방을 막기 위해 503으로 거부합니다(fail-closed).
    """
    if not SUPABASE_JWT_SECRET:
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
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
        return payload
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=401,
            detail="유효하지 않은 인증 토큰입니다.",
        ) from exc
