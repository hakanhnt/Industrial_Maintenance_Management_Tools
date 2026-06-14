import type { AgentProfile, ReferenceChunk } from "@/lib/models/maintenance";

interface GenerateAgentTurnInput {
  agent: AgentProfile;
  question: string;
  previousTurns: Array<{ code: string; content: string }>;
  evidence: ReferenceChunk[];
}

interface MiniMaxChoice {
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

  return cleaned || null;
}

export async function generateMiniMaxAgentTurn(input: GenerateAgentTurnInput) {
  const config = getMiniMaxConfig();

  if (!config) {
    return null;
  }

  const evidenceText = input.evidence
    .map(
      (chunk) =>
        `- [${chunk.id}] ${chunk.title} (${chunk.locationLabel}): ${chunk.text}`
    )
    .join("\n");

  const previousText = input.previousTurns
    .map((turn) => `${turn.code}: ${turn.content}`)
    .join("\n");

  const systemPrompt = [
    "Sen kaynak dokümanlara dayalı bir bakım yönetimi eğitim ajanısın.",
    "Ton: Skeptic Analyst. Net, teknik, doğrulanabilir ve spekülasyondan uzak yaz.",
    "İç muhakeme, chain-of-thought veya <think> bloğu yazma; yalnızca nihai cevabı ver.",
    "Kaynak adı, kaynak ID'si, sayfa bilgisi veya parantez içinde citation yazma.",
    "Kaynaklarda olmayan teknik iddiaları üretme. Kaynak yetersizse açıkça belirt.",
    "Gerektiğinde tam olarak şu biçimde diyagram etiketi bırak: [Diyagram Önerisi: kısa açıklama]"
  ].join("\n");

  const userPrompt = [
    `Kod adın: ${input.agent.code}. Rolün: ${input.agent.role}`,
    `Guardrail: ${input.agent.guardrail}`,
    "",
    `Kullanıcı sorusu: ${input.question}`,
    "",
    `Önceki ajan konuşmaları:\n${previousText || "Yok"}`,
    "",
    `Kanıt parçaları:\n${evidenceText || "Kanıt bulunamadı."}`,
    "",
    "Yanıtını 2-4 tam cümleyle Türkçe ver. Cevabı yarıda kesme. Kaynak adı, kaynak id'si veya citation yazma."
  ].join("\n");

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userPrompt
        }
      ],
      temperature: 0.2,
      top_p: 0.8,
      max_tokens: 900
    })
  });

  if (!response.ok) {
    throw new Error(`MiniMax request failed: ${response.status}`);
  }

  const data = (await response.json()) as MiniMaxResponse;
  return extractMiniMaxText(data);
}
