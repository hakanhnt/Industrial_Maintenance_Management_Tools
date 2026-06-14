export type AgentCode = "CORE" | "FIELD" | "FLOW" | "BASE" | "KPI" | "LEAD";

export type SourceType = "pdf" | "epub" | "manual" | "brief" | "web";

export type MaintenanceDomain =
  | "strategy"
  | "field"
  | "planning"
  | "archive"
  | "analytics";

export type EvidenceStatus =
  | "grounded"
  | "web_fallback"
  | "insufficient_sources"
  | "skipped";

export interface ReferenceDocument {
  id: string;
  title: string;
  sourceType: SourceType;
  version?: string;
  uploadedAt: string;
  checksum?: string;
  tags: string[];
}

export interface ReferenceChunk {
  id: string;
  documentId: string;
  title: string;
  page?: number;
  locationLabel: string;
  domain: MaintenanceDomain;
  text: string;
  keywords: string[];
}

export interface EquipmentNode {
  id: string;
  parentId?: string;
  code: string;
  name: string;
  level:
    | "site"
    | "plant"
    | "line"
    | "asset"
    | "subsystem"
    | "component"
    | "minifile";
  criticality: "A" | "B" | "C";
  documentationRefs: string[];
}

export interface WorkOrderTemplate {
  id: string;
  title: string;
  strategy: "preventive" | "predictive" | "autonomous" | "corrective";
  assetLevel: EquipmentNode["level"];
  trigger: string;
  plannedDurationMinutes: number;
  requiredRoles: string[];
  safetyNotes: string[];
  evidenceChunkIds: string[];
}

export interface KpiDefinition {
  id: string;
  code: "OEE" | "MTBF" | "MTTR" | "WRENCH_TIME";
  name: string;
  formula: string;
  interpretation: string;
  evidenceChunkIds: string[];
}

export interface AgentProfile {
  code: AgentCode;
  name: string;
  domain: MaintenanceDomain;
  role: string;
  guardrail: string;
  triggerKeywords: string[];
}

export interface AgentTurn {
  agent: AgentProfile;
  content: string;
  evidence: ReferenceChunk[];
  diagramSuggestions: string[];
  status: EvidenceStatus;
  skippedReason?: string;
}

export interface ConversationHistoryEntry {
  question: string;
  leadAnswer: string;
}

export interface AskRequest {
  question: string;
  mode?: "training" | "decision_support";
  selectedAgents?: AgentCode[];
  history?: ConversationHistoryEntry[];
}

export interface AskResponse {
  question: string;
  status: EvidenceStatus;
  executiveSummary: string;
  turns: AgentTurn[];
  citations: Array<{
    id: string;
    title: string;
    locationLabel: string;
  }>;
}

export type StreamEvent =
  | { type: "agent_start"; agent: AgentCode }
  | { type: "agent_turn"; turn: AgentTurn }
  | {
      type: "final";
      status: EvidenceStatus;
      executiveSummary: string;
      citations: AskResponse["citations"];
    }
  | { type: "error"; message: string };
