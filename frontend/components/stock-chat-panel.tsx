"use client";

import { Send } from "lucide-react";
import { FormEvent, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { streamStockChat, type ChatMessage } from "@/lib/api";

const SUGGESTIONS = [
  "최근 주가 흐름을 요약해줘",
  "RSI 관점에서 어떤 상태야?",
  "단기 리스크 포인트는?",
];

type StockChatPanelProps = {
  stockQuery: string;
  stockName: string;
  disabled?: boolean;
};

export function StockChatPanel({
  stockQuery,
  stockName,
  disabled = false,
}: StockChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || !stockQuery || loading) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    let assistant = "";
    setMessages([...nextMessages, { role: "assistant", content: "" }]);

    try {
      await streamStockChat(stockQuery, nextMessages, {
        onChunk: (chunk) => {
          assistant += chunk;
          setMessages([...nextMessages, { role: "assistant", content: assistant }]);
        },
        onError: (msg) => setError(msg),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "채팅 중 오류가 발생했습니다.");
      setMessages(nextMessages);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void sendMessage(input);
  }

  return (
    <Card className="border-hairline bg-canvas shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">AI Copilot</CardTitle>
        <p className="type-caption normal-case tracking-normal text-ink/60">
          {stockName || "종목"} · 후속 질문 (참고용, 투자 권유 아님)
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              disabled={disabled || loading || !stockQuery}
              onClick={() => void sendMessage(q)}
              className="rounded-pill border border-hairline px-3 py-1 type-caption normal-case tracking-normal hover:bg-surface-soft disabled:opacity-40"
            >
              {q}
            </button>
          ))}
        </div>

        <div className="max-h-64 space-y-3 overflow-y-auto rounded-md border border-hairline bg-surface-soft p-3">
          {messages.length === 0 ? (
            <p className="type-body-sm text-ink/60">
              분석 후 궁금한 점을 물어보세요.
            </p>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={`${msg.role}-${idx}`}
                className={
                  msg.role === "user"
                    ? "ml-8 rounded-md bg-canvas p-3 type-body-sm"
                    : "mr-8 rounded-md bg-canvas p-3 type-body-sm whitespace-pre-wrap"
                }
              >
                <p className="type-caption mb-1 normal-case text-ink/50">
                  {msg.role === "user" ? "나" : "Copilot"}
                </p>
                {msg.content || (loading && msg.role === "assistant" ? (
                  <Skeleton className="h-4 w-full" />
                ) : null)}
              </div>
            ))
          )}
        </div>

        {error && <p className="type-body-sm text-negative">{error}</p>}

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={disabled ? "종목을 먼저 검색하세요" : "질문 입력..."}
            disabled={disabled || loading || !stockQuery}
            className="text-input flex-1"
          />
          <button
            type="submit"
            disabled={disabled || loading || !stockQuery || !input.trim()}
            className="btn-primary px-4"
            aria-label="전송"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
