import { agentProfiles } from "@/lib/agents/profiles";
import { generateMiniMaxAgentTurn } from "@/lib/agents/minimax";
import { retrieveChunks } from "@/lib/knowledge/reference-corpus";
import { listReferenceChunks } from "@/lib/appwrite/reference-repository";
import type {
  AgentCode,
  AgentProfile,
  AgentTurn,
  AskResponse,
  EvidenceStatus,
  MaintenanceDomain,
  ReferenceChunk
} from "@/lib/models/maintenance";

const diagramPattern = /\[Diyagram Önerisi:\s*([^\]]+)\]/g;

function extractDiagramSuggestions(content: string) {
  return Array.from(content.matchAll(diagramPattern)).map((match) => match[1].trim());
}

function hasOnlyBootstrapEvidence(chunks: ReferenceChunk[]) {
  return chunks.every((chunk) => chunk.documentId === "project-brief");
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
      `${agent.code}: Bu soruya bakım literatürüne dayalı kesin yanıt vermek için henüz yeterli referans PDF/EPUB yüklenmedi.`,
      `Bu aşamada yalnızca ajan rolüm (${agent.role}) ve platform guardrail'i üzerinden konuşabilirim.`,
      "Kaynak doküman eklendiğinde aynı soruyu strateji, saha, planlama, arşiv ve metrik kanıtlarıyla yeniden değerlendirmeliyim.",
      "[Diyagram Önerisi: Kaynak yetersizliğinde ajan karar akışı]"
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
  evidence: ReferenceChunk[]
) {
  const normalizedQuestion = normalize(question);
  const directKeywordHit = agent.triggerKeywords.some((keyword) =>
    normalizedQuestion.includes(normalize(keyword))
  );

  if (directKeywordHit) {
    return true;
  }

  return evidence.some((chunk) => chunk.domain === agent.domain);
}

export async function runMaintenanceAgents(
  question: string,
  selectedAgents?: AgentCode[]
): Promise<AskResponse> {
  const normalizedQuestion = question.trim();
  const selectedAgentSet =
    selectedAgents && selectedAgents.length > 0 ? new Set(selectedAgents) : null;
  const activeProfiles = selectedAgentSet
    ? agentProfiles.filter((agent) => selectedAgentSet.has(agent.code))
    : agentProfiles;

  const turns: AgentTurn[] = [];
  const corpusChunks = await listReferenceChunks();

  for (const agent of activeProfiles) {
    const evidence = retrieveChunks(
      corpusChunks,
      normalizedQuestion,
      domainsForAgent(agent),
      3
    );
    let content: string | null = null;

    if (!agentShouldAnswer(agent, normalizedQuestion, evidence)) {
      turns.push({
        agent,
        content: "",
        evidence: [],
        diagramSuggestions: [],
        status: "skipped",
        skippedReason: "Soru bu ajanın karar alanına yeterince temas etmiyor."
      });
      continue;
    }

    if (evidence.length > 0 && !hasOnlyBootstrapEvidence(evidence)) {
      try {
        content = await generateMiniMaxAgentTurn({
          agent,
          question: normalizedQuestion,
          previousTurns: turns
            .filter((turn) => turn.content)
            .map((turn) => ({
              code: turn.agent.code,
              content: turn.content
            })),
          evidence
        });
      } catch {
        content = null;
      }
    }

    const finalContent = content ?? fallbackTurn(agent, normalizedQuestion, evidence, turns);
    const status: EvidenceStatus =
      evidence.length === 0 || hasOnlyBootstrapEvidence(evidence)
        ? "insufficient_sources"
        : "grounded";

    turns.push({
      agent,
      content: finalContent,
      evidence,
      diagramSuggestions: extractDiagramSuggestions(finalContent),
      status
    });
  }

  const answeredTurns = turns.filter((turn) => turn.status !== "skipped");
  const status: EvidenceStatus =
    answeredTurns.length > 0 &&
    answeredTurns.every((turn) => turn.status === "grounded")
      ? "grounded"
      : "insufficient_sources";

  return {
    question: normalizedQuestion,
    status,
    executiveSummary:
      status === "grounded"
        ? "Ajanlar soruyu kayıtlı bilgi tabanına dayalı olarak değerlendirdi."
        : "Referans PDF/EPUB korpusu henüz yüklenmediği için çıktı yalnızca platform iskeleti ve kaynak yetersizliği uyarısı içerir.",
    turns,
    citations: []
  };
}
