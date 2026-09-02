from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
from openai import OpenAI
from pathlib import Path

# Load environment BEFORE importing modules that read it at import time.
load_dotenv(dotenv_path=Path(__file__).resolve().parents[3] / ".env")

from .retrieval import retrieve, ANSWER_MODEL, SYSTEM_PROMPT
from .embeddings import embed_texts
from .db import pool
from .chunking import extract_text, chunk_text, UnsupportedFileType, ExtractionFailed
from .agent import run_agent

client = OpenAI()

app = FastAPI(title="AI Service")

@app.get("/health")
def health():
    return {"status": "ok", "service": "ai-service"}

class SummarizeRequest(BaseModel):
    text: str

@app.post("/summarize")
def summarize(req: SummarizeRequest):
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a concise summarizer. Summarize the text in 2-3 sentences."},
            {"role": "user", "content": req.text},
        ],
    )
    return {"summary": response.choices[0].message.content}

class ProcessRequest(BaseModel):
    document_id: int


@app.post("/process")
def process(req: ProcessRequest):
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT stored_path FROM documents WHERE id = %s", (req.document_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Document not found")

        conn.execute(
            "UPDATE documents SET status = 'processing' WHERE id = %s", (req.document_id,)
        )

    try:
        text = extract_text(row[0])
    except (UnsupportedFileType, ExtractionFailed) as e:
        with pool.connection() as conn:
            conn.execute(
                "UPDATE documents SET status = 'failed' WHERE id = %s", (req.document_id,)
            )
        status = 415 if isinstance(e, UnsupportedFileType) else 422
        raise HTTPException(status_code=status, detail=str(e))
    chunks = chunk_text(text)

    if not chunks:
        with pool.connection() as conn:
            conn.execute(
                "UPDATE documents SET status = 'failed' WHERE id = %s", (req.document_id,)
            )
        raise HTTPException(status_code=422, detail="No extractable text found")

    with pool.connection() as conn:
        for i, content in enumerate(chunks):
            conn.execute(
                "INSERT INTO chunks (document_id, chunk_index, content) VALUES (%s, %s, %s)",
                (req.document_id, i, content),
            )
        conn.execute(
            "UPDATE documents SET status = 'ready' WHERE id = %s", (req.document_id,)
        )

    return {"document_id": req.document_id, "chunks_created": len(chunks)}

class EmbedRequest(BaseModel):
    document_id: int


@app.post("/embed")
def embed(req: EmbedRequest):
    with pool.connection() as conn:
        rows = conn.execute(
            "SELECT id, content FROM chunks WHERE document_id = %s AND embedding IS NULL ORDER BY chunk_index",
            (req.document_id,),
        ).fetchall()

    if not rows:
        return {"document_id": req.document_id, "embedded": 0, "detail": "nothing to embed"}

    ids = [r[0] for r in rows]
    texts = [r[1] for r in rows]

    vectors = embed_texts(texts)

    with pool.connection() as conn:
        for chunk_id, vector in zip(ids, vectors):
            conn.execute(
                "UPDATE chunks SET embedding = %s WHERE id = %s",
                (str(vector), chunk_id),
            )

    return {"document_id": req.document_id, "embedded": len(vectors)}
class AnswerRequest(BaseModel):
    question: str
    document_id: int | None = None
    top_k: int = 4


@app.post("/chat/answer")
def answer(req: AnswerRequest):
    hits = retrieve(req.question, top_k=req.top_k, document_id=req.document_id)

    if not hits:
        raise HTTPException(status_code=404, detail="No embedded content to search")

    context = "\n\n".join(
        f"[{i + 1}] (from {h['document_name']}, chunk {h['chunk_index']})\n{h['content']}"
        for i, h in enumerate(hits)
    )

    response = client.chat.completions.create(
        model=ANSWER_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {req.question}"},
        ],
    )

    return {
        "question": req.question,
        "answer": response.choices[0].message.content,
        "citations": [
            {
                "n": i + 1,
                "document_name": h["document_name"],
                "chunk_index": h["chunk_index"],
                "distance": round(h["distance"], 4),
            }
            for i, h in enumerate(hits)
        ],
    }
class AgentRequest(BaseModel):
    question: str


@app.post("/chat/agent")
def chat_agent(req: AgentRequest):
    try:
        result = run_agent(req.question)
    except Exception as e:
        print("Agent failed:", e)
        raise HTTPException(status_code=500, detail="Agent execution failed")

    return {
        "question": req.question,
        "answer": result["answer"],
        "tool_calls": result["tool_calls"],
    }