# Web Kaynaklı Fallback Özeti Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bir ajan için MiniMax web kanıtıyla da yanıt üretemediğinde, ajan turunu jenerik şablon metin yerine web arama sonuçlarından (Tavily) doğrudan derlenmiş bir özetle doldurmak.

**Architecture:** `lib/agents/maintenance-agents.ts` içine yeni bir `buildWebSummary` yardımcı fonksiyonu eklenir ve `runMaintenanceAgentsStream` generator'ındaki ikinci web-fallback bloğu ile son "insufficient content" kararı, web kanıtı mevcutsa bu özeti kullanacak şekilde güncellenir. Bu proje test framework'ü içermediğinden doğrulama `npm run typecheck`, `npm run lint`, `npm run build` ve manuel dev-server testi ile yapılır.

**Tech Stack:** Next.js (App Router), TypeScript

---

### Task 1: Web kanıtından özet üretimi ekle

**Files:**
- Modify: `lib/agents/maintenance-agents.ts`

Bu görev spec dosyasındaki `docs/superpowers/specs/2026-06-14-web-fallback-summary-design.md` tasarımının tamamını uygular. Spec dosyasını okuyup tüm bölümlerini (1-4) ve "Akış örneği" bölümünü referans alın.

- [ ] **Step 1: `buildWebSummary` ve `truncateForSummary` yardımcı fonksiyonlarını ekle**

`lib/agents/maintenance-agents.ts` dosyasında, mevcut `fallbackTurn` fonksiyonundan hemen ÖNCE (yani satır 30'dan önce, `hasUsableEvidence` fonksiyonunun altına) şu iki fonksiyonu ekleyin:

```ts
function truncateForSummary(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength).trim()}...`;
}

function buildWebSummary(agent: AgentProfile, evidence: ReferenceChunk[]): string {
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
```

`AgentProfile` ve `ReferenceChunk` tipleri dosyanın en üstündeki import bloğunda zaten mevcut (satır 6-14), ek import gerekmiyor.

- [ ] **Step 2: İkinci web-fallback bloğunu güncelle**

Aynı dosyada, `runMaintenanceAgentsStream` generator'ı içindeki şu mevcut bloğu bulun (yaklaşık satır 220-245):

```ts
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
```

Bunu şu şekilde değiştirin:

```ts
    if (isInsufficientContent(content) && !usedWebFallback) {
      const webEvidence = await searchWebEvidence(
        normalizedQuestion,
        agent.domain,
        3
      );

      if (webEvidence.length > 0) {
        evidence = webEvidence;
        usedWebFallback = true;

        try {
          const webContent = await generateAgentContent(
            agent,
            normalizedQuestion,
            turns,
            webEvidence
          );
          content = isInsufficientContent(webContent) ? null : webContent;
        } catch {
          content = null;
        }
      }
    }
```

Değişikliğin özü: `webEvidence` bulunduğunda `evidence` ve `usedWebFallback` artık MiniMax sonucundan BAĞIMSIZ olarak güncelleniyor. MiniMax başarısız/yetersiz olursa `content` `null` olur ama `evidence` web kanıtı olarak kalır (Step 3'te kullanılacak).

- [ ] **Step 3: Son "insufficient content" kararını güncelle**

Aynı dosyada, hemen onun altındaki şu bloğu bulun (yaklaşık satır 247-250):

```ts
    if (isInsufficientContent(content)) {
      content = null;
      evidence = [];
    }
```

Bunu şu şekilde değiştirin:

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

- [ ] **Step 4: Tip kontrolü, lint ve build çalıştır**

Proje kökünde (`/Users/hakan/Desktop/Bakım_Rehber`) şu komutu çalıştırın:

```bash
npm run typecheck && npm run lint && npm run build
```

Beklenen: Üçü de hatasız tamamlanır (mevcut build zaten başarılı durumdaydı, yeni kod tip hatası içermemeli).

- [ ] **Step 5: Statü hesaplamasının değişmediğini doğrula**

Aynı dosyada, `runMaintenanceAgentsStream` içinde Step 3'te değiştirdiğiniz bloğun hemen altında şu kodun HİÇBİR DEĞİŞİKLİK YAPILMADAN durduğunu doğrulayın (yaklaşık satır 252-258'de olmalı, sadece satır numarası kaymış olabilir):

```ts
    const finalContent = content ?? fallbackTurn(agent, normalizedQuestion, evidence, turns);
    const status: EvidenceStatus =
      usedWebFallback && content
        ? "web_fallback"
        : evidence.length === 0 || hasOnlyBootstrapEvidence(evidence)
        ? "insufficient_sources"
        : "grounded";
```

Bu kod değişmemeli çünkü: Step 1-3 sayesinde `content` artık `buildWebSummary` çıktısıyla dolu olabiliyor, bu durumda `usedWebFallback && content` `true` olur ve `status = "web_fallback"` olur — istenen davranış bu. Eğer bu blok farklıysa (örn. başka bir görev tarafından değiştirilmişse), DUR ve mevcut haliyle raporla; bu plan bu bloğun mevcut haliyle uyumlu olmasını bekliyor.

- [ ] **Step 6: Manuel doğrulama (dev server)**

Dev server'ın zaten `http://localhost:3000` üzerinde çalıştığını kontrol edin (`lsof -i :3000`). Çalışmıyorsa `npm run dev` ile başlatın (arka planda, `run_in_background`).

Yerel korpusta karşılığı olmayan ama web'de bulunabilecek bir soru ile `/api/ask` endpoint'ini test edin, örneğin:

```bash
curl -N -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "ISO 55000 varlık yönetimi standardının temel maddeleri nelerdir?"}' \
  --max-time 90
```

Akan NDJSON satırlarını inceleyin. En azından bir `agent_turn` event'inde `"status":"web_fallback"` görmeyi ve o turun `content` alanında web arama sonuçlarından gelen başlık/metin parçalarını (örn. bir web sayfası başlığı ve özet metni) içerdiğini doğrulayın — jenerik "alanıma giren kanıtlar yeterli düzeyde bulundu" şablon metni OLMAMALI.

Not: Bu curl komutu uzun sürebilir (her ajan için MiniMax + olası Tavily çağrıları). Zaman aşımı veya kısmi sonuç alınması, en azından bir ajanın `web_fallback` statüsüyle döndüğü görüldüyse sorun değildir.

- [ ] **Step 7: Self-review**

Değişiklikleri gözden geçirin:
- `buildWebSummary` ve `truncateForSummary` fonksiyonları kullanılıyor mu (dead code yok)?
- `searchWebEvidence`'in çağrılma koşulları DEĞİŞMEDİ mi (sadece sonuçların kullanım şekli değişti)?
- İlk web-fallback bloğu (satır ~199-210, `!hasUsableEvidence(evidence)` kontrolü) DOKUNULMADAN kaldı mı?
- `fallbackTurn` fonksiyonu hâlâ çağrılıyor mu (evidence boşsa hâlâ kullanılmalı)?

- [ ] **Step 8: Commit**

```bash
git add lib/agents/maintenance-agents.ts
git commit -m "Generate fallback summaries from web evidence when MiniMax fails"
```
