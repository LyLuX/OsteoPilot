import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import SidebarNavigation from './SidebarNavigation.jsx';
import { useTask } from '../components/shared.jsx';
import metadata from '../../package.json';
function BrandIdentity() {
  return (
    <span className="brand-identity">
      <img className="brand-mark" src="/osteopilot-mark.png?v=1" alt="" width="38" height="38" />
      OstéoPilot
    </span>
  );
}
export default function AppLayout() {
  const auth = useAuth();
  const task = useTask();
  const [open, setOpen] = useState(false);
  const dialog = useRef(null);
  const menu = useRef(null);
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    const node = dialog.current;
    if (open && !node.open) node.showModal();
    if (!open && node.open) {
      node.close();
      menu.current?.focus();
    }
  }, [open]);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Aller au contenu
      </a>
      <aside className="sidebar">
        <div className="brand">
          <BrandIdentity />
        </div>
        <nav aria-label="Navigation principale">
          <SidebarNavigation />
        </nav>
      </aside>
      <dialog
        className="mobile-menu"
        ref={dialog}
        onCancel={() => setOpen(false)}
        aria-label="Navigation principale"
      >
        <div className="brand">
          <BrandIdentity />
          <button
            className="btn btn-light"
            onClick={() => setOpen(false)}
            aria-label="Fermer le menu"
          >
            ×
          </button>
        </div>
        <nav>
          <SidebarNavigation close={() => setOpen(false)} />
        </nav>
      </dialog>
      <div className="workspace">
        <header className="topbar">
          <button
            ref={menu}
            className="btn btn-outline-secondary menu-toggle"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            ☰ Menu
          </button>
          <span className="topbar-label">Gestion du cabinet</span>
          <div className="user-area">
            <span className="avatar" aria-hidden="true">
              {auth.user.firstName.slice(0, 1)}
              {auth.user.lastName.slice(0, 1)}
            </span>
            <span className="user-name">
              {auth.user.firstName} {auth.user.lastName}
            </span>
            <button
              className="btn btn-outline-danger"
              disabled={task.busy}
              onClick={() => task.run(auth.logout, 'Vous êtes déconnecté.', 'danger')}
            >
              Déconnexion
            </button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
        <footer>OstéoPilot · v{metadata.version}</footer>
      </div>
    </div>
  );
}
