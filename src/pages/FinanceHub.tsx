import { Wallet } from "lucide-react";

export default function FinanceHub() {
  return (
    <div className="flex h-full flex-col p-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <Wallet className="h-6 w-6 text-teal-500" />
          Finance Hub
        </h1>
        <button className="rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-500">
          Add Transaction
        </button>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-medium text-slate-500">Total Balance</h3>
          <p className="mt-2 text-3xl font-bold text-slate-900">$0.00</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-medium text-slate-500">Monthly Expenses</h3>
          <p className="mt-2 text-3xl font-bold text-slate-900">$0.00</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-medium text-slate-500">Active Subscriptions</h3>
          <p className="mt-2 text-3xl font-bold text-slate-900">0</p>
        </div>
      </div>
    </div>
  );
}
