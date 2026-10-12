import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useVaultRecords } from "../hooks/useVaultRecords";
export default function QuickCapture() {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { save } = useVaultRecords("note");
  useEffect(() => {
    const show = () => setOpen(true);
    const key = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("workspace:capture", show);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("workspace:capture", show);
      document.removeEventListener("keydown", key);
    };
  }, []);
  async function capture() {
    if (!note.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await save({
        kind: "note",
        title: note.trim().split("\n")[0].slice(0, 100),
        content: note.trim(),
      });
      setNote("");
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return open ? (
    <div className="modal-backdrop">
      <div
        className="modal max-w-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="capture-title"
      >
        <div className="flex justify-between">
          <h2 id="capture-title" className="font-bold">
            Quick capture
          </h2>
          <button
            aria-label="Close capture"
            disabled={busy}
            onClick={() => setOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <textarea
          aria-label="Note"
          autoFocus
          className="field mt-4"
          rows={6}
          placeholder="An idea, reminder or note…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void capture();
            }
          }}
        />
        {error && <p className="error-banner mt-3">{error}</p>}
        <div className="mt-4 flex justify-between items-center">
          <span className="text-xs text-slate-400">Ctrl/⌘ + Enter to save</span>
          <button
            className="primary-button"
            disabled={busy || !note.trim()}
            onClick={capture}
          >
            {busy ? "Saving…" : "Save note"}
          </button>
        </div>
      </div>
    </div>
  ) : null;
}
