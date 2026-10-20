import { useEffect, useState, type FormEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ENTITIES, NAVIGATION, type NavNode } from '@aqualims/shared';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { DropIcon, EntityIcon, IconChevronDown, IconChevronRight, IconClose, IconHamburger, IconLogOut, IconSearch, IconUser } from '../components/Icons';
import { useGlobalSearch } from './SearchContext';

function visible(node: NavNode, can: (t: string, op: 'read' | 'navigate') => boolean, isAdmin: boolean): boolean {
  if (node.kind === 'entity') return can(node.entity, 'read');
  if (node.kind === 'link') return node.adminOnly ? isAdmin : true;
  return node.items.some((n) => visible(n, can, isAdmin));
}

function NavItems({ nodes, depth, expanded, toggle }: { nodes: NavNode[]; depth: number; expanded: Record<string, boolean>; toggle: (id: string) => void }) {
  const { can, isAdmin } = useAuth();
  return (
    <ul className={`nav-list depth-${depth}`}>
      {nodes
        .filter((n) => visible(n, can, isAdmin))
        .map((node) => {
          if (node.kind === 'group') {
            const open = expanded[node.id] ?? false;
            return (
              <li key={node.id}>
                <button type="button" className="nav-group" aria-expanded={open} onClick={() => toggle(node.id)} style={{ paddingLeft: 10 + depth * 14 }}>
                  {open ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
                  <EntityIcon name={node.icon} />
                  <span>{node.caption}</span>
                </button>
                {open && <NavItems nodes={node.items} depth={depth + 1} expanded={expanded} toggle={toggle} />}
              </li>
            );
          }
          const path = node.kind === 'entity' ? `/${ENTITIES[node.entity].apiPath}` : node.path;
          const caption = node.kind === 'entity' ? node.caption ?? ENTITIES[node.entity].caption : node.caption;
          const icon = node.kind === 'entity' ? ENTITIES[node.entity].icon : node.icon;
          return (
            <li key={node.id}>
              <NavLink to={path} end={path === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} style={{ paddingLeft: 23 + depth * 14 }}>
                <EntityIcon name={icon} />
                <span>{caption}</span>
              </NavLink>
            </li>
          );
        })}
    </ul>
  );
}

export function AppShell() {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { query, setQuery } = useGlobalSearch();
  const [searchText, setSearchText] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const navSettings = useQuery({ queryKey: ['viewSettings', 'nav'], queryFn: () => api<Record<string, boolean> | null>('/me/view-settings/nav'), staleTime: Infinity });
  const [expanded, setExpanded] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    if (expanded === null && !navSettings.isLoading) setExpanded(navSettings.data ?? { tanks: true, waterManagement: true });
  }, [navSettings.isLoading, navSettings.data, expanded]);

  // The header search applies to one list at a time.
  useEffect(() => {
    setQuery('');
    setSearchText('');
    setNavOpen(false);
  }, [location.pathname.split('/')[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) =>
    setExpanded((e) => {
      const next = { ...(e ?? {}), [id]: !(e ?? {})[id] };
      api('/me/view-settings/nav', { method: 'PUT', body: next }).catch(() => undefined);
      return next;
    });

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    setQuery(searchText.trim());
  };

  return (
    <div className="shell">
      <header className="header">
        <div className="header-left">
          <button type="button" className="icon-btn nav-toggle" aria-label="Menu" title="Menu" onClick={() => setNavOpen((o) => !o)}>
            <IconHamburger size={20} />
          </button>
          <NavLink to="/" className="brand" aria-label="Aqua LIMS home">
            <DropIcon />
            <span className="brand-name">
              Aqua <strong>LIMS</strong>
            </span>
          </NavLink>
        </div>
        <div className="header-right">
          <form className="header-search" role="search" onSubmit={onSearch}>
            <input type="search" placeholder="Text to search…" aria-label="Text to search" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
            {query && (
              <button type="button" className="icon-btn" aria-label="Clear search" title="Clear search" onClick={() => { setQuery(''); setSearchText(''); }}>
                <IconClose size={13} />
              </button>
            )}
            <button type="submit" className="btn btn-sm">
              <IconSearch size={14} /> Search
            </button>
          </form>
          <NavLink to="/my-details" className="header-link" title="My Details">
            <IconUser size={15} /> <span>My Details</span>
          </NavLink>
          <button
            type="button"
            className="header-link"
            title="Log Off"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            <IconLogOut size={15} /> <span>Log Off</span>
          </button>
          <span className="header-user" title="Signed in as">
            <span className="avatar" aria-hidden>{me?.user.userName?.charAt(0).toUpperCase()}</span>
            {me?.user.userName}
          </span>
        </div>
      </header>
      <div className="body">
        <nav className={`sidebar ${navOpen ? 'open' : ''}`} aria-label="Main navigation">
          {expanded && <NavItems nodes={NAVIGATION} depth={0} expanded={expanded} toggle={toggle} />}
        </nav>
        {navOpen && <div className="sidebar-scrim" onClick={() => setNavOpen(false)} />}
        <main className="content">
          <Outlet />
          <footer className="footer">
            <div>Aqua LIMS</div>
            <div>Version 1.0.0</div>
          </footer>
        </main>
      </div>
    </div>
  );
}
