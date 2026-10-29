import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { navigation } from './navigation.js';
import { Alert, useTask } from '../components/shared.jsx';
import metadata from '../../package.json';
function Navigation({ close }) {
  const { can } = useAuth();
  return (
    <>
      {navigation.map((group) => {
        const items = group.items.filter(
          (i) => can(i.permission) || (i.anyPermission && can(i.anyPermission)),
        );
        return items.length ? (
          <div className="nav-group" key={group.label}>
            <p>{group.label}</p>
            {items.map((i) => (
              <NavLink end to={i.path} key={i.path} onClick={close}>
                <span aria-hidden="true">{i.icon}</span>
                {i.label}
              </NavLink>
            ))}
          </div>
        ) : null;
      })}
    </>
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
          <span className="brand-mark">O</span>OsteoPilot
        </div>
        <div className="cabinet-label">Votre espace cabinet</div>
        <nav aria-label="Navigation principale">
          <Navigation />
        </nav>
        <div className="sidebar-bottom">Simple. Serein. Au quotidien.</div>
      </aside>
      <dialog
        className="mobile-menu"
        ref={dialog}
        onCancel={() => setOpen(false)}
        aria-label="Navigation principale"
      >
        <div className="brand">
          OsteoPilot
          <button
            className="btn btn-light"
            onClick={() => setOpen(false)}
            aria-label="Fermer le menu"
          >
            ×
          </button>
        </div>
        <nav>
          <Navigation close={() => setOpen(false)} />
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
              className="btn btn-outline-secondary"
              disabled={task.busy}
              onClick={() => task.run(auth.logout)}
            >
              Déconnexion
            </button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          <Alert>{task.error}</Alert>
          <Outlet />
        </main>
        <footer>
          OsteoPilot <span>v{metadata.version} · Votre cabinet, au quotidien</span>
        </footer>
      </div>
    </div>
  );
}
