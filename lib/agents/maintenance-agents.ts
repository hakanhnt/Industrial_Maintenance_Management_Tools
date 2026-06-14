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
  ConversationHistoryEntry,
  EvidenceStatus,
  MaintenanceDomain,
  ReferenceChunk,
  StreamEvent
} from "@/lib/models/maintenance";

const diagramPattern = /\[Diyagram Önerisi:\s*([^\]]+)\]/g;

function extractDiagramSuggestions(content: string) {
  return Array.from(content.matchAll(diagramPattern)).map((match) => match[1].trim());
}

function hasOnlyBootstrapEvidence(chunks: ReferenceChunk[]) {
  return chunks.every((chunk) => chunk.documentId === "project-brief");
}

function hasUsableEvidence(chunks: ReferenceChunk[]) {
  return chunks.length > 0 && !hasOnlyBootstrapEvidence(chunks);
}

function buildWebSummary(agent: AgentProfile, evidence: ReferenceChunk[]): string {
  const points = evidence
    .slice(0, 3)
    .map((chunk) => `${chunk.title}: ${truncateText(chunk.text, 240)}`)
    .join(" ");

  return [
    `${agent.code}: Kayıtlı bilgi tabanında bu soruyla doğrudan eşleşen kanıt bulunamadı,`,
    `bu nedenle web kaynaklarından derlenen bilgiler özetlendi.`,
    points,
    "[Diyagram Önerisi: Web kaynaklı kanıt değerlendirme akışı]"
  ].join(" ");
}

function buildLeadFallbackSummary(answeredTurns: AgentTurn[]): string {
  const points = answeredTurns
    .map((turn) => `${turn.agent.name}: ${truncateText(turn.content, 220)}`)
    .join(" ");

  return [
    "Aşağıda uzman ajanların ürettiği yanıtların birleştirilmiş özeti yer almaktadır.",
    points
  ].join(" ");
}

function fallbackTurn(
  agent: AgentProfile,
  question: string,
  evidence: ReferenceChunk[],
  previousTurns: AgentTurn[]
) {
  const status: EvidenceStatus =
    evidence.length === 0 || hasOnlyBootstrapEvidence(evidence)
      ? "insufficient_sources"
      : "grounded";

  if (status === "insufficient_sources") {
    const content = [
      `${agent.code}: Bu soru için kayıtlı bilgi tabanında yeterli kanıt bulunamadı.`,
      "Web arama yapılandırılmamışsa veya web kanıtı da yetersizse teknik yanıt üretmemeliyim.",
      "[Diyagram Önerisi: Yetersiz kanıt karar akışı]"
    ].join(" ");

    return content;
  }

  const priorLine =
    previousTurns.length > 0
      ? `Önceki ajanlardan gelen çıktı ${previousTurns.map((turn) => turn.agent.code).join(", ")} ile tutarlılık açısından kontrol edildi.`
      : "Bu ilk stratejik değerlendirme turudur.";

  return [
    `${agent.code}: Soru "${question}" için alanıma giren kanıtlar yeterli düzeyde bulundu.`,
    priorLine,
    `${agent.role} Bu rolde temel karar, kaynakta açıkça izlenebilen bilgiyle sınırlı tutulmalıdır.`,
    "[Diyagram Önerisi: Ajan kanıt değerlendirme ve karar kapısı]"
  ].join(" ");
}

function domainsForAgent(agent: AgentProfile): MaintenanceDomain[] {
  if (agent.code === "CORE") return ["strategy", "archive"];
  if (agent.code === "FIELD") return ["field", "strategy"];
  if (agent.code === "FLOW") return ["planning", "field"];
  if (agent.code === "BASE") return ["archive", "planning"];
  return ["analytics", "strategy"];
}

function normalize(value: string) {
  return value.toLocaleLowerCase("tr");
}

function agentShouldAnswer(
  agent: AgentProfile,
  question: string,
  evidence: ReferenceChunk[],
  forceSelectedScope = false
) {
  if (forceSelectedScope) {
    return true;
  }

  const normalizedQuestion = normalize(question);
  const directKeywordHit = agent.triggerKeywords.some((keyword) =>
    normalizedQuestion.includes(normalize(keyword))
  );

  if (directKeywordHit) {
    return true;
  }

  return evidence.some((chunk) => chunk.domain === agent.domain);
}

function isInsufficientContent(content: string | null) {
  if (!content) {
    return true;
  }

  const normalized = normalize(content);
  const insufficientPhrases = [
    "yeterli kanıt bulunamadı",
    "yeterli kanıt bulunmamaktadır",
    "yeterli veri yok",
    "yanıt üretmemeliyim",
    "kaynak yetersiz",
    "kanıt yetersiz",
    "bilmiyorum",
    "doğrudan ele almamakta",
    "doğrudan ele almıyor",
    "doğrudan kapsamıyor",
    "doğrudan atıfta bulunmuyor",
    "doğrudan bir atıf",
    "kanıt parçalarında",
    "kanıt parçaları yalnızca",
    "yorum yapamam",
    "herhangi bir bilgi sunmamaktadır",
    "genel bilgi olarak",
    "yetersiz_kanit",
    "yetersiz_kanıt",
    "yetersiz kanıt",
    "kapsamamaktadır",
    "sınırlıdır"
  ];

  return (
    content.trim().length < 120 ||
    insufficientPhrases.some((phrase) => normalized.includes(phrase)) ||
    (normalized.includes("kanıt parçaları") &&
      normalized.includes("doğrudan") &&
      (normalized.includes("bulunmuyor") || normalized.includes("atıfta")))
  );
}

async function generateAgentContent(
  agent: AgentProfile,
  question: string,
  previousTurns: AgentTurn[],
  evidence: ReferenceChunk[],
  history?: ConversationHistoryEntry[]
) {
  return generateMiniMaxAgentTurn({
    agent,
    question,
    previousTurns: previousTurns
      .filter((turn) => turn.content)
      .map((turn) => ({
        code: turn.agent.code,
        content: turn.content
      })),
    evidence,
    conversationHistory: history
  });
}

export async function* runMaintenanceAgentsStream(
  question: string,
  selectedAgents?: AgentCode[],
  history?: ConversationHistoryEntry[]
): AsyncGenerator<StreamEvent, void, unknown> {
  const normalizedQuestion = question.trim();
  const selectedAgentSet =
    selectedAgents && selectedAgents.length > 0 ? new Set(selectedAgents) : null;
  const activeProfiles = selectedAgentSet
    ? agentProfiles.filter((agent) => selectedAgentSet.has(agent.code))
    : agentProfiles;
  const forceSelectedScope =
    selectedAgentSet !== null && selectedAgentSet.size < agentProfiles.length;

  const turns: AgentTurn[] = [];
  const corpusChunks = await listReferenceChunks();

  for (const agent of activeProfiles) {
    yield { type: "agent_start", agent: agent.code };

    let evidence = retrieveChunks(
      corpusChunks,
      normalizedQuestion,
      domainsForAgent(agent),
      3
    );
    let content: string | null = null;
    let usedWebFallback = false;

    if (!agentShouldAnswer(agent, normalizedQuestion, evidence, forceSelectedScope)) {
      const turn: AgentTurn = {
        agent,
        content: "",
        evidence: [],
        diagramSuggestions: [],
        status: "skipped",
        skippedReason: "Soru bu ajanın karar alanına yeterince temas etmiyor."
      };
      turns.push(turn);
      yield { type: "agent_turn", turn };
      continue;
    }

    if (!hasUsableEvidence(evidence)) {
      const webEvidence = await searchWebEvidence(
        normalizedQuestion,
        agent.domain,
        3
      );

      if (webEvidence.length > 0) {
        evidence = webEvidence;
        usedWebFallback = true;
      }
    }

    if (hasUsableEvidence(evidence)) {
      try {
        content = await generateAgentContent(agent, normalizedQuestion, turns, evidence, history);
      } catch {
        content = null;
      }
    }

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
            webEvidence,
            history
          );
          content = isInsufficientContent(webContent) ? null : webContent;
        } catch {
          content = null;
        }
      }
    }

    if (isInsufficientContent(content)) {
      if (usedWebFallback && evidence.length > 0) {
        content = buildWebSummary(agent, evidence);
      } else {
        content = null;
        evidence = [];
      }
    }

    const finalContent = content ?? fallbackTurn(agent, normalizedQuestion, evidence, turns);
    const status: EvidenceStatus =
      usedWebFallback && content
        ? "web_fallback"
        : evidence.length === 0 || hasOnlyBootstrapEvidence(evidence)
        ? "insufficient_sources"
        : "grounded";

    const turn: AgentTurn = {
      agent,
      content: finalContent,
      evidence,
      diagramSuggestions: extractDiagramSuggestions(finalContent),
      status
    };
    turns.push(turn);
    yield { type: "agent_turn", turn };
  }

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
        })),
        conversationHistory: history
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
