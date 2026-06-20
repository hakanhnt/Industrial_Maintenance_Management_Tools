import "@/lib/polyfill";
import { runMaintenanceAgentsStream } from "@/lib/agents/maintenance-agents";
import type { ConversationHistoryEntry, AgentCode } from "@/lib/models/maintenance";

function parseHistory(value: unknown): ConversationHistoryEntry[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const entries = value.filter((item): item is ConversationHistoryEntry => {
    if (typeof item !== "object" || item === null) {
      return false;
    }

    const candidate = item as Record<string, unknown>;
    return typeof candidate.question === "string" && typeof candidate.leadAnswer === "string";
  });

  return entries.length > 0 ? entries : undefined;
}

export async function POST(request: Request) {
  let body: {
    question?: string;
    model?: string;
    indexName?: string;
    history?: unknown;
    selectedAgents?: AgentCode[];
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Geçersiz JSON gövdesi." }, { status: 400 });
  }

  const question = body.question?.trim();
  const model = body.model || process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text";
  const indexName = body.indexName || "bakim-rehber";
  const VALID_AGENT_CODES = new Set<AgentCode>(["CORE", "FIELD", "FLOW", "BASE", "KPI"]);
  const selectedAgents = body.selectedAgents?.filter((a) => VALID_AGENT_CODES.has(a));

  if (!question) {
    return Response.json({ error: "Soru alanı zorunludur." }, { status: 400 });
  }

  if (question.length > 3000) {
    return Response.json(
      { error: "Soru 3000 karakterden kısa olmalıdır." },
      { status: 400 }
    );
  }

  const history = parseHistory(body.history);
  const encoder = new TextEncoder();

  const eventStream = runMaintenanceAgentsStream(
    question,
    selectedAgents,
    history,
    model,
    indexName
  );

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of eventStream) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      } catch (error) {
        console.error("Error in runMaintenanceAgentsStream execution:", error);
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
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  });
}
