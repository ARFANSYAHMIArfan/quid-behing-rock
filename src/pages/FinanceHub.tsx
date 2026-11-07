import { useState, useEffect } from "react";
import { 
  Wallet, 
  Plus, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Trash2, 
  Filter, 
  Calendar as CalendarIcon, 
  Search,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp 
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";

export interface Transaction {
  id: string;
  ownerId: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  date: string;
  note?: string;
  createdAt: any;
}

const CATEGORIES = [
  "Bills",
  "Salary",
  "Freelance",
  "Investment",
  "Groceries",
  "Utilities",
  "Rent & Housing",
  "Transportation",
  "Dining Out",
  "Healthcare",
  "Entertainment",
  "Shopping",
  "Software & Cloud",
  "Other"
];

export default function FinanceHub() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form State
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState<string>("");
  const [category, setCategory] = useState<string>("Bills");
  const [date, setDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Fetch live transactions from Firestore
  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const q = query(
      collection(db, "finance_transactions"),
      where("ownerId", "==", user.uid),
      orderBy("date", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: Transaction[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Transaction, "id">)
      }));
      setTransactions(items);
      setLoading(false);
    }, (err) => {
      console.error("Firestore finance error:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert("Sila masukkan jumlah nilai RM yang sah.");
      return;
    }

    setSubmitting(true);
    try {
      await addDoc(collection(db, "finance_transactions"), {
        ownerId: user.uid,
        type,
        amount: numAmount,
        category,
        date,
        note: note.trim(),
        createdAt: serverTimestamp()
      });

      setShowAddModal(false);
      setAmount("");
      setNote("");
      setNotification({ type: "success", text: "Transaksi berjaya disimpan!" });
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      console.error("Gagal menambah transaksi:", err);
      setNotification({ type: "error", text: "Gagal menyimpan transaksi: " + (err.message || err) });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Adakah anda pasti mahu memadam rekod transaksi ini?")) return;
    try {
      await deleteDoc(doc(db, "finance_transactions", id));
      setNotification({ type: "success", text: "Transaksi dipadam." });
      setTimeout(() => setNotification(null), 3000);
    } catch (err: any) {
      alert("Gagal memadam: " + err.message);
    }
  };

  // Metrics calculation
  const totalIncome = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpense = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  const netBalance = totalIncome - totalExpense;

  // Filtered list
  const filtered = transactions.filter((t) => {
    if (filterType !== "all" && t.type !== filterType) return false;
    if (filterCategory !== "all" && t.category !== filterCategory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchCat = t.category.toLowerCase().includes(q);
      const matchNote = t.note?.toLowerCase().includes(q);
      if (!matchCat && !matchNote) return false;
    }
    return true;
  });

  const formatRM = (val: number) => {
    return `RM ${val.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="flex h-full flex-col p-6 sm:p-8 bg-slate-50 overflow-y-auto">
      {/* Top Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 text-teal-600">
              <Wallet className="h-5 w-5" />
            </div>
            Finance Hub
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Pengurusan kewangan peribadi dengan pengiraan mata wang Ringgit Malaysia (RM).
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-500 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Tambah Transaksi
        </button>
      </div>

      {notification && (
        <div className={`mb-6 flex items-center gap-3 rounded-lg border p-4 text-sm ${
          notification.type === "success" 
            ? "border-teal-200 bg-teal-50 text-teal-800" 
            : "border-rose-200 bg-rose-50 text-rose-800"
        }`}>
          {notification.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          <span>{notification.text}</span>
        </div>
      )}

      {/* Financial Metrics Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 mb-8">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Baki Bersih (Net Balance)</span>
            <div className={`rounded-full p-1.5 ${netBalance >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
              {netBalance >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
            </div>
          </div>
          <p className={`mt-3 text-3xl font-bold tracking-tight ${netBalance >= 0 ? "text-slate-900" : "text-rose-600"} font-mono`}>
            {formatRM(netBalance)}
          </p>
          <span className="mt-1 block text-xs text-slate-400">Jumlah dana sedia ada</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Jumlah Pendapatan</span>
            <div className="rounded-full bg-emerald-50 p-1.5 text-emerald-600">
              <ArrowUpRight className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-bold text-emerald-600 font-mono">
            {formatRM(totalIncome)}
          </p>
          <span className="mt-1 block text-xs text-slate-400">Semua sumber masuk</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Jumlah Perbelanjaan</span>
            <div className="rounded-full bg-rose-50 p-1.5 text-rose-600">
              <ArrowDownLeft className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-bold text-rose-600 font-mono">
            {formatRM(totalExpense)}
          </p>
          <span className="mt-1 block text-xs text-slate-400">Termasuk bil & perbelanjaan</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-xs">
            <button
              onClick={() => setFilterType("all")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filterType === "all" ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Semua
            </button>
            <button
              onClick={() => setFilterType("income")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filterType === "income" ? "bg-emerald-600 text-white" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Pendapatan
            </button>
            <button
              onClick={() => setFilterType("expense")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filterType === "expense" ? "bg-rose-600 text-white" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Perbelanjaan
            </button>
          </div>

          <div className="relative">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs focus:border-teal-500 focus:outline-hidden"
            >
              <option value="all">Semua Kategori</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari transaksi..."
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 shadow-xs focus:border-teal-500 focus:outline-hidden"
          />
        </div>
      </div>

      {/* Transactions Table / Ledger */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        {loading ? (
          <div className="flex h-48 items-center justify-center text-sm text-slate-400">
            Memuatkan rekod kewangan...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
              <Filter className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">Tiada rekod transaksi</h3>
            <p className="mt-1 text-xs text-slate-500 max-w-sm">
              Rekod perbelanjaan, bil atau pendapatan anda akan muncul di sini secara automatik selepas ditambah.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 rounded-lg bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-teal-500"
            >
              Tambah Transaksi Pertama
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/75 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-semibold">Tarikh</th>
                  <th className="px-6 py-3 font-semibold">Kategori</th>
                  <th className="px-6 py-3 font-semibold">Catatan</th>
                  <th className="px-6 py-3 font-semibold text-right">Jumlah (RM)</th>
                  <th className="px-6 py-3 text-right">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="whitespace-nowrap px-6 py-3.5 text-xs text-slate-500 flex items-center gap-1.5">
                      <CalendarIcon className="h-3.5 w-3.5 text-slate-400" />
                      {t.date}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3.5">
                      <span className="font-medium text-slate-800">{t.category}</span>
                    </td>
                    <td className="px-6 py-3.5 text-xs text-slate-600 max-w-xs truncate">
                      {t.note || <span className="text-slate-400 italic">-</span>}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3.5 text-right font-mono font-semibold">
                      <span className={t.type === "income" ? "text-emerald-600" : "text-rose-600"}>
                        {t.type === "income" ? "+" : "-"} {formatRM(t.amount)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3.5 text-right">
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                        title="Padam transaksi"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Transaction Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Tambah Transaksi Baru</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddTransaction} className="mt-4 space-y-4">
              {/* Type Switcher */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Jenis Transaksi
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setType("expense")}
                    className={`flex items-center justify-center gap-2 rounded-lg border py-2 text-xs font-semibold transition-colors ${
                      type === "expense"
                        ? "border-rose-500 bg-rose-50 text-rose-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <ArrowDownLeft className="h-4 w-4" />
                    Perbelanjaan (Expense)
                  </button>
                  <button
                    type="button"
                    onClick={() => setType("income")}
                    className={`flex items-center justify-center gap-2 rounded-lg border py-2 text-xs font-semibold transition-colors ${
                      type === "income"
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <ArrowUpRight className="h-4 w-4" />
                    Pendapatan (Income)
                  </button>
                </div>
              </div>

              {/* Amount (RM) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Jumlah (RM) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400 font-mono">
                    RM
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-slate-200 pl-12 pr-4 py-2 text-base font-mono font-bold text-slate-900 focus:border-teal-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Kategori *
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-teal-500 focus:outline-hidden"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Tarikh *
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-teal-500 focus:outline-hidden"
                />
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Catatan / Penerangan Ringkas
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="cth. Bil elektrik TNB, Gaji bulanan, dll."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-teal-500 focus:outline-hidden"
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
                  className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-teal-500 disabled:opacity-50"
                >
                  {submitting ? "Menyimpan..." : "Simpan Transaksi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
