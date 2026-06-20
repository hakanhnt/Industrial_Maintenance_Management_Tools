import "@/lib/polyfill";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { extractTextFromFile } from "@/lib/utils/extractor";
import { generateOllamaEmbeddings } from "@/lib/agents/ollama";
import { ensurePineconeIndex, upsertDocumentChunks } from "@/lib/pinecone/client";
import type { ReferenceChunk } from "@/lib/models/maintenance";

const domainSignals = [
  {
    domain: "analytics" as const,
    keywords: ["oee", "mtbf", "mttr", "wrench", "kpi", "loss", "downtime", "stop"]
  },
  {
    domain: "planning" as const,
    keywords: ["planning", "scheduling", "work order", "backlog", "schedule", "meeting"]
  },
  {
    domain: "field" as const,
    keywords: ["autonomous", "inspection", "procedure", "pm", "tpm", "smed", "operator"]
  },
  {
    domain: "archive" as const,
    keywords: ["equipment", "asset", "component", "record", "documentation", "history"]
  },
  {
    domain: "strategy" as const,
    keywords: ["strategy", "maintenance", "reliability", "lean", "constraint", "leadership"]
  }
];

function inferDomain(text: string): "strategy" | "field" | "planning" | "archive" | "analytics" {
  const lower = text.toLowerCase();
  let best: {
    domain: "strategy" | "field" | "planning" | "archive" | "analytics";
    score: number;
  } = {
    domain: "strategy",
    score: 0
  };

  for (const signal of domainSignals) {
    const score = signal.keywords.reduce(
      (total, keyword) => total + (lower.includes(keyword) ? 1 : 0),
      0
    );

    if (score > best.score) {
      best = {
        domain: signal.domain,
        score
      };
    }
  }

  return best.domain;
}

function extractKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  const keywords = new Set<string>();

  for (const signal of domainSignals) {
    for (const keyword of signal.keywords) {
      if (lower.includes(keyword)) {
        keywords.add(keyword);
      }
    }
  }

  return Array.from(keywords).slice(0, 12);
}

function sanitizeDocumentId(filename: string): string {
  const ext = path.extname(filename);
  const basename = path.basename(filename, ext);
  const slug = basename
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 26);

  const hash = crypto.createHash("sha1").update(filename).digest("hex").slice(0, 8);
  return `${slug || "doc"}-${hash}`.slice(0, 36);
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitIntoChunks(text: string, maxChars = 750, overlap = 75): string[] {
  const normalized = normalizeWhitespace(text);
  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < normalized.length) {
    const hardEnd = Math.min(cursor + maxChars, normalized.length);
    const softEnd = normalized.lastIndexOf("\n\n", hardEnd);
    const end = softEnd > cursor + maxChars * 0.55 ? softEnd : hardEnd;
    const chunk = normalized.slice(cursor, end).trim();

    if (chunk.length > 120) {
      chunks.push(chunk);
    }

    if (end >= normalized.length) break;
    cursor = Math.max(0, end - overlap);
  }

  return chunks;
}

export async function POST(request: Request) {
  let tempPath: string | null = null;
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const model = (formData.get("model") as string) || "nomic-embed-text";
    const chunkSize = Number(formData.get("chunkSize") || "750");
    const chunkOverlap = Number(formData.get("chunkOverlap") || "75");
    const indexName = (formData.get("indexName") as string) || "bakim-rehber";

    if (!file) {
      return Response.json({ error: "Lütfen bir dosya yükleyin." }, { status: 400 });
    }

    // 1. Save uploaded file to temp directory
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const tempDir = path.join(os.tmpdir(), "bakim-rehber-uploads");
    await fs.mkdir(tempDir, { recursive: true });
    
    const fileExt = path.extname(file.name);
    tempPath = path.join(tempDir, `${crypto.randomUUID()}${fileExt}`);
    await fs.writeFile(tempPath, buffer);

    // 2. Extract text sections
    console.log(`Extracting text from: ${file.name}`);
    const sections = await extractTextFromFile(tempPath);

    // 3. Chunk text sections
    console.log(`Splitting text into chunks (size: ${chunkSize}, overlap: ${chunkOverlap})...`);
    const chunks: ReferenceChunk[] = [];
    const documentId = sanitizeDocumentId(file.name);

    for (const section of sections) {
      const splitTexts = splitIntoChunks(section.text, chunkSize, chunkOverlap);
      for (let idx = 0; idx < splitTexts.length; idx++) {
        const text = splitTexts[idx];
        chunks.push({
          id: `${documentId}-${String(idx + 1).padStart(4, "0")}`,
          documentId,
          title: file.name,
          locationLabel: section.locationLabel,
          domain: inferDomain(text),
          text,
          keywords: extractKeywords(text)
        });
      }
    }

    if (chunks.length === 0) {
      return Response.json(
        { error: "Dosyadan okunabilir metin çıkarılamadı." },
        { status: 400 }
      );
    }

    // 4. Generate embeddings using Ollama in batches
    console.log(`Generating embeddings using Ollama model "${model}" for ${chunks.length} chunks...`);
    const batchSize = 30;
    const vectors: number[][] = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batchChunks = chunks.slice(i, i + batchSize);
      const batchTexts = batchChunks.map((c) => c.text);
      const batchVectors = await generateOllamaEmbeddings(batchTexts, model);
      vectors.push(...batchVectors);
    }

    if (vectors.length === 0) {
      return Response.json(
        { error: `Embedding oluşturulamadı. Ollama modelini kontrol edin: "${model}"` },
        { status: 500 }
      );
    }

    if (vectors.length !== chunks.length) {
      return Response.json(
        { error: `Embedding sayısı uyuşmuyor: ${vectors.length} vektör, ${chunks.length} parça. Lütfen tekrar deneyin.` },
        { status: 500 }
      );
    }

    // 5. Ensure Pinecone index is ready with vector dimensions
    const dimension = vectors[0].length;
    console.log(`Ensuring Pinecone index "${indexName}" is ready (dimension: ${dimension})...`);
    const actualIndexName = await ensurePineconeIndex(dimension, indexName);

    if (!actualIndexName) {
      throw new Error("Pinecone indeksi hazırlanırken hata oluştu.");
    }

    // 6. Upsert vectors to Pinecone
    console.log(`Upserting ${vectors.length} vectors to Pinecone...`);
    const success = await upsertDocumentChunks(chunks, vectors, actualIndexName);

    if (!success) {
      throw new Error("Vektörler Pinecone'a yüklenemedi.");
    }

    return Response.json({
      success: true,
      message: `"${file.name}" dökümanı başarıyla parçalandı (${chunks.length} parça), vektörleştirildi ve Pinecone index'ine (${actualIndexName}) yüklendi.`,
      chunksCount: chunks.length,
      dimension,
      indexName: actualIndexName
    });

  } catch (error) {
    console.error("Error uploading file and vectorizing:", error);
    const message = error instanceof Error ? error.message : "Bilinmeyen hata.";
    return Response.json({ error: `Yükleme ve vektörleştirme başarısız: ${message}` }, { status: 500 });
  } finally {
    // Clean up temp file
    if (tempPath) {
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore unlink error
      }
    }
  }
}
