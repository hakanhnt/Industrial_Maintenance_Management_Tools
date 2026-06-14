# Yönetici (LEAD) Ajan — Yanıt Sentezi

## Amaç

Şu anda CORE→FIELD→FLOW→BASE→KPI ajanları sırayla çalışıyor ve her biri kendi
alanında bir yanıt üretiyor. Kullanıcıya ayrıca gösterilen "Yönetici Özeti"
(`executiveSummary`) ise statik bir şablon metin — ajanların gerçek
çıktılarını sentezlemiyor.

Hedef: tüm seçili ajanlar tamamlandıktan sonra, bir **LEAD (Yönetici)** ajanı
diğer ajanların ürettiği yanıtları okuyup tek, tutarlı, tekrarsız bir Türkçe
cevapta toplasın. Bu, kullanıcının "yönetici ajan soruyu diğer ajanlara
dağıtsın, cevabı toparlayarak tek bir cevap dönsün" isteğini karşılar.

## Kapsam

Bu spec sadece **backend sentez akışı + frontend gösterimi** ile sınırlıdır.
Sohbet geçmişi / çoklu-tur konuşma (chat continuation) bu spec'in kapsamı
dışındadır — ayrı bir sonraki iş olarak ele alınacak.

## Veri modeli değişiklikleri (`lib/models/maintenance.ts`)

```ts
export type AgentCode = "CORE" | "FIELD" | "FLOW" | "BASE" | "KPI" | "LEAD";
```

`StreamEvent`, `AgentTurn`, `AgentProfile` tiplerinde başka değişiklik yok —
LEAD da normal bir `AgentProfile`/`AgentTurn` olarak temsil edilir.

`final` event'indeki `executiveSummary: string` alanı tipte kalır (geriye
dönük uyumluluk / olası başka tüketiciler için), ancak backend artık her
zaman `""` gönderir ve frontend bu alanı kullanmaz.

## Ajan profili (`lib/agents/profiles.ts`)

Mevcut `agentProfiles` dizisine (5 seçilebilir ajan) **eklenmeyen**, ayrı bir
export:

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

`domain: "strategy"` ve `triggerKeywords: []` seçimleri keyfidir — LEAD için
`domainsForAgent`/`agentShouldAnswer` gibi seçim mantığı hiç çalıştırılmaz,
bu alanlar sadece `AgentProfile` arayüzünü tatmin etmek için var.

## MiniMax istemcisi (`lib/agents/minimax.ts`)

Mevcut `generateMiniMaxAgentTurn` içindeki şu kısımlar paylaşılan bir
yardımcıya çıkarılır:
- `getMiniMaxConfig` (zaten modül seviyesinde, değişmez)
- İki aşamalı istek/retry mantığı (`requestMiniMax` + `wasTruncated` +
  `extractMiniMaxText` + `trimToCompleteSentence` kombinasyonu)

Yeni paylaşılan fonksiyon:

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

`generateMiniMaxAgentTurn` bu fonksiyonu kullanacak şekilde sadeleştirilir
(sistem/kullanıcı promptlarını oluşturup `requestMiniMaxCompletion`'ı
çağırır); davranışı/promptları DEĞİŞMEZ.

Yeni export:

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

## Ajan akışı (`lib/agents/maintenance-agents.ts`)

`runMaintenanceAgentsStream` generator'ının ana döngüsünden SONRA, mevcut
`answeredTurns`/`status` hesaplamasından sonra şu adım eklenir:

```ts
const answeredTurns = turns.filter((turn) => turn.status !== "skipped");
// ... mevcut `status` hesaplaması değişmeden kalır ...

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
```

`generateMiniMaxLeadSynthesis` ve mevcut `generateAgentContent` arasında
isim çatışması yok; `leadAgentProfile` `lib/agents/profiles.ts`'ten import
edilir.

Yeni yardımcı fonksiyon (mevcut `truncateText` — `lib/agents/text-utils.ts`
— kullanılır, ek import gerekir):

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

## Frontend (`components/`)

### `components/agent-node.tsx`

`accentByAgent` Record'a LEAD girişi eklenir:

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

### `components/maintenance-console.tsx`

- `leadAgentProfile` `lib/agents/profiles.ts`'ten import edilir.
- Pipeline grid'i (`grid gap-3 lg:grid-cols-5`) `lg:grid-cols-6` olur ve
  `agents.map(...)` döngüsünden sonra, aynı yapıda, sabit bir 6. `AgentNode`
  eklenir:

```tsx
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
```

  (Bağlayıcı ok metni "CORE → FIELD → FLOW → BASE → KPI" →
  "CORE → FIELD → FLOW → BASE → KPI → LEAD" olarak güncellenir.)

- Mevcut "Yönetici Özeti" banıt bloğu (`response.executiveSummary && (...)`)
  **tamamen kaldırılır**. `answeredTurns.map((turn) => <AgentResponseCard .../>)`
  zaten LEAD turunu (varsa) normal bir kart olarak gösterecektir — ek kod
  gerekmez, çünkü `answeredTurns` zaten `status !== "skipped"` filtresini
  kullanıyor ve LEAD turu da `turns` dizisine eklenmiş oluyor.
- "Ajan Seçimi" toggle grid'i (`agents.map`, `grid-cols-5`) ve "Ajan Kapsamı"
  listesi (`agents.map`, `agentScopeLabel`) **değişmez** — bunlar
  `agents` prop'undan (5 seçilebilir ajan) geliyor, LEAD bu listede yok.

## Hata yönetimi

- `generateMiniMaxLeadSynthesis` reddederse (`.catch(() => null)`) veya
  `null` dönerse (API key yok / boş içerik), `buildLeadFallbackSummary`
  devreye girer — LEAD turu her zaman dolu bir `content` ile döner.
- LEAD turunun başarısız olması (örn. fallback'e düşmesi) akışı durdurmaz;
  `status` her zaman `"grounded"` olur (sentez, ham kanıt gerektirmez).
- Hiçbir ajan yanıt vermediyse (`answeredTurns.length === 0`), LEAD
  `"skipped"` statüsünde döner ve `AgentResponseCard` bu turu render etmez
  (mevcut `if (turn.status === "skipped") return null;` davranışı).

## Test planı

- `npm run typecheck && npm run lint && npm run build`.
- Manuel test: dev server üzerinde bir soru gönderildiğinde:
  - NDJSON akışında `{"type":"agent_start","agent":"LEAD"}` ve ardından
    `{"type":"agent_turn","turn":{"agent":{"code":"LEAD",...},...}}`
    event'lerinin KPI turundan sonra geldiğini doğrulamak.
  - LEAD turunun `content`'inin diğer ajanların yanıtlarını sentezleyen
    (veya fallback özetleyen), CORE/FIELD/... gibi kod adlarına atıfta
    bulunmayan bir metin olduğunu doğrulamak.
  - UI'da 6. "Yönetici" kartının pipeline'da göründüğünü ve
    `AgentResponseCard` olarak LEAD yanıtının listelendiğini doğrulamak.
  - Eski "Yönetici Özeti" banıtının artık görünmediğini doğrulamak.
  - Hiçbir ajan yanıt vermeyen bir soru ile (örn. tamamen alaka dışı bir
    soru, eğer mevcutsa) LEAD'in pipeline'da "atlanmış" göründüğünü ve
    kart olarak render edilmediğini doğrulamak (best-effort, bu senaryo
    canlı kanıt durumuna bağlı).
