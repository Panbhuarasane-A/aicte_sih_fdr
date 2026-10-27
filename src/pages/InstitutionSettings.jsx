import { usePortal } from '../context/PortalContext.jsx';
import { Navigate } from 'react-router-dom';
import PortalSidebar from '../components/PortalSidebar.jsx';
import '../styles/institution-portal.css';

export default function InstitutionSettings() {
  const { user } = usePortal();
  if (user?.kind !== 'institution') return <Navigate to="/dashboard" replace />;
  const institutionName = user?.institution_name || user?.name || 'Institution';
  const institutionCode = user?.institution_id || '—';

  return (
    <div className="ipc-container">
      <div className="ipc-body-layout">
        <PortalSidebar kind="institution" />
        <main className="ipc-content">
          <section className="ipc-panel" aria-labelledby="institution-settings-title">
            <h1 id="institution-settings-title" className="ipc-main-title">Profile &amp; Settings</h1>
            <p className="ipc-sub-title">Manage your institution portal profile and account details.</p>
            <div className="ipc-settings-grid">
              <div>
                <span>Institution</span>
                <strong>{institutionName}</strong>
              </div>
              <div>
                <span>AICTE institution ID</span>
                <strong>{institutionCode}</strong>
              </div>
              <div>
                <span>Portal access</span>
                <strong>Institution Portal</strong>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
