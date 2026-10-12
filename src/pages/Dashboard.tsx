import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CalendarDays,
  CheckSquare,
  NotebookPen,
  Wallet,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useVaultRecords } from "../hooks/useVaultRecords";
export default function Dashboard() {
  const { user } = useAuth();
  const { records, loading, error } = useVaultRecords();
  const today = new Date().toLocaleDateString("en-CA");
  const month = today.slice(0, 7);
  const tasks = records.filter((r) => r.kind === "task" && r.status !== "Done");
  const events = records
    .filter(
      (r) =>
        r.kind === "event" &&
        r.date &&
        new Date(r.end || r.date).getTime() >= Date.now(),
    )
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const expenses = -records
    .filter(
      (r) =>
        r.kind === "transaction" &&
        r.date?.startsWith(month) &&
        (r.amount || 0) < 0,
    )
    .reduce((s, r) => s + (r.amount || 0), 0);
  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {new Date().toLocaleDateString("en-MY", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
          <h1>Hello, {user?.displayName?.split(" ")[0] || "Arfan"}.</h1>
          <p className="subtitle">Your day, with room to focus.</p>
        </div>
        <button
          className="primary-button"
          onClick={() =>
            document.dispatchEvent(new CustomEvent("workspace:capture"))
          }
        >
          Quick capture
        </button>
      </div>
      {error && <p className="error-banner">{error}</p>}
      {loading ? (
        <p className="empty-state">Loading your day…</p>
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [CheckSquare, "Open tasks", String(tasks.length), "/tasks"],
              [
                CalendarDays,
                "Upcoming events",
                String(events.length),
                "/calendar",
              ],
              [
                NotebookPen,
                "Notes",
                String(records.filter((r) => r.kind === "note").length),
                "/docs",
              ],
              [
                Wallet,
                "Expenses this month",
                new Intl.NumberFormat("en-MY", {
                  style: "currency",
                  currency: "MYR",
                }).format(expenses),
                "/finance",
              ],
            ].map(([Icon, label, value, href]: any) => (
              <Link
                key={href}
                to={href}
                className="record-card hover:border-blue-300"
              >
                <div className="flex justify-between text-slate-400">
                  <Icon size={20} />
                  <ArrowUpRight size={18} />
                </div>
                <p className="mt-4 text-sm text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-bold">{value}</p>
              </Link>
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="record-card">
              <h2 className="mb-4 font-semibold">Next steps</h2>
              {tasks.length ? (
                tasks.slice(0, 5).map((r) => (
                  <Link key={r.id} to="/tasks" className="block border-t py-3">
                    <p className="font-medium">{r.title}</p>
                    <p className="text-xs text-slate-500">
                      {r.status} {r.date && `· Due ${r.date}`}
                    </p>
                  </Link>
                ))
              ) : (
                <p className="subtitle">
                  No open tasks. Add one when you're ready.
                </p>
              )}
            </div>
            <div className="record-card">
              <h2 className="mb-4 font-semibold">Coming up</h2>
              {events.length ? (
                events.slice(0, 5).map((r) => (
                  <Link
                    key={r.id}
                    to="/calendar"
                    className="block border-t py-3"
                  >
                    <p className="font-medium">{r.title}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(r.date!).toLocaleString("en-MY", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  </Link>
                ))
              ) : (
                <p className="subtitle">Your calendar is clear.</p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
