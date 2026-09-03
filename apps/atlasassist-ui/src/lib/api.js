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
};