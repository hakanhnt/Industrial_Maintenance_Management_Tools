# Chat UI Redesign — ChatGPT-Style Interface with Suggested Questions

**Date:** 2026-06-21  
**Status:** Approved

---

## Overview

Transform the current 3-column maintenance console into a full-screen ChatGPT-style chat interface. The existing multi-round conversation infrastructure (rounds state, history forwarding) is preserved; only the UI shell and a small API extension change.

Two new capabilities are added:
1. A chat-focused layout where messages flow top-to-bottom with a sticky input bar at the bottom.
2. After each LEAD agent response, the backend generates 3 contextual follow-up question suggestions which appear as clickable chips.

---

## Architecture

### Layout

```
┌─────────────────────────────────────────────────┐
│  HEADER (sticky top)                            │
│  [🛡 Bakım Rehberi]    [📁 Dökümanlar] [⚙] [↺] │
├─────────────────────────────────────────────────┤
│  CHAT AREA (scrollable, 100dvh - header - input)│
│                                                 │
│    👤  OEE nasıl hesaplanır?          (right)  │
│                                                 │
│    🤖  [CORE→FIELD→FLOW→BASE→KPI→LEAD ▼]      │
│        LEAD response streams here...            │
│        [📄 Kaynaklar (N) ▼]                    │
│        ─────────────────────────────────────── │
│        💡 Önerilen sorular:                     │
│        [Six Big Losses?] [SMED?] [TPM?]        │
│                                                 │
├─────────────────────────────────────────────────┤
│  INPUT BAR (sticky bottom)                      │
│  [Sorunuzu yazın...                  ] [►]      │
│   Enter → gönder · Shift+Enter → yeni satır     │
└─────────────────────────────────────────────────┘
```

### Component Tree

| Component | Responsibility |
|---|---|
| `ChatConsole` | Root orchestrator; holds all state (replaces `MaintenanceConsole`) |
| `ChatHeader` | Logo, DocsDrawer trigger, SettingsModal trigger, new-conversation button |
| `ChatMessageList` | Scrollable message container; auto-scrolls to bottom on new content |
| `ChatUserBubble` | Right-aligned user question bubble |
| `ChatAgentReply` | Left-aligned agent response: LEAD text + collapsible pipeline + evidence + suggestions |
| `SuggestedQuestions` | 3 clickable chips; clicking sends the question immediately |
| `SettingsModal` | Modal overlay for embedding model, index name, chunk size/overlap settings |
| `DocsDrawer` | Right slide-in drawer: document upload + document list + RAG summary |
| `ChatInput` | Sticky bottom: auto-growing textarea + send button |

Existing components `AgentResponseCard`, `AgentNode`, `ConversationRound`, and `StatusPill` are reused inside `ChatAgentReply` rather than replaced.

---

## API Changes

### `lib/models/maintenance.ts`

Add `suggestions: string[]` to the `final` stream event and to `AskResponse`:

```ts
// StreamEvent — final variant
{
  type: "final";
  status: EvidenceStatus;
  executiveSummary: string;
  citations: AskResponse["citations"];
  suggestions: string[];   // new
}

// AskResponse
interface AskResponse {
  question: string;
  status: EvidenceStatus;
  executiveSummary: string;
  turns: AgentTurn[];
  citations: Array<{ id: string; title: string; locationLabel: string }>;
  suggestions: string[];   // new
}
```

### `/api/ask/route.ts`

After the LEAD agent turn is recorded and before writing the `final` event, make one additional lightweight MiniMax call:

**Prompt template:**
```
Kullanıcı şu soruyu sordu: "{question}"
Bakım uzmanı şöyle yanıtladı: "{leadAnswer}"

Bu konuyla ilgili, kullanıcının sormak isteyebileceği 3 kısa Türkçe soru üret.
Sadece JSON array döndür, başka hiçbir şey yazma.
Örnek: ["Soru 1?", "Soru 2?", "Soru 3?"]
```

- If the MiniMax call fails or returns malformed JSON, `suggestions` defaults to `[]` — the UI silently skips the chips section.
- The call uses the same MiniMax client already in use; no new dependency.

---

## Component Details

### ChatHeader
- Left: shield icon + "Bakım Rehberi" heading + "Ollama + MiniMax RAG" monospace label
- Right: `[📁 Dökümanlar]` (opens DocsDrawer) + `[⚙]` (opens SettingsModal) + `[↺ Yeni Sohbet]` (visible only when rounds.length > 0, disabled while loading)
- Styled as `glass-panel`, `sticky top-0 z-50`

### ChatMessageList
- `flex flex-col gap-6 overflow-y-auto px-4 py-6`
- Height: `calc(100dvh - headerHeight - inputBarHeight)`
- On each new message, calls `scrollIntoView({ behavior: "smooth" })` on a bottom anchor ref
- Empty state: centered `Gauge` icon + descriptive text (reused from current console)

### ChatUserBubble
- Right-aligned (`ml-auto`), `max-w-[70%]`
- `glass-panel` + `border-signal/20` accent
- Small `SORU` monospace label above the question text

### ChatAgentReply
- Full-width left-aligned block
- Sections (top to bottom):
  1. **Pipeline toggle** — "CORE → FIELD → FLOW → BASE → KPI → LEAD ▼" button; expands to show `AgentNode` grid + individual `AgentResponseCard` turns (collapsed by default)
  2. **LEAD answer** — streams in directly; uses `MessageSquareText` icon
  3. **Evidence toggle** — reuses existing `AgentResponseCard` evidence UI
  4. **Suggested questions** — hidden during streaming; fades in after `final` event with `suggestions.length > 0`

### SuggestedQuestions
- Three `<button>` chips, styled `border border-signal/30 bg-signal/5 hover:bg-signal/15 rounded-full px-3 py-1.5 text-xs`
- Clicking: `setQuestion(text)` then immediately calls `submitQuestion()`
- Hidden (returns `null`) when `suggestions` is empty

### SettingsModal
- Triggered by ⚙ button in header
- `dialog` element with backdrop, closeable via ESC or clicking outside
- Content: exact copy of current "Model & İndeks Ayarları" section (embedding model select, custom model input, index name input, chunk size slider, overlap slider)

### DocsDrawer
- Triggered by 📁 button in header
- Slides in from the right (`translate-x-full → translate-x-0`), `w-[360px]`, `h-full`, `fixed right-0 top-0 z-40`
- Content: exact copy of current right sidebar (Döküman Yükleme + Yüklü Dökümanlar + RAG Sistem Özeti sections)
- Closeable via × button or clicking the backdrop overlay

### ChatInput
- `textarea` with `rows={1}`, auto-grows to max 5 rows via `onInput` height calculation
- `Enter` → `submitQuestion()`, `Shift+Enter` → inserts newline
- Disabled + spinner shown while `isLoading === true`
- Styled: `glass-panel rounded-2xl` container, send button with `Send` icon

---

## State Management

All state stays in `ChatConsole` (same as current `MaintenanceConsole`). No new state atoms are introduced. The `AskResponse` type gains `suggestions: string[]`, initialized as `[]` in `emptyRound()`.

Settings state (`embeddingModel`, `customModel`, `chunkSize`, `chunkOverlap`, `indexName`) moves with the rest of the state into `ChatConsole` and is passed down to `SettingsModal` via props/callbacks — no change to state shape.

---

## Files to Create

| File | Notes |
|---|---|
| `components/chat-console.tsx` | Replaces `maintenance-console.tsx` as the root component |
| `components/chat-header.tsx` | New |
| `components/chat-message-list.tsx` | New |
| `components/chat-user-bubble.tsx` | New |
| `components/chat-agent-reply.tsx` | New; wraps existing `AgentResponseCard` / `AgentNode` |
| `components/suggested-questions.tsx` | New |
| `components/settings-modal.tsx` | New; extracts settings from current sidebar |
| `components/docs-drawer.tsx` | New; extracts upload/list from current sidebar |
| `components/chat-input.tsx` | New |

## Files to Modify

| File | Change |
|---|---|
| `lib/models/maintenance.ts` | Add `suggestions: string[]` to `AskResponse` and `StreamEvent` final variant |
| `app/api/ask/route.ts` | Generate suggestions after LEAD turn, include in `final` event |
| `app/page.tsx` | Import `ChatConsole` instead of `MaintenanceConsole` |

## Files to Keep Unchanged

`components/agent-response-card.tsx`, `components/agent-node.tsx`, `components/conversation-round.tsx`, `components/status-pill.tsx` — reused as-is inside `ChatAgentReply`.

`components/maintenance-console.tsx` — kept but no longer imported from `app/page.tsx`. Can be deleted in a follow-up cleanup after the new UI is verified.

---

## Error Handling

- Suggestion generation failure → `suggestions: []` → `SuggestedQuestions` renders nothing
- Stream errors → existing `error` state handling unchanged
- DocsDrawer upload errors → existing upload error state unchanged

---

## Out of Scope

- Conversation persistence (localStorage / database) — not in this spec
- Multi-session history sidebar (like ChatGPT's left panel) — not in this spec
- Markdown rendering in chat bubbles — not in this spec
