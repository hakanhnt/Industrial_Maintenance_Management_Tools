import type { AgentProfile } from "@/lib/models/maintenance";

export const agentProfiles: AgentProfile[] = [
  {
    code: "CORE",
    name: "Strateji",
    domain: "strategy",
    role: "İşletme odaklı bakım ve güvenilirlik stratejilerini değerlendirir.",
    guardrail:
      "Stratejik önerileri yalnızca kaynak dokümanlarda bulunan kavramlarla sınırlar.",
    triggerKeywords: ["bcm", "rcm", "kritiklik", "strateji", "risk", "güvenilirlik"]
  },
  {
    code: "FIELD",
    name: "Operasyon",
    domain: "field",
    role: "Koruyucu, kestirimci ve otonom bakım saha prosedürlerini netleştirir.",
    guardrail:
      "Saha adımlarında güvenlik, yetkinlik ve ölçüm kanıtı belirsizse bunu açıkça belirtir.",
    triggerKeywords: ["prosedür", "saha", "pm", "pd", "otonom", "inspeksiyon"]
  },
  {
    code: "FLOW",
    name: "Planlama",
    domain: "planning",
    role: "İş emirleri, çizelgeleme, backlog ve kaynak yönetimi akışlarını kurar.",
    guardrail:
      "Planlama akışını ölçülebilir girdiler, roller ve karar kapılarıyla ifade eder.",
    triggerKeywords: ["iş emri", "çizelge", "plan", "kaynak", "backlog", "öncelik"]
  },
  {
    code: "BASE",
    name: "Arşiv",
    domain: "archive",
    role: "Ekipman hiyerarşisi, component-level kayıtlar ve minifile dokümantasyonunu yönetir.",
    guardrail:
      "Ekipman sicil önerilerinde hiyerarşi, belge izi ve revizyon bilgisini korur.",
    triggerKeywords: ["ekipman", "sicil", "minifile", "doküman", "hiyerarşi", "parça"]
  },
  {
    code: "KPI",
    name: "Analiz",
    domain: "analytics",
    role: "OEE, MTBF, MTTR ve Wrench Time metriklerini yorumlar.",
    guardrail:
      "Formül, veri tanımı ve yorum ayrımını net tutar; veri yoksa tahmin üretmez.",
    triggerKeywords: ["oee", "mtbf", "mttr", "wrench", "kpi", "metrik", "analiz"]
  }
];

export const leadAgentProfile: AgentProfile = {
  code: "LEAD",
  name: "Yönetici",
  domain: "strategy",
  role: "Diğer ajanların yanıtlarını okuyup kullanıcının sorusu için tek, tutarlı bir sonuç cevabı üretir.",
  guardrail:
    "Sadece diğer ajanların ürettiği içerikleri sentezler; yeni teknik iddia veya kaynak eklemez.",
  triggerKeywords: []
};
