# Chat Continuation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users ask follow-up questions in the same session; every round re-runs the full 6-agent pipeline with prior question+LEAD-answer pairs as context, and the UI shows prior rounds as collapsible chat history.

**Architecture:** Add a `ConversationHistoryEntry` type and an optional `history` field threaded from the frontend → `/api/ask` → `runMaintenanceAgentsStream` → MiniMax prompts. On the frontend, replace the single `response` state with a `rounds: AskResponse[]` array, extract the pipeline/response rendering into a new `ConversationRound` component that can render collapsed or expanded.

**Tech Stack:** Next.js (App Router), TypeScript, React 19

---

### Task 1: Add `ConversationHistoryEntry` type and extend `AskRequest`

**Files:**
- Modify: `lib/models/maintenance.ts`

- [ ] **Step 1: Add the new type and field**

In `/Users/hakan/Desktop/Bakım_Rehber/lib/models/maintenance.ts`, add a new exported interface anywhere near the other top-level interfaces (e.g. right before `export interface AskRequest`):

```ts
export interface ConversationHistoryEntry {
  question: string;
  leadAnswer: string;
}
```

Then update `AskRequest` (currently):

```ts
export interface AskRequest {
  question: string;
  mode?: "training" | "decision_support";
  selectedAgents?: AgentCode[];
}
```

to:

```ts
export interface AskRequest {
  question: string;
  mode?: "training" | "decision_support";
  selectedAgents?: AgentCode[];
  history?: ConversationHistoryEntry[];
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` from `/Users/hakan/Desktop/Bakım_Rehber`
Expected: passes (no consumers reference `history` yet, so this is purely additive).

- [ ] **Step 3: Commit**

```bash
git add lib/models/maintenance.ts
git commit -m "Add ConversationHistoryEntry type and history field to AskRequest"
```

---

### Task 2: Thread conversation history into MiniMax prompts

**Files:**
- Modify: `lib/agents/minimax.ts`

- [ ] **Step 1: Import the new type**

In `/Users/hakan/Desktop/Bakım_Rehber/lib/agents/minimax.ts`, update the top import (currently):

```ts
import type { AgentProfile, ReferenceChunk } from "@/lib/models/maintenance";
```

to:

```ts
import type { AgentProfile, ConversationHistoryEntry, ReferenceChunk } from "@/lib/models/maintenance";
```

- [ ] **Step 2: Add `buildHistoryBlock` helper**

Add this function after `wasTruncated` (around line 84), before `requestMiniMaxCompletion`:

```ts
function buildHistoryBlock(history?: ConversationHistoryEntry[]): string {
  if (!history || history.length === 0) {
    return "";
  }

  const rounds = history
    .map(
      (entry, index) =>
        `Tur ${index + 1} - Soru: ${entry.question}\nTur ${index + 1} - Yönetici Cevabı: ${entry.leadAnswer}`
    )
    .join("\n\n");

  return `\n\nÖnceki konuşma geçmişi:\n${rounds}\n\nYukarıdaki geçmişi takip sorusu için bağlam olarak kullan.`;
}
```

- [ ] **Step 3: Add `conversationHistory` to `GenerateAgentTurnInput` and use it**

Update the interface (currently lines 4-9):

```ts
interface GenerateAgentTurnInput {
  agent: AgentProfile;
  question: string;
  previousTurns: Array<{ code: string; content: string }>;
  evidence: ReferenceChunk[];
}
```

to:

```ts
interface GenerateAgentTurnInput {
  agent: AgentProfile;
  question: string;
  previousTurns: Array<{ code: string; content: string }>;
  evidence: ReferenceChunk[];
  conversationHistory?: ConversationHistoryEntry[];
}
```

In `generateMiniMaxAgentTurn`, change the `userPrompt` construction from (currently):

```ts
  const userPrompt = [
    `Kod adın: ${input.agent.code}. Rolün: ${input.agent.role}`,
    `Guardrail: ${input.agent.guardrail}`,
    "",
    `Kullanıcı sorusu: ${input.question}`,
    "",
    `Önceki ajan konuşmaları:\n${previousText || "Yok"}`,
    "",
    `Kanıt parçaları:\n${evidenceText || "Kanıt bulunamadı."}`,
    "",
    "Yanıtını en fazla 90 kelimelik 2-3 tam cümleyle Türkçe ver. Cevabı yarıda kesme. Kaynak adı, kaynak id'si veya citation yazma."
  ].join("\n");

  return requestMiniMaxCompletion(systemPrompt, userPrompt);
```

to:

```ts
  const userPrompt =
    [
      `Kod adın: ${input.agent.code}. Rolün: ${input.agent.role}`,
      `Guardrail: ${input.agent.guardrail}`,
      "",
      `Kullanıcı sorusu: ${input.question}`,
      "",
      `Önceki ajan konuşmaları:\n${previousText || "Yok"}`,
      "",
      `Kanıt parçaları:\n${evidenceText || "Kanıt bulunamadı."}`,
      "",
      "Yanıtını en fazla 90 kelimelik 2-3 tam cümleyle Türkçe ver. Cevabı yarıda kesme. Kaynak adı, kaynak id'si veya citation yazma."
    ].join("\n") + buildHistoryBlock(input.conversationHistory);

  return requestMiniMaxCompletion(systemPrompt, userPrompt);
```

- [ ] **Step 4: Add `conversationHistory` to `GenerateLeadSynthesisInput` and use it**

Update the interface (currently lines 178-181):

```ts
interface GenerateLeadSynthesisInput {
  question: string;
  turns: Array<{ code: string; name: string; content: string }>;
}
```

to:

```ts
interface GenerateLeadSynthesisInput {
  question: string;
  turns: Array<{ code: string; name: string; content: string }>;
  conversationHistory?: ConversationHistoryEntry[];
}
```

In `generateMiniMaxLeadSynthesis`, change the `userPrompt` construction from (currently):

```ts
  const userPrompt = [
    `Kullanıcı sorusu: ${input.question}`,
    "",
    `Uzman ajan yanıtları:\n${turnsText}`,
    "",
    "Yanıtını en fazla 120 kelimelik 3-4 tam cümleyle Türkçe ver. Cevabı yarıda kesme."
  ].join("\n");

  return requestMiniMaxCompletion(systemPrompt, userPrompt);
```

to:

```ts
  const userPrompt =
    [
      `Kullanıcı sorusu: ${input.question}`,
      "",
      `Uzman ajan yanıtları:\n${turnsText}`,
      "",
      "Yanıtını en fazla 120 kelimelik 3-4 tam cümleyle Türkçe ver. Cevabı yarıda kesme."
    ].join("\n") + buildHistoryBlock(input.conversationHistory);

  return requestMiniMaxCompletion(systemPrompt, userPrompt);
```

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint` from `/Users/hakan/Desktop/Bakım_Rehber`
Expected: both pass. No callers pass `conversationHistory` yet (optional field), so existing calls remain valid.

- [ ] **Step 6: Commit**

```bash
git add lib/agents/minimax.ts
git commit -m "Append conversation history block to MiniMax prompts"
```

---

### Task 3: Pass history through `runMaintenanceAgentsStream`

**Files:**
- Modify: `lib/agents/maintenance-agents.ts`

- [ ] **Step 1: Import `ConversationHistoryEntry`**

Update the type import block (currently lines 7-15):

```ts
import type {
  AgentCode,
  AgentProfile,
  AgentTurn,
  EvidenceStatus,
  MaintenanceDomain,
  ReferenceChunk,
  StreamEvent
} from "@/lib/models/maintenance";
```

to:

```ts
import type {
  AgentCode,
  AgentProfile,
  AgentTurn,
  ConversationHistoryEntry,
  EvidenceStatus,
  MaintenanceDomain,
  ReferenceChunk,
  StreamEvent
} from "@/lib/models/maintenance";
```

- [ ] **Step 2: Add `history` parameter to `generateAgentContent`**

Update `generateAgentContent` (currently lines 164-181):

```ts
async function generateAgentContent(
  agent: AgentProfile,
  question: string,
  previousTurns: AgentTurn[],
  evidence: ReferenceChunk[]
) {
  return generateMiniMaxAgentTurn({
    agent,
    question,
    previousTurns: previousTurns
      .filter((turn) => turn.content)
      .map((turn) => ({
        code: turn.agent.code,
        content: turn.content
      })),
    evidence
  });
}
```

to:

```ts
async function generateAgentContent(
  agent: AgentProfile,
  question: string,
  previousTurns: AgentTurn[],
  evidence: ReferenceChunk[],
  history?: ConversationHistoryEntry[]
) {
  return generateMiniMaxAgentTurn({
    agent,
    question,
    previousTurns: previousTurns
      .filter((turn) => turn.content)
      .map((turn) => ({
        code: turn.agent.code,
        content: turn.content
      })),
    evidence,
    conversationHistory: history
  });
}
```

- [ ] **Step 3: Add `history` parameter to `runMaintenanceAgentsStream` and forward it**

Update the generator signature (currently lines 183-186):

```ts
export async function* runMaintenanceAgentsStream(
  question: string,
  selectedAgents?: AgentCode[]
): AsyncGenerator<StreamEvent, void, unknown> {
```

to:

```ts
export async function* runMaintenanceAgentsStream(
  question: string,
  selectedAgents?: AgentCode[],
  history?: ConversationHistoryEntry[]
): AsyncGenerator<StreamEvent, void, unknown> {
```

Then update the two `generateAgentContent` call sites inside the loop. First (currently line 240):

```ts
        content = await generateAgentContent(agent, normalizedQuestion, turns, evidence);
```

to:

```ts
        content = await generateAgentContent(agent, normalizedQuestion, turns, evidence, history);
```

Second, inside the web-fallback retry block (currently lines 258-263):

```ts
          const webContent = await generateAgentContent(
            agent,
            normalizedQuestion,
            turns,
            webEvidence
          );
```

to:

```ts
          const webContent = await generateAgentContent(
            agent,
            normalizedQuestion,
            turns,
            webEvidence,
            history
          );
```

Finally, update the `generateMiniMaxLeadSynthesis` call (currently lines 314-321):

```ts
      (await generateMiniMaxLeadSynthesis({
        question: normalizedQuestion,
        turns: answeredTurns.map((turn) => ({
          code: turn.agent.code,
          name: turn.agent.name,
          content: turn.content
        }))
      }).catch(() => null)) ?? buildLeadFallbackSummary(answeredTurns);
```

to:

```ts
      (await generateMiniMaxLeadSynthesis({
        question: normalizedQuestion,
        turns: answeredTurns.map((turn) => ({
          code: turn.agent.code,
          name: turn.agent.name,
          content: turn.content
        })),
        conversationHistory: history
      }).catch(() => null)) ?? buildLeadFallbackSummary(answeredTurns);
```

- [ ] **Step 4: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build` from `/Users/hakan/Desktop/Bakım_Rehber`
Expected: all three pass.

- [ ] **Step 5: Commit**

```bash
git add lib/agents/maintenance-agents.ts
git commit -m "Forward conversation history through the agent pipeline"
```

---

### Task 4: Accept and validate `history` in `/api/ask`

**Files:**
- Modify: `app/api/ask/route.ts`

- [ ] **Step 1: Import the new type and add a validator**

Update the top import (currently):

```ts
import { runMaintenanceAgentsStream } from "@/lib/agents/maintenance-agents";
import type { AgentCode, AskRequest } from "@/lib/models/maintenance";
```

to:

```ts
import { runMaintenanceAgentsStream } from "@/lib/agents/maintenance-agents";
import type { AgentCode, AskRequest, ConversationHistoryEntry } from "@/lib/models/maintenance";
```

Add this helper function after the `agentCodes` constant (currently line 4):

```ts
function parseHistory(value: unknown): ConversationHistoryEntry[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const entries = value.filter((item): item is ConversationHistoryEntry => {
    if (typeof item !== "object" || item === null) {
      return false;
    }

    const candidate = item as Record<string, unknown>;
    return typeof candidate.question === "string" && typeof candidate.leadAnswer === "string";
  });

  return entries.length > 0 ? entries : undefined;
}
```

- [ ] **Step 2: Parse and forward `history`**

In the `POST` handler, after the existing `selectedAgents` parsing block (currently lines 28-30):

```ts
  const selectedAgents = Array.isArray(body.selectedAgents)
    ? body.selectedAgents.filter((agent): agent is AgentCode => agentCodes.has(agent))
    : undefined;
```

add:

```ts
  const history = parseHistory(body.history);
```

Then update the generator call (currently line 37):

```ts
        for await (const event of runMaintenanceAgentsStream(question, selectedAgents)) {
```

to:

```ts
        for await (const event of runMaintenanceAgentsStream(question, selectedAgents, history)) {
```

- [ ] **Step 3: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build` from `/Users/hakan/Desktop/Bakım_Rehber`
Expected: all three pass.

- [ ] **Step 4: Commit**

```bash
git add app/api/ask/route.ts
git commit -m "Accept and validate conversation history in /api/ask"
```

---

### Task 5: Frontend — rounds array, ConversationRound component, collapsing, new conversation

**Files:**
- Create: `components/conversation-round.tsx`
- Modify: `components/maintenance-console.tsx`

- [ ] **Step 1: Create `components/conversation-round.tsx`**

Write the following to `/Users/hakan/Desktop/Bakım_Rehber/components/conversation-round.tsx`:

```tsx
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
```

- [ ] **Step 2: Rewrite `components/maintenance-console.tsx`**

Replace the entire contents of `/Users/hakan/Desktop/Bakım_Rehber/components/maintenance-console.tsx` with:

```tsx
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
```

Note: the `Radar` icon import and the "Ajan Kapsamı" section's icon were removed since `Radar` is no longer used elsewhere in this file — do not re-add it.

- [ ] **Step 3: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build` from `/Users/hakan/Desktop/Bakım_Rehber`
Expected: all three pass cleanly. Pay attention to unused-import errors (`AgentResponseCard`, `AgentNode`, `StatusPill`'s old usage, `ArrowRight`, `leadAgentProfile`, `Radar` should all be gone from `maintenance-console.tsx`; `StatusPill` is still used for "Kaynak Durumu" so keep that import).

- [ ] **Step 4: Manual verification (dev server)**

Check if the dev server is running on port 3000 (`lsof -i :3000`); if not, start it in the background with `npm run dev`.

1. Open `http://localhost:3000` in a browser, submit the default sample question, wait for all 6 agents (including LEAD) to complete.
2. Type a follow-up question referencing the previous answer (e.g. "Bunu OEE ile ilişkilendir") and submit.
3. Confirm: the first round's question header collapses automatically (shows question + LEAD answer snippet), the second round renders expanded with its own pipeline + cards.
4. Click the first round's header to re-expand it; confirm it shows the full pipeline and agent cards again.
5. Click "Yeni Sohbet"; confirm both rounds are cleared and the screen returns to the "Ajan hattı çalıştırılmadı" empty state.
6. Via curl, confirm the second request's body includes a non-empty `history` array with the first round's question and LEAD answer:

```bash
curl -N -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "Bunu OEE ile ilişkilendir", "history": [{"question": "Kritik bir üretim hattında BCM ve RCM öncelikleri nasıl ayrıştırılmalı?", "leadAnswer": "Test cevabı"}]}' \
  --max-time 90
```

Confirm the stream completes without errors and agent responses are coherent (no crash from the added history block).

- [ ] **Step 5: Commit**

```bash
git add components/conversation-round.tsx components/maintenance-console.tsx
git commit -m "Add multi-round chat UI with collapsible conversation history"
```
