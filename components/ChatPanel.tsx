"use client";

import { useState } from "react";
import type { ChatTurn } from "@/lib/llm";

interface ChatPanelProps {
  messages: ChatTurn[];
  loading: boolean;
  disabled: boolean;
  disabledReason?: string;
  onSend: (text: string) => void;
}

export default function ChatPanel({ messages, loading, disabled, disabledReason, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState("");

  const submit = () => {
    const text = draft.trim();
    if (!text || loading || disabled) return;
    onSend(text);
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#696A61]">
        Ask about this notion
      </h3>

      {messages.length > 0 && (
        <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-[#423e42] bg-black/20 p-2.5">
          {messages.map((m, i) => (
            <div
              key={i}
              className={m.role === "user" ? "text-right" : "text-left"}
            >
              <span
                className={
                  m.role === "user"
                    ? "inline-block rounded-lg bg-accent-500/20 px-2.5 py-1.5 text-xs text-accent-200"
                    : "inline-block rounded-lg bg-[#322f33] px-2.5 py-1.5 text-xs text-[#8F8978]"
                }
              >
                {m.content}
              </span>
            </div>
          ))}
          {loading && <p className="text-left text-xs text-[#696A61]">Thinking…</p>}
        </div>
      )}

      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          disabled={disabled}
          placeholder={disabled ? (disabledReason ?? "Unavailable") : "Ask a question…"}
          className="flex-1 rounded-md border border-[#423e42] bg-[#28262a] px-2.5 py-1.5 text-xs text-[#D4C6A6] placeholder:text-[#696A61] focus:border-accent-400/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          onClick={submit}
          disabled={disabled || loading || draft.trim().length === 0}
          className="rounded-md border border-[#423e42] bg-[#28262a] px-3 text-xs text-[#8F8978] hover:bg-[#322f33] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}
