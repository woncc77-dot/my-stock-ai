"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { PricePoint, TodayQuote } from "@/lib/api";

type StockPriceChartProps = {
  data: PricePoint[];
  stockCode: string;
  stockName?: string;
  todayQuote?: TodayQuote | null;
  periodHigh?: number | null;
  periodLow?: number | null;
  per?: number | null;
  pbr?: number | null;
  dividendYield?: number | null;
  periodLabel?: string;
};

const UP_COLOR = "#e5484d"; // 상승 = 빨강
const DOWN_COLOR = "#2563eb"; // 하락 = 파랑

function formatPrice(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatMetric(value: number | null | undefined, suffix: string) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(2)}${suffix}`;
}

function buildComment(params: {
  periodLabel: string;
  periodChangePct: number;
  isPeriodUp: boolean;
  lastClose: number;
  periodHigh?: number | null;
  periodLow?: number | null;
  per?: number | null;
  pbr?: number | null;
  dividendYield?: number | null;
  todayChangePct?: number | null;
}): string {
  const {
    periodLabel,
    periodChangePct,
    isPeriodUp,
    lastClose,
    periodHigh,
    periodLow,
    per,
    pbr,
    dividendYield,
    todayChangePct,
  } = params;

  const sign = periodChangePct >= 0 ? "+" : "";
  let line1 = `최근 ${periodLabel} 동안 ${isPeriodUp ? "상승" : "하락"} 흐름으로 ${sign}${periodChangePct.toFixed(1)}% 변동했습니다.`;
  if (periodHigh != null && periodLow != null && periodHigh > 0 && periodLow > 0) {
    const fromHigh = ((lastClose - periodHigh) / periodHigh) * 100;
    const fromLow = ((lastClose - periodLow) / periodLow) * 100;
    line1 = `최근 ${periodLabel} ${isPeriodUp ? "상승" : "하락"} 흐름(${sign}${periodChangePct.toFixed(1)}%), 현재가는 기간 최고가 대비 ${fromHigh.toFixed(1)}% · 최저가 대비 +${fromLow.toFixed(1)}% 위치입니다.`;
  }

  const valBits: string[] = [];
  if (per != null) valBits.push(`PER ${per.toFixed(2)}배`);
  if (pbr != null) valBits.push(`PBR ${pbr.toFixed(2)}배`);
  if (dividendYield != null) valBits.push(`배당수익률 ${dividendYield.toFixed(2)}%`);

  let line2: string;
  if (valBits.length > 0) {
    const todayPart =
      todayChangePct != null
        ? ` 전일 대비 ${todayChangePct >= 0 ? "강세" : "약세"}(${todayChangePct >= 0 ? "+" : ""}${todayChangePct.toFixed(2)}%)입니다.`
        : "";
    line2 = `밸류에이션은 ${valBits.join(" · ")} 수준입니다.${todayPart}`;
  } else {
    line2 = "PER·PBR·배당수익률 정보를 불러오지 못했습니다. 차트와 등락률을 참고하세요.";
  }

  return `${line1} ${line2}`;
}

function formatDateLabel(date: string) {
  const [, month, day] = date.split("-");
  return `${month}/${day}`;
}

function formatTodayLabel(date: string) {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

export function StockPriceChart({
  data,
  stockCode,
  stockName,
  todayQuote,
  periodHigh,
  periodLow,
  per,
  pbr,
  dividendYield,
  periodLabel,
}: StockPriceChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-ink/20 bg-canvas/50 px-4 text-center">
        <p className="type-body-sm font-semibold">종목을 검색하면 최근 주가 추이가 표시됩니다</p>
        <p className="text-sm text-ink/70">예: 005930, 삼성전자, 005930 삼성전자</p>
      </div>
    );
  }

  const displayQuote = todayQuote ?? {
    date: data[data.length - 1].date,
    close: data[data.length - 1].close,
    change_pct: null,
    is_today: false,
  };

  const firstClose = data[0].close;
  const lastClose = displayQuote.close;
  const periodChangePct = ((lastClose - firstClose) / firstClose) * 100;
  const todayChangePct = displayQuote.change_pct;
  const isPeriodUp = periodChangePct >= 0;
  const isTodayUp = todayChangePct == null ? isPeriodUp : todayChangePct >= 0;

  return (
    <div className="min-w-0">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 sm:mb-6 sm:gap-4">
        <div className="min-w-0">
          <p className="type-caption mb-2">
            {displayQuote.is_today ? "오늘 종가" : "최신 종가"} ·{" "}
            {formatTodayLabel(displayQuote.date)}
            {displayQuote.is_today && (
              <span className="ml-2 rounded-pill bg-primary px-2 py-0.5 text-on-primary">
                KRX 반영
              </span>
            )}
          </p>
          <p className="type-headline break-words">
            {stockName ? (
              <>
                {stockName}{" "}
                <span className="type-body-sm font-medium text-ink/60">({stockCode})</span>
              </>
            ) : (
              stockCode
            )}{" "}
            <span className="font-medium">{formatPrice(lastClose)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {todayChangePct != null && (
            <span
              className={`inline-flex min-h-[36px] items-center rounded-pill px-4 py-1 type-body-sm font-semibold text-white ${
                isTodayUp ? "bg-positive" : "bg-negative"
              }`}
            >
              전일비 {isTodayUp ? "▲" : "▼"} {todayChangePct >= 0 ? "+" : ""}
              {todayChangePct.toFixed(2)}%
            </span>
          )}
          <span
            className={`inline-flex min-h-[36px] items-center rounded-pill px-4 py-1 type-body-sm font-semibold ${
              isPeriodUp
                ? "bg-positive/15 text-positive"
                : "bg-negative/15 text-negative"
            }`}
          >
            {periodLabel ?? `${data.length}일`} {isPeriodUp ? "▲" : "▼"}{" "}
            {periodChangePct >= 0 ? "+" : ""}
            {periodChangePct.toFixed(2)}%
          </span>
        </div>
      </div>

      <dl className="mb-4 grid grid-cols-2 gap-2 type-caption text-ink/70 sm:grid-cols-5 sm:gap-3">
        <div>
          <dt>PER</dt>
          <dd className="mt-1 type-body-sm font-semibold text-ink">
            {formatMetric(per, "배")}
          </dd>
        </div>
        <div>
          <dt>PBR</dt>
          <dd className="mt-1 type-body-sm font-semibold text-ink">
            {formatMetric(pbr, "배")}
          </dd>
        </div>
        <div>
          <dt>배당수익률</dt>
          <dd className="mt-1 type-body-sm font-semibold text-ink">
            {formatMetric(dividendYield, "%")}
          </dd>
        </div>
        <div>
          <dt>기간 최고</dt>
          <dd className="mt-1 type-body-sm font-semibold text-ink">
            {periodHigh != null ? formatPrice(periodHigh) : "—"}
          </dd>
        </div>
        <div>
          <dt>기간 최저</dt>
          <dd className="mt-1 type-body-sm font-semibold text-ink">
            {periodLow != null ? formatPrice(periodLow) : "—"}
          </dd>
        </div>
      </dl>

      <div className="mb-6 rounded-md border border-hairline bg-surface-soft px-4 py-3">
        <p className="type-caption mb-1 normal-case tracking-normal text-ink/50">
          분석 코멘트
        </p>
        <p className="type-body-sm line-clamp-2 leading-relaxed text-ink/80">
          {buildComment({
            periodLabel: periodLabel ?? `${data.length}일`,
            periodChangePct,
            isPeriodUp,
            lastClose,
            periodHigh,
            periodLow,
            per,
            pbr,
            dividendYield,
            todayChangePct,
          })}
        </p>
      </div>

      <div className="h-64 w-full min-w-0 overflow-hidden rounded-md bg-canvas/60 p-1 sm:h-72 sm:p-2">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={isPeriodUp ? UP_COLOR : DOWN_COLOR}
                  stopOpacity={0.16}
                />
                <stop
                  offset="100%"
                  stopColor={isPeriodUp ? UP_COLOR : DOWN_COLOR}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#e6e6e6" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDateLabel}
              tick={{ fill: "#000000", fontSize: 12, fontWeight: 330 }}
              axisLine={false}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              domain={["auto", "auto"]}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              tick={{ fill: "#000000", fontSize: 12, fontWeight: 330 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#ffffff",
                border: "1px solid #e6e6e6",
                borderRadius: "8px",
                color: "#000000",
                fontSize: "14px",
              }}
              labelFormatter={(label) => {
                const isTodayPoint =
                  todayQuote?.is_today && String(label) === todayQuote.date;
                return isTodayPoint ? `오늘 · ${label}` : `날짜: ${label}`;
              }}
              formatter={(value, _name, item) => {
                const point = item.payload as PricePoint;
                return [
                  `종가 ${formatPrice(Number(value))} (시 ${formatPrice(point.open)} / 고 ${formatPrice(point.high)} / 저 ${formatPrice(point.low)})`,
                  "",
                ];
              }}
            />
            <Area
              type="monotone"
              dataKey="close"
              stroke={isPeriodUp ? UP_COLOR : DOWN_COLOR}
              strokeWidth={2}
              fill="url(#priceGradient)"
              dot={(props) => {
                const { cx, cy, payload } = props;
                const isTodayPoint =
                  todayQuote?.is_today && payload.date === todayQuote.date;
                if (!isTodayPoint || cx == null || cy == null) return null;
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={5}
                    fill={isPeriodUp ? UP_COLOR : DOWN_COLOR}
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                );
              }}
              activeDot={{
                r: 4,
                fill: isPeriodUp ? UP_COLOR : DOWN_COLOR,
                stroke: "#ffffff",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
