"""
국내 주식 분석 FastAPI 서버

[실행 방법]
1. GEMINI_API_KEY 변수에 구글 Gemini API 키를 입력합니다.
2. 터미널에서: uvicorn main:app --reload
3. 브라우저에서 http://127.0.0.1:8000/docs 로 API 문서를 확인할 수 있습니다.
"""

import os
from pathlib import Path

# Windows에서 FinanceDataReader(KRX 목록) SSL 인증서 오류 방지
import certifi
from dotenv import load_dotenv

_ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(_ENV_PATH, override=True)  # backend/.env 파일에서 GEMINI_API_KEY 읽기

os.environ.setdefault("SSL_CERT_FILE", certifi.where())
os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())

from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError, as_completed
from datetime import datetime, timedelta
from html import unescape
import json
import re
import ssl
from typing import Any
import urllib.request
import xml.etree.ElementTree as ET

import FinanceDataReader as fdr
import pandas as pd
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from google import genai
from pydantic import BaseModel, Field

from auth import get_current_user

# ──────────────────────────────────────────────
# Gemini API 키: backend/.env 의 GEMINI_API_KEY 사용
# AIzaSy... (구형) 또는 AQ.Ab8... (신형) 모두 지원
# ──────────────────────────────────────────────
GEMINI_TIMEOUT_SEC = 45  # Gemini API 최대 대기 시간(초)

# Gemini에 사용할 모델 이름
GEMINI_MODEL = "gemini-2.5-flash"

# 주가 조회 기간 (일)
STOCK_LOOKBACK_DAYS = 30
# 차트에서 선택 가능한 조회 기간 (일): 30일 / 90일 / 6개월 / 1년
ALLOWED_PRICE_PERIODS = {30, 90, 180, 365}
# 재무지표(PER·PBR·배당수익률) 캐시 (분)
FUNDAMENTALS_CACHE_MINUTES = 30

# 추천 종목 스크리닝 설정
TOP_MARCAP_COUNT = 120       # 시가총액 상위 N개 종목 스크리닝
MAX_RECOMMENDATIONS = 10     # 투자 기법별 추천 종목 수
VOLUME_SURGE_RATIO = 2.0     # 거래량 급증 기준 (200%)
RECENT_VOLUME_DAYS = 3
BASELINE_VOLUME_DAYS = 20
MIN_TRADING_DAYS = RECENT_VOLUME_DAYS + BASELINE_VOLUME_DAYS
RECOMMEND_HISTORY_DAYS = 60  # 기술적 지표 계산용 조회 일수
RECOMMEND_CACHE_MINUTES = 15
NEWS_CACHE_MINUTES = 15
OVERVIEW_CACHE_MINUTES = 5
NAVER_FINANCE_BASE = "https://finance.naver.com"
NAVER_MAIN_NEWS_URL = f"{NAVER_FINANCE_BASE}/news/mainnews.naver"
NAVER_THEME_URL = f"{NAVER_FINANCE_BASE}/sise/theme.naver"
YAHOO_FINANCE_RSS = "https://finance.yahoo.com/news/rssindex"
THEMES_CACHE_MINUTES = 15

MARKET_INDEX_SYMBOLS: list[tuple[str, str, str]] = [
    ("KS11", "KOSPI", "pt"),
    ("KQ11", "KOSDAQ", "pt"),
    ("DJI", "다우", "pt"),
    ("IXIC", "나스닥", "pt"),
    ("US500", "S&P500", "pt"),
    ("USD/KRW", "USD/KRW", "KRW"),
]

# 10가지 투자·매매 기법 (기법당 1종목 선정)
INVESTMENT_STRATEGIES: list[dict[str, str]] = [
    {"id": "volume_surge", "name": "거래량 급증", "category": "수급"},
    {"id": "momentum", "name": "가격 모멘텀", "category": "추세"},
    {"id": "golden_cross", "name": "골든크로스", "category": "이동평균"},
    {"id": "breakout", "name": "신고가 돌파", "category": "돌파"},
    {"id": "rsi_reversal", "name": "RSI 과매도 반등", "category": "역추세"},
    {"id": "macd_bull", "name": "MACD 상승", "category": "오실레이터"},
    {"id": "trend_follow", "name": "추세 추종", "category": "추세"},
    {"id": "bollinger_break", "name": "볼린저 돌파", "category": "변동성"},
    {"id": "relative_strength", "name": "상대강도", "category": "모멘텀"},
    {"id": "ma_reclaim", "name": "MA20 재돌파", "category": "지지·저항"},
]

_gemini_executor = ThreadPoolExecutor(max_workers=2)

# KRX 종목 목록 캐시 (종목명 → 코드 변환용)
_krx_listing_cache: pd.DataFrame | None = None

# Gemini 분석 결과 캐시 (같은 종목·같은 최신 주가면 API 재호출 생략)
_analysis_cache: dict[str, str] = {}

# 멀티 전략 추천 결과 캐시
_recommend_cache: dict[str, Any] | None = None
_recommend_cache_at: datetime | None = None

_market_news_cache: list[dict[str, str]] | None = None
_market_news_cache_at: datetime | None = None

_global_news_cache: list[dict[str, str]] | None = None
_global_news_cache_at: datetime | None = None

_market_overview_cache: dict[str, Any] | None = None
_market_overview_cache_at: datetime | None = None

# 재무지표 캐시 (종목코드 → (지표, 조회시각))
_fundamentals_cache: dict[str, tuple[dict[str, float | None], datetime]] = {}

# 테마별 시세 캐시
_themes_cache: dict[str, Any] | None = None
_themes_cache_at: datetime | None = None


class ChatMessage(BaseModel):
    role: str
    content: str


class StockChatRequest(BaseModel):
    stock_query: str = Field(..., min_length=1)
    messages: list[ChatMessage] = Field(default_factory=list)


# ──────────────────────────────────────────────
# FastAPI 앱 생성 및 CORS 설정
# CORS = Cross-Origin Resource Sharing
# 웹 브라우저에서 다른 도메인(예: React 프론트엔드)이 이 API를 호출할 수 있게 해줍니다.
# ──────────────────────────────────────────────
app = FastAPI(
    title="국내 주식 분석 API",
    description="FinanceDataReader + Google Gemini 기반 국내 주식 분석 서버",
    version="1.0.0",
)

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _warm_krx_listing_cache() -> None:
    """자동완성·종목명 검색 첫 요청 지연을 줄이기 위해 목록을 미리 로드합니다."""
    try:
        _get_krx_listing()
    except HTTPException:
        pass


def _clean_api_key(raw: str) -> str:
    """'.env'에 실수로 붙은 안내 문구·따옴표 등을 제거합니다."""
    key = raw.strip().strip('"').strip("'")
    for junk in ("여기에_키_입력", "GEMINI_API_KEY=", "GEMINI_API_KEY = "):
        key = key.replace(junk, "")
    return key.strip()


def _get_api_key() -> str:
    """매 요청마다 .env에서 최신 API 키를 읽습니다."""
    load_dotenv(_ENV_PATH, override=True)
    key = _clean_api_key(os.getenv("GEMINI_API_KEY", ""))
    if key:
        return key

    # dotenv가 실패할 경우 .env 파일을 직접 읽기 (Windows 환경 대비)
    if _ENV_PATH.exists():
        for line in _ENV_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("GEMINI_API_KEY="):
                return _clean_api_key(line.split("=", 1)[1])
    return ""


def _get_gemini_client() -> genai.Client:
    """
    Gemini API 클라이언트를 만들고, API 키가 비어 있으면 친절한 에러를 반환합니다.
    """
    key = _get_api_key()

    if not key:
        raise HTTPException(
            status_code=500,
            detail=(
                "GEMINI_API_KEY가 설정되지 않았습니다. "
                "backend/.env 파일을 만들고 다음 한 줄을 입력해 주세요:\n"
                "GEMINI_API_KEY=AIzaSy...(발급받은 키)\n"
                "발급: https://aistudio.google.com/apikey"
            ),
        )

    if "여기에_키_입력" in key or key == "여기에_키_입력":
        raise HTTPException(
            status_code=500,
            detail="'.env' 파일에서 '여기에_키_입력'을 지우고 실제 API 키만 넣어 주세요.",
        )

    if not (key.startswith("AIza") or key.startswith("AQ.")):
        raise HTTPException(
            status_code=500,
            detail=(
                "API 키 형식이 올바르지 않습니다. "
                "AIzaSy... 또는 AQ.Ab8... 형식의 키를 "
                "backend/.env 파일에 GEMINI_API_KEY=키 형태로 입력해 주세요."
            ),
        )

    return genai.Client(api_key=key)


def _get_krx_listing() -> pd.DataFrame:
    """KRX 전체 종목 목록을 캐시해 반환합니다."""
    global _krx_listing_cache
    if _krx_listing_cache is None:
        try:
            _krx_listing_cache = fdr.StockListing("KRX")
            _krx_listing_cache = _krx_listing_cache.copy()
            _krx_listing_cache["Code"] = _krx_listing_cache["Code"].astype(str).str.zfill(6)
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"KRX 종목 목록을 불러오는 중 오류가 발생했습니다: {exc}",
            ) from exc
    return _krx_listing_cache


def _resolve_stock_query(raw_query: str) -> tuple[str, str]:
    """
    종목코드·종목명·둘 다 입력된 문자열을 (코드, 종목명)으로 변환합니다.

    지원 예:
      - 005930
      - 삼성전자
      - 005930 삼성전자
      - 삼성전자 005930
    """
    query = raw_query.strip()
    if not query:
        raise HTTPException(
            status_code=400,
            detail="종목코드 또는 종목명을 입력해 주세요.",
        )

    code_match = re.search(r"\d{4,6}", query)
    code_from_input = code_match.group(0).zfill(6) if code_match else None
    name_part = re.sub(r"\d+", " ", query).strip()
    name_part = re.sub(r"\s+", " ", name_part)

    listing = _get_krx_listing()

    if code_from_input:
        matched = listing[listing["Code"] == code_from_input]
        if matched.empty:
            raise HTTPException(
                status_code=404,
                detail=f"종목코드 '{code_from_input}'를 찾을 수 없습니다.",
            )
        official_name = str(matched.iloc[0]["Name"])
        if name_part and name_part not in official_name and official_name not in name_part:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"입력하신 코드({code_from_input})와 종목명({name_part})이 "
                    f"일치하지 않습니다. 실제 종목명: {official_name}"
                ),
            )
        return code_from_input, official_name

    if name_part:
        exact = listing[listing["Name"] == name_part]
        if not exact.empty:
            row = exact.iloc[0]
            return str(row["Code"]).zfill(6), str(row["Name"])

        partial = listing[listing["Name"].str.contains(name_part, case=False, na=False)]
        if partial.empty:
            raise HTTPException(
                status_code=404,
                detail=f"'{name_part}' 종목을 찾을 수 없습니다.",
            )
        if len(partial) > 1:
            suggestions = ", ".join(
                f"{r['Name']}({r['Code']})" for _, r in partial.head(5).iterrows()
            )
            raise HTTPException(
                status_code=400,
                detail=f"여러 종목이 검색되었습니다. 종목코드를 함께 입력해 주세요: {suggestions}",
            )
        row = partial.iloc[0]
        return str(row["Code"]).zfill(6), str(row["Name"])

    raise HTTPException(
        status_code=400,
        detail="종목코드(숫자) 또는 종목명을 입력해 주세요. 예: 005930, 삼성전자, 005930 삼성전자",
    )


def _search_stock_suggestions(raw_query: str, limit: int = 8) -> list[dict[str, str]]:
    """입력 중인 종목명·코드와 유사한 종목 목록을 반환합니다."""
    query = raw_query.strip()
    if not query:
        return []

    listing = _get_krx_listing()
    df = listing[["Code", "Name", "Marcap"]].copy()
    df["Code"] = df["Code"].astype(str).str.zfill(6)
    df["Name"] = df["Name"].astype(str)
    df["Marcap"] = pd.to_numeric(df["Marcap"], errors="coerce").fillna(0)
    name_lower = df["Name"].str.lower()

    q_lower = query.lower()
    escaped = re.escape(query)
    mask = name_lower.str.contains(escaped, case=False, na=False, regex=True)
    if query.isdigit():
        mask = mask | df["Code"].str.startswith(query)

    matched = df.loc[mask].copy()
    if matched.empty:
        return []

    matched["_exact"] = matched["Name"] == query
    matched["_prefix"] = name_lower.loc[matched.index].str.startswith(q_lower, na=False)
    matched = matched.sort_values(
        by=["_exact", "_prefix", "Marcap"],
        ascending=[False, False, False],
    )

    return [
        {"code": str(row["Code"]), "name": str(row["Name"])}
        for _, row in matched.head(limit).iterrows()
    ]


def _normalize_stock_code(stock_code: str) -> str:
    """
    종목코드를 6자리 문자열로 정리합니다.
    예) '5930' → '005930', '005930' → '005930'
    """
    code = stock_code.strip()
    if not code.isdigit():
        raise HTTPException(
            status_code=400,
            detail=f"종목코드는 숫자만 입력해 주세요. (입력값: {stock_code})",
        )
    if len(code) > 6:
        raise HTTPException(
            status_code=400,
            detail=f"종목코드는 6자리 이하여야 합니다. (입력값: {stock_code})",
        )
    return code.zfill(6)


def _fetch_stock_prices(stock_code: str, days: int = STOCK_LOOKBACK_DAYS) -> pd.DataFrame:
    """
    FinanceDataReader로 국내 종목의 일별 주가(시가·고가·저가·종가·거래량)를 가져옵니다.
    KRX 실시간 시세로 오늘(또는 최신 거래일) 데이터를 보정·반영합니다.

    Returns:
        Date 인덱스를 가진 pandas DataFrame
    """
    end_date = datetime.today()
    # 주말·공휴일 버퍼를 둬서 요청한 달력 기간을 충분히 덮도록 조회합니다.
    start_date = end_date - timedelta(days=days + 14)

    try:
        df = fdr.DataReader(
            stock_code,
            start_date.strftime("%Y-%m-%d"),
            end_date.strftime("%Y-%m-%d"),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"주가 데이터를 불러오는 중 오류가 발생했습니다: {exc}",
        ) from exc

    if df is None or df.empty:
        raise HTTPException(
            status_code=404,
            detail=f"종목코드 '{stock_code}'의 주가 데이터를 찾을 수 없습니다. 코드를 확인해 주세요.",
        )

    df = _merge_today_krx_price(stock_code, df)

    # 요청한 달력 기간(days) 안의 거래일만 남깁니다.
    cutoff = pd.Timestamp((end_date - timedelta(days=days)).date())
    filtered = df[df.index >= cutoff]
    return filtered if not filtered.empty else df.tail(1)


def _get_krx_row(stock_code: str) -> pd.Series | None:
    """KRX 목록에서 종목 한 줄을 반환합니다."""
    listing = _get_krx_listing()
    matched = listing[listing["Code"].astype(str).str.zfill(6) == stock_code]
    if matched.empty:
        return None
    return matched.iloc[0]


def _merge_today_krx_price(stock_code: str, df: pd.DataFrame) -> pd.DataFrame:
    """KRX 최신 시세로 오늘 주가를 차트 데이터에 반영합니다."""
    row = _get_krx_row(stock_code)
    if row is None:
        return df

    close = float(row.get("Close") or 0)
    if close <= 0:
        return df

    open_p = float(row.get("Open") or close)
    high_p = float(row.get("High") or close)
    low_p = float(row.get("Low") or close)
    volume = int(row.get("Volume") or 0)

    today = datetime.today().date()
    today_ts = pd.Timestamp(today)
    df = df.copy()

    if len(df) == 0:
        return pd.DataFrame(
            {"Open": [open_p], "High": [high_p], "Low": [low_p], "Close": [close], "Volume": [volume]},
            index=[today_ts],
        )

    last_ts = pd.Timestamp(df.index[-1].date())

    if last_ts == today_ts:
        last_idx = df.index[-1]
        for col_name, val in (
            ("Open", open_p),
            ("High", high_p),
            ("Low", low_p),
            ("Close", close),
            ("Volume", volume),
        ):
            if col_name in df.columns:
                df.at[last_idx, col_name] = val
            lower = col_name.lower()
            if lower in df.columns:
                df.at[last_idx, lower] = val
    elif last_ts < today_ts and today.weekday() < 5:
        today_row = pd.DataFrame(
            {
                "Open": [open_p],
                "High": [high_p],
                "Low": [low_p],
                "Close": [close],
                "Volume": [volume],
            },
            index=[today_ts],
        )
        df = pd.concat([df, today_row])
        df = df[~df.index.duplicated(keep="last")].sort_index()

    return df


def _build_today_quote(stock_code: str, df: pd.DataFrame) -> dict[str, Any] | None:
    """오늘(또는 최신) 주가 요약을 JSON으로 반환합니다."""
    if df.empty:
        return None

    close_col = "Close" if "Close" in df.columns else "close"
    vol_col = "Volume" if "Volume" in df.columns else "volume"
    last = df.iloc[-1]
    last_date = df.index[-1].date()
    today = datetime.today().date()

    close = float(last[close_col])
    change: float | None = None
    change_pct: float | None = None

    if len(df) >= 2:
        prev_close = float(df.iloc[-2][close_col])
        change = close - prev_close
        change_pct = (change / prev_close * 100) if prev_close else None

    row = _get_krx_row(stock_code)
    if row is not None:
        try:
            krx_change = row.get("Changes")
            krx_ratio = row.get("ChagesRatio")
            if krx_change is not None and not pd.isna(krx_change):
                change = float(krx_change)
            if krx_ratio is not None and not pd.isna(krx_ratio):
                change_pct = float(krx_ratio)
        except (TypeError, ValueError):
            pass

    return {
        "date": last_date.strftime("%Y-%m-%d"),
        "open": float(last.get("Open", last.get("open", close))),
        "high": float(last.get("High", last.get("high", close))),
        "low": float(last.get("Low", last.get("low", close))),
        "close": close,
        "volume": int(last[vol_col]),
        "change": change,
        "change_pct": change_pct,
        "is_today": last_date == today,
    }


_NAVER_MINUTE_ROW = re.compile(
    r'\["(\d{12})",\s*(?:null|\d+),\s*(?:null|\d+),\s*(?:null|\d+),\s*(\d+),\s*(\d+)'
)


def _fetch_today_intraday(stock_code: str) -> dict[str, Any] | None:
    """네이버 금융 분봉으로 오늘(또는 최신 거래일) 장중 가격 흐름을 가져옵니다."""
    today = datetime.today().date()
    today_key = today.strftime("%Y%m%d")

    url = (
        "https://fchart.stock.naver.com/siseJson.nhn"
        f"?symbol={stock_code}&requestType=0&count=500&timeframe=minute"
    )
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            text = resp.read().decode("utf-8", errors="replace")
    except Exception:
        return None

    raw_rows = _NAVER_MINUTE_ROW.findall(text)
    if not raw_rows:
        return None

    # 최신 거래일(오늘 또는 직전 영업일) 데이터만 사용
    latest_date_key = max(row[0][:8] for row in raw_rows)
    session_rows = [
        (dt, int(price), int(cum_volume))
        for dt, price, cum_volume in raw_rows
        if dt.startswith(latest_date_key) and "0900" <= dt[8:12] <= "1530"
    ]
    if not session_rows:
        return None

    session_rows.sort(key=lambda x: x[0])
    points: list[dict[str, Any]] = []
    prev_cum = 0
    for dt, price, cum_volume in session_rows:
        minute_volume = max(0, cum_volume - prev_cum) if prev_cum else cum_volume
        prev_cum = cum_volume
        hh, mm = dt[8:10], dt[10:12]
        points.append(
            {
                "time": f"{hh}:{mm}",
                "price": price,
                "volume": minute_volume,
            }
        )

    prices = [p["price"] for p in points]
    session_open = prices[0]
    session_high = max(prices)
    session_low = min(prices)
    session_close = prices[-1]
    change: float | None = None
    change_pct: float | None = None

    krx_row = _get_krx_row(stock_code)
    if krx_row is not None:
        krx_open = float(krx_row.get("Open") or 0)
        krx_high = float(krx_row.get("High") or 0)
        krx_low = float(krx_row.get("Low") or 0)
        krx_close = float(krx_row.get("Close") or 0)
        if krx_open > 0:
            session_open = krx_open
        if krx_high > 0:
            session_high = max(session_high, krx_high)
        if krx_low > 0:
            session_low = min(session_low, krx_low)
        if krx_close > 0:
            session_close = krx_close
        try:
            if krx_row.get("Changes") is not None and not pd.isna(krx_row.get("Changes")):
                change = float(krx_row.get("Changes"))
            if krx_row.get("ChagesRatio") is not None and not pd.isna(krx_row.get("ChagesRatio")):
                change_pct = float(krx_row.get("ChagesRatio"))
        except (TypeError, ValueError):
            pass

    display_date = datetime.strptime(latest_date_key, "%Y%m%d").strftime("%Y-%m-%d")

    return {
        "date": display_date,
        "points": points,
        "open": session_open,
        "high": session_high,
        "low": session_low,
        "close": session_close,
        "change": change,
        "change_pct": change_pct,
        "is_today": latest_date_key == today_key,
    }


def _format_price_data_for_ai(stock_code: str, df: pd.DataFrame, stock_name: str = "") -> str:
    """
    주가 DataFrame을 Gemini가 읽기 쉬운 텍스트 표 형태로 변환합니다.
    """
    name_line = f"종목명: {stock_name}" if stock_name else ""
    lines = [
        f"종목코드: {stock_code}",
        *([name_line] if name_line else []),
        f"데이터 기간: {df.index[0].strftime('%Y-%m-%d')} ~ {df.index[-1].strftime('%Y-%m-%d')}",
        f"총 {len(df)}거래일",
        "",
        "날짜       |   시가   |   고가   |   저가   |   종가   |    거래량",
        "-" * 65,
    ]

    for date, row in df.iterrows():
        date_str = date.strftime("%Y-%m-%d")
        open_p = row.get("Open", row.get("open", 0))
        high_p = row.get("High", row.get("high", 0))
        low_p = row.get("Low", row.get("low", 0))
        close_p = row.get("Close", row.get("close", 0))
        volume = row.get("Volume", row.get("volume", 0))
        lines.append(
            f"{date_str} | {open_p:>8,.0f} | {high_p:>8,.0f} | {low_p:>8,.0f} | {close_p:>8,.0f} | {volume:>12,.0f}"
        )

    # 간단한 통계도 함께 제공하면 AI 분석 품질이 좋아집니다.
    close_col = "Close" if "Close" in df.columns else "close"
    vol_col = "Volume" if "Volume" in df.columns else "volume"

    first_close = df[close_col].iloc[0]
    last_close = df[close_col].iloc[-1]
    change_pct = ((last_close - first_close) / first_close) * 100 if first_close else 0

    lines += [
        "",
        "[요약 통계]",
        f"  기간 시작 종가: {first_close:,.0f}원",
        f"  기간 마지막 종가: {last_close:,.0f}원",
        f"  기간 등락률: {change_pct:+.2f}%",
        f"  기간 최고가: {df[close_col].max():,.0f}원",
        f"  기간 최저가: {df[close_col].min():,.0f}원",
        f"  평균 거래량: {df[vol_col].mean():,.0f}주",
    ]

    return "\n".join(lines)


def _df_to_price_history(df: pd.DataFrame) -> list[dict[str, Any]]:
    """프론트엔드 차트용 일별 주가 데이터를 JSON 리스트로 변환합니다."""
    close_col = "Close" if "Close" in df.columns else "close"
    vol_col = "Volume" if "Volume" in df.columns else "volume"

    history: list[dict[str, Any]] = []
    for date, row in df.iterrows():
        history.append(
            {
                "date": date.strftime("%Y-%m-%d"),
                "open": float(row.get("Open", row.get("open", 0))),
                "high": float(row.get("High", row.get("high", 0))),
                "low": float(row.get("Low", row.get("low", 0))),
                "close": float(row[close_col]),
                "volume": int(row[vol_col]),
            }
        )
    return history


def _period_high_low(df: pd.DataFrame) -> tuple[float | None, float | None]:
    """기간 내 최고가(High 최대)·최저가(Low 최소)를 반환합니다."""
    if df.empty:
        return None, None
    high_col = "High" if "High" in df.columns else "high"
    low_col = "Low" if "Low" in df.columns else "low"
    try:
        return float(df[high_col].max()), float(df[low_col].min())
    except (KeyError, ValueError, TypeError):
        return None, None


def _fundamental_to_float(value: Any) -> float | None:
    """'26.59배', '0.51%', '4,580' 같은 문자열을 float으로 변환합니다."""
    if value is None:
        return None
    text = str(value).replace(",", "").replace("%", "").replace("배", "").strip()
    try:
        return float(text)
    except ValueError:
        return None


def _fetch_stock_fundamentals(stock_code: str) -> dict[str, float | None]:
    """네이버 금융에서 PER·PBR·배당수익률을 가져옵니다 (실패 시 None)."""
    now = datetime.now()
    cached = _fundamentals_cache.get(stock_code)
    if cached and now - cached[1] < timedelta(minutes=FUNDAMENTALS_CACHE_MINUTES):
        return cached[0]

    result: dict[str, float | None] = {"per": None, "pbr": None, "dividend_yield": None}
    try:
        url = f"https://m.stock.naver.com/api/stock/{stock_code}/integration"
        raw = _fetch_url_bytes(url, timeout=8)
        data = json.loads(raw)
        for item in data.get("totalInfos") or []:
            code = str(item.get("code", "")).strip()
            if code == "per":
                result["per"] = _fundamental_to_float(item.get("value"))
            elif code == "pbr":
                result["pbr"] = _fundamental_to_float(item.get("value"))
            elif code == "dividendYieldRatio":
                result["dividend_yield"] = _fundamental_to_float(item.get("value"))
    except Exception:
        return result

    _fundamentals_cache[stock_code] = (result, now)
    return result


def _normalize_period_days(days: int) -> int:
    """허용된 조회 기간(30/90/180/365)으로 정규화합니다."""
    return days if days in ALLOWED_PRICE_PERIODS else STOCK_LOOKBACK_DAYS


def _analysis_cache_key(code: str, price_df: pd.DataFrame) -> str:
    """종목코드 + 최신 거래일 + 종가 기준 캐시 키."""
    close_col = "Close" if "Close" in price_df.columns else "close"
    last_date = price_df.index[-1].strftime("%Y-%m-%d")
    last_close = float(price_df[close_col].iloc[-1])
    return f"{code}:{last_date}:{last_close:.0f}"


def _call_gemini_api(prompt: str) -> str:
    """Gemini API 호출 (별도 스레드에서 실행해 타임아웃 적용)."""
    client = _get_gemini_client()
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
    )
    analysis_text = getattr(response, "text", None)
    if not analysis_text:
        raise RuntimeError("Gemini API가 빈 응답을 반환했습니다.")
    return analysis_text.strip()


def _ask_gemini_for_analysis(price_text: str) -> str:
    """
    가공된 주가 텍스트를 Gemini API에 보내고, 한국어 분석 결과를 받아옵니다.
    """
    prompt = _analysis_prompt(price_text)

    try:
        future = _gemini_executor.submit(_call_gemini_api, prompt)
        return future.result(timeout=GEMINI_TIMEOUT_SEC)
    except FuturesTimeoutError as exc:
        raise HTTPException(
            status_code=504,
            detail=f"Gemini API 응답 시간 초과({GEMINI_TIMEOUT_SEC}초). 잠시 후 다시 시도해 주세요.",
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        err_msg = str(exc)
        if "401" in err_msg or "UNAUTHENTICATED" in err_msg:
            raise HTTPException(
                status_code=401,
                detail=(
                    "Gemini API 키가 올바르지 않습니다. "
                    "backend/.env 파일에 AIzaSy... 형식의 키를 입력해 주세요. "
                    "발급: https://aistudio.google.com/apikey"
                ),
            ) from exc
        if (
            "429" in err_msg
            or "RESOURCE_EXHAUSTED" in err_msg
            or "quota" in err_msg.lower()
        ):
            raise HTTPException(
                status_code=429,
                detail=(
                    "Gemini API 무료 사용량(하루 약 20회)을 초과했습니다. "
                    "10~60분 후 다시 시도하거나 Google AI Studio에서 "
                    "요금제·API 키 사용량을 확인해 주세요. "
                    "(https://aistudio.google.com/apikey)"
                ),
            ) from exc
        raise HTTPException(
            status_code=502,
            detail=f"Gemini API 호출 중 오류가 발생했습니다: {exc}",
        ) from exc


def _get_volume_column(df: pd.DataFrame) -> str:
    """DataFrame에서 거래량 컬럼 이름을 찾습니다 (Open/Close 대소문자 차이 대응)."""
    for col in ("Volume", "volume"):
        if col in df.columns:
            return col
    raise ValueError("거래량(Volume) 컬럼을 찾을 수 없습니다.")


def _calc_volume_surge_ratio(df: pd.DataFrame) -> float | None:
    """
    최근 3일 평균 거래량 ÷ 그 이전 20일 평균 거래량 비율을 계산합니다.

    예) 비율 2.5 → 최근 거래량이 과거 평균의 250% (= 150% 증가)
    데이터가 부족하면 None을 반환합니다.
    """
    if len(df) < MIN_TRADING_DAYS:
        return None

    vol_col = _get_volume_column(df)
    volumes = df[vol_col]

    # 마지막 3일 = 최근, 그 앞 20일 = 비교 기준
    recent_avg = volumes.iloc[-RECENT_VOLUME_DAYS:].mean()
    baseline_avg = volumes.iloc[-(RECENT_VOLUME_DAYS + BASELINE_VOLUME_DAYS):-RECENT_VOLUME_DAYS].mean()

    if baseline_avg <= 0:
        return None

    return float(recent_avg / baseline_avg)


def _calc_rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(period).mean()
    loss = (-delta.clip(upper=0)).rolling(period).mean()
    rs = gain / loss.replace(0, pd.NA)
    return 100 - (100 / (1 + rs))


def _calc_macd(close: pd.Series) -> tuple[pd.Series, pd.Series, pd.Series]:
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26
    signal = macd.ewm(span=9, adjust=False).mean()
    return macd, signal, macd - signal


def _compute_stock_indicators(df: pd.DataFrame) -> dict[str, Any] | None:
    """OHLCV DataFrame에서 기술적 지표를 계산합니다."""
    if len(df) < MIN_TRADING_DAYS:
        return None

    close_col = "Close" if "Close" in df.columns else "close"
    high_col = "High" if "High" in df.columns else "high"
    close = df[close_col].astype(float)
    high = df[high_col].astype(float)

    ma5 = close.rolling(5).mean()
    ma20 = close.rolling(20).mean()
    ma60 = close.rolling(min(60, len(close))).mean()
    rsi = _calc_rsi(close, 14)
    macd, signal, hist = _calc_macd(close)
    std20 = close.rolling(20).std()
    upper_band = ma20 + 2 * std20
    lower_band = ma20 - 2 * std20
    bandwidth = (upper_band - lower_band) / ma20.replace(0, pd.NA)

    last = close.iloc[-1]
    prev = close.iloc[-2]
    ret_5d = (last / close.iloc[-6] - 1) * 100 if len(close) >= 6 else 0.0
    ret_20d = (last / close.iloc[-21] - 1) * 100 if len(close) >= 21 else 0.0
    high_20d = high.iloc[-20:].max()

    vol_ratio = _calc_volume_surge_ratio(df)

    return {
        "close": float(last),
        "prev_close": float(prev),
        "ma5": float(ma5.iloc[-1]),
        "ma20": float(ma20.iloc[-1]),
        "ma60": float(ma60.iloc[-1]),
        "ma5_prev": float(ma5.iloc[-2]),
        "ma20_prev": float(ma20.iloc[-2]),
        "rsi": float(rsi.iloc[-1]) if not pd.isna(rsi.iloc[-1]) else 50.0,
        "rsi_prev": float(rsi.iloc[-2]) if not pd.isna(rsi.iloc[-2]) else 50.0,
        "macd": float(macd.iloc[-1]),
        "macd_signal": float(signal.iloc[-1]),
        "macd_hist": float(hist.iloc[-1]),
        "macd_hist_prev": float(hist.iloc[-2]),
        "upper_band": float(upper_band.iloc[-1]),
        "bandwidth": float(bandwidth.iloc[-1]) if not pd.isna(bandwidth.iloc[-1]) else 0.0,
        "bandwidth_prev": float(bandwidth.iloc[-5]) if len(bandwidth) >= 5 else 0.0,
        "ret_5d": float(ret_5d),
        "ret_20d": float(ret_20d),
        "high_20d": float(high_20d),
        "volume_ratio": float(vol_ratio) if vol_ratio else 0.0,
        "golden_cross_recent": bool(
            ma5.iloc[-1] > ma20.iloc[-1]
            and ma5.iloc[-2] <= ma20.iloc[-2]
        ),
        "ma20_reclaim": bool(prev < ma20.iloc[-2] and last >= ma20.iloc[-1]),
    }


def _score_investment_strategies(ind: dict[str, Any]) -> dict[str, tuple[float, str]]:
    """10가지 투자 기법별 점수(0~100)와 근거를 반환합니다."""
    scores: dict[str, tuple[float, str]] = {}

    vr = ind["volume_ratio"]
    if vr >= VOLUME_SURGE_RATIO:
        scores["volume_surge"] = (
            min(100.0, vr / 3 * 100),
            f"최근 {RECENT_VOLUME_DAYS}일 평균 거래량이 "
            f"이전 {BASELINE_VOLUME_DAYS}일 대비 {vr:.0%} 수준",
        )

    if ind["ret_20d"] > 0:
        scores["momentum"] = (
            min(100.0, max(40.0, 50 + ind["ret_20d"] * 2)),
            f"20일 수익률 {ind['ret_20d']:+.1f}% — 단기 상승 모멘텀",
        )

    if ind["golden_cross_recent"] or (ind["ma5"] > ind["ma20"] and ind["ma5_prev"] <= ind["ma20_prev"]):
        scores["golden_cross"] = (
            88.0,
            f"5일선({ind['ma5']:,.0f})이 20일선({ind['ma20']:,.0f}) 상향 돌파",
        )

    if ind["close"] >= ind["high_20d"] * 0.998:
        scores["breakout"] = (
            min(100.0, 75 + ind["ret_5d"]),
            f"20거래일 신고가 {ind['high_20d']:,.0f}원 부근 돌파",
        )

    if ind["rsi_prev"] < 38 and ind["rsi"] > ind["rsi_prev"] + 2:
        scores["rsi_reversal"] = (
            min(100.0, 60 + (38 - ind["rsi_prev"]) * 2),
            f"RSI {ind['rsi_prev']:.0f}→{ind['rsi']:.0f} 과매도 구간 반등",
        )

    if ind["macd"] > ind["macd_signal"] and ind["macd_hist"] > ind["macd_hist_prev"]:
        scores["macd_bull"] = (
            82.0,
            "MACD가 시그널선 위, 히스토그램 확대 — 매수 모멘텀",
        )

    if ind["close"] > ind["ma20"] > ind["ma60"]:
        spread = (ind["ma20"] - ind["ma60"]) / ind["ma60"] * 100 if ind["ma60"] else 0
        scores["trend_follow"] = (
            min(100.0, 70 + spread),
            f"종가>MA20>MA60 정배열 추세 (MA 간격 {spread:.1f}%)",
        )

    if ind["close"] > ind["upper_band"] and ind["bandwidth_prev"] < 0.12:
        scores["bollinger_break"] = (
            85.0,
            "볼린저 밴드 수축 후 상단 돌파 — 변동성 확대",
        )

    if ind["ret_20d"] > 3 and ind["volume_ratio"] >= 1.2:
        scores["relative_strength"] = (
            min(100.0, 55 + ind["ret_20d"] * 1.5),
            f"20일 +{ind['ret_20d']:.1f}% & 거래량 {ind['volume_ratio']:.1f}배 — 대형주 대비 강세",
        )

    if ind["ma20_reclaim"]:
        scores["ma_reclaim"] = (
            80.0,
            f"20일선({ind['ma20']:,.0f}) 재돌파 — 지지선 회복",
        )

    return scores


def _fetch_recommend_price_df(code: str, start: str, end: str) -> pd.DataFrame | None:
    try:
        df = fdr.DataReader(code, start, end)
        if df is None or df.empty:
            return None
        return df
    except Exception:
        return None


def _screen_single_stock(
    code: str,
    name: str,
    marcap: float,
    start: str,
    end: str,
) -> dict[str, Any] | None:
    df = _fetch_recommend_price_df(code, start, end)
    if df is None:
        return None

    indicators = _compute_stock_indicators(df)
    if indicators is None:
        return None

    strategy_scores = _score_investment_strategies(indicators)
    if not strategy_scores:
        return None

    vol_col = _get_volume_column(df)
    volumes = df[vol_col]

    return {
        "code": code,
        "name": name,
        "marcap": marcap,
        "indicators": indicators,
        "strategy_scores": strategy_scores,
        "avg_volume_recent_3d": int(volumes.iloc[-RECENT_VOLUME_DAYS:].mean()),
        "avg_volume_baseline_20d": int(
            volumes.iloc[-(RECENT_VOLUME_DAYS + BASELINE_VOLUME_DAYS):-RECENT_VOLUME_DAYS].mean()
        ),
    }


def _pick_strategy_winners(screened: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """기법별 최고 점수 종목을 골라 10개 추천 리스트를 만듭니다."""
    used_codes: set[str] = set()
    recommendations: list[dict[str, Any]] = []

    for strategy in INVESTMENT_STRATEGIES:
        sid = strategy["id"]
        best: dict[str, Any] | None = None
        best_score = -1.0

        for stock in screened:
            if stock["code"] in used_codes:
                continue
            scored = stock["strategy_scores"].get(sid)
            if not scored:
                continue
            score, reason = scored
            if score > best_score:
                best_score = score
                best = {**stock, "pick_score": score, "pick_reason": reason}

        if best is None:
            continue

        used_codes.add(best["code"])
        ind = best["indicators"]
        recommendations.append(
            {
                "code": best["code"],
                "name": best["name"],
                "marcap": best["marcap"],
                "strategy_id": sid,
                "strategy_name": strategy["name"],
                "strategy_category": strategy["category"],
                "score": round(best["pick_score"], 1),
                "volume_ratio": round(ind["volume_ratio"], 2),
                "return_20d_pct": round(ind["ret_20d"], 2),
                "rsi_14": round(ind["rsi"], 1),
                "avg_volume_recent_3d": best["avg_volume_recent_3d"],
                "avg_volume_baseline_20d": best["avg_volume_baseline_20d"],
                "reason": best["pick_reason"],
            }
        )

    return recommendations


def _find_expert_recommendations() -> list[dict[str, Any]]:
    """
    시가총액 상위 종목을 10가지 투자 기법으로 스크리닝해 기법당 1종목씩 추천합니다.
    """
    global _recommend_cache, _recommend_cache_at

    if (
        _recommend_cache is not None
        and _recommend_cache_at is not None
        and datetime.now() - _recommend_cache_at < timedelta(minutes=RECOMMEND_CACHE_MINUTES)
    ):
        return _recommend_cache["recommendations"]

    listing = _get_krx_listing()
    universe = listing.sort_values("Marcap", ascending=False).head(TOP_MARCAP_COUNT)

    end_date = datetime.today()
    start_date = end_date - timedelta(days=RECOMMEND_HISTORY_DAYS)
    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")

    screened: list[dict[str, Any]] = []
    tasks: list[tuple[str, str, float]] = [
        (str(row["Code"]).zfill(6), str(row.get("Name", "")), float(row.get("Marcap", 0)))
        for _, row in universe.iterrows()
    ]

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {
            pool.submit(_screen_single_stock, code, name, marcap, start_str, end_str): code
            for code, name, marcap in tasks
        }
        for future in as_completed(futures):
            try:
                result = future.result()
                if result:
                    screened.append(result)
            except Exception:
                continue

    recommendations = _pick_strategy_winners(screened)

    # 기법 조건을 만족하는 종목이 10개 미만이면 종합 점수 상위로 보충
    if len(recommendations) < MAX_RECOMMENDATIONS:
        used = {r["code"] for r in recommendations}
        composite: list[tuple[float, dict[str, Any]]] = []
        for stock in screened:
            if stock["code"] in used:
                continue
            total = sum(s[0] for s in stock["strategy_scores"].values())
            composite.append((total, stock))
        composite.sort(key=lambda x: x[0], reverse=True)

        for total, stock in composite:
            if len(recommendations) >= MAX_RECOMMENDATIONS:
                break
            ind = stock["indicators"]
            top_sid = max(stock["strategy_scores"], key=lambda k: stock["strategy_scores"][k][0])
            top_strategy = next(s for s in INVESTMENT_STRATEGIES if s["id"] == top_sid)
            _, reason = stock["strategy_scores"][top_sid]
            recommendations.append(
                {
                    "code": stock["code"],
                    "name": stock["name"],
                    "marcap": stock["marcap"],
                    "strategy_id": top_sid,
                    "strategy_name": top_strategy["name"],
                    "strategy_category": top_strategy["category"],
                    "score": round(total / max(len(stock["strategy_scores"]), 1), 1),
                    "volume_ratio": round(ind["volume_ratio"], 2),
                    "return_20d_pct": round(ind["ret_20d"], 2),
                    "rsi_14": round(ind["rsi"], 1),
                    "avg_volume_recent_3d": stock["avg_volume_recent_3d"],
                    "avg_volume_baseline_20d": stock["avg_volume_baseline_20d"],
                    "reason": reason,
                }
            )
            used.add(stock["code"])

    _recommend_cache = {"recommendations": recommendations}
    _recommend_cache_at = datetime.now()
    return recommendations


def _find_volume_surge_stocks() -> list[dict[str, Any]]:
    """하위 호환 — 멀티 전략 추천으로 위임."""
    return _find_expert_recommendations()


def _fetch_naver_finance_html(url: str) -> str:
    """네이버 금융 HTML 페이지를 가져옵니다."""
    ctx = ssl.create_default_context(cafile=certifi.where())
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
        return resp.read().decode("euc-kr", errors="replace")


def _clean_news_text(raw: str) -> str:
    text = unescape(raw)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _fetch_market_news(limit: int = 10) -> tuple[list[dict[str, str]], bool]:
    """
    네이버 금융 주요 뉴스 목록을 파싱합니다.
    Returns: (items, served_from_cache)
    """
    global _market_news_cache, _market_news_cache_at

    if (
        _market_news_cache is not None
        and _market_news_cache_at is not None
        and datetime.now() - _market_news_cache_at < timedelta(minutes=NEWS_CACHE_MINUTES)
    ):
        return _market_news_cache[:limit], True

    try:
        html_text = _fetch_naver_finance_html(NAVER_MAIN_NEWS_URL)
    except Exception:
        if _market_news_cache:
            return _market_news_cache[:limit], True
        return [], False

    items: list[dict[str, str]] = []
    for part in html_text.split('<dd class="articleSubject"')[1:]:
        link_match = re.search(r'<a href="([^"]+)"[^>]*>([^<]+)</a>', part)
        if not link_match:
            continue

        href = link_match.group(1).strip()
        title = _clean_news_text(link_match.group(2))
        if not title:
            continue

        url_full = href if href.startswith("http") else f"{NAVER_FINANCE_BASE}{href}"
        press_match = re.search(r'<span class="press">([^<]*)</span>', part)
        wdate_match = re.search(r'<span class="wdate">([^<]*)</span>', part)

        items.append(
            {
                "title": title,
                "url": url_full,
                "source": _clean_news_text(press_match.group(1)) if press_match else "",
                "published_at": _clean_news_text(wdate_match.group(1)) if wdate_match else "",
            }
        )
        if len(items) >= 20:
            break

    if items:
        _market_news_cache = items
        _market_news_cache_at = datetime.now()

    return items[:limit], False


def _quote_from_fdr(symbol: str, label: str, unit: str = "") -> dict[str, Any] | None:
    """FinanceDataReader로 지수·환율 최신 시세와 전일 대비를 반환합니다."""
    try:
        end = datetime.today()
        start = end - timedelta(days=14)
        df = fdr.DataReader(symbol, start, end)
        if df is None or len(df) < 2:
            return None
        close_col = "Close" if "Close" in df.columns else "close"
        last = float(df[close_col].iloc[-1])
        prev = float(df[close_col].iloc[-2])
        change = last - prev
        change_pct = (change / prev * 100) if prev else 0.0
        return {
            "symbol": symbol,
            "label": label,
            "value": round(last, 2),
            "change": round(change, 2),
            "change_pct": round(change_pct, 2),
            "date": df.index[-1].strftime("%Y-%m-%d"),
            "unit": unit,
        }
    except Exception:
        return None


def _fetch_market_overview() -> tuple[dict[str, Any], bool]:
    global _market_overview_cache, _market_overview_cache_at

    if (
        _market_overview_cache is not None
        and _market_overview_cache_at is not None
        and datetime.now() - _market_overview_cache_at < timedelta(minutes=OVERVIEW_CACHE_MINUTES)
    ):
        return _market_overview_cache, True

    quotes: list[dict[str, Any]] = []
    for symbol, label, unit in MARKET_INDEX_SYMBOLS:
        quote = _quote_from_fdr(symbol, label, unit)
        if quote:
            quotes.append(quote)

    payload = {
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "quotes": quotes,
    }
    if quotes:
        _market_overview_cache = payload
        _market_overview_cache_at = datetime.now()
    elif _market_overview_cache:
        return _market_overview_cache, True
    return payload, False


_THEME_ANCHOR_RE = re.compile(
    r'sise_group_detail\.naver\?type=theme&no=(\d+)">([^<]+)</a>'
)
_THEME_CHANGE_RE = re.compile(
    r'col_type2">.*?<span[^>]*>\s*([+\-]?[\d,.]+)%', re.S
)
_THEME_COUNT_RE = re.compile(r'col_type4">(\d+)</td>')
_THEME_LEADER_RE = re.compile(r'item/main\.naver\?code=(\d{6})">([^<]+)</a>')


def _leader_change_pct(code: str) -> float | None:
    """KRX 목록에서 종목 전일대비 등락률(ChagesRatio)을 가져옵니다."""
    row = _get_krx_row(code)
    if row is None:
        return None
    try:
        ratio = row.get("ChagesRatio")
        if ratio is None or pd.isna(ratio):
            return None
        return round(float(ratio), 2)
    except (TypeError, ValueError):
        return None


def _parse_theme_html(html: str) -> list[dict[str, Any]]:
    """네이버 테마 목록 HTML에서 테마 행을 파싱합니다."""
    matches = list(_THEME_ANCHOR_RE.finditer(html))
    themes: list[dict[str, Any]] = []

    for i, match in enumerate(matches):
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else start + 1500
        block = html[start:end]

        no = match.group(1)
        name = match.group(2).strip()

        change_match = _THEME_CHANGE_RE.search(block)
        change_pct: float | None = None
        if change_match:
            try:
                change_pct = float(change_match.group(1).replace(",", ""))
            except ValueError:
                change_pct = None

        counts = _THEME_COUNT_RE.findall(block)
        rising = int(counts[0]) if len(counts) > 0 else 0
        flat = int(counts[1]) if len(counts) > 1 else 0
        falling = int(counts[2]) if len(counts) > 2 else 0

        leaders: list[dict[str, Any]] = []
        for code, leader_name in _THEME_LEADER_RE.findall(block)[:3]:
            leaders.append(
                {
                    "code": code,
                    "name": leader_name.strip(),
                    "change_pct": _leader_change_pct(code),
                }
            )

        themes.append(
            {
                "no": no,
                "name": name,
                "change_pct": change_pct,
                "rising": rising,
                "flat": flat,
                "falling": falling,
                "stock_count": rising + flat + falling,
                "leaders": leaders,
            }
        )

    return themes


def _fetch_stock_themes(limit: int = 12) -> dict[str, Any]:
    """네이버 금융 테마별 시세를 등락률 내림차순으로 가져옵니다."""
    global _themes_cache, _themes_cache_at

    if (
        _themes_cache is not None
        and _themes_cache_at is not None
        and datetime.now() - _themes_cache_at < timedelta(minutes=THEMES_CACHE_MINUTES)
    ):
        return {**_themes_cache, "themes": _themes_cache["themes"][:limit], "cached": True}

    try:
        url = f"{NAVER_THEME_URL}?field=change_rate&ordering=desc&page=1"
        raw = _fetch_url_bytes(url, timeout=12)
        html = raw.decode("euc-kr", "ignore")
        themes = _parse_theme_html(html)
    except Exception:
        if _themes_cache is not None:
            return {**_themes_cache, "themes": _themes_cache["themes"][:limit], "cached": True}
        return {
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "cached": False,
            "source": "네이버 금융",
            "source_url": NAVER_THEME_URL,
            "themes": [],
        }

    themes.sort(
        key=lambda t: t["change_pct"] if t["change_pct"] is not None else -999,
        reverse=True,
    )

    payload = {
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "cached": False,
        "source": "네이버 금융",
        "source_url": NAVER_THEME_URL,
        "themes": themes,
    }
    if themes:
        _themes_cache = payload
        _themes_cache_at = datetime.now()

    return {**payload, "themes": themes[:limit]}


def _fetch_url_bytes(url: str, timeout: int = 15) -> bytes:
    ctx = ssl.create_default_context(cafile=certifi.where())
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
        return resp.read()


def _fetch_global_news(limit: int = 10) -> tuple[list[dict[str, str]], bool]:
    """Yahoo Finance RSS에서 해외 금융 헤드라인을 수집합니다."""
    global _global_news_cache, _global_news_cache_at

    if (
        _global_news_cache is not None
        and _global_news_cache_at is not None
        and datetime.now() - _global_news_cache_at < timedelta(minutes=NEWS_CACHE_MINUTES)
    ):
        return _global_news_cache[:limit], True

    try:
        raw = _fetch_url_bytes(YAHOO_FINANCE_RSS)
        root = ET.fromstring(raw)
    except Exception:
        if _global_news_cache:
            return _global_news_cache[:limit], True
        return [], False

    items: list[dict[str, str]] = []
    for item in root.findall(".//item")[:limit]:
        title_el = item.find("title")
        link_el = item.find("link")
        pub_el = item.find("pubDate")
        if title_el is None or link_el is None or not title_el.text:
            continue
        title = _clean_news_text(title_el.text)
        url = link_el.text.strip() if link_el.text else ""
        if not title or not url:
            continue
        items.append(
            {
                "title": title,
                "url": url,
                "source": "Yahoo Finance",
                "published_at": _clean_news_text(pub_el.text) if pub_el is not None and pub_el.text else "",
            }
        )

    if items:
        _global_news_cache = items
        _global_news_cache_at = datetime.now()
    return items[:limit], False


def _analysis_prompt(price_text: str) -> str:
    return f"""아래는 국내 주식의 최근 일별 주가 데이터입니다.

{price_text}

이 데이터를 바탕으로 주식의 최근 단기 흐름, 앞으로의 전망, 투자할 때 조심해야 할 유의점을 친절한 한국어로 요약해줘.

※ 투자 조언이 아닌 참고용 정보임을 마지막에 한 줄로 안내해 줘."""


def _handle_gemini_exception(exc: Exception) -> HTTPException:
    err_msg = str(exc)
    if "401" in err_msg or "UNAUTHENTICATED" in err_msg:
        return HTTPException(
            status_code=401,
            detail=(
                "Gemini API 키가 올바르지 않습니다. "
                "backend/.env 파일에 AIzaSy... 형식의 키를 입력해 주세요."
            ),
        )
    if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg or "quota" in err_msg.lower():
        return HTTPException(
            status_code=429,
            detail="Gemini API 무료 사용량을 초과했습니다. 잠시 후 다시 시도해 주세요.",
        )
    return HTTPException(status_code=502, detail=f"Gemini API 호출 중 오류: {exc}")


def _stream_gemini_text(prompt: str):
    client = _get_gemini_client()
    for chunk in client.models.generate_content_stream(
        model=GEMINI_MODEL,
        contents=prompt,
    ):
        text = getattr(chunk, "text", None)
        if text:
            yield text


def _build_stock_chat_context(stock_query: str) -> tuple[str, str, str]:
    code, name = _resolve_stock_query(stock_query)
    price_df = _fetch_stock_prices(code, days=STOCK_LOOKBACK_DAYS)
    price_text = _format_price_data_for_ai(code, price_df, stock_name=name)
    hist_df = _fetch_stock_prices(code, days=RECOMMEND_HISTORY_DAYS)
    indicators = _compute_stock_indicators(hist_df)
    indicator_text = ""
    if indicators:
        indicator_text = (
            f"현재가 {indicators['close']:.0f}, RSI(14) {indicators['rsi']:.1f}, "
            f"MA20 {indicators['ma20']:.0f}, 20일 수익률 {indicators.get('ret_20d', 0):.1f}%"
        )
    return code, name, f"{price_text}\n\n[기술적 지표]\n{indicator_text}"


def _build_chat_prompt(context: str, stock_name: str, messages: list[ChatMessage]) -> str:
    history = "\n".join(
        f"{m.role.upper()}: {m.content}" for m in messages[-8:]
    )
    return f"""당신은 국내 주식 리서치 Copilot입니다. 아래 종목 데이터를 바탕으로 한국어로 답변하세요.
투자 권유는 하지 말고, 참고용 정보만 제공하세요.

[종목] {stock_name}
[데이터]
{context}

[대화]
{history}

USER의 마지막 질문에 간결하고 명확하게 답변하세요."""


# ──────────────────────────────────────────────
# API 엔드포인트
# ──────────────────────────────────────────────

@app.get("/")
def root() -> dict[str, str]:
    """서버가 정상 동작하는지 확인하는 간단한 헬스체크."""
    return {"message": "국내 주식 분석 API 서버가 실행 중입니다.", "docs": "/docs"}


def _build_prices_response(
    stock_query: str, days: int = STOCK_LOOKBACK_DAYS
) -> dict[str, Any]:
    """주가 차트용 데이터만 반환 (Gemini 호출 없음)."""
    code, name = _resolve_stock_query(stock_query)
    period = _normalize_period_days(days)
    price_df = _fetch_stock_prices(code, days=period)
    high, low = _period_high_low(price_df)
    fundamentals = _fetch_stock_fundamentals(code)
    return {
        "stock_code": code,
        "stock_name": name,
        "period_days": period,
        "price_history": _df_to_price_history(price_df),
        "today_quote": _build_today_quote(code, price_df),
        "today_intraday": _fetch_today_intraday(code),
        "period_high": high,
        "period_low": low,
        "per": fundamentals["per"],
        "pbr": fundamentals["pbr"],
        "dividend_yield": fundamentals["dividend_yield"],
    }


def _build_analysis_response(stock_query: str) -> dict[str, Any]:
    """Gemini AI 분석만 반환."""
    code, name = _resolve_stock_query(stock_query)
    price_df = _fetch_stock_prices(code, days=STOCK_LOOKBACK_DAYS)
    cache_key = _analysis_cache_key(code, price_df)

    if cache_key in _analysis_cache:
        return {
            "stock_code": code,
            "stock_name": name,
            "analysis": _analysis_cache[cache_key],
            "cached": True,
        }

    price_text = _format_price_data_for_ai(code, price_df, stock_name=name)

    analysis: str | None = None
    analysis_error: str | None = None
    try:
        analysis = _ask_gemini_for_analysis(price_text)
        if analysis:
            _analysis_cache[cache_key] = analysis
    except HTTPException as exc:
        analysis_error = str(exc.detail)

    result: dict[str, Any] = {
        "stock_code": code,
        "stock_name": name,
        "analysis": analysis,
        "cached": False,
    }
    if analysis_error:
        result["analysis_error"] = analysis_error
    return result


@app.get("/api/stock/suggest")
def suggest_stocks(
    q: str = Query("", description="종목명 또는 종목코드 일부"),
    limit: int = Query(8, ge=1, le=20),
    _user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """종목명·코드 자동완성 후보 목록."""
    suggestions = _search_stock_suggestions(q, limit=limit)
    return {"query": q.strip(), "count": len(suggestions), "suggestions": suggestions}


@app.get("/api/stock/intraday")
def get_stock_intraday_query(
    q: str = Query(..., min_length=1, description="종목코드 또는 종목명"),
    _user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """오늘 장중 분봉 차트 데이터."""
    code, name = _resolve_stock_query(q)
    intraday = _fetch_today_intraday(code)
    if intraday is None:
        raise HTTPException(
            status_code=404,
            detail="오늘 장중 시세 데이터를 찾을 수 없습니다. (장 시작 전·휴장일 가능)",
        )
    return {"stock_code": code, "stock_name": name, **intraday}


@app.get("/api/stock/prices")
def get_stock_prices_query(
    q: str = Query(..., min_length=1, description="종목코드, 종목명, 또는 '005930 삼성전자'"),
    days: int = Query(STOCK_LOOKBACK_DAYS, description="조회 기간(일): 30 / 90 / 180 / 365"),
    _user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """주가 차트용 데이터 (쿼리 파라미터 — 종목명 검색에 권장)."""
    return _build_prices_response(q, days=days)


@app.get("/api/stock/analysis")
def get_stock_analysis_query(
    q: str = Query(..., min_length=1, description="종목코드, 종목명, 또는 '005930 삼성전자'"),
    _user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Gemini AI 분석 (쿼리 파라미터 — 종목명 검색에 권장)."""
    return _build_analysis_response(q)


@app.get("/api/stock/analysis/stream")
def stream_stock_analysis(
    q: str = Query(..., min_length=1),
    _user: dict = Depends(get_current_user),
) -> StreamingResponse:
    """Gemini 주가 분석 스트리밍 (SSE)."""
    code, name = _resolve_stock_query(q)
    price_df = _fetch_stock_prices(code, days=STOCK_LOOKBACK_DAYS)
    cache_key = _analysis_cache_key(code, price_df)
    price_text = _format_price_data_for_ai(code, price_df, stock_name=name)
    prompt = _analysis_prompt(price_text)

    def event_generator():
        meta = {"stock_code": code, "stock_name": name}
        yield f"data: {json.dumps({'meta': meta})}\n\n"
        try:
            if cache_key in _analysis_cache:
                cached_text = _analysis_cache[cache_key]
                yield f"data: {json.dumps({'text': cached_text, 'cached': True})}\n\n"
                yield "data: [DONE]\n\n"
                return

            parts: list[str] = []
            for piece in _stream_gemini_text(prompt):
                parts.append(piece)
                yield f"data: {json.dumps({'text': piece})}\n\n"
            full = "".join(parts).strip()
            if full:
                _analysis_cache[cache_key] = full
            yield "data: [DONE]\n\n"
        except Exception as exc:
            http_exc = _handle_gemini_exception(exc)
            yield f"data: {json.dumps({'error': http_exc.detail})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/stock/chat")
def stock_chat(
    body: StockChatRequest,
    _user: dict = Depends(get_current_user),
) -> StreamingResponse:
    """종목 컨텍스트 기반 AI Copilot 채팅 (SSE)."""
    if not body.messages:
        raise HTTPException(status_code=400, detail="messages가 비어 있습니다.")

    _code, name, context = _build_stock_chat_context(body.stock_query)
    prompt = _build_chat_prompt(context, name, body.messages)

    def event_generator():
        yield f"data: {json.dumps({'meta': {'stock_name': name}})}\n\n"
        try:
            for piece in _stream_gemini_text(prompt):
                yield f"data: {json.dumps({'text': piece})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as exc:
            http_exc = _handle_gemini_exception(exc)
            yield f"data: {json.dumps({'error': http_exc.detail})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/stock/{stock_query}/prices")
def get_stock_prices(
    stock_query: str,
    days: int = Query(STOCK_LOOKBACK_DAYS, description="조회 기간(일): 30 / 90 / 180 / 365"),
    _user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """주가 차트용 데이터 (경로 파라미터)."""
    return _build_prices_response(stock_query, days=days)


@app.get("/api/stock/{stock_query}/analysis")
def get_stock_analysis(
    stock_query: str,
    _user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Gemini AI 분석 (경로 파라미터)."""
    return _build_analysis_response(stock_query)


@app.get("/api/stock/{stock_query}")
def analyze_stock(
    stock_query: str,
    _user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """
    특정 종목의 최근 30일 주가를 조회하고, Gemini AI로 분석 결과를 반환합니다.

    - **stock_query**: 종목코드, 종목명, 또는 "005930 삼성전자" 형식
    """
    code, name = _resolve_stock_query(stock_query)

    # 1단계: 주가 데이터 수집
    price_df = _fetch_stock_prices(code, days=STOCK_LOOKBACK_DAYS)

    # 2단계: AI가 읽기 좋은 텍스트로 변환
    price_text = _format_price_data_for_ai(code, price_df, stock_name=name)

    # 3단계: Gemini에게 분석 요청 (실패해도 차트 데이터는 반환)
    analysis: str | None = None
    analysis_error: str | None = None
    try:
        analysis = _ask_gemini_for_analysis(price_text)
    except HTTPException as exc:
        analysis_error = str(exc.detail)

    result: dict[str, Any] = {
        "stock_code": code,
        "stock_name": name,
        "period_days": len(price_df),
        "price_history": _df_to_price_history(price_df),
        "today_quote": _build_today_quote(code, price_df),
        "analysis": analysis,
    }
    if analysis_error:
        result["analysis_error"] = analysis_error
    return result


@app.get("/api/market/overview")
def get_market_overview(
    _user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """KOSPI·KOSDAQ·USD/KRW 등 시장 지표 요약."""
    payload, cached = _fetch_market_overview()
    return {**payload, "cached": cached}


@app.get("/api/themes")
def get_stock_themes(
    limit: int = Query(12, ge=1, le=30),
    _user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """네이버 금융 테마별 시세(등락률 내림차순)."""
    return _fetch_stock_themes(limit=limit)


@app.get("/api/news/market")
def get_market_news(
    limit: int = Query(10, ge=1, le=20),
    region: str = Query("domestic", pattern="^(domestic|global)$"),
    _user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """시장 뉴스 — domestic(네이버) 또는 global(Yahoo RSS)."""
    if region == "global":
        items, cached = _fetch_global_news(limit=limit)
        return {
            "count": len(items),
            "region": "global",
            "source": "Yahoo Finance",
            "source_url": YAHOO_FINANCE_RSS,
            "cached": cached,
            "items": items,
        }
    items, cached = _fetch_market_news(limit=limit)
    return {
        "count": len(items),
        "region": "domestic",
        "source": "네이버 금융",
        "source_url": NAVER_MAIN_NEWS_URL,
        "cached": cached,
        "items": items,
    }


@app.get("/api/recommend")
def recommend_stocks(_user: dict = Depends(get_current_user)) -> dict[str, Any]:
    """
    시가총액 상위 종목을 10가지 투자 기법(수급·모멘텀·골든크로스·돌파·RSI·MACD 등)으로
    스크리닝해 기법별 1종목씩 최대 10개 추천합니다.
    """
    recommendations = _find_expert_recommendations()

    return {
        "count": len(recommendations),
        "strategies": INVESTMENT_STRATEGIES,
        "criteria": {
            "top_marcap": TOP_MARCAP_COUNT,
            "max_recommendations": MAX_RECOMMENDATIONS,
            "techniques_count": len(INVESTMENT_STRATEGIES),
            "history_days": RECOMMEND_HISTORY_DAYS,
        },
        "recommendations": recommendations,
        "disclaimer": (
            "본 추천은 기술적·수급 지표 기반 스크리닝 결과이며, "
            "투자 권유·매매 신호가 아닙니다. 최종 판단은 투자자 본인에게 있습니다."
        ),
    }
