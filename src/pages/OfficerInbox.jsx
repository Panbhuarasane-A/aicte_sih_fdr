import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import E from '../lib/engine.js';
import { ROLEREG } from '../data/seed.js';
import { usePortal } from '../context/PortalContext.jsx';
import { Badge, DataTable, PageHead } from '../components/ui.jsx';

export default function OfficerInbox() {
  const { role, user, registrationRequests, updateRegistration, log } = usePortal();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const visibleRequests = useMemo(() => registrationRequests.filter((request) => (
    role === 'head' || request.region === ROLEREG[role]
  )), [registrationRequests, role]);
  const newRequests = visibleRequests.filter((request) => request.status === 'New');

  function search(event) {
    event.preventDefault();
    if (!query.trim()) return;
    const response = E.ask(query, role);
    log(`Officer searched: ${query}${response.denied ? ' (refused)' : ''}`);
    setResult(response);
  }

  function markReviewed(request) {
    updateRegistration(request.id, 'Under review');
  }

  return (
    <>
      <PageHead title="AICTE Officer dashboard" sub="Review institution onboarding requests and search deposit records within your authorized scope." />
      <section className="card officer-notifications" aria-labelledby="notifications-title">
        <div className="officer-section-heading">
          <div><p className="meta">IN-PORTAL NOTIFICATIONS</p><h2 id="notifications-title" className="h3">Institution registration requests</h2></div>
          <span className="notification-count" aria-label={`${newRequests.length} new requests`}>{newRequests.length} new</span>
        </div>
        {visibleRequests.length ? <DataTable
          head={['Institution', 'Region', 'Contact / email', 'Received', 'Status', 'Action']}
          rows={visibleRequests.map((request) => [
            request.institutionName,
            request.region,
            <>{request.contactName}<br /><span className="meta">{request.email}</span></>,
            request.submittedAt,
            <Badge tone={request.status === 'New' ? 'warn' : 'info'}>{request.status}</Badge>,
            request.status === 'New' ? <button className="btn secondary btn-small" onClick={() => markReviewed(request)}>Mark under review</button> : '—',
          ])}
        /> : <div className="empty-notifications"><strong>No registration requests available</strong><p>AICTE registration and notification services are not connected. Requests cannot be received or reviewed in this portal yet.</p></div>}
        <p className="meta notification-note">Showing {user.name}’s authorized {role === 'head' ? 'all-region' : 'regional'} registration queue.</p>
      </section>

      <section className="card officer-search" aria-labelledby="search-title">
        <div className="officer-section-heading">
          <div><p className="meta">RECORDS QUERY</p><h2 id="search-title" className="h3">Search the deposit database</h2></div>
          <Badge tone="info">Role-scoped results</Badge>
        </div>
        <p>Ask a question in plain language. Results are limited to the records this officer role can access.</p>
        <form className="askrow" onSubmit={search}>
          <label className="sr" htmlFor="officer-query">Natural-language search</label>
          <input id="officer-query" type="text" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Enter a natural-language records query" />
          <button className="btn primary" type="submit">Search records</button>
        </form>
        {result && <article className="search-result" aria-live="polite">
          <h3 className="h3">{result.title} {result.denied && <Badge tone="bad">Access denied</Badge>}</h3>
          <ul className="evidence">{result.rows.map((row) => <li key={row}>{row}</li>)}</ul>
          {result.src && <Link className="btn secondary" to={result.src === 'ver' ? '/verify' : '/dashboard'}>Open matching records</Link>}
        </article>}
      </section>
    </>
  );
}
