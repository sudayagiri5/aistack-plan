from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from .retrieval import retrieve

from .tools import TOOLS

AGENT_MODEL = "gpt-4o-mini"

AGENT_SYSTEM_PROMPT = """You are AtlasAssist, an assistant that answers questions about the user's uploaded documents.

Rules:
- Answer only from information returned by your tools. Never use prior knowledge about the world.
- If the tools return nothing relevant, say plainly that the documents do not contain the answer.
- If the user asks about several distinct topics, search for each topic separately.
- If the user names a specific document, list the documents first to find its id, then search within that document only.
- Always state which document and chunk each part of your answer came from.
- Only create an action item when the user explicitly asks for a task or reminder."""

llm = ChatOpenAI(model=AGENT_MODEL, temperature=0)

agent = create_react_agent(llm, TOOLS, prompt=AGENT_SYSTEM_PROMPT)

def run_agent(question: str) -> dict:
    """Run the agent, returning the answer, tool calls, and retrieved sources."""
    result = agent.invoke({"messages": [{"role": "user", "content": question}]})

    messages = result["messages"]
    answer = messages[-1].content

    trace = []
    for m in messages:
        for call in getattr(m, "tool_calls", []) or []:
            trace.append({"tool": call["name"], "args": call["args"]})

    # Re-run retrieval on the agent's own search queries so the UI can show sources.
    seen, citations = set(), []
    for call in trace:
        if call["tool"] != "search_documents":
            continue
        args = call["args"]
        for hit in retrieve(args.get("query", question), top_k=3,
                            document_id=args.get("document_id")):
            key = (hit["document_id"], hit["chunk_index"])
            if key in seen:
                continue
            seen.add(key)
            citations.append({
                "document_name": hit["document_name"],
                "chunk_index": hit["chunk_index"],
                "distance": round(hit["distance"], 4),
                "excerpt": hit["content"][:180].strip(),
            })

    citations.sort(key=lambda c: c["distance"])
    citations = citations[:4]
    for i, c in enumerate(citations):
        c["n"] = i + 1

    return {"answer": answer, "tool_calls": trace, "citations": citations}