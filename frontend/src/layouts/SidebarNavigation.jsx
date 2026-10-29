import { useEffect, useId, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { navigation } from './navigation.js';

export default function SidebarNavigation({ close }) {
  const { can } = useAuth();
  const { pathname } = useLocation();
  const instanceId = useId();
  const groups = navigation
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => can(item.permission) || (item.anyPermission && can(item.anyPermission)),
      ),
    }))
    .filter((group) => group.items.length);
  const current = groups.find((group) =>
    group.items.some((item) => pathname === item.path || pathname.startsWith(item.path + '/')),
  )?.label;
  const [openGroup, setOpenGroup] = useState(current);
  useEffect(() => {
    setOpenGroup(current);
  }, [pathname, current]);
  const allItems = groups.flatMap((group) => group.items);
  const link = (item) => (
    <NavLink
      end={allItems.some((other) => other.path.startsWith(item.path + '/'))}
      to={item.path}
      key={item.path}
      onClick={close}
    >
      <span aria-hidden="true">{item.icon}</span>
      {item.label}
    </NavLink>
  );
  return (
    <div className="sidebar-navigation">
      {groups.map((group) => {
        if (group.direct)
          return (
            <div className="nav-group" key={group.label}>
              {group.items.map(link)}
            </div>
          );
        const expanded = openGroup === group.label;
        const id = instanceId + '-' + group.key;
        return (
          <div
            className={'nav-group' + (current === group.label ? ' current' : '')}
            key={group.label}
          >
            <button
              type="button"
              className="nav-group-toggle"
              aria-expanded={expanded}
              aria-controls={id}
              onClick={() => setOpenGroup(expanded ? undefined : group.label)}
            >
              <span className="nav-group-icon" aria-hidden="true">
                {group.icon}
              </span>
              <span className="nav-group-label">{group.label}</span>
              <span className="nav-chevron" aria-hidden="true" />
            </button>
            <div className="nav-submenu" id={id} hidden={!expanded}>
              {group.items.map(link)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
