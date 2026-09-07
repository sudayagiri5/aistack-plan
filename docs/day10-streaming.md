# Day 10 — Streaming the Agent (Server-Sent Events)

**Status:** implemented and verified locally
**Scope:** `ai-service`, `atlas-api`, `atlasassist-ui`

---

## Purpose

The agent takes 10–20 seconds per question because it performs several retrieval rounds before writing an answer. The non-streaming endpoint (`POST /chat/agent`) returns nothing until that work completes, so the interface sits idle for the full duration.

Day 10 adds a streaming path that emits each stage of the agent's run as it happens. Total latency is unchanged; time-to-first-feedback drops from ~15s to under 1s, and the agent's tool usage becomes a visible product surface rather than hidden latency.

The non-streaming endpoint remains in place and unchanged.

---

## Design decision: event-level, not token-level

The agent produces text only in its final step. A representative run:

```
get_document_list → search_documents ×3 → generate answer
└──────────── ~12s ────────────┘   └── ~3s ──┘
```

Token streaming would animate the final 3 seconds and leave the first 12 dead. Streaming **events** — one per tool call, then the answer, then the citations — reflects where time is actually spent.

**Trade-off accepted:** the answer arrives as a single block rather than word by word. Token-level streaming can be layered on later by switching `stream_mode` and emitting partial-content events; the event contract below is designed to accommodate that without breaking clients.

---

## Transport

**Server-Sent Events (SSE)** over HTTP.

Chosen over WebSockets because communication is unidirectional after the initial request, SSE requires no client library, and it traverses standard HTTP infrastructure. Wire format is one JSON object per message:

```
data: {"type": "...", ...}\n\n
```

The terminating blank line is the message delimiter and is mandatory.

---

## Endpoint contract

### AI service

```
POST /chat/agent/stream
Content-Type: application/json
→ Content-Type: text/event-stream
```

**Request body**

```json
{ "question": "What are the testing requirements?" }
```

**Response headers**

| Header | Value | Reason |
| --- | --- | --- |
| `Content-Type` | `text/event-stream` | Declares SSE |
| `Cache-Control` | `no-cache` | Stream must not be cached |
| `X-Accel-Buffering` | `no` | Prevents reverse-proxy buffering (see Deployment) |

### Gateway

```
POST /api/chat/agent/stream
```

`services/atlas-api/routes/chat.js:61` → forwards to `${AI_SERVICE_URL}/chat/agent/stream` (line 74).

This is the path the frontend calls. The gateway adds no transformation.

---

## Event schema

Events arrive in order. Exactly one `answer` and one `citations` event per successful run; zero or more `step` events precede them.

### `step` — emitted per tool call, as it is made

```json
{
  "type": "step",
  "step": {
    "tool": "search_documents",
    "args": { "query": "testing requirements", "document_id": 1 }
  }
}
```

`tool` is one of `get_document_list`, `search_documents`, `create_action_item`. `args` mirrors the tool signature and may be `{}`.

### `answer` — emitted once the agent produces final content

```json
{ "type": "answer", "answer": "The testing requirements outlined in..." }
```

### `citations` — emitted last

```json
{
  "type": "citations",
  "citations": [
    {
      "n": 1,
      "document_name": "policy.pdf",
      "chunk_index": 3,
      "distance": 0.5461,
      "excerpt": "1. Systems must undergo vulnerability scans before..."
    }
  ]
}
```

Maximum 4 entries, de-duplicated on `(document_id, chunk_index)`, sorted ascending by cosine distance, numbered from 1. Excerpts are truncated to 180 characters.

### `error` — replaces remaining events on failure

```json
{ "type": "error", "message": "Agent execution failed" }
```

Clients must treat any event stream that ends without an `answer` as failed.

---

## Implementation

### `services/ai-service/app/agent.py`

**`stream_agent(question)`** — a generator wrapping `agent.stream(..., stream_mode="updates")`. It walks each update, yields a `step` event for every tool call encountered, accumulates the same calls into a local `trace`, captures the final assistant content as `answer`, then yields the `answer` and `citations` events.

**`_citations_for(trace, question)`** — replays the `search_documents` calls recorded in the trace against the vector store to recover the passages behind the answer. Extracted from `run_agent`, which now calls it rather than duplicating the logic.

`run_agent` and the `/chat/agent` endpoint are unaffected in behaviour.

### `services/ai-service/app/main.py`

`POST /chat/agent/stream` wraps `stream_agent` in a generator that serialises each event with `json.dumps` and formats it as `data: {...}\n\n`, returned via `StreamingResponse`.

The `try/except` sits **inside** the generator. An exception raised after streaming has begun cannot produce an HTTP error status — headers are already sent — so it is converted into an `error` event instead. Without this, the connection would close silently and clients would hang.

### `services/atlas-api/routes/chat.js`

The gateway must pass the stream through rather than awaiting and forwarding it. Buffering the upstream response and re-emitting it on completion would restore the original latency while appearing to work in tests.

Requirements for this route:
- do not `await` the full body or parse it as JSON
- write chunks to the client as they arrive
- keep the response open until upstream closes
- propagate the SSE headers

### `apps/atlasassist-ui/src/lib/api.js`

Calls `/api/chat/agent/stream` and consumes the response body as a stream, decoding to text and splitting on `\n\n`.

Network chunks do not align with message boundaries — a single chunk may contain a partial event. The reader retains an unterminated tail in a buffer and processes only complete messages.

The reader lives in the API module rather than in a component, keeping transport concerns out of the view layer.

---

## Interface behaviour

**During the run:** tool steps render in the conversation column as a bulleted list with amber markers, above shimmer placeholders reserving the answer's position.

**On completion:** the conversation column shows the answer and its numbered citation chips only. The trace relocates to the right-hand panel under **"What the assistant did,"** beneath **"Where this came from,"** which lists each cited passage with its distance score and a proportional amber relevance bar.

Rationale: progress information is valuable while waiting and becomes noise once the answer is readable, but discarding it would lose the auditability that distinguishes this system from an opaque chatbot. Relocating preserves both.

---

## Deployment considerations

**Reverse-proxy buffering is the primary risk.** nginx and similar proxies buffer responses by default, which would collapse the stream into a single delivery at completion. This fails silently — correct behaviour locally, broken behaviour in production. `X-Accel-Buffering: no` is set for this reason and must be preserved through the gateway.

**Timeouts.** Platform idle-connection timeouts must exceed worst-case agent runtime. A run with no tool calls emits nothing until the `answer` event; if a host enforces a short idle limit, periodic keep-alive comments (`: ping\n\n`) will be required.

**Compression.** Response compression middleware can buffer; SSE responses should be excluded.

---

## Verification

```bash
curl -N -X POST http://localhost:8001/chat/agent/stream \
  -H "Content-Type: application/json" \
  -d '{"question":"What are the testing requirements?"}'
```

`-N` disables curl's own output buffering. Without it, all events appear at once regardless of server behaviour.

Confirmed output ordering: four `step` events (one `get_document_list`, three `search_documents`), then `answer`, then `citations` with three passages at distances 0.5461 / 0.6099 / 0.7318.

The same request through the gateway on `POST /api/chat/agent/stream` must produce identical timing and ordering. Any difference indicates buffering in the proxy layer.

---

## Known limitations

- Answer text is not incrementally streamed (see design decision above).
- No cancellation: closing the client connection does not currently abort the agent run, so the OpenAI calls complete and are billed regardless.
- No keep-alive frames; long tool calls rely on the underlying connection staying open.
- `_citations_for` re-executes retrieval rather than reusing the results the agent already received. Correct but redundant — a second embedding call and vector query per search. Worth revisiting if latency or cost becomes a concern.
