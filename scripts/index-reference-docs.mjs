import nextEnv from "@next/env";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases, ID, Query } from "node-appwrite";
import { EPub } from "epub2";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");
const docsDir = path.resolve(__dirname, "../public/reference-docs");

const requiredEnv = [
  "APPWRITE_ENDPOINT",
  "APPWRITE_PROJECT_ID",
  "APPWRITE_API_KEY",
  "APPWRITE_DATABASE_ID"
];

const missing = requiredEnv.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(`Missing env: ${missing.join(", ")}`);
  process.exit(1);
}

const collectionIds = {
  referenceDocuments:
    process.env.APPWRITE_REFERENCE_DOCUMENTS_COLLECTION_ID ?? "reference_documents",
  referenceChunks:
    process.env.APPWRITE_REFERENCE_CHUNKS_COLLECTION_ID ?? "reference_chunks"
};

const databaseId = process.env.APPWRITE_DATABASE_ID;
const chunkMaxChars = Number(process.env.REFERENCE_CHUNK_MAX_CHARS ?? 4200);
const chunkOverlapChars = Number(process.env.REFERENCE_CHUNK_OVERLAP_CHARS ?? 450);

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);

const domainSignals = [
  {
    domain: "analytics",
    keywords: ["oee", "mtbf", "mttr", "wrench", "kpi", "loss", "downtime", "stop"]
  },
  {
    domain: "planning",
    keywords: ["planning", "scheduling", "work order", "backlog", "schedule", "meeting"]
  },
  {
    domain: "field",
    keywords: ["autonomous", "inspection", "procedure", "pm", "tpm", "smed", "operator"]
  },
  {
    domain: "archive",
    keywords: ["equipment", "asset", "component", "record", "documentation", "history"]
  },
  {
    domain: "strategy",
    keywords: ["strategy", "maintenance", "reliability", "lean", "constraint", "leadership"]
  }
];

function extensionOf(filePath) {
  return path.extname(filePath).toLowerCase();
}

function sourceTypeFor(filePath) {
  const extension = extensionOf(filePath);
  if (extension === ".pdf") return "pdf";
  if (extension === ".epub") return "epub";
  return null;
}

function sanitizeDocumentId(filename) {
  const basename = path.basename(filename, path.extname(filename));
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

function normalizeWhitespace(text) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripHtml(html) {
  return normalizeWhitespace(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
  );
}

function inferDomain(text) {
  const lower = text.toLowerCase();
  let best = {
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

function extractKeywords(text) {
  const lower = text.toLowerCase();
  const keywords = new Set();

  for (const signal of domainSignals) {
    for (const keyword of signal.keywords) {
      if (lower.includes(keyword)) {
        keywords.add(keyword);
      }
    }
  }

  return Array.from(keywords).slice(0, 12);
}

function splitIntoChunks(text, maxChars = chunkMaxChars, overlap = chunkOverlapChars) {
  const normalized = normalizeWhitespace(text);
  const chunks = [];
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

async function sha256(filePath) {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function extractPdf(filePath) {
  const buffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: buffer });

  try {
    const data = await parser.getText();

    return [
      {
        locationLabel: "PDF metin çıkarımı",
        text: data.text
      }
    ];
  } finally {
    await parser.destroy();
  }
}

async function parseEpub(filePath) {
  return new Promise((resolve, reject) => {
    const epub = new EPub(filePath);

    epub.on("error", reject);
    epub.on("end", () => resolve(epub));
    epub.parse();
  });
}

async function extractEpub(filePath) {
  const epub = await parseEpub(filePath);
  const chapters = [];

  for (const item of epub.flow ?? []) {
    const chapterId = item.id;
    if (!chapterId) continue;

    try {
      const html = await epub.getChapterRawAsync(chapterId);
      const text = stripHtml(html);

      if (text.length > 120) {
        chapters.push({
          locationLabel: item.title ? `EPUB bölüm: ${item.title}` : `EPUB bölüm: ${chapterId}`,
          text
        });
      }
    } catch {
      // Some EPUB spine items can be non-text resources.
    }
  }

  return chapters;
}

async function findDocumentByChecksum(checksum) {
  const result = await databases.listDocuments({
    databaseId,
    collectionId: collectionIds.referenceDocuments,
    queries: [Query.equal("checksum", checksum), Query.limit(1)]
  });

  return result.documents[0] ?? null;
}

async function createDocumentRecord({ id, title, sourceType, checksum }) {
  await databases.createDocument({
    databaseId,
    collectionId: collectionIds.referenceDocuments,
    documentId: id,
    data: {
      id,
      title,
      sourceType,
      uploadedAt: new Date().toISOString(),
      checksum,
      tags: extractKeywords(title)
    }
  });
}

async function createChunkRecord({ documentId, title, locationLabel, text, index }) {
  const id = `${documentId}-${String(index + 1).padStart(4, "0")}`.slice(0, 64);
  const keywords = extractKeywords(text);

  await databases.createDocument({
    databaseId,
    collectionId: collectionIds.referenceChunks,
    documentId: ID.unique(),
    data: {
      id,
      documentId,
      title,
      locationLabel,
      domain: inferDomain(text),
      text,
      keywords
    }
  });
}

async function extractFile(filePath) {
  const sourceType = sourceTypeFor(filePath);

  if (sourceType === "pdf") {
    return extractPdf(filePath);
  }

  if (sourceType === "epub") {
    return extractEpub(filePath);
  }

  return [];
}

async function indexFile(filePath) {
  const sourceType = sourceTypeFor(filePath);
  const title = path.basename(filePath);

  if (!sourceType) {
    console.log(`skip unsupported: ${title}`);
    return;
  }

  const checksum = await sha256(filePath);
  const existing = await findDocumentByChecksum(checksum);

  if (existing) {
    console.log(`skip indexed: ${title}`);
    return;
  }

  const documentId = sanitizeDocumentId(title);
  const sections = await extractFile(filePath);
  const chunks = sections.flatMap((section) =>
    splitIntoChunks(section.text).map((text) => ({
      locationLabel: section.locationLabel,
      text
    }))
  );

  if (chunks.length === 0) {
    console.log(`skip no text: ${title}`);
    return;
  }

  await createDocumentRecord({
    id: documentId,
    title,
    sourceType,
    checksum
  });

  for (let index = 0; index < chunks.length; index += 1) {
    await createChunkRecord({
      documentId,
      title,
      locationLabel: chunks[index].locationLabel,
      text: chunks[index].text,
      index
    });
  }

  console.log(`indexed: ${title} (${chunks.length} chunks)`);
}

async function main() {
  const onlyPattern = process.argv[2]?.toLowerCase();
  const entries = await fs.readdir(docsDir);
  const files = entries
    .filter((entry) => !entry.startsWith(".") && entry !== "README.md")
    .filter((entry) => !onlyPattern || entry.toLowerCase().includes(onlyPattern))
    .map((entry) => path.join(docsDir, entry));

  if (files.length === 0) {
    console.log("No matching reference documents found.");
    return;
  }

  for (const filePath of files) {
    await indexFile(filePath);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
