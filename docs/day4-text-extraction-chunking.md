# Text Extraction and Chunking Pipeline

**Service:** `ai-service` (Python / FastAPI)
**Status:** Implemented

## Overview

The extraction stage converts an uploaded document into retrievable units of text. It reads the file registered by the upload pipeline, extracts its textual content, splits that content into overlapping segments, and persists each segment against its parent document.

```
POST /process ──▶ read stored_path ──▶ extract text ──▶ chunk ──▶ chunks table
                        │                                            │
                        └──────────── status transitions ────────────┘
```

Chunks produced here are the input to embedding generation and semantic retrieval.

## Design decisions

### Why documents are segmented

Language models impose a context window — a fixed upper bound on the text admissible in a single request. Whole documents routinely exceed it, and submitting a full document per query would be costly and would degrade answer quality, since a single relevant passage becomes harder to attend to when surrounded by unrelated content.

Segmenting up front allows retrieval to select only the passages relevant to a given question. Segment size is therefore a retrieval-quality parameter, not merely a storage convenience.

### Fixed-width segments over structural boundaries

Segments are defined by word count rather than by pages or paragraphs. Page boundaries carry no semantic meaning, and paragraph lengths vary by orders of magnitude within a single document. Fixed-width segmentation produces predictable retrieval behaviour and predictable token costs.

The default of 500 words is a starting point, exposed as a parameter. Segments that are too small lack the context needed to answer a question; segments that are too large consume context window and dilute relevance.

### Overlapping segments

Consecutive segments share their boundary region — each begins 50 words before the previous one ended.

Without overlap, a clean cut can sever a statement across two segments, leaving neither able to answer a question about it: one holds the subject, the other the predicate. Overlap ensures that any span shorter than the overlap width appears intact within at least one segment.

The cost is approximately 10% storage redundancy. Segments are a derived retrieval index rather than a system of record, so redundancy carries no correctness implications; the source document remains authoritative and unmodified.

**Verification.** Overlap is measurable rather than assumed. Locating the leading text of segment *n+1* within segment *n* returns character position 2,917 of 3,275 — confirming that the trailing ~11% of each segment is reproduced at the head of its successor.

### Format dispatch, not conversion

Each supported format has a dedicated reader. No intermediate format conversion occurs; all readers emit a plain string, and every downstream stage is format-agnostic.

| Format | Reader |
|---|---|
| `.pdf` | `pypdf` |
| `.docx` | `python-docx` |
| `.txt`, `.md` | direct read |

Word extraction traverses table cells in addition to paragraphs, since documents frequently carry substantive content in tables that a paragraph-only traversal would silently omit.

### Explicit rejection of unsupported input

Unrecognised extensions raise `UnsupportedFileType` rather than falling through to a permissive text reader. A permissive fallback decodes arbitrary binary content into meaningless text, which is then segmented and stored indistinguishably from legitimate content — corrupting the retrieval index with no error surfaced at any point.

Failing at the boundary is preferred to admitting unusable data into the pipeline.

### Scope: text-bearing documents

Extraction recovers text; it does not interpret images. Consequently:

- Embedded images, charts, and diagrams are omitted from extraction. Surrounding text is unaffected.
- Documents composed entirely of page images — scanned material — yield no text and are marked `failed`.
- Tabular structure is flattened; cell contents are preserved, spatial relationships are not.

Optical character recognition would extend coverage to scanned material. It is deliberately out of scope: OCR engines are system-level dependencies rather than language packages, complicating deployment; per-page latency is measured in seconds, which is incompatible with a synchronous endpoint; and recognition errors propagate into embeddings, producing confidently incorrect answers. Reconsidering OCR is appropriate once asynchronous processing exists to absorb the latency.

### Error classification

Two failure modes are distinguished, because they imply different remedies for the caller:

| Condition | Exception | Status |
|---|---|---|
| No reader registered for the extension | `UnsupportedFileType` | `415 Unsupported Media Type` |
| Reader present, file unreadable (corrupt, encrypted) | `ExtractionFailed` | `422 Unprocessable Entity` |
| Reader succeeded, no text recovered | — | `422 Unprocessable Entity` |
| No document with the supplied identifier | — | `404 Not Found` |

Every failure path writes `status = 'failed'` before returning. A document therefore never remains indefinitely in `processing`, which would be indistinguishable from work still in flight.

### Connection lifetime

Extraction is CPU-bound and, for large documents, measured in seconds. Database connections are acquired for the metadata read, released for the duration of extraction and segmentation, and reacquired for the write. Holding a pooled connection across the extraction interval would reserve a bounded resource for work that does not use it.

### Configuration load order

Environment loading precedes the import of modules that read configuration during module evaluation. `db.py` constructs its connection pool at import time from `DATABASE_URL`; importing it before configuration is loaded raises `KeyError`.

This requires placing two imports below the `load_dotenv` call rather than in the module header, departing from PEP 8 import ordering. The departure is annotated in place.

## Schema

```sql
CREATE TABLE IF NOT EXISTS chunks (
  id           SERIAL PRIMARY KEY,
  document_id  INTEGER     NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index  INTEGER     NOT NULL,
  content      TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS chunks_document_id_idx ON chunks(document_id);
```

| Element | Rationale |
|---|---|
| `REFERENCES documents(id)` | Referential integrity is enforced by the database rather than by application code. Two services in different languages write to this schema; a constraint holds across both. |
| `ON DELETE CASCADE` | Segment lifetime is bound to the parent document. Without cascade, deletion either fails or requires every caller to remember an ordered cleanup. |
| `chunk_index` | Result ordering is not guaranteed without an explicit sort key. Position additionally supports citation ("segment 4 of 17") and neighbour expansion during retrieval. |
| `UNIQUE (document_id, chunk_index)` | Reprocessing a document raises a constraint violation rather than silently duplicating segments. Visible failure is preferred to undetected duplication. |
| `chunks_document_id_idx` | Foreign key columns are not indexed automatically. Retrieval filters on `document_id` on every query. |

Applied by `services/atlas-api/scripts/init-chunks.js`, which is idempotent.

## API

### `POST /process`

Extracts and segments a registered document.

**Request**

```bash
curl -X POST http://localhost:8001/process \
  -H "Content-Type: application/json" \
  -d '{"document_id": 2}'
```

**Response — `200 OK`**

```json
{
  "document_id": 2,
  "chunks_created": 17
}
```

**Status transitions**

```
pending ──▶ processing ──▶ ready
                       └─▶ failed
```

**Errors**

| Status | Condition |
|---|---|
| `404` | No document with the supplied identifier. |
| `415` | File extension has no registered reader. |
| `422` | File unreadable, or no text recovered. |

## Implementation

| File | Responsibility |
|---|---|
| `app/chunking.py` | Format dispatch, text extraction, segmentation, exception definitions. |
| `app/db.py` | Postgres connection pool (psycopg). |
| `app/main.py` | `/process` endpoint, status transitions, error mapping. |
| `../atlas-api/scripts/init-chunks.js` | Schema application. |

Parameterised statements are used throughout; psycopg denotes placeholders as `%s` for all types, with values supplied as a tuple. The syntax resembles string interpolation but is not — values are transmitted separately from the statement.

## Setup

```bash
cd services/ai-service
poetry install
```

Dependencies: `pypdf`, `python-docx`, `psycopg[binary]`, `psycopg-pool`.

`DATABASE_URL` must be present in the project-root `.env`. Apply the schema before first use:

```bash
cd ../atlas-api && node scripts/init-chunks.js
```

## Verification

```bash
# Upload, then process
curl -X POST http://localhost:3000/api/documents -F "file=@sample.pdf"
curl -X POST http://localhost:8001/process -H "Content-Type: application/json" -d '{"document_id": 2}'

# Inspect segments
docker exec <container> psql -U <user> -d <db> -c \
  "SELECT chunk_index, length(content) FROM chunks WHERE document_id = 2 ORDER BY chunk_index;"
```

Segment lengths should cluster around 3,300 characters for the default 500-word width. Cascade behaviour can be confirmed by deleting a parent document and verifying that no segments remain against its identifier.

## Known limitations

- **Reprocessing is not supported.** A second `/process` call against the same document violates the uniqueness constraint. Idempotent reprocessing requires deleting existing segments before insertion.
- **Processing is synchronous.** Large documents block the request for the duration of extraction. Asynchronous dispatch is required before documents of arbitrary size can be accepted.
- **Legacy `.doc` is unsupported.** `python-docx` handles only the Office Open XML format.

## Next stage

Segments are consumed by embedding generation, which converts each `content` value into a vector representation and stores it alongside the segment for similarity search.
