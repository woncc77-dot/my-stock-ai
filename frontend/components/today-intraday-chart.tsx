"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { TodayIntraday } from "@/lib/api";

type TodayIntradayChartProps = {
  data: TodayIntraday | null;
  stockCode: string;
  stockName?: string;
};

function formatPrice(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatDateLabel(date: string) {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

export function TodayIntradayChart({
  data,
  stockCode,
  stockName,
}: TodayIntradayChartProps) {
  if (!data || data.points.length === 0) {
    return (
      <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-ink/20 bg-canvas/50 px-4 text-center">
        <p className="type-body-sm font-[480]">오늘 장중 데이터가 아직 없습니다</p>
        <p className="type-caption text-ink/60">장 시작 전이거나 휴장일일 수 있습니다</p>
      </div>
    );
  }

  const isUp = (data.change_pct ?? 0) >= 0;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="type-caption mb-2">
            {data.is_today ? "오늘 장중" : "최근 거래일"} · {formatDateLabel(data.date)}
            <span className="ml-2 rounded-pill bg-canvas px-2 py-0.5 ring-1 ring-hairline">
              1분봉
            </span>
          </p>
          <p className="type-headline">
            {stockName ? (
              <>
                {stockName}{" "}
                <span className="type-body-sm font-[340] text-ink/60">({stockCode})</span>
              </>
            ) : (
              stockCode
            )}{" "}
            <span className="font-[340]">{formatPrice(data.close)}</span>
          </p>
        </div>
        {data.change_pct != null && (
          <span
            className={`inline-flex min-h-[36px] items-center rounded-pill px-4 py-1 type-body-sm font-[480] ${
              isUp ? "bg-primary text-on-primary" : "bg-canvas text-ink ring-1 ring-hairline"
            }`}
          >
            전일비 {isUp ? "▲" : "▼"} {data.change_pct >= 0 ? "+" : ""}
            {data.change_pct.toFixed(2)}%
          </span>
        )}
      </div>

      <dl className="mb-4 grid grid-cols-4 gap-2 type-caption text-ink/70 sm:gap-4">
        <div>
          <dt>시가</dt>
          <dd className="mt-1 type-body-sm font-[480] text-ink">{formatPrice(data.open)}</dd>
        </div>
        <div>
          <dt>고가</dt>
          <dd className="mt-1 type-body-sm font-[480] text-ink">{formatPrice(data.high)}</dd>
        </div>
        <div>
          <dt>저가</dt>
          <dd className="mt-1 type-body-sm font-[480] text-ink">{formatPrice(data.low)}</dd>
        </div>
        <div>
          <dt>현재가</dt>
          <dd className="mt-1 type-body-sm font-[480] text-ink">{formatPrice(data.close)}</dd>
        </div>
      </dl>

      <div className="h-64 w-full rounded-md bg-canvas/60 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#e6e6e6" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fill: "#000000", fontSize: 11, fontWeight: 330 }}
              axisLine={false}
              tickLine={false}
              minTickGap={40}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={["auto", "auto"]}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              tick={{ fill: "#000000", fontSize: 11, fontWeight: 330 }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#ffffff",
                border: "1px solid #e6e6e6",
                borderRadius: "8px",
                fontSize: "13px",
              }}
              labelFormatter={(label) => `시간 ${label}`}
              formatter={(value, _name, item) => {
                const point = item.payload as { volume: number };
                return [
                  `${formatPrice(Number(value))} · 거래 ${point.volume.toLocaleString("ko-KR")}주`,
                  "체결가",
                ];
              }}
            />
            <ReferenceLine
              y={data.open}
              stroke="#999999"
              strokeDasharray="4 4"
              label={{ value: "시가", position: "insideTopLeft", fill: "#666", fontSize: 11 }}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke="#000000"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "#000000", stroke: "#ffffff", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
