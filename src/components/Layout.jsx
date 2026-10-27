import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { usePortal } from '../context/PortalContext.jsx';
import { ROLES, INST } from '../data/seed.js';

export default function Layout() {
  const { role, user, signOut } = usePortal();
  const location = useLocation();

  // Primary command centre / portal dashboards render edge-to-edge
  if (
    location.pathname === '/dashboard'
    || location.pathname === '/calculator'
    || location.pathname === '/maturities'
    || location.pathname === '/audit'
    || location.pathname === '/verify'
    || location.pathname === '/release-requests'
    || location.pathname === '/notifications'
    || location.pathname === '/announcements'
    || location.pathname === '/institution-announcements'
    || ['/documents', '/assistant'].includes(location.pathname)
  ) {
    return <Outlet />;
  }

  const nav = user?.kind === 'officer'
    ? [['/dashboard', 'Officer Command Centre'], ['/verify', 'Verify transactions'], ['/documents', 'Document check'], ['/assistant', 'Assistant'], ['/calculator', 'Deposit & penalty'], ['/audit', 'Audit trail']]
    : [['/dashboard', 'Institution Portal'], ['/verify', 'Transactions'], ['/documents', 'Upload documents'], ['/assistant', 'Assistant'], ['/calculator', 'Deposit details'], ['/audit', 'Audit trail']];

  const roleLabel = user?.kind === 'institution'
    ? (user.institution_name || user.name || 'ABC Engineering College')
    : (user?.name || ROLES[role] || 'AICTE Officer');

  return (
    <>
      <a className="skip" href="#main">Skip to main content</a>
      <div className="strip" aria-hidden="true"><i /><i /><i /></div>
      <header className="site-header">
        <div className="container header-row">
          <Link to="/dashboard" className="brand">
            <img className="portal-logo" src={`${import.meta.env.BASE_URL}india-gov-portal.png`} alt="National Portal of India" />
            <span>
              <strong>Security Deposit / FDR Management Portal</strong>
              <small>All India Council for Technical Education · Regulation Bureau</small>
            </span>
          </Link>
          <div className="session-user">
            <span>Signed in as <strong>{user?.kind === 'officer' ? 'AICTE Officer' : 'Institution'}</strong></span>
            <small>{roleLabel}</small>
            <button className="session-signout" onClick={signOut}>Sign out</button>
          </div>
        </div>
        <nav aria-label="Primary" className="nav">
          <div className="container nav-row">
            {nav.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>
            ))}
          </div>
        </nav>
      </header>
      <main id="main" className="container main"><Outlet /></main>
      <footer className="site-footer">
        <div className="container">
          <p>Official AICTE FDR & Security Deposit Management System · Regulation Bureau · Ministry of Education, Govt. of India.</p>
        </div>
      </footer>
    </>
  );
}
