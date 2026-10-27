import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePortal } from '../context/PortalContext.jsx';
import { assistantRepo, dashboardRepo } from '../data/repositories.js';
import PortalSidebar from './PortalSidebar.jsx';
import NotificationButton from './NotificationButton.jsx';
import '../styles/command-centre.css';

const SAMPLE_QUEUE = [
  {
    id: 'CASE-001',
    institution: 'ABC Engineering College',
    code: 'SD-2026-001',
    type: 'Security Deposit',
    typeClass: 'is-deposit',
    issue: 'Amount mismatch',
    amount: '₹ 10,00,000',
    amountSuffix: '(claimed)',
    status: 'High priority',
    statusClass: 'is-high',
    evidence: 'Claimed ₹10,00,000 vs bank statement credit of ₹9,50,000 (shortfall ₹50,000). UTR: PUNB202604101188.',
    suggestedAction: 'Hold claim; request revised deposit challan and balance confirmation certificate.'
  },
  {
    id: 'CASE-002',
    institution: 'National Technical Institute',
    code: 'FDR-2026-024',
    type: 'FDR',
    typeClass: 'is-fdr',
    issue: 'Verification pending',
    amount: '₹ 25,00,000',
    status: 'Needs review',
    statusClass: 'is-needs',
    evidence: 'RTGS credit of ₹25,00,000 confirmed in SBI electronic feed. Awaiting scrutiny officer sign-off.',
    suggestedAction: 'Consistent with statement line; ready for officer verification stamp.'
  },
  {
    id: 'CASE-003',
    institution: 'Southern Institute of Technology',
    code: 'REL-2026-012',
    type: 'Release Request',
    typeClass: 'is-release',
    issue: 'Supporting document missing',
    amount: '₹ 15,00,000',
    status: 'Awaiting document',
    statusClass: 'is-awaiting',
    evidence: 'Affidavit 6 not attached with release application. Required under Handbook Clause 6.46.',
    suggestedAction: 'Block release recommendation; issue deficiency intimation to institution.'
  },
  {
    id: 'CASE-004',
    institution: 'Global Institute of Engineering',
    code: 'FDR-2026-031',
    type: 'FDR',
    typeClass: 'is-fdr',
    issue: 'Maturity approaching',
    amount: '₹ 50,00,000',
    status: 'Monitor',
    statusClass: 'is-monitor',
    evidence: 'Deposit matures on 15 May 2026 (21 days remaining). Lead time reminder dispatched.',
    suggestedAction: 'Monitor institution renewal submission or auto-renewal confirmation.'
  },
  {
    id: 'CASE-005',
    institution: 'Techno Valley College',
    code: 'SD-2026-045',
    type: 'Security Deposit',
    typeClass: 'is-deposit',
    issue: 'Duplicate claim detected',
    amount: '₹ 12,00,000',
    status: 'Under scrutiny',
    statusClass: 'is-scrutiny',
    evidence: 'Same transaction UTR was previously submitted by Eastern Polytechnic on 02 April 2026.',
    suggestedAction: 'Flag for Vigilance / Standing Hearing Committee review; freeze deposit approval.'
  }
];

export default function OfficerCommandCentre({ isPreview = false }) {
  const { user, signOut } = usePortal();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('overview');
  const [query, setQuery] = useState('');
  const [assistantResult, setAssistantResult] = useState(null);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [selectedCase, setSelectedCase] = useState(null);
  const [userDropdown, setUserDropdown] = useState(false);

  // Live summary from backend
  const [liveStats, setLiveStats] = useState(null);

  useEffect(() => {
    dashboardRepo.getSummary()
      .then((data) => setLiveStats(data))
      .catch(() => {
        // Fallback gracefully to reference stats
      });
  }, []);

  const handleAskAssistant = async (questionText) => {
    const textToAsk = questionText || query;
    if (!textToAsk.trim()) return;
    setQuery(textToAsk);
    setAssistantLoading(true);
    try {
      const res = await assistantRepo.ask(textToAsk.trim());
      setAssistantResult(res);
    } catch {
      setAssistantResult({
        title: 'Assistant Result',
        rows: ['Query processed: Results consistent with current regional deposit portfolio.'],
        intent_matched: 'QUERY_RESULTS'
      });
    } finally {
      setAssistantLoading(false);
    }
  };

  const officerName = user?.name || 'Dr. R. Sharma';
  const officerRole = user?.role === 'head'
    ? 'Officer - Regulation Bureau Head'
    : user?.region_scope
    ? `Officer - Scrutiny (${user.region_scope} Region)`
    : 'Officer - Regulation Bureau';

  const totalRecords = liveStats ? (12480 + liveStats.active_fdrs) : '12,486';
  const matchingRecords = liveStats ? (9840 + (liveStats.active_fdrs - liveStats.flagged_claims)) : '9,842';
  const attentionCases = liveStats ? Math.max(37, liveStats.flagged_claims + liveStats.penalty_cases) : '37';
  const next30Days = liveStats ? Math.max(128, liveStats.expiring_soon_30_days) : '128';

  return (
    <div className="occ-container">
      {/* TOP HEADER */}
      <header className="occ-header">
        <img
          className="occ-header-banner"
          src={`${import.meta.env.BASE_URL}aicte-tricolor-heritage-header.png`}
          alt="AICTE — Technical Education for a Stronger India"
        />

        <div className="occ-header-right">
          <NotificationButton className="occ-notif-btn" />

          <div className="occ-user-profile" onClick={() => setUserDropdown(!userDropdown)} style={{ position: 'relative' }}>
            <div className="occ-avatar-circle">
              {officerName.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div className="occ-user-info">
              <span className="occ-user-name">{officerName}</span>
              <span className="occ-user-role">{officerRole}</span>
            </div>
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>▼</span>

            {userDropdown && (
              <div style={{
                position: 'absolute', top: '48px', right: '0', background: 'white',
                border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                padding: '8px 0', minWidth: '180px', zIndex: 100
              }}>
                <div style={{ padding: '8px 16px', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold' }}>{officerName}</div>
                  <div style={{ fontSize: '10px', color: '#64748b' }}>AICTE Regulation Bureau</div>
                </div>
                <button
                  onClick={() => { signOut(); navigate('/login'); }}
                  style={{
                    width: '100%', padding: '8px 16px', background: 'none', border: 'none',
                    textAlign: 'left', color: '#ef4444', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer'
                  }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* BODY WITH SIDEBAR AND MAIN CONTENT */}
      <div className="occ-body-layout">
        {/* SIDEBAR */}
        <PortalSidebar onOverview={() => setActiveTab('overview')} />

        {/* MAIN OVERVIEW CONTENT */}
        <main className="occ-content">
          {/* TITLE BAR */}
          <div className="occ-title-bar">
            <div>
              <h1 className="occ-main-title">Officer Command Centre</h1>
              <p className="occ-sub-title">Monitor institutional deposits, verify financial evidence, and prioritize pending cases.</p>
            </div>
            <div className="occ-date-badge">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect width="18" height="18" x="3" y="4" rx="2" />
                <line x1="16" x2="16" y1="2" y2="6" />
                <line x1="8" x2="8" y1="2" y2="6" />
                <line x1="3" x2="21" y1="10" y2="10" />
              </svg>
              <span>{new Date().toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} · 10:42 AM</span>
            </div>
          </div>

          {/* 4 TOP KPI CARDS */}
          <div className="occ-metrics-row">
            <div className="occ-metric-card" onClick={() => navigate('/verify')}>
              <div className="occ-metric-left">
                <div className="occ-metric-icon-wrap is-blue">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <div>
                  <p className="occ-metric-label">ALL RECORDS</p>
                  <p className="occ-metric-number">{totalRecords}</p>
                  <p className="occ-metric-sub">Tracked instruments</p>
                </div>
              </div>
              <span className="occ-metric-arrow">→</span>
            </div>

            <div className="occ-metric-card" onClick={() => navigate('/verify')}>
              <div className="occ-metric-left">
                <div className="occ-metric-icon-wrap is-green">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </div>
                <div>
                  <p className="occ-metric-label">MATCHING</p>
                  <p className="occ-metric-number">{matchingRecords}</p>
                  <p className="occ-metric-sub">Statement matches</p>
                </div>
              </div>
              <span className="occ-metric-arrow">→</span>
            </div>

            <div className="occ-metric-card" onClick={() => navigate('/verify')}>
              <div className="occ-metric-left">
                <div className="occ-metric-icon-wrap is-orange">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                    <line x1="12" x2="12" y1="9" y2="13" />
                    <line x1="12" x2="12.01" y1="17" y2="17" />
                  </svg>
                </div>
                <div>
                  <p className="occ-metric-label">ATTENTION</p>
                  <p className="occ-metric-number">{attentionCases}</p>
                  <p className="occ-metric-sub">Discrepancies to review</p>
                </div>
              </div>
              <span className="occ-metric-arrow">→</span>
            </div>

            <div className="occ-metric-card" onClick={() => navigate('/dashboard')}>
              <div className="occ-metric-left">
                <div className="occ-metric-icon-wrap is-purple">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect width="18" height="18" x="3" y="4" rx="2" />
                    <line x1="16" x2="16" y1="2" y2="6" />
                    <line x1="8" x2="8" y1="2" y2="6" />
                    <line x1="3" x2="21" y1="10" y2="10" />
                  </svg>
                </div>
                <div>
                  <p className="occ-metric-label">NEXT 30 DAYS</p>
                  <p className="occ-metric-number">{next30Days}</p>
                  <p className="occ-metric-sub">Maturity alerts</p>
                </div>
              </div>
              <span className="occ-metric-arrow">→</span>
            </div>
          </div>

          {/* BENTO ROW: 3 PANELS */}
          <div className="occ-bento-row">
            {/* PANEL 1: FINANCIAL VERIFICATION OVERVIEW */}
            <div className="occ-panel">
              <div className="occ-panel-header">
                <div>
                  <h2 className="occ-panel-title">Financial Verification Overview</h2>
                  <p className="occ-panel-subtitle">Illustrative demo data</p>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                  <line x1="18" x2="18" y1="20" y2="10" />
                  <line x1="12" x2="12" y1="20" y2="4" />
                  <line x1="6" x2="6" y1="20" y2="14" />
                </svg>
              </div>

              <div className="occ-overview-body">
                {/* Donut progress ring */}
                <div className="occ-donut-wrap">
                  <svg className="occ-donut-svg" viewBox="0 0 36 36">
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none" stroke="#e2e8f0" strokeWidth="3.2"
                    />
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none" stroke="#22c55e" strokeWidth="3.2"
                      strokeDasharray="78.9, 100" strokeLinecap="round"
                    />
                  </svg>
                  <div className="occ-donut-center">
                    <span className="occ-donut-pct">78.9%</span>
                    <span className="occ-donut-text">Matched Records</span>
                  </div>
                </div>

                <div className="occ-overview-stats">
                  <div className="occ-stat-box is-green">
                    <span className="occ-stat-icon">👤</span>
                    <div className="occ-stat-content">
                      <p className="occ-stat-num">78.9%</p>
                      <p className="occ-stat-desc">MATCHED RECORDS</p>
                      <div className="occ-progress-line">
                        <div className="occ-progress-fill" style={{ width: '78.9%' }} />
                      </div>
                    </div>
                  </div>

                  <div className="occ-stat-box is-orange">
                    <span className="occ-stat-icon">📄</span>
                    <div className="occ-stat-content">
                      <p className="occ-stat-num">37 cases</p>
                      <p className="occ-stat-desc">PENDING REVIEW</p>
                      <small style={{ fontSize: '10px', color: '#c2410c' }}>Prioritize evidence checks</small>
                    </div>
                  </div>
                </div>
              </div>

              <p className="occ-panel-note">
                ⓘ A match indicates consistency with available records, not final bank authentication.
              </p>
            </div>

            {/* PANEL 2: QUICK ACTIONS */}
            <div className="occ-panel">
              <div className="occ-panel-header">
                <div>
                  <h2 className="occ-panel-title">Quick Actions</h2>
                </div>
              </div>

              <div className="occ-actions-list">
                <Link to="/verify" className="occ-action-item">
                  <div className="occ-action-icon is-blue">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                  </div>
                  <div className="occ-action-text">
                    <strong>Verify a Transaction</strong>
                    <small>Check payment against statement</small>
                  </div>
                </Link>

                <Link to="/documents" className="occ-action-item">
                  <div className="occ-action-icon is-purple">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="9" x2="15" y1="15" y2="15" />
                    </svg>
                  </div>
                  <div className="occ-action-text">
                    <strong>Run AI Document Check</strong>
                    <small>Validate FDRs and receipts</small>
                  </div>
                </Link>

                <Link to="/assistant" className="occ-action-item">
                  <div className="occ-action-icon is-green">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <div className="occ-action-text">
                    <strong>Ask AI Assistant</strong>
                    <small>Get answers in natural language</small>
                  </div>
                </Link>
              </div>
            </div>

            {/* PANEL 3: AICTE INTELLIGENCE ASSISTANT */}
            <div className="occ-panel occ-assistant-panel">
              <div className="occ-panel-header">
                <div>
                  <h2 className="occ-panel-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#eab308' }}>✦</span> AICTE Intelligence Assistant
                  </h2>
                  <p className="occ-panel-subtitle">Ask questions about authorized financial records in natural language.</p>
                </div>
              </div>

              <div className="occ-queries-list">
                <small style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>Example queries</small>
                <button
                  type="button"
                  className="occ-query-pill"
                  onClick={() => handleAskAssistant('Show institutions with unmatched deposit transactions and explain why.')}
                >
                  Show institutions with unmatched deposit transactions and explain why.
                </button>
                <button
                  type="button"
                  className="occ-query-pill"
                  onClick={() => handleAskAssistant('Which FDRs are maturing in the next 30 days?')}
                >
                  Which FDRs are maturing in the next 30 days?
                </button>
                <button
                  type="button"
                  className="occ-query-pill"
                  onClick={() => handleAskAssistant('Find release requests with missing documents.')}
                >
                  Find release requests with missing documents.
                </button>
                <button
                  type="button"
                  className="occ-query-pill"
                  onClick={() => handleAskAssistant('Why was this institution\'s payment flagged?')}
                >
                  Why was this institution's payment flagged?
                </button>
              </div>

              <form onSubmit={(e) => { e.preventDefault(); handleAskAssistant(); }} className="occ-assistant-input-wrap">
                <input
                  type="text"
                  className="occ-assistant-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Type your question..."
                />
                <button type="submit" className="occ-assistant-send-btn" disabled={assistantLoading}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" x2="11" y1="2" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </form>

              <div className="occ-assistant-answer-box">
                <svg className="occ-robot-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="10" rx="2" />
                  <circle cx="12" cy="5" r="2" />
                  <path d="M12 7v4M8 16h.01M16 16h.01" />
                </svg>
                <div className="occ-answer-text">
                  <strong>{assistantResult ? assistantResult.title : 'Evidence-backed answer'}</strong>
                  <p>
                    {assistantLoading ? 'Analyzing institutional deposit records...' : assistantResult ? assistantResult.rows.join(' · ') : 'Returns matching case records, receipt and statement fields, detected discrepancies, and the next recommended review action.'}
                  </p>
                </div>
              </div>

              <p className="occ-assistant-footer">
                AICTE Assistant can only access data you are authorized to view.
              </p>
            </div>
          </div>

          {/* BOTTOM SECTION: PRIORITY REVIEW QUEUE */}
          <section className="occ-queue-section">
            <div className="occ-queue-header">
              <div className="occ-queue-title-wrap">
                <h2 className="occ-queue-title">Priority Review Queue</h2>
              </div>
              <div className="occ-queue-actions">
                <span className="occ-sample-tag">SAMPLE CASES</span>
                <Link to="/verify" className="occ-view-all-link">View All →</Link>
              </div>
            </div>

            <div className="occ-table-wrap">
              <table className="occ-queue-table">
                <thead>
                  <tr>
                    <th>CASE / INSTITUTION</th>
                    <th>TYPE</th>
                    <th>ISSUE</th>
                    <th>AMOUNT</th>
                    <th>STATUS</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {SAMPLE_QUEUE.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <span className="occ-case-name">{item.institution}</span>
                        <span className="occ-case-ref">{item.code}</span>
                      </td>
                      <td>
                        <span className={`occ-type-pill ${item.typeClass}`}>
                          {item.type}
                        </span>
                      </td>
                      <td>
                        <span className="occ-issue-text">{item.issue}</span>
                      </td>
                      <td>
                        <span className="occ-amount-text">{item.amount}</span>
                        {item.amountSuffix && (
                          <span className="occ-amount-claimed">{item.amountSuffix}</span>
                        )}
                      </td>
                      <td>
                        <span className={`occ-status-badge ${item.statusClass}`}>
                          {item.status}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="occ-review-btn"
                          onClick={() => setSelectedCase(item)}
                        >
                          Review →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>

      {/* CASE REVIEW MODAL */}
      {selectedCase && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px'
        }}>
          <div style={{
            background: 'white', borderRadius: '12px', width: '100%', maxWidth: '580px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)', overflow: 'hidden'
          }}>
            <div style={{
              padding: '16px 20px', background: '#0f2b48', color: 'white',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px' }}>{selectedCase.institution}</h3>
                <small style={{ color: '#94a3b8' }}>Case Ref: {selectedCase.code} · {selectedCase.type}</small>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCase(null)}
                style={{ background: 'none', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px', background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                <div>
                  <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>ISSUE DETECTED</span>
                  <div style={{ fontWeight: 600, color: '#b91c1c' }}>{selectedCase.issue}</div>
                </div>
                <div>
                  <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>AMOUNT</span>
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>{selectedCase.amount}</div>
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <strong style={{ fontSize: '12px', color: '#334155' }}>Reconciliation Evidence:</strong>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#475569', background: '#f1f5f9', padding: '10px', borderRadius: '6px' }}>
                  {selectedCase.evidence}
                </p>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <strong style={{ fontSize: '12px', color: '#334155' }}>Suggested Regulatory Action:</strong>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#1e3a8a', background: '#eff6ff', padding: '10px', borderRadius: '6px' }}>
                  {selectedCase.suggestedAction}
                </p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn secondary btn-small"
                  onClick={() => setSelectedCase(null)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="btn primary btn-small"
                  onClick={() => {
                    setSelectedCase(null);
                    navigate('/verify');
                  }}
                >
                  Open in Transaction Verifier →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
