# Day 1 — AtlasAssist Architecture

## Goal
Build a full-stack AI knowledge copilot with citations.

## Core layers
- React UI: upload, chat, citations panel
- Node API: gateway, routes, orchestration
- Python AI service: chunking, embeddings, retrieval, answer generation
- Postgres + pgvector: metadata, chunks, embeddings

## Upload flow
1. User uploads file in UI
2. UI sends file to Node API
3. Node API calls AI service
4. AI service extracts text, chunks it, creates embeddings
5. Data is stored in Postgres + pgvector

## Question flow
1. User asks a question in UI
2. UI sends question to Node API
3. Node API calls AI service
4. AI service retrieves relevant chunks
5. AI service generates answer with citations
6. UI shows answer + citations

## First Node API endpoints
- GET /health
- POST /api/documents/upload
- POST /api/chat/ask

## First AI service endpoints
- GET /health
- POST /documents/process
- POST /chat/answer
