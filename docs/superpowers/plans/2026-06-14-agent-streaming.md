# Ajan-bazlı Streaming Yanıt Akışı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/api/ask` her ajan turu tamamlandığında sonucu NDJSON satırı olarak akıtsın; frontend bu satırları okuyup ajan kartlarını tek tek, tamamlandıkça render etsin.

**Architecture:** `runMaintenanceAgents` async generator'a (`runMaintenanceAgentsStream`) dönüştürülür ve `agent_start` / `agent_turn` / `final` / `error` event'leri yield eder. `app/api/ask/route.ts` bu generator'ı `ReadableStream` ile NDJSON'a sarar. `maintenance-console.tsx`, `fetch().body.getReader()` ile akışı okuyup state'i artımlı güncelleyerek mevcut fake "çalışıyor" animasyonunun yerine gerçek sunucu durumunu gösterir.

**Tech Stack:** Next.js App Router (Route Handlers), TypeScript, React 19, Web Streams API (`ReadableStream`, `TextEncoder`/`TextDecoder`).

**No test framework:** Proje `npm run typecheck`, `npm run lint`, `npm run build` ve manuel `curl`/tarayıcı doğrulaması kullanıyor; bu plan da bu doğrulama yöntemlerini kullanır.

---

### Task 1: `StreamEvent` tipini ekle

**Files:**
- Modify: `lib/models/maintenance.ts`

- [ ] **Step 1: `StreamEvent` union tipini dosyanın sonuna ekle**

`lib/models/maintenance.ts` dosyasının en sonunda (mevcut `AskResponse` interface'inden sonra), şu içeriği ekle:

```ts

export type StreamEvent =
  | { type: "agent_start"; agent: AgentCode }
  | { type: "agent_turn"; turn: AgentTurn }
  | {
      type: "final";
      status: EvidenceStatus;
      executiveSummary: string;
      citations: AskResponse["citations"];
    }
  | { type: "error"; message: string };
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: Hatasız tamamlanır (yeni tip henüz kullanılmıyor ama derleme bozulmamalı).

- [ ] **Step 3: Commit**

```bash
git add lib/models/maintenance.ts
git commit -m "Add StreamEvent type for agent streaming"
```

---

### Task 2: `runMaintenanceAgents`'ı async generator'a dönüştür

**Files:**
- Modify: `lib/agents/maintenance-agents.ts` (tüm dosya yeniden yazılır)

Mevcut dosyadaki tüm yardımcı fonksiyonlar (`extractDiagramSuggestions`, `hasOnlyBootstrapEvidence`, `hasUsableEvidence`, `fallbackTurn`, `domainsForAgent`, `normalize`, `agentShouldAnswer`, `isInsufficientContent`, `generateAgentContent`, `diagramPattern`) **değişmeden** kalır. Sadece `runMaintenanceAgents` fonksiyonu kaldırılıp yerine `runMaintenanceAgentsStream` async generator'ı eklenir ve import listesi güncellenir (`AskResponse` çıkar, `StreamEvent` girer).

- [ ] **Step 1: Dosyanın tamamını aşağıdaki içerikle değiştir**

`lib/agents/maintenance-agents.ts`:

```ts
import { agentProfiles } from "@/lib/agents/profiles";
import { generateMiniMaxAgentTurn } from "@/lib/agents/minimax";
import { retrieveChunks } from "@/lib/knowledge/reference-corpus";
import { searchWebEvidence } from "@/lib/knowledge/web-search";
import { listReferenceChunks } from "@/lib/appwrite/reference-repository";
import type {
  AgentCode,
  AgentProfile,
  AgentTurn,
  EvidenceStatus,
  MaintenanceDomain,
  ReferenceChunk,
  StreamEvent
} from "@/lib/models/maintenance";

const diagramPattern = /\[Diyagram Önerisi:\s*([^\]]+)\]/g;

function extractDiagramSuggestions(content: string) {
  return Array.from(content.matchAll(diagramPattern)).map((match) => match[1].trim());
}

function hasOnlyBootstrapEvidence(chunks: ReferenceChunk[]) {
  return chunks.every((chunk) => chunk.documentId === "project-brief");
}

function hasUsableEvidence(chunks: ReferenceChunk[]) {
  return chunks.length > 0 && !hasOnlyBootstrapEvidence(chunks);
}

function fallbackTurn(
  agent: AgentProfile,
  question: string,
  evidence: ReferenceChunk[],
  previousTurns: AgentTurn[]
) {
  const status: EvidenceStatus =
    evidence.length === 0 || hasOnlyBootstrapEvidence(evidence)
      ? "insufficient_sources"
      : "grounded";

  if (status === "insufficient_sources") {
    const content = [
      `${agent.code}: Bu soru için kayıtlı bilgi tabanında yeterli kanıt bulunamadı.`,
      "Web arama yapılandırılmamışsa veya web kanıtı da yetersizse teknik yanıt üretmemeliyim.",
      "[Diyagram Önerisi: Yetersiz kanıt karar akışı]"
    ].join(" ");

    return content;
  }

  const priorLine =
    previousTurns.length > 0
      ? `Önceki ajanlardan gelen çıktı ${previousTurns.map((turn) => turn.agent.code).join(", ")} ile tutarlılık açısından kontrol edildi.`
      : "Bu ilk stratejik değerlendirme turudur.";

  return [
    `${agent.code}: Soru "${question}" için alanıma giren kanıtlar yeterli düzeyde bulundu.`,
    priorLine,
    `${agent.role} Bu rolde temel karar, kaynakta açıkça izlenebilen bilgiyle sınırlı tutulmalıdır.`,
    "[Diyagram Önerisi: Ajan kanıt değerlendirme ve karar kapısı]"
  ].join(" ");
}

function domainsForAgent(agent: AgentProfile): MaintenanceDomain[] {
  if (agent.code === "CORE") return ["strategy", "archive"];
  if (agent.code === "FIELD") return ["field", "strategy"];
  if (agent.code === "FLOW") return ["planning", "field"];
  if (agent.code === "BASE") return ["archive", "planning"];
  return ["analytics", "strategy"];
}

function normalize(value: string) {
  return value.toLocaleLowerCase("tr");
}

function agentShouldAnswer(
  agent: AgentProfile,
  question: string,
  evidence: ReferenceChunk[],
  forceSelectedScope = false
) {
  if (forceSelectedScope) {
    return true;
  }

  const normalizedQuestion = normalize(question);
  const directKeywordHit = agent.triggerKeywords.some((keyword) =>
    normalizedQuestion.includes(normalize(keyword))
  );

  if (directKeywordHit) {
    return true;
  }

  return evidence.some((chunk) => chunk.domain === agent.domain);
}

function isInsufficientContent(content: string | null) {
  if (!content) {
    return true;
  }

  const normalized = normalize(content);
  const insufficientPhrases = [
    "yeterli kanıt bulunamadı",
    "yeterli kanıt bulunmamaktadır",
    "yeterli veri yok",
    "yanıt üretmemeliyim",
    "kaynak yetersiz",
    "kanıt yetersiz",
    "bilmiyorum",
    "doğrudan ele almamakta",
    "doğrudan ele almıyor",
    "doğrudan kapsamıyor",
    "doğrudan atıfta bulunmuyor",
    "doğrudan bir atıf",
    "kanıt parçalarında",
    "kanıt parçaları yalnızca",
    "yorum yapamam",
    "herhangi bir bilgi sunmamaktadır",
    "genel bilgi olarak",
    "yetersiz_kanit",
    "yetersiz_kanıt",
    "yetersiz kanıt",
    "kapsamamaktadır",
    "sınırlıdır"
  ];

  return (
    content.trim().length < 120 ||
    insufficientPhrases.some((phrase) => normalized.includes(phrase)) ||
    (normalized.includes("kanıt parçaları") &&
      normalized.includes("doğrudan") &&
      (normalized.includes("bulunmuyor") || normalized.includes("atıfta")))
  );
}

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

export async function* runMaintenanceAgentsStream(
  question: string,
  selectedAgents?: AgentCode[]
): AsyncGenerator<StreamEvent, void, unknown> {
  const normalizedQuestion = question.trim();
  const selectedAgentSet =
    selectedAgents && selectedAgents.length > 0 ? new Set(selectedAgents) : null;
  const activeProfiles = selectedAgentSet
    ? agentProfiles.filter((agent) => selectedAgentSet.has(agent.code))
    : agentProfiles;
  const forceSelectedScope =
    selectedAgentSet !== null && selectedAgentSet.size < agentProfiles.length;

  const turns: AgentTurn[] = [];
  const corpusChunks = await listReferenceChunks();

  for (const agent of activeProfiles) {
    yield { type: "agent_start", agent: agent.code };

    let evidence = retrieveChunks(
      corpusChunks,
      normalizedQuestion,
      domainsForAgent(agent),
      3
    );
    let content: string | null = null;
    let usedWebFallback = false;

    if (!agentShouldAnswer(agent, normalizedQuestion, evidence, forceSelectedScope)) {
      const turn: AgentTurn = {
        agent,
        content: "",
        evidence: [],
        diagramSuggestions: [],
        status: "skipped",
        skippedReason: "Soru bu ajanın karar alanına yeterince temas etmiyor."
      };
      turns.push(turn);
      yield { type: "agent_turn", turn };
      continue;
    }

    if (!hasUsableEvidence(evidence)) {
      const webEvidence = await searchWebEvidence(
        normalizedQuestion,
        agent.domain,
        3
      );

      if (webEvidence.length > 0) {
        evidence = webEvidence;
        usedWebFallback = true;
      }
    }

    if (hasUsableEvidence(evidence)) {
      try {
        content = await generateAgentContent(agent, normalizedQuestion, turns, evidence);
      } catch {
        content = null;
      }
    }

    if (isInsufficientContent(content) && !usedWebFallback) {
      const webEvidence = await searchWebEvidence(
        normalizedQuestion,
        agent.domain,
        3
      );

      if (webEvidence.length > 0) {
        try {
          const webContent = await generateAgentContent(
            agent,
            normalizedQuestion,
            turns,
            webEvidence
          );

          if (!isInsufficientContent(webContent)) {
            evidence = webEvidence;
            content = webContent;
            usedWebFallback = true;
          }
        } catch {
          content = null;
        }
      }
    }

    if (isInsufficientContent(content)) {
      content = null;
      evidence = [];
    }

    const finalContent = content ?? fallbackTurn(agent, normalizedQuestion, evidence, turns);
    const status: EvidenceStatus =
      usedWebFallback && content
        ? "web_fallback"
        : evidence.length === 0 || hasOnlyBootstrapEvidence(evidence)
        ? "insufficient_sources"
        : "grounded";

    const turn: AgentTurn = {
      agent,
      content: finalContent,
      evidence,
      diagramSuggestions: extractDiagramSuggestions(finalContent),
      status
    };
    turns.push(turn);
    yield { type: "agent_turn", turn };
  }

  const answeredTurns = turns.filter((turn) => turn.status !== "skipped");
  const status: EvidenceStatus =
    answeredTurns.length > 0 &&
    answeredTurns.every(
      (turn) => turn.status === "grounded" || turn.status === "web_fallback"
    )
      ? "grounded"
      : "insufficient_sources";

  yield {
    type: "final",
    status,
    executiveSummary:
      status === "grounded"
        ? "Ajanlar soruyu kayıtlı bilgi tabanı ve gerektiğinde web destekli kanıtlarla değerlendirdi."
        : "Referans PDF/EPUB korpusu henüz yüklenmediği için çıktı yalnızca platform iskeleti ve kaynak yetersizliği uyarısı içerir.",
    citations: []
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: Hatasız tamamlanır. (Bu noktada `app/api/ask/route.ts` hâlâ eski `runMaintenanceAgents`'ı import ettiği için **HATA VERECEKTİR** — bu beklenen bir durumdur, Task 3'te düzelecek. Eğer şimdiden typecheck'i çalıştırırsan `route.ts` ile ilgili "has no exported member 'runMaintenanceAgents'" hatasını görmen normal. Bu adımı sadece bu dosyada syntax hatası olmadığını teyit etmek için bilgi amaçlı çalıştır, route.ts hatasını görmezden geç.)

- [ ] **Step 3: Commit**

```bash
git add lib/agents/maintenance-agents.ts
git commit -m "Convert agent runner to streaming async generator"
```

---

### Task 3: `/api/ask` route'unu NDJSON stream döndürecek şekilde güncelle

**Files:**
- Modify: `app/api/ask/route.ts`

- [ ] **Step 1: Dosyanın tamamını aşağıdaki içerikle değiştir**

```ts
import { runMaintenanceAgentsStream } from "@/lib/agents/maintenance-agents";
import type { AgentCode, AskRequest } from "@/lib/models/maintenance";

const agentCodes = new Set<AgentCode>(["CORE", "FIELD", "FLOW", "BASE", "KPI"]);

export async function POST(request: Request) {
  let body: AskRequest;

  try {
    body = (await request.json()) as AskRequest;
  } catch {
    return Response.json({ error: "Geçersiz JSON gövdesi." }, { status: 400 });
  }

  const question = body.question?.trim();

  if (!question) {
    return Response.json({ error: "Soru alanı zorunludur." }, { status: 400 });
  }

  if (question.length > 3000) {
    return Response.json(
      { error: "Soru 3000 karakterden kısa olmalıdır." },
      { status: 400 }
    );
  }

  const selectedAgents = Array.isArray(body.selectedAgents)
    ? body.selectedAgents.filter((agent): agent is AgentCode => agentCodes.has(agent))
    : undefined;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of runMaintenanceAgentsStream(question, selectedAgents)) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Bilinmeyen hata.";
        controller.enqueue(
          encoder.encode(`${JSON.stringify({ type: "error", message })}\n`)
        );
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache"
    }
  });
}
```

Not: `NextResponse` artık kullanılmıyor (`Response.json` ve `new Response` yeterli), bu yüzden import'tan kaldırıldı.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: Hatasız tamamlanır.

- [ ] **Step 3: Commit**

```bash
git add app/api/ask/route.ts
git commit -m "Stream agent responses as NDJSON from /api/ask"
```

---

### Task 4: Frontend'i NDJSON akışını okuyacak şekilde güncelle

**Files:**
- Modify: `components/maintenance-console.tsx`

- [ ] **Step 1: Import satırlarını güncelle**

Old:
```ts
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Database,
  FileStack,
  Gauge,
  Loader2,
  Radar,
  Send,
  ShieldCheck,
  Sparkles,
  Users
} from "lucide-react";
import { AgentNode } from "@/components/agent-node";
import { AgentResponseCard } from "@/components/agent-response-card";
import { StatusPill } from "@/components/status-pill";
import type {
  AgentCode,
  AgentProfile,
  AskResponse,
  ReferenceDocument
} from "@/lib/models/maintenance";
```

New:
```ts
"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Database,
  FileStack,
  Gauge,
  Loader2,
  Radar,
  Send,
  ShieldCheck,
  Sparkles,
  Users
} from "lucide-react";
import { AgentNode } from "@/components/agent-node";
import { AgentResponseCard } from "@/components/agent-response-card";
import { StatusPill } from "@/components/status-pill";
import type {
  AgentCode,
  AgentProfile,
  AskResponse,
  ReferenceDocument,
  StreamEvent
} from "@/lib/models/maintenance";
```

- [ ] **Step 2: `activeAgentIndex` state'ini `activeAgentCode` ile değiştir**

Old:
```ts
  const [activeAgentIndex, setActiveAgentIndex] = useState(0);
```

New:
```ts
  const [activeAgentCode, setActiveAgentCode] = useState<AgentCode | null>(null);
```

- [ ] **Step 3: Fake interval animasyonunu ve eski `activeAgentCode` hesaplamasını kaldır**

Old:
```ts
  const activeAgentCode = selectedAgents[activeAgentIndex % selectedAgents.length];

  useEffect(() => {
    if (!isLoading) {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveAgentIndex((current) => (current + 1) % selectedAgents.length);
    }, 900);

    return () => window.clearInterval(interval);
  }, [agents.length, isLoading, selectedAgents.length]);

  function toggleAgent(agentCode: AgentCode) {
```

New:
```ts
  function toggleAgent(agentCode: AgentCode) {
```

- [ ] **Step 4: `agentScopeLabel` fonksiyonunda `isLoading` kontrolünü turn kontrollerinden sonraya al**

Old:
```ts
  function agentScopeLabel(agentCode: AgentCode) {
    const turn = response?.turns.find((item) => item.agent.code === agentCode);

    if (!selectedAgentSet.has(agentCode)) {
      return "seçilmedi";
    }

    if (isLoading) {
      return "bekliyor";
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

    return "hazır";
  }
```

New:
```ts
  function agentScopeLabel(agentCode: AgentCode) {
    const turn = response?.turns.find((item) => item.agent.code === agentCode);

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
```

- [ ] **Step 5: `submitQuestion`'ı NDJSON stream okuyacak şekilde yeniden yaz, `handleStreamEvent` yardımcı fonksiyonunu ekle**

Old:
```ts
  async function submitQuestion() {
    const nextQuestion = question.trim();
    if (!nextQuestion || isLoading) return;

    setIsLoading(true);
    setActiveAgentIndex(0);
    setResponse(null);
    setError(null);

    try {
      const result = await fetch("/api/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          question: nextQuestion,
          mode: "training",
          selectedAgents
        })
      });

      if (!result.ok) {
        const payload = (await result.json()) as { error?: string };
        throw new Error(payload.error ?? "Ajan yanıtı alınamadı.");
      }

      setResponse((await result.json()) as AskResponse);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Bilinmeyen hata.");
    } finally {
      setIsLoading(false);
    }
  }
```

New:
```ts
  function handleStreamEvent(event: StreamEvent) {
    if (event.type === "agent_start") {
      setActiveAgentCode(event.agent);
      return;
    }

    if (event.type === "agent_turn") {
      setResponse((current) =>
        current ? { ...current, turns: [...current.turns, event.turn] } : current
      );
      return;
    }

    if (event.type === "final") {
      setResponse((current) =>
        current
          ? {
              ...current,
              status: event.status,
              executiveSummary: event.executiveSummary,
              citations: event.citations
            }
          : current
      );
      return;
    }

    setError(event.message);
  }

  async function submitQuestion() {
    const nextQuestion = question.trim();
    if (!nextQuestion || isLoading) return;

    setIsLoading(true);
    setActiveAgentCode(null);
    setResponse({
      question: nextQuestion,
      status: "insufficient_sources",
      executiveSummary: "",
      turns: [],
      citations: []
    });
    setError(null);

    try {
      const result = await fetch("/api/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          question: nextQuestion,
          mode: "training",
          selectedAgents
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
    } finally {
      setIsLoading(false);
      setActiveAgentCode(null);
    }
  }
```

`AskResponse` tipi artık başlangıç state'i için kullanıldığından import'ta kalmalı (zaten Step 1'de korundu).

- [ ] **Step 6: Sonuç render bloğunu, turlar tek tek geldikçe gösterecek şekilde değiştir**

Old:
```tsx
          {isLoading ? (
            <div className="glass-panel flex min-h-[420px] items-center justify-center rounded-lg p-6">
              <div className="max-w-xl text-center">
                <Loader2 className="mx-auto size-9 animate-spin text-signal" />
                <h2 className="mt-5 text-2xl font-semibold text-platinum">
                  Ajanlar değerlendiriyor
                </h2>
                <p className="mt-3 text-sm leading-7 text-muted">
                  Soru önce ilgili ajan alanlarıyla eşleştiriliyor, ardından yalnızca gerekli
                  ajanlar kanıt parçalarıyla yanıt üretiyor.
                </p>
              </div>
            </div>
          ) : response ? (
            <div className="space-y-5">
              <div className="glass-panel rounded-lg p-5">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted">
                  <Sparkles className="size-3.5 text-signal" />
                  Yönetici Özeti
                </div>
                <p className="mt-3 text-sm leading-7 text-[#ded8cc]">{response.executiveSummary}</p>
              </div>
              {answeredTurns.map((turn) => (
                <AgentResponseCard key={turn.agent.code} turn={turn} />
              ))}
              {answeredTurns.length === 0 && (
                <div className="glass-panel rounded-lg p-5 text-sm leading-7 text-muted">
                  Bu soru mevcut ajan kapsamıyla yeterince eşleşmediği için yanıt üretilmedi.
                </div>
              )}
            </div>
          ) : (
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
          )}
```

New:
```tsx
          {response ? (
            <div className="space-y-5">
              {answeredTurns.length === 0 && isLoading ? (
                <div className="glass-panel flex min-h-[420px] items-center justify-center rounded-lg p-6">
                  <div className="max-w-xl text-center">
                    <Loader2 className="mx-auto size-9 animate-spin text-signal" />
                    <h2 className="mt-5 text-2xl font-semibold text-platinum">
                      Ajanlar değerlendiriyor
                    </h2>
                    <p className="mt-3 text-sm leading-7 text-muted">
                      Soru önce ilgili ajan alanlarıyla eşleştiriliyor, ardından yalnızca gerekli
                      ajanlar kanıt parçalarıyla yanıt üretiyor.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {response.executiveSummary && (
                    <div className="glass-panel rounded-lg p-5">
                      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted">
                        <Sparkles className="size-3.5 text-signal" />
                        Yönetici Özeti
                      </div>
                      <p className="mt-3 text-sm leading-7 text-[#ded8cc]">
                        {response.executiveSummary}
                      </p>
                    </div>
                  )}
                  {answeredTurns.map((turn) => (
                    <AgentResponseCard key={turn.agent.code} turn={turn} />
                  ))}
                  {!isLoading && answeredTurns.length === 0 && (
                    <div className="glass-panel rounded-lg p-5 text-sm leading-7 text-muted">
                      Bu soru mevcut ajan kapsamıyla yeterince eşleşmediği için yanıt üretilmedi.
                    </div>
                  )}
                  {isLoading && (
                    <div className="glass-panel flex items-center gap-3 rounded-lg p-4 text-sm text-muted">
                      <Loader2 className="size-4 animate-spin text-signal" />
                      Ajanlar değerlendirmeye devam ediyor...
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
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
          )}
```

- [ ] **Step 7: Typecheck ve lint**

Run: `npm run typecheck && npm run lint`
Expected: Her iki komut da hatasız tamamlanır.

- [ ] **Step 8: Commit**

```bash
git add components/maintenance-console.tsx
git commit -m "Stream agent turns incrementally in the console UI"
```

---

### Task 5: Build ve manuel doğrulama

**Files:** Yok (sadece doğrulama)

- [ ] **Step 1: Production build**

Run: `npm run build`
Expected: Build hatasız tamamlanır.

- [ ] **Step 2: Dev sunucusunu başlat**

Run: `npm run dev` (arka planda)
Expected: `http://localhost:3000` üzerinde sunucu ayağa kalkar.

- [ ] **Step 3: NDJSON akışını curl ile doğrula**

Run:
```bash
curl -N -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"Kritik bir üretim hattında BCM ve RCM öncelikleri nasıl ayrıştırılmalı?","selectedAgents":["CORE","FIELD"]}'
```

Expected: Çıktı tek bir JSON blob değil, art arda (satır satır) gelen JSON nesneleri olmalı: önce `{"type":"agent_start","agent":"CORE"}`, ardından `{"type":"agent_turn","turn":{...}}`, sonra `CORE` için aynısı tekrar FIELD için, en sonda `{"type":"final",...}`. `MINIMAX_API_KEY`/`TAVILY_API_KEY` ayarlı değilse `content` alanları fallback metinleri içerecek (`status: "insufficient_sources"`), bu normal — önemli olan event sırası ve akış davranışı.

- [ ] **Step 4: Tarayıcıda manuel test**

`http://localhost:3000` adresini aç, bir örnek soru seç ve "Ajanları Çalıştır"a bas.

Doğrula:
- Ajan kartları toplu halde değil, ajan sırasına göre (CORE→FIELD→FLOW→BASE→KPI, seçili olanlar) tek tek beliriyor.
- "Çalışıyor" animasyonu (`AgentNode` working state) gerçekte işlenmekte olan ajanla eşleşiyor (artık sahte interval değil).
- Bir veya daha fazla ajanı seçimden çıkarıp tekrar çalıştırdığında sadece seçili ajanlar için event akışı geliyor.
- "Ajan Kapsamı" panelindeki durum etiketleri (`yanıtladı` / `atlanmış` / `web destekli` / `bekliyor` / `hazır`) akış sırasında doğru güncelleniyor.

- [ ] **Step 5: Dev sunucusunu durdur**

Test tamamlandıktan sonra `npm run dev` sürecini sonlandır.
