import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import QuickCapture from "./QuickCapture";
import GlobalSearch from "./GlobalSearch";

export default function Layout() {
  return (
    <div className="flex h-screen w-full bg-white overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <QuickCapture />
      <GlobalSearch />
    </div>
  );
}
