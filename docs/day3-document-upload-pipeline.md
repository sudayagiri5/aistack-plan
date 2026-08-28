# Document Upload Pipeline

**Service:** `atlas-api` (Node.js / Express)
**Status:** Implemented

## Overview

The upload pipeline is the entry point of AtlasAssist. It accepts a file over HTTP, persists the file to storage, and records a metadata row in Postgres describing it. Every downstream stage — text extraction, chunking, embedding, retrieval — operates against documents registered by this pipeline.

```
Client ──POST /api/documents──▶ atlas-api ──▶ disk (uploads/)
                                     │
                                     └──────▶ Postgres (documents table)
```

## Design decisions

### Files on disk, metadata in Postgres

Binary file contents are written to the filesystem; only descriptive metadata is stored in the database. Relational databases are optimised for querying small structured records, not for storing or streaming large binary blobs. Keeping the two separate keeps the table small and fast to query, and allows the storage backend to be swapped without schema changes.

The `stored_path` column is the link between the two — the database row points at the file rather than containing it.

**Deployment note:** local disk is appropriate for development only. Hosted environments typically use ephemeral filesystems, so a production deployment replaces the storage layer with an object store (S3 or equivalent). The abstraction boundary is `multer.diskStorage`, which is the only component that would change.

### Server-generated filenames

Uploaded files are stored under a generated name (`<timestamp>-<random>.<ext>`) rather than the name supplied by the client. This addresses two problems:

1. **Collisions.** Two clients uploading `report.pdf` would otherwise overwrite one another.
2. **Path traversal.** A client-supplied name such as `../../etc/passwd` could escape the upload directory. Generating the name server-side removes the client's influence over the write location entirely.

The original filename is preserved in the `original_name` column and is what the user sees in the interface.

### Parameterised queries

All values are passed to Postgres through placeholders (`$1`, `$2`, `$3`) with the values supplied in a separate array, rather than being interpolated into the SQL string. The driver sends the query and the data separately, so input is always treated as data and never as executable SQL. This is the standard defence against SQL injection, and matters here because `original_name` is attacker-controlled.

### Connection pooling

The service holds a single shared `pg.Pool` (`db.js`), exported as a module and reused by every route. Establishing a Postgres connection requires a TCP handshake and authentication round trip; a pool amortises that cost by maintaining a set of warm connections and lending them out per query.

A single shared connection would serialise concurrent requests. A connection per request would pay full setup cost each time and eventually exhaust the server's `max_connections` limit. A pool is the standard resolution of both.

### Status as a first-class column

Documents carry a `status` field with the lifecycle:

```
pending → processing → ready
                    └─▶ failed
```

Uploads are recorded as `pending`. Processing stages transition the value as work completes. The column is introduced at upload time — rather than added later — because it is the coordination point between the synchronous upload path and the asynchronous processing that follows: the API can acknowledge an upload immediately while work continues in the background, and clients poll this field to determine readiness.

### Raw SQL over an ORM

`atlas-api` uses the `pg` driver directly rather than an ORM.

- The schema is a single table with no relational complexity; an ORM's mapping layer would add indirection without reducing work.
- The database is **shared** with a Python service that owns the chunk and vector tables. ORM migration tooling reconciles its own schema definition against the live database and reports externally-managed tables as drift. A polyglot, shared-database topology is better served by each service issuing plain SQL against the tables it owns.

An ORM remains appropriate for services that own their database outright and have richer relational models.

## Schema

```sql
CREATE TABLE IF NOT EXISTS documents (
  id            SERIAL PRIMARY KEY,
  original_name TEXT        NOT NULL,
  stored_path   TEXT        NOT NULL,
  size_bytes    BIGINT      NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

| Column | Type | Notes |
|---|---|---|
| `id` | `SERIAL PRIMARY KEY` | Auto-incrementing identifier, backed by a sequence. The primary key declaration creates a B-tree index automatically. |
| `original_name` | `TEXT NOT NULL` | Client-supplied filename, retained for display. |
| `stored_path` | `TEXT NOT NULL` | Server-side location of the stored file. |
| `size_bytes` | `BIGINT NOT NULL` | File size. Returned by the driver as a string, since `BIGINT` exceeds JavaScript's safe integer range. |
| `status` | `TEXT NOT NULL DEFAULT 'pending'` | Processing lifecycle state. |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Upload time. Timezone-aware; stored as UTC and rendered per client locale. |

`TIMESTAMPTZ` is used in preference to `TIMESTAMP` so that values remain unambiguous across deployment regions.

The schema is applied by `scripts/init-db.js`. `CREATE TABLE IF NOT EXISTS` makes the script idempotent — safe to run repeatedly.

## API

### `POST /api/documents`

Uploads a file and registers it.

**Request:** `multipart/form-data` with a single field named `file`.

```bash
curl -X POST http://localhost:3000/api/documents -F "file=@./report.pdf"
```

**Response — `201 Created`**

```json
{
  "id": 1,
  "original_name": "report.pdf",
  "size_bytes": "18244",
  "status": "pending",
  "created_at": "2026-08-28T02:32:40.038Z"
}
```

The response body is produced by the `RETURNING` clause on the insert, so database-generated values (`id`, `status`, `created_at`) are returned without a second query.

**Errors**

| Status | Condition |
|---|---|
| `400 Bad Request` | No file present, or the form field is not named `file`. |
| `500 Internal Server Error` | Persistence failure. Details are logged server-side; the response body is generic. |

### `GET /api/documents`

Returns all registered documents, most recent first.

```bash
curl http://localhost:3000/api/documents
```

**Response — `200 OK`**

```json
[
  {
    "id": 1,
    "original_name": "report.pdf",
    "size_bytes": "18244",
    "status": "pending",
    "created_at": "2026-08-28T02:32:40.038Z"
  }
]
```

## Implementation

| File | Responsibility |
|---|---|
| `db.js` | Constructs and exports the shared connection pool. |
| `scripts/init-db.js` | Applies the schema. Run once during setup. |
| `routes/document.js` | Upload and list handlers, including multer storage configuration. |
| `app.js` | Mounts the router at `/api/documents`. |
| `server.js` | Loads environment configuration, then starts the HTTP listener. |

### Configuration loading order

`server.js` loads environment variables on its first line, before any other module is required. This is load-bearing: requiring `app.js` transitively requires `db.js`, which reads `process.env.DATABASE_URL` at module evaluation time. If configuration were loaded after that chain, the pool would be constructed with an undefined connection string.

### Body parsing

`express.json()` is registered globally for JSON request bodies. File uploads use a different content type (`multipart/form-data`) that `express.json()` does not handle, so multer's `upload.single("file")` is applied as route-level middleware on the upload endpoint only.

## Setup

**Requirements:** Node.js, pnpm, and a running Postgres instance.

```bash
cd services/atlas-api
pnpm install
```

Set `DATABASE_URL` in the project-root `.env`:

```
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<database>
```

Apply the schema:

```bash
node scripts/init-db.js
# ✓ documents table ready
```

Start the service:

```bash
pnpm dev     # development, with automatic restart on file change
pnpm start   # production
```

The upload directory is created at startup if absent and is excluded from version control.

## Verification

```bash
echo "hello world" > /tmp/test.txt
curl -X POST http://localhost:3000/api/documents -F "file=@/tmp/test.txt"
curl http://localhost:3000/api/documents
```

The first call should return `201` with a populated document object; the second should return that object within an array. The stored file can be confirmed on disk under `uploads/`, named per the generation scheme rather than the original filename.

## Next stage

Registered documents are consumed by the text extraction and chunking stage in the Python AI service, which reads `stored_path`, extracts text, splits it into overlapping segments, and advances `status` as it progresses.
