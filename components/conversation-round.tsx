"use client";

import { ArrowRight, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { AgentNode } from "@/components/agent-node";
import { AgentResponseCard } from "@/components/agent-response-card";
import { StatusPill } from "@/components/status-pill";
import { leadAgentProfile } from "@/lib/agents/profiles";
import type { AgentCode, AgentProfile, AskResponse } from "@/lib/models/maintenance";

interface ConversationRoundProps {
  round: AskResponse;
  agents: AgentProfile[];
  selectedAgentSet: Set<AgentCode>;
  isActive: boolean;
  activeAgentCode: AgentCode | null;
  isLoading: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function ConversationRound({
  round,
  agents,
  selectedAgentSet,
  isActive,
  activeAgentCode,
  isLoading,
  collapsed,
  onToggleCollapse
}: ConversationRoundProps) {
  const answeredTurns = round.turns.filter((turn) => turn.status !== "skipped");
  const leadTurn = round.turns.find((turn) => turn.agent.code === "LEAD");
  const roundIsLoading = isActive && isLoading;

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onToggleCollapse}
        className="glass-panel flex w-full items-center justify-between gap-3 rounded-lg p-5 text-left"
      >
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">Soru</p>
          <h2 className="mt-2 truncate text-sm font-semibold text-platinum">{round.question}</h2>
          {collapsed && leadTurn?.content && (
            <p className="mt-2 truncate text-xs text-muted">{leadTurn.content}</p>
          )}
        </div>
        {collapsed ? (
          <ChevronDown className="size-4 shrink-0 text-muted" />
        ) : (
          <ChevronUp className="size-4 shrink-0 text-muted" />
        )}
      </button>

      {!collapsed && (
        <>
          <div className="glass-panel rounded-lg p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
                  Multi-Agent Dialogue
                </p>
                <h2 className="mt-2 text-xl font-semibold text-platinum">
                  CORE → FIELD → FLOW → BASE → KPI → LEAD
                </h2>
              </div>
              <StatusPill tone={round.status === "grounded" ? "ready" : "muted"}>
                {roundIsLoading ? "Çalışıyor" : round.status}
              </StatusPill>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-6">
              {agents.map((agent) => (
                <div key={agent.code} className="flex min-w-0 items-center gap-3 lg:block">
                  <AgentNode
                    code={agent.code}
                    label={agent.name}
                    active={Boolean(
                      round.turns.some(
                        (turn) => turn.agent.code === agent.code && turn.status !== "skipped"
                      )
                    )}
                    skipped={Boolean(
                      !selectedAgentSet.has(agent.code) ||
                        round.turns.some(
                          (turn) => turn.agent.code === agent.code && turn.status === "skipped"
                        )
                    )}
                    working={roundIsLoading && activeAgentCode === agent.code}
                  />
                  <ArrowRight className="size-4 shrink-0 text-muted lg:mx-auto lg:my-3 lg:rotate-90" />
                </div>
              ))}
              <div className="flex min-w-0 items-center gap-3 lg:block">
                <AgentNode
                  code="LEAD"
                  label={leadAgentProfile.name}
                  active={Boolean(
                    round.turns.some(
                      (turn) => turn.agent.code === "LEAD" && turn.status !== "skipped"
                    )
                  )}
                  skipped={Boolean(
                    round.turns.some(
                      (turn) => turn.agent.code === "LEAD" && turn.status === "skipped"
                    )
                  )}
                  working={roundIsLoading && activeAgentCode === "LEAD"}
                />
              </div>
            </div>
          </div>

          {answeredTurns.length === 0 && roundIsLoading ? (
            <div className="glass-panel flex min-h-[420px] items-center justify-center rounded-lg p-6">
              <div className="max-w-xl text-center">
                <Loader2 className="mx-auto size-9 animate-spin text-signal" />
                <h2 className="mt-5 text-2xl font-semibold text-platinum">Ajanlar değerlendiriyor</h2>
                <p className="mt-3 text-sm leading-7 text-muted">
                  Soru önce ilgili ajan alanlarıyla eşleştiriliyor, ardından yalnızca gerekli
                  ajanlar kanıt parçalarıyla yanıt üretiyor.
                </p>
              </div>
            </div>
          ) : (
            <>
              {answeredTurns.map((turn) => (
                <AgentResponseCard key={turn.agent.code} turn={turn} />
              ))}
              {!roundIsLoading && answeredTurns.length === 0 && (
                <div className="glass-panel rounded-lg p-5 text-sm leading-7 text-muted">
                  Bu soru mevcut ajan kapsamıyla yeterince eşleşmediği için yanıt üretilmedi.
                </div>
              )}
              {roundIsLoading && (
                <div className="glass-panel flex items-center gap-3 rounded-lg p-4 text-sm text-muted">
                  <Loader2 className="size-4 animate-spin text-signal" />
                  Ajanlar değerlendirmeye devam ediyor...
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
