import type { MaintenanceDomain, ReferenceChunk } from "@/lib/models/maintenance";

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
}

interface TavilyResponse {
  results?: TavilyResult[];
}

function getWebSearchConfig() {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    endpoint: process.env.TAVILY_API_URL ?? "https://api.tavily.com/search"
  };
}

function trimContent(value: string, maxLength = 1400) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength).trim()}...`;
}

function domainKeywords(domain: MaintenanceDomain) {
  if (domain === "analytics") return ["OEE", "MTBF", "MTTR", "wrench time", "maintenance KPI"];
  if (domain === "planning") return ["maintenance planning", "work order", "scheduling", "backlog"];
  if (domain === "field") return ["preventive maintenance", "predictive maintenance", "autonomous maintenance"];
  if (domain === "archive") return ["equipment hierarchy", "asset register", "maintenance documentation"];
  return ["maintenance strategy", "RCM", "BCM", "reliability centered maintenance"];
}

export async function searchWebEvidence(
  question: string,
  domain: MaintenanceDomain,
  limit = 3
): Promise<ReferenceChunk[]> {
  const config = getWebSearchConfig();

  if (!config) {
    return [];
  }

  const query = [
    question,
    "industrial maintenance reliability data asset management",
    domainKeywords(domain).join(" ")
  ].join(" ");

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: limit,
      include_answer: false,
      include_raw_content: false,
      topic: "general"
    })
  });

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as TavilyResponse;

  return (data.results ?? [])
    .filter((result) => result.content && result.url)
    .slice(0, limit)
    .map((result, index) => ({
      id: `web-${domain}-${index + 1}`,
      documentId: "web-fallback",
      title: result.title ?? "Web arama sonucu",
      locationLabel: result.url ?? "Web",
      domain,
      text: trimContent(result.content ?? ""),
      keywords: domainKeywords(domain)
    }));
}
