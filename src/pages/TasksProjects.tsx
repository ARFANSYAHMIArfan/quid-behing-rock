import { Kanban } from "lucide-react";

export default function TasksProjects() {
  const columns = ["To-Do", "In Progress", "Done"];

  return (
    <div className="flex h-full flex-col p-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <Kanban className="h-6 w-6 text-amber-500" />
          Tasks & Projects
        </h1>
      </div>
      <div className="flex flex-1 gap-6 overflow-x-auto pb-4">
        {columns.map((col) => (
          <div key={col} className="flex h-full w-80 shrink-0 flex-col rounded-xl bg-slate-100 p-4">
            <h3 className="mb-4 font-semibold text-slate-700">{col}</h3>
            <div className="flex-1 space-y-3">
              {/* Task Cards go here */}
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-medium text-slate-900">Example Task</p>
                <p className="mt-1 text-xs text-slate-500">Drag & drop capabilities coming soon</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
