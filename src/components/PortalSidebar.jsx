import { Link, useLocation } from 'react-router-dom';
import '../styles/portal-sidebar.css';

const sharedItems = [
  {
    id: 'overview',
    label: 'Overview',
    path: '/dashboard',
    icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  },
  {
    id: 'transactions',
    label: 'Transaction Verification',
    path: '/verify',
    icon: 'M6 5h8a4 4 0 0 1 4 4v10m-4-3 4 3 4-3M6 19h4a4 4 0 0 0 4-4V5m-4 3-4-3-4 3',
  },
  {
    id: 'documents',
    label: 'AI Document Verification',
    path: '/documents',
    icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6m-11 5 2 2 4-4',
  },
  {
    id: 'registry',
    label: 'FDR Registry',
    path: '/calculator',
    icon: 'M3 9h18M5 9v11m4-11v11m6-11v11m4-11v11M3 20h18M2 7l10-5 10 5z',
  },
  {
    id: 'maturity',
    label: 'Maturity Tracker',
    path: '/maturities',
    icon: 'M4 5h16v16H4zM8 3v4m8-4v4M4 10h16m-5 5v3l2 1',
  },
  {
    id: 'releases',
    label: 'Release / Refund Requests',
    path: '/release-requests',
    icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6m-11 5 2 2 5-5',
  },
  {
    id: 'assistant',
    label: 'AI Assistant',
    path: '/assistant',
    icon: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z',
  },
  {
    id: 'reports',
    label: 'Audit & Reports',
    path: '/audit',
    icon: 'm3 17 6-6 4 4 8-9M15 6h6v6',
  },
];

const settingsItem = {
  id: 'settings',
  label: 'Settings',
  path: '/calculator',
  icon: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4',
};

const institutionLabels = {
  overview: 'Dashboard',
  transactions: 'Transactions',
  documents: 'Upload Documents',
  registry: 'FDR / Deposit Details',
  maturity: 'Maturity Tracker',
  releases: 'Release / Refund Request',
  assistant: 'AI Assistant',
  reports: 'Reports',
  settings: 'Profile & Settings',
};

function SidebarItem({ item, active, onClick, label }) {
  const content = (
    <>
      <svg className="portal-sidebar-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d={item.icon} />
      </svg>
      <span>{label || item.label}</span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={`portal-sidebar-link${active ? ' is-active' : ''}`}
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      to={item.path}
      className={`portal-sidebar-link${active ? ' is-active' : ''}`}
      aria-current={active ? 'page' : undefined}
    >
      {content}
    </Link>
  );
}

export default function PortalSidebar({ kind = 'officer', onOverview }) {
  const location = useLocation();
  const isInstitution = kind === 'institution';
  const brandSubtitle = isInstitution ? 'Institution Portal' : 'Officer Command Centre';
  const getLabel = (item) => isInstitution ? institutionLabels[item.id] : item.label;
  const isActive = (item) => (
    item.id === 'overview'
      ? location.pathname === '/dashboard'
      : item.path === location.pathname
  );

  return (
    <aside className="portal-sidebar">
      <div className="portal-sidebar-brand">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        <div>
          <strong>AICTE Portal</strong>
          <small>{brandSubtitle}</small>
        </div>
      </div>
      <nav className="portal-sidebar-nav" aria-label={`${brandSubtitle} navigation`}>
        <div className="portal-sidebar-main-items">
          {sharedItems.map((item) => (
            <SidebarItem
              key={item.id}
              item={item}
              label={getLabel(item)}
              active={isActive(item)}
              onClick={item.id === 'overview' ? onOverview : undefined}
            />
          ))}
        </div>
        <div className="portal-sidebar-settings">
          <SidebarItem
            item={settingsItem}
            label={getLabel(settingsItem)}
            active={false}
          />
        </div>
      </nav>
    </aside>
  );
}
