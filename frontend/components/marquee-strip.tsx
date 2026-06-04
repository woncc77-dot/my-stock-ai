const TICKERS = [
  "삼성전자",
  "SK하이닉스",
  "LG에너지솔루션",
  "NAVER",
  "카카오",
  "현대차",
  "기아",
  "셀트리온",
  "POSCO",
  "KB금융",
];

type MarqueeStripProps = {
  onTickerClick?: (name: string) => void;
};

export function MarqueeStrip({ onTickerClick }: MarqueeStripProps) {
  const items = [...TICKERS, ...TICKERS];

  return (
    <div className="overflow-hidden bg-inverse-canvas py-2">
      <div className="marquee-track flex w-max gap-12 whitespace-nowrap">
        {items.map((name, i) => (
          <button
            key={`${name}-${i}`}
            type="button"
            onClick={() => onTickerClick?.(name)}
            className="type-body-sm text-inverse-ink transition-opacity hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inverse-ink/50"
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}
