"""Supabase JWT 인증."""

import os
from typing import Any

import jwt
from fastapi import Header, HTTPException

SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")


def get_current_user(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    """
    Authorization: Bearer <supabase_access_token> 검증.
    SUPABASE_JWT_SECRET 미설정 시 로컬 개발용으로 검증을 건너뜁니다.
    """
    if not SUPABASE_JWT_SECRET:
        return {"sub": "local-dev", "email": "dev@local"}

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
