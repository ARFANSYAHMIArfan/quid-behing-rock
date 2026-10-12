import { useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useVaultRecords, VaultRecord } from "../hooks/useVaultRecords";
import AnnotationCanvas from "./canvas/AnnotationCanvas";
import FloatingToolbar from "./canvas/FloatingToolbar";
import { Annotation, AnnotationType } from "../types/canvas";
const names = {
  task: "Tasks & Projects",
  event: "Calendar & Plan",
  transaction: "Finance Hub",
  note: "Docs & Notes",
};
const statuses = ["To Do", "In Progress", "Done"];
export default function RecordsPage({ kind }: { kind: VaultRecord["kind"] }) {
  const { records, loading, error, save, remove } = useVaultRecords(kind);
  const [draft, setDraft] = useState<Partial<VaultRecord> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedDay, setSelectedDay] = useState("");
  const [tool, setTool] = useState<AnnotationType | "select">("select");
  const [color, setColor] = useState("#2563eb");
  const [activeAnnotation, setActiveAnnotation] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VaultRecord | null>(null);
  const filtered = records.filter((r) =>
    `${r.title} ${r.content || ""} ${r.category || ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const monthRecords = filtered.filter((r) => r.date?.startsWith(month));
  const money = (value: number) =>
    new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
    }).format(value);
  const income = monthRecords
    .filter((r) => (r.amount || 0) > 0)
    .reduce((sum, r) => sum + (r.amount || 0), 0);
  const expenses = -monthRecords
    .filter((r) => (r.amount || 0) < 0)
    .reduce((sum, r) => sum + (r.amount || 0), 0);
  function change(field: string, value: unknown) {
    setDraft((d) => ({ ...d, [field]: value }));
  }
  function add() {
    setMessage("");
    setTool("select");
    setDraft({
      kind,
      title: "",
      content: "",
      status: "To Do",
      date:
        kind === "event"
          ? `${month}-01T09:00`
          : new Date().toLocaleDateString("en-CA"),
      category: "General",
      amount: 0,
      annotations: [],
    });
  }
  function edit(record: VaultRecord) {
    setMessage("");
    setTool("select");
    setActiveAnnotation(null);
    setDraft({ ...record });
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft?.title?.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      if (
        kind === "event" &&
        (!draft.date || !draft.end || draft.end <= draft.date)
      )
        throw new Error("End time must be after the start time.");
      if (
        kind === "transaction" &&
        (!Number.isFinite(draft.amount) || draft.amount === 0)
      )
        throw new Error(
          "Enter a non-zero amount. Use a negative amount for expenses.",
        );
      await save({ ...draft, kind, title: draft.title.trim() } as VaultRecord);
      setDraft(null);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await remove(deleteTarget.id);
      setDeleteTarget(null);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const card = (r: VaultRecord) => (
    <article key={r.id} className="record-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold break-words">{r.title}</h3>
          <p className="mt-1 text-xs text-slate-500">
            {r.date
              ? new Date(r.date).toLocaleString(
                  "en-MY",
                  kind === "event"
                    ? { dateStyle: "medium", timeStyle: "short" }
                    : { dateStyle: "medium" },
                )
              : "No date"}
            {r.end &&
              ` – ${new Date(r.end).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}`}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            aria-label={`Edit ${r.title}`}
            onClick={() => edit(r)}
            className="icon-button"
          >
            <Pencil size={16} />
          </button>
          <button
            aria-label={`Delete ${r.title}`}
            onClick={() => setDeleteTarget(r)}
            className="icon-button text-red-600"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      {r.content && (
        <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600 line-clamp-4">
          {r.content}
        </p>
      )}
      {kind === "transaction" && (
        <p
          className={`mt-3 text-lg font-semibold ${(r.amount || 0) < 0 ? "text-rose-600" : "text-emerald-600"}`}
        >
          {money(r.amount || 0)}{" "}
          <span className="text-xs text-slate-400">{r.category}</span>
        </p>
      )}
      {kind === "task" && (
        <select
          aria-label={`Status for ${r.title}`}
          value={r.status || "To Do"}
          className="field mt-3"
          onChange={async (e) => {
            try {
              await save({ ...r, status: e.target.value });
            } catch (err) {
              setMessage((err as Error).message);
            }
          }}
        >
          {statuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      )}
    </article>
  );
  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h1>{names[kind]}</h1>
          <p className="subtitle">
            {kind === "task"
              ? "A clear place for your next steps."
              : kind === "event"
                ? "Plan your time and see what comes next."
                : kind === "transaction"
                  ? "Track income and expenses in Malaysian ringgit."
                  : "Write, sketch and keep your ideas together."}
          </p>
        </div>
        <button className="primary-button" onClick={add}>
          <Plus size={18} />
          Add {kind}
        </button>
      </div>
      <div className="mb-6 flex flex-wrap gap-3">
        <input
          className="field flex-1 min-w-0"
          aria-label="Search records"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {(kind === "event" || kind === "transaction") && (
          <input
            aria-label="Month"
            type="month"
            className="field w-auto"
            value={month}
            onChange={(e) => {
              if (e.target.value) setMonth(e.target.value);
              setSelectedDay("");
            }}
          />
        )}
      </div>
      {(error || message) && (
        <p role="alert" className="error-banner mb-4">
          {error || message}
        </p>
      )}
      {loading ? (
        <p className="empty-state">Loading your encrypted records…</p>
      ) : (
        <>
          {kind === "task" ? (
            <div className="grid gap-4 xl:grid-cols-3">
              {statuses.map((status) => (
                <div
                  key={status}
                  className="rounded-2xl bg-slate-100 p-4"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={async (e) => {
                    e.preventDefault();
                    const r = records.find(
                      (r) => r.id === e.dataTransfer.getData("text/plain"),
                    );
                    if (r)
                      try {
                        await save({ ...r, status });
                      } catch (err) {
                        setMessage((err as Error).message);
                      }
                  }}
                >
                  <h2 className="mb-4 font-semibold">
                    {status}{" "}
                    <span className="text-slate-400">
                      {
                        filtered.filter((r) => (r.status || "To Do") === status)
                          .length
                      }
                    </span>
                  </h2>
                  <div className="space-y-3">
                    {filtered
                      .filter((r) => (r.status || "To Do") === status)
                      .map((r) => (
                        <div
                          key={r.id}
                          draggable
                          onDragStart={(e) =>
                            e.dataTransfer.setData("text/plain", r.id)
                          }
                        >
                          {card(r)}
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          ) : kind === "event" ? (
            <>
              <div className="record-card mb-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-semibold">
                    {new Date(`${month}-01T12:00`).toLocaleDateString("en-MY", {
                      month: "long",
                      year: "numeric",
                    })}
                  </h2>
                  <div className="flex">
                    <button
                      aria-label="Previous month"
                      className="icon-button"
                      onClick={() => {
                        const d = new Date(`${month}-01T12:00`);
                        d.setMonth(d.getMonth() - 1);
                        setMonth(
                          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
                        );
                        setSelectedDay("");
                      }}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      aria-label="Next month"
                      className="icon-button"
                      onClick={() => {
                        const d = new Date(`${month}-01T12:00`);
                        d.setMonth(d.getMonth() + 1);
                        setMonth(
                          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
                        );
                        setSelectedDay("");
                      }}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                    (d) => (
                      <span key={d} className="py-2 text-xs text-slate-400">
                        {d}
                      </span>
                    ),
                  )}
                  {Array.from(
                    { length: new Date(`${month}-01T12:00`).getDay() },
                    (_, i) => (
                      <span key={`blank${i}`} />
                    ),
                  )}
                  {Array.from(
                    {
                      length: new Date(
                        Number(month.slice(0, 4)),
                        Number(month.slice(5)),
                        0,
                      ).getDate(),
                    },
                    (_, i) => {
                      const date = `${month}-${String(i + 1).padStart(2, "0")}`;
                      const events = monthRecords.filter((r) =>
                        r.date?.startsWith(date),
                      );
                      return (
                        <button
                          key={date}
                          onClick={() =>
                            setSelectedDay(selectedDay === date ? "" : date)
                          }
                          aria-label={`${date}, ${events.length} events`}
                          className={`min-h-16 rounded-lg border p-2 text-sm ${selectedDay === date ? "border-blue-500 bg-blue-50" : "border-slate-100 hover:bg-slate-50"}`}
                        >
                          {i + 1}
                          {events.length > 0 && (
                            <span className="mx-auto mt-2 block h-1.5 w-1.5 rounded-full bg-blue-600" />
                          )}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {monthRecords
                  .filter(
                    (r) => !selectedDay || r.date?.startsWith(selectedDay),
                  )
                  .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
                  .map(card)}
              </div>
              {!monthRecords.length && (
                <p className="empty-state">
                  No events this month. Add your first event.
                </p>
              )}
            </>
          ) : (
            <>
              {kind === "transaction" && (
                <div className="mb-6 grid gap-4 sm:grid-cols-3">
                  {[
                    ["Net this month", money(income - expenses)],
                    ["Income", money(income)],
                    ["Expenses", money(expenses)],
                  ].map(([label, value]) => (
                    <div key={label} className="record-card">
                      <p className="text-sm text-slate-500">{label}</p>
                      <p className="mt-2 text-2xl font-bold">{value}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                {(kind === "transaction" ? monthRecords : filtered).map(card)}
              </div>
              {!(kind === "transaction" ? monthRecords : filtered).length && (
                <p className="empty-state">
                  Nothing here yet. Add your first {kind}.
                </p>
              )}
            </>
          )}
        </>
      )}
      {draft && (
        <div className="modal-backdrop">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="editor-title"
            className={`modal ${kind === "note" ? "max-w-4xl" : "max-w-lg"}`}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 id="editor-title" className="text-lg font-bold">
                {draft.id ? "Edit" : "Add"} {kind}
              </h2>
              <button
                aria-label="Close editor"
                disabled={busy}
                onClick={() => setDraft(null)}
                className="icon-button"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={submit} className="space-y-4">
              <label className="form-label">
                Title
                <input
                  autoFocus
                  required
                  maxLength={200}
                  className="field"
                  value={draft.title || ""}
                  onChange={(e) => change("title", e.target.value)}
                />
              </label>
              <label className="form-label">
                {kind === "note" ? "Note" : "Details"}
                <textarea
                  className="field"
                  rows={kind === "note" ? 8 : 3}
                  maxLength={100000}
                  value={draft.content || ""}
                  onChange={(e) => change("content", e.target.value)}
                />
              </label>
              {kind !== "note" && (
                <label className="form-label">
                  {kind === "event" ? "Start" : "Date"}
                  <input
                    required={kind === "event" || kind === "transaction"}
                    type={kind === "event" ? "datetime-local" : "date"}
                    className="field"
                    value={draft.date || ""}
                    onChange={(e) => change("date", e.target.value)}
                  />
                </label>
              )}
              {kind === "event" && (
                <>
                  <label className="form-label">
                    End
                    <input
                      required
                      type="datetime-local"
                      className="field"
                      value={draft.end || ""}
                      onChange={(e) => change("end", e.target.value)}
                    />
                  </label>
                  <p className="text-xs text-slate-500">
                    Times use your device timezone. These events are stored in
                    this workspace.
                  </p>
                </>
              )}
              {kind === "task" && (
                <label className="form-label">
                  Project
                  <input
                    className="field"
                    maxLength={100}
                    value={draft.category || ""}
                    onChange={(e) => change("category", e.target.value)}
                  />
                </label>
              )}
              {kind === "task" && (
                <label className="form-label">
                  Status
                  <select
                    className="field"
                    value={draft.status || "To Do"}
                    onChange={(e) => change("status", e.target.value)}
                  >
                    {statuses.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              )}
              {kind === "transaction" && (
                <>
                  <label className="form-label">
                    Amount (MYR; negative for expenses)
                    <input
                      required
                      type="number"
                      step="0.01"
                      className="field"
                      value={draft.amount ?? 0}
                      onChange={(e) => change("amount", Number(e.target.value))}
                    />
                  </label>
                  <label className="form-label">
                    Category
                    <input
                      className="field"
                      maxLength={100}
                      value={draft.category || ""}
                      onChange={(e) => change("category", e.target.value)}
                    />
                  </label>
                </>
              )}
              {kind === "note" && (
                <details>
                  <summary className="cursor-pointer text-sm font-semibold">
                    Drawing canvas
                  </summary>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={!activeAnnotation}
                      onClick={() => {
                        change(
                          "annotations",
                          (draft.annotations || []).filter(
                            (a: any) => a.id !== activeAnnotation,
                          ),
                        );
                        setActiveAnnotation(null);
                      }}
                    >
                      Delete selected stroke
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        change(
                          "annotations",
                          (draft.annotations || []).slice(0, -1),
                        )
                      }
                    >
                      Undo last stroke
                    </button>
                  </div>
                  <div className="relative mt-4 h-96 overflow-hidden rounded-xl border">
                    <AnnotationCanvas
                      activeTool={tool}
                      activeColor={color}
                      annotations={(draft.annotations || []) as Annotation[]}
                      setAnnotations={(update) =>
                        setDraft((d) => ({
                          ...d,
                          annotations:
                            typeof update === "function"
                              ? update((d?.annotations || []) as Annotation[])
                              : update,
                        }))
                      }
                      activeAnnotationId={activeAnnotation}
                      setActiveAnnotationId={setActiveAnnotation}
                    />
                    <FloatingToolbar
                      activeTool={tool}
                      setActiveTool={setTool}
                      activeColor={color}
                      setActiveColor={setColor}
                    />
                  </div>
                </details>
              )}
              {message && (
                <p role="alert" className="error-banner">
                  {message}
                </p>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => setDraft(null)}
                >
                  Cancel
                </button>
                <button disabled={busy} className="primary-button">
                  {busy ? "Saving…" : "Save encrypted"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {deleteTarget && (
        <div className="modal-backdrop">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            className="modal max-w-sm"
          >
            <h2 id="delete-title" className="font-bold">
              Delete {deleteTarget.title}?
            </h2>
            <p className="my-4 text-sm text-slate-500">
              This record will be permanently removed.
            </p>
            {message && <p className="error-banner">{message}</p>}
            <div className="flex gap-3">
              <button
                disabled={busy}
                className="secondary-button"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                disabled={busy}
                className="primary-button bg-red-600"
                onClick={confirmDelete}
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
