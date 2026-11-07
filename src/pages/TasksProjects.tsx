import { useState, useEffect } from "react";
import { 
  Kanban, 
  Plus, 
  Trash2, 
  Calendar as CalendarIcon, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  ArrowRight,
  MoreVertical,
  Filter
} from "lucide-react";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp 
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";

export type TaskStatus = "todo" | "in_progress" | "review" | "done";
export type TaskPriority = "low" | "medium" | "high";

export interface TaskItem {
  id: string;
  ownerId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  createdAt: any;
}

const COLUMNS: { id: TaskStatus; label: string; dotColor: string }[] = [
  { id: "todo", label: "To-Do", dotColor: "bg-slate-400" },
  { id: "in_progress", label: "In Progress", dotColor: "bg-amber-500" },
  { id: "review", label: "Review", dotColor: "bg-purple-500" },
  { id: "done", label: "Completed", dotColor: "bg-emerald-500" },
];

export default function TasksProjects() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [targetColumn, setTargetColumn] = useState<TaskStatus>("todo");
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Filter
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const q = query(
      collection(db, "tasks"),
      where("ownerId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: TaskItem[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<TaskItem, "id">)
      }));
      setTasks(items);
      setLoading(false);
    }, (err) => {
      console.error("Firestore tasks error:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim()) return;

    setSubmitting(true);
    try {
      await addDoc(collection(db, "tasks"), {
        ownerId: user.uid,
        title: title.trim(),
        description: description.trim(),
        status: targetColumn,
        priority,
        dueDate: dueDate || null,
        createdAt: serverTimestamp()
      });

      setShowAddModal(false);
      setTitle("");
      setDescription("");
      setDueDate("");
      setPriority("medium");
      setNotification({ type: "success", text: "Tugasan berjaya dicipta!" });
      setTimeout(() => setNotification(null), 3000);
    } catch (err: any) {
      console.error("Gagal menambah tugasan:", err);
      setNotification({ type: "error", text: "Gagal mencipta tugasan: " + (err.message || err) });
    } finally {
      setSubmitting(false);
    }
  };

  const handleMoveStatus = async (taskId: string, newStatus: TaskStatus) => {
    try {
      await updateDoc(doc(db, "tasks", taskId), {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
    } catch (err: any) {
      alert("Gagal mengemaskini status: " + err.message);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm("Padam tugasan ini?")) return;
    try {
      await deleteDoc(doc(db, "tasks", taskId));
    } catch (err: any) {
      alert("Gagal memadam tugasan: " + err.message);
    }
  };

  const openNewTaskModal = (status: TaskStatus = "todo") => {
    setTargetColumn(status);
    setShowAddModal(true);
  };

  const filteredTasks = tasks.filter((t) => {
    if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
    return true;
  });

  return (
    <div className="flex h-full flex-col p-6 sm:p-8 bg-slate-50 overflow-hidden">
      {/* Top Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
              <Kanban className="h-5 w-5" />
            </div>
            Tasks & Projects
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Papan Kanban tugasan masa nyata dengan simpanan Firestore langsung.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Prioriti:</span>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-xs focus:border-amber-500 focus:outline-hidden"
            >
              <option value="all">Semua Prioriti</option>
              <option value="high">Tinggi (High)</option>
              <option value="medium">Sederhana (Med)</option>
              <option value="low">Rendah (Low)</option>
            </select>
          </div>

          <button
            onClick={() => openNewTaskModal("todo")}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-amber-500 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Tugasan Baru
          </button>
        </div>
      </div>

      {notification && (
        <div className={`mb-4 flex items-center gap-3 rounded-lg border p-3.5 text-sm shrink-0 ${
          notification.type === "success" 
            ? "border-amber-200 bg-amber-50 text-amber-800" 
            : "border-rose-200 bg-rose-50 text-rose-800"
        }`}>
          {notification.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          <span>{notification.text}</span>
        </div>
      )}

      {/* Kanban Board Container */}
      <div className="flex-1 flex gap-5 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const colTasks = filteredTasks.filter((t) => t.status === col.id);

          return (
            <div
              key={col.id}
              className="flex h-full w-80 shrink-0 flex-col rounded-2xl bg-slate-100/80 border border-slate-200/70 p-4"
            >
              {/* Column Header */}
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${col.dotColor}`} />
                  <h3 className="font-semibold text-sm text-slate-800">{col.label}</h3>
                  <span className="text-xs font-mono font-medium text-slate-400">
                    ({colTasks.length})
                  </span>
                </div>
                <button
                  onClick={() => openNewTaskModal(col.id)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
                  title="Tambah tugasan ke lajur ini"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {/* Task Cards Column */}
              <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                {colTasks.length === 0 ? (
                  <div className="h-28 rounded-xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-xs text-slate-400 p-4 text-center">
                    <span>Tiada tugasan</span>
                    <button
                      onClick={() => openNewTaskModal(col.id)}
                      className="mt-1 text-amber-600 hover:underline font-medium"
                    >
                      + Tambah satu
                    </button>
                  </div>
                ) : (
                  colTasks.map((task) => (
                    <div
                      key={task.id}
                      className="group relative rounded-xl border border-slate-200 bg-white p-4 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-semibold text-slate-900 leading-snug">
                          {task.title}
                        </h4>
                        <button
                          onClick={() => handleDeleteTask(task.id)}
                          className="opacity-0 group-hover:opacity-100 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-all"
                          title="Padam tugasan"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {task.description && (
                        <p className="mt-1.5 text-xs text-slate-500 line-clamp-2">
                          {task.description}
                        </p>
                      )}

                      <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                        {/* Priority indicator - unboxed text */}
                        <span className={`text-[11px] font-semibold uppercase tracking-wider ${
                          task.priority === "high"
                            ? "text-rose-600"
                            : task.priority === "medium"
                            ? "text-amber-600"
                            : "text-slate-500"
                        }`}>
                          • {task.priority}
                        </span>

                        {task.dueDate && (
                          <div className="flex items-center gap-1 text-[11px] font-mono text-slate-500">
                            <Clock className="h-3 w-3 text-slate-400" />
                            {task.dueDate}
                          </div>
                        )}
                      </div>

                      {/* Move to another status quick switcher */}
                      <div className="mt-2.5 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] text-slate-400 mr-1">Alih:</span>
                        {COLUMNS.filter((c) => c.id !== task.status).map((c) => (
                          <button
                            key={c.id}
                            onClick={() => handleMoveStatus(task.id, c.id)}
                            className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-amber-100 hover:text-amber-800 transition-colors"
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Task Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Cipta Tugasan Baru</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Tajuk Tugasan *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="cth. Siapkan modul pelaporan bulanan"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-amber-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Penerangan / Nota Tambahan
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Maklumat terperinci berkaitan tugasan..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-amber-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Lajur Status
                  </label>
                  <select
                    value={targetColumn}
                    onChange={(e) => setTargetColumn(e.target.value as TaskStatus)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-amber-500 focus:outline-hidden"
                  >
                    {COLUMNS.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Prioriti
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TaskPriority)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-amber-500 focus:outline-hidden"
                  >
                    <option value="low">Rendah (Low)</option>
                    <option value="medium">Sederhana (Medium)</option>
                    <option value="high">Tinggi (High)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Tarikh Siap (Due Date)
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-amber-500 focus:outline-hidden"
                />
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-amber-600 px-5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-amber-500 disabled:opacity-50"
                >
                  {submitting ? "Mencipta..." : "Cipta Tugasan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
