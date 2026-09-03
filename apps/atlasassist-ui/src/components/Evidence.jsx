import { X } from "lucide-react";

export default function Evidence({ turn, hoveredCitation, onHover, open, onClose }) {
  const { citations = [], toolCalls = [] } = turn || {};

  // Normalise distances across this set so the bars actually differentiate.
  const distances = citations.map((c) => c.distance);
  const min = Math.min(...distances);
  const max = Math.max(...distances);
  const span = max - min || 1;
  const closeness = (d) => 0.25 + 0.75 * (1 - (d - min) / span);

  return (
    <>
      {/* Scrim — phone/tablet only */}
      {open && (
        <button
          onClick={onClose}
          aria-label="Close sources"
          className="fixed inset-0 z-30 bg-ink/70 backdrop-blur-sm xl:hidden"
        />
      )}

      <aside
        className={`fixed inset-x-0 bottom-0 z-40 max-h-[75vh] rounded-t-2xl border-t border-rule bg-well px-6 pt-4 pb-8 overflow-y-auto flex flex-col gap-7 transition-transform duration-300 ease-out xl:static xl:z-auto xl:max-h-none xl:h-auto xl:w-85 xl:shrink-0 xl:rounded-none xl:border-t-0 xl:border-l xl:bg-well/60 xl:py-6 xl:translate-y-0 ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* Grab handle + close — phone/tablet only */}
        <div className="flex items-center justify-between xl:hidden">
          <div className="h-1 w-9 rounded-full bg-paper/20 mx-auto" />
          <button onClick={onClose} aria-label="Close sources" className="text-graphite absolute right-6">
            <X size={18} />
          </button>
        </div>

        {!turn ? (
          <div>
            <h2 className="text-[13px] font-medium">Where this came from</h2>
            <p className="text-graphite text-[12px] mt-2 leading-relaxed">
              Ask a question and the passages behind the answer appear here.
            </p>
          </div>
        ) : (
          <>
            <div>
              <h2 className="text-[13px] font-medium">Where this came from</h2>

              <div className="mt-5 flex flex-col gap-5">
                {citations.map((c) => {
                  const dim = hoveredCitation !== null && hoveredCitation !== c.n;
                  return (
                    <div
                      key={c.n}
                      onMouseEnter={() => onHover(c.n)}
                      onMouseLeave={() => onHover(null)}
                      className={`flex flex-col gap-2 transition-opacity duration-200 ${
                        dim ? "opacity-35" : "opacity-100"
                      }`}
                    >
                      <div className="flex items-baseline gap-1.5 text-[12px]">
                        <span
                          className={`wrap-break-word min-w-0 ${
                            c.n === 1 ? "text-paper" : "text-graphite"
                          }`}
                        >
                          {c.document_name}
                        </span>
                        <span className="text-graphite/60 shrink-0">passage {c.chunk_index}</span>
                        <span className="ml-auto shrink-0 tabular-nums text-[10.5px] text-graphite/50">
                          {c.distance.toFixed(3)}
                        </span>
                      </div>

                      <div className="h-0.75 w-full rounded-full bg-paper/7 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-marker transition-all duration-500 ease-out"
                          style={{
                            width: `${closeness(c.distance) * 100}%`,
                            opacity: c.n === 1 ? 1 : 0.45,
                          }}
                        />
                      </div>

                      {c.excerpt && (
                        <p
                          className={`text-[11.5px] leading-relaxed wrap-break-word ${
                            c.n === 1 ? "text-graphite" : "text-graphite/55"
                          }`}
                        >
                          {c.excerpt}…
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {toolCalls.length > 0 && (
              <div className="border-t border-rule pt-6">
                <h2 className="text-[13px] font-medium">What the assistant did</h2>
                <ol className="mt-4 flex flex-col gap-2.5">
                  {toolCalls.map((call, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-marker" />
                      <span className="text-[11.5px] text-graphite leading-normal">
                        {describe(call)}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </>
        )}
      </aside>
    </>
  );
}

function describe(call) {
  const { tool, args = {} } = call;
  if (tool === "get_document_list") return "Listed the available documents";
  if (tool === "search_documents") {
    const scope = args.document_id ? ` in document ${args.document_id}` : "";
    return `Searched “${args.query}”${scope}`;
  }
  if (tool === "create_action_item") return `Created the task “${args.title}”`;
  return tool;
}