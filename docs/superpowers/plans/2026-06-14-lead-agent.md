# Yönetici (LEAD) Ajan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CORE→FIELD→FLOW→BASE→KPI ajanları tamamlandıktan sonra, bir LEAD (Yönetici) ajanı diğer ajanların yanıtlarını MiniMax ile (veya MiniMax başarısız olursa basit bir özetle) tek, tutarlı bir cevapta sentezler ve bu 6. ajan olarak hem stream'de hem UI'da görünür.

**Architecture:** `lib/models/maintenance.ts`'e `"LEAD"` agent kodu eklenir, `lib/agents/profiles.ts`'e ayrı bir `leadAgentProfile` export edilir. `lib/agents/minimax.ts` içindeki istek/retry mantığı `requestMiniMaxCompletion` adlı paylaşılan bir yardımcıya çıkarılır ve hem mevcut `generateMiniMaxAgentTurn` hem de yeni `generateMiniMaxLeadSynthesis` bunu kullanır. `lib/agents/maintenance-agents.ts`'teki `runMaintenanceAgentsStream` ana döngüden sonra LEAD turunu üretip yayar. Frontend (`agent-node.tsx`, `maintenance-console.tsx`) LEAD'i 6. pipeline node'u ve normal bir yanıt kartı olarak gösterir, eski statik "Yönetici Özeti" banıtı kaldırılır.

**Tech Stack:** Next.js (App Router), TypeScript

Bu proje test framework'ü içermiyor (`package.json` scripts: dev/build/lint only). Doğrulama `npm run typecheck`, `npm run lint`, `npm run build` ve manuel dev-server testi ile yapılır.

---

### Task 1: `AgentCode` tipine LEAD ekle ve `leadAgentProfile` tanımla

**Files:**
- Modify: `lib/models/maintenance.ts:1`
- Modify: `lib/agents/profiles.ts`

- [ ] **Step 1: `AgentCode` tipini güncelle**

`lib/models/maintenance.ts` dosyasının 1. satırında:

```ts
export type AgentCode = "CORE" | "FIELD" | "FLOW" | "BASE" | "KPI";
```

şunu olur:

```ts
export type AgentCode = "CORE" | "FIELD" | "FLOW" | "BASE" | "KPI" | "LEAD";
```

- [ ] **Step 2: `leadAgentProfile`'ı `lib/agents/profiles.ts`'e ekle**

`lib/agents/profiles.ts` dosyasının sonuna (mevcut `agentProfiles` dizisinin
KAPANIŞ `];`'ından sonra), ayrı bir export olarak ekle:

```ts

export const leadAgentProfile: AgentProfile = {
  code: "LEAD",
  name: "Yönetici",
  domain: "strategy",
  role: "Diğer ajanların yanıtlarını okuyup kullanıcının sorusu için tek, tutarlı bir sonuç cevabı üretir.",
  guardrail:
    "Sadece diğer ajanların ürettiği içerikleri sentezler; yeni teknik iddia veya kaynak eklemez.",
  triggerKeywords: []
};
```

`leadAgentProfile`, `agentProfiles` dizisine EKLENMEZ — ayrı bir export'tur.
Bu sayede `app/page.tsx`'teki `agentProfiles` (5 seçilebilir ajan) listesi
değişmeden kalır.

- [ ] **Step 3: Typecheck çalıştır**

```bash
npm run typecheck
```

Beklenen: `accentByAgent: Record<AgentCode, string>` (agent-node.tsx) henüz
`LEAD` içermediği için bir hata verecek — bu Task 4'te düzeltilecek. Şimdilik
sadece `lib/models/maintenance.ts` ve `lib/agents/profiles.ts` ile ilgili
yeni bir hata OLMADIĞINI doğrulayın (mevcut `agent-node.tsx` hatası dışında
başka hata olmamalı). Eğer `agent-node.tsx` dışında başka bir dosyada hata
çıkarsa (örn. `route.ts`'teki `agentCodes` Set — bu bir `Set<AgentCode>` olup
LEAD eklenmediği için hata vermez, sadece içerik eksikliği, tip hatası değil),
DUR ve raporla.

- [ ] **Step 4: Commit**

```bash
git add lib/models/maintenance.ts lib/agents/profiles.ts
git commit -m "Add LEAD agent code and lead agent profile"
```

---

### Task 2: MiniMax istek mantığını paylaşılan yardımcıya çıkar ve LEAD sentez fonksiyonu ekle

**Files:**
- Modify: `lib/agents/minimax.ts`

Bu task öncesi `lib/agents/minimax.ts` şu yapıdadır (177 satır):
- `getMiniMaxConfig()` (modül seviyesi, satır 25-39)
- `extractMiniMaxText(data)` (satır 41-60)
- `truncateText` — DİKKAT: bu fonksiyon `lib/agents/text-utils.ts`'e taşınmış
  ve buraya import ediliyor olmalı (önceki bir işten). Eğer hâlâ burada
  tanımlıysa dokunma, sadece referans alın.
- `trimToCompleteSentence(value)` (satır ~70-87)
- `wasTruncated(data)` (satır ~89-91)
- `generateMiniMaxAgentTurn(input)` (satır ~93-176): system/user prompt'ları
  oluşturur, içeride `requestMiniMax(maxTokens)` adlı yerel bir fonksiyon
  tanımlar (satır ~133-163), ardından iki aşamalı çağrı/retry mantığını
  (satır ~165-175) çalıştırır.

- [ ] **Step 1: Dosyanın güncel halini oku**

```bash
cat -n lib/agents/minimax.ts
```

Bu, sonraki adımlardaki tam satır içeriklerini ve güncel satır numaralarını
doğrulamak için gerekli — önceki işlerden sonra satır numaraları kaymış
olabilir.

- [ ] **Step 2: Paylaşılan `requestMiniMaxCompletion` fonksiyonunu ekle**

`generateMiniMaxAgentTurn` fonksiyonundan ÖNCE (yani `wasTruncated`
fonksiyonunun hemen altına), yeni bir fonksiyon ekle:

```ts
async function requestMiniMaxCompletion(
  systemPrompt: string,
  userPrompt: string
): Promise<string | null> {
  const config = getMiniMaxConfig();

  if (!config) {
    return null;
  }

  async function requestMiniMax(maxTokens: number) {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.2,
        top_p: 0.8,
        max_tokens: maxTokens
      })
    });

    if (!response.ok) {
      throw new Error(`MiniMax request failed: ${response.status}`);
    }

    return (await response.json()) as MiniMaxResponse;
  }

  const firstData = await requestMiniMax(1600);
  const firstText = extractMiniMaxText(firstData);

  if (!wasTruncated(firstData) && firstText) {
    return trimToCompleteSentence(firstText);
  }

  const retryData = await requestMiniMax(3200);
  const retryText = extractMiniMaxText(retryData);

  return retryText ? trimToCompleteSentence(retryText) : firstText;
}
```

- [ ] **Step 3: `generateMiniMaxAgentTurn`'ü `requestMiniMaxCompletion` kullanacak şekilde sadeleştir**

`generateMiniMaxAgentTurn` fonksiyonunun gövdesinde, `systemPrompt` ve
`userPrompt` oluşturma kısımları (mevcut `const systemPrompt = [...]` ve
`const userPrompt = [...]`) AYNEN KALIR. Ancak fonksiyonun şu kısmı:

```ts
  const miniMaxConfig = config;

  const evidenceText = ...
  ...
  async function requestMiniMax(maxTokens: number) {
    ...
  }

  const firstData = await requestMiniMax(1600);
  const firstText = extractMiniMaxText(firstData);

  if (!wasTruncated(firstData) && firstText) {
    return trimToCompleteSentence(firstText);
  }

  const retryData = await requestMiniMax(3200);
  const retryText = extractMiniMaxText(retryData);

  return retryText ? trimToCompleteSentence(retryText) : firstText;
```

şu şekilde değişir — `const miniMaxConfig = config;` satırı ve yerel
`requestMiniMax`/iki-aşamalı çağrı bloğu KALDIRILIR, fonksiyonun en sonu
şu olur:

```ts
  return requestMiniMaxCompletion(systemPrompt, userPrompt);
```

Yani `generateMiniMaxAgentTurn`'ün yeni iskeleti:

```ts
export async function generateMiniMaxAgentTurn(input: GenerateAgentTurnInput) {
  const config = getMiniMaxConfig();

  if (!config) {
    return null;
  }

  const evidenceText = input.evidence
    .map((chunk, index) => `Kanıt ${index + 1}: ${truncateText(chunk.text, 1600)}`)
    .join("\n");

  const previousText = input.previousTurns
    .map((turn) => `${turn.code}: ${truncateText(turn.content, 420)}`)
    .join("\n");

  const systemPrompt = [
    // ... mevcut sistem promptu satırları, DEĞİŞMEDEN ...
  ].join("\n");

  const userPrompt = [
    // ... mevcut kullanıcı promptu satırları, DEĞİŞMEDEN ...
  ].join("\n");

  return requestMiniMaxCompletion(systemPrompt, userPrompt);
}
```

ÖNEMLİ: `const config = getMiniMaxConfig();` ve `if (!config) { return null; }`
kontrolü fonksiyonun başında KALIR (early return için) — ancak
`requestMiniMaxCompletion` içinde de `getMiniMaxConfig()` tekrar çağrılır.
Bu kasıtlı bir küçük tekrar: `generateMiniMaxAgentTurn`'ün erken
`return null` ile evidence/prompt oluşturma maliyetinden kaçınmasını
sağlar, `requestMiniMaxCompletion` de bağımsız çağrılabilir olmalı (LEAD
için). Bu tekrarı kaldırmaya çalışmayın.

- [ ] **Step 4: `generateMiniMaxLeadSynthesis` fonksiyonunu ekle**

Dosyanın sonuna (yani `generateMiniMaxAgentTurn`'den sonra), yeni bir
interface ve export fonksiyon ekle:

```ts
interface GenerateLeadSynthesisInput {
  question: string;
  turns: Array<{ code: string; name: string; content: string }>;
}

export async function generateMiniMaxLeadSynthesis(
  input: GenerateLeadSynthesisInput
): Promise<string | null> {
  const turnsText = input.turns
    .map((turn) => `${turn.name} (${turn.code}): ${turn.content}`)
    .join("\n\n");

  const systemPrompt = [
    "Sen bir yönetici (lead) ajansın. Görevin, uzman ajanların ürettiği yanıtları",
    "okuyup kullanıcının sorusu için TEK, tutarlı ve tekrarsız bir Türkçe cevap üretmektir.",
    "Ton: Skeptic Analyst. Net, teknik, doğrulanabilir ve spekülasyondan uzak yaz.",
    "İç muhakeme, chain-of-thought veya <think> bloğu yazma; yalnızca nihai cevabı ver.",
    "Ajan kod adlarına (CORE, FIELD, FLOW, BASE, KPI) veya 'ajanlar' kelimesine atıfta bulunma;",
    "doğrudan kullanıcıya hitap eden bir cevap yaz.",
    "Ajan yanıtları arasında çakışan veya birbirini tekrar eden noktaları birleştir.",
    "Yeni teknik iddia, kaynak veya veri ekleme; sadece verilen yanıtları sentezle.",
    "Gerektiğinde tam olarak şu biçimde diyagram etiketi bırak: [Diyagram Önerisi: kısa açıklama]"
  ].join("\n");

  const userPrompt = [
    `Kullanıcı sorusu: ${input.question}`,
    "",
    `Uzman ajan yanıtları:\n${turnsText}`,
    "",
    "Yanıtını en fazla 120 kelimelik 3-4 tam cümleyle Türkçe ver. Cevabı yarıda kesme."
  ].join("\n");

  return requestMiniMaxCompletion(systemPrompt, userPrompt);
}
```

- [ ] **Step 5: Typecheck, lint, build çalıştır**

```bash
npm run typecheck && npm run lint && npm run build
```

Beklenen: Hâlâ `agent-node.tsx`'teki `Record<AgentCode, string>` eksik-LEAD
hatası dışında hata olmamalı (Task 4'te düzelecek). `lib/agents/minimax.ts`
ile ilgili hiçbir hata olmamalı.

- [ ] **Step 6: Commit**

```bash
git add lib/agents/minimax.ts
git commit -m "Extract shared MiniMax request helper and add LEAD synthesis function"
```

---

### Task 3: LEAD turunu `runMaintenanceAgentsStream`'de üret ve yay

**Files:**
- Modify: `lib/agents/maintenance-agents.ts`

Bu task öncesi dosyanın ilgili kısımları (satır numaraları yaklaşık,
çalışmaya başlamadan önce `cat -n lib/agents/maintenance-agents.ts` ile
doğrulayın):

- Satır 1-15: importlar (mevcut: `agentProfiles`, `generateMiniMaxAgentTurn`,
  `retrieveChunks`, `searchWebEvidence`, `listReferenceChunks`,
  `truncateText`, ve tip importları).
- Satır ~286-306: ana döngüden sonraki `answeredTurns`/`status`/`final`
  bloğu.

- [ ] **Step 1: İmportları güncelle**

`lib/agents/maintenance-agents.ts` dosyasının en üstündeki import bloğunu
şu şekilde güncelle:

```ts
import { agentProfiles, leadAgentProfile } from "@/lib/agents/profiles";
import { generateMiniMaxAgentTurn, generateMiniMaxLeadSynthesis } from "@/lib/agents/minimax";
import { retrieveChunks } from "@/lib/knowledge/reference-corpus";
import { searchWebEvidence } from "@/lib/knowledge/web-search";
import { listReferenceChunks } from "@/lib/appwrite/reference-repository";
import { truncateText } from "@/lib/agents/text-utils";
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

(Sadece ilk iki satır değişiyor: `leadAgentProfile` ve
`generateMiniMaxLeadSynthesis` eklendi.)

- [ ] **Step 2: `buildLeadFallbackSummary` yardımcı fonksiyonunu ekle**

`buildWebSummary` fonksiyonunun hemen ALTINA (yani satır ~44'ten sonra,
`buildWebSummary`'nin kapanış `}`'ından sonra), yeni bir fonksiyon ekle:

```ts
function buildLeadFallbackSummary(answeredTurns: AgentTurn[]): string {
  const points = answeredTurns
    .map((turn) => `${turn.agent.name}: ${truncateText(turn.content, 220)}`)
    .join(" ");

  return [
    "Aşağıda uzman ajanların ürettiği yanıtların birleştirilmiş özeti yer almaktadır.",
    points
  ].join(" ");
}
```

- [ ] **Step 3: Ana döngüden sonraki bloğu LEAD turu üretecek şekilde genişlet**

`runMaintenanceAgentsStream` generator'ının sonunda (ana `for` döngüsü
kapandıktan sonra), şu mevcut blok:

```ts
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

şu şekilde değişir:

```ts
  const answeredTurns = turns.filter((turn) => turn.status !== "skipped");
  const status: EvidenceStatus =
    answeredTurns.length > 0 &&
    answeredTurns.every(
      (turn) => turn.status === "grounded" || turn.status === "web_fallback"
    )
      ? "grounded"
      : "insufficient_sources";

  yield { type: "agent_start", agent: "LEAD" };

  let leadTurn: AgentTurn;

  if (answeredTurns.length > 0) {
    const leadContent =
      (await generateMiniMaxLeadSynthesis({
        question: normalizedQuestion,
        turns: answeredTurns.map((turn) => ({
          code: turn.agent.code,
          name: turn.agent.name,
          content: turn.content
        }))
      }).catch(() => null)) ?? buildLeadFallbackSummary(answeredTurns);

    leadTurn = {
      agent: leadAgentProfile,
      content: leadContent,
      evidence: [],
      diagramSuggestions: extractDiagramSuggestions(leadContent),
      status: "grounded"
    };
  } else {
    leadTurn = {
      agent: leadAgentProfile,
      content: "",
      evidence: [],
      diagramSuggestions: [],
      status: "skipped",
      skippedReason: "Sentezlenecek ajan yanıtı bulunmadığından yönetici özeti üretilmedi."
    };
  }

  turns.push(leadTurn);
  yield { type: "agent_turn", turn: leadTurn };

  yield {
    type: "final",
    status,
    executiveSummary: "",
    citations: []
  };
}
```

- [ ] **Step 4: Typecheck, lint, build çalıştır**

```bash
npm run typecheck && npm run lint && npm run build
```

Beklenen: Hâlâ `agent-node.tsx`'teki `Record<AgentCode, string>` eksik-LEAD
hatası dışında hata olmamalı (Task 4'te düzelecek).
`lib/agents/maintenance-agents.ts` ile ilgili hiçbir hata olmamalı.

- [ ] **Step 5: Commit**

```bash
git add lib/agents/maintenance-agents.ts
git commit -m "Generate and stream LEAD synthesis turn after agent pipeline"
```

---

### Task 4: Frontend'de LEAD ajanını 6. pipeline node'u ve yanıt kartı olarak göster

**Files:**
- Modify: `components/agent-node.tsx`
- Modify: `components/maintenance-console.tsx`

- [ ] **Step 1: `accentByAgent`'a LEAD ekle**

`components/agent-node.tsx` dosyasında:

```ts
const accentByAgent: Record<AgentCode, string> = {
  CORE: "border-signal/50 text-signal",
  FIELD: "border-cyanline/50 text-cyanline",
  FLOW: "border-copper/60 text-[#ffc28d]",
  BASE: "border-platinum/30 text-platinum",
  KPI: "border-[#b9a8ff]/60 text-[#d5ccff]"
};
```

şu olur:

```ts
const accentByAgent: Record<AgentCode, string> = {
  CORE: "border-signal/50 text-signal",
  FIELD: "border-cyanline/50 text-cyanline",
  FLOW: "border-copper/60 text-[#ffc28d]",
  BASE: "border-platinum/30 text-platinum",
  KPI: "border-[#b9a8ff]/60 text-[#d5ccff]",
  LEAD: "border-signal/70 text-signal"
};
```

- [ ] **Step 2: Typecheck çalıştır**

```bash
npm run typecheck
```

Beklenen: Artık `agent-node.tsx` ile ilgili hata KALMAMALI. Eğer
`components/maintenance-console.tsx` ile ilgili başka hatalar varsa (Step
3-5'te düzelecek), onları görmezden geçip devam edin.

- [ ] **Step 3: `leadAgentProfile`'ı import et ve pipeline grid'ine 6. node ekle**

`components/maintenance-console.tsx` dosyasının import bloğunda, mevcut:

```ts
import { AgentNode } from "@/components/agent-node";
import { AgentResponseCard } from "@/components/agent-response-card";
import { StatusPill } from "@/components/status-pill";
```

satırlarının altına (veya yanına) `leadAgentProfile` importunu ekle:

```ts
import { AgentNode } from "@/components/agent-node";
import { AgentResponseCard } from "@/components/agent-response-card";
import { StatusPill } from "@/components/status-pill";
import { leadAgentProfile } from "@/lib/agents/profiles";
```

Şimdi pipeline grid'ini bulun — şu yapıdadır:

```tsx
            <div className="mt-5 grid gap-3 lg:grid-cols-5">
              {agents.map((agent, index) => (
                <div key={agent.code} className="flex min-w-0 items-center gap-3 lg:block">
                  <AgentNode
                    code={agent.code}
                    label={agent.name}
                    active={Boolean(
                      response?.turns.some(
                        (turn) =>
                          turn.agent.code === agent.code && turn.status !== "skipped"
                      )
                    )}
                    skipped={Boolean(
                      !selectedAgentSet.has(agent.code) ||
                        response?.turns.some(
                          (turn) => turn.agent.code === agent.code && turn.status === "skipped"
                        )
                    )}
                    working={isLoading && activeAgentCode === agent.code}
```

(Bu `<AgentNode .../>` elemanının kapanışına kadar devam eder ve `</div>`
ile `{agents.map(...)}` bloğu kapanır.) Bu bloğu DEĞİŞTİRMEDEN, grid
className'ini `lg:grid-cols-5` → `lg:grid-cols-6` yapın ve
`{agents.map((agent, index) => (...))}` bloğunun kapanışından (yani o
`.map`'in son `))}`'sinden) SONRA, aynı grid `<div>` içinde, sabit bir 6.
node ekleyin:

```tsx
              {agents.map((agent, index) => (
                <div key={agent.code} className="flex min-w-0 items-center gap-3 lg:block">
                  {/* ... değişmeyen mevcut içerik ... */}
                </div>
              ))}
              <div className="flex min-w-0 items-center gap-3 lg:block">
                <AgentNode
                  code="LEAD"
                  label={leadAgentProfile.name}
                  active={Boolean(
                    response?.turns.some(
                      (turn) => turn.agent.code === "LEAD" && turn.status !== "skipped"
                    )
                  )}
                  skipped={Boolean(
                    response?.turns.some(
                      (turn) => turn.agent.code === "LEAD" && turn.status === "skipped"
                    )
                  )}
                  working={isLoading && activeAgentCode === "LEAD"}
                />
              </div>
            </div>
```

(`</div>` kapanışı zaten mevcut grid container'ının kapanışıdır — yeni
`<div>` bloğu o kapanıştan ÖNCE eklenir, mevcut yapıyı bozmadan.)

- [ ] **Step 4: Pipeline başlığını güncelle**

Aynı dosyada, şu metni bulun:

```tsx
                <h2 className="mt-2 text-xl font-semibold text-platinum">
                  CORE → FIELD → FLOW → BASE → KPI
                </h2>
```

şu olur:

```tsx
                <h2 className="mt-2 text-xl font-semibold text-platinum">
                  CORE → FIELD → FLOW → BASE → KPI → LEAD
                </h2>
```

- [ ] **Step 5: Eski "Yönetici Özeti" banıtını kaldır**

Aynı dosyada şu bloğu bulun:

```tsx
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
```

Bu bloğu TAMAMEN SİLİN. (`answeredTurns.map((turn) => <AgentResponseCard .../>)`
bloğu hemen sonrasında kalır ve değişmeden devam eder — LEAD turu da artık
`answeredTurns` içinde olduğu için otomatik olarak bir kart olarak
render edilecektir.)

- [ ] **Step 6: Kullanılmayan `Sparkles` importunu kontrol et**

`Sparkles` ikonu yalnızca silinen blokta kullanılıyorsa, import bloğundaki
`Sparkles` referansını da kaldırın. Dosyanın başındaki
`lucide-react` import satırında `Sparkles` varsa ve dosyada başka hiçbir
yerde `Sparkles` geçmiyorsa (grep ile kontrol edin: `grep -n "Sparkles"
components/maintenance-console.tsx`), import listesinden `Sparkles`'ı
çıkarın.

- [ ] **Step 7: Typecheck, lint, build çalıştır**

```bash
npm run typecheck && npm run lint && npm run build
```

Beklenen: Hepsi hatasız tamamlanır.

- [ ] **Step 8: Manuel doğrulama (dev server)**

Dev server'ın `http://localhost:3000` üzerinde çalıştığını kontrol edin
(`lsof -i :3000`). Çalışmıyorsa `npm run dev` ile arka planda başlatın.

```bash
curl -N -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "Kritik bir üretim hattında BCM ve RCM öncelikleri nasıl ayrıştırılmalı?"}' \
  --max-time 120
```

Akan NDJSON satırlarını inceleyin:
- KPI ajanının `agent_turn` event'inden SONRA, `{"type":"agent_start","agent":"LEAD"}`
  ve ardından `agent.code === "LEAD"` olan bir `agent_turn` event'i gelmeli.
- LEAD turunun `content`'i, "CORE:", "FIELD:" gibi ajan kod adlarına atıfta
  bulunmayan, diğer ajanların yanıtlarını sentezleyen (veya MiniMax
  başarısızsa `buildLeadFallbackSummary` formatında) bir metin olmalı.
- `final` event'inin `executiveSummary` alanı `""` olmalı.

Tarayıcıda `http://localhost:3000` açıp aynı soruyu arayüzden gönderin:
pipeline satırında 6. "Yönetici" node'unun göründüğünü, diğer ajanlar
bitince çalıştığını ve cevap listesinin sonunda bir "Yönetici" kartının
LEAD'in sentez metniyle göründüğünü doğrulayın. Sayfanın üstünde eski
"Yönetici Özeti" banıtının artık GÖRÜNMEDİĞİNİ doğrulayın.

- [ ] **Step 9: Self-review**

- `leadAgentProfile` hem backend (`maintenance-agents.ts`) hem frontend
  (`maintenance-console.tsx`) içinde doğru import edilmiş mi?
- `accentByAgent` Record'da `LEAD` eksiksiz mi?
- Eski `executiveSummary` banıt JSX'i tamamen silindi mi, kullanılmayan
  `Sparkles` importu kaldı mı?
- Pipeline grid'i 6 sütun (`lg:grid-cols-6`) ve 6. node doğru konumda mı?

- [ ] **Step 10: Commit**

```bash
git add components/agent-node.tsx components/maintenance-console.tsx
git commit -m "Show LEAD synthesis agent in pipeline and response list"
```
