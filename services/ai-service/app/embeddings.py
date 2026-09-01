from dotenv import load_dotenv
from pathlib import Path

load_dotenv(dotenv_path=Path(__file__).resolve().parents[3] / ".env")

from openai import OpenAI

client = OpenAI()

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Convert a list of texts into a list of embedding vectors."""
    if not texts:
        return []

    response = client.embeddings.create(model=EMBEDDING_MODEL, input=texts)
    return [item.embedding for item in response.data]


def embed_query(text: str) -> list[float]:
    """Convert a single query string into one embedding vector."""
    return embed_texts([text])[0]