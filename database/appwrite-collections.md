# Appwrite Koleksiyon Tasarımı

Appwrite tarafında tek database altında aşağıdaki koleksiyonlar kullanılacak.
Varsayılan koleksiyon ID'leri kodda `lib/appwrite/server.ts` içinde tanımlıdır ve env ile değiştirilebilir.

## Env

```bash
APPWRITE_ENDPOINT=https://<REGION>.cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=
APPWRITE_API_KEY=
APPWRITE_DATABASE_ID=bakim_rehber

APPWRITE_REFERENCE_DOCUMENTS_COLLECTION_ID=reference_documents
APPWRITE_REFERENCE_CHUNKS_COLLECTION_ID=reference_chunks
APPWRITE_EQUIPMENT_NODES_COLLECTION_ID=equipment_nodes
APPWRITE_WORK_ORDER_TEMPLATES_COLLECTION_ID=work_order_templates
APPWRITE_KPI_DEFINITIONS_COLLECTION_ID=kpi_definitions
```

## `reference_documents`

Kaynak PDF/EPUB metadata kayıtları.

| Attribute | Type | Required | Array |
| --- | --- | --- | --- |
| `id` | string(64) | true | false |
| `title` | string(256) | true | false |
| `sourceType` | string(24) | true | false |
| `version` | string(64) | false | false |
| `uploadedAt` | datetime | true | false |
| `checksum` | string(128) | false | false |
| `tags` | string(64) | false | true |

Önerilen indexler: `id` unique, `sourceType` key, `tags` key.

## `reference_chunks`

PDF/EPUB metin parçaları ve kaynak konumları.

| Attribute | Type | Required | Array |
| --- | --- | --- | --- |
| `id` | string(64) | true | false |
| `documentId` | string(64) | true | false |
| `title` | string(256) | true | false |
| `page` | integer | false | false |
| `locationLabel` | string(256) | true | false |
| `domain` | string(32) | true | false |
| `text` | string(8000) | true | false |
| `keywords` | string(64) | false | true |

Önerilen indexler: `id` unique, `documentId` key, `domain` key, `keywords` key, `text` fulltext.

## `equipment_nodes`

Ekipman sicil hiyerarşisi ve minifile kayıtları.

| Attribute | Type | Required | Array |
| --- | --- | --- | --- |
| `id` | string(64) | true | false |
| `parentId` | string(64) | false | false |
| `code` | string(64) | true | false |
| `name` | string(256) | true | false |
| `level` | string(32) | true | false |
| `criticality` | string(1) | true | false |
| `documentationRefs` | string(128) | false | true |

Önerilen indexler: `id` unique, `code` unique, `parentId` key, `level` key, `criticality` key.

## `work_order_templates`

Eğitim amaçlı bakım iş emri şablonları.

| Attribute | Type | Required | Array |
| --- | --- | --- | --- |
| `id` | string(64) | true | false |
| `title` | string(256) | true | false |
| `strategy` | string(32) | true | false |
| `assetLevel` | string(32) | true | false |
| `trigger` | string(512) | true | false |
| `plannedDurationMinutes` | integer | true | false |
| `requiredRoles` | string(64) | false | true |
| `safetyNotes` | string(512) | false | true |
| `evidenceChunkIds` | string(64) | false | true |

Önerilen indexler: `id` unique, `strategy` key, `assetLevel` key.

## `kpi_definitions`

KPI tanımları, formüller ve yorum sınırları.

| Attribute | Type | Required | Array |
| --- | --- | --- | --- |
| `id` | string(64) | true | false |
| `code` | string(32) | true | false |
| `name` | string(128) | true | false |
| `formula` | string(1024) | true | false |
| `interpretation` | string(2048) | true | false |
| `evidenceChunkIds` | string(64) | false | true |

Önerilen indexler: `id` unique, `code` unique.
