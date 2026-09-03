# Web Interface

**Application:** `atlasassist-ui` (React / Vite)
**Status:** Implemented

## Overview

A single-page interface for document upload, conversational question-answering, and inspection of retrieval evidence. It consumes the Node gateway exclusively; the AI service is never addressed directly from the browser.

```
┌──────────┬─────────────────────────┬──────────────┐
│ Documents│   Conversation          │  Evidence    │
│          │                         │              │
│ upload   │   question (sans)       │  passages    │
│ select   │   answer  (serif)       │  distances   │
│ theme    │   citation chips        │  excerpts    │
│          │   composer              │  agent trace │
└──────────┴─────────────────────────┴──────────────┘
```

The layout collapses to a single column with overlay panels below 1280px.

## Design decisions

### Product interface, not marketing page

The visual language derives from working software — restrained motion, tight spacing, a single accent — rather than from promotional web design. Sessions are long and reading-oriented; scroll-triggered animation and decorative motion would be friction rather than polish.

Motion is limited to states that respond to user action: hover linking between citations and evidence, panel transitions, and a loading skeleton. Nothing animates on scroll or on entry.

### Evidence as the organising subject

Retrieval quality is the substance of the product, so it receives dedicated screen area rather than being hidden behind a disclosure. The panel shows every retrieved passage with its source document, chunk index, cosine distance, and a leading excerpt — plus, for agent-answered questions, the sequence of tool calls rendered as prose.

The accent colour is reserved exclusively for evidence — citation chips, distance bars, trace markers, and the active document indicator. No other element uses it, so its appearance reliably signals provenance.

### Serif for answer text

Answers are set in a serif face at a measure of roughly 65 characters; interface chrome uses a sans. The product's subject is document reading, and the typographic distinction reinforces that answers are prose to be read rather than chat messages to be skimmed.

### Distance normalisation within a result set

Raw cosine distances for a single query cluster narrowly — typically 0.40 to 0.55 for relevant passages. Plotting `1 − distance` directly produces bars that differ by only a few percent and communicate nothing.

Bars are therefore normalised across the returned set, so the closest passage renders full-width and the furthest at a 25% floor. The raw value is displayed numerically alongside, preserving the absolute measure.

Because normalisation is per-set, evidence from different turns cannot be meaningfully combined — which is why the panel displays one turn at a time rather than accumulating.

### Turn selection for evidence

The panel defaults to the most recent turn. Citation chips are interactive: selecting any chip switches the panel to that turn's evidence, and chip colouring indicates which turn is currently displayed.

Without this, scrolling back to an earlier answer leaves the panel showing unrelated sources — a misleading pairing in a product whose purpose is verifiable attribution.

### Retrieval strategy follows document selection

With a document selected, questions route to fixed retrieval; with no selection, they route to the agent. Selecting a document supplies the information the agent would otherwise spend a tool call establishing, so the additional latency and cost are avoidable.

This surfaces the fixed-versus-agentic trade-off as product behaviour rather than a hidden default, and allows the loading state to describe what is actually happening — a named document being searched, versus a strategy being chosen.

### Themes via token indirection

Tailwind colour tokens resolve to CSS custom properties rather than fixed values. A `data-theme` attribute on the document root swaps the property values, so both themes are supported without conditional styling in any component.

Token names describe role rather than appearance — the primary text token is light in the dark theme and dark in the light theme. The accent darkens substantially in the light theme, since contrast requirements invert.

### Development proxy over CORS configuration

The dev server proxies `/api` to the gateway, so the browser issues only same-origin requests. This avoids cross-origin configuration during development and keeps request paths relative, so the same code works when both are served from one domain in production.

### Optimistic rendering on upload

An uploaded document is inserted into the sidebar immediately on successful upload, before extraction and embedding complete. The list is refetched afterwards to reconcile with the server's authoritative status.

Processing takes several seconds; without the optimistic insert the interface would appear unresponsive for the duration.

## Backend changes

Four changes were required to support the interface.

| Change | Rationale |
|---|---|
| `POST /api/documents/:id/process` | The interface needs one call to complete extraction and embedding. Previously these were separate manual steps. |
| `POST /api/chat/agent` on the gateway | The agent endpoint was previously reachable only on the AI service directly. |
| Excerpts added to citation payloads | The evidence panel displays leading text from each passage; the API previously returned only identifiers and distances. |
| Agent responses include citations | The agent returned tool calls but no sources. Retrieval is now replayed against the agent's own search queries, deduplicated, and returned. |

### Reprocessing made idempotent

`POST /process` previously violated the uniqueness constraint on `(document_id, chunk_index)` when run against an already-processed document — surfacing during upload testing, since the endpoint is now called automatically.

Existing chunks are deleted before insertion. Reprocessing consequently discards embeddings and requires regeneration, which is correct: changed text invalidates prior vectors.

### Relevance threshold

Retrieval discards results beyond a cosine distance of 0.75.

Prior to this, `top_k` results were returned regardless of quality, so unrelated documents appeared as citations on questions they had no bearing on — observed at distance 0.886 against a query with genuine matches at 0.417.

The threshold is empirical, derived from observed distributions across test queries: relevant passages fall between 0.35 and 0.55, unrelated ones between 0.70 and 0.89. It is specific to this corpus and embedding model and would require retuning if either changed.

Queries returning no results within threshold now receive an explicit statement of absence rather than a `404`, since "nothing sufficiently relevant" is a valid outcome rather than an error condition.

## Responsive behaviour

| Width | Documents | Evidence |
|---|---|---|
| < 1024px | Overlay drawer | Bottom sheet |
| 1024–1279px | Static column | Bottom sheet |
| ≥ 1280px | Static column | Static column |

The two panels use different breakpoints deliberately. At tablet widths there is room for one persistent side panel but not two without compressing the conversation below a usable measure.

Both overlays share a dismissable scrim and slide transitions, and both are the same components as their static counterparts — position and transform are switched by breakpoint prefix rather than by conditional rendering.

Additional small-screen handling: dynamic viewport height for the layout root, so the composer is not obscured by mobile browser chrome; a 15px minimum input font size, below which iOS Safari zooms on focus; and automatic panel dismissal on selection.

Text originating outside the application — filenames, user input, document content — is subject to word breaking, since unbroken strings otherwise force horizontal overflow.

## Structure

```
src/
├── lib/api.js              network layer
├── components/
│   ├── Mark.jsx            brand glyph
│   ├── Sidebar.jsx         documents, upload, theme
│   └── Evidence.jsx        sources and agent trace
├── App.jsx                 state, conversation, composer
└── index.css               tokens and themes
```

All network access is confined to `lib/api.js`. Components receive data and callbacks as props and perform no fetching, so endpoint or transport changes are isolated to one module.

## Known limitations

- **No persistence.** Conversations are held in component state and do not survive reload. Requires `conversations` and `messages` tables with associated endpoints.
- **No conversation memory.** Each question is answered independently; follow-up questions cannot reference prior turns.
- **No multi-user isolation.** All visitors share one document corpus. Anonymous session scoping — a client-generated identifier filtering every query — would provide isolation without authentication, and is the intended next step for a public deployment.
- **No document deletion.** Documents can be added but not removed.
- **No streaming.** Answers appear only on completion; agent responses take 10–20 seconds.
- **Client-side rate limiting absent.** Upload size and request frequency are unconstrained. Provider-level spend limits are configured as a backstop.

## Next stage

Streaming responses, so answer text renders progressively rather than on completion.
