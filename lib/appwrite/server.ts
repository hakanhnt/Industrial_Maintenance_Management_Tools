import "server-only";
import { Client, Databases, Storage } from "node-appwrite";

export const appwriteCollectionIds = {
  referenceDocuments:
    process.env.APPWRITE_REFERENCE_DOCUMENTS_COLLECTION_ID ?? "reference_documents",
  referenceChunks:
    process.env.APPWRITE_REFERENCE_CHUNKS_COLLECTION_ID ?? "reference_chunks",
  equipmentNodes:
    process.env.APPWRITE_EQUIPMENT_NODES_COLLECTION_ID ?? "equipment_nodes",
  workOrderTemplates:
    process.env.APPWRITE_WORK_ORDER_TEMPLATES_COLLECTION_ID ?? "work_order_templates",
  kpiDefinitions:
    process.env.APPWRITE_KPI_DEFINITIONS_COLLECTION_ID ?? "kpi_definitions"
} as const;

export function getAppwriteConfig() {
  const endpoint = process.env.APPWRITE_ENDPOINT;
  const projectId = process.env.APPWRITE_PROJECT_ID;
  const apiKey = process.env.APPWRITE_API_KEY;
  const databaseId = process.env.APPWRITE_DATABASE_ID;

  if (!endpoint || !projectId || !apiKey || !databaseId) {
    return null;
  }

  return {
    endpoint,
    projectId,
    apiKey,
    databaseId
  };
}

export function createAppwriteServerClient() {
  const config = getAppwriteConfig();

  if (!config) {
    return null;
  }

  const client = new Client()
    .setEndpoint(config.endpoint)
    .setProject(config.projectId)
    .setKey(config.apiKey);

  return {
    client,
    databases: new Databases(client),
    storage: new Storage(client),
    config
  };
}
