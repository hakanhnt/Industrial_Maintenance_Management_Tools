import { Models, Query } from "node-appwrite";
import type { ReferenceChunk, ReferenceDocument } from "@/lib/models/maintenance";
import {
  referenceChunks as fallbackChunks,
  referenceDocuments as fallbackDocuments
} from "@/lib/knowledge/reference-corpus";
import {
  appwriteCollectionIds,
  createAppwriteServerClient
} from "@/lib/appwrite/server";

type AppwriteDocument<T> = Models.Document & T;

function withId<T extends { id?: string }>(document: AppwriteDocument<T>) {
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
  };
}

export async function listReferenceDocuments(): Promise<ReferenceDocument[]> {
  const appwrite = createAppwriteServerClient();

  if (!appwrite) {
    return fallbackDocuments;
  }

  try {
    const result = await appwrite.databases.listDocuments<AppwriteDocument<ReferenceDocument>>({
      databaseId: appwrite.config.databaseId,
      collectionId: appwriteCollectionIds.referenceDocuments,
      queries: [Query.limit(100)]
    });

    return result.documents.map(withId);
  } catch {
    return fallbackDocuments;
  }
}

export async function listReferenceChunks(): Promise<ReferenceChunk[]> {
  const appwrite = createAppwriteServerClient();

  if (!appwrite) {
    return fallbackChunks;
  }

  try {
    const documents: AppwriteDocument<ReferenceChunk>[] = [];
    const pageSize = 100;
    let offset = 0;

    while (true) {
      const result =
        await appwrite.databases.listDocuments<AppwriteDocument<ReferenceChunk>>({
          databaseId: appwrite.config.databaseId,
          collectionId: appwriteCollectionIds.referenceChunks,
          queries: [Query.limit(pageSize), Query.offset(offset)]
        });

      documents.push(...result.documents);

      if (result.documents.length < pageSize) {
        break;
      }

      offset += pageSize;
    }

    return documents.map(withId);
  } catch {
    return fallbackChunks;
  }
}
