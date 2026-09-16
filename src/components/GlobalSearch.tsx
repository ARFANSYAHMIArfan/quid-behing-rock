import { useEffect, useState } from "react";
import { Search, FileText, MessageSquare, X } from "lucide-react";
import { SearchEngine, SearchResult } from "../services/SearchEngine";
import { cn } from "../lib/utils";

export default function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    // Initialize the Web Worker on mount
    SearchEngine.init();

    // Inject some mock decrypted data into the search engine for demonstration
    SearchEngine.indexDocument({
      id: "doc-1",
      title: "Project Architecture.pdf",
      content: "The system is built on a Zero-Trust architecture with End-to-End Encryption (AES-256-GCM).",
      type: "document"
    });
    SearchEngine.indexDocument({
      id: "note-1",
      title: "Meeting Notes",
      content: "Discussed the implementation of Web Workers for the local search engine and LRU caching for blobs.",
      type: "note"
    });

    const down = (e: KeyboardEvent) => {
      // CMD+J or CTRL+J for Search
      if (e.key === "j" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen((open) => !open);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    const performSearch = async () => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }
      setIsSearching(true);
      const res = await SearchEngine.search(query);
      setResults(res);
      setIsSearching(false);
    };

    const timer = setTimeout(performSearch, 300);
    return () => clearTimeout(timer);
  }, [query]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-16 sm:pt-24">
      <div 
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity" 
        onClick={() => setIsOpen(false)}
      />
      <div className="relative w-full max-w-2xl transform overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5 transition-all">
        <div className="flex items-center border-b border-slate-100 px-4">
          <Search className="h-5 w-5 text-slate-400" />
          <input
            autoFocus
            className="flex-1 border-0 bg-transparent px-4 py-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 sm:text-sm"
            placeholder="Search decrypted documents & notes locally..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
          {query.trim().length > 0 && results.length === 0 && !isSearching && (
            <div className="p-4 text-center text-sm text-slate-500">
              No results found.
            </div>
          )}
          
          {results.length > 0 && (
            <ul className="space-y-1">
              {results.map((res) => (
                <li key={res.id}>
                  <button className="flex w-full items-start gap-3 rounded-lg px-4 py-3 text-left hover:bg-slate-50 focus:bg-slate-50 focus:outline-none">
                    <div className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                      res.type === "document" ? "bg-emerald-100 text-emerald-600" : "bg-blue-100 text-blue-600"
                    )}>
                      {res.type === "document" ? <FileText className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <h4 className="truncate text-sm font-medium text-slate-900">{res.title}</h4>
                      <p className="truncate text-xs text-slate-500">{res.content}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!query && (
            <div className="p-4 text-center">
              <p className="text-xs text-slate-400">
                Search runs entirely on your device using a Web Worker. Your decrypted data is never sent to the cloud.
              </p>
            </div>
          )}
        </div>
        
        <div className="flex flex-wrap items-center bg-slate-50 px-4 py-2.5 text-xs text-slate-500 border-t border-slate-100 gap-4">
          <span className="flex items-center gap-1">
            <kbd className="rounded bg-white px-1 font-sans border border-slate-200">↑</kbd>
            <kbd className="rounded bg-white px-1 font-sans border border-slate-200">↓</kbd>
            to navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded bg-white px-1 font-sans border border-slate-200">Enter</kbd>
            to select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded bg-white px-1 font-sans border border-slate-200">ESC</kbd>
            to close
          </span>
        </div>
      </div>
    </div>
  );
}
