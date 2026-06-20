import { getPineconeClient } from "@/lib/pinecone/client";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const indexName = searchParams.get("indexName") || "bakim-rehber";

  const pc = getPineconeClient();
  if (!pc) {
    return Response.json({ error: "Pinecone bağlantısı kurulamadı." }, { status: 500 });
  }

  try {
    const index = pc.Index(indexName);

    // Collect all vector IDs via pagination
    const allIds: string[] = [];
    let paginationToken: string | undefined = undefined;

    do {
      const page = await index.listPaginated(paginationToken ? { limit: 100, paginationToken } : { limit: 100 });
      const ids = (page.vectors ?? []).flatMap((v) => (v.id ? [v.id] : []));
      allIds.push(...ids);
      paginationToken = page.pagination?.next;
    } while (paginationToken);

    if (allIds.length === 0) {
      return Response.json({ documents: [], totalChunks: 0 });
    }

    // Fetch metadata for first chunk of each unique document
    // Group IDs by document prefix (format: <docId>-NNNN)
    const docFirstChunk = new Map<string, string>();
    for (const id of allIds) {
      const match = id.match(/^(.+)-(\d{4})$/);
      if (match) {
        const docId = match[1];
        const chunkNum = parseInt(match[2], 10);
        const existing = docFirstChunk.get(docId);
        if (!existing) {
          docFirstChunk.set(docId, id);
        } else {
          const existingNum = parseInt(existing.match(/(\d{4})$/)![1], 10);
          if (chunkNum < existingNum) {
            docFirstChunk.set(docId, id);
          }
        }
      } else {
        // Non-standard ID — include as-is
        if (!docFirstChunk.has(id)) docFirstChunk.set(id, id);
      }
    }

    // Batch fetch metadata for one representative chunk per document
    const representativeIds = Array.from(docFirstChunk.values());
    const BATCH = 100;
    const fetchedMetadata: Record<string, { title: string; domain: string; documentId: string }> = {};

    for (let i = 0; i < representativeIds.length; i += BATCH) {
      const batch = representativeIds.slice(i, i + BATCH);
      const result = await index.fetch({ ids: batch });
      for (const [, record] of Object.entries(result.records ?? {})) {
        const meta = record.metadata as { title?: string; domain?: string; documentId?: string } | undefined;
        const docId = meta?.documentId ?? record.id;
        fetchedMetadata[docId] = {
          title: meta?.title ?? record.id,
          domain: meta?.domain ?? "unknown",
          documentId: docId,
        };
      }
    }

    // Count chunks per document
    const chunkCounts: Record<string, number> = {};
    for (const id of allIds) {
      const match = id.match(/^(.+)-\d{4}$/);
      const docId = match ? match[1] : id;
      chunkCounts[docId] = (chunkCounts[docId] ?? 0) + 1;
    }

    const documents = Object.entries(fetchedMetadata).map(([docId, meta]) => ({
      documentId: docId,
      title: meta.title,
      domain: meta.domain,
      chunkCount: chunkCounts[docId] ?? 0,
    }));

    documents.sort((a, b) => a.title.localeCompare(b.title, "tr"));

    return Response.json({
      documents,
      totalChunks: allIds.length,
      indexName,
    });
  } catch (error) {
    console.error("Error listing Pinecone documents:", error);
    const message = error instanceof Error ? error.message : "Bilinmeyen hata.";
    return Response.json({ error: `Döküman listesi alınamadı: ${message}` }, { status: 500 });
  }
}
