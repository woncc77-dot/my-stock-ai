"use client";

import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

import { fetchStockSuggestions, type StockSuggestion } from "@/lib/api";

type StockNameAutocompleteProps = {
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: StockSuggestion) => void;
  disabled?: boolean;
};

export function StockNameAutocomplete({
  value,
  onChange,
  onSelect,
  disabled = false,
}: StockNameAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<StockSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed.length < 1) {
      setSuggestions([]);
      setOpen(false);
      setActiveIndex(-1);
      setFetchError(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setFetchError(null);
      setOpen(true);
      try {
        const data = await fetchStockSuggestions(trimmed);
        if (cancelled) return;
        setSuggestions(data.suggestions);
        setOpen(true);
        setActiveIndex(-1);
      } catch (err) {
        if (!cancelled) {
          setSuggestions([]);
          setOpen(true);
          setFetchError(
            err instanceof Error
              ? err.message
              : "유사 종목을 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function pick(suggestion: StockSuggestion) {
    onSelect(suggestion);
    setOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
    setFetchError(null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) =>
        prev <= 0 ? suggestions.length - 1 : prev - 1,
      );
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      pick(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        id="stock-name"
        type="text"
        placeholder="삼성전자"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => {
          if (value.trim().length > 0) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        autoComplete="off"
        aria-autocomplete="list"
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        className="text-input"
      />

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-hairline bg-canvas py-1 shadow-lg"
        >
          {loading ? (
            <li className="px-3 py-2 type-caption text-ink/50">
              유사 종목 검색 중… (배포 서버는 첫 요청이 30초 걸릴 수 있습니다)
            </li>
          ) : fetchError ? (
            <li className="px-3 py-2 type-caption text-ink/70">{fetchError}</li>
          ) : suggestions.length === 0 ? (
            <li className="px-3 py-2 type-caption text-ink/50">
              일치하는 종목이 없습니다
            </li>
          ) : (
            suggestions.map((item, index) => (
              <li key={item.code} role="option" aria-selected={index === activeIndex}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(item)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left type-body-sm transition-colors hover:bg-ink/5 ${
                    index === activeIndex ? "bg-ink/5" : ""
                  }`}
                >
                  <span className="font-semibold">{item.name}</span>
                  <span className="type-caption text-ink/50">{item.code}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
