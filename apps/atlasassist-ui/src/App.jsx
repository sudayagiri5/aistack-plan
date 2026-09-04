import { useState, useEffect, useRef, useCallback } from "react";
import { FileText, ArrowUp, PanelLeft, ListTree } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { api } from "./lib/api";
import Sidebar from "./components/Sidebar";
import Evidence from "./components/Evidence";

const md = {
  p: ({ children }) => <p>{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-paper">{children}</strong>,
  ol: ({ children }) => (
    <ol className="flex flex-col gap-3 list-decimal pl-6 marker:text-graphite marker:text-[15px]">
      {children}
    </ol>
  ),
  ul: ({ children }) => (
    <ul className="flex flex-col gap-3 list-disc pl-6 marker:text-graphite">{children}</ul>
  ),
  li: ({ children }) => <li className="pl-1">{children}</li>,
  code: ({ children }) => (
    <code className="font-sans text-[15px] bg-paper/8 rounded px-1.5 py-0.5">{children}</code>
  ),
};

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState([]);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState(null);
  const [hoveredCitation, setHoveredCitation] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [selectedTurnId, setSelectedTurnId] = useState(null);
  const [liveSteps, setLiveSteps] = useState([]);
  const [navOpen, setNavOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
    const [theme, setTheme] = useState(
    () => localStorage.getItem("atlas-theme") ?? "dark"
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("atlas-theme", theme);
  }, [theme]);
  const scrollRef = useRef(null);

  useEffect(() => {
    api
      .listDocuments()
      .then(setDocuments)
      .catch(() => setDocuments([]))
      .finally(() => setLoadingDocs(false));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, thinking]);

    const ask = useCallback(async () => {
    const question = input.trim();
    if (!question || thinking) return;

    setInput("");
    setError(null);
    setSelectedTurnId(null);
    setLiveSteps([]);
    setThinking(true);

    try {
      if (selectedId) {
        // Scoped questions use fixed retrieval — fast enough not to need streaming.
        const data = await api.ask(question, selectedId);
        setTurns((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            question,
            answer: data.answer,
            citations: data.citations ?? [],
            toolCalls: [],
          },
        ]);
      } else {
        let answer = "";
        let citations = [];
        const toolCalls = [];

        await api.askAgentStream(question, (event) => {
          if (event.type === "step") {
            toolCalls.push(event.step);
            setLiveSteps((prev) => [...prev, event.step]);
          } else if (event.type === "answer") {
            answer = event.answer;
          } else if (event.type === "citations") {
            citations = event.citations;
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        });

        setTurns((prev) => [
          ...prev,
          { id: crypto.randomUUID(), question, answer, citations, toolCalls },
        ]);
      }
    } catch (e) {
      setError(e.message);
      setInput(question);
    } finally {
      setThinking(false);
      setLiveSteps([]);
    }
  }, [input, thinking, selectedId]);

  async function handleUpload(file) {
    setUploading(true);
    setError(null);
    try {
      const doc = await api.upload(file);
      setDocuments((prev) => [doc, ...prev]);
      await api.process(doc.id);
      setDocuments(await api.listDocuments());
    } catch (e) {
      setError(e.message);
      const fresh = await api.listDocuments().catch(() => null);
      if (fresh) setDocuments(fresh);
    } finally {
      setUploading(false);
    }
  }

  const reset = () => {
    setTurns([]);
    setError(null);
    setSelectedId(null);
    setSelectedTurnId(null);
    setNavOpen(false);
  };

  const shownTurn = turns.find((t) => t.id === selectedTurnId) ?? turns[turns.length - 1];
  const selectedDoc = documents.find((d) => d.id === selectedId);

  return (
    <div className="flex h-dvh">
      <Sidebar
        documents={documents}
        loading={loadingDocs}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onReset={reset}
        onUpload={handleUpload}
        uploading={uploading}
        open={navOpen}
        onClose={() => setNavOpen(false)}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      />

      <main className="flex-1 flex flex-col bg-paper/[0.012] min-w-0">
        {/* Compact header — hidden once both panels are permanent */}
        <header className="flex items-center justify-between border-b border-rule px-4 py-3 xl:hidden">
          <button
            onClick={() => setNavOpen(true)}
            aria-label="Open documents"
            className="flex items-center gap-2 text-graphite hover:text-paper transition-colors lg:invisible"
          >
            <PanelLeft size={18} />
            <span className="text-[13px]">
              {selectedDoc ? selectedDoc.original_name : "All documents"}
            </span>
          </button>
          <button
            onClick={() => setSourcesOpen(true)}
            disabled={!shownTurn}
            aria-label="Show sources"
            className="flex items-center gap-1.5 text-graphite hover:text-paper transition-colors disabled:opacity-30"
          >
            <ListTree size={17} />
            <span className="text-[13px]">Sources</span>
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-8 sm:px-10 lg:px-16 lg:py-12">
          {turns.length === 0 && !thinking && (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <FileText size={20} className="mx-auto text-graphite/40 mb-3" />
                <p className="text-graphite text-sm">
                  {documents.length} document{documents.length === 1 ? "" : "s"} indexed
                </p>
              </div>
            </div>
          )}

          <div className="mx-auto max-w-160 flex flex-col gap-14 lg:gap-16">
            {turns.map((turn) => {
              const isShown = shownTurn?.id === turn.id;
              return (
                <article key={turn.id} className="flex flex-col gap-4 lg:gap-5">
                  <p className="text-graphite text-[13px] sm:text-sm wrap-break-word">{turn.question}</p>

                  <div className="font-serif text-[17px] leading-relaxed sm:text-[19px] sm:leading-[1.65] text-paper flex flex-col gap-4 wrap-break-word">
                    <ReactMarkdown components={md}>{turn.answer}</ReactMarkdown>
                  </div>

                  {turn.citations.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      {turn.citations.map((c) => (
                        <button
                          key={c.n}
                          onClick={() => {
                            setSelectedTurnId(turn.id);
                            setSourcesOpen(true);
                          }}
                          onMouseEnter={() => isShown && setHoveredCitation(c.n)}
                          onMouseLeave={() => setHoveredCitation(null)}
                          className={`flex max-w-full items-center gap-1.5 rounded px-2.5 py-1 transition-colors select-none ${
                            isShown && hoveredCitation === c.n
                              ? "bg-marker/25"
                              : isShown
                              ? "bg-marker/12"
                              : "bg-paper/5 hover:bg-marker/12"
                          }`}
                        >
                          <span
                            className={`text-[11px] font-medium shrink-0 ${
                              isShown ? "text-marker" : "text-graphite"
                            }`}
                          >
                            {c.n}
                          </span>
                          <span className="text-[11px] text-graphite truncate">
                            {c.document_name} · {c.chunk_index}
                          </span>
                        </button>
                      ))}
                      {!isShown && (
                        <span className="text-[11px] text-graphite/50 ml-1">
                          click to show sources
                        </span>
                      )}
                    </div>
                  )}
                </article>
              );
            })}

                        {thinking && (
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-2.5">
                  {liveSteps.map((step, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      <span className="h-1 w-1 shrink-0 rounded-full bg-marker" />
                      <span className="text-graphite text-xs">{describeStep(step)}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2.5">
                    <span className="h-1 w-1 shrink-0 rounded-full bg-marker animate-pulse" />
                    <span className="text-graphite text-xs">
                      {selectedDoc
                        ? `Searching ${selectedDoc.original_name}…`
                        : liveSteps.length === 0
                        ? "Choosing where to look…"
                        : "Writing the answer…"}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-3.5">
                  {[100, 94, 78].map((w, i) => (
                    <div
                      key={i}
                      className="h-2.5 rounded bg-paper/6 animate-pulse"
                      style={{ width: `${w}%`, animationDelay: `${i * 140}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="px-5 pb-6 sm:px-10 lg:px-16 lg:pb-10">
          <div className="mx-auto max-w-160">
            {error && (
              <p className="text-[12px] text-red-400/80 mb-3" role="alert">
                {error}
              </p>
            )}
            <div className="flex items-end gap-3 rounded-lg border border-rule bg-paper/4 px-4 py-3.5 focus-within:border-graphite/40 transition-colors">
              <textarea
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask();
                  }
                }}
                placeholder={
                  selectedDoc ? `Ask about ${selectedDoc.original_name}` : "Ask about your documents"
                }
                className="flex-1 resize-none bg-transparent text-[15px] sm:text-sm text-paper placeholder:text-graphite outline-none field-sizing-content max-h-32"
              />
              <button
                onClick={ask}
                disabled={!input.trim() || thinking}
                aria-label="Send question"
                className="shrink-0 rounded-md bg-marker p-1.5 text-ink transition-opacity hover:bg-marker/90 disabled:cursor-not-allowed disabled:opacity-25"
              >
                <ArrowUp size={15} />
              </button>
            </div>
          </div>
        </div>
      </main>

      <Evidence
        turn={shownTurn}
        hoveredCitation={hoveredCitation}
        onHover={setHoveredCitation}
        open={sourcesOpen}
        onClose={() => setSourcesOpen(false)}
      />
    </div>
  );
}
function describeStep(call) {
  const { tool, args = {} } = call;
  if (tool === "get_document_list") return "Listed the available documents";
  if (tool === "search_documents") {
    const scope = args.document_id ? ` in document ${args.document_id}` : "";
    return `Searched “${args.query}”${scope}`;
  }
  if (tool === "create_action_item") return `Created the task “${args.title}”`;
  return tool;
}