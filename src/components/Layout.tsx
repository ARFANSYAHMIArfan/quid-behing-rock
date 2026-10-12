import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Menu, X, LockKeyhole } from "lucide-react";
import Sidebar from "./Sidebar";
import QuickCapture from "./QuickCapture";
import GlobalSearch from "./GlobalSearch";
import { useCrypto } from "../contexts/CryptoContext";
export default function Layout() {
  const [open, setOpen] = useState(false);
  const { lockVault } = useCrypto();
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-slate-50">
      <div className="hidden md:block">
        <Sidebar />
      </div>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setOpen(false)}
          />
          <div
            className="relative h-full w-64"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("a")) setOpen(false);
            }}
          >
            <Sidebar />
            <button
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 md:hidden">
          <button aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu size={22} />
          </button>
          <span className="font-semibold">Workspace</span>
          <button aria-label="Lock vault" onClick={lockVault}>
            <LockKeyhole size={20} />
          </button>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <QuickCapture />
      <GlobalSearch />
    </div>
  );
}
