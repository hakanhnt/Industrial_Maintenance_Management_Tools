# Chat UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the 3-column maintenance console into a full-screen ChatGPT-style chat interface with AI-generated follow-up question suggestions after each agent response.

**Architecture:** All state stays in the new root `ChatConsole` component (replacing `MaintenanceConsole`). Layout: sticky `ChatHeader` → scrollable `ChatMessageList` → sticky `ChatInput`. Ayarlar → `SettingsModal`, döküman yönetimi → `DocsDrawer`. Suggestions are generated server-side in `maintenance-agents.ts` after the LEAD turn and streamed in the `final` event.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, lucide-react, existing MiniMax client (`requestMiniMaxCompletion`)

## Global Constraints

- Tailwind tokens: `glass-panel`, `text-platinum`, `text-muted`, `text-signal`, `text-cyanline`, `text-copper`, `text-ink`, `bg-signal`, `hairline-grid`
- All new components use `"use client"` directive
- Turkish UI copy throughout — match existing labels exactly
- No `any`, no implicit types
- `maintenance-console.tsx` is kept but no longer imported — do not delete it
- No new npm packages

---

### Task 1: Add `suggestions` to data models

**Files:**
- Modify: `lib/models/maintenance.ts`

**Interfaces:**
- Produces: `AskResponse.suggestions: string[]`, `StreamEvent` final variant with `suggestions: string[]`

- [ ] **Step 1: Update AskResponse**

In `lib/models/maintenance.ts`, add `suggestions: string[]` to `AskResponse`:

```ts
export interface AskResponse {
  question: string;
  status: EvidenceStatus;
  executiveSummary: string;
  turns: AgentTurn[];
  citations: Array<{
    id: string;
    title: string;
    locationLabel: string;
  }>;
  suggestions: string[];
}
```

- [ ] **Step 2: Update StreamEvent final variant**

Replace the `final` variant in `StreamEvent`:

```ts
export type StreamEvent =
  | { type: "agent_start"; agent: AgentCode }
  | { type: "agent_turn"; turn: AgentTurn }
  | {
      type: "final";
      status: EvidenceStatus;
      executiveSummary: string;
      citations: AskResponse["citations"];
      suggestions: string[];
    }
  | { type: "error"; message: string };
```

- [ ] **Step 3: Verify — TypeScript will report expected errors**

Run: `npx tsc --noEmit`

Expected: Errors in `maintenance-agents.ts` (final yield missing `suggestions`) and `maintenance-console.tsx` (`emptyRound` missing `suggestions`). These are intentional — fixed in Tasks 2 and 11.

- [ ] **Step 4: Commit**

```bash
git add lib/models/maintenance.ts
git commit -m "feat(models): add suggestions field to AskResponse and StreamEvent final"
```

---

### Task 2: Backend — generate suggestions and emit in final event

**Files:**
- Modify: `lib/agents/minimax.ts`
- Modify: `lib/agents/maintenance-agents.ts`

**Interfaces:**
- Produces: `generateMiniMaxSuggestions(question: string, leadAnswer: string): Promise<string[]>` exported from `lib/agents/minimax.ts`

- [ ] **Step 1: Add generateMiniMaxSuggestions to minimax.ts**

Add this function at the end of `lib/agents/minimax.ts` (before any closing braces — this file has no wrapping scope):

```ts
export async function generateMiniMaxSuggestions(
  question: string,
  leadAnswer: string
): Promise<string[]> {
  const systemPrompt =
    "Sen bir endüstriyel bakım yönetimi asistanısın. Kullanıcının öğrenmesine yardımcı olmak için konuyla ilgili takip soruları öneriyorsun.";
  const userPrompt = [
    `Kullanıcı şu soruyu sordu: "${question}"`,
    ``,
    `Uzman şöyle yanıtladı: "${leadAnswer.slice(0, 800)}"`,
    ``,
    `Bu konuyla ilgili, kullanıcının sormak isteyebileceği 3 kısa Türkçe soru üret.`,
    `Sadece JSON array döndür, başka hiçbir şey yazma.`,
    `Örnek: ["Soru 1?", "Soru 2?", "Soru 3?"]`
  ].join("\n");

  const result = await requestMiniMaxCompletion(systemPrompt, userPrompt);
  if (!result) return [];

  try {
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed: unknown = JSON.parse(jsonMatch[0]);
    if (
      Array.isArray(parsed) &&
      parsed.every((item): item is string => typeof item === "string")
    ) {
      return parsed.slice(0, 3);
    }
    return [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Import generateMiniMaxSuggestions in maintenance-agents.ts**

Update the import line at the top of `lib/agents/maintenance-agents.ts`:

```ts
import {
  generateMiniMaxAgentTurn,
  generateMiniMaxLeadSynthesis,
  generateMiniMaxSuggestions
} from "@/lib/agents/minimax";
```

- [ ] **Step 3: Generate suggestions before final event**

In `lib/agents/maintenance-agents.ts`, replace the block at lines ~388–396 (after `turns.push(leadTurn)`):

```ts
  turns.push(leadTurn);
  yield { type: "agent_turn", turn: leadTurn };

  const suggestions = await generateMiniMaxSuggestions(
    normalizedQuestion,
    leadTurn.content
  );

  yield {
    type: "final",
    status,
    executiveSummary: "",
    citations: [],
    suggestions
  };
}
```

- [ ] **Step 4: Verify — only maintenance-console.tsx errors remain**

Run: `npx tsc --noEmit`

Expected: Only `maintenance-console.tsx` errors (stale `emptyRound`, stale `handleStreamEvent`). Fixed in Task 11.

- [ ] **Step 5: Commit**

```bash
git add lib/agents/minimax.ts lib/agents/maintenance-agents.ts
git commit -m "feat(backend): generate follow-up question suggestions after LEAD turn"
```

---

### Task 3: SuggestedQuestions component

**Files:**
- Create: `components/suggested-questions.tsx`

**Interfaces:**
- Consumes: `suggestions: string[]`, `onSelect: (question: string) => void`
- Produces: `<SuggestedQuestions>` — renders nothing when suggestions is empty

- [ ] **Step 1: Create the component**

```tsx
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
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

Expected: Same errors as before (only maintenance-console.tsx).

- [ ] **Step 3: Commit**

```bash
git add components/suggested-questions.tsx
git commit -m "feat(ui): add SuggestedQuestions chip component"
```

---

### Task 4: ChatUserBubble + ChatInput components

**Files:**
- Create: `components/chat-user-bubble.tsx`
- Create: `components/chat-input.tsx`

- [ ] **Step 1: Create chat-user-bubble.tsx**

```tsx
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
```

- [ ] **Step 2: Create chat-input.tsx**

```tsx
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
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`

Expected: No new errors from these two files.

- [ ] **Step 4: Commit**

```bash
git add components/chat-user-bubble.tsx components/chat-input.tsx
git commit -m "feat(ui): add ChatUserBubble and ChatInput components"
```

---

### Task 5: ChatAgentReply component

**Files:**
- Create: `components/chat-agent-reply.tsx`

**Interfaces:**
- Consumes: `round: AskResponse` (with `suggestions`), `agents: AgentProfile[]`, `selectedAgentSet: Set<AgentCode>`, `isActive: boolean`, `activeAgentCode: AgentCode | null`, `isLoading: boolean`, `onSelectSuggestion: (q: string) => void`

- [ ] **Step 1: Create the component**

```tsx
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
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

Expected: No new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add components/chat-agent-reply.tsx
git commit -m "feat(ui): add ChatAgentReply with collapsible pipeline and suggestions"
```

---

### Task 6: SettingsModal + DocsDrawer

**Files:**
- Create: `components/settings-modal.tsx`
- Create: `components/docs-drawer.tsx`

- [ ] **Step 1: Create settings-modal.tsx**

```tsx
"use client";

import { useEffect } from "react";
import { X, Sliders } from "lucide-react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  embeddingModel: string;
  onEmbeddingModelChange: (v: string) => void;
  customModel: string;
  onCustomModelChange: (v: string) => void;
  chunkSize: number;
  onChunkSizeChange: (v: number) => void;
  chunkOverlap: number;
  onChunkOverlapChange: (v: number) => void;
  indexName: string;
  onIndexNameChange: (v: string) => void;
}

export function SettingsModal({
  isOpen, onClose, embeddingModel, onEmbeddingModelChange,
  customModel, onCustomModelChange, chunkSize, onChunkSizeChange,
  chunkOverlap, onChunkOverlapChange, indexName, onIndexNameChange
}: SettingsModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    if (isOpen) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="glass-panel relative z-10 w-full max-w-md rounded-xl p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="size-4 text-signal" />
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
              Model & İndeks Ayarları
            </h2>
          </div>
          <button type="button" onClick={onClose} className="text-muted transition hover:text-platinum">
            <X className="size-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-muted">Embedding Modeli</label>
            <select
              value={embeddingModel}
              onChange={(e) => onEmbeddingModelChange(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-platinum outline-none transition focus:border-signal/50"
            >
              <option value="nomic-embed-text">nomic-embed-text (768d)</option>
              <option value="bge-m3">bge-m3 (1024d)</option>
              <option value="qwen3-embedding">qwen3-embedding</option>
              <option value="custom">{"Custom (Özel)"}</option>
            </select>
          </div>
          {embeddingModel === "custom" && (
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-muted">Özel Model İsmi</label>
              <input
                type="text"
                value={customModel}
                onChange={(e) => onCustomModelChange(e.target.value)}
                placeholder="Örn: nomic-embed-text"
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-platinum outline-none transition focus:border-signal/50"
              />
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-muted">Pinecone İndeks Adı</label>
            <input
              type="text"
              value={indexName}
              onChange={(e) => onIndexNameChange(e.target.value)}
              placeholder="bakim-rehber"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-platinum outline-none transition focus:border-signal/50"
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[11px] font-medium text-muted">Parçalama Boyutu</label>
              <span className="font-mono text-[10px] text-signal">{chunkSize} krktr</span>
            </div>
            <input type="range" min="100" max="2000" step="50" value={chunkSize}
              onChange={(e) => onChunkSizeChange(Number(e.target.value))}
              className="w-full accent-signal bg-white/10" />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[11px] font-medium text-muted">Çakışma Miktarı</label>
              <span className="font-mono text-[10px] text-signal">{chunkOverlap} krktr</span>
            </div>
            <input type="range" min="0" max="500" step="10" value={chunkOverlap}
              onChange={(e) => onChunkOverlapChange(Number(e.target.value))}
              className="w-full accent-signal bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create docs-drawer.tsx**

```tsx
"use client";

import { useEffect } from "react";
import {
  X, Upload, Database, FileText, XCircle, CheckCircle,
  AlertCircle, Loader2, RefreshCw, Layers, Info
} from "lucide-react";

export interface PineconeDocument {
  documentId: string;
  title: string;
  domain: string;
  chunkCount: number;
}

interface DocsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  indexName: string;
  embeddingModel: string;
  customModel: string;
  file: File | null;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearFile: () => void;
  onUpload: () => void;
  uploading: boolean;
  uploadLogs: string[];
  uploadSuccess: string | null;
  uploadError: string | null;
  pineconeDocuments: PineconeDocument[];
  loadingDocuments: boolean;
  documentListError: string | null;
  onFetchDocuments: () => void;
  lastDimension: number | null;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

export function DocsDrawer({
  isOpen, onClose, indexName, embeddingModel, customModel,
  file, onFileChange, onClearFile, onUpload, uploading,
  uploadLogs, uploadSuccess, uploadError, pineconeDocuments,
  loadingDocuments, documentListError, onFetchDocuments,
  lastDimension, fileInputRef
}: DocsDrawerProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    if (isOpen) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const activeModel = embeddingModel === "custom" ? customModel : embeddingModel;

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      )}
      <aside className={`fixed right-0 top-0 z-50 flex h-full w-[360px] flex-col bg-[#0d0d0d] shadow-2xl transition-transform duration-300 ${isOpen ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-sm font-semibold text-platinum">Döküman Yönetimi</h2>
          <button type="button" onClick={onClose} className="text-muted transition hover:text-platinum">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Upload */}
          <section className="glass-panel rounded-lg p-4">
            <div className="mb-3 flex items-center gap-2">
              <Upload className="size-4 text-signal" />
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Döküman Yükleme</h3>
            </div>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 bg-black/20 p-5 text-center transition hover:border-signal/50 hover:bg-black/35"
            >
              <input suppressHydrationWarning ref={fileInputRef} type="file"
                accept=".pdf,.epub,.txt,.md" onChange={onFileChange} className="hidden" />
              <Upload className="size-5 text-muted" />
              <span className="text-xs font-medium text-platinum">
                {file ? file.name : "Döküman Seçin veya Sürükleyin"}
              </span>
              <span className="text-[10px] text-muted">PDF, EPUB, TXT, MD (Maks 15MB)</span>
            </div>
            {file && (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="size-4 shrink-0 text-cyanline" />
                  <span className="truncate text-xs text-platinum">{file.name}</span>
                </div>
                <button type="button" onClick={onClearFile} className="text-muted transition hover:text-copper">
                  <XCircle className="size-4" />
                </button>
              </div>
            )}
            <button type="button" onClick={onUpload}
              disabled={!file || uploading || (embeddingModel === "custom" && !customModel.trim())}
              className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-signal/40 bg-signal px-4 text-sm font-semibold text-ink transition hover:bg-[#d8ff64] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-muted"
            >
              {uploading ? <><Loader2 className="size-4 animate-spin" />Yükleniyor...</> : <><Database className="size-4" />{"Vektör DB'ye Yükle"}</>}
            </button>
            {uploadSuccess && (
              <p className="mt-3 flex items-start gap-2 rounded border border-signal/20 bg-signal/5 p-2.5 text-xs text-signal">
                <CheckCircle className="mt-0.5 size-4 shrink-0" />{uploadSuccess}
              </p>
            )}
            {uploadError && (
              <p className="mt-3 flex items-start gap-2 rounded border border-copper/20 bg-copper/5 p-2.5 text-xs text-[#ffd3a6]">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />{uploadError}
              </p>
            )}
            {uploadLogs.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted">İşlem Günlüğü</p>
                <div className="h-32 overflow-y-auto rounded border border-white/5 bg-black/40 p-2.5 font-mono text-[10px] scrollbar-thin">
                  {uploadLogs.map((log, i) => (
                    <div key={i} className={log.startsWith("HATA") ? "text-[#ffd3a6]" : (log.startsWith("Başarılı") || log.startsWith("Döküman başarıyla")) ? "text-signal" : "text-muted"}>
                      {`> ${log}`}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
          {/* Document list */}
          <section className="glass-panel rounded-lg p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="size-4 text-signal" />
                <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Yüklü Dökümanlar</h3>
              </div>
              <button type="button" onClick={onFetchDocuments} disabled={loadingDocuments}
                className="flex items-center gap-1.5 text-[10px] text-muted transition hover:text-platinum disabled:opacity-50">
                <RefreshCw className={`size-3 ${loadingDocuments ? "animate-spin" : ""}`} />Listele
              </button>
            </div>
            {pineconeDocuments.length === 0 && !loadingDocuments && !documentListError && (
              <p className="py-4 text-center text-xs text-muted">Listeyi görmek için &quot;Listele&quot; butonuna tıklayın.</p>
            )}
            {loadingDocuments && (
              <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted">
                <Loader2 className="size-3 animate-spin" />Yükleniyor...
              </div>
            )}
            {documentListError && (
              <p className="flex items-start gap-2 rounded border border-copper/20 bg-copper/5 p-2.5 text-xs text-[#ffd3a6]">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />{documentListError}
              </p>
            )}
            {pineconeDocuments.length > 0 && (
              <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1 scrollbar-thin">
                {pineconeDocuments.map((doc) => (
                  <div key={doc.documentId} className="flex items-start justify-between gap-2 rounded border border-white/5 bg-white/[0.025] p-2 transition hover:border-white/10">
                    <div className="flex min-w-0 items-start gap-2">
                      <FileText className="mt-0.5 size-3.5 shrink-0 text-signal" />
                      <span className="truncate text-[11px] text-platinum" title={doc.title}>{doc.title}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-[10px] text-muted">{doc.chunkCount} parça</span>
                      <span className="rounded border border-white/5 bg-white/5 px-1.5 py-0.5 text-[9px] text-muted">{doc.domain}</span>
                    </div>
                  </div>
                ))}
                <p className="pt-1 text-center text-[10px] text-muted">
                  {pineconeDocuments.length} döküman · {pineconeDocuments.reduce((s, d) => s + d.chunkCount, 0)} toplam parça
                </p>
              </div>
            )}
          </section>
          {/* RAG summary */}
          <section className="glass-panel rounded-lg p-4">
            <div className="mb-3 flex items-center gap-2">
              <Info className="size-4 text-signal" />
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">RAG Sistem Özeti</h3>
            </div>
            <div className="space-y-2.5 font-mono text-[11px]">
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-muted">Embedding Modeli:</span>
                <span className="font-semibold text-platinum">{activeModel || "custom"}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-muted">Pinecone İndeksi:</span>
                <span className="font-semibold text-platinum">{indexName}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-muted">RAG Motoru:</span>
                <span className="font-semibold text-signal">MiniMax AI</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Boyut (Dimension):</span>
                <span className="font-semibold text-platinum">{lastDimension ? `${lastDimension}d` : "Otomatik"}</span>
              </div>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`

Expected: No new errors from these files.

- [ ] **Step 4: Commit**

```bash
git add components/settings-modal.tsx components/docs-drawer.tsx
git commit -m "feat(ui): add SettingsModal and DocsDrawer panel components"
```

---

### Task 7: ChatHeader + ChatMessageList

**Files:**
- Create: `components/chat-header.tsx`
- Create: `components/chat-message-list.tsx`

- [ ] **Step 1: Create chat-header.tsx**

```tsx
"use client";

import { FileText, RotateCcw, Settings, ShieldCheck } from "lucide-react";

interface ChatHeaderProps {
  onOpenSettings: () => void;
  onOpenDocs: () => void;
  onNewConversation: () => void;
  hasConversation: boolean;
  isLoading: boolean;
}

export function ChatHeader({
  onOpenSettings, onOpenDocs, onNewConversation, hasConversation, isLoading
}: ChatHeaderProps) {
  return (
    <header className="glass-panel sticky top-0 z-50 flex items-center justify-between gap-4 border-b border-white/10 px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="grid size-9 place-items-center rounded-lg border border-white/10 bg-white/[0.04]">
          <ShieldCheck className="size-4 text-signal" />
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-signal">
            Ollama + MiniMax RAG
          </p>
          <h1 className="text-base font-semibold leading-tight text-platinum">Bakım Rehberi</h1>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {hasConversation && (
          <button type="button" onClick={onNewConversation} disabled={isLoading}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-muted transition hover:border-white/20 hover:text-platinum disabled:cursor-not-allowed disabled:opacity-50">
            <RotateCcw className="size-3.5" />Yeni Sohbet
          </button>
        )}
        <button type="button" onClick={onOpenDocs}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-muted transition hover:border-white/20 hover:text-platinum">
          <FileText className="size-3.5" />Dökümanlar
        </button>
        <button type="button" onClick={onOpenSettings} aria-label="Ayarlar"
          className="grid size-8 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-muted transition hover:border-white/20 hover:text-platinum">
          <Settings className="size-4" />
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Create chat-message-list.tsx**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { Gauge } from "lucide-react";
import { ChatUserBubble } from "@/components/chat-user-bubble";
import { ChatAgentReply } from "@/components/chat-agent-reply";
import type { AgentCode, AgentProfile, AskResponse } from "@/lib/models/maintenance";

interface ChatMessageListProps {
  rounds: AskResponse[];
  agents: AgentProfile[];
  selectedAgentSet: Set<AgentCode>;
  isLoading: boolean;
  activeAgentCode: AgentCode | null;
  onSelectSuggestion: (question: string) => void;
}

export function ChatMessageList({
  rounds, agents, selectedAgentSet, isLoading, activeAgentCode, onSelectSuggestion
}: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [rounds, isLoading]);

  if (rounds.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="max-w-md text-center">
          <Gauge className="mx-auto size-9 text-signal" />
          <h2 className="mt-5 text-2xl font-semibold text-platinum">Bakım Rehberi</h2>
          <p className="mt-3 text-sm leading-7 text-muted">
            Dökümanlarınızı yükledikten sonra bakım yönetimi sorularınızı sorabilirsiniz.
            Ajanlar Pinecone üzerinde arama yaparak size yanıt verecektir.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-6 py-6">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        {rounds.map((round, index) => (
          <div key={index} className="space-y-4">
            <ChatUserBubble question={round.question} />
            <ChatAgentReply
              round={round}
              agents={agents}
              selectedAgentSet={selectedAgentSet}
              isActive={index === rounds.length - 1}
              activeAgentCode={activeAgentCode}
              isLoading={isLoading}
              onSelectSuggestion={onSelectSuggestion}
            />
          </div>
        ))}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`

Expected: No new errors from these files.

- [ ] **Step 4: Commit**

```bash
git add components/chat-header.tsx components/chat-message-list.tsx
git commit -m "feat(ui): add ChatHeader and ChatMessageList components"
```

---

### Task 8: ChatConsole root + page.tsx wiring

**Files:**
- Create: `components/chat-console.tsx`
- Modify: `app/page.tsx`

**Note on `handleSelectSuggestion`:** State updates are asynchronous in React, so `setQuestion(text)` followed by `submitQuestion()` would read the stale `question` value. The fix is to pass the override question directly into `submitQuestion`.

- [ ] **Step 1: Create chat-console.tsx**

```tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { ChatHeader } from "@/components/chat-header";
import { ChatMessageList } from "@/components/chat-message-list";
import { ChatInput } from "@/components/chat-input";
import { SettingsModal } from "@/components/settings-modal";
import { DocsDrawer, type PineconeDocument } from "@/components/docs-drawer";
import type {
  AgentCode,
  AgentProfile,
  AskResponse,
  ConversationHistoryEntry,
  StreamEvent
} from "@/lib/models/maintenance";

interface ChatConsoleProps {
  agents: AgentProfile[];
}

function emptyRound(question: string): AskResponse {
  return {
    question,
    status: "insufficient_sources",
    executiveSummary: "",
    turns: [],
    citations: [],
    suggestions: []
  };
}

export function ChatConsole({ agents }: ChatConsoleProps) {
  const [question, setQuestion] = useState("");
  const [rounds, setRounds] = useState<AskResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeAgentCode, setActiveAgentCode] = useState<AgentCode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDocsOpen, setIsDocsOpen] = useState(false);

  const [embeddingModel, setEmbeddingModel] = useState("nomic-embed-text");
  const [customModel, setCustomModel] = useState("");
  const [chunkSize, setChunkSize] = useState(750);
  const [chunkOverlap, setChunkOverlap] = useState(75);
  const [indexName, setIndexName] = useState("bakim-rehber");

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadLogs, setUploadLogs] = useState<string[]>([]);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastDimension, setLastDimension] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pineconeDocuments, setPineconeDocuments] = useState<PineconeDocument[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [documentListError, setDocumentListError] = useState<string | null>(null);

  const selectedAgentSet = useMemo(() => new Set(agents.map((a) => a.code)), [agents]);

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
    if (event.type === "agent_start") { setActiveAgentCode(event.agent); return; }
    if (event.type === "agent_turn") {
      updateLastRound((round) => ({ ...round, turns: [...round.turns, event.turn] }));
      return;
    }
    if (event.type === "final") {
      updateLastRound((round) => ({
        ...round,
        status: event.status,
        executiveSummary: event.executiveSummary,
        citations: event.citations,
        suggestions: event.suggestions
      }));
      return;
    }
    setError(event.message);
    dropLastRoundIfEmpty();
  }

  async function submitQuestion(overrideQuestion?: string) {
    const nextQuestion = (overrideQuestion ?? question).trim();
    if (!nextQuestion || isLoading) return;

    const history: ConversationHistoryEntry[] = rounds.map((round) => ({
      question: round.question,
      leadAnswer: round.turns.find((t) => t.agent.code === "LEAD")?.content ?? ""
    }));

    setIsLoading(true);
    setActiveAgentCode(null);
    setError(null);
    setRounds((current) => [...current, emptyRound(nextQuestion)]);
    if (!overrideQuestion) setQuestion("");

    const activeModel = embeddingModel === "custom" ? customModel : embeddingModel;

    try {
      const result = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: nextQuestion, model: activeModel, indexName, history })
      });

      if (!result.ok) {
        const payload = (await result.json()) as { error?: string };
        throw new Error(payload.error ?? "Ajan yanıtı alınamadı.");
      }
      if (!result.body) throw new Error("Ajan yanıtı alınamadı.");

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
      if (buffer.trim()) handleStreamEvent(JSON.parse(buffer) as StreamEvent);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Bilinmeyen hata.");
      dropLastRoundIfEmpty();
    } finally {
      setIsLoading(false);
      setActiveAgentCode(null);
    }
  }

  function handleSelectSuggestion(suggested: string) {
    setQuestion(suggested);
    void submitQuestion(suggested);
  }

  function startNewConversation() {
    if (isLoading) return;
    setRounds([]);
    setError(null);
    setQuestion("");
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.size > 15 * 1024 * 1024) {
        setUploadError("Dosya boyutu 15MB'ı geçemez.");
        setUploadLogs([`HATA: ${selectedFile.name} çok büyük`]);
        return;
      }
      setFile(selectedFile);
      setUploadSuccess(null);
      setUploadError(null);
      setUploadLogs([`Dosya seçildi: ${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)`]);
    }
  };

  const clearFile = () => {
    setFile(null);
    setUploadLogs([]);
    setUploadSuccess(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  async function handleFileUpload() {
    if (!file || uploading) return;
    setUploading(true);
    setUploadLogs(["Yükleme başlatılıyor..."]);
    setUploadSuccess(null);
    setUploadError(null);

    const activeModel = embeddingModel === "custom" ? customModel : embeddingModel;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("model", activeModel);
    formData.append("chunkSize", chunkSize.toString());
    formData.append("chunkOverlap", chunkOverlap.toString());
    formData.append("indexName", indexName);

    try {
      setUploadLogs((prev) => [...prev,
        `Dosya yükleniyor: ${file.name}`,
        `Seçilen Model: ${activeModel}`,
        `Parçalama Ayarları: ${chunkSize} karakter boyutu, ${chunkOverlap} çakışma`,
        `Pinecone İndeksi: ${indexName}`,
        "Backend metin ayıklama ve parçalama işlemi başladı..."
      ]);
      const response = await fetch("/api/pinecone/upload", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Döküman yüklenirken hata oluştu.");
      setUploadLogs((prev) => [...prev,
        `Döküman başarıyla işlendi.`,
        `Vektör Boyutu: ${data.dimension}d`,
        `Parça Sayısı: ${data.chunksCount}`,
        `Başarılı: ${data.message}`
      ]);
      setLastDimension(data.dimension);
      setUploadSuccess(`"${file.name}" başarıyla Pinecone vektör veritabanına yüklendi.`);
      void fetchPineconeDocuments();
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Bilinmeyen hata.";
      setUploadLogs((prev) => [...prev, `HATA: ${errMsg}`]);
      setUploadError(errMsg);
    } finally {
      setUploading(false);
    }
  }

  async function fetchPineconeDocuments() {
    setLoadingDocuments(true);
    setDocumentListError(null);
    try {
      const res = await fetch(`/api/pinecone/list?indexName=${encodeURIComponent(indexName)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Liste alınamadı.");
      setPineconeDocuments(data.documents ?? []);
    } catch (err) {
      setDocumentListError(err instanceof Error ? err.message : "Bilinmeyen hata.");
    } finally {
      setLoadingDocuments(false);
    }
  }

  return (
    <div className="hairline-grid flex h-screen flex-col text-platinum">
      <ChatHeader
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenDocs={() => setIsDocsOpen(true)}
        onNewConversation={startNewConversation}
        hasConversation={rounds.length > 0}
        isLoading={isLoading}
      />
      <ChatMessageList
        rounds={rounds}
        agents={agents}
        selectedAgentSet={selectedAgentSet}
        isLoading={isLoading}
        activeAgentCode={activeAgentCode}
        onSelectSuggestion={handleSelectSuggestion}
      />
      {error && (
        <div className="mx-auto w-full max-w-3xl px-6 pb-2">
          <p className="rounded-lg border border-copper/40 bg-copper/10 p-3 text-sm text-[#ffd3a6]">{error}</p>
        </div>
      )}
      <ChatInput
        value={question}
        onChange={setQuestion}
        onSubmit={() => void submitQuestion()}
        isLoading={isLoading}
        hasHistory={rounds.length > 0}
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        embeddingModel={embeddingModel}
        onEmbeddingModelChange={setEmbeddingModel}
        customModel={customModel}
        onCustomModelChange={setCustomModel}
        chunkSize={chunkSize}
        onChunkSizeChange={setChunkSize}
        chunkOverlap={chunkOverlap}
        onChunkOverlapChange={setChunkOverlap}
        indexName={indexName}
        onIndexNameChange={setIndexName}
      />
      <DocsDrawer
        isOpen={isDocsOpen}
        onClose={() => setIsDocsOpen(false)}
        indexName={indexName}
        embeddingModel={embeddingModel}
        customModel={customModel}
        file={file}
        onFileChange={handleFileChange}
        onClearFile={clearFile}
        onUpload={() => void handleFileUpload()}
        uploading={uploading}
        uploadLogs={uploadLogs}
        uploadSuccess={uploadSuccess}
        uploadError={uploadError}
        pineconeDocuments={pineconeDocuments}
        loadingDocuments={loadingDocuments}
        documentListError={documentListError}
        onFetchDocuments={() => void fetchPineconeDocuments()}
        lastDimension={lastDimension}
        fileInputRef={fileInputRef}
      />
    </div>
  );
}
```

- [ ] **Step 2: Update app/page.tsx**

```tsx
import { ChatConsole } from "@/components/chat-console";
import { agentProfiles } from "@/lib/agents/profiles";

export default async function Home() {
  return <ChatConsole agents={agentProfiles} />;
}
```

- [ ] **Step 3: Full compile check**

Run: `npx tsc --noEmit`

Expected: **Zero TypeScript errors.**

- [ ] **Step 4: Start dev server and verify manually**

Run: `npm run dev`

Open `http://localhost:3000` and check:
1. Full-screen layout renders — header at top, input at bottom, no sidebars
2. Empty state shows Gauge icon with description text
3. Type a question, press Enter → pipeline triggers, user bubble appears right-aligned, agent reply left-aligned
4. Pipeline toggle (CORE→FIELD→…→LEAD ▼) expands/collapses agent cards
5. After response completes, 3 suggestion chips appear below LEAD answer
6. Clicking a chip immediately sends it as a new question (no extra button press)
7. Clicking "Dökümanlar" opens the right-side drawer, ESC or backdrop closes it
8. Clicking "⚙" opens settings modal, ESC or backdrop closes it
9. "Yeni Sohbet" button appears after first question, clears history when clicked

- [ ] **Step 5: Commit**

```bash
git add components/chat-console.tsx app/page.tsx
git commit -m "feat(ui): wire up full-screen ChatConsole replacing maintenance console"
```
