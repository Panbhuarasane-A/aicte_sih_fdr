import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePortal } from '../context/PortalContext.jsx';
import { claimsRepo, institutionsRepo } from '../data/repositories.js';
import { MATCH_STATUSES, getStatusLabel } from '../data/statuses.js';
import { formatDate, formatINR, formatPercent } from '../lib/formatters.js';
import PortalSidebar from '../components/PortalSidebar.jsx';
import { StatusBadge } from '../components/ui.jsx';
import DateRangePicker from '../components/DateRangePicker.jsx';
import NotificationButton from '../components/NotificationButton.jsx';
import '../styles/transaction-verification.css';

const PAGE_SIZE = 10;
const BANK_NAMES = [
  ['SBI', 'State Bank of India'],
  ['PNB', 'Punjab National Bank'],
  ['HDFC', 'HDFC Bank'],
  ['ICICI', 'ICICI Bank'],
  ['CANARA', 'Canara Bank'],
  ['CNRB', 'Canara Bank'],
  ['BOB', 'Bank of Baroda'],
  ['AXIS', 'Axis Bank'],
  ['UNION', 'Union Bank of India'],
  ['INDIAN', 'Indian Bank'],
  ['SYNDICATE', 'Syndicate Bank'],
];

function parseDate(value) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function displayDate(value, withTime = false) {
  return formatDate(value, withTime ? { hour: '2-digit', minute: '2-digit' } : undefined);
}

function formatAmount(value) {
  return formatINR(value, { maximumFractionDigits: 2 });
}

function bankFromClaim(claim) {
  const evidence = (claim.match_result?.evidence_lines || []).join(' ').toUpperCase().replace(/[^A-Z0-9]/g, ' ');
  const found = BANK_NAMES.find(([code, name]) => (
    evidence.includes(name.toUpperCase()) || evidence.split(/\s+/).includes(code)
    || (code === 'SBI' && /\bSBIN?\d/.test(evidence))
  ));
  return found?.[1] || '';
}

function matchLabel(claim) {
  return getStatusLabel(MATCH_STATUSES, claim.match_result?.classification);
}

function getBankAmount(claim) {
  const lines = claim.match_result?.evidence_lines || [];
  for (const line of lines) {
    const match = line.match(
      /(?:statement line|confirmed:.*?·|candidate utr.*?·)\s*₹?\s*([\d,]+(?:\.\d+)?)/i,
    );
    if (match) return Number(match[1].replace(/,/g, ''));
  }
  return null;
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function exportClaims(claims) {
  const headers = ['UTR / Reference', 'Institution', 'Claim Amount (INR)', 'Transaction Date', 'Bank', 'Match Status', 'Officer Decision', 'Suggested Action'];
  const rows = claims.map((claim) => [
    claim.utr,
    claim.institution_name || claim.institution_id,
    claim.amount,
    claim.date,
    bankFromClaim(claim),
    matchLabel(claim),
    claim.officer_decision,
    claim.match_result?.suggested_action,
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `aicte-transaction-verification-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function Icon({ name, size = 18 }) {
  const paths = {
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8m-8 4h5" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    alert: <><path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5m-5 5V3" /></>,
    refresh: <><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" /><path d="M3 3v5h5" /></>,
    close: <path d="m18 6-12 12M6 6l12 12" />,
    copy: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function MetricCard({ icon, tone, label, value, note, onClick }) {
  return (
    <button type="button" className="tv-metric" onClick={onClick}>
      <span className={`tv-metric-icon ${tone}`}><Icon name={icon} /></span>
      <span><small>{label}</small><strong>{value}</strong><em>{note}</em></span>
    </button>
  );
}

export default function Verify() {
  const { user, signOut } = usePortal();
  const [claims, setClaims] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [query, setQuery] = useState('');
  const [institutionFilter, setInstitutionFilter] = useState('');
  const [bankFilter, setBankFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState('');
  const [detailDismissed, setDetailDismissed] = useState(false);
  const [detailTab, setDetailTab] = useState('overview');
  const [profileOpen, setProfileOpen] = useState(false);
  const [clarificationOpen, setClarificationOpen] = useState(false);
  const [clarificationNotes, setClarificationNotes] = useState('Please provide a signed bank counterfoil.');

  const canDecide = ['admin', 'head', 'scrutiny'].includes(user?.role);
  const isInstitution = user?.kind === 'institution';
  const officerName = user?.name || 'AICTE Officer';
  const officerRole = user?.role === 'head'
    ? 'Regulation Bureau Head'
    : user?.region_scope
      ? `Scrutiny Officer, ${user.region_scope}`
      : isInstitution
        ? 'Institution Portal'
        : user?.role || 'AICTE Regulation Bureau';

  const loadClaims = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [claimData, institutionData] = await Promise.all([
        claimsRepo.list(),
        institutionsRepo.list(),
      ]);
      setClaims(claimData);
      setInstitutions(institutionData);
      setSelectedId((current) => (
        claimData.some((claim) => claim.id === current) ? current : claimData[0]?.id || ''
      ));
    } catch (requestError) {
      setError(`Unable to load transaction records: ${requestError.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadClaims(); }, [loadClaims]);

  const banks = useMemo(() => [...new Set(claims.map(bankFromClaim).filter(Boolean))].sort(), [claims]);
  const exactCount = claims.filter((claim) => claim.match_result?.classification === 'EXACT_MATCH').length;
  const flaggedCount = claims.length - exactCount;
  const pendingCount = claims.filter((claim) => claim.officer_decision === 'PENDING').length;

  const filteredClaims = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return claims.filter((claim) => {
      const matchesQuery = !normalizedQuery || [
        claim.id,
        claim.utr,
        claim.institution_name,
        claim.institution_id,
        String(claim.amount),
        bankFromClaim(claim),
        claim.match_result?.classification,
      ].some((value) => value?.toLowerCase().includes(normalizedQuery));
      const matchesInstitution = !institutionFilter || claim.institution_id === institutionFilter;
      const matchesBank = !bankFilter || bankFromClaim(claim) === bankFilter;
      const matchesStatus = !statusFilter
        || (statusFilter === 'PENDING_REVIEW'
          ? claim.officer_decision === 'PENDING'
          : statusFilter === 'FLAGGED'
            ? claim.match_result?.classification !== 'EXACT_MATCH'
            : claim.match_result?.classification === statusFilter);
      const matchesDate = (!fromDate || claim.date >= fromDate) && (!toDate || claim.date <= toDate);
      return matchesQuery && matchesInstitution && matchesBank && matchesStatus && matchesDate;
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [bankFilter, claims, fromDate, institutionFilter, query, statusFilter, toDate]);

  const selectedClaim = detailDismissed ? null : filteredClaims.find((claim) => claim.id === selectedId)
    || filteredClaims[0]
    || claims.find((claim) => claim.id === selectedId)
    || null;
  const pageCount = Math.max(1, Math.ceil(filteredClaims.length / PAGE_SIZE));
  const visibleClaims = filteredClaims.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [query, institutionFilter, bankFilter, statusFilter, fromDate, toDate]);
  useEffect(() => {
    if (selectedClaim && selectedClaim.id !== selectedId) setSelectedId(selectedClaim.id);
  }, [selectedClaim, selectedId]);

  const resetFilters = () => {
    setQuery('');
    setInstitutionFilter('');
    setBankFilter('');
    setStatusFilter('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const runVerification = async (claim = selectedClaim) => {
    if (!claim || actionLoading) return;
    setActionLoading(claim.id);
    setError('');
    setNotice('');
    try {
      await claimsRepo.rerunMatch(claim.id);
      setNotice(`Transaction ${claim.utr} was checked against the available bank statement records.`);
      await loadClaims();
    } catch (requestError) {
      setError(`Could not verify ${claim.utr}: ${requestError.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const markVerified = async () => {
    if (!selectedClaim || actionLoading) return;
    setActionLoading(selectedClaim.id);
    setError('');
    setNotice('');
    try {
      await claimsRepo.verify(selectedClaim.id, 'Reviewed against the available bank statement evidence.');
      setNotice(`Transaction ${selectedClaim.utr} marked as officer verified.`);
      await loadClaims();
    } catch (requestError) {
      setError(`Could not mark transaction as verified: ${requestError.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const requestClarification = async (event) => {
    event.preventDefault();
    if (!selectedClaim || !clarificationNotes.trim() || actionLoading) return;
    setActionLoading(selectedClaim.id);
    setError('');
    setNotice('');
    try {
      await claimsRepo.requestClarification(selectedClaim.id, clarificationNotes.trim());
      setNotice(`Clarification requested for transaction ${selectedClaim.utr}.`);
      setClarificationOpen(false);
      await loadClaims();
    } catch (requestError) {
      setError(`Could not request clarification: ${requestError.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const copyUtr = async () => {
    if (!selectedClaim) return;
    try {
      await navigator.clipboard.writeText(selectedClaim.utr);
      setNotice('Transaction reference copied.');
    } catch (copyError) {
      setError(`Could not copy transaction reference: ${copyError.message}`);
    }
  };

  const selectStatus = (status) => {
    setStatusFilter(status);
    setPage(1);
  };

  return (
    <div className="tv-page">
      <header className="tv-header">
        <img className="tv-banner" src={`${import.meta.env.BASE_URL}aicte-tricolor-heritage-header.png`} alt="AICTE — Technical Education for a Stronger India" />
        <div className="tv-header-actions">
          <NotificationButton className="tv-notification" />
          <div className="tv-profile-wrap">
            <button className="tv-profile" type="button" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen}>
              <span className="tv-avatar">{officerName.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span>
              <span><strong>{officerName}</strong><small>{officerRole}</small></span>
              <span aria-hidden="true">⌄</span>
            </button>
            {profileOpen && <div className="tv-profile-menu"><span>{officerName}</span><button type="button" onClick={signOut}>Sign out</button></div>}
          </div>
        </div>
      </header>

      <div className="tv-layout">
        <PortalSidebar kind={isInstitution ? 'institution' : 'officer'} />
        <main className="tv-main">
          <div className="tv-heading-row">
            <div className="tv-heading">
              <span className="tv-heading-icon"><Icon name="shield" size={25} /></span>
              <div><h1>Transaction Verification</h1><p>Verify financial transactions submitted by institutions against available bank statements and financial records.</p></div>
            </div>
            <div className="tv-heading-actions">
              <DateRangePicker label="Transaction date range" value={{ from: fromDate, to: toDate }} onChange={(next) => { setFromDate(next.from); setToDate(next.to); }} />
              <button type="button" className="tv-primary-button" onClick={() => runVerification()} disabled={!selectedClaim || Boolean(actionLoading)}><Icon name="refresh" size={15} /> {actionLoading ? 'Verifying…' : 'Verify Transaction'}</button>
              <button type="button" className="tv-secondary-button" onClick={() => exportClaims(filteredClaims)} disabled={!filteredClaims.length}><Icon name="download" size={15} /> Export Report</button>
            </div>
          </div>

          {error && <div className="tv-feedback is-error" role="alert">{error}<button type="button" onClick={() => setError('')}>Dismiss</button></div>}
          {notice && <div className="tv-feedback" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss message">×</button></div>}

          <section className="tv-metrics" aria-label="Transaction summary">
            <MetricCard icon="file" tone="blue" label="Total Transactions" value={loading ? '—' : claims.length.toLocaleString('en-IN')} note="Submitted claims in your scope" onClick={() => selectStatus('')} />
            <MetricCard icon="check" tone="green" label="Exact Matches" value={loading ? '—' : exactCount.toLocaleString('en-IN')} note={`${formatPercent(claims.length ? exactCount / claims.length * 100 : 0)} of transactions`} onClick={() => selectStatus('EXACT_MATCH')} />
            <MetricCard icon="alert" tone="amber" label="Flagged / Issues" value={loading ? '—' : flaggedCount.toLocaleString('en-IN')} note={`${formatPercent(claims.length ? flaggedCount / claims.length * 100 : 0)} need attention`} onClick={() => selectStatus('FLAGGED')} />
            <MetricCard icon="clock" tone="red" label="Pending Review" value={loading ? '—' : pendingCount.toLocaleString('en-IN')} note="Awaiting officer decision" onClick={() => selectStatus('PENDING_REVIEW')} />
          </section>

          <section className="tv-filters" aria-label="Filter transactions">
            <label className="tv-search"><Icon name="search" size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by UTR, reference number, institution name, amount, or FDR number..." /></label>
            <select aria-label="Filter by institution" value={institutionFilter} onChange={(event) => setInstitutionFilter(event.target.value)}><option value="">All Institutions</option>{institutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}</select>
            <select aria-label="Filter by bank" value={bankFilter} onChange={(event) => setBankFilter(event.target.value)}><option value="">All Banks</option>{banks.map((bank) => <option key={bank} value={bank}>{bank}</option>)}</select>
            <select aria-label="Filter by match status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All Statuses</option><option value="EXACT_MATCH">Exact Match</option><option value="POSSIBLE_MATCH">Probable Match</option><option value="AMOUNT_MISMATCH">Amount Mismatch</option><option value="DUPLICATE_CLAIM">Duplicate Suspected</option><option value="MISSING_TRANSACTION">No Matching Record</option><option value="FLAGGED">All Flagged</option><option value="PENDING_REVIEW">Pending Review</option></select>
            <button className="tv-reset-button" type="button" onClick={resetFilters}><Icon name="refresh" size={14} /> Reset</button>
          </section>

          <div className="tv-workspace">
            <section className="tv-list-panel">
              <div className="tv-table-heading"><h2>Transaction Verification List</h2><span>{loading ? 'Loading records…' : `Showing ${filteredClaims.length ? (page - 1) * PAGE_SIZE + 1 : 0}–${Math.min(page * PAGE_SIZE, filteredClaims.length)} of ${filteredClaims.length} records`}</span></div>
              <div className="tv-table-scroll">
                <table>
                  <thead><tr><th className="tv-number-col">#</th><th>UTR / Reference No.</th><th>Institution Name</th><th>Amount (₹)</th><th>Transaction Date</th><th>Bank Name</th><th>Match Status</th><th>Action</th></tr></thead>
                  <tbody>
                    {loading ? <tr><td colSpan="8" className="tv-empty">Loading transaction records…</td></tr>
                      : visibleClaims.length === 0 ? <tr><td colSpan="8" className="tv-empty">{error ? 'Transaction records could not be loaded.' : 'No transactions match these filters.'}</td></tr>
                        : visibleClaims.map((claim, index) => (
                          <tr key={claim.id} className={selectedClaim?.id === claim.id ? 'is-selected' : ''} onClick={() => { setSelectedId(claim.id); setDetailDismissed(false); setDetailTab('overview'); }}>
                            <td>{(page - 1) * PAGE_SIZE + index + 1}</td>
                            <td className="tv-utr-cell">{claim.utr}</td>
                            <td>{claim.institution_name || claim.institution_id}</td>
                            <td>{formatAmount(claim.amount)}</td>
                            <td>{displayDate(claim.date)}</td>
                            <td>{bankFromClaim(claim) || '—'}</td>
                            <td><StatusBadge statusMap={MATCH_STATUSES} code={claim.match_result?.classification} /></td>
                            <td><button className="tv-view-button" type="button" aria-label={`View transaction ${claim.utr}`} onClick={(event) => { event.stopPropagation(); setSelectedId(claim.id); setDetailDismissed(false); setDetailTab('overview'); }}><Icon name="eye" size={15} /></button></td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>
              <div className="tv-pagination">
                <div>
                  <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>‹</button>
                  {Array.from({ length: pageCount }, (_, index) => index + 1).slice(0, 5).map((pageNumber) => <button type="button" key={pageNumber} className={page === pageNumber ? 'is-current' : ''} onClick={() => setPage(pageNumber)}>{pageNumber}</button>)}
                  {pageCount > 5 && <><span>…</span><button type="button" onClick={() => setPage(pageCount)}>{pageCount}</button></>}
                  <button type="button" aria-label="Next page" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>›</button>
                </div>
                <span>Items per page: {PAGE_SIZE}</span>
              </div>
            </section>

            <aside className="tv-detail-panel" aria-label="Transaction details">
              {!selectedClaim ? (
                <div className="tv-detail-empty"><Icon name="file" size={25} /><strong>Select a transaction</strong><span>Choose a row to inspect its matching evidence.</span></div>
              ) : (
                <>
                  <div className="tv-detail-heading"><h2>Transaction Details</h2><button type="button" onClick={() => setDetailDismissed(true)} aria-label="Close transaction details"><Icon name="close" size={16} /></button></div>
                  <div className="tv-detail-body">
                    <div className="tv-detail-status-row"><StatusBadge statusMap={MATCH_STATUSES} code={selectedClaim.match_result?.classification} /><span className={`tv-priority ${selectedClaim.match_result?.classification === 'AMOUNT_MISMATCH' || selectedClaim.match_result?.classification === 'DUPLICATE_CLAIM' ? 'is-high' : ''}`}>{selectedClaim.match_result?.classification === 'AMOUNT_MISMATCH' || selectedClaim.match_result?.classification === 'DUPLICATE_CLAIM' ? 'High Priority' : 'For Review'}</span></div>
                    <div className="tv-detail-reference"><strong>{selectedClaim.utr}</strong><button type="button" onClick={copyUtr} aria-label="Copy transaction reference"><Icon name="copy" size={14} /></button></div>
                    <p className="tv-detail-institution">{selectedClaim.institution_name || selectedClaim.institution_id}<span>· {selectedClaim.id}</span></p>
                    <div className="tv-detail-tabs" role="tablist" aria-label="Transaction information">
                      {['overview', 'evidence', 'history'].map((tab) => <button type="button" key={tab} role="tab" aria-selected={detailTab === tab} className={detailTab === tab ? 'is-active' : ''} onClick={() => setDetailTab(tab)}>{tab === 'overview' ? 'Overview' : tab === 'evidence' ? 'Evidence' : 'Verification History'}</button>)}
                    </div>

                    {detailTab === 'overview' && (
                      <>
                        <div className="tv-amount-comparison">
                          <div><small>Institution Claim</small><strong>{formatAmount(selectedClaim.amount)}</strong><span>{displayDate(selectedClaim.date)}</span></div>
                          <div><small>Statement Record</small><strong>{getBankAmount(selectedClaim) === null ? 'Not found' : formatAmount(getBankAmount(selectedClaim))}</strong><span>{bankFromClaim(selectedClaim) || 'Bank statement feed'}</span></div>
                        </div>
                        <h3 className="tv-detail-subheading">Transaction Details</h3>
                        <dl className="tv-detail-list">
                          <dt>UTR / Reference No.</dt><dd>{selectedClaim.utr}</dd>
                          <dt>Bank Name</dt><dd>{bankFromClaim(selectedClaim) || 'Not identified in statement evidence'}</dd>
                          <dt>Account No.</dt><dd>Not provided</dd>
                          <dt>Transaction Type</dt><dd>Payment claim</dd>
                          <dt>Direction</dt><dd>Credit</dd>
                          <dt>Institution</dt><dd>{selectedClaim.institution_name || selectedClaim.institution_id}</dd>
                        </dl>
                        {selectedClaim.shortfall > 0 && <div className="tv-flag-reason"><Icon name="alert" size={15} /><span><strong>Deposit shortfall</strong><small>{formatAmount(selectedClaim.shortfall)} below required deposit of {formatAmount(selectedClaim.required_deposit)}.</small></span></div>}
                        {selectedClaim.match_result?.classification !== 'EXACT_MATCH' && (
                          <div className="tv-flag-reason"><Icon name="alert" size={15} /><span><strong>Reason for Flagging</strong><small>{selectedClaim.match_result?.suggested_action || 'The claim requires further review against bank evidence.'}</small></span></div>
                        )}
                      </>
                    )}

                    {detailTab === 'evidence' && (
                      <div className="tv-evidence-tab">
                        <h3 className="tv-detail-subheading">Match Evidence</h3>
                        <p>Match confidence: <strong>{Math.round((selectedClaim.match_result?.score || 0) * 100)}%</strong></p>
                        {selectedClaim.match_result?.evidence_lines?.length
                          ? <ul>{selectedClaim.match_result.evidence_lines.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}</ul>
                          : <p>No bank statement evidence is available for this transaction yet.</p>}
                        {selectedClaim.match_result?.rule_ids?.length > 0 && <div className="tv-rule-list"><strong>Applied verification rules</strong>{selectedClaim.match_result.rule_ids.map((rule) => <code key={rule}>{rule}</code>)}</div>}
                        <p className="tv-disclaimer">A statement match indicates consistency with the available bank feed, not proof of authenticity or final approval.</p>
                      </div>
                    )}

                    {detailTab === 'history' && (
                      <div className="tv-history-tab">
                        <h3 className="tv-detail-subheading">Verification History</h3>
                        <div className="tv-history-item"><i className="is-blue" /><span><strong>Transaction submitted</strong><small>{displayDate(selectedClaim.created_at, true)} · {selectedClaim.provenance_tag}</small></span></div>
                        <div className="tv-history-item"><i className="is-amber" /><span><strong>Automated match: {matchLabel(selectedClaim)}</strong><small>{selectedClaim.match_result?.score != null ? `${Math.round(selectedClaim.match_result.score * 100)}% match confidence` : 'Match result recorded'}</small></span></div>
                        {selectedClaim.decided_at && <div className="tv-history-item"><i className="is-green" /><span><strong>{selectedClaim.officer_decision === 'OFFICER_VERIFIED' ? 'Officer verified' : 'Clarification requested'}</strong><small>{displayDate(selectedClaim.decided_at, true)} · {selectedClaim.decided_by || 'Authorised officer'}</small></span></div>}
                        {selectedClaim.remarks && <div className="tv-history-note"><strong>Latest note</strong><p>{selectedClaim.remarks}</p></div>}
                      </div>
                    )}

                    {canDecide && (
                      <div className="tv-detail-actions">
                        {selectedClaim.match_result?.classification === 'EXACT_MATCH' && selectedClaim.officer_decision !== 'OFFICER_VERIFIED' && <button className="tv-primary-button" type="button" disabled={Boolean(actionLoading)} onClick={markVerified}><Icon name="check" size={15} /> Mark Officer Verified</button>}
                        <button className="tv-secondary-button" type="button" disabled={Boolean(actionLoading)} onClick={() => { setClarificationNotes('Please provide a signed bank counterfoil.'); setClarificationOpen(true); }}>Request Clarification</button>
                      </div>
                    )}
                    {!canDecide && <p className="tv-readonly-note">Verification decisions are made by authorised AICTE Scrutiny Officers.</p>}
                  </div>
                </>
              )}
            </aside>
          </div>
        </main>
      </div>

      {clarificationOpen && selectedClaim && (
        <div className="tv-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !actionLoading) setClarificationOpen(false); }}>
          <section className="tv-modal" role="dialog" aria-modal="true" aria-labelledby="tv-clarification-title">
            <div className="tv-modal-heading"><h2 id="tv-clarification-title">Request Clarification</h2><button type="button" onClick={() => setClarificationOpen(false)} aria-label="Close" disabled={Boolean(actionLoading)}><Icon name="close" /></button></div>
            <p>Send a clarification request for UTR <strong>{selectedClaim.utr}</strong>.</p>
            <form onSubmit={requestClarification}>
              <label>Note to institution<textarea required rows="4" value={clarificationNotes} onChange={(event) => setClarificationNotes(event.target.value)} /></label>
              <div className="tv-modal-actions"><button type="button" className="tv-secondary-button" onClick={() => setClarificationOpen(false)} disabled={Boolean(actionLoading)}>Cancel</button><button type="submit" className="tv-primary-button" disabled={Boolean(actionLoading) || !clarificationNotes.trim()}>{actionLoading ? 'Sending…' : 'Send Request'}</button></div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
