from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from .retrieval import retrieve

from .tools import TOOLS

AGENT_MODEL = "gpt-4o-mini"

AGENT_SYSTEM_PROMPT = """You are AtlasAssist, an assistant that answers questions about the user's uploaded documents.

Rules:
- Answer only from information returned by your tools. Never use prior knowledge about the world.
- Always call search_documents WITHOUT a document_id. Never guess which document is relevant — search everything.
- If the user asks about several distinct topics, search for each topic separately.
- If the tools return nothing relevant, say plainly that the documents do not contain the answer.
- Always state which document and passage each part of your answer came from.
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
    citations = _citations_for(trace, question)

    return {"answer": answer, "tool_calls": trace, "citations": citations}
def stream_agent(question: str):
    """Yield events as the agent works: tool calls first, then the answer, then sources."""
    trace = []
    answer = ""

    for chunk in agent.stream(
        {"messages": [{"role": "user", "content": question}]},
        stream_mode="updates",
    ):
        for node_output in chunk.values():
            for message in node_output.get("messages", []):
                for call in getattr(message, "tool_calls", []) or []:
                    step = {"tool": call["name"], "args": call["args"]}
                    trace.append(step)
                    yield {"type": "step", "step": step}

                content = getattr(message, "content", "")
                if content and not getattr(message, "tool_calls", None):
                    answer = content

    yield {"type": "answer", "answer": answer}
    yield {"type": "citations", "citations": _citations_for(trace, question)}


def _citations_for(trace, question):
    """Replay the agent's searches to collect the passages behind its answer."""
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
    return citations