/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { CryptoProvider, useCrypto } from "./contexts/CryptoContext";
import Layout from "./components/Layout";
import CloudDrive from "./pages/CloudDrive";
import DocsNotes from "./pages/DocsNotes";
import CalendarPlan from "./pages/CalendarPlan";
import TasksProjects from "./pages/TasksProjects";
import FinanceHub from "./pages/FinanceHub";
import MailInbox from "./pages/MailInbox";
import Login from "./pages/Login";
import UnlockVault from "./pages/UnlockVault";

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
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<Navigate to="/drive" replace />} />
              <Route path="drive" element={<CloudDrive />} />
              <Route path="docs" element={<DocsNotes />} />
              <Route path="calendar" element={<CalendarPlan />} />
              <Route path="tasks" element={<TasksProjects />} />
              <Route path="finance" element={<FinanceHub />} />
              <Route path="inbox" element={<MailInbox />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </CryptoProvider>
    </AuthProvider>
  );
}
