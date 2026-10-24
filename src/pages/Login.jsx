import { useLayoutEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { usePortal } from '../context/PortalContext.jsx';

export default function Login() {
  const { user, signIn } = usePortal();
  const [kind, setKind] = useState('officer');
  const [username, setUsername] = useState('officer.head');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const screenRef = useRef(null);

  useLayoutEffect(() => {
    const screen = screenRef.current;
    if (!screen || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    const animation = gsap.fromTo(
      screen.querySelectorAll('.login-motion'),
      { autoAlpha: 0, y: 18 },
      { autoAlpha: 1, y: 0, duration: 0.65, stagger: 0.1, ease: 'power2.out' },
    );
    return () => animation.kill();
  }, []);

  if (user) return <Navigate to="/dashboard" replace />;

  const handleSelectRole = (type, userVal) => {
    setKind(type);
    setUsername(userVal);
    setPassword('admin123');
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password.');
      return;
    }
    setLoading(true);
    setError('');
    const res = await signIn(username.trim(), password.trim());
    setLoading(false);
    if (!res.ok) {
      setError(res.error || 'Authentication failed. Please verify credentials.');
    }
  };

  return (
    <main className="login-screen" ref={screenRef}>
      <section className="login-card">
        <div className="login-panel">
          <Link className="login-brand login-motion" to="/login" aria-label="AICTE FDR Portal sign in">
            <img className="login-brand-logo" src="/india-gov-portal.png" alt="" />
            <span><strong>AICTE</strong><small>FDR PORTAL</small></span>
          </Link>
          <p className="login-kicker login-motion">SECURE PORTAL ACCESS</p>
          <h1 id="login-title" className="login-title login-motion">Welcome back <span aria-hidden="true">✦</span></h1>
          <p className="login-intro login-motion">Sign in to access the AICTE FDR & Security Deposit Portal.</p>
          
          <div className="login-tabs login-motion" aria-label="Login type">
            <button
              type="button"
              aria-pressed={kind === 'officer'}
              className={kind === 'officer' ? 'is-selected' : ''}
              onClick={() => handleSelectRole('officer', 'officer.head')}
            >
              AICTE Officer
            </button>
            <button
              type="button"
              aria-pressed={kind === 'institution'}
              className={kind === 'institution' ? 'is-selected' : ''}
              onClick={() => handleSelectRole('institution', 'inst.s01')}
            >
              Institution
            </button>
          </div>

          <div style={{ marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }} className="login-motion">
            <small style={{ width: '100%', color: '#64748b', fontSize: '0.75rem', fontWeight: 600 }}>DEMO ACCOUNTS (PASSWORD: admin123):</small>
            {kind === 'officer' ? (
              <>
                <button type="button" className="btn btn-small secondary" onClick={() => handleSelectRole('officer', 'officer.head')}>Bureau Head</button>
                <button type="button" className="btn btn-small secondary" onClick={() => handleSelectRole('officer', 'officer.south')}>Scrutiny South</button>
                <button type="button" className="btn btn-small secondary" onClick={() => handleSelectRole('officer', 'officer.ne')}>Scrutiny NE</button>
                <button type="button" className="btn btn-small secondary" onClick={() => handleSelectRole('officer', 'finance.officer')}>Finance</button>
                <button type="button" className="btn btn-small secondary" onClick={() => handleSelectRole('officer', 'audit.officer')}>Auditor</button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-small secondary" onClick={() => handleSelectRole('institution', 'inst.s01')}>Bengaluru Inst (South)</button>
                <button type="button" className="btn btn-small secondary" onClick={() => handleSelectRole('institution', 'inst.ne01')}>Guwahati Acad (NE)</button>
              </>
            )}
          </div>

          {error && (
            <div style={{ padding: '0.6rem 0.8rem', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }} role="alert">
              <strong>Error:</strong> {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <fieldset className="login-form login-motion">
              <label className="sr" htmlFor="login-id">{kind === 'institution' ? 'AICTE institution ID' : 'AICTE officer ID'}</label>
              <div className="login-input-wrap">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0" /></svg>
                <input
                  id="login-id"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={kind === 'institution' ? 'AICTE ID (e.g. inst.s01)' : 'Officer ID (e.g. officer.head)'}
                  required
                />
              </div>
              <label className="sr" htmlFor="login-password">Password</label>
              <div className="login-input-wrap">
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 1 1 8 0v3" /></svg>
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                />
              </div>
            </fieldset>

            <button
              className="login-submit login-motion"
              type="submit"
              disabled={loading}
              style={{ marginTop: '1rem', width: '100%', cursor: 'pointer' }}
            >
              {loading ? 'Authenticating...' : 'Sign in to Portal'} <span aria-hidden="true">→</span>
            </button>
          </form>

          {kind === 'officer' && (
            <p className="login-register login-motion" style={{ marginTop: '1rem' }}>
              Want to see offline demo layout? <Link to="/officer-preview">Open officer preview</Link>
            </p>
          )}
          {kind === 'institution' && (
            <>
              <p className="login-register login-motion" style={{ marginTop: '1rem' }}>
                Want to see offline demo layout? <Link to="/institution-preview">Open institution preview</Link>
              </p>
              <p className="login-register login-motion">New institution? <Link to="/register">Request access</Link></p>
            </>
          )}
          <p className="login-privacy login-motion" style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '1rem' }}>
            Official Regulation Bureau Portal · Handled in accordance with DPDP Act 2023.
          </p>
        </div>
        <div className="login-illustration login-motion">
          <img src="/aicte-login-banner.png" alt="AICTE and Government of India emblem over the Parliament and India Gate, framed by the Indian tricolour" />
        </div>
      </section>
    </main>
  );
}
