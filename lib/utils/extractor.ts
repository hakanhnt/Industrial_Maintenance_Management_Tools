import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { EPub } from "epub2";

const require = createRequire(import.meta.url);

if (typeof globalThis.DOMMatrix === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).DOMMatrix = class DOMMatrix {};
}

const { PDFParse } = require("pdf-parse");

function cleanText(text: string): string {
  if (!text) return "";
  let cleaned = text;

  // Clean carriage returns
  cleaned = cleaned.replace(/\r/g, "\n");

  // Replace multiple spaces and horizontal tabs, keeping newlines
  cleaned = cleaned.replace(/[ \t]+/g, " ");

  // Remove page markers like "Page X of Y" or "Sayfa X"
  cleaned = cleaned.replace(/(?:Page|Sayfa)\s*\d+\s*(?:of\s*\d+)?/gi, "");

  // Remove standalone digit fraction page indicators like "1 / 5"
  cleaned = cleaned.replace(/\d+\s*\/\s*\d+/g, "");

  // Remove standalone page numbers on a line
  cleaned = cleaned.replace(/(?:^|\n)\s*\d+\s*(?:\n|$)/g, "\n");

  // Remove soft hyphens at line endings (e.g., "oto-\nnom" -> "otonom")
  cleaned = cleaned.replace(/-\s*\n\s*/g, "");

  // Remove 3 or more consecutive newlines
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  return cleaned.trim();
}

async function extractPdf(filePath: string): Promise<{ text: string; locationLabel: string }[]> {
  const buffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: buffer });

  try {
    const data = await parser.getText();
    return [
      {
        locationLabel: "PDF Metin İçeriği",
        text: cleanText(data.text)
      }
    ];
  } finally {
    try {
      await parser.destroy();
    } catch {
      // Ignore destroy errors
    }
  }
}

async function parseEpub(filePath: string): Promise<EPub> {
  return new Promise((resolve, reject) => {
    const epub = new EPub(filePath);
    epub.on("error", reject);
    epub.on("end", () => resolve(epub));
    epub.parse();
  });
}

async function extractEpub(filePath: string): Promise<{ text: string; locationLabel: string }[]> {
  const epub = await parseEpub(filePath);
  const chapters: { text: string; locationLabel: string }[] = [];

  // Flow is not typed correctly in all versions, cast to any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flow = (epub as any).flow ?? [];

  for (const item of flow) {
    const chapterId = item.id;
    if (!chapterId) continue;

    try {
      const html = await epub.getChapterRawAsync(chapterId);
      // Strip HTML tags
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");

      const cleaned = cleanText(text);

      if (cleaned.length > 50) {
        chapters.push({
          locationLabel: item.title ? `EPUB Bölüm: ${item.title}` : `EPUB Bölüm: ${chapterId}`,
          text: cleaned
        });
      }
    } catch {
      // Ignore media/non-text items
    }
  }

  return chapters;
}

export async function extractTextFromFile(
  filePath: string
): Promise<{ text: string; locationLabel: string }[]> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".pdf") {
    return extractPdf(filePath);
  }

  if (ext === ".epub") {
    return extractEpub(filePath);
  }

  if (ext === ".txt" || ext === ".md") {
    const content = await fs.readFile(filePath, "utf-8");
    return [
      {
        locationLabel: ext === ".md" ? "Markdown Belgesi" : "Metin Belgesi",
        text: cleanText(content)
      }
    ];
  }

  throw new Error(`Desteklenmeyen dosya formatı: ${ext}`);
}
