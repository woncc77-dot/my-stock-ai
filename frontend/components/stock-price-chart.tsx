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
};

function formatPrice(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
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
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="type-caption mb-2">
            {displayQuote.is_today ? "오늘 종가" : "최신 종가"} ·{" "}
            {formatTodayLabel(displayQuote.date)}
            {displayQuote.is_today && (
              <span className="ml-2 rounded-pill bg-primary px-2 py-0.5 text-on-primary">
                KRX 반영
              </span>
            )}
          </p>
          <p className="type-headline">
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
              className={`inline-flex min-h-[36px] items-center rounded-pill px-4 py-1 type-body-sm font-semibold ${
                isTodayUp ? "bg-primary text-on-primary" : "bg-canvas text-ink ring-1 ring-hairline"
              }`}
            >
              전일비 {isTodayUp ? "▲" : "▼"} {todayChangePct >= 0 ? "+" : ""}
              {todayChangePct.toFixed(2)}%
            </span>
          )}
          <span
            className={`inline-flex min-h-[36px] items-center rounded-pill px-4 py-1 type-body-sm font-semibold ${
              isPeriodUp ? "bg-canvas text-ink ring-1 ring-hairline" : "bg-canvas text-ink ring-1 ring-hairline"
            }`}
          >
            {data.length}일 {isPeriodUp ? "▲" : "▼"} {periodChangePct >= 0 ? "+" : ""}
            {periodChangePct.toFixed(2)}%
          </span>
        </div>
      </div>

      <div className="h-72 w-full rounded-md bg-canvas/60 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#000000" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#000000" stopOpacity={0} />
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
              width={48}
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
              stroke="#000000"
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
                    fill="#000000"
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                );
              }}
              activeDot={{ r: 4, fill: "#000000", stroke: "#ffffff", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
