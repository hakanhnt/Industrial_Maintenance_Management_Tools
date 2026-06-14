# Ajan-bazlı Streaming Yanıt Akışı

## Amaç

`/api/ask` şu an tüm ajanlar (CORE→FIELD→FLOW→BASE→KPI) çalışmayı bitirene kadar
bekletip tek bir JSON yanıtı döndürüyor. Bu, kullanıcı için uzun bir "loading"
ekranı (fake interval ile dönen ajan animasyonu) demek. Hedef, her ajan turu
tamamlandığında bu sonucu hemen frontend'e iletmek, böylece kullanıcı ajanların
gerçek zamanlı olarak yanıt ürettiğini görsün.

## Yaklaşım

POST isteği bir body (`question`, `selectedAgents`) içerdiği için tarayıcının
yerleşik `EventSource` (SSE) API'si kullanılamaz (GET-only). Bunun yerine
**NDJSON streaming over fetch** kullanılacak: response `Content-Type:
application/x-ndjson` olan bir `ReadableStream`, her satır bağımsız bir JSON
olay nesnesi. Frontend `fetch().body.getReader()` ile akışı satır satır okuyup
parse eder.

## Olay (event) tipleri

```ts
type StreamEvent =
  | { type: "agent_start"; agent: AgentCode }
  | { type: "agent_turn"; turn: AgentTurn }
  | { type: "final"; status: EvidenceStatus; executiveSummary: string; citations: AskResponse["citations"] }
  | { type: "error"; message: string };
```

Her satır `JSON.stringify(event) + "\n"` formatında yazılır.

## Backend değişiklikleri

### `lib/agents/maintenance-agents.ts`

- `runMaintenanceAgents` fonksiyonu, mevcut sıralı for-loop mantığını koruyan
  bir **async generator** `runMaintenanceAgentsStream` haline getirilir
  (CORE→KPI sırası ve önceki turlara bağımlılık aynı kalır — ajanların
  paralelleştirilmesi bu işin kapsamı dışında, ayrı bir öneri olarak
  bırakılıyor).
- Ajan döngüsünde, ajan işlenmeye başlamadan `{ type: "agent_start", agent:
  agent.code }` yield edilir.
- Ajan turu tamamlandığında (skipped dahil) `{ type: "agent_turn", turn }`
  yield edilir.
- Döngü bittikten sonra toplam `status` ve `executiveSummary` hesaplanır ve
  `{ type: "final", ... }` yield edilir.
- Ajan içi hata yönetimi (MiniMax/Tavily try/catch → fallback turu) **değişmez**.
  Bir ajanın başarısız olması akışı durdurmaz, sadece o ajanın turu
  `insufficient_sources` fallback içeriğiyle yield edilir.
- Mevcut `runMaintenanceAgents` (non-streaming) fonksiyonu kaldırılır;
  tek bir generator implementasyonu olur. Geriye dönük uyumluluk
  gerekmiyor çünkü tek tüketici `app/api/ask/route.ts`.

### `app/api/ask/route.ts`

- Mevcut validasyon (boş soru, 3000 karakter limiti, `selectedAgents`
  filtreleme) aynı kalır.
- Validasyon sonrası, generator'ı saran bir `ReadableStream` oluşturulur:
  her `next()` sonucu NDJSON satırı olarak `controller.enqueue` edilir.
- Generator içinde beklenmeyen bir exception olursa (örn. `listReferenceChunks`
  hatası), `{ type: "error", message: "..." }` yazılır ve stream kapatılır.
- Response header: `Content-Type: application/x-ndjson`, `Cache-Control:
  no-cache`.

## Frontend değişiklikleri (`components/maintenance-console.tsx`)

- `submitQuestion`:
  - `response` state'i istek başında
    `{ question, status: "insufficient_sources" /* placeholder */,
    executiveSummary: "", turns: [], citations: [] }` ile set edilir (boş
    ama var — `isLoading` true olduğu sürece UI zaten "yükleniyor" ekranını
    gösteriyor, bu yüzden placeholder status görünür olmaz).
  - `fetch` cevabının `body.getReader()`'ı ile akış okunur; gelen byte'lar
    `TextDecoder` ile string'e çevrilir, `\n` ile satırlara bölünür, her
    tam satır `JSON.parse` edilip event tipine göre işlenir:
    - `agent_start`: `activeAgentCode` state'i bu ajan koduna set edilir.
    - `agent_turn`: `response.turns` dizisine eklenir (push, immutable update).
    - `final`: `response.status` ve `response.executiveSummary` güncellenir,
      `isLoading = false`.
    - `error`: `error` state'i set edilir, `isLoading = false`.
  - Tamamlanmamış son satır (buffer'da kalan parça) bir sonraki chunk ile
    birleştirilir.
- Mevcut fake `setInterval` tabanlı `activeAgentIndex` döngüsü ve ilgili
  `useEffect` **kaldırılır**. `activeAgentCode` artık doğrudan state'ten gelir
  (`agent_start` event'leriyle güncellenen `activeAgentCode` state'i).
- `AgentNode`'un `working` prop'u: `isLoading && activeAgentCode === agent.code`
  mantığı aynı kalır, sadece `activeAgentCode` artık gerçek sunucu durumunu
  yansıtır.
- Genel ağ/stream hatası (fetch reddi, `!result.ok`, veya `error` event'i)
  mevcut `error` state mekanizmasıyla aynı şekilde gösterilir.
- `answeredTurns` / `skippedTurns` hesaplamaları `response.turns` üzerinden
  aynı şekilde çalışır — turlar tek tek eklendiği için kartlar sırayla belirir.

## Kapsam dışı

- Token-bazlı (kelime kelime) streaming — MiniMax streaming API
  entegrasyonu gerektirir, bu işin kapsamı dışında.
- Ajanların paralel çalıştırılması — ayrı bir performans iyileştirmesi
  olarak bırakılıyor.
- Stream formatı için SSE/EventSource — POST body kısıtı nedeniyle
  uygulanamaz.

## Test planı

- `npm run typecheck` ve `npm run build` ile tip/derleme kontrolü.
- Manuel doğrulama (dev sunucusu):
  - Bir soru gönderildiğinde ajan kartlarının tek tek (toplu değil) sırayla
    geldiğini gözlemlemek.
  - "Çalışıyor" göstergesinin (`AgentNode` working state) gerçek aktif
    ajanla eşleştiğini doğrulamak.
  - Bir ajan `skipped` olduğunda akışın kesilmeden devam ettiğini
    doğrulamak.
  - Seçili ajan sayısı değiştirildiğinde (`selectedAgents`) akışın doğru
    ajan setiyle çalıştığını doğrulamak.
  - Ağ hatası senaryosunda (`error` event veya `!result.ok`) mevcut hata
    mesajının göründüğünü doğrulamak.
