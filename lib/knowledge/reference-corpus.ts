import type { MaintenanceDomain, ReferenceChunk, ReferenceDocument } from "@/lib/models/maintenance";

export const referenceDocuments: ReferenceDocument[] = [
  {
    id: "project-brief",
    title: "Proje Kurulum Promptu",
    sourceType: "brief",
    uploadedAt: "2026-06-14T00:00:00.000Z",
    tags: ["agents", "scope", "guardrails"]
  }
];

export const referenceChunks: ReferenceChunk[] = [
  {
    id: "brief-agent-roles",
    documentId: "project-brief",
    title: "Ajan Rolleri ve Çalışma İlkesi",
    locationLabel: "Kullanıcı promptu / Ajan Yapısı",
    domain: "strategy",
    text:
      "Platform 5 ajanı sırayla tetikler: CORE strateji, FIELD operasyon, FLOW planlama, BASE arşiv, KPI analiz. Yanıtlar gömülü referans dokümanlara dayandırılmalı ve spekülasyondan uzak olmalıdır.",
    keywords: ["core", "field", "flow", "base", "kpi", "ajan", "spekülasyon"]
  },
  {
    id: "brief-diagram-tags",
    documentId: "project-brief",
    title: "Diyagram Tetikleyicileri",
    locationLabel: "Kullanıcı promptu / Görsel Tetikleyiciler",
    domain: "planning",
    text:
      "Ajanlar karmaşık akışları anlatırken metin içinde [Diyagram Önerisi: ...] etiketleri bırakmalıdır; frontend bu etiketleri şematik kutulara veya grafik arayüzlerine dönüştürür.",
    keywords: ["diyagram", "etiket", "akış", "frontend", "görsel"]
  },
  {
    id: "brief-source-of-truth",
    documentId: "project-brief",
    title: "Source of Truth",
    locationLabel: "Kullanıcı promptu / AI Çalışma Prensibi",
    domain: "archive",
    text:
      "Sistem dışarıdan canlı veri almaz. Eğitici rehber olarak tüm yanıtlar sisteme gömülü referans dokümanlara dayanmalıdır.",
    keywords: ["source of truth", "referans", "pdf", "epub", "canlı veri", "kaynak"]
  }
];

const normalize = (value: string) =>
  value
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

export function retrieveChunks(
  chunks: ReferenceChunk[],
  question: string,
  domains: MaintenanceDomain[],
  limit = 4
) {
  const terms = normalize(question);
  const domainSet = new Set(domains);

  return chunks
    .map((chunk) => {
      const haystack = normalize(`${chunk.title} ${chunk.text} ${chunk.keywords.join(" ")}`);
      const lexicalScore = terms.reduce(
        (score, term) => score + (haystack.includes(term) ? 2 : 0),
        0
      );
      const domainScore = domainSet.has(chunk.domain) ? 1.5 : 0;

      return {
        chunk,
        lexicalScore,
        score: lexicalScore + domainScore
      };
    })
    .filter((item) => item.lexicalScore > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.chunk);
}
