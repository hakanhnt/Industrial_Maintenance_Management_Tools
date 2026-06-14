# Industrial Maintenance Management Tools

AI-first maintenance management guide and training platform for industrial maintenance teams. The app uses a dark, minimal Next.js interface, Appwrite as the knowledge store, and MiniMax as the agent LLM.

## What It Does

- Lets users ask maintenance management questions in Turkish.
- Runs a selectable multi-agent workflow:
  - `CORE`: strategy, BCM, RCM, criticality and reliability decisions
  - `FIELD`: preventive, predictive and autonomous maintenance procedures
  - `FLOW`: work orders, scheduling, backlog and resource flow
  - `BASE`: equipment hierarchy, minifiles and documentation structure
  - `KPI`: OEE, MTBF, MTTR and Wrench Time analysis
- Reads reference PDF/EPUB material from Appwrite collections.
- Skips agents that are not relevant to the selected question.
- Avoids showing source/citation details in user-facing answers.
- Converts `[Diyagram Onerisi: ...]` tags into diagram suggestion cards.

## Stack

- Next.js App Router
- React
- Tailwind CSS
- Appwrite database
- MiniMax chat completions API
- Tavily web search fallback
- PDF/EPUB indexing scripts

## Project Structure

```text
app/
  api/ask/route.ts          API route for the agent workflow
components/
  maintenance-console.tsx   Main application screen
  agent-node.tsx            Agent status/timeline node
  agent-response-card.tsx   Agent answer card
lib/
  agents/                   Agent profiles, orchestration and MiniMax adapter
  appwrite/                 Appwrite server client and repositories
  knowledge/                Local fallback reference corpus and retrieval
  models/                   Shared TypeScript domain models
scripts/
  setup-appwrite.mjs        Creates Appwrite database collections/attributes
  index-reference-docs.mjs  Indexes PDF/EPUB files into Appwrite
public/reference-docs/      Local source folder for reference files
database/
  appwrite-collections.md   Appwrite collection design
```

## Environment

Create `.env.local` in the project root:

```bash
MINIMAX_API_KEY=
MINIMAX_API_URL=https://api.minimaxi.chat/v1/chat/completions
MINIMAX_MODEL=MiniMax-M3

TAVILY_API_KEY=
TAVILY_API_URL=https://api.tavily.com/search

APPWRITE_ENDPOINT=
APPWRITE_PROJECT_ID=
APPWRITE_API_KEY=
APPWRITE_DATABASE_ID=bakim_rehber

APPWRITE_REFERENCE_DOCUMENTS_COLLECTION_ID=reference_documents
APPWRITE_REFERENCE_CHUNKS_COLLECTION_ID=reference_chunks
APPWRITE_EQUIPMENT_NODES_COLLECTION_ID=equipment_nodes
APPWRITE_WORK_ORDER_TEMPLATES_COLLECTION_ID=work_order_templates
APPWRITE_KPI_DEFINITIONS_COLLECTION_ID=kpi_definitions
```

Do not commit `.env.local`.

## Setup

```bash
npm install
npm run appwrite:setup
npm run appwrite:index
npm run dev
```

Open:

```text
http://localhost:3000
```

## Reference Documents

Place PDF/EPUB files in:

```text
public/reference-docs/
```

Then run:

```bash
npm run appwrite:index
```

The indexer:

- stores metadata in `reference_documents`
- stores text chunks in `reference_chunks`
- skips already indexed files by checksum
- skips unsupported files such as `.xls` and `.xlsx`

## Appwrite Setup

Run:

```bash
npm run appwrite:setup
```

This creates the Appwrite database and collections if they do not already exist. It is intended to be idempotent.

## Validation

```bash
npm run typecheck
npm run lint
npm run build
```

## Notes

- The app is designed as an educational guide and decision-support simulator.
- It should not produce live operational decisions without reviewed source material.
- Agent answers are constrained by indexed reference documents.
- If no relevant local evidence exists and Tavily is configured, the agent can use web fallback evidence.
- Web fallback answers are marked in the UI, but source details are not shown in the answer text.
