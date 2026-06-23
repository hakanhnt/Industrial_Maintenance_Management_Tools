"use client";

import { useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp, Loader2, MessageSquareText } from "lucide-react";
import { AgentNode } from "@/components/agent-node";
import { AgentResponseCard } from "@/components/agent-response-card";
import { StatusPill } from "@/components/status-pill";
import { SuggestedQuestions } from "@/components/suggested-questions";
import { leadAgentProfile } from "@/lib/agents/profiles";
import type { AgentCode, AgentProfile, AskResponse } from "@/lib/models/maintenance";

interface ChatAgentReplyProps {
  round: AskResponse;
  agents: AgentProfile[];
  selectedAgentSet: Set<AgentCode>;
  isActive: boolean;
  activeAgentCode: AgentCode | null;
  isLoading: boolean;
  onSelectSuggestion: (question: string) => void;
}

export function ChatAgentReply({
  round,
  agents,
  selectedAgentSet,
  isActive,
  activeAgentCode,
  isLoading,
  onSelectSuggestion
}: ChatAgentReplyProps) {
  const [pipelineExpanded, setPipelineExpanded] = useState(false);

  const roundIsLoading = isActive && isLoading;
  const leadTurn = round.turns.find((t) => t.agent.code === "LEAD");
  const answeredTurns = round.turns.filter((t) => t.status !== "skipped");
  const showSuggestions = !roundIsLoading && round.suggestions.length > 0;

  return (
    <div className="space-y-3">
      {/* Pipeline toggle */}
      <button
        type="button"
        onClick={() => setPipelineExpanded((v) => !v)}
        className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted transition hover:text-platinum"
      >
        <span>CORE → FIELD → FLOW → BASE → KPI → LEAD</span>
        {pipelineExpanded ? (
          <ChevronUp className="size-3" />
        ) : (
          <ChevronDown className="size-3" />
        )}
      </button>

      {/* Expanded pipeline */}
      {pipelineExpanded && (
        <div className="glass-panel rounded-lg p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
              Multi-Agent Dialogue
            </span>
            <StatusPill tone={round.status === "grounded" ? "ready" : "muted"}>
              {roundIsLoading ? "Çalışıyor" : round.status}
            </StatusPill>
          </div>
          <div className="grid gap-2 sm:grid-cols-6">
            {agents.map((agent) => (
              <div key={agent.code} className="flex min-w-0 items-center gap-2 sm:block">
                <AgentNode
                  code={agent.code}
                  label={agent.name}
                  active={Boolean(
                    round.turns.some(
                      (t) => t.agent.code === agent.code && t.status !== "skipped"
                    )
                  )}
                  skipped={Boolean(
                    !selectedAgentSet.has(agent.code) ||
                      round.turns.some(
                        (t) => t.agent.code === agent.code && t.status === "skipped"
                      )
                  )}
                  working={roundIsLoading && activeAgentCode === agent.code}
                />
                <ArrowRight className="size-3.5 shrink-0 text-muted sm:mx-auto sm:my-2 sm:rotate-90" />
              </div>
            ))}
            <div className="flex min-w-0 items-center gap-2 sm:block">
              <AgentNode
                code="LEAD"
                label={leadAgentProfile.name}
                active={Boolean(
                  round.turns.some((t) => t.agent.code === "LEAD" && t.status !== "skipped")
                )}
                skipped={Boolean(
                  round.turns.some((t) => t.agent.code === "LEAD" && t.status === "skipped")
                )}
                working={roundIsLoading && activeAgentCode === "LEAD"}
              />
            </div>
          </div>
          {answeredTurns
            .filter((t) => t.agent.code !== "LEAD")
            .map((turn) => (
              <div key={turn.agent.code} className="mt-3">
                <AgentResponseCard turn={turn} />
              </div>
            ))}
        </div>
      )}

      {/* LEAD answer card */}
      <div className="glass-panel rounded-2xl rounded-tl-sm p-5">
        {answeredTurns.length === 0 && roundIsLoading ? (
          <div className="flex flex-col items-center py-6 text-center">
            <Loader2 className="size-7 animate-spin text-signal" />
            <p className="mt-3 text-sm text-muted">Ajanlar değerlendiriyor...</p>
          </div>
        ) : leadTurn ? (
          <>
            <div className="flex gap-3">
              <MessageSquareText className="mt-1 size-4 shrink-0 text-signal" />
              <p className="text-sm leading-7 text-[#ded8cc]">{leadTurn.content}</p>
            </div>
            {roundIsLoading && (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                <Loader2 className="size-3 animate-spin text-signal" />
                Ajanlar değerlendirmeye devam ediyor...
              </div>
            )}
            {showSuggestions && (
              <SuggestedQuestions
                suggestions={round.suggestions}
                onSelect={onSelectSuggestion}
              />
            )}
          </>
        ) : (
          !roundIsLoading && (
            <p className="text-sm text-muted">
              Bu soru mevcut ajan kapsamıyla yeterince eşleşmediği için yanıt üretilmedi.
            </p>
          )
        )}
      </div>
    </div>
  );
}
