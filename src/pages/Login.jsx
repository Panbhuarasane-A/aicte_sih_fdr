import { useLayoutEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { usePortal } from '../context/PortalContext.jsx';

export default function Login() {
  const { user } = usePortal();
  const [kind, setKind] = useState('institution');
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
          <p className="login-intro login-motion">Sign in to continue to your workspace.</p>
          <div className="login-tabs login-motion" aria-label="Login type">
            <button type="button" aria-pressed={kind === 'institution'} className={kind === 'institution' ? 'is-selected' : ''} onClick={() => setKind('institution')}>Institution</button>
            <button type="button" aria-pressed={kind === 'officer'} className={kind === 'officer' ? 'is-selected' : ''} onClick={() => setKind('officer')}>AICTE Officer</button>
          </div>
          <div className="login-unavailable login-motion" role="status">
            <strong>Authentication unavailable</strong>
            <span>AICTE sign-in service is not connected yet.</span>
          </div>
          <fieldset className="login-form login-motion" disabled>
            <label className="sr" htmlFor="login-id">{kind === 'institution' ? 'AICTE institution ID' : 'AICTE officer ID'}</label>
            <div className="login-input-wrap">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0" /></svg>
              <input id="login-id" autoComplete="username" placeholder={kind === 'institution' ? 'AICTE ID' : 'Officer ID'} />
            </div>
            <label className="sr" htmlFor="login-password">Password</label>
            <div className="login-input-wrap">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 1 1 8 0v3" /></svg>
              <input id="login-password" type="password" autoComplete="current-password" placeholder="Password" />
            </div>
          </fieldset>
          <div className="login-help login-motion"><span>Password reset is available through AICTE support.</span></div>
          <button className="login-submit login-motion" type="button" disabled>Log in <span aria-hidden="true">→</span></button>
          {kind === 'officer' && (
            <p className="login-register login-motion">Need to view the layout? <Link to="/officer-preview">Open read-only preview</Link></p>
          )}
          {kind === 'institution' && (
            <>
              <p className="login-register login-motion">Already registered? <Link to="/institution-preview">View institution portal</Link></p>
              <p className="login-register login-motion">New institution? <Link to="/register">Request access</Link></p>
            </>
          )}
          <p className="login-privacy login-motion">Your credentials are not collected while sign-in is unavailable.</p>
        </div>
        <div className="login-illustration login-motion">
          <img src="/aicte-login-banner.png" alt="AICTE and Government of India emblem over the Parliament and India Gate, framed by the Indian tricolour" />
        </div>
      </section>
    </main>
  );
}
