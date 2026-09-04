const json = { "Content-Type": "application/json" };

async function post(url, body) {
  const res = await fetch(url, { method: "POST", headers: json, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const api = {
  listDocuments: async () => {
    const res = await fetch("/api/documents");
    if (!res.ok) throw new Error("Could not load documents");
    return res.json();
  },

  ask: (question, documentId) => post("/api/chat/ask", { question, document_id: documentId }),

  askAgent: (question) => post("/api/chat/agent", { question }),

  upload: async (file) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/documents", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    return data;
  },

  process: async (documentId) => {
    const res = await fetch("/api/documents/" + documentId + "/process", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Processing failed");
    return data;
  },

  askAgentStream: async (question, onEvent) => {
    const res = await fetch("/api/chat/agent/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });

    if (!res.ok || !res.body) throw new Error("Could not start the stream");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const messages = buffer.split("\n\n");
      buffer = messages.pop() ?? "";

      for (const message of messages) {
        const line = message.trim();
        if (!line.startsWith("data:")) continue;
        try {
          onEvent(JSON.parse(line.slice(5).trim()));
        } catch {
          // ignore malformed fragments
        }
      }
    }
  },
};