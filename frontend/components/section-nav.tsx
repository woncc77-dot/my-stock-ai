"use client";

import type { ReactNode } from "react";

export const SECTION_IDS = {
  analysis: "stock-analysis",
  recommend: "recommendations",
} as const;

export function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function AnalysisIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 3v18h18" />
      <path d="m19 9-5 5-4-4-3 3" />
    </svg>
  );
}

export function RecommendIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2l2.4 4.8L20 8l-4 3.9.9 5.5L12 15.8 7.1 17.4 8 11.9 4 8l5.6-1.2L12 2z" />
    </svg>
  );
}

type SectionNavButtonProps = {
  target: keyof typeof SECTION_IDS;
  label: string;
  icon: ReactNode;
  iconBg: string;
  description?: string;
  compact?: boolean;
};

function SectionNavButton({
  target,
  label,
  icon,
  iconBg,
  description,
  compact = false,
}: SectionNavButtonProps) {
  const sectionId = SECTION_IDS[target];

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => scrollToSection(sectionId)}
        className="inline-flex items-center gap-1 rounded-pill px-1.5 py-1 type-body-sm transition-colors hover:bg-surface-soft sm:gap-2 sm:px-3 sm:py-2"
        aria-label={label}
      >
        <span className={`flex h-7 w-7 items-center justify-center rounded-md sm:h-8 sm:w-8 ${iconBg}`}>
          {icon}
        </span>
        <span className="hidden font-semibold sm:inline">{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => scrollToSection(sectionId)}
      className="flex w-full items-center gap-3 rounded-lg border border-hairline bg-surface-soft px-4 py-3 text-left transition-colors hover:border-primary sm:min-w-[140px] sm:max-w-[240px] sm:flex-none sm:gap-4 sm:px-5 sm:py-4"
    >
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-md ${iconBg}`}
      >
        {icon}
      </span>
      <span>
        <span className="type-body-sm block font-semibold">{label}</span>
        {description && (
          <span className="type-caption mt-1 block normal-case tracking-normal text-ink/60">
            {description}
          </span>
        )}
      </span>
    </button>
  );
}

export function SectionQuickLinks() {
  return (
    <div className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:flex-wrap sm:gap-4">
      <SectionNavButton
        target="analysis"
        label="종목 분석"
        description="AI 주가 리포트"
        icon={<AnalysisIcon className="h-6 w-6" />}
        iconBg="bg-block-lilac"
      />
      <SectionNavButton
        target="recommend"
        label="추천"
        description="10대 투자기법 스크리닝"
        icon={<RecommendIcon className="h-6 w-6" />}
        iconBg="bg-block-coral"
      />
    </div>
  );
}

export function SectionNavCompact() {
  return (
    <div className="flex min-w-0 shrink items-center gap-0.5 sm:gap-1">
      <SectionNavButton
        target="analysis"
        label="종목 분석"
        icon={<AnalysisIcon />}
        iconBg="bg-block-lilac"
        compact
      />
      <SectionNavButton
        target="recommend"
        label="추천"
        icon={<RecommendIcon />}
        iconBg="bg-block-coral"
        compact
      />
    </div>
  );
}
