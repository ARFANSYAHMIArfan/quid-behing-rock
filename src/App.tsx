/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { CryptoProvider, useCrypto } from "./contexts/CryptoContext";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
const CloudDrive = lazy(() => import("./pages/CloudDrive"));
const DocsNotes = lazy(() => import("./pages/DocsNotes"));
const CalendarPlan = lazy(() => import("./pages/CalendarPlan"));
const TasksProjects = lazy(() => import("./pages/TasksProjects"));
const FinanceHub = lazy(() => import("./pages/FinanceHub"));
const MailInbox = lazy(() => import("./pages/MailInbox"));
import Login from "./pages/Login";
import UnlockVault from "./pages/UnlockVault";
const SetupGuide = lazy(() => import("./pages/SetupGuide"));
const Settings = lazy(() => import("./pages/Settings"));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { isUnlocked } = useCrypto();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isUnlocked) {
    return <UnlockVault />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <CryptoProvider>
        <BrowserRouter>
          <Suspense
            fallback={<p className="empty-state">Loading workspace…</p>}
          >
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/setup" element={<SetupGuide />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="drive" element={<CloudDrive />} />
                <Route path="docs" element={<DocsNotes />} />
                <Route path="calendar" element={<CalendarPlan />} />
                <Route path="tasks" element={<TasksProjects />} />
                <Route path="finance" element={<FinanceHub />} />
                <Route path="inbox" element={<MailInbox />} />
                <Route path="settings" element={<Settings />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </CryptoProvider>
    </AuthProvider>
  );
}
