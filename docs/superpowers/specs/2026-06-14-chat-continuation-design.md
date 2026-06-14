# Sohbet Devamlılığı (Chat Continuation) — Tasarım

## Amaç

Şu anda her soru bağımsız bir "round" olarak çalışıyor: kullanıcı bir soru
gönderir, 6 ajan (CORE→FIELD→FLOW→BASE→KPI→LEAD) sırayla yanıt üretir ve
ekran tek bir sonuç bloğu gösterir. Yeni bir soru sorulduğunda önceki sonuç
kaybolur.

Hedef: kullanıcı aynı oturumda takip sorusu sorabilsin; ajanlar önceki
round'un sorusu ve LEAD'in özet cevabını bağlam olarak görsün; ekran önceki
round'ları sohbet geçmişi gibi (daraltılabilir bloklar) göstersin.

## Kapsam

- Sadece istemci (client) tarafında oturum içi sohbet geçmişi — sayfa
  yenilenince geçmiş kaybolur. Kalıcı depolama (Appwrite vb.) kapsam dışı.
- Her round (ilk soru + her takip sorusu) TÜM 6 ajan pipeline'ını tekrar
  çalıştırır. Ajanların seçimine (`selectedAgents`) round boyunca dokunulmaz.
- Geçmiş bağlamı her round için yalnızca `{ soru, LEAD cevabı }` çiftlerinden
  oluşur — ajanların ham turn içerikleri geçmişe dahil edilmez.

## Veri modeli değişiklikleri (`lib/models/maintenance.ts`)

Yeni tip:

```ts
export interface ConversationHistoryEntry {
  question: string;
  leadAnswer: string;
}
```

`AskRequest` güncellenir:

```ts
export interface AskRequest {
  question: string;
  mode?: "training" | "decision_support";
  selectedAgents?: AgentCode[];
  history?: ConversationHistoryEntry[];
}
```

`history` opsiyoneldir; gönderilmezse veya boş dizi ise davranış bugünkü
gibi kalır (ilk soru senaryosu).

## MiniMax istemcisi (`lib/agents/minimax.ts`)

`generateMiniMaxAgentTurn` ve `generateMiniMaxLeadSynthesis`'in input
arayüzlerine opsiyonel bir alan eklenir:

```ts
conversationHistory?: ConversationHistoryEntry[]
```

Her iki fonksiyon da, `conversationHistory` doluysa, user prompt'a şu
formatta bir blok ekler (boşsa hiçbir şey eklenmez, mevcut davranış
değişmez):

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

Bu blok, mevcut `userPrompt` dizisinin sonuna (mevcut son elemandan sonra)
tek bir string olarak eklenir — `userPrompt` oluşturma mantığının diğer
kısımları DEĞİŞMEZ.

## Ajan akışı (`lib/agents/maintenance-agents.ts`)

`runMaintenanceAgentsStream` üçüncü bir parametre alır:

```ts
export async function* runMaintenanceAgentsStream(
  question: string,
  selectedAgents?: AgentCode[],
  history?: ConversationHistoryEntry[]
): AsyncGenerator<StreamEvent, void, unknown> {
```

`generateAgentContent` çağrısına (CORE..KPI için) ve
`generateMiniMaxLeadSynthesis` çağrısına (LEAD için) `conversationHistory:
history` eklenir. Diğer akış mantığı (agentShouldAnswer, web fallback,
status hesaplamaları) DEĞİŞMEZ.

## API route (`app/api/ask/route.ts`)

İstek gövdesinden `history` okunur ve doğrulanır:
- `history` tanımlıysa bir dizi olmalı; her eleman `{ question: string,
  leadAnswer: string }` şeklinde olmalı (her iki alan string).
- Geçersiz/eksik formatta eleman varsa o eleman atlanır (sıkı hata
  döndürülmez — geçmiş "best-effort" bağlamdır).
- Doğrulanan `history`, `runMaintenanceAgentsStream`'e üçüncü argüman
  olarak geçirilir.

## Frontend

### Yeni component: `components/conversation-round.tsx`

Mevcut `maintenance-console.tsx` içindeki pipeline grid + agent kartları +
boş durum blokları bu yeni component'e taşınır. Props:

```ts
interface ConversationRoundProps {
  round: AskResponse;
  agents: AgentProfile[];
  isActive: boolean;
  activeAgentCode: AgentCode | null;
  isLoading: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
}
```

- `collapsed === true`: sadece round'un sorusu (başlık olarak) ve LEAD
  cevabının kısa bir özeti/ilk satırı gösterilir; tıklanınca
  `onToggleCollapse` çağrılır ve round genişler.
- `collapsed === false`: bugünkü pipeline grid (6 node) + agent response
  kartları + yükleniyor/boş durum blokları aynen render edilir.

### `components/maintenance-console.tsx` değişiklikleri

- `response: AskResponse | null` state'i kaldırılır; yerine
  `rounds: AskResponse[]` ve `collapsedRoundIndexes: Set<number>` eklenir.
- `submitQuestion`:
  1. `history` listesi `rounds`'tan türetilir:
     `rounds.map((r) => ({ question: r.question, leadAnswer: r.turns.find((t) => t.agent.code === "LEAD")?.content ?? "" }))`.
  2. Yeni boş bir round (`{ question, status: "insufficient_sources",
     executiveSummary: "", turns: [], citations: [] }`) `rounds`'a eklenir.
  3. Önceki tüm round index'leri `collapsedRoundIndexes`'e eklenir (otomatik
     daraltma); yeni round daraltılmamış kalır.
  4. `/api/ask` isteğine `history` eklenir.
  5. NDJSON stream event'leri artık `rounds`'taki SON elemanı güncelleyecek
     şekilde işlenir (`handleStreamEvent` aynı switch yapısını korur, sadece
     `setResponse` yerine `setRounds((current) => ... son elemanı güncelle
     ...)`).
- Soru textarea'sı gönderim sonrası temizlenir (`setQuestion("")`).
- "Yeni Sohbet" butonu eklenir: `rounds` ve `collapsedRoundIndexes` sıfırlanır,
  `question` örnek sorulardan birine döner (bugünkü ilk durum).
- Hata durumunda (`error`), sadece akıştaki son round etkilenir; önceki
  round'lar değişmeden kalır.
- `agents.map` (Ajan Seçimi toggle, Ajan Kapsamı listesi) DEĞİŞMEZ — bunlar
  zaten round'a özgü değil, genel seçim/durum gösterimleridir ve son round'a
  göre güncellenir (`rounds[rounds.length - 1]`).

## Hata yönetimi

- `history` formatı geçersizse route seviyesinde sessizce filtrelenir (üstte
  açıklandı) — istek başarısız olmaz.
- Bir round'daki stream hatası diğer round'ları etkilemez; sadece o round
  `error` durumuna düşer ve "Yeni Sohbet" veya tekrar deneme ile devam
  edilebilir.
- `conversationHistory` boş olduğunda (`history` yok veya `[]`), prompt'larda
  hiçbir ek metin eklenmez — birinci round davranışı bugünle bit-bit aynıdır.

## Test planı

- `npm run typecheck && npm run lint && npm run build`.
- Manuel test (dev server):
  1. İlk soruyu gönder, LEAD cevabının geldiğini doğrula.
  2. Takip sorusu gönder (örn. "Bunu OEE ile ilişkilendir"); NDJSON
     isteğinde `history` alanının ilk round'un soru+LEAD cevabını içerdiğini
     doğrula (network sekmesi veya curl ile).
  3. İkinci round'un ajan yanıtlarının ilk round'a referans verdiğini
     (örn. "önceki" / "az önce belirtilen" gibi bağlam farkındalığı) gözle
     doğrula.
  4. UI'da birinci round'un otomatik daraltıldığını, başlığa tıklayınca
     yeniden genişlediğini doğrula.
  5. "Yeni Sohbet" butonuna basıldığında tüm round'ların temizlendiğini
     doğrula.
