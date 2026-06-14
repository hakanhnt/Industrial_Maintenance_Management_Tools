"use client";

import { useMemo, useState } from "react";
import {
  Database,
  FileStack,
  Gauge,
  Loader2,
  RotateCcw,
  Send,
  ShieldCheck,
  Users
} from "lucide-react";
import { ConversationRound } from "@/components/conversation-round";
import { StatusPill } from "@/components/status-pill";
import type {
  AgentCode,
  AgentProfile,
  AskResponse,
  ConversationHistoryEntry,
  ReferenceDocument,
  StreamEvent
} from "@/lib/models/maintenance";

interface MaintenanceConsoleProps {
  agents: AgentProfile[];
  documents: ReferenceDocument[];
}

const sampleQuestions = [
  "Kritik bir üretim hattında BCM ve RCM öncelikleri nasıl ayrıştırılmalı?",
  "Bir ekipman için component-level minifile yapısını nasıl kurmalıyız?",
  "Otonom bakım kontrol listesi operatör ve bakım ekibi arasında nasıl paylaşılmalı?",
  "Planlı bakım backlog'unu hangi karar kapılarıyla yönetmeliyiz?",
  "Haftalık iş emri çizelgesinde kaynak kısıtı nasıl görünür hale getirilmeli?",
  "OEE ve MTTR birlikte yorumlanırken hangi veri sınırları korunmalı?",
  "MTBF düşerken OEE sabit kalıyorsa hangi hipotezler test edilmeli?",
  "Kestirimci bakım uyarısı iş emrine dönüşmeden önce hangi kanıtlar aranmalı?",
  "TPM uygulamasında saha gözlemleri KPI panosuna nasıl bağlanmalı?",
  "Arıza geçmişi zayıf olan yeni ekipman için bakım stratejisi nasıl başlatılmalı?"
];

function emptyRound(question: string): AskResponse {
  return {
    question,
    status: "insufficient_sources",
    executiveSummary: "",
    turns: [],
    citations: []
  };
}

export function MaintenanceConsole({ agents, documents }: MaintenanceConsoleProps) {
  const [question, setQuestion] = useState(sampleQuestions[0]);
  const [rounds, setRounds] = useState<AskResponse[]>([]);
  const [collapsedRoundIndexes, setCollapsedRoundIndexes] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [activeAgentCode, setActiveAgentCode] = useState<AgentCode | null>(null);
  const [selectedAgents, setSelectedAgents] = useState<AgentCode[]>(
    agents.map((agent) => agent.code)
  );
  const [error, setError] = useState<string | null>(null);

  const uploadedDocumentCount = useMemo(
    () => documents.filter((document) => document.sourceType !== "brief").length,
    [documents]
  );

  const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;
  const answeredTurns = lastRound?.turns.filter((turn) => turn.status !== "skipped") ?? [];
  const skippedTurns = lastRound?.turns.filter((turn) => turn.status === "skipped") ?? [];
  const selectedAgentSet = useMemo(() => new Set(selectedAgents), [selectedAgents]);

  function toggleAgent(agentCode: AgentCode) {
    setError(null);

    setSelectedAgents((current) => {
      if (current.includes(agentCode)) {
        return current.length === 1
          ? current
          : current.filter((code) => code !== agentCode);
      }

      return [...current, agentCode];
    });
  }

  function agentScopeLabel(agentCode: AgentCode) {
    const turn = lastRound?.turns.find((item) => item.agent.code === agentCode);

    if (!selectedAgentSet.has(agentCode)) {
      return "seçilmedi";
    }

    if (turn?.status === "skipped") {
      return "atlanmış";
    }

    if (turn?.status === "web_fallback") {
      return "web destekli";
    }

    if (turn) {
      return "yanıtladı";
    }

    if (isLoading) {
      return "bekliyor";
    }

    return "hazır";
  }

  function updateLastRound(updater: (round: AskResponse) => AskResponse) {
    setRounds((current) => {
      if (current.length === 0) return current;
      const next = [...current];
      next[next.length - 1] = updater(next[next.length - 1]);
      return next;
    });
  }

  function dropLastRoundIfEmpty() {
    setRounds((current) => {
      if (current.length === 0) return current;
      const last = current[current.length - 1];
      return last.turns.length === 0 ? current.slice(0, -1) : current;
    });
  }

  function handleStreamEvent(event: StreamEvent) {
    if (event.type === "agent_start") {
      setActiveAgentCode(event.agent);
      return;
    }

    if (event.type === "agent_turn") {
      updateLastRound((round) => ({ ...round, turns: [...round.turns, event.turn] }));
      return;
    }

    if (event.type === "final") {
      updateLastRound((round) => ({
        ...round,
        status: event.status,
        executiveSummary: event.executiveSummary,
        citations: event.citations
      }));
      return;
    }

    setError(event.message);
    dropLastRoundIfEmpty();
  }

  async function submitQuestion() {
    const nextQuestion = question.trim();
    if (!nextQuestion || isLoading) return;

    const history: ConversationHistoryEntry[] = rounds.map((round) => ({
      question: round.question,
      leadAnswer: round.turns.find((turn) => turn.agent.code === "LEAD")?.content ?? ""
    }));

    setIsLoading(true);
    setActiveAgentCode(null);
    setError(null);
    setCollapsedRoundIndexes((current) => {
      const next = new Set(current);
      for (let index = 0; index < rounds.length; index += 1) {
        next.add(index);
      }
      return next;
    });
    setRounds((current) => [...current, emptyRound(nextQuestion)]);
    setQuestion("");

    try {
      const result = await fetch("/api/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          question: nextQuestion,
          mode: "training",
          selectedAgents,
          history
        })
      });

      if (!result.ok) {
        const payload = (await result.json()) as { error?: string };
        throw new Error(payload.error ?? "Ajan yanıtı alınamadı.");
      }

      if (!result.body) {
        throw new Error("Ajan yanıtı alınamadı.");
      }

      const reader = result.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          handleStreamEvent(JSON.parse(line) as StreamEvent);
        }
      }

      if (buffer.trim()) {
        handleStreamEvent(JSON.parse(buffer) as StreamEvent);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Bilinmeyen hata.");
      dropLastRoundIfEmpty();
    } finally {
      setIsLoading(false);
      setActiveAgentCode(null);
    }
  }

  function startNewConversation() {
    if (isLoading) return;
    setRounds([]);
    setCollapsedRoundIndexes(new Set());
    setError(null);
    setQuestion(sampleQuestions[0]);
  }

  return (
    <main className="hairline-grid min-h-screen px-4 py-5 text-platinum sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-[1500px] gap-5 xl:grid-cols-[340px_minmax(0,1fr)_320px]">
        <aside className="space-y-5">
          <section className="glass-panel rounded-lg p-5">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
                  AI-First
                </p>
                <h1 className="mt-2 text-2xl font-semibold leading-tight text-platinum">
                  Bakım Yönetimi Rehberi
                </h1>
              </div>
              <div className="grid size-11 place-items-center rounded-lg border border-white/10 bg-white/[0.04]">
                <ShieldCheck className="size-5 text-signal" />
              </div>
            </div>

            <label className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
              {rounds.length === 0 ? "Soru" : "Takip Sorusu"}
            </label>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              className="mt-3 min-h-40 w-full resize-none rounded-lg border border-white/10 bg-black/30 p-4 text-sm leading-6 text-platinum outline-none transition placeholder:text-muted focus:border-signal/50 focus:ring-2 focus:ring-signal/15"
              placeholder="Bakım yönetimi sorusu yazın..."
            />

            <div className="mt-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted">
                <Users className="size-3.5 text-signal" />
                Ajan Seçimi
              </div>
              <div className="grid grid-cols-5 gap-2">
                {agents.map((agent) => {
                  const selected = selectedAgents.includes(agent.code);

                  return (
                    <button
                      key={agent.code}
                      type="button"
                      onClick={() => toggleAgent(agent.code)}
                      disabled={isLoading}
                      title={agent.role}
                      className={[
                        "h-10 rounded-lg border font-mono text-[11px] font-semibold transition",
                        selected
                          ? "border-signal/50 bg-signal/15 text-signal shadow-[0_0_18px_rgba(201,242,77,0.12)]"
                          : "border-white/10 bg-white/[0.03] text-muted hover:border-white/20 hover:text-platinum",
                        isLoading ? "cursor-not-allowed opacity-70" : ""
                      ].join(" ")}
                    >
                      {agent.code}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={submitQuestion}
              disabled={isLoading || !question.trim()}
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-signal/40 bg-signal px-4 text-sm font-semibold text-ink transition hover:bg-[#d8ff64] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-muted"
            >
              {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {rounds.length === 0 ? "Ajanları Çalıştır" : "Takip Sorusu Gönder"}
            </button>

            {rounds.length > 0 && (
              <button
                type="button"
                onClick={startNewConversation}
                disabled={isLoading}
                className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 text-sm font-medium text-muted transition hover:border-white/20 hover:text-platinum disabled:cursor-not-allowed disabled:opacity-70"
              >
                <RotateCcw className="size-4" />
                Yeni Sohbet
              </button>
            )}

            {error && (
              <p className="mt-3 rounded-lg border border-copper/40 bg-copper/10 p-3 text-sm text-[#ffd3a6]">
                {error}
              </p>
            )}
          </section>

          <section className="glass-panel rounded-lg p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted">
                Kaynak Durumu
              </h2>
              <StatusPill tone={uploadedDocumentCount > 0 ? "ready" : "warning"}>
                {uploadedDocumentCount > 0 ? "Aktif" : "Bekliyor"}
              </StatusPill>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                <FileStack className="size-4 text-cyanline" />
                <div className="mt-4 text-2xl font-semibold">{uploadedDocumentCount}</div>
                <div className="mt-1 text-xs text-muted">PDF/EPUB</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                <Database className="size-4 text-signal" />
                <div className="mt-4 text-2xl font-semibold">{documents.length}</div>
                <div className="mt-1 text-xs text-muted">Kayıt</div>
              </div>
            </div>
          </section>
        </aside>

        <section className="min-w-0 space-y-5">
          {rounds.length === 0 ? (
            <div className="glass-panel flex min-h-[420px] items-center justify-center rounded-lg p-6">
              <div className="max-w-xl text-center">
                <Gauge className="mx-auto size-9 text-signal" />
                <h2 className="mt-5 text-2xl font-semibold text-platinum">
                  Ajan hattı çalıştırılmadı
                </h2>
                <p className="mt-3 text-sm leading-7 text-muted">
                  İlk cevap, yüklenen referanslar olmadığı için kaynak yetersizliği davranışını
                  gösterecek. PDF içerikleri eklendiğinde aynı ekran kanıtlı eğitim akışına dönüşür.
                </p>
              </div>
            </div>
          ) : (
            rounds.map((round, index) => (
              <ConversationRound
                key={index}
                round={round}
                agents={agents}
                selectedAgentSet={selectedAgentSet}
                isActive={index === rounds.length - 1}
                activeAgentCode={activeAgentCode}
                isLoading={isLoading}
                collapsed={collapsedRoundIndexes.has(index)}
                onToggleCollapse={() =>
                  setCollapsedRoundIndexes((current) => {
                    const next = new Set(current);
                    if (next.has(index)) {
                      next.delete(index);
                    } else {
                      next.add(index);
                    }
                    return next;
                  })
                }
              />
            ))
          )}
        </section>

        <aside className="space-y-5">
          <section className="glass-panel rounded-lg p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted">
              Hızlı Sorular
            </h2>
            <div className="mt-4 space-y-3">
              {sampleQuestions.map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => setQuestion(item)}
                  className="w-full rounded-lg border border-white/10 bg-white/[0.035] p-3 text-left text-sm leading-6 text-[#d8d0c2] transition hover:border-signal/40 hover:bg-signal/[0.06]"
                >
                  {item}
                </button>
              ))}
            </div>
          </section>

          <section className="glass-panel rounded-lg p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted">
                Ajan Kapsamı
              </h2>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                <div className="text-2xl font-semibold text-platinum">
                  {lastRound ? answeredTurns.length : "-"}
                </div>
                <div className="mt-1 text-xs text-muted">yanıtlayan</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                <div className="text-2xl font-semibold text-platinum">
                  {lastRound ? skippedTurns.length : "-"}
                </div>
                <div className="mt-1 text-xs text-muted">atlanan</div>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {agents.map((agent) => {
                return (
                  <div
                    key={agent.code}
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                  >
                    <span className="font-mono text-xs text-platinum">{agent.code}</span>
                    <span className="text-xs text-muted">{agentScopeLabel(agent.code)}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
