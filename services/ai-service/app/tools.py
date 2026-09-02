from langchain_core.tools import tool

from .db import pool
from .retrieval import retrieve


@tool
def search_documents(query: str, document_id: int | None = None) -> str:
    """Search the uploaded documents for text relevant to a query.

    Use this to find information needed to answer a question. If the user asks
    about several distinct topics, call this once per topic.

    Args:
        query: What to search for, phrased as a topic or question.
        document_id: Optional. Restrict the search to one document.
    """
    hits = retrieve(query, top_k=4, document_id=document_id)
    if not hits:
        return "No relevant content found."

    return "\n\n".join(
        f"[doc: {h['document_name']}, chunk {h['chunk_index']}, distance {h['distance']:.3f}]\n{h['content']}"
        for h in hits
    )


@tool
def get_document_list() -> str:
    """List the documents currently available in the system.

    Use this when the user refers to a document by name, asks what documents
    exist, or when you need to identify which document to search.
    """
    with pool.connection() as conn:
        rows = conn.execute(
            "SELECT id, original_name, status FROM documents ORDER BY id"
        ).fetchall()

    if not rows:
        return "No documents have been uploaded."

    return "\n".join(f"id={r[0]}  name={r[1]}  status={r[2]}" for r in rows)


@tool
def create_action_item(title: str, detail: str | None = None, document_id: int | None = None) -> str:
    """Save a task or follow-up item to the database.

    Use this only when the user explicitly asks to create a task, reminder,
    or action item.

    Args:
        title: A short description of the task.
        detail: Optional longer explanation.
        document_id: Optional id of a related document.
    """
    with pool.connection() as conn:
        row = conn.execute(
            "INSERT INTO action_items (title, detail, document_id) VALUES (%s, %s, %s) RETURNING id",
            (title, detail, document_id),
        ).fetchone()

    return f"Created action item {row[0]}: {title}"


TOOLS = [search_documents, get_document_list, create_action_item]