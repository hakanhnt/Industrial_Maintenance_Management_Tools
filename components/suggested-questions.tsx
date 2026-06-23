"use client";

import { Lightbulb } from "lucide-react";

interface SuggestedQuestionsProps {
  suggestions: string[];
  onSelect: (question: string) => void;
}

export function SuggestedQuestions({ suggestions, onSelect }: SuggestedQuestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      <p className="mb-2.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
        <Lightbulb className="size-3 text-signal" />
        Önerilen sorular
      </p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onSelect(suggestion)}
            className="rounded-full border border-signal/30 bg-signal/5 px-3 py-1.5 text-xs text-platinum transition hover:border-signal/60 hover:bg-signal/15"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
