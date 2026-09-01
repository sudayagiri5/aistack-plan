# Embedding and Retrieval Pipeline

**Service:** `ai-service` (Python / FastAPI)
**Status:** Implemented

## Overview

This stage makes document content searchable by meaning and answerable in natural language. Each stored chunk is converted into a vector representation and persisted alongside its text. At query time, the question is converted using the same model, the nearest chunks are selected by vector distance, and a language model composes an answer constrained to that retrieved material.

```
chunks ──▶ embedding model ──▶ vector(1536) stored on each row
                                          │
question ──▶ embedding model ──▶ cosine distance ──▶ top-k chunks
                                                          │
                                    prompt(context + question) ──▶ answer + citations
```

This completes retrieval-augmented generation: the model answers from supplied source text rather than from parametric knowledge, and every answer carries references to the chunks that produced it.

## Design decisions

### Vector storage in the primary database

Vectors are stored in Postgres via the pgvector extension rather than in a dedicated vector store. Chunk text, document metadata, and embeddings therefore share one database, one connection pool, one backup, and one transactional boundary. A separate vector service would introduce a second system to deploy, secure, and keep synchronised with the primary data, for no benefit at this scale.

A dedicated vector database becomes justified at very large collection sizes, where specialised indexing and sharding outperform a general-purpose engine. The migration path is straightforward, since retrieval is isolated behind a single module.

### Consistent embedding model across indexing and querying

Chunks and queries are embedded with the same model, referenced through a single module-level constant. Each embedding model defines its own vector space; coordinates produced by different models are not comparable, and mixing them yields distances that are numerically valid but semantically meaningless.

Declaring the model once removes the possibility of the two paths diverging.

### Fixed dimensionality declared in the schema

The column is declared `vector(1536)`, matching the output dimension of `text-embedding-3-small`. Dimensionality is a property of the model rather than a configuration choice; declaring it explicitly allows the database to reject malformed inserts and is a prerequisite for vector indexing.

### Nullable embedding column as a work queue

The column permits `NULL`, which denotes "not yet embedded." This is deliberate rather than incidental: chunks are written during extraction and embedded in a subsequent pass, so the null state carries meaning.

`WHERE embedding IS NULL` consequently identifies outstanding work, and makes the embedding endpoint idempotent — a repeated call selects no rows and performs no billable API request. This is preferable to the constraint-violation behaviour of the extraction endpoint, which fails on repetition rather than succeeding trivially.

### Batched embedding requests

All outstanding chunks for a document are embedded in a single API call. The provider returns results in input order, which permits positional association back to the originating rows. Per-chunk requests would multiply network round trips without reducing token cost.

### Cosine distance

Similarity is measured by cosine distance (`<=>`), which compares vector orientation and disregards magnitude. Embedding magnitude correlates with input length rather than semantic content; a brief statement and an extended treatment of the same subject should be judged similar. Euclidean distance would penalise that difference.

### No approximate-nearest-neighbour index

No HNSW or IVFFlat index has been created. At current collection size a sequential scan is faster than traversing an approximate index, and ANN structures trade recall for speed — an unfavourable exchange when exhaustive comparison is already inexpensive.

Indexing becomes appropriate once scan time dominates query latency. The retrieval query requires no modification when it is added.

### Grounding through system instruction

The system prompt directs the model to answer solely from supplied context and to state plainly when the context is insufficient. Without this constraint the model answers from training data, producing fluent responses that cannot be traced to any source document.

The behaviour is verified negatively as well as positively: a question outside the corpus returns an explicit statement of absence rather than a plausible fabrication.

### Numbered context blocks for citation

Retrieved chunks are presented to the model as numbered blocks annotated with their source document and chunk index. The numbering gives the model referents it can cite inline, and the response includes a parallel citation array mapping each number to its document, chunk index, and retrieval distance.

Exposing distance alongside each citation surfaces retrieval confidence to the caller, which is otherwise invisible.

### Optional document scoping

Retrieval accepts an optional document identifier. Omitted, it searches the entire corpus; supplied, it restricts results to a single document. The parameter is applied through a placeholder, so conditional query construction does not weaken injection protection.

This supports both corpus-wide questions and document-specific interrogation from the same code path.

## Schema

```sql
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedding vector(1536);
```

| Element | Rationale |
|---|---|
| `CREATE EXTENSION` | pgvector is present in the base image but must be enabled per database. Availability and activation are distinct. |
| `ALTER TABLE ... ADD COLUMN` | Additive migration; existing chunk rows are preserved. |
| `vector(1536)` | Matches the embedding model's output dimension. |
| Nullable | Encodes "not yet embedded," which drives the idempotent embedding pass. |
| `IF NOT EXISTS` (both) | Idempotent application. |

Applied by `services/atlas-api/scripts/init-vectors.js`.

## API

### `POST /embed`

Generates embeddings for any chunks of a document that lack them.

```bash
curl -X POST http://localhost:8001/embed \
  -H "Content-Type: application/json" \
  -d '{"document_id": 4}'
```

**Response — `200 OK`**

```json
{ "document_id": 4, "embedded": 4 }
```

Repeated invocation is a no-op:

```json
{ "document_id": 4, "embedded": 0, "detail": "nothing to embed" }
```

### `POST /chat/answer`

Answers a question from the indexed corpus.

**Request**

| Field | Type | Default | Purpose |
|---|---|---|---|
| `question` | string | — | The query. |
| `document_id` | integer \| null | `null` | Restrict retrieval to one document. |
| `top_k` | integer | `4` | Number of chunks to retrieve. |

```bash
curl -X POST http://localhost:8001/chat/answer \
  -H "Content-Type: application/json" \
  -d '{"question": "How do we check our systems for weaknesses before going live?"}'
```

**Response — `200 OK`**

```json
{
  "question": "How do we check our systems for weaknesses before going live?",
  "answer": "To check systems for weaknesses before going live, you must ensure that systems undergo vulnerability scans prior to production deployment... Additionally, regular penetration testing is also mandatory for all systems [1][2].",
  "citations": [
    { "n": 1, "document_name": "policy.pdf", "chunk_index": 3, "distance": 0.4863 },
    { "n": 2, "document_name": "policy.pdf", "chunk_index": 2, "distance": 0.5147 },
    { "n": 3, "document_name": "policy.pdf", "chunk_index": 1, "distance": 0.7049 },
    { "n": 4, "document_name": "policy.pdf", "chunk_index": 0, "distance": 0.7350 }
  ]
}
```

**Errors**

| Status | Condition |
|---|---|
| `404` | No embedded content available to search. |

## Implementation

| File | Responsibility |
|---|---|
| `app/embeddings.py` | Embedding model constants; batch and single-query embedding. |
| `app/retrieval.py` | Similarity query, optional document scoping, prompt constants. |
| `app/main.py` | `/embed` and `/chat/answer` endpoints. |
| `../atlas-api/scripts/init-vectors.js` | Extension enablement and column migration. |

Vectors are serialised to pgvector's textual representation before insertion; the driver's native list handling maps to an array type the column does not accept.

Database connections are released for the duration of external API calls. Embedding and completion requests take seconds; retaining a pooled connection across them would reserve a bounded resource for work that does not use it.

## Verification

Retrieval quality is observable through the distance values returned with each citation.

**Semantic match.** The query *"How do we check our systems for weaknesses before going live?"* retrieves a chunk reading *"Systems must undergo vulnerability scans before production deployment"* at distance 0.4863, ranked first. The query and the source share no significant terms; lexical search would not return this result.

**Distance distribution as signal.** Against substantive content, distances form a clear gradient — 0.486 and 0.515 for relevant chunks against 0.705 and 0.735 for unrelated ones. Against semantically empty content (placeholder text), distances cluster uniformly around 0.73, correctly indicating that no chunk is more relevant than any other.

**Grounding.** A question with no support in the corpus returns an explicit statement of absence rather than a fabricated answer, with all retrieval distances above 0.70 — confirming both that retrieval found nothing relevant and that the model respected its instruction not to supply an answer from training data.

## Known limitations

- **No relevance threshold.** Retrieval always returns `top_k` results regardless of distance. A minimum-similarity cutoff would allow short-circuiting the completion call when no chunk is sufficiently close, reducing latency and cost on unanswerable queries.
- **No index.** Query time grows linearly with collection size. Acceptable at present volume; requires an ANN index before scaling.
- **Fixed `top_k`.** The number of retrieved chunks does not adapt to question complexity or to available context budget.
- **Single-turn only.** No conversation history is retained; each question is answered independently.

## Next stage

The Node gateway's chat route is connected to this endpoint, so that the full pipeline is reachable through the single public-facing service.
