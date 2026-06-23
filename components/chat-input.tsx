"use client";

import { useRef } from "react";
import { Loader2, Send } from "lucide-react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  hasHistory: boolean;
}

export function ChatInput({ value, onChange, onSubmit, isLoading, hasHistory }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleInput() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className="border-t border-white/10 bg-black/40 px-4 py-4 backdrop-blur-sm">
      <div className="mx-auto max-w-3xl">
        <div className="glass-panel flex items-end gap-3 rounded-2xl p-3">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={isLoading}
            placeholder={hasHistory ? "Takip sorusu yazın..." : "Bakım yönetimi sorusu yazın..."}
            className="flex-1 resize-none bg-transparent text-sm leading-6 text-platinum outline-none placeholder:text-muted disabled:opacity-50"
            style={{ maxHeight: "160px" }}
          />
          <button
            type="button"
            onClick={onSubmit}
            disabled={isLoading || !value.trim()}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-signal/40 bg-signal text-ink transition hover:bg-[#d8ff64] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-muted"
          >
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </button>
        </div>
        <p className="mt-2 text-center text-[10px] text-muted">
          Enter ile gönder · Shift+Enter yeni satır
        </p>
      </div>
    </div>
  );
}
