# API Gateway and Agent Layer

**Services:** `atlas-api` (Node / Express), `ai-service` (Python / FastAPI)
**Status:** Implemented

## Overview

Two changes complete the backend. The Node service becomes the single public entry point, proxying question-answering to the AI service. The AI service gains an agent that selects its own retrieval strategy and can perform actions, alongside the existing fixed retrieval endpoint.

```
client ──▶ atlas-api :3000 ──▶ ai-service :8001
           (public)             (internal)
                                    │
                          ┌─────────┴─────────┐
                   /chat/answer          /chat/agent
                   (fixed pipeline)   (tool-selecting loop)
```

## Part 1 — Gateway

### Design decisions

**Single public entry point.** Clients address one service. Authentication, rate limiting, and CORS configuration have one home rather than being duplicated across every backend. The AI service can be bound to an internal network in production, removing it from the public attack surface entirely.

The gateway also decouples clients from internal topology: the AI service can be replaced, split, or scaled without any client-side change.

**Configurable upstream address.** The AI service URL is read from the environment with a local-development default. Deployment targets assign different internal hostnames; changing an environment variable is preferable to changing code.

**Validation at the boundary.** Requests are checked for a present, non-empty string question before forwarding. An invalid request that reaches the AI service consumes a network round trip, a billable embedding call, and a database query before failing. Rejecting at the edge costs nothing.

**Two distinct failure modes.** An upstream error response and an unreachable upstream are different conditions and are handled separately:

| Condition | Gateway behaviour |
|---|---|
| AI service returns a non-2xx status | Status and detail are passed through unchanged |
| AI service is unreachable | `503 Service Unavailable` |

Passing upstream statuses through preserves diagnostic information that a blanket `500` would discard. `503` is used for unreachability because the gateway itself is healthy — the distinction matters to monitoring and to client retry logic.

### API

#### `POST /api/chat/ask`

| Field | Type | Default | Purpose |
|---|---|---|---|
| `question` | string | — | The query. Required, non-empty. |
| `document_id` | integer \| null | `null` | Restrict retrieval to one document. |
| `top_k` | integer | `4` | Number of chunks to retrieve. |

```bash
curl -X POST http://localhost:3000/api/chat/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What are the testing requirements?"}'
```

Response matches `/chat/answer` on the AI service — answer text plus a citations array.

**Errors**

| Status | Condition |
|---|---|
| `400` | Missing, non-string, or empty question. |
| `4xx` / `5xx` | Passed through from the AI service. |
| `503` | AI service unreachable. |

### Verification

Three paths were exercised: a successful query returning an answer with citations; a whitespace-only question returning `400` with no downstream request issued; and a query with the AI service stopped, returning `503` rather than hanging or reporting a generic server error.

## Part 2 — Agent

### Design decisions

**Agent alongside fixed retrieval, not replacing it.** Both endpoints are retained. The fixed pipeline is faster and cheaper for straightforward questions and provides a fallback when agent behaviour is unsuitable. Keeping both also permits direct comparison of the two strategies on identical input.

**Tool descriptions as behavioural specification.** Each tool's docstring and type signature are serialised into the model's tool schema. They are the mechanism by which the model decides when and how to invoke a tool, and are written accordingly — the instruction to search per-topic for multi-part questions, and the restriction that action items be created only on explicit request, both live in docstrings rather than in code.

**Deterministic sampling.** Temperature is set to zero. Document question-answering should be reproducible; variance in phrasing offers no benefit and undermines confidence in repeated queries.

**Tool-call tracing.** The agent's execution is unpacked into a list of tool invocations with their arguments, returned alongside the answer. Without this the agent is opaque — the trace makes retrieval strategy inspectable, supports debugging, and is a prerequisite for surfacing reasoning in the user interface.

**Tools return formatted text.** Results are rendered as readable strings including source document, chunk index, and retrieval distance, so the model can assess relevance rather than treating all returned material as equally authoritative.

### Tools

| Tool | Parameters | Purpose |
|---|---|---|
| `search_documents` | `query`, optional `document_id` | Semantic retrieval over chunks. Wraps the existing retrieval module. |
| `get_document_list` | — | Enumerates documents with identifiers and processing status. |
| `create_action_item` | `title`, optional `detail`, optional `document_id` | Persists a task. |

`search_documents` introduces no new retrieval capability; the agent gains control over *when* it is called and *with what query*, which is the substantive change.

### Schema

```sql
CREATE TABLE IF NOT EXISTS action_items (
  id          SERIAL PRIMARY KEY,
  title       TEXT        NOT NULL,
  detail      TEXT,
  document_id INTEGER     REFERENCES documents(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`ON DELETE SET NULL` is used rather than `CASCADE`, in deliberate contrast to the chunks table. A chunk has no meaning independent of its document; an action item does — a task to review a policy remains a valid task after the document is removed. The reference is cleared rather than the row destroyed, and `document_id` is nullable because a task need not relate to any document.

### API

#### `POST /chat/agent`

```bash
curl -X POST http://localhost:8001/chat/agent \
  -H "Content-Type: application/json" \
  -d '{"question": "What are the testing requirements before deployment?"}'
```

**Response — `200 OK`**

```json
{
  "question": "...",
  "answer": "...",
  "tool_calls": [
    { "tool": "get_document_list", "args": {} },
    { "tool": "search_documents", "args": { "query": "testing requirements", "document_id": 4 } }
  ]
}
```

**Errors**

| Status | Condition |
|---|---|
| `500` | Agent execution failed. Detail is logged server-side. |

## Observed behaviour

Three capabilities distinguish the agent from the fixed pipeline, each verifiable through the returned trace.

**Strategy selection.** Asked a general question, the agent enumerated available documents and issued a separate scoped search against each before synthesising. The resulting answer covered substantially more of the source material than a single top-*k* retrieval surfaced. No part of this sequence is prescribed in code.

**Document scoping.** When a document is named in the question, the agent resolves the name to an identifier via the listing tool and passes that identifier to the search. The constraint is enforced at the database layer — the retrieval query filters on `document_id`, so out-of-scope chunks cannot be returned regardless of model behaviour.

**Query decomposition.** A compound question produced two searches with distinct query strings, one per topic, and a sectioned answer. The fixed pipeline cannot achieve this: a compound question embeds to a single vector positioned between its constituent topics, matching neither well.

**Action execution.** An explicit request to create a task resulted in a single `create_action_item` call with a title and detail composed from the request, and a corresponding database row. No retrieval was performed, consistent with the tool's stated usage constraint.

## Known limitations

- **Cost and latency.** The agent issues multiple sequential model and embedding calls. In one observed case it searched three documents individually where a single unscoped search would have sufficed. Fixed retrieval remains preferable for simple queries.
- **Non-determinism in strategy.** Tool selection is model-driven and not guaranteed. Instructions are followed reliably but not invariably; the trace is the means of detecting deviation.
- **No conflict resolution.** Where multiple documents contain contradictory statements on a topic, the agent has no basis for preferring one. Document versioning or recency metadata would be required.
- **No conversation memory.** Each request is independent; follow-up questions cannot reference prior turns.
- **Single-model tool selection.** `gpt-4o-mini` is used for both reasoning and answer composition. A larger model would select tools more reliably at higher cost.

## Next stage

A React interface consuming the gateway, presenting document management, conversational question-answering, and citation display.
