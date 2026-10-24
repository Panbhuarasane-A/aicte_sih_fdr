import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePortal } from '../context/PortalContext.jsx';
import { api } from '../lib/api.js';
import PortalSidebar from '../components/PortalSidebar.jsx';
import '../styles/audit-reports.css';

const dateInputValue = (date) => {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
};

const initialDateRange = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { start: dateInputValue(start), end: dateInputValue(end) };
};

const REPORTS = [
  { id: 'audit-trail', label: 'Audit Trail Report' },
  { id: 'upcoming-maturities', label: 'Maturity Report' },
  { id: 'pending-verifications', label: 'Transaction Verification Report' },
  { id: 'penalty-cases', label: 'Penalty Cases Report' },
];

function classifyLog(log) {
  const text = `${log.action} ${log.entity_type}`.toLowerCase();
  if (/reject|rejected|tamper|invalid/.test(text)) return 'rejected';
  if (/flag|mismatch|clarification|penalty|overdue/.test(text)) return 'flagged';
  if (/verif|authori[sz]|approved|matched|renew/.test(text)) return 'verified';
  return 'pending';
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename, headers, rows) {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function downloadCsvText(filename, csv) {
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function Icon({ name, size = 18 }) {
  const paths = {
    audit: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6m-11 4h6m-6 4h6" /><circle cx="17" cy="17" r="3" /><path d="m19.2 19.2 2 2" /></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>,
    alert: <><path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8m-8 4h8" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5m-5 5V3" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    chart: <><path d="M3 3v18h18M8 15l4-4 4 3 5-7" /></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function MetricCard({ icon, tone, label, value, trend, inverse, onClick }) {
  const isPositive = inverse ? trend <= 0 : trend >= 0;
  const arrow = trend > 0 ? '↑' : trend < 0 ? '↓' : '→';
  return (
    <button type="button" className="ar-metric" onClick={onClick}>
      <span className={`ar-metric-icon ${tone}`}><Icon name={icon} /></span>
      <span className="ar-metric-copy">
        <small>{label}</small>
        <strong>{value}</strong>
        <em className={isPositive ? 'is-up' : 'is-down'}>{arrow} {Math.abs(trend)}%</em>
        <span className="ar-metric-note">◉ vs. last month</span>
      </span>
    </button>
  );
}

function VerificationChart({ counts, total }) {
  const safeTotal = Math.max(total, 1);
  const verified = counts.verified;
  const flagged = counts.flagged;
  const pending = counts.pending;
  const rejected = counts.rejected;
  const stop1 = verified / safeTotal * 100;
  const stop2 = stop1 + flagged / safeTotal * 100;
  const stop3 = stop2 + pending / safeTotal * 100;
  const donutStyle = {
    background: `conic-gradient(#13b86a 0% ${stop1}%, #ff940e ${stop1}% ${stop2}%, #f7cc47 ${stop2}% ${stop3}%, #ff4e54 ${stop3}% 100%)`,
  };
  const rows = [
    ['Verified', verified, '#13b86a'],
    ['Flagged', flagged, '#ff940e'],
    ['Pending', pending, '#f7cc47'],
    ['Rejected', rejected, '#ff4e54'],
  ];

  return (
    <section className="ar-card ar-chart-card">
      <h2>Verification Status Overview</h2>
      <div className="ar-chart-content">
        <div className="ar-donut" style={donutStyle}>
          <div><strong>{total.toLocaleString('en-IN')}</strong><small>Total Audits</small></div>
        </div>
        <div className="ar-chart-legend">
          {rows.map(([label, count, color]) => (
            <div key={label}><i style={{ background: color }} /><span>{label}</span><strong>{count}</strong><small>{total ? `${(count / total * 100).toFixed(1)}%` : '0.0%'}</small></div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Audit() {
  const { user, signOut } = usePortal();
  const roleCanViewAudit = ['admin', 'head', 'auditor', 'finance', 'scrutiny'].includes(user?.role);
  const [logs, setLogs] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [verification, setVerification] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [range, setRange] = useState(initialDateRange);
  const [query, setQuery] = useState('');
  const [reportType, setReportType] = useState(REPORTS[0].id);
  const [statusFilter, setStatusFilter] = useState('');
  const [generatedReports, setGeneratedReports] = useState([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notice, setNotice] = useState('');

  const loadAudit = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [auditData, institutionData] = await Promise.all([
        api.getAuditTrail(1000),
        api.getInstitutions(),
      ]);
      setLogs(auditData);
      setInstitutions(institutionData);
    } catch (requestError) {
      setError(`Unable to load audit records: ${requestError.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!roleCanViewAudit) return;
    loadAudit();
  }, [loadAudit, roleCanViewAudit]);

  const filteredLogs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return logs.filter((log) => {
      const timestamp = new Date(log.timestamp).getTime();
      const afterStart = !range.start || timestamp >= new Date(`${range.start}T00:00:00`).getTime();
      const beforeEnd = !range.end || timestamp < new Date(`${range.end}T23:59:59.999`).getTime();
      const matchesQuery = !normalizedQuery
        || [log.actor_name, log.actor_role, log.action, log.entity_type, log.entity_id]
          .some((value) => value?.toLowerCase().includes(normalizedQuery));
      const matchesStatus = !statusFilter || classifyLog(log) === statusFilter;
      return afterStart && beforeEnd && matchesQuery && matchesStatus;
    });
  }, [logs, query, range, statusFilter]);

  const counts = useMemo(() => filteredLogs.reduce((result, log) => {
    result[classifyLog(log)] += 1;
    return result;
  }, { verified: 0, flagged: 0, pending: 0, rejected: 0 }), [filteredLogs]);

  const previousMonthLogs = useMemo(() => {
    if (!range.start || !range.end) return [];
    const start = new Date(`${range.start}T00:00:00`);
    const end = new Date(`${range.end}T00:00:00`);
    const span = Math.max(1, end.getTime() - start.getTime());
    const previousStart = new Date(start.getTime() - span - 86400000);
    const normalizedQuery = query.trim().toLowerCase();
    return logs.filter((log) => {
      const timestamp = new Date(log.timestamp).getTime();
      const matchesQuery = !normalizedQuery
        || [log.actor_name, log.actor_role, log.action, log.entity_type, log.entity_id]
          .some((value) => value?.toLowerCase().includes(normalizedQuery));
      const matchesStatus = !statusFilter || classifyLog(log) === statusFilter;
      return timestamp >= previousStart.getTime()
        && timestamp < start.getTime()
        && matchesQuery
        && matchesStatus;
    });
  }, [logs, query, range, statusFilter]);

  const previousVerified = previousMonthLogs.filter((log) => classifyLog(log) === 'verified').length;
  const previousFlagged = previousMonthLogs.filter((log) => classifyLog(log) === 'flagged').length;
  const previousTotal = previousMonthLogs.length;
  const trendPercent = (current, previous) => previous ? Math.round(((current - previous) / previous) * 100) : 0;

  const institutionActivity = useMemo(() => {
    const byId = new Map(institutions.map((institution) => [institution.id, institution]));
    const countsByInstitution = new Map();
    filteredLogs.forEach((log) => {
      const entityInstitutionId = byId.has(log.entity_id) ? log.entity_id : null;
      const institution = entityInstitutionId
        ? byId.get(entityInstitutionId)
        : institutions.find((item) => log.action?.includes(item.name));
      if (institution) {
        countsByInstitution.set(institution.id, (countsByInstitution.get(institution.id) || 0) + 1);
      }
    });
    return [...countsByInstitution.entries()]
      .map(([id, count]) => ({ institution: byId.get(id), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [filteredLogs, institutions]);
  const maxInstitutionCount = Math.max(1, ...institutionActivity.map((item) => item.count));
  const verifiedInstitution = institutionActivity[0];
  const riskLog = filteredLogs.find((log) => classifyLog(log) === 'flagged');

  const officerName = user?.name || 'AICTE Officer';
  const officerRole = user?.role === 'head'
    ? 'Regulation Bureau Head'
    : user?.region_scope
      ? `Scrutiny Officer, ${user.region_scope}`
      : (user?.role || 'AICTE Regulation Bureau');

  const verifyChain = async () => {
    setVerifying(true);
    setVerification(null);
    try {
      setVerification(await api.verifyAuditChain());
    } catch (requestError) {
      setError(`Unable to verify the audit hash chain: ${requestError.message}`);
    } finally {
      setVerifying(false);
    }
  };

  const generateReport = async (selectedReportType = reportType) => {
    const report = REPORTS.find((item) => item.id === selectedReportType);
    if (selectedReportType !== 'audit-trail') {
      setNotice('This report type is prepared by the backend and covers your authorised records. The selected date range filters this screen; use the report file for the complete authorized export.');
    }
    const filename = `aicte_${selectedReportType}_${new Date().toISOString().slice(0, 10)}.csv`;
    setError('');
    try {
      if (selectedReportType === 'audit-trail') {
        downloadCsv(filename, ['Timestamp', 'Actor', 'Role', 'Action', 'Entity Type', 'Entity ID', 'SHA-256 Hash', 'Previous Hash'], filteredLogs.map((log) => [
          log.timestamp, log.actor_name, log.actor_role, log.action, log.entity_type, log.entity_id, log.hash, log.previous_hash,
        ]));
      } else {
        const content = await api.downloadReport(selectedReportType);
        downloadCsvText(filename, content);
      }
      setGeneratedReports((previous) => [{
        id: `${selectedReportType}-${Date.now()}`,
        name: report.label,
        type: selectedReportType,
        createdAt: new Date().toISOString(),
        status: 'Completed',
        actor: officerName,
      }, ...previous]);
    } catch (requestError) {
      setError(`Unable to generate ${report.label}: ${requestError.message}`);
    }
  };

  const downloadTemplate = () => {
    downloadCsv('aicte-report-template.csv', ['Report Type', 'Date From', 'Date To', 'Institution ID', 'Status'], [
      ['Audit Trail', '', '', '', ''],
      ['Upcoming Maturities', '', '', '', ''],
      ['Pending Verifications', '', '', '', ''],
    ]);
    setNotice('Report template downloaded.');
  };

  const handleQuickAction = (action) => {
    if (action === 'generate') {
      generateReport();
    } else if (action === 'logs') {
      document.getElementById('ar-recent-logs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (action === 'templates') {
      downloadTemplate();
    } else {
      setNotice('Scheduled report delivery is not configured yet. Generate and download a report to export the current data.');
    }
  };

  return (
    <div className="ar-page">
      <header className="ar-header">
        <img className="ar-banner" src="/aicte-tricolor-heritage-header.png" alt="AICTE — Technical Education for a Stronger India" />
        <div className="ar-header-actions">
          <button className="ar-notification" type="button" aria-label="Notifications">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M10 21h4" /></svg><b>3</b>
          </button>
          <div className="ar-profile-wrap">
            <button className="ar-profile" type="button" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen}>
              <span className="ar-avatar">{officerName.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span>
              <span><strong>{officerName}</strong><small>{officerRole}</small></span>
              <span aria-hidden="true">⌄</span>
            </button>
            {profileOpen && <div className="ar-profile-menu"><span>{officerName}</span><button type="button" onClick={signOut}>Sign out</button></div>}
          </div>
        </div>
      </header>

      <div className="ar-layout">
        <PortalSidebar kind={user?.kind === 'institution' ? 'institution' : 'officer'} />
        <main className="ar-main">
          {!roleCanViewAudit ? (
            <section className="ar-access-message">
              <span className="ar-heading-icon"><Icon name="shield" size={25} /></span>
              <div><h1>Audit &amp; Reports</h1><p>Audit records are available to authorised AICTE officers. Your institution account can still access its reports from the dashboard.</p></div>
            </section>
          ) : (
            <>
              <div className="ar-heading-row">
                <div className="ar-heading">
                  <span className="ar-heading-icon"><Icon name="audit" size={25} /></span>
                  <div><h1>Audit &amp; Reports</h1><p>View system activity, verification history and generate reports for regulatory review.</p></div>
                </div>
                <label className="ar-range-control"><Icon name="calendar" size={15} /><input aria-label="Report date range start" type="date" value={range.start} onChange={(event) => setRange((current) => ({ ...current, start: event.target.value }))} /><span>–</span><input aria-label="Report date range end" type="date" value={range.end} onChange={(event) => setRange((current) => ({ ...current, end: event.target.value }))} /></label>
              </div>

              {error && <div className="ar-feedback is-error" role="alert">{error}<button type="button" onClick={loadAudit}>Retry</button></div>}
              {notice && <div className="ar-feedback" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss message">×</button></div>}
              {verification && <div className={`ar-integrity ${verification.is_valid ? 'is-valid' : 'is-invalid'}`} role="status"><strong>{verification.is_valid ? 'Hash chain integrity verified' : 'Tampering detected'}</strong><span>{verification.message} · {verification.total_records} blocks verified</span><button type="button" onClick={() => setVerification(null)} aria-label="Dismiss integrity result">×</button></div>}

              <section className="ar-metrics">
                <MetricCard icon="file" tone="blue" label="Total Audits" value={loading ? '—' : filteredLogs.length.toLocaleString('en-IN')} trend={trendPercent(filteredLogs.length, previousTotal)} onClick={() => setStatusFilter('')} />
                <MetricCard icon="shield" tone="green" label="Verified Records" value={loading ? '—' : counts.verified.toLocaleString('en-IN')} trend={trendPercent(counts.verified, previousVerified)} onClick={() => setStatusFilter('verified')} />
                <MetricCard icon="alert" tone="amber" label="Flagged Cases" value={loading ? '—' : counts.flagged.toLocaleString('en-IN')} trend={trendPercent(counts.flagged, previousFlagged)} inverse onClick={() => setStatusFilter('flagged')} />
                <MetricCard icon="file" tone="purple" label="Reports Generated" value={generatedReports.length.toLocaleString('en-IN')} trend={0} onClick={() => document.getElementById('ar-recent-logs')?.scrollIntoView({ behavior: 'smooth' })} />
              </section>

              <section className="ar-overview-grid">
                <VerificationChart counts={counts} total={filteredLogs.length} />
                <section className="ar-card ar-institution-card">
                  <h2>Top Institutions by Audit Activity</h2>
                  {loading ? <p className="ar-muted">Loading activity…</p> : institutionActivity.length ? (
                    <div className="ar-institution-bars">
                      {institutionActivity.map(({ institution, count }) => (
                        <div className="ar-institution-bar" key={institution.id}>
                          <div><span>{institution.name}</span><strong>{count}</strong></div>
                          <i><b style={{ width: `${count / maxInstitutionCount * 100}%` }} /></i>
                        </div>
                      ))}
                    </div>
                  ) : <p className="ar-muted">No institution-linked audit activity in this date range.</p>}
                </section>
                <section className="ar-card ar-quick-actions">
                  <h2>Quick Actions</h2>
                  <button type="button" onClick={() => handleQuickAction('generate')}><span><Icon name="download" /></span><span><strong>Generate Report</strong><small>Create a CSV report</small></span><b>›</b></button>
                  <button type="button" onClick={() => handleQuickAction('logs')}><span><Icon name="file" /></span><span><strong>View Audit Logs</strong><small>Check system activity</small></span><b>›</b></button>
                  <button type="button" onClick={() => handleQuickAction('templates')}><span><Icon name="download" /></span><span><strong>Download Templates</strong><small>Report formats &amp; samples</small></span><b>›</b></button>
                  <button type="button" onClick={() => handleQuickAction('schedule')}><span><Icon name="calendar" /></span><span><strong>Schedule Report</strong><small>Set up automated reports</small></span><b>›</b></button>
                </section>
              </section>

              <section className="ar-card ar-reports-filter">
                <label className="ar-search"><Icon name="search" size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by institution, FDR number, report name..." /></label>
                <label className="ar-select-label">Report Type<select value={reportType} onChange={(event) => setReportType(event.target.value)}>{REPORTS.map((report) => <option key={report.id} value={report.id}>{report.label}</option>)}</select></label>
                <label className="ar-select-label">Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All</option><option value="verified">Verified</option><option value="flagged">Flagged</option><option value="pending">Pending</option><option value="rejected">Rejected</option></select></label>
                <button className="ar-generate-button" type="button" onClick={generateReport}><Icon name="chart" size={15} /> Generate</button>
              </section>

              <section className="ar-card ar-recent-card" id="ar-recent-logs">
                <div className="ar-recent-heading"><h2>Recent Reports &amp; Audit Activity</h2><span>{loading ? 'Loading…' : `${filteredLogs.length} records`}</span></div>
                {generatedReports.length > 0 && (
                  <div className="ar-generated-list">
                    {generatedReports.slice(0, 3).map((report) => (
                      <div className="ar-generated-report" key={report.id}><span className="ar-report-type-icon"><Icon name="file" size={15} /></span><strong>{report.name}</strong><small>{formatTimestamp(report.createdAt)}</small><span className="ar-status is-completed">{report.status}</span><button type="button" onClick={() => generateReport(report.type)}><Icon name="download" size={14} /> Download</button></div>
                    ))}
                  </div>
                )}
                <div className="ar-table-scroll">
                  <table>
                    <thead><tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Entity</th><th>Status</th><th>SHA-256 Hash</th></tr></thead>
                    <tbody>
                      {loading ? <tr><td colSpan="6" className="ar-table-message">Loading audit records…</td></tr>
                        : filteredLogs.length === 0 ? <tr><td colSpan="6" className="ar-table-message">{error ? 'Audit records could not be loaded.' : 'No audit activity matches these filters.'}</td></tr>
                          : filteredLogs.slice(0, 100).map((log) => {
                            const status = classifyLog(log);
                            return <tr key={log.id}>
                              <td>{formatTimestamp(log.timestamp)}</td>
                              <td><strong>{log.actor_name}</strong><small>{log.actor_role}</small></td>
                              <td className="ar-action-cell">{log.action}</td>
                              <td><strong>{log.entity_type}</strong><small>{log.entity_id}</small></td>
                              <td><span className={`ar-status is-${status}`}>{status[0].toUpperCase() + status.slice(1)}</span></td>
                              <td><code title={log.hash}>{log.hash?.slice(0, 12)}…</code></td>
                            </tr>;
                          })}
                    </tbody>
                  </table>
                </div>
                <div className="ar-table-footer"><span>Showing {Math.min(filteredLogs.length, 100)} of {filteredLogs.length} records</span><button type="button" onClick={verifyChain} disabled={verifying}>{verifying ? 'Verifying…' : <><Icon name="shield" size={14} /> Verify hash chain</>}</button></div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
