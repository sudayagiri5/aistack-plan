from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent

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
    """Run the agent on a question and return the answer plus a trace of tool calls."""
    result = agent.invoke({"messages": [{"role": "user", "content": question}]})

    messages = result["messages"]
    answer = messages[-1].content

    trace = []
    for m in messages:
        for call in getattr(m, "tool_calls", []) or []:
            trace.append({"tool": call["name"], "args": call["args"]})

    return {"answer": answer, "tool_calls": trace}