import { Navigate, Route, Routes, Outlet } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import LoginPage from './pages/LoginPage.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import DashboardPage from './dashboard/DashboardPage.jsx';
import PatientsPage from './patients/PatientsPage.jsx';
import PatientFormPage from './patients/PatientFormPage.jsx';
import PatientDetailPage from './patients/PatientDetailPage.jsx';
import TransferPage from './patients/TransferPage.jsx';
import UsersPage from './administration/UsersPage.jsx';
import RolesPage from './administration/RolesPage.jsx';
import PermissionsPage from './administration/PermissionsPage.jsx';
import SettingsPage from './administration/SettingsPage.jsx';
import HistoryPage from './history/HistoryPage.jsx';
export function Guard({ permission, anyPermission, children }) {
  const { user, loading, can } = useAuth();
  if (loading)
    return (
      <p role="status" className="initial-loading">
        Ouverture de votre espace…
      </p>
    );
  if (!user) return <Navigate to="/login" replace />;
  if (permission && !can(permission) && !(anyPermission && can(anyPermission)))
    return (
      <section className="panel">
        <h1>Accès réservé</h1>
        <p>Vous ne disposez pas des droits nécessaires.</p>
      </section>
    );
  return children || <Outlet />;
}
export default function App() {
  const protect = (permission, page, anyPermission) => (
    <Guard permission={permission} anyPermission={anyPermission}>
      {page}
    </Guard>
  );
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <Guard>
            <AppLayout />
          </Guard>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={protect('dashboard.read', <DashboardPage />)} />
        <Route path="/patients" element={protect('patients.read', <PatientsPage />)} />
        <Route path="/patients/new" element={protect('patients.create', <PatientFormPage />)} />
        <Route
          path="/patients/transfer"
          element={protect('patients.import', <TransferPage />, 'patients.export')}
        />
        <Route path="/patients/:id" element={protect('patients.read', <PatientDetailPage />)} />
        <Route
          path="/patients/:id/edit"
          element={protect('patients.update', <PatientFormPage />)}
        />
        <Route path="/administration/users" element={protect('users.read', <UsersPage />)} />
        <Route path="/administration/roles" element={protect('roles.read', <RolesPage />)} />
        <Route
          path="/administration/permissions"
          element={protect('permissions.read', <PermissionsPage />)}
        />
        <Route
          path="/administration/settings"
          element={protect('settings.read', <SettingsPage />)}
        />
        <Route path="/history" element={protect('history.read', <HistoryPage />)} />
        <Route
          path="*"
          element={
            <section className="panel">
              <h1>Page introuvable</h1>
            </section>
          }
        />
      </Route>
    </Routes>
  );
}
