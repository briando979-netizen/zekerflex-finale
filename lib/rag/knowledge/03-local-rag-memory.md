# Lokaal RAG-totaalgeheugen

`lib/rag/` indexeert alles wat de box weet in een **plain-Postgres vectorstore**.
Geen pgvector (zit niet in de alpine-image), geen externe vector-dienst.

## Model

`RagChunk`: `sourceType` (CODE | AUDIT | DATABASE | LEGAL | SALES | INTERACTION),
`sourceRef`, `title`, `chunkIndex`, `content`, `contentHash` (`@unique`,
sha256 van `sourceRef|chunkIndex|content`), `embedding Float[]`, `embedDim`,
`tokens`, `indexedAt`.

## Pijplijn

1. **`chunk.ts#chunkText`** — paragraaf-bewust splitsen op lege regels, harde cap
   (default 1200 tekens) met overlap (150). `estimateTokens` = `len/4`.
2. **`embed.ts`** — `embedOne` / `embedMany` wrappen `ai/client.embed`, dat het
   embedding-model (`LLM_EMBED_MODEL`, bv. `nomic-embed-text`, 768 dim) aanroept.
   `isRagEnabled()` = `RAG_ENABLED && LLM_EMBED_MODEL`.
3. **`store.ts`**:
   - `upsertChunk` — dedupe op `contentHash`, `sanitizeText` op content/title/ref.
   - `replaceSource(type, chunks)` — verwijdert stale chunks van dat type en
     upsert de nieuwe (idempotente herindex).
   - `search(queryVector, { limit, sourceTypes, minScore })` — haalt kandidaten
     op met `embedDim === queryVector.length` (max `RAG_MAX_CHUNKS`), berekent
     **cosine in JS**, sorteert, top-K.
4. **`reindex.ts`** — `indexCodebase` (allow-list `lib app components types
   tests` + `middleware.ts README.md prisma/schema.prisma`, ext `.ts .tsx
   .prisma .md .mjs`, skip `node_modules .next .git dist coverage`, max 80 KB),
   `indexAudit` (laatste 1500), `indexLegal` (`lib/rag/knowledge/*.md`),
   `indexSales`, `indexPlatform` (vestigingen, shifts, freelancers zonder PII,
   DBA-historie), `indexInteractions` (orchestratie-bevindingen). Elke indexer
   los afgeschermd; `reindexAll()` gaat door bij een fout in één.

## Bevragen

- `query.ts#retrieveContext(q, opts)` → `{ context, hits }` (geformatteerde
  `[n]`-blokken).
- `query.ts#askWithMemory(q)` → antwoord met bronvermelding `[n]`, of "niet in
  het geheugen" als er geen hits zijn.
- De orchestrator haalt vóór elke interpretatie context uit AUDIT/INTERACTION/LEGAL.
- Jarvis' `memory`-capability roept `askWithMemory` aan.

## Endpoints

- `GET /api/admin/rag/search?q=&types=CODE,LEGAL&limit=8`
- `POST /api/admin/rag/ask` `{ question }`
- `POST /api/internal/rag/reindex` (cron 12h, `x-internal-token`)

## Schalen

Tot ~10k chunks is JS-cosine ruim snel genoeg. De drop-in schaal-upgrade is
pgvector + een IVFFlat-index: alleen `search()` aanpassen om `ORDER BY embedding
<=> $1` te gebruiken; de rest blijft.
