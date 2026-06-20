import { Pinecone } from "@pinecone-database/pinecone";
import type { ReferenceChunk, MaintenanceDomain } from "@/lib/models/maintenance";

let pineconeClient: Pinecone | null = null;

export function getPineconeClient(): Pinecone | null {
  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey) {
    console.warn("PINECONE_API_KEY is not defined.");
    return null;
  }

  if (!pineconeClient) {
    pineconeClient = new Pinecone({ apiKey });
  }

  return pineconeClient;
}

export async function ensurePineconeIndex(dimension: number, customIndexName?: string): Promise<string | null> {
  const pc = getPineconeClient();
  if (!pc) return null;

  const indexName = customIndexName ?? process.env.PINECONE_INDEX_NAME ?? "bakim-rehber";

  try {
    const listResponse = await pc.listIndexes();
    const indexExists = listResponse.indexes?.some((idx) => idx.name === indexName);

    if (!indexExists) {
      console.log(`Creating Pinecone index "${indexName}" with dimension ${dimension}...`);
      await pc.createIndex({
        name: indexName,
        dimension,
        metric: "cosine",
        spec: {
          serverless: {
            cloud: "aws",
            region: "us-east-1"
          }
        }
      });

      // Wait for index to be ready (max 2 minutes)
      const deadline = Date.now() + 120_000;
      while (true) {
        if (Date.now() > deadline) {
          throw new Error(`Pinecone index "${indexName}" 2 dakika içinde hazır olmadı.`);
        }
        const desc = await pc.describeIndex(indexName);
        if (desc.status?.ready) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      console.log(`Pinecone index "${indexName}" is ready.`);
    }

    return indexName;
  } catch (error) {
    console.error("Error ensuring Pinecone index:", error);
    return null;
  }
}

export async function upsertDocumentChunks(
  chunks: ReferenceChunk[],
  vectors: number[][],
  customIndexName?: string
): Promise<boolean> {
  const pc = getPineconeClient();
  if (!pc || chunks.length === 0 || vectors.length === 0) return false;

  const indexName = customIndexName ?? process.env.PINECONE_INDEX_NAME ?? "bakim-rehber";
  const index = pc.Index(indexName);

  const records = chunks.map((chunk, i) => {
    return {
      id: chunk.id,
      values: vectors[i],
      metadata: {
        documentId: chunk.documentId,
        title: chunk.title,
        locationLabel: chunk.locationLabel || "",
        domain: chunk.domain,
        text: chunk.text,
        ...(chunk.keywords.length > 0 ? { keywords: chunk.keywords } : {})
      }
    };
  });

  try {
    const batchSize = 100;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      await index.upsert({ records: batch });
    }
    return true;
  } catch (error) {
    console.error("Error upserting to Pinecone:", error);
    return false;
  }
}

export async function queryDocumentChunks(
  vector: number[],
  domains: MaintenanceDomain[],
  limit = 3,
  customIndexName?: string
): Promise<ReferenceChunk[]> {
  const pc = getPineconeClient();
  if (!pc) return [];

  const indexName = customIndexName ?? process.env.PINECONE_INDEX_NAME ?? "bakim-rehber";
  const index = pc.Index(indexName);

  try {
    // Build metadata filter for domains
    const filter = domains.length > 0 ? { domain: { $in: domains } } : undefined;

    const queryResponse = await index.query({
      vector,
      topK: limit,
      includeMetadata: true,
      filter
    });

    const chunks: ReferenceChunk[] = [];
    if (queryResponse.matches) {
      for (const match of queryResponse.matches) {
        if (match.metadata) {
          const meta = match.metadata as {
            documentId?: string;
            title?: string;
            locationLabel?: string;
            domain?: MaintenanceDomain;
            text?: string;
            keywords?: string[];
          };
          chunks.push({
            id: match.id,
            documentId: meta.documentId ?? "",
            title: meta.title ?? "",
            locationLabel: meta.locationLabel ?? "",
            domain: meta.domain ?? "strategy",
            text: meta.text ?? "",
            keywords: Array.isArray(meta.keywords) ? meta.keywords : []
          });
        }
      }
    }

    return chunks;
  } catch (error) {
    console.error("Error querying Pinecone:", error);
    return [];
  }
}
