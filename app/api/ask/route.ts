import { NextResponse } from "next/server";
import { runMaintenanceAgents } from "@/lib/agents/maintenance-agents";
import type { AgentCode, AskRequest } from "@/lib/models/maintenance";

const agentCodes = new Set<AgentCode>(["CORE", "FIELD", "FLOW", "BASE", "KPI"]);

export async function POST(request: Request) {
  let body: AskRequest;

  try {
    body = (await request.json()) as AskRequest;
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON gövdesi." }, { status: 400 });
  }

  const question = body.question?.trim();

  if (!question) {
    return NextResponse.json({ error: "Soru alanı zorunludur." }, { status: 400 });
  }

  if (question.length > 3000) {
    return NextResponse.json(
      { error: "Soru 3000 karakterden kısa olmalıdır." },
      { status: 400 }
    );
  }

  const selectedAgents = Array.isArray(body.selectedAgents)
    ? body.selectedAgents.filter((agent): agent is AgentCode => agentCodes.has(agent))
    : undefined;

  const response = await runMaintenanceAgents(question, selectedAgents);

  return NextResponse.json(response);
}
