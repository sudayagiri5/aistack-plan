from .db import pool
from .embeddings import embed_query

ANSWER_MODEL = "gpt-4o-mini"

SYSTEM_PROMPT = """You answer questions using only the provided context.
If the context does not contain the answer, say so plainly — do not guess.
Cite the chunks you used by their [n] numbers."""


def retrieve(question: str, top_k: int = 4, document_id: int | None = None):
    """Return the top_k chunks most similar in meaning to the question."""
    query_vector = str(embed_query(question))

    sql = """
        SELECT c.id, c.document_id, c.chunk_index, c.content, d.original_name,
               c.embedding <=> %s AS distance
        FROM chunks c
        JOIN documents d ON d.id = c.document_id
        WHERE c.embedding IS NOT NULL
    """
    params = [query_vector]

    if document_id is not None:
        sql += " AND c.document_id = %s"
        params.append(document_id)

    sql += " ORDER BY distance LIMIT %s"
    params.append(top_k)

    with pool.connection() as conn:
        rows = conn.execute(sql, params).fetchall()

    return [
        {
            "chunk_id": r[0],
            "document_id": r[1],
            "chunk_index": r[2],
            "content": r[3],
            "document_name": r[4],
            "distance": float(r[5]),
        }
        for r in rows
    ]