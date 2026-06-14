"use client";

import { GitBranch, MessageSquareText } from "lucide-react";
import type { AgentTurn } from "@/lib/models/maintenance";
import { StatusPill } from "@/components/status-pill";

interface AgentResponseCardProps {
  turn: AgentTurn;
}

export function AgentResponseCard({ turn }: AgentResponseCardProps) {
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
        <StatusPill tone={turn.status === "grounded" ? "ready" : "warning"}>
          {turn.status === "grounded" ? "Yanıtlandı" : "Yetersiz veri"}
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

    </article>
  );
}
