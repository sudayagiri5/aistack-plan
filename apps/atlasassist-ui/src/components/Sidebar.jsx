import { Plus, X, Sun, Moon } from "lucide-react";
import Mark from "./Mark";

export default function Sidebar({
  documents,
  loading,
  selectedId,
  onSelect,
  onReset,
  onUpload,
  uploading,
  open,
  onClose,
  theme,
  onToggleTheme,
}) {
  return (
    <>
      {/* Scrim — phone/tablet only, closes the drawer */}
      {open && (
        <button
          onClick={onClose}
          aria-label="Close documents"
          className="fixed inset-0 z-30 bg-ink/70 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 border-r border-rule bg-well flex flex-col transition-transform duration-300 ease-out lg:static lg:z-auto lg:w-65 lg:translate-x-0 lg:bg-well/60 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 pt-6 pb-5">
          <button
            onClick={onReset}
            className="flex items-center gap-2.5 group"
            aria-label="Start a new conversation"
          >
            <Mark />
            <span className="text-[15px] font-semibold tracking-tight group-hover:text-marker transition-colors">
              AtlasAssist
            </span>
          </button>
                    <div className="flex items-center gap-1">
            <button
              onClick={onToggleTheme}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="p-1.5 rounded-md text-graphite hover:text-paper hover:bg-paper/5 transition-colors"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              onClick={onClose}
              aria-label="Close documents"
              className="p-1.5 rounded-md text-graphite hover:text-paper lg:hidden"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <nav className="px-3 flex flex-col gap-0.5 overflow-y-auto flex-1">
          <button
            onClick={() => {
              onSelect(null);
              onClose();
            }}
            className={`text-left px-3 py-2.5 rounded-md text-[13.5px] transition-colors ${
              selectedId === null
                ? "bg-paper/5 text-paper"
                : "text-graphite hover:text-paper hover:bg-paper/3"
            }`}
          >
            All documents
          </button>

          {loading
            ? [0, 1, 2].map((i) => (
                <div key={i} className="px-3 py-3">
                  <div
                    className="h-3 rounded bg-paper/6 animate-pulse"
                    style={{ width: `${70 - i * 12}%`, animationDelay: `${i * 120}ms` }}
                  />
                </div>
              ))
            : documents.map((doc) => {
                const active = selectedId === doc.id;
                return (
                  <button
                    key={doc.id}
                    onClick={() => {
                      onSelect(active ? null : doc.id);
                      onClose();
                    }}
                    className={`text-left px-3 py-2.5 rounded-md transition-colors border-l-2 ${
                      active ? "bg-paper/5 border-marker" : "border-transparent hover:bg-paper/3"
                    }`}
                  >
                    <div
                      className={`text-[13.5px] wrap-break-word ${
                        active ? "text-paper" : "text-graphite"
                      }`}
                    >
                      {doc.original_name}
                    </div>
                    <div className="text-[11.5px] text-graphite/70 mt-0.5">{doc.status}</div>
                  </button>
                );
              })}
        </nav>

        <label
          className={`mx-3 mt-3 mb-6 flex items-center justify-center gap-2 py-3 rounded-md border border-dashed text-[12.5px] transition-colors ${
            uploading
              ? "border-marker/40 text-marker cursor-wait"
              : "border-rule text-graphite hover:border-graphite/50 hover:text-paper cursor-pointer"
          }`}
        >
          {uploading ? (
            <>
              <span className="h-1 w-1 rounded-full bg-marker animate-pulse" />
              Reading document…
            </>
          ) : (
            <>
              <Plus size={14} />
              Add a document
            </>
          )}
          <input
            type="file"
            accept=".pdf,.docx,.txt,.md"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
          />
        </label>
      </aside>
    </>
  );
}