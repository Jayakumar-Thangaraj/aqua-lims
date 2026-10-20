import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { Callout } from './components/Modal';
import { AppShell } from './layout/AppShell';
import { ChangePasswordPage, MyDetailsPage } from './pages/AccountPages';
import { AuditLogPage } from './pages/admin/AuditLogPage';
import { RolesPage } from './pages/admin/RolesPage';
import { UsersPage } from './pages/admin/UsersPage';
import { EntityListPage } from './pages/EntityListPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="boot">Loading…</div>;
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (me.user.changePasswordOnFirstLogon) return <Navigate to="/change-password" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <div className="page"><Callout kind="warning">Administrators only.</Callout></div>;
  return <>{children}</>;
}

export function App() {
  const { me, loading } = useAuth();
  if (loading) return <div className="boot">Loading…</div>;
  return (
    <Routes>
      <Route path="/login" element={me && !me.user.changePasswordOnFirstLogon ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/change-password" element={me ? <ChangePasswordPage /> : <Navigate to="/login" replace />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="my-details" element={<MyDetailsPage />} />
        <Route path="admin/users" element={<RequireAdmin><UsersPage /></RequireAdmin>} />
        <Route path="admin/roles" element={<RequireAdmin><RolesPage /></RequireAdmin>} />
        <Route path="admin/audit-log" element={<RequireAdmin><AuditLogPage /></RequireAdmin>} />
        <Route path=":resource" element={<EntityListPage />} />
        <Route path=":resource/:id" element={<EntityListPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
