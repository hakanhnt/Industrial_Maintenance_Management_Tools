"use client";

interface ChatUserBubbleProps {
  question: string;
}

export function ChatUserBubble({ question }: ChatUserBubbleProps) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[70%]">
        <p className="mb-1.5 text-right font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
          Soru
        </p>
        <div className="glass-panel rounded-2xl rounded-tr-sm border border-signal/20 px-4 py-3">
          <p className="text-sm leading-6 text-platinum">{question}</p>
        </div>
      </div>
    </div>
  );
}
