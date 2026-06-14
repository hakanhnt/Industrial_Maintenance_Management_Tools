import nextEnv from "@next/env";
import { Client, Databases } from "node-appwrite";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

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
    process.env.APPWRITE_REFERENCE_CHUNKS_COLLECTION_ID ?? "reference_chunks",
  equipmentNodes:
    process.env.APPWRITE_EQUIPMENT_NODES_COLLECTION_ID ?? "equipment_nodes",
  workOrderTemplates:
    process.env.APPWRITE_WORK_ORDER_TEMPLATES_COLLECTION_ID ?? "work_order_templates",
  kpiDefinitions:
    process.env.APPWRITE_KPI_DEFINITIONS_COLLECTION_ID ?? "kpi_definitions"
};

const databaseId = process.env.APPWRITE_DATABASE_ID;

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);

const collections = [
  {
    id: collectionIds.referenceDocuments,
    name: "Reference Documents",
    attributes: [
      stringAttr("id", 64, true),
      stringAttr("title", 256, true),
      stringAttr("sourceType", 24, true),
      stringAttr("version", 64, false),
      datetimeAttr("uploadedAt", true),
      stringAttr("checksum", 128, false),
      stringAttr("tags", 64, false, true)
    ]
  },
  {
    id: collectionIds.referenceChunks,
    name: "Reference Chunks",
    attributes: [
      stringAttr("id", 64, true),
      stringAttr("documentId", 64, true),
      stringAttr("title", 256, true),
      integerAttr("page", false),
      stringAttr("locationLabel", 256, true),
      stringAttr("domain", 32, true),
      stringAttr("text", 8000, true),
      stringAttr("keywords", 64, false, true)
    ]
  },
  {
    id: collectionIds.equipmentNodes,
    name: "Equipment Nodes",
    attributes: [
      stringAttr("id", 64, true),
      stringAttr("parentId", 64, false),
      stringAttr("code", 64, true),
      stringAttr("name", 256, true),
      stringAttr("level", 32, true),
      stringAttr("criticality", 1, true),
      stringAttr("documentationRefs", 128, false, true)
    ]
  },
  {
    id: collectionIds.workOrderTemplates,
    name: "Work Order Templates",
    attributes: [
      stringAttr("id", 64, true),
      stringAttr("title", 256, true),
      stringAttr("strategy", 32, true),
      stringAttr("assetLevel", 32, true),
      stringAttr("trigger", 512, true),
      integerAttr("plannedDurationMinutes", true),
      stringAttr("requiredRoles", 64, false, true),
      stringAttr("safetyNotes", 512, false, true),
      stringAttr("evidenceChunkIds", 64, false, true)
    ]
  },
  {
    id: collectionIds.kpiDefinitions,
    name: "KPI Definitions",
    attributes: [
      stringAttr("id", 64, true),
      stringAttr("code", 32, true),
      stringAttr("name", 128, true),
      stringAttr("formula", 1024, true),
      stringAttr("interpretation", 2048, true),
      stringAttr("evidenceChunkIds", 64, false, true)
    ]
  }
];

function stringAttr(key, size, required, array = false) {
  return {
    type: "string",
    key,
    size,
    required,
    array
  };
}

function integerAttr(key, required) {
  return {
    type: "integer",
    key,
    required
  };
}

function datetimeAttr(key, required) {
  return {
    type: "datetime",
    key,
    required
  };
}

async function ensureDatabase() {
  try {
    await databases.get({ databaseId });
    console.log(`database exists: ${databaseId}`);
  } catch (error) {
    if (error.code !== 404) throw error;

    await databases.create({
      databaseId,
      name: "Bakım Rehber",
      enabled: true
    });
    console.log(`database created: ${databaseId}`);
  }
}

async function ensureCollection(collection) {
  try {
    await databases.getCollection({
      databaseId,
      collectionId: collection.id
    });
    console.log(`collection exists: ${collection.id}`);
  } catch (error) {
    if (error.code !== 404) throw error;

    await databases.createCollection({
      databaseId,
      collectionId: collection.id,
      name: collection.name,
      documentSecurity: false,
      enabled: true
    });
    console.log(`collection created: ${collection.id}`);
  }
}

async function listExistingAttributeKeys(collectionId) {
  const collection = await databases.getCollection({
    databaseId,
    collectionId
  });

  return new Set(collection.attributes.map((attribute) => attribute.key));
}

async function ensureAttribute(collectionId, attribute) {
  const existing = await listExistingAttributeKeys(collectionId);

  if (existing.has(attribute.key)) {
    console.log(`attribute exists: ${collectionId}.${attribute.key}`);
    return;
  }

  if (attribute.type === "string") {
    await databases.createStringAttribute({
      databaseId,
      collectionId,
      key: attribute.key,
      size: attribute.size,
      required: attribute.required,
      array: attribute.array
    });
  }

  if (attribute.type === "integer") {
    await databases.createIntegerAttribute({
      databaseId,
      collectionId,
      key: attribute.key,
      required: attribute.required
    });
  }

  if (attribute.type === "datetime") {
    await databases.createDatetimeAttribute({
      databaseId,
      collectionId,
      key: attribute.key,
      required: attribute.required
    });
  }

  console.log(`attribute created: ${collectionId}.${attribute.key}`);
}

async function main() {
  await ensureDatabase();

  for (const collection of collections) {
    await ensureCollection(collection);

    for (const attribute of collection.attributes) {
      await ensureAttribute(collection.id, attribute);
    }
  }

  console.log("Appwrite setup completed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
