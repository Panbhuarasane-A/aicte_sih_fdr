import { NavLink, Outlet, Link } from 'react-router-dom';
import { usePortal } from '../context/PortalContext.jsx';
import { ROLES, INST } from '../data/seed.js';

export default function Layout() {
  const { role, user, signOut } = usePortal();
  const nav = user.kind === 'officer'
    ? [['/dashboard', 'Officer dashboard'], ['/verify', 'Verify transactions'], ['/documents', 'Document check'], ['/assistant', 'Assistant'], ['/calculator', 'Deposit & penalty'], ['/audit', 'Audit trail']]
    : [['/', 'Home'], ['/dashboard', 'Dashboard'], ['/verify', 'Verify transactions'], ['/documents', 'Document check'], ['/assistant', 'Assistant'], ['/calculator', 'Deposit & penalty'], ['/audit', 'Audit trail']];
  const roleLabel = user.kind === 'institution'
    ? INST.find((institution) => institution.id === user.institutionId)?.name
    : ROLES[role];
  return (
    <>
      <a className="skip" href="#main">Skip to main content</a>
      <div className="strip" aria-hidden="true"><i /><i /><i /></div>
      <header className="site-header">
        <div className="container header-row">
          <Link to="/" className="brand">
            <img className="portal-logo" src="/india-gov-portal.png" alt="National Portal of India" />
            <span>
              <strong>Security Deposit / FDR Management Portal</strong>
              <small>All India Council for Technical Education · Regulation Bureau</small>
            </span>
          </Link>
          <div className="session-user">
            <span>Signed in as <strong>{user.kind === 'officer' ? 'AICTE Officer' : 'Institution'}</strong></span>
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
          <p>Portal data, authentication, registration notifications, and official rules must be connected to authorized AICTE services.</p>
        </div>
      </footer>
    </>
  );
}