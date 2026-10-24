import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePortal } from '../context/PortalContext.jsx';
import { Badge, PageHead } from '../components/ui.jsx';
import PortalSidebar from '../components/PortalSidebar.jsx';
import { api } from '../lib/api.js';
import '../styles/officer-assistant.css';

const assistantPrompts = [
  ['FDRs maturing in 30 days', 'Which FDRs are maturing in the next 30 days?'],
  ['Unmatched transactions', 'Which transactions have not been matched?'],
  ['Missing release documents', 'Show release requests with missing documents'],
  ['Why was Coimbatore flagged?', 'Why was Coimbatore College of Engineering flagged?'],
];

function OfficerAssistant() {
  const { user, signOut } = usePortal();
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);

  const officerName = user?.name || 'AICTE Officer';
  const officerRole = user?.role === 'head'
    ? 'Regulation Bureau Head'
    : user?.region_scope
      ? `Scrutiny Officer, ${user.region_scope}`
      : 'AICTE Regulation Bureau';

  const ask = async (text = question) => {
    if (!text.trim() || loading) return;
    setQuestion(text);
    setLoading(true);
    setError('');
    setAnswer(null);
    try {
      setAnswer(await api.askAssistant(text.trim()));
    } catch (requestError) {
      setError(`Assistant request failed: ${requestError.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="oa-page">
      <header className="oa-header">
        <img
          className="oa-banner"
          src="/aicte-tricolor-heritage-header.png"
          alt="AICTE — Technical Education for a Stronger India"
        />
        <div className="oa-header-actions">
          <button className="oa-notification" type="button" aria-label="Notifications">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M10 21h4" />
            </svg>
            <b>3</b>
          </button>
          <div className="oa-profile-wrap">
            <button
              className="oa-profile"
              type="button"
              onClick={() => setProfileOpen((open) => !open)}
              aria-expanded={profileOpen}
            >
              <span className="oa-avatar">{officerName.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span>
              <span className="oa-profile-copy"><strong>{officerName}</strong><small>{officerRole}</small></span>
              <span className="oa-chevron" aria-hidden="true">⌄</span>
            </button>
            {profileOpen && (
              <div className="oa-profile-menu">
                <span>{officerName}</span>
                <button type="button" onClick={() => { signOut(); navigate('/login'); }}>Sign out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="oa-layout">
        <PortalSidebar />

        <main className="oa-main">
          <div className="oa-title">
            <span className="oa-robot-icon" aria-hidden="true">●</span>
            <div>
              <h1>Natural Language Records Assistant</h1>
              <p>Ask questions in plain language. Get accurate information from your records.</p>
            </div>
          </div>

          <form className="oa-query" onSubmit={(event) => { event.preventDefault(); ask(); }}>
            <span className="oa-sparkle" aria-hidden="true">✦</span>
            <label className="sr" htmlFor="officer-assistant-query">Ask a question about your records</label>
            <input
              id="officer-assistant-query"
              type="text"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder='Type your question here... e.g. "Show me FDRs maturing in 30 days"'
            />
            <button type="submit" aria-label="Send question" disabled={loading || !question.trim()}>
              {loading ? '…' : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13" />
                </svg>
              )}
            </button>
          </form>

          <section className="oa-suggestions" aria-labelledby="oa-suggestions-title">
            <h2 id="oa-suggestions-title"><span aria-hidden="true">♧</span> Try asking</h2>
            <div className="oa-prompt-list">
              {assistantPrompts.map(([label, prompt]) => (
                <button key={label} type="button" onClick={() => ask(prompt)} disabled={loading}>
                  {label}<span aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          </section>

          {error && <p className="oa-error" role="alert">{error}</p>}
          {answer && (
            <article className="oa-answer" aria-live="polite">
              <div className="oa-answer-heading">
                <h2>{answer.title || 'Assistant Results'}</h2>
                {answer.access_denied
                  ? <Badge tone="bad">Access denied: Out of scope</Badge>
                  : <Badge tone="ok">{answer.intent_matched || 'RESULTS'}</Badge>}
              </div>
              <ul>
                {(answer.rows || []).map((row, index) => <li key={`${index}-${row}`}>{row}</li>)}
              </ul>
              {answer.evidence_route && (
                <Link className="oa-evidence-link" to={answer.evidence_route}>Open evidence view</Link>
              )}
            </article>
          )}
        </main>
      </div>
    </div>
  );
}

export default function Assistant() {
  const { user } = usePortal();
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);

  if (user?.kind === 'officer') return <OfficerAssistant />;

  const run = async (text) => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const response = await api.askAssistant(text.trim());
      setRes(response);
    } catch (err) {
      alert(`Assistant error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSampleClick = (sample) => {
    setQ(sample);
    run(sample);
  };

  return (
    <>
      <PageHead
        title="Natural Language Records Assistant"
        sub="Ask questions in plain language. Answers use parameterised queries filtered strictly to your authorized role and regional scope."
      />

      <form className="askrow" onSubmit={(e) => { e.preventDefault(); run(q); }}>
        <label htmlFor="q" className="sr">Question</label>
        <input
          id="q"
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask about maturing FDRs, unmatched transactions, release requests or flags..."
        />
        <button className="btn primary" type="submit" disabled={loading}>
          {loading ? 'Searching...' : 'Ask Assistant'}
        </button>
      </form>

      <div style={{ margin: '1rem 0', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <small style={{ color: '#64748b', fontWeight: 600 }}>Suggested queries:</small>
        <button type="button" className="btn btn-small secondary" onClick={() => handleSampleClick('FDRs maturing in the next 30 days')}>
          FDRs maturing in 30 days
        </button>
        <button type="button" className="btn btn-small secondary" onClick={() => handleSampleClick('Which transactions have not been matched?')}>
          Unmatched transactions
        </button>
        <button type="button" className="btn btn-small secondary" onClick={() => handleSampleClick('Show release requests with missing documents')}>
          Missing release documents
        </button>
        <button type="button" className="btn btn-small secondary" onClick={() => handleSampleClick('Why was Coimbatore College of Engineering flagged?')}>
          Why was Coimbatore flagged?
        </button>
      </div>

      <div aria-live="polite">
        {res && (
          <article className="card" style={{ marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="h3" style={{ margin: 0 }}>{res.title}</h2>
              {res.access_denied ? (
                <Badge tone="bad">Access denied: Out of scope</Badge>
              ) : (
                <Badge tone="ok">{res.intent_matched}</Badge>
              )}
            </div>

            <ul className="evidence" style={{ marginTop: '1rem' }}>
              {res.rows.map((x, idx) => <li key={idx}>{x}</li>)}
            </ul>

            {res.evidence_route && (
              <div style={{ marginTop: '1rem' }}>
                <Link className="btn secondary" to={res.evidence_route}>
                  Open Evidence View ({res.evidence_route})
                </Link>
              </div>
            )}
          </article>
        )}
      </div>
    </>
  );
}
