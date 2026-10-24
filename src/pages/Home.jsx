import { Link } from 'react-router-dom';

const FEATURES = [
  ['Verify transactions', 'Match each claimed payment with the bank statement and see the evidence behind every flag.', '/verify'],
  ['Check documents', 'Compare FDR and affidavit fields with the submitted record and surface discrepancies for review.', '/documents'],
  ['Ask in plain language', 'Query deposits, maturities and release requests without filtering tables by hand.', '/assistant'],
];
const PRINCIPLES = [
  'Submitted details are never treated as verified until an authorised officer confirms them.',
  'A statement match shows consistency with that statement, not final authorisation.',
  'The system flags and routes cases. It does not approve, reject or release.',
  'Access follows role and region on every screen, including the assistant.',
];

function Illustration() {
  return (
    <svg viewBox="0 0 480 360" role="img" aria-label="Illustration of a verified fixed deposit receipt beside a bank statement and a shield with a tick mark" className="illus">
      <rect x="1" y="1" width="478" height="358" rx="8" fill="#F4F6F8" stroke="#D5DAE1" />
      <rect x="48" y="56" width="228" height="248" rx="6" fill="#fff" stroke="#1D0A69" strokeWidth="2" />
      <rect x="72" y="84" width="120" height="12" rx="2" fill="#1D0A69" />
      {[120, 148, 176, 204].map((y) => <rect key={y} x="72" y={y} width="168" height="8" rx="2" fill="#D5DAE1" />)}
      <rect x="72" y="236" width="88" height="40" rx="4" fill="none" stroke="#138808" strokeWidth="2" />
      <text x="116" y="262" textAnchor="middle" fontSize="16" fontWeight="600" fill="#138808">FDR</text>
      <rect x="236" y="104" width="196" height="200" rx="6" fill="#fff" stroke="#003366" strokeWidth="2" />
      {[132, 160, 188, 216].map((y) => (<g key={y}><rect x="256" y={y} width="72" height="8" rx="2" fill="#D5DAE1" /><rect x="344" y={y} width="68" height="8" rx="2" fill="#003366" /></g>))}
      <path d="M368 252 l32 12 v28 c0 16 -14 26 -32 34 c-18 -8 -32 -18 -32 -34 v-28 z" fill="#1D0A69" />
      <path d="M354 288 l10 10 l20 -22" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="48" y="320" width="384" height="4" fill="#FF9933" />
    </svg>
  );
}

export default function Home() {
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div>
          <h1 id="hero-title" className="h1">One place to track every security deposit and FDR</h1>
          <p className="lead">Submit, verify, monitor and release security deposits and fixed deposit receipts for AICTE-approved institutions, with a clear record of every action.</p>
          <div className="actions">
            <Link className="btn primary" to="/dashboard">Open dashboard</Link>
            <Link className="btn secondary" to="/verify">Verify a transaction</Link>
          </div>
        </div>
        <Illustration />
      </section>

      <section className="section" aria-labelledby="feat-title">
        <h2 id="feat-title" className="h2">What you can do</h2>
        <div className="grid3">
          {FEATURES.map(([t, d, to]) => (
            <article className="card" key={t}>
              <h3 className="h3">{t}</h3>
              <p>{d}</p>
              <Link className="textlink" to={to}>Go to {t.toLowerCase()}</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="section alt" aria-labelledby="prin-title">
        <h2 id="prin-title" className="h2">How the portal stays accountable</h2>
        <ul className="plain">{PRINCIPLES.map((p) => <li key={p}>{p}</li>)}</ul>
      </section>
    </>
  );
}