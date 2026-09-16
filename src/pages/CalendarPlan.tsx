import { Calendar } from "lucide-react";

export default function CalendarPlan() {
  return (
    <div className="flex h-full flex-col p-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <Calendar className="h-6 w-6 text-purple-500" />
          Calendar & Plan
        </h1>
      </div>
      <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 p-6">
        <div className="h-full border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center">
          <p className="text-slate-500 text-sm">Time-blocking calendar view goes here</p>
        </div>
      </div>
    </div>
  );
}
