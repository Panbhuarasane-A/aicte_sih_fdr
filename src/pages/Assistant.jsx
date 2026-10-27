import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePortal } from '../context/PortalContext.jsx';
import { Badge, PageHead } from '../components/ui.jsx';
import PortalSidebar from '../components/PortalSidebar.jsx';
import NotificationButton from '../components/NotificationButton.jsx';
import { assistantRepo } from '../data/repositories.js';
import '../styles/officer-assistant.css';

const assistantPrompts = [
  ['FDRs maturing in 30 days', 'Which FDRs are maturing in the next 30 days?'],
  ['Unmatched transactions', 'Which transactions have not been matched?'],
  ['Missing release documents', 'Show release requests with missing documents'],
  ['Why was Coimbatore flagged?', 'Why was Coimbatore College of Engineering flagged?'],
  ['Mismatch cases as a graph', 'Show the top mismatch cases as a graph.'],
  ['Unmatched claims in Excel', 'Give me an Excel sheet of unmatched claims.'],
  ['Mismatch graph + Excel', 'Show the top mismatch cases as a graph and give me an Excel sheet.'],
];

const LOADING_STEPS = [
  'Checking authorized role permissions & regional jurisdiction...',
  'Scanning verified FDRs, payment claims & statement records...',
  'Validating regulatory compliance & audit statuses...',
  'Synthesizing grounded executive summary with Gemini AI...',
];

function AssistantChart({ chart }) {
  if (!chart?.series?.length) return null;
  const maxValue = Math.max(...chart.series.map((item) => Number(item.value) || 0), 1);

  return (
    <div className="oa-chart-plot" role="img" aria-label={`${chart.title}: ${chart.series.map((item) => `${item.label} ${item.value}`).join(', ')}`}>
      {chart.series.map((item) => (
        <div className="oa-chart-row" key={item.label}>
          <span className="oa-chart-label">{item.label}</span>
          <span className="oa-chart-track">
            <span className="oa-chart-value" style={{ width: `${Math.max(3, ((Number(item.value) || 0) / maxValue) * 100)}%` }} />
          </span>
          <strong className="oa-chart-number">{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function OfficerAssistant() {
  const { user, signOut } = usePortal();
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activePrompt, setActivePrompt] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);

  const officerName = user?.name || 'AICTE Officer';
  const officerRole = user?.role === 'head'
    ? 'Regulation Bureau Head'
    : user?.region_scope
      ? `Scrutiny Officer, ${user.region_scope}`
      : 'AICTE Regulation Bureau';

  useEffect(() => {
    let timerInterval = null;
    let stepInterval = null;

    if (loading) {
      setElapsedTime(0);
      setStepIndex(0);

      timerInterval = setInterval(() => {
        setElapsedTime((prev) => +(prev + 0.1).toFixed(1));
      }, 100);

      stepInterval = setInterval(() => {
        setStepIndex((prev) => (prev + 1) % LOADING_STEPS.length);
      }, 1400);
    }

    return () => {
      if (timerInterval) clearInterval(timerInterval);
      if (stepInterval) clearInterval(stepInterval);
    };
  }, [loading]);

  const ask = async (text = question, promptKey = null) => {
    if (!text.trim() || loading) return;
    setQuestion(text);
    setActivePrompt(promptKey);
    setLoading(true);
    setError('');
    setAnswer(null);
    try {
      const normalizedText = text.trim();
      const response = await assistantRepo.ask(normalizedText);
      setAnswer(response);
      if (response.result_id && /\b(excel|xlsx)\b/i.test(normalizedText)) {
        await downloadAssistantFile(response.result_id, 'xlsx');
      } else if (response.result_id && /\bcsv\b/i.test(normalizedText)) {
        await downloadAssistantFile(response.result_id, 'csv');
      }
    } catch (requestError) {
      setError(`Assistant request failed: ${requestError.message}`);
    } finally {
      setLoading(false);
      setActivePrompt(null);
    }
  };

  const downloadAssistantFile = async (resultId, format) => {
    try {
      const blob = await assistantRepo.exportResult(resultId, format);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `AICTE_assistant_result.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(`Export failed: ${downloadError.message}`);
    }
  };

  const downloadResult = async (format) => {
    if (!answer?.result_id) return;
    await downloadAssistantFile(answer.result_id, format);
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
          <NotificationButton className="oa-notification" />
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
            <button
              type="submit"
              aria-label={loading ? 'Processing question...' : 'Send question'}
              disabled={loading || !question.trim()}
            >
              {loading ? (
                <svg className="oa-spinner-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeDasharray="42"
                    strokeDashoffset="14"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13" />
                </svg>
              )}
            </button>
          </form>

          <section className="oa-suggestions" aria-labelledby="oa-suggestions-title">
            <h2 id="oa-suggestions-title"><span aria-hidden="true">♧</span> Try asking</h2>
            <div className="oa-prompt-list">
              {assistantPrompts.map(([label, prompt]) => {
                const isPromptLoading = loading && activePrompt === label;
                return (
                  <button
                    key={label}
                    type="button"
                    className={isPromptLoading ? 'is-loading' : ''}
                    onClick={() => ask(prompt, label)}
                    disabled={loading}
                  >
                    {label}
                    {isPromptLoading ? (
                      <span className="oa-mini-spinner" aria-hidden="true" />
                    ) : (
                      <span aria-hidden="true">→</span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {error && <p className="oa-error" role="alert">{error}</p>}

          {loading && (
            <article className="oa-loading-card" aria-live="polite">
              <div className="oa-loading-header">
                <div className="oa-loading-badge">
                  <div className="oa-loading-orb">
                    <div className="oa-loading-orb-inner" />
                  </div>
                  <span>Consulting AICTE Regulatory Assistant...</span>
                </div>
                <div className="oa-loading-timer">
                  <span
                    className="oa-mini-spinner"
                    style={{
                      width: '11px',
                      height: '11px',
                      borderWidth: '1.5px',
                      borderColor: '#475569',
                      borderTopColor: 'transparent',
                    }}
                  />
                  <span>{elapsedTime.toFixed(1)}s elapsed</span>
                </div>
              </div>

              <div className="oa-loading-progress-message">
                <span className="oa-progress-dot" aria-hidden="true" />
                <span>{LOADING_STEPS[stepIndex]}</span>
              </div>

              <div className="oa-skeleton oa-skeleton-box" />
              <div className="oa-skeleton oa-skeleton-line w-95" />
              <div className="oa-skeleton oa-skeleton-line w-80" />
              <div className="oa-skeleton oa-skeleton-line w-60" />
              <div className="oa-skeleton oa-skeleton-line w-40" />
            </article>
          )}

          {answer && !loading && (
            <article className="oa-answer" aria-live="polite">
              <div className="oa-answer-heading">
                <h2>{answer.title || 'Assistant Results'}</h2>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {answer.gemini_powered && (
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', background: '#dbeafe', color: '#1e40af' }}>
                      ✨ Gemini Powered
                    </span>
                  )}
                  {answer.access_denied
                    ? <Badge tone="bad">Access denied: Out of scope</Badge>
                    : <Badge tone="ok">{answer.intent_matched || 'RESULTS'}</Badge>}
                  {answer.mode && <span className="oa-mode-badge">{answer.mode === 'basic' ? 'Basic mode' : 'AI mode'}</span>}
                </div>
              </div>

              {answer.ai_summary && (
                <div style={{
                  padding: '14px 18px',
                  backgroundColor: '#eff6ff',
                  borderLeft: '4px solid #2563eb',
                  borderRadius: '6px',
                  marginBottom: '16px',
                  color: '#1e3a8a',
                  lineHeight: '1.6',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '12px', color: '#1d4ed8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <span>✨</span>
                    <span>Gemini AI Executive Synthesis</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '14px' }}>{answer.ai_summary}</p>
                </div>
              )}

              {answer.interpretation?.text && (
                <div className="oa-interpretation">
                  <strong>Interpretation</strong>
                  <span>{answer.interpretation.text}</span>
                </div>
              )}
              {answer.summary_text && <p className="oa-summary-text">{answer.summary_text}</p>}
              {answer.kpis?.length > 0 && (
                <div className="oa-kpi-strip">
                  {answer.kpis.map((kpi) => <div key={kpi.label}><small>{kpi.label}</small><strong>{kpi.value}</strong></div>)}
                </div>
              )}
              {answer.charts?.length > 0 && (
                <div className="oa-chart-card">
                  <strong>{answer.charts[0].title}</strong>
                  <AssistantChart chart={answer.charts[0]} />
                  <small>{answer.charts[0].note}</small>
                </div>
              )}
              {answer.table && (
                <div className="oa-result-table-wrap">
                  <table className="oa-result-table">
                    <thead><tr>{answer.table.columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
                    <tbody>{answer.table.rows.map((row, index) => <tr key={index}>{answer.table.columns.map((column) => <td key={column.key}>{row[column.key]}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              )}
              {!answer.table && (
                <ul>
                  {(answer.rows || []).map((row, index) => <li key={`${index}-${row}`}>{row}</li>)}
                </ul>
              )}
              {answer.data_as_of && (
                <p className="oa-answer-meta">
                  {answer.table?.total_rows ?? answer.rows?.length ?? 0} row(s) · Data as of {new Date(answer.data_as_of).toLocaleString()}
                </p>
              )}
              {answer.result_id && <div className="oa-answer-actions">
                <span className="oa-export-hint">Data export</span>
                <button type="button" onClick={() => downloadResult('xlsx')}>Download Excel</button>
                <button type="button" onClick={() => downloadResult('csv')}>Download CSV</button>
              </div>}
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
  const [activePrompt, setActivePrompt] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    let timer = null;
    if (loading) {
      setElapsedTime(0);
      timer = setInterval(() => setElapsedTime((prev) => +(prev + 0.1).toFixed(1)), 100);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [loading]);

  if (user?.kind === 'officer') return <OfficerAssistant />;

  const run = async (text, label = null) => {
    if (!text.trim() || loading) return;
    setLoading(true);
    setActivePrompt(label);
    setRes(null);
    try {
      const response = await assistantRepo.ask(text.trim());
      setRes(response);
    } catch (err) {
      alert(`Assistant error: ${err.message}`);
    } finally {
      setLoading(false);
      setActivePrompt(null);
    }
  };

  const handleSampleClick = (sample, label) => {
    setQ(sample);
    run(sample, label);
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
          {loading ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <span
                className="oa-mini-spinner"
                style={{ borderTopColor: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}
              />
              <span>Searching ({elapsedTime.toFixed(1)}s)...</span>
            </span>
          ) : (
            'Ask Assistant'
          )}
        </button>
      </form>

      <div style={{ margin: '1rem 0', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <small style={{ color: '#64748b', fontWeight: 600 }}>Suggested queries:</small>
        {assistantPrompts.map(([label, prompt]) => (
          <button
            key={label}
            type="button"
            className={`btn btn-small secondary ${loading && activePrompt === label ? 'is-loading' : ''}`}
            onClick={() => handleSampleClick(prompt, label)}
            disabled={loading}
          >
            {label}
          </button>
        ))}
      </div>

      <div aria-live="polite">
        {loading && (
          <article className="oa-loading-card" style={{ marginTop: '1.5rem' }}>
            <div className="oa-loading-header">
              <div className="oa-loading-badge">
                <div className="oa-loading-orb">
                  <div className="oa-loading-orb-inner" />
                </div>
                <span>Consulting AICTE Regulatory Assistant...</span>
              </div>
              <div className="oa-loading-timer">
                <span
                  className="oa-mini-spinner"
                  style={{
                    width: '11px',
                    height: '11px',
                    borderWidth: '1.5px',
                    borderColor: '#475569',
                    borderTopColor: 'transparent',
                  }}
                />
                <span>{elapsedTime.toFixed(1)}s elapsed</span>
              </div>
            </div>
            <div className="oa-skeleton oa-skeleton-box" />
            <div className="oa-skeleton oa-skeleton-line w-95" />
            <div className="oa-skeleton oa-skeleton-line w-80" />
            <div className="oa-skeleton oa-skeleton-line w-60" />
          </article>
        )}

        {res && !loading && (
          <article className="card" style={{ marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="h3" style={{ margin: 0 }}>{res.title}</h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {res.gemini_powered && (
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', background: '#dbeafe', color: '#1e40af' }}>
                    ✨ Gemini Powered
                  </span>
                )}
                {res.access_denied ? (
                  <Badge tone="bad">Access denied: Out of scope</Badge>
                ) : (
                  <Badge tone="ok">{res.intent_matched}</Badge>
                )}
              </div>
            </div>

            {res.ai_summary && (
              <div style={{
                padding: '14px 18px',
                backgroundColor: '#eff6ff',
                borderLeft: '4px solid #2563eb',
                borderRadius: '6px',
                marginTop: '12px',
                marginBottom: '16px',
                color: '#1e3a8a',
                lineHeight: '1.6',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '12px', color: '#1d4ed8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <span>✨</span>
                  <span>Gemini AI Synthesis</span>
                </div>
                <p style={{ margin: 0, fontSize: '14px' }}>{res.ai_summary}</p>
              </div>
            )}

            {res.mode && <span className="oa-mode-badge">{res.mode === 'basic' ? 'Basic mode' : 'AI mode'}</span>}
            {res.interpretation?.text && (
              <div className="oa-interpretation">
                <strong>Interpretation</strong>
                <span>{res.interpretation.text}</span>
              </div>
            )}
            {res.summary_text && <p className="oa-summary-text">{res.summary_text}</p>}
            {res.kpis?.length > 0 && (
              <div className="oa-kpi-strip">
                {res.kpis.map((kpi) => <div key={kpi.label}><small>{kpi.label}</small><strong>{kpi.value}</strong></div>)}
              </div>
            )}
            {res.charts?.length > 0 && (
              <div className="oa-chart-card">
                <strong>{res.charts[0].title}</strong>
                <AssistantChart chart={res.charts[0]} />
                <small>{res.charts[0].note}</small>
              </div>
            )}
            {res.table && (
              <div className="oa-result-table-wrap">
                <table className="oa-result-table">
                  <thead><tr>{res.table.columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
                  <tbody>{res.table.rows.map((row, index) => <tr key={index}>{res.table.columns.map((column) => <td key={column.key}>{row[column.key]}</td>)}</tr>)}</tbody>
                </table>
              </div>
            )}
            {!res.table && (
              <ul className="evidence" style={{ marginTop: '1rem' }}>
                {res.rows.map((x, idx) => <li key={idx}>{x}</li>)}
              </ul>
            )}
            {res.data_as_of && (
              <p className="oa-answer-meta">
                {res.table?.total_rows ?? res.rows?.length ?? 0} row(s) · Data as of {new Date(res.data_as_of).toLocaleString()}
              </p>
            )}

            {res.result_id && <div className="oa-answer-actions">
              <span className="oa-export-hint">Data export</span>
              <button type="button" onClick={() => downloadResult('xlsx')}>Download Excel</button>
              <button type="button" onClick={() => downloadResult('csv')}>Download CSV</button>
            </div>}
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
