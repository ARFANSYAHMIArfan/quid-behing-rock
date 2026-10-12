import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { useCrypto } from "../contexts/CryptoContext";
import { CryptoEngine } from "../services/CryptoEngine";
import { useVaultRecords } from "../hooks/useVaultRecords";
import { X } from "lucide-react";
export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [queryText, setQueryText] = useState("");
  const [files, setFiles] = useState<{ id: string; title: string }[]>([]);
  const [fileError, setFileError] = useState("");
  const { records, error } = useVaultRecords();
  const { user } = useAuth();
  const { masterKey } = useCrypto();
  const navigate = useNavigate();
  useEffect(() => {
    const show = () => setOpen(true);
    const key = (e: KeyboardEvent) => {
      if (e.key === "j" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("workspace:search", show);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("workspace:search", show);
      document.removeEventListener("keydown", key);
    };
  }, []);
  useEffect(() => {
    setFiles([]);
    if (!user || !masterKey) return;
    let active = true;
    let version = 0;
    const off = onSnapshot(
      query(collection(db, "documents"), where("ownerId", "==", user.uid)),
      async (snapshot) => {
        const current = ++version;
        const rows = await Promise.all(
          snapshot.docs.map(async (d) => {
            try {
              return {
                id: d.id,
                title: CryptoEngine.decodeText(
                  await CryptoEngine.decryptPayload(
                    d.data().encryptedTitle,
                    masterKey,
                  ),
                ),
              };
            } catch {
              return null;
            }
          }),
        );
        if (active && version === current)
          setFiles(rows.filter((r): r is { id: string; title: string } => !!r));
      },
      () => {
        if (active) setFileError("File search is unavailable.");
      },
    );
    return () => {
      active = false;
      off();
    };
  }, [user?.uid, masterKey]);
  const routes = {
    task: "/tasks",
    event: "/calendar",
    transaction: "/finance",
    note: "/docs",
  };
  const q = queryText.trim().toLowerCase();
  const results = [
    ...records.map((r) => ({
      id: r.id,
      title: r.title,
      content: r.content || "",
      route: routes[r.kind],
      type: r.kind,
    })),
    ...files.map((f) => ({ ...f, content: "", route: "/drive", type: "file" })),
  ]
    .filter((r) => q && `${r.title} ${r.content}`.toLowerCase().includes(q))
    .slice(0, 30);
  return open ? (
    <div className="modal-backdrop">
      <div
        className="modal max-w-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Search workspace"
      >
        <div className="flex gap-3">
          <input
            autoFocus
            aria-label="Search"
            className="field"
            placeholder="Search your files, notes, tasks and events…"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
          />
          <button aria-label="Close search" onClick={() => setOpen(false)}>
            <X size={20} />
          </button>
        </div>
        {(error || fileError) && (
          <p className="error-banner mt-3">{error || fileError}</p>
        )}
        <div className="mt-4 space-y-2">
          {results.map((r) => (
            <button
              key={r.id}
              className="w-full rounded-lg p-3 text-left hover:bg-slate-50"
              onClick={() => {
                navigate(r.route);
                setOpen(false);
              }}
            >
              <p className="font-semibold">{r.title}</p>
              <p className="text-xs text-slate-500">
                {r.type} · {r.content.slice(0, 100)}
              </p>
            </button>
          ))}
          {!results.length && (
            <p className="empty-state">
              {q
                ? "No matching records."
                : "Search runs locally in your unlocked session."}
            </p>
          )}
        </div>
      </div>
    </div>
  ) : null;
}
