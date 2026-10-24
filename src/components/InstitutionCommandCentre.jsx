import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePortal } from '../context/PortalContext.jsx';
import { api } from '../lib/api.js';
import PortalSidebar from './PortalSidebar.jsx';
import '../styles/institution-portal.css';

const SAMPLE_TRANSACTIONS = [
  {
    date: '18 Apr 2025',
    utr: 'UTR: 123456789012',
    amount: '₹ 10,00,000',
    bank: 'SBI',
    bankClass: 'ipc-bank-sbi',
    status: 'Matched',
    statusClass: 'is-matched',
    details: 'Verified against SBI Electronic Real-Time Gross Settlement feed. Exactly consistent with required deposit.'
  },
  {
    date: '12 Apr 2025',
    utr: 'UTR: 987654321098',
    amount: '₹ 5,00,000',
    bank: 'ICICI Bank',
    bankClass: 'ipc-bank-icici',
    status: 'Matched',
    statusClass: 'is-matched',
    details: 'Verified against ICICI Bank statement line. Matched date and transaction amount.'
  },
  {
    date: '08 Apr 2025',
    utr: 'UTR: 456789012345',
    amount: '₹ 3,50,000',
    bank: 'HDFC Bank',
    bankClass: 'ipc-bank-hdfc',
    status: 'Amount Mismatch',
    statusClass: 'is-mismatch',
    details: 'Bank statement line reflects ₹3,00,000 vs claimed ₹3,50,000. Shortfall of ₹50,000 detected.'
  },
  {
    date: '05 Apr 2025',
    utr: 'UTR: 234567890123',
    amount: '₹ 8,00,000',
    bank: 'Axis Bank',
    bankClass: 'ipc-bank-axis',
    status: 'Matched',
    statusClass: 'is-matched',
    details: 'Axis Bank RTGS counterfoil matches electronic remittance records.'
  },
  {
    date: '28 Mar 2025',
    utr: 'UTR: 112233445566',
    amount: '₹ 12,00,000',
    bank: 'BOB',
    bankClass: 'ipc-bank-bob',
    status: 'Under Review',
    statusClass: 'is-review',
    details: 'Transaction currently queued for Scrutiny Officer verification.'
  }
];

export default function InstitutionCommandCentre({ isPreview = false }) {
  const { user, signOut } = usePortal();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('dashboard');
  const [query, setQuery] = useState('');
  const [assistantResult, setAssistantResult] = useState(null);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);
  const [userDropdown, setUserDropdown] = useState(false);

  // Live stats from backend
  const [liveKpis, setLiveKpis] = useState(null);
  const [liveClaims, setLiveClaims] = useState([]);

  useEffect(() => {
    Promise.all([
      api.getDashboardSummary().catch(() => null),
      api.getClaims().catch(() => [])
    ]).then(([kpiData, claimsData]) => {
      if (kpiData) setLiveKpis(kpiData);
      if (claimsData && claimsData.length) setLiveClaims(claimsData);
    });
  }, []);

  const handleAskAssistant = async (text) => {
    const qText = text || query;
    if (!qText.trim()) return;
    setQuery(qText);
    setAssistantLoading(true);
    try {
      const res = await api.askAssistant(qText.trim());
      setAssistantResult(res);
    } catch {
      setAssistantResult({
        title: 'Assistant Result',
        rows: ['All institutional records in your profile are compliant.'],
        intent_matched: 'QUERY_RESULTS'
      });
    } finally {
      setAssistantLoading(false);
    }
  };

  const institutionName = user?.institution_name || user?.name || 'ABC Engineering College';
  const institutionCode = user?.institution_id || 'INST-2026-004';

  return (
    <div className="ipc-container">
      {/* HEADER */}
      <header className="ipc-header">
        <img
          className="ipc-header-banner"
          src="/aicte-tricolor-heritage-header.png"
          alt="AICTE — Technical Education for a Stronger India"
        />

        <div className="ipc-header-right">
          <button className="ipc-notif-btn" type="button" aria-label="Notifications" onClick={() => alert('1 transaction requires your attention (Amount mismatch).')}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span className="ipc-notif-badge">3</span>
          </button>

          <div className="ipc-user-profile" onClick={() => setUserDropdown(!userDropdown)} style={{ position: 'relative' }}>
            <div className="ipc-avatar-circle">
              🎓
            </div>
            <div className="ipc-user-info">
              <span className="ipc-user-name">{institutionName}</span>
              <div className="ipc-user-role-badge">
                <span className="ipc-user-sub">{institutionCode}</span>
                <span className="ipc-portal-pill">Institution Portal</span>
              </div>
            </div>
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>▼</span>

            {userDropdown && (
              <div style={{
                position: 'absolute', top: '48px', right: '0', background: 'white',
                border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                padding: '8px 0', minWidth: '200px', zIndex: 100
              }}>
                <div style={{ padding: '8px 16px', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold' }}>{institutionName}</div>
                  <div style={{ fontSize: '10px', color: '#64748b' }}>Code: {institutionCode}</div>
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
      <div className="ipc-body-layout">
        {/* SIDEBAR */}
        <PortalSidebar kind="institution" onOverview={() => setActiveTab('dashboard')} />

        {/* MAIN CONTENT AREA */}
        <main className="ipc-content">
          {/* TITLE BAR */}
          <div className="ipc-title-bar">
            <div>
              <h1 className="ipc-main-title">Welcome, {institutionName}</h1>
              <p className="ipc-sub-title">Track your deposits, FDRs and transaction status. Stay updated with AI-powered verification and alerts.</p>
            </div>
            <div className="ipc-date-badge">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect width="18" height="18" x="3" y="4" rx="2" />
                <line x1="16" x2="16" y1="2" y2="6" />
                <line x1="8" x2="8" y1="2" y2="6" />
                <line x1="3" x2="21" y1="10" y2="10" />
              </svg>
              <span>{new Date().toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} · 10:42 AM</span>
            </div>
          </div>

          {/* 4 TOP METRIC CARDS */}
          <div className="ipc-metrics-row">
            <div className="ipc-metric-card" onClick={() => navigate('/calculator')}>
              <div className="ipc-metric-left">
                <div className="ipc-metric-icon-wrap is-blue">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v4M12 14v4M16 14v4" />
                  </svg>
                </div>
                <div>
                  <p className="ipc-metric-label">Total Deposits & FDRs</p>
                  <p className="ipc-metric-number">6</p>
                  <p className="ipc-metric-sub">Active instruments</p>
                </div>
              </div>
              <span className="ipc-metric-arrow">→</span>
            </div>

            <div className="ipc-metric-card" onClick={() => navigate('/verify')}>
              <div className="ipc-metric-left">
                <div className="ipc-metric-icon-wrap is-green">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </div>
                <div>
                  <p className="ipc-metric-label">Verified Transactions</p>
                  <p className="ipc-metric-number">4</p>
                  <div className="ipc-progress-mini">
                    <span className="ipc-metric-sub">Out of 5 claims</span>
                    <div className="ipc-progress-mini-bar">
                      <div className="ipc-progress-mini-fill" style={{ width: '80%' }} />
                    </div>
                    <span className="ipc-progress-mini-text">80%</span>
                  </div>
                </div>
              </div>
              <span className="ipc-metric-arrow">→</span>
            </div>

            <div className="ipc-metric-card" onClick={() => navigate('/verify')}>
              <div className="ipc-metric-left">
                <div className="ipc-metric-icon-wrap is-orange">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                    <line x1="12" x2="12" y1="9" y2="13" />
                    <line x1="12" x2="12.01" y1="17" y2="17" />
                  </svg>
                </div>
                <div>
                  <p className="ipc-metric-label">Pending Verification</p>
                  <p className="ipc-metric-number">1</p>
                  <p className="ipc-metric-sub">Requires your attention</p>
                </div>
              </div>
              <span className="ipc-metric-arrow">→</span>
            </div>

            <div className="ipc-metric-card" onClick={() => navigate('/dashboard')}>
              <div className="ipc-metric-left">
                <div className="ipc-metric-icon-wrap is-purple">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect width="18" height="18" x="3" y="4" rx="2" />
                    <line x1="16" x2="16" y1="2" y2="6" />
                    <line x1="8" x2="8" y1="2" y2="6" />
                    <line x1="3" x2="21" y1="10" y2="10" />
                  </svg>
                </div>
                <div>
                  <p className="ipc-metric-label">Upcoming Maturities</p>
                  <p className="ipc-metric-number">2</p>
                  <p className="ipc-metric-sub">Within 30 days</p>
                </div>
              </div>
              <span className="ipc-metric-arrow">→</span>
            </div>
          </div>

          {/* MAIN 3-COLUMN BENTO GRID */}
          <div className="ipc-main-grid">
            {/* COLUMN 1: RECENT TRANSACTIONS */}
            <div className="ipc-panel">
              <div className="ipc-panel-header">
                <div>
                  <h2 className="ipc-panel-title">Recent Transactions</h2>
                  <small style={{ color: '#64748b' }}>Track the status of your submitted payments and deposits.</small>
                </div>
                <Link to="/verify" className="ipc-view-all">View All →</Link>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="ipc-tx-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>UTR / Ref No.</th>
                      <th>Amount</th>
                      <th>Bank</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SAMPLE_TRANSACTIONS.map((tx, idx) => (
                      <tr key={idx}>
                        <td>{tx.date}</td>
                        <td style={{ fontWeight: 600 }}>{tx.utr}</td>
                        <td style={{ fontWeight: 700 }}>{tx.amount}</td>
                        <td>
                          <div className="ipc-bank-cell">
                            <span className={`ipc-bank-dot ${tx.bankClass}`}>●</span>
                            <span>{tx.bank}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`ipc-status-pill ${tx.statusClass}`}>
                            {tx.status}
                          </span>
                        </td>
                        <td>
                          <span className="ipc-view-link" onClick={() => setSelectedTx(tx)}>
                            View →
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* COLUMN 2: FDR / DEPOSIT OVERVIEW & QUICK ACTIONS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div className="ipc-panel">
                <div className="ipc-panel-header">
                  <h2 className="ipc-panel-title">FDR / Deposit Overview</h2>
                  <Link to="/calculator" className="ipc-view-all">View All →</Link>
                </div>

                <div className="ipc-fdr-list">
                  <div className="ipc-fdr-item" onClick={() => navigate('/calculator')}>
                    <div className="ipc-fdr-item-left">
                      <div className="ipc-fdr-dot is-blue">🏦</div>
                      <div>
                        <span className="ipc-fdr-label">Total FDRs</span>
                        <div className="ipc-fdr-count">3</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="ipc-fdr-amount">₹ 1,50,00,000</span>
                      <span style={{ color: '#94a3b8' }}>›</span>
                    </div>
                  </div>

                  <div className="ipc-fdr-item" onClick={() => navigate('/calculator')}>
                    <div className="ipc-fdr-item-left">
                      <div className="ipc-fdr-dot is-green">✓</div>
                      <div>
                        <span className="ipc-fdr-label">Active</span>
                        <div className="ipc-fdr-count">2</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="ipc-fdr-amount">₹ 1,10,00,000</span>
                      <span style={{ color: '#94a3b8' }}>›</span>
                    </div>
                  </div>

                  <div className="ipc-fdr-item" onClick={() => navigate('/calculator')}>
                    <div className="ipc-fdr-item-left">
                      <div className="ipc-fdr-dot is-orange">📅</div>
                      <div>
                        <span className="ipc-fdr-label">Maturing in 30 Days</span>
                        <div className="ipc-fdr-count">1</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="ipc-fdr-amount">₹ 40,00,000</span>
                      <span style={{ color: '#94a3b8' }}>›</span>
                    </div>
                  </div>

                  <div className="ipc-fdr-item" onClick={() => navigate('/calculator')}>
                    <div className="ipc-fdr-item-left">
                      <div className="ipc-fdr-dot is-red">⌛</div>
                      <div>
                        <span className="ipc-fdr-label">Expired</span>
                        <div className="ipc-fdr-count">0</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="ipc-fdr-amount">₹ 0</span>
                      <span style={{ color: '#94a3b8' }}>›</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="ipc-panel">
                <div className="ipc-panel-header">
                  <h2 className="ipc-panel-title">Quick Actions</h2>
                  <Link to="/documents" className="ipc-view-all">View All →</Link>
                </div>

                <div className="ipc-qa-list">
                  <div className="ipc-qa-item" onClick={() => navigate('/documents')}>
                    <div className="ipc-qa-left">
                      <div className="ipc-qa-icon is-blue">📤</div>
                      <div>
                        <span className="ipc-qa-title">Upload Document</span>
                        <span className="ipc-qa-sub">FDR / Receipt / Statement</span>
                      </div>
                    </div>
                    <span className="ipc-qa-time">2 hours ago</span>
                  </div>

                  <div className="ipc-qa-item" onClick={() => navigate('/verify')}>
                    <div className="ipc-qa-left">
                      <div className="ipc-qa-icon is-purple">⚠️</div>
                      <div>
                        <span className="ipc-qa-title">Amount mismatch detected</span>
                        <span className="ipc-qa-sub">UTR-456789012345 | ₹ 3,50,000</span>
                      </div>
                    </div>
                    <span className="ipc-qa-time">5 hours ago</span>
                  </div>

                  <div className="ipc-qa-item" onClick={() => navigate('/documents')}>
                    <div className="ipc-qa-left">
                      <div className="ipc-qa-icon is-green">📄</div>
                      <div>
                        <span className="ipc-qa-title">Missing document</span>
                        <span className="ipc-qa-sub">Release request #RR-2025-008</span>
                      </div>
                    </div>
                    <span className="ipc-qa-time">1 day ago</span>
                  </div>

                  <div className="ipc-qa-item" onClick={() => alert('Official intimation from AICTE: Please ensure all renewal certificates are stamped before 30 April.')}>
                    <div className="ipc-qa-left">
                      <div className="ipc-qa-icon is-red">🔔</div>
                      <div>
                        <span className="ipc-qa-title">New message from AICTE</span>
                        <span className="ipc-qa-sub">Regarding your verification query</span>
                      </div>
                    </div>
                    <span className="ipc-qa-time">1 day ago</span>
                  </div>
                </div>
              </div>
            </div>

            {/* COLUMN 3: AI ASSISTANT & NEED HELP CARD */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div className="ipc-assistant-box">
                <div className="ipc-asst-header">
                  <div className="ipc-asst-robot-icon">🤖</div>
                  <div>
                    <h3 className="ipc-asst-title">AI Assistant</h3>
                  </div>
                </div>
                <p className="ipc-asst-sub">Ask in natural language. Get instant insights from your financial records.</p>

                <div className="ipc-asst-queries">
                  <button type="button" className="ipc-asst-pill" onClick={() => handleAskAssistant('Show all my unmatched deposit transactions.')}>
                    Show all my unmatched deposit transactions.
                  </button>
                  <button type="button" className="ipc-asst-pill" onClick={() => handleAskAssistant('Which FDRs are maturing in the next 30 days?')}>
                    Which FDRs are maturing in the next 30 days?
                  </button>
                  <button type="button" className="ipc-asst-pill" onClick={() => handleAskAssistant('Find release requests with missing documents.')}>
                    Find release requests with missing documents.
                  </button>
                  <button type="button" className="ipc-asst-pill" onClick={() => handleAskAssistant('Why was my last payment flagged?')}>
                    Why was my last payment flagged?
                  </button>
                </div>

                <form onSubmit={(e) => { e.preventDefault(); handleAskAssistant(); }} className="ipc-asst-input-wrap">
                  <input
                    type="text"
                    className="ipc-asst-input"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Type your question..."
                  />
                  <button type="submit" className="ipc-asst-send" disabled={assistantLoading}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="22" x2="11" y1="2" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </form>

                {assistantResult && (
                  <div style={{ marginTop: '10px', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '11px', color: '#166534' }}>
                    <strong>{assistantResult.title}:</strong>
                    <div style={{ marginTop: '4px' }}>{assistantResult.rows.join(' · ')}</div>
                  </div>
                )}
              </div>

              <div className="ipc-help-card">
                <img
                  src="/aicte-login-banner.png"
                  alt="Government of India & Parliament"
                  className="ipc-help-banner-img"
                />
                <p className="ipc-help-quote">"Quality Technical Education for a Stronger India"</p>
                <div className="ipc-help-contact">
                  <svg className="ipc-help-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  <div className="ipc-help-details">
                    <strong>Need Help?</strong>
                    <small>Contact AICTE Helpdesk</small>
                    <small style={{ color: '#0369a1', fontWeight: 600 }}>helpdesk@aicte-india.org | 1800-11-1424</small>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* BOTTOM STEPPER: TRANSACTION VERIFICATION STATUS */}
          <section className="ipc-stepper-panel">
            <div className="ipc-stepper-header">
              <div className="ipc-stepper-title-wrap">
                <svg className="ipc-stepper-shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
                <h2 className="ipc-stepper-title">Transaction Verification Status</h2>
              </div>
              <Link to="/verify" className="ipc-view-all">View Details →</Link>
            </div>

            <div className="ipc-steps-row">
              <div className="ipc-step-item">
                <div className="ipc-step-circle is-completed">✓</div>
                <span className="ipc-step-title">Document Extracted</span>
                <span className="ipc-step-status is-completed">Completed</span>
              </div>

              <div className="ipc-step-connector is-done" />

              <div className="ipc-step-item">
                <div className="ipc-step-circle is-completed">✓</div>
                <span className="ipc-step-title">Data Validation</span>
                <span className="ipc-step-status is-completed">Completed</span>
              </div>

              <div className="ipc-step-connector" />

              <div className="ipc-step-item">
                <div className="ipc-step-circle is-progress">⏳</div>
                <span className="ipc-step-title">Bank Statement Match</span>
                <span className="ipc-step-status is-progress">In Progress</span>
              </div>

              <div className="ipc-step-connector" />

              <div className="ipc-step-item">
                <div className="ipc-step-circle is-pending">⏱</div>
                <span className="ipc-step-title">Final Verification</span>
                <span className="ipc-step-status is-pending">Pending</span>
              </div>
            </div>

            <div className="ipc-current-card">
              <div className="ipc-current-left">
                <div className="ipc-current-icon">📄</div>
                <div>
                  <span className="ipc-current-label">Current Verification</span>
                  <div className="ipc-current-meta">UTR: 987654321098 | ₹ 5,00,000 | ICICI Bank</div>
                </div>
              </div>
              <button type="button" className="ipc-current-btn" onClick={() => navigate('/verify')}>
                View Details &gt;
              </button>
            </div>
          </section>
        </main>
      </div>

      {/* FOOTER */}
      <footer className="ipc-footer">
        <div>AICTE | Security Deposit & FDR Management Portal</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>🇮🇳</span>
          <span>Ministry of Education, Government of India</span>
        </div>
      </footer>

      {/* TRANSACTION DETAILS MODAL */}
      {selectedTx && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px'
        }}>
          <div style={{
            background: 'white', borderRadius: '12px', width: '100%', maxWidth: '540px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)', overflow: 'hidden'
          }}>
            <div style={{
              padding: '16px 20px', background: '#0f2b48', color: 'white',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px' }}>Transaction Details</h3>
                <small style={{ color: '#94a3b8' }}>{selectedTx.utr} · {selectedTx.bank}</small>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTx(null)}
                style={{ background: 'none', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px', background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                <div>
                  <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>AMOUNT</span>
                  <div style={{ fontWeight: 700, fontSize: '16px', color: '#0f2b48' }}>{selectedTx.amount}</div>
                </div>
                <div>
                  <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>MATCH STATUS</span>
                  <div>
                    <span className={`ipc-status-pill ${selectedTx.statusClass}`} style={{ fontSize: '12px' }}>
                      {selectedTx.status}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <strong style={{ fontSize: '12px', color: '#334155' }}>Reconciliation Summary:</strong>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#475569', background: '#f1f5f9', padding: '10px', borderRadius: '6px' }}>
                  {selectedTx.details}
                </p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn secondary btn-small"
                  onClick={() => setSelectedTx(null)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="btn primary btn-small"
                  onClick={() => {
                    setSelectedTx(null);
                    navigate('/verify');
                  }}
                >
                  Open Verification Screen →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
