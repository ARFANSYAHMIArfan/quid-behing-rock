import { Link, useLocation } from "react-router-dom";
import {
  Home,
  LockKeyhole,
  Cloud,
  FileText,
  Calendar,
  Kanban,
  Wallet,
  Inbox,
  Settings,
  Search,
  LogOut,
} from "lucide-react";
import { cn } from "../lib/utils";
import { AuthService } from "../services/AuthService";
import { useCrypto } from "../contexts/CryptoContext";

const navigation = [
  { name: "Overview", href: "/", icon: Home },
  { name: "Cloud Drive", href: "/drive", icon: Cloud },
  { name: "Docs & Notes", href: "/docs", icon: FileText },
  { name: "Calendar & Plan", href: "/calendar", icon: Calendar },
  { name: "Tasks & Projects", href: "/tasks", icon: Kanban },
  { name: "Finance Hub", href: "/finance", icon: Wallet },
  { name: "Mail & Inbox", href: "/inbox", icon: Inbox },
];

export default function Sidebar() {
  const location = useLocation();
  const { lockVault } = useCrypto();

  const handleSignOut = async () => {
    lockVault();
    await AuthService.logOut();
  };

  return (
    <div className="flex h-full w-64 flex-col bg-slate-50 border-r border-slate-200">
      <div className="flex h-16 shrink-0 items-center px-6">
        <h1 className="text-lg font-bold text-slate-900 tracking-tight">
          Workspace
        </h1>
      </div>
      <div className="px-4 pb-4 space-y-2">
        <button
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-500 shadow-sm hover:border-slate-400 focus:outline-none"
          onClick={() =>
            document.dispatchEvent(new CustomEvent("workspace:search"))
          }
        >
          <span className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Search Vault
          </span>
          <kbd className="hidden rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 sm:block">
            Ctrl/⌘ J
          </kbd>
        </button>
        <button
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-transparent bg-slate-100 px-3 py-2 text-sm text-slate-600 hover:bg-slate-200 focus:outline-none"
          onClick={() =>
            document.dispatchEvent(new CustomEvent("workspace:capture"))
          }
        >
          <span className="flex items-center gap-2">
            <Inbox className="h-4 w-4" />
            Quick Capture
          </span>
          <kbd className="hidden rounded bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-500 sm:block">
            Ctrl/⌘ K
          </kbd>
        </button>
      </div>
      <nav className="flex flex-1 flex-col px-4 pb-4">
        <ul role="list" className="flex flex-1 flex-col gap-y-7">
          <li>
            <ul role="list" className="-mx-2 space-y-1">
              {navigation.map((item) => {
                const isActive =
                  item.href === "/"
                    ? location.pathname === "/"
                    : location.pathname.startsWith(item.href);
                return (
                  <li key={item.name}>
                    <Link
                      to={item.href}
                      className={cn(
                        isActive
                          ? "bg-slate-200 text-slate-900"
                          : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                        "group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-medium",
                      )}
                    >
                      <item.icon
                        className={cn(
                          isActive
                            ? "text-slate-900"
                            : "text-slate-400 group-hover:text-slate-900",
                          "h-5 w-5 shrink-0",
                        )}
                        aria-hidden="true"
                      />
                      {item.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
          <li className="mt-auto">
            <button
              onClick={lockVault}
              className="group flex w-full gap-3 rounded-md p-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              <LockKeyhole size={20} />
              Lock vault
            </button>
            <button
              onClick={handleSignOut}
              className="group -mx-2 flex w-full gap-x-3 rounded-md p-2 text-sm font-medium leading-6 text-slate-700 hover:bg-slate-100 hover:text-slate-900"
            >
              <LogOut
                className="h-5 w-5 shrink-0 text-slate-400 group-hover:text-slate-900"
                aria-hidden="true"
              />
              Sign Out
            </button>
            <Link
              to="/settings"
              className={cn(
                location.pathname === "/settings"
                  ? "bg-slate-200 text-slate-900"
                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                "group -mx-2 flex gap-x-3 rounded-md p-2 text-sm font-medium leading-6 mt-1",
              )}
            >
              <Settings
                className={cn(
                  location.pathname === "/settings"
                    ? "text-slate-900"
                    : "text-slate-400 group-hover:text-slate-900",
                  "h-5 w-5 shrink-0",
                )}
                aria-hidden="true"
              />
              Settings
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}
