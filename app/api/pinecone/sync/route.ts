import { Query, Models } from "node-appwrite";
import { createAppwriteServerClient, appwriteCollectionIds } from "@/lib/appwrite/server";
import { generateOllamaEmbeddings } from "@/lib/agents/ollama";
import { ensurePineconeIndex, upsertDocumentChunks } from "@/lib/pinecone/client";
import type { ReferenceChunk } from "@/lib/models/maintenance";

type AppwriteDocument<T> = Models.Document & T;

function withId<T extends { id?: string }>(document: AppwriteDocument<T>): T {
  const {
    $id,
    $sequence,
    $collectionId,
    $databaseId,
    $createdAt,
    $updatedAt,
    $permissions,
    ...data
  } = document;

  void $sequence;
  void $collectionId;
  void $databaseId;
  void $createdAt;
  void $updatedAt;
  void $permissions;

  return {
    ...data,
    id: data.id ?? $id
  } as unknown as T;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { documentIds?: string[] };
    const { documentIds } = body;

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return Response.json(
        { error: "Geçersiz veya boş döküman listesi." },
        { status: 400 }
      );
    }

    const appwrite = createAppwriteServerClient();
    if (!appwrite) {
      return Response.json(
        { error: "Appwrite sunucu bağlantısı kurulamadı." },
        { status: 500 }
      );
    }

    // 1. Fetch all chunks from Appwrite for the selected documents
    const allChunks: ReferenceChunk[] = [];
    for (const docId of documentIds) {
      let offset = 0;
      const limit = 100;
      while (true) {
        const res = await appwrite.databases.listDocuments<AppwriteDocument<ReferenceChunk>>({
          databaseId: appwrite.config.databaseId,
          collectionId: appwriteCollectionIds.referenceChunks,
          queries: [
            Query.equal("documentId", docId),
            Query.limit(limit),
            Query.offset(offset)
          ]
        });

        allChunks.push(...res.documents.map(withId));

        if (res.documents.length < limit) {
          break;
        }
        offset += limit;
      }
    }

    if (allChunks.length === 0) {
      return Response.json(
        { error: "Seçilen dökümanlara ait metin parçası bulunamadı." },
        { status: 404 }
      );
    }

    // 2. Generate embeddings using Ollama in batches
    console.log(`Generating embeddings for ${allChunks.length} chunks...`);
    const batchSize = 30;
    const vectors: number[][] = [];
    
    for (let i = 0; i < allChunks.length; i += batchSize) {
      const batchChunks = allChunks.slice(i, i + batchSize);
      const batchTexts = batchChunks.map((c) => c.text);
      const batchVectors = await generateOllamaEmbeddings(batchTexts);
      vectors.push(...batchVectors);
    }

    if (vectors.length !== allChunks.length) {
      throw new Error("Oluşturulan vektör sayısı parça sayısıyla eşleşmiyor.");
    }

    // 3. Ensure Pinecone index is ready with correct dimensions
    const dimension = vectors[0].length;
    console.log(`Ensuring Pinecone index is ready (dimension: ${dimension})...`);
    const indexName = await ensurePineconeIndex(dimension);

    if (!indexName) {
      return Response.json(
        { error: "Pinecone indeksi hazırlanırken hata oluştu." },
        { status: 500 }
      );
    }

    // 4. Upsert vectors to Pinecone
    console.log(`Upserting ${vectors.length} vectors to Pinecone index "${indexName}"...`);
    const success = await upsertDocumentChunks(allChunks, vectors);

    if (!success) {
      return Response.json(
        { error: "Vektörler Pinecone'a yüklenemedi." },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      message: `${allChunks.length} adet metin parçası başarıyla vektörleştirildi ve Pinecone'a yüklendi.`,
      indexName,
      chunksCount: allChunks.length,
      dimension
    });
  } catch (error) {
    console.error("Error in Pinecone sync API:", error);
    const message = error instanceof Error ? error.message : "Bilinmeyen hata.";
    return Response.json(
      { error: `Senkronizasyon başarısız: ${message}` },
      { status: 500 }
    );
  }
}
