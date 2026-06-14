# Yetersiz Ajan Yanıtlarında Web Kaynaklı Özet Üretimi

## Amaç

`runMaintenanceAgentsStream` içinde, yerel kanıt yetersiz olduğunda Tavily
üzerinden web araması zaten tetikleniyor (`searchWebEvidence`). Ancak web
kanıtı bulunsa bile MiniMax çağrısı başarısız olur veya yine "yetersiz"
işaretlenirse, mevcut kod web kanıtını atıp jenerik bir şablon metin
(`fallbackTurn`'ün "grounded" dalı) döndürüyor. Bu metin web aramasından gelen
hiçbir bilgiyi yansıtmıyor.

Hedef: MiniMax web kanıtıyla da cevap üretemezse, ajan turunu web arama
sonuçlarından doğrudan derlenen bir özetle doldurmak; böylece "yeterli yanıt
alınamadığında web kaynakları araştırılarak yanıt üretilsin" isteği LLM'den
bağımsız olarak da karşılanır.

## Değişiklik kapsamı

Sadece `lib/agents/maintenance-agents.ts` dosyası değişir. Yeni tip veya API
değişikliği yok.

### 1. Yeni yardımcı fonksiyon: `buildWebSummary`

```ts
function buildWebSummary(
  agent: AgentProfile,
  evidence: ReferenceChunk[]
): string {
  const points = evidence
    .slice(0, 3)
    .map((chunk) => `${chunk.title}: ${truncateForSummary(chunk.text, 240)}`)
    .join(" ");

  return [
    `${agent.code}: Kayıtlı bilgi tabanında bu soruyla doğrudan eşleşen kanıt bulunamadı,`,
    `bu nedenle web kaynaklarından derlenen bilgiler özetlendi.`,
    points,
    "[Diyagram Önerisi: Web kaynaklı kanıt değerlendirme akışı]"
  ].join(" ");
}

function truncateForSummary(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength).trim()}...`;
}
```

`evidence` parametresi her zaman web kanıtı (Tavily sonuçları) olacağından
ayrıca kontrol gerekmez — çağıran taraf bunu garanti eder (aşağıya bakın).

### 2. İkinci web fallback denemesinin genişletilmesi

Mevcut blok:

```ts
if (isInsufficientContent(content) && !usedWebFallback) {
  const webEvidence = await searchWebEvidence(normalizedQuestion, agent.domain, 3);

  if (webEvidence.length > 0) {
    try {
      const webContent = await generateAgentContent(agent, normalizedQuestion, turns, webEvidence);

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
```

Yeni davranış: `webEvidence` bulunduğunda, MiniMax sonucu ne olursa olsun
`evidence` ve `usedWebFallback` güncellenir. MiniMax başarılıysa içerik onun
çıktısı olur; değilse `content` `null` kalır (üçüncü adımda özet ile
doldurulacak).

```ts
if (isInsufficientContent(content) && !usedWebFallback) {
  const webEvidence = await searchWebEvidence(normalizedQuestion, agent.domain, 3);

  if (webEvidence.length > 0) {
    evidence = webEvidence;
    usedWebFallback = true;

    try {
      const webContent = await generateAgentContent(agent, normalizedQuestion, turns, webEvidence);
      content = isInsufficientContent(webContent) ? null : webContent;
    } catch {
      content = null;
    }
  }
}
```

### 3. Son karar bloğunun genişletilmesi

Mevcut blok:

```ts
if (isInsufficientContent(content)) {
  content = null;
  evidence = [];
}
```

Yeni davranış: `content` hâlâ yetersizse ve elimizde web kanıtı varsa
(`usedWebFallback && evidence.length > 0`), `buildWebSummary` ile özet
üretilir. Aksi halde (hiç web kanıtı yoksa) eski davranış korunur.

```ts
if (isInsufficientContent(content)) {
  if (usedWebFallback && evidence.length > 0) {
    content = buildWebSummary(agent, evidence);
  } else {
    content = null;
    evidence = [];
  }
}
```

### 4. Durum (status) hesaplaması

Değişmiyor:

```ts
const status: EvidenceStatus =
  usedWebFallback && content
    ? "web_fallback"
    : evidence.length === 0 || hasOnlyBootstrapEvidence(evidence)
    ? "insufficient_sources"
    : "grounded";
```

`buildWebSummary` her zaman dolu bir string döndürdüğü için, web özetiyle
doldurulan turlar otomatik olarak `"web_fallback"` statüsü alır — frontend'de
zaten bu statü için "web kaynaklı" rozet/gösterimi mevcut.

## Akış örneği (yeni davranış)

1. Yerel kanıt yetersiz → Tavily araması 1 → web kanıtı bulunur,
   `usedWebFallback = true`, `evidence = webEvidence`.
2. MiniMax web kanıtıyla üretim yapar ama "YETERSIZ_KANIT" döner →
   `content = null`.
3. `isInsufficientContent(content) && !usedWebFallback` → `false` (çünkü
   `usedWebFallback` zaten `true`), ikinci Tavily araması atlanır.
4. Son blok: `isInsufficientContent(null)` → `true`,
   `usedWebFallback && evidence.length > 0` → `true` →
   `content = buildWebSummary(agent, evidence)`.
5. `status = "web_fallback"` (çünkü `usedWebFallback && content` artık dolu).

Diğer örnek — yerel kanıt yeterli ama MiniMax üretimi başarısız ve hiç web
araması tetiklenmemiş: `usedWebFallback = false`, `evidence.length > 0` ama
koşul `usedWebFallback && evidence.length > 0` → `false` → eski davranış
(`content = null; evidence = []`, jenerik "insufficient_sources" metni).
Bu, web araması hiç denenmemişse mevcut davranışı korur; sadece web araması
gerçekten yapılmış ve sonuç vermişse özet üretilir.

## Kapsam dışı

- `searchWebEvidence` / Tavily entegrasyonu değişmiyor.
- Web aramasının tetiklenme koşulları (ne zaman çağrıldığı) değişmiyor —
  sadece sonuçların MiniMax başarısız olduğunda da kullanılması sağlanıyor.
- Frontend (`maintenance-console.tsx`) değişmiyor; `"web_fallback"` statüsü
  zaten destekleniyor.

## Test planı

- `npm run typecheck`, `npm run lint`, `npm run build` ile doğrulama.
- Manuel test: `TAVILY_API_KEY` geçerliyken, yerel korpusta karşılığı olmayan
  ama web'de karşılığı olan bir soru sorulduğunda, en az bir ajanın
  `"web_fallback"` statüsüyle ve web kaynaklı içerikle (chunk başlıkları
  metinde görünür şekilde) döndüğünü doğrulamak.
- Mevcut "insufficient_sources" senaryosu (hiç kanıt yok, web de boş) hâlâ
  jenerik fallback metnini döndürmeli — regresyon kontrolü.
