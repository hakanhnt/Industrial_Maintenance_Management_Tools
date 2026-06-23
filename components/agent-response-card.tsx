"use client";

import { useState } from "react";
import { GitBranch, MessageSquareText, FileText, ChevronDown, ChevronUp, Tag } from "lucide-react";
import type { AgentTurn } from "@/lib/models/maintenance";
import { StatusPill } from "@/components/status-pill";

interface AgentResponseCardProps {
  turn: AgentTurn;
}

export function AgentResponseCard({ turn }: AgentResponseCardProps) {
  const [showEvidence, setShowEvidence] = useState(false);

  if (turn.status === "skipped") {
    return null;
  }

  return (
    <article className="glass-panel rounded-lg p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-full border border-white/15 bg-white/[0.04] font-mono text-xs font-semibold text-platinum">
            {turn.agent.code}
          </div>
          <div>
            <h3 className="text-base font-semibold text-platinum">{turn.agent.name}</h3>
            <p className="mt-1 text-sm text-muted">{turn.agent.role}</p>
          </div>
        </div>
        <StatusPill
          tone={
            turn.status === "grounded" || turn.status === "web_fallback"
              ? "ready"
              : "warning"
          }
        >
          {turn.status === "web_fallback"
            ? "Web destekli"
            : turn.status === "grounded"
              ? "Yanıtlandı"
              : "Yetersiz veri"}
        </StatusPill>
      </div>

      <div className="mt-5 flex gap-3">
        <MessageSquareText className="mt-1 size-4 shrink-0 text-signal" />
        <p className="text-sm leading-7 text-[#ded8cc]">{turn.content}</p>
      </div>

      {turn.diagramSuggestions.length > 0 && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {turn.diagramSuggestions.map((suggestion) => (
            <div
              key={suggestion}
              className="rounded-lg border border-cyanline/25 bg-cyanline/[0.06] p-4"
            >
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-cyanline">
                <GitBranch className="size-3.5" />
                Diyagram Önerisi
              </div>
              <p className="mt-3 text-sm text-platinum">{suggestion}</p>
            </div>
          ))}
        </div>
      )}

      {turn.evidence && turn.evidence.length > 0 && (
        <div className="mt-5 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={() => setShowEvidence(!showEvidence)}
            className="flex items-center justify-between w-full text-xs font-mono uppercase tracking-[0.16em] text-muted hover:text-platinum transition"
          >
            <span className="flex items-center gap-2">
              <FileText className="size-3.5 text-signal" />
              Kullanılan Kaynaklar ({turn.evidence.length})
            </span>
            {showEvidence ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
          </button>

          {showEvidence && (
            <div className="mt-4 space-y-3.5">
              {turn.evidence.map((chunk, idx) => (
                <div
                  key={chunk.id || idx}
                  className="rounded-lg border border-white/5 bg-black/35 p-3.5 space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs text-platinum font-semibold truncate" title={chunk.title}>
                        {chunk.title}
                      </div>
                      {chunk.locationLabel && (
                        <div className="text-[10px] text-muted mt-0.5">
                          {chunk.locationLabel}
                        </div>
                      )}
                    </div>
                    <span className="font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded border border-white/10 bg-white/[0.02] text-muted">
                      {chunk.domain}
                    </span>
                  </div>

                  <p className="text-[11px] leading-5 text-muted bg-black/20 border border-white/[0.02] p-2.5 rounded font-mono select-all max-h-32 overflow-y-auto whitespace-pre-wrap">
                    {chunk.text}
                  </p>

                  {chunk.keywords && chunk.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1 border-t border-white/5">
                      {chunk.keywords.map((kw) => (
                        <span
                          key={kw}
                          className="flex items-center gap-1 font-mono text-[9px] text-cyanline bg-cyanline/5 px-2 py-0.5 rounded"
                        >
                          <Tag className="size-2" />
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </article>
  );
}
