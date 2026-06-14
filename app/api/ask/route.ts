import { runMaintenanceAgentsStream } from "@/lib/agents/maintenance-agents";
import type { AgentCode, AskRequest } from "@/lib/models/maintenance";

const agentCodes = new Set<AgentCode>(["CORE", "FIELD", "FLOW", "BASE", "KPI"]);

export async function POST(request: Request) {
  let body: AskRequest;

  try {
    body = (await request.json()) as AskRequest;
  } catch {
    return Response.json({ error: "Geçersiz JSON gövdesi." }, { status: 400 });
  }

  const question = body.question?.trim();

  if (!question) {
    return Response.json({ error: "Soru alanı zorunludur." }, { status: 400 });
  }

  if (question.length > 3000) {
    return Response.json(
      { error: "Soru 3000 karakterden kısa olmalıdır." },
      { status: 400 }
    );
  }

  const selectedAgents = Array.isArray(body.selectedAgents)
    ? body.selectedAgents.filter((agent): agent is AgentCode => agentCodes.has(agent))
    : undefined;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of runMaintenanceAgentsStream(question, selectedAgents)) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Bilinmeyen hata.";
        controller.enqueue(
          encoder.encode(`${JSON.stringify({ type: "error", message })}\n`)
        );
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache"
    }
  });
}
