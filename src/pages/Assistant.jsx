import { useState } from 'react';
import { Link } from 'react-router-dom';
import E from '../lib/engine.js';
import { usePortal } from '../context/PortalContext.jsx';
import { Badge, PageHead } from '../components/ui.jsx';

const ROUTE = { dash: '/dashboard', ver: '/verify' };

export default function Assistant() {
  const { role, user, log } = usePortal();
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const run = (text) => {
    if (!text.trim()) return;
    const r = E.ask(text, role, user.institutionId);
    log(`Asked: ${text}${r.denied ? ' (refused)' : ''}`);
    setRes(r);
  };
  return (
    <>
      <PageHead title="Assistant" sub="Ask in plain language. Answers use only records your role can access." />
      <form className="askrow" onSubmit={(e) => { e.preventDefault(); run(q); }}>
        <label htmlFor="q" className="sr">Question</label>
        <input id="q" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Enter a natural-language records query" />
        <button className="btn primary" type="submit">Ask</button>
      </form>
      <div aria-live="polite">
        {res && (
          <article className="card">
            <h2 className="h3">{res.title} {res.denied && <Badge tone="bad">Access denied</Badge>}</h2>
            <ul className="evidence">{res.rows.map((x) => <li key={x}>{x}</li>)}</ul>
            {res.src && <Link className="btn secondary" to={ROUTE[res.src]}>Open evidence</Link>}
          </article>
        )}
      </div>
    </>
  );
}