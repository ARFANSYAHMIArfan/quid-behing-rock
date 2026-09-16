import { useEffect, useState } from "react";
import { Inbox, X } from "lucide-react";

export default function QuickCapture() {
  const [isOpen, setIsOpen] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24">
      <div 
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity" 
        onClick={() => setIsOpen(false)}
      />
      <div className="relative w-full max-w-xl transform rounded-xl bg-white p-4 shadow-2xl ring-1 ring-black/5 transition-all">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-slate-700">
            <Inbox className="h-5 w-5" />
            <h2 className="text-sm font-semibold">Quick Capture</h2>
          </div>
          <button 
            onClick={() => setIsOpen(false)}
            className="text-slate-400 hover:text-slate-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="pt-4">
          <textarea
            autoFocus
            className="w-full resize-none bg-transparent text-slate-900 placeholder-slate-400 focus:outline-none sm:text-sm"
            rows={4}
            placeholder="What's on your mind? (Note, task, or thought)..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="text-xs text-slate-500">
            Press <kbd className="rounded bg-slate-100 px-1 font-sans">Enter</kbd> to save
          </span>
          <button 
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            onClick={() => {
              console.log("Captured:", note);
              setNote("");
              setIsOpen(false);
            }}
          >
            Save to Inbox
          </button>
        </div>
      </div>
    </div>
  );
}
