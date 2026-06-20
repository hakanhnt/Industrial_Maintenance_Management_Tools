import type { AgentProfile, ConversationHistoryEntry, ReferenceChunk } from "@/lib/models/maintenance";
import { truncateText } from "@/lib/agents/text-utils";

interface GenerateAgentTurnInput {
  agent: AgentProfile;
  question: string;
  previousTurns: Array<{ code: string; content: string }>;
  evidence: ReferenceChunk[];
  conversationHistory?: ConversationHistoryEntry[];
}

interface MiniMaxChoice {
  finish_reason?: string;
  message?: {
    content?: string;
  };
  text?: string;
}

interface MiniMaxResponse {
  choices?: MiniMaxChoice[];
  reply?: string;
  output_text?: string;
  text?: string;
}

function getMiniMaxConfig() {
  const apiKey = process.env.MINIMAX_API_KEY;

  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    endpoint:
      process.env.MINIMAX_API_URL ??
      "https://api.minimaxi.chat/v1/chat/completions",
    model: process.env.MINIMAX_MODEL ?? "MiniMax-M1"
  };
}

function extractMiniMaxText(data: MiniMaxResponse) {
  const text =
    data.choices?.[0]?.message?.content ??
    data.choices?.[0]?.text ??
    data.reply ??
    data.output_text ??
    data.text ??
    null;

  const cleaned = text
    ?.replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/think>/gi, "")
    .trim();

  if (/^yeters[iıİI]z[_\s-]*kan[iıİI]t\b/i.test(cleaned ?? "")) {
    return null;
  }

  return cleaned || null;
}

function trimToCompleteSentence(value: string) {
  if (/[.!?…]$/.test(value.trim())) {
    return value.trim();
  }

  const lastSentenceEnd = Math.max(
    value.lastIndexOf("."),
    value.lastIndexOf("!"),
    value.lastIndexOf("?"),
    value.lastIndexOf("…")
  );

  if (lastSentenceEnd < 120) {
    return value.trim();
  }

  return value.slice(0, lastSentenceEnd + 1).trim();
}

function wasTruncated(data: MiniMaxResponse) {
  return data.choices?.some((choice) => choice.finish_reason === "length") ?? false;
}

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

async function requestMiniMaxCompletion(
  systemPrompt: string,
  userPrompt: string
): Promise<string | null> {
  const config = getMiniMaxConfig();

  if (!config) {
    return null;
  }

  const miniMaxConfig = config;

  async function requestMiniMax(maxTokens: number) {
    const response = await fetch(miniMaxConfig.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${miniMaxConfig.apiKey}`
      },
      body: JSON.stringify({
        model: miniMaxConfig.model,
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
    "Sen kaynak dokümanlara dayalı bir bakım yönetimi eğitim ajanısın.",
    "Ton: Skeptic Analyst. Net, teknik, doğrulanabilir ve spekülasyondan uzak yaz.",
    "İç muhakeme, chain-of-thought veya <think> bloğu yazma; yalnızca nihai cevabı ver.",
    "Kaynak adı, kaynak ID'si, sayfa bilgisi veya parantez içinde citation yazma.",
    "Kaynaklarda olmayan teknik iddiaları üretme. Kaynak yetersizse açıkça belirt.",
    "Kanıtlar soruyu doğrudan cevaplamıyorsa yalnızca YETERSIZ_KANIT yaz.",
    "Gerektiğinde tam olarak şu biçimde diyagram etiketi bırak: [Diyagram Önerisi: kısa açıklama]"
  ].join("\n");

  const userPrompt =
    [
      `Kod adın: ${input.agent.code}. Rolün: ${input.agent.role}`,
      `Guardrail: ${input.agent.guardrail}`,
      "",
      `Kullanıcı sorusu: ${input.question}`,
      "",
      `Önceki ajan konuşmaları:\n${previousText || "Yok"}`,
      "",
      `Kanıt parçaları:\n${evidenceText || "Kanıt bulunamadı."}`,
      "",
      "Kullanıcı sorusuna en fazla 300 kelimelik, son derece kapsamlı, detaylı, teknik ve açıklayıcı bir Türkçe cevap üret. Konunun tüm alt boyutlarını ve kanıt parçalarını derinlemesine açıkla. Cevabı yarıda kesme. Kaynak adı, kaynak id'si veya citation yazma."
    ].join("\n") + buildHistoryBlock(input.conversationHistory);

  return requestMiniMaxCompletion(systemPrompt, userPrompt);
}

interface GenerateLeadSynthesisInput {
  question: string;
  turns: Array<{ code: string; name: string; content: string }>;
  conversationHistory?: ConversationHistoryEntry[];
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

  const userPrompt =
    [
      `Kullanıcı sorusu: ${input.question}`,
      "",
      `Uzman ajan yanıtları:\n${turnsText}`,
      "",
      "Kullanıcı sorusuna uzman ajanların ürettiği tüm yanıtları sentezleyerek, aralarındaki bağlantıları kuran ve çelişkileri çözen en fazla 450 kelimelik, son derece kapsamlı ve derinlemesine bir Türkçe cevap üret. Cevabı yarıda kesme."
    ].join("\n") + buildHistoryBlock(input.conversationHistory);

  return requestMiniMaxCompletion(systemPrompt, userPrompt);
}

export interface GenerateMiniMaxRAGResponseInput {
  question: string;
  evidence: ReferenceChunk[];
  conversationHistory?: ConversationHistoryEntry[];
}

export async function generateMiniMaxRAGResponse(
  input: GenerateMiniMaxRAGResponseInput
): Promise<string | null> {
  const config = getMiniMaxConfig();

  if (!config) {
    return null;
  }

  const evidenceText = input.evidence
    .map((chunk, index) => `Kanıt [${index + 1}] (${chunk.title}): ${truncateText(chunk.text, 1600)}`)
    .join("\n\n");

  const systemPrompt = [
    "Sen kaynak dokümanlara dayalı bir bakım yönetimi uzmanısın.",
    "Ton: Skeptic Analyst. Net, teknik, doğrulanabilir ve spekülasyondan uzak yaz.",
    "İç muhakeme veya <think> bloğu yazma; yalnızca nihai cevabı ver.",
    "Yalnızca sana verilen kanıt parçalarına dayanarak Türkçe yanıt üret.",
    "Kanıtlar soruyu cevaplamak için yetersizse, doğrudan 'yetersiz_kanit' yaz.",
    "Gerektiğinde tam olarak şu biçimde diyagram etiketi bırak: [Diyagram Önerisi: kısa açıklama]"
  ].join("\n");

  const userPrompt =
    [
      `Kullanıcı sorusu: ${input.question}`,
      "",
      `Kanıt parçaları:\n${evidenceText || "Kanıt bulunamadı."}`,
      "",
      "Kullanıcı sorusuna en fazla 350 kelimelik, son derece kapsamlı, detaylı, teknik ve açıklayıcı bir Türkçe cevap üret. Cevabı yarıda kesme. Kaynak adı veya citation yazma."
    ].join("\n") + buildHistoryBlock(input.conversationHistory);

  return requestMiniMaxCompletion(systemPrompt, userPrompt);
}
