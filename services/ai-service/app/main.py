from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
from openai import OpenAI
from pathlib import Path

# Load environment BEFORE importing modules that read it at import time.
load_dotenv(dotenv_path=Path(__file__).resolve().parents[3] / ".env")

from .db import pool
from .chunking import extract_text, chunk_text, UnsupportedFileType, ExtractionFailed

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