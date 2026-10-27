import { useCallback, useEffect, useMemo, useState } from 'react';
import { fdrRepo, institutionsRepo, releaseRepo } from '../data/repositories.js';
import { usePortal } from '../context/PortalContext.jsx';
import PortalSidebar from '../components/PortalSidebar.jsx';
import NotificationButton from '../components/NotificationButton.jsx';
import DateRangePicker from '../components/DateRangePicker.jsx';
import '../styles/release-requests.css';

const PAGE_SIZE = 10;
const STATUS_LABELS = {
  SUBMITTED: 'Submitted',
  IN_SCRUTINY: 'Under Review',
  RECOMMENDED: 'Recommended',
  AUTHORISED: 'Approved',
  REJECTED: 'Rejected',
  CLOSED: 'Released',
};
const STATUS_CLASSES = {
  SUBMITTED: 'submitted',
  IN_SCRUTINY: 'review',
  RECOMMENDED: 'recommended',
  AUTHORISED: 'approved',
  REJECTED: 'rejected',
  CLOSED: 'released',
};

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatAmount(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status?.replaceAll('_', ' ') || 'Unknown';
}

function Icon({ name, size = 18 }) {
  const paths = {
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6m-11 5 2 2 4-4" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    close: <path d="m18 6-12 12M6 6l12 12" />,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    plus: <path d="M12 5v14m-7-7h14" />,
    refresh: <><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" /><path d="M3 3v5h5" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Metric({ icon, tone, label, value, note }) {
  return (
    <div className="rr-metric">
      <span className={`rr-metric-icon ${tone}`}><Icon name={icon} /></span>
      <span><small>{label}</small><strong>{value}</strong><em>{note}</em></span>
    </div>
  );
}

export default function ReleaseRequests() {
  const { user, signOut } = usePortal();
  const [requests, setRequests] = useState([]);
  const [instruments, setInstruments] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [districtFilter, setDistrictFilter] = useState('');
  const [institutionFilter, setInstitutionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState('');
  const [detailVisible, setDetailVisible] = useState(true);
  const [detailTab, setDetailTab] = useState('summary');
  const [profileOpen, setProfileOpen] = useState(false);
  const [newRequestOpen, setNewRequestOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const [actionType, setActionType] = useState('');
  const [actionNotes, setActionNotes] = useState('');
  const [speakingOrder, setSpeakingOrder] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [newInstrumentId, setNewInstrumentId] = useState('');
  const [newReason, setNewReason] = useState('');
  const [hasRequestLetter, setHasRequestLetter] = useState(true);
  const [hasAffidavit, setHasAffidavit] = useState(true);

  const isInstitution = user?.kind === 'institution';
  const canRecommend = ['admin', 'head', 'committee', 'scrutiny'].includes(user?.role);
  const canAuthorise = ['admin', 'head'].includes(user?.role);
  const officerName = user?.name || 'AICTE Officer';
  const officerRole = user?.role === 'institution'
    ? 'Institution Portal'
    : user?.region_scope ? `Scrutiny Officer, ${user.region_scope}` : 'AICTE Regulation Bureau';

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [requestData, instrumentData, institutionData] = await Promise.all([
        releaseRepo.list(),
        fdrRepo.list(),
        institutionsRepo.list(),
      ]);
      setRequests(requestData);
      setInstruments(instrumentData);
      setInstitutions(institutionData);
      setSelectedId((current) => requestData.some((item) => item.id === current) ? current : requestData[0]?.id || '');
    } catch (loadError) {
      setError(`Unable to load release requests: ${loadError.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const institutionById = useMemo(() => new Map(institutions.map((item) => [item.id, item])), [institutions]);
  const instrumentById = useMemo(() => new Map(instruments.map((item) => [item.id, item])), [instruments]);
  const states = useMemo(() => [...new Set(institutions.map((item) => item.state).filter(Boolean))].sort(), [institutions]);
  const districts = useMemo(() => [...new Set(institutions
    .filter((item) => !stateFilter || item.state === stateFilter)
    .map((item) => item.region).filter(Boolean))].sort(), [institutions, stateFilter]);

  const filteredRequests = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return requests.filter((request) => {
      const institution = institutionById.get(request.institution_id);
      const instrument = instrumentById.get(request.instrument_id);
      const matchesQuery = !normalizedQuery || [
        request.id, request.institution_name, request.instrument_ref, request.reason,
      ].some((value) => value?.toLowerCase().includes(normalizedQuery));
      const matchesStatus = !statusFilter || request.status === statusFilter;
      const matchesInstitution = !institutionFilter || request.institution_id === institutionFilter;
      const matchesState = !stateFilter || institution?.state === stateFilter;
      const matchesDistrict = !districtFilter || institution?.region === districtFilter;
      const requestDate = (request.created_at || '').slice(0, 10);
      const matchesDate = (!fromDate || requestDate >= fromDate) && (!toDate || requestDate <= toDate);
      return matchesQuery && matchesStatus && matchesInstitution && matchesState && matchesDistrict && matchesDate && Boolean(instrument || request.instrument_ref);
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [districtFilter, fromDate, institutionById, institutionFilter, instrumentById, query, requests, stateFilter, statusFilter, toDate]);

  const selectedRequest = detailVisible
    ? filteredRequests.find((item) => item.id === selectedId)
      || requests.find((item) => item.id === selectedId)
      || filteredRequests[0]
      || null
    : null;
  const pageCount = Math.max(1, Math.ceil(filteredRequests.length / PAGE_SIZE));
  const visibleRequests = filteredRequests.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pendingCount = requests.filter((item) => ['SUBMITTED', 'IN_SCRUTINY', 'RECOMMENDED'].includes(item.status)).length;
  const approvedCount = requests.filter((item) => item.status === 'AUTHORISED').length;
  const rejectedCount = requests.filter((item) => item.status === 'REJECTED').length;

  useEffect(() => { setPage(1); }, [query, stateFilter, districtFilter, institutionFilter, statusFilter, fromDate, toDate]);
  useEffect(() => {
    if (selectedRequest && selectedRequest.id !== selectedId) setSelectedId(selectedRequest.id);
  }, [selectedRequest, selectedId]);

  const selectedInstrument = selectedRequest ? instrumentById.get(selectedRequest.instrument_id) : null;
  const availableInstruments = instruments.filter((item) => (
    item.status !== 'released'
    && (!isInstitution || item.institution_id === user?.institution_id)
  ));
  const newInstrument = instrumentById.get(newInstrumentId);
  const selectedInstitution = selectedRequest ? institutionById.get(selectedRequest.institution_id) : null;

  const resetFilters = () => {
    setQuery('');
    setStateFilter('');
    setDistrictFilter('');
    setInstitutionFilter('');
    setStatusFilter('');
    setFromDate('');
    setToDate('');
  };

  const submitNewRequest = async (event) => {
    event.preventDefault();
    if (!newInstrument || !newReason.trim() || actionLoading) return;
    setActionLoading(true);
    setError('');
    setNotice('');
    try {
      const created = await releaseRepo.submit({
        institution_id: newInstrument.institution_id,
        instrument_id: newInstrument.id,
        reason: newReason.trim(),
        has_request_letter: hasRequestLetter,
        has_affidavit_6: hasAffidavit,
      });
      setNewRequestOpen(false);
      setNewReason('');
      setNotice(`Release request ${created.id} submitted.`);
      await loadRequests();
      setSelectedId(created.id);
    } catch (submitError) {
      setError(`Could not submit release request: ${submitError.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const submitWorkflowAction = async (event) => {
    event.preventDefault();
    if (!selectedRequest || actionLoading) return;
    setActionLoading(true);
    setError('');
    setNotice('');
    try {
      if (actionType === 'recommend') await releaseRepo.recommend(selectedRequest.id, actionNotes);
      else if (actionType === 'authorise') await releaseRepo.authorize(selectedRequest.id, speakingOrder, actionNotes);
      else await releaseRepo.reject(selectedRequest.id, actionNotes);
      setActionOpen(false);
      setNotice(`Request ${selectedRequest.id} updated successfully.`);
      await loadRequests();
    } catch (actionError) {
      setError(`Could not update request: ${actionError.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const startAction = (type) => {
    setActionType(type);
    setActionNotes('');
    setSpeakingOrder('');
    setActionOpen(true);
  };

  const statusOptions = [...new Set(requests.map((request) => request.status))];
  const statusCanRecommend = selectedRequest && ['SUBMITTED', 'IN_SCRUTINY'].includes(selectedRequest.status);
  const statusCanDecide = selectedRequest && ['SUBMITTED', 'IN_SCRUTINY', 'RECOMMENDED'].includes(selectedRequest.status);

  return (
    <div className="rr-page">
      <header className="rr-header">
        <img className="rr-banner" src="/aicte-tricolor-heritage-header.png" alt="AICTE — Technical Education for a Stronger India" />
        <div className="rr-header-actions">
          <NotificationButton className="rr-notification" />
          <div className="rr-profile-wrap">
            <button className="rr-profile" type="button" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen}>
              <span className="rr-avatar">{officerName.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span>
              <span><strong>{officerName}</strong><small>{officerRole}</small></span><span aria-hidden="true">⌄</span>
            </button>
            {profileOpen && <div className="rr-profile-menu"><span>{officerName}</span><button type="button" onClick={signOut}>Sign out</button></div>}
          </div>
        </div>
      </header>

      <div className="rr-layout">
        <PortalSidebar kind={isInstitution ? 'institution' : 'officer'} />
        <main className="rr-main">
          <div className="rr-heading-row">
            <div className="rr-heading">
              <span className="rr-heading-icon"><Icon name="file" size={25} /></span>
              <div><h1>Release / Refund Requests</h1><p>Track and manage institution requests for release of Security Deposit / FDR, with approval workflow and status updates.</p></div>
            </div>
            <div className="rr-heading-actions">
              <DateRangePicker label="Request date range" value={{ from: fromDate, to: toDate }} onChange={(next) => { setFromDate(next.from); setToDate(next.to); }} />
              <button className="rr-primary" type="button" onClick={() => setNewRequestOpen(true)} disabled={!availableInstruments.length}><Icon name="plus" size={16} /> New Request</button>
            </div>
          </div>

          {error && <div className="rr-feedback is-error" role="alert">{error}</div>}
          {notice && <div className="rr-feedback is-success" role="status">{notice}</div>}

          <section className="rr-metrics" aria-label="Release request summary">
            <Metric icon="file" tone="blue" label="Total Requests" value={loading ? '—' : requests.length} note="All release requests" />
            <Metric icon="check" tone="green" label="Approved" value={loading ? '—' : approvedCount} note="Authorised by authority" />
            <Metric icon="clock" tone="amber" label="Under Review" value={loading ? '—' : pendingCount} note="In workflow" />
            <Metric icon="close" tone="red" label="Rejected" value={loading ? '—' : rejectedCount} note="Decision recorded" />
          </section>

          <section className="rr-filters" aria-label="Filter release requests">
            <label className="rr-search"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by request ID, institution name, FDR number, or reason..." /></label>
            <select aria-label="Filter by state" value={stateFilter} onChange={(event) => { setStateFilter(event.target.value); setDistrictFilter(''); }}><option value="">All States</option>{states.map((state) => <option key={state}>{state}</option>)}</select>
            <select aria-label="Filter by district or region" value={districtFilter} onChange={(event) => setDistrictFilter(event.target.value)}><option value="">All Districts / Regions</option>{districts.map((district) => <option key={district}>{district}</option>)}</select>
            <select aria-label="Filter by request type" value="release" disabled><option value="release">Release Requests</option></select>
            <select aria-label="Filter by institution" value={institutionFilter} onChange={(event) => setInstitutionFilter(event.target.value)}><option value="">All Institutions</option>{institutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}</select>
            <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All Statuses</option>{statusOptions.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select>
            <button type="button" className="rr-reset" onClick={resetFilters}><Icon name="refresh" size={15} /> Reset</button>
          </section>

          <div className={`rr-workspace${selectedRequest ? '' : ' is-full'}`}>
            <section className="rr-table-panel">
              <div className="rr-table-heading"><h2>Release / Refund Requests</h2><span>{loading ? 'Loading…' : `Showing ${filteredRequests.length ? (page - 1) * PAGE_SIZE + 1 : 0}–${Math.min(page * PAGE_SIZE, filteredRequests.length)} of ${filteredRequests.length} records`}</span></div>
              <div className="rr-table-scroll">
                <table>
                  <thead><tr><th><input aria-label="Select all visible requests" type="checkbox" disabled /></th><th>#</th><th>Request ID</th><th>Institution Name</th><th>FDR / Deposit No.</th><th>Request Type</th><th>Amount (₹)</th><th>Requested On</th><th>Status</th><th>Action</th></tr></thead>
                  <tbody>
                    {loading ? <tr><td colSpan="10" className="rr-table-message">Loading release requests…</td></tr>
                      : visibleRequests.length === 0 ? <tr><td colSpan="10" className="rr-table-message">{error ? 'Request records could not be loaded.' : 'No release requests match your filters.'}</td></tr>
                        : visibleRequests.map((request, index) => {
                          const instrument = instrumentById.get(request.instrument_id);
                          return (
                            <tr key={request.id} className={selectedId === request.id && detailVisible ? 'is-selected' : ''} onClick={() => { setSelectedId(request.id); setDetailVisible(true); setDetailTab('summary'); }}>
                              <td><input aria-label={`Select ${request.id}`} type="checkbox" onClick={(event) => event.stopPropagation()} /></td>
                              <td>{(page - 1) * PAGE_SIZE + index + 1}</td>
                              <td><strong>{request.id}</strong></td>
                              <td>{request.institution_name || institutionById.get(request.institution_id)?.name || request.institution_id}</td>
                              <td>{request.instrument_ref || instrument?.reference || '—'}</td>
                              <td>Release</td>
                              <td>{formatAmount(instrument?.amount)}</td>
                              <td>{formatDate(request.created_at)}</td>
                              <td><span className={`rr-status is-${STATUS_CLASSES[request.status] || 'unknown'}`}>{statusLabel(request.status)}</span></td>
                              <td><button type="button" className="rr-icon-button" aria-label={`View ${request.id}`} onClick={(event) => { event.stopPropagation(); setSelectedId(request.id); setDetailVisible(true); setDetailTab('summary'); }}><Icon name="eye" size={15} /></button></td>
                            </tr>
                          );
                        })}
                  </tbody>
                </table>
              </div>
              <div className="rr-pagination">
                <div className="rr-page-buttons">
                  <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>‹</button>
                  {Array.from({ length: pageCount }, (_, index) => index + 1).slice(0, 5).map((pageNumber) => <button type="button" key={pageNumber} className={pageNumber === page ? 'is-current' : ''} onClick={() => setPage(pageNumber)}>{pageNumber}</button>)}
                  {pageCount > 5 && <span>…</span>}
                  <button type="button" aria-label="Next page" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>›</button>
                </div>
                <span>Items per page: <strong>{PAGE_SIZE}</strong></span>
              </div>
            </section>

            {selectedRequest && (
              <aside className="rr-detail-panel">
                <div className="rr-detail-heading"><h2>Request Details</h2><button type="button" aria-label="Close request details" onClick={() => setDetailVisible(false)}><Icon name="close" size={16} /></button></div>
                <div className="rr-detail-body">
                  <span className={`rr-status is-${STATUS_CLASSES[selectedRequest.status] || 'unknown'}`}>{statusLabel(selectedRequest.status)}</span>
                  <h3>{selectedRequest.id}</h3>
                  <p className="rr-detail-institution">{selectedRequest.institution_name || selectedInstitution?.name || selectedRequest.institution_id} <span>·</span> {selectedRequest.instrument_ref || selectedInstrument?.reference || 'FDR reference unavailable'}</p>
                  <nav className="rr-tabs" aria-label="Request detail sections">
                    {['summary', 'documents', 'approval', 'history'].map((tab) => <button type="button" key={tab} className={detailTab === tab ? 'is-active' : ''} onClick={() => setDetailTab(tab)}>{tab === 'approval' ? 'Approval Flow' : tab[0].toUpperCase() + tab.slice(1)}</button>)}
                  </nav>
                  {detailTab === 'summary' && (
                    <div className="rr-detail-content">
                      <section className="rr-detail-card"><h4>Request Information</h4><dl><dt>Request Type</dt><dd>Release</dd><dt>Requested On</dt><dd>{formatDate(selectedRequest.created_at)}</dd><dt>Requested Amount</dt><dd>{formatAmount(selectedInstrument?.amount)}</dd><dt>Expected Processing Time</dt><dd>Subject to workflow review</dd></dl></section>
                      <section className="rr-detail-card"><h4>FDR / Deposit Details</h4><dl><dt>FDR Number</dt><dd>{selectedRequest.instrument_ref || selectedInstrument?.reference || '—'}</dd><dt>Bank Name</dt><dd>{selectedInstrument?.bank || 'Not provided'}</dd><dt>Issue Date</dt><dd>{formatDate(selectedInstrument?.issue_date)}</dd><dt>Maturity Date</dt><dd>{formatDate(selectedInstrument?.maturity_date)}</dd></dl></section>
                      <section className="rr-detail-card"><h4>Current Status</h4><div className="rr-progress"><span className="is-done">Submitted</span><span className={['IN_SCRUTINY', 'RECOMMENDED', 'AUTHORISED', 'REJECTED'].includes(selectedRequest.status) ? 'is-done' : 'is-current'}>Review</span><span className={['AUTHORISED', 'REJECTED', 'CLOSED'].includes(selectedRequest.status) ? 'is-done' : ''}>Decision</span></div><p className="rr-reason">{selectedRequest.reason || 'No remarks supplied.'}</p>{selectedRequest.punitive_blocked && <p className="rr-blocked">Workflow actions are blocked while punitive action is active.</p>}</section>
                    </div>
                  )}
                  {detailTab === 'documents' && (
                    <div className="rr-detail-card rr-document-list"><h4>Required Documents</h4><p>Document availability from the request record:</p><span className={selectedRequest.has_request_letter ? 'is-present' : 'is-missing'}>{selectedRequest.has_request_letter ? '✓' : '×'} Request Letter {selectedRequest.has_request_letter ? 'Submitted' : 'Missing'}</span><span className={selectedRequest.has_affidavit_6 ? 'is-present' : 'is-missing'}>{selectedRequest.has_affidavit_6 ? '✓' : '×'} Affidavit 6 {selectedRequest.has_affidavit_6 ? 'Submitted' : 'Missing'}</span><small>Document files are not exposed by the current release-request API.</small></div>
                  )}
                  {detailTab === 'approval' && (
                    <div className="rr-detail-card rr-document-list"><h4>Approval Flow</h4>{(selectedRequest.steps || []).length ? selectedRequest.steps.map((step) => <div className="rr-history-step" key={step.id}><strong>{step.step_name.replaceAll('_', ' ')}</strong><span>{step.actor_name} · {step.actor_role}</span><small>{formatDate(step.created_at)} · {step.decision}</small>{step.notes && <p>{step.notes}</p>}</div>) : <p>No workflow actions have been recorded yet.</p>}</div>
                  )}
                  {detailTab === 'history' && (
                    <div className="rr-detail-card rr-document-list"><h4>Request History</h4>{(selectedRequest.steps || []).length ? selectedRequest.steps.map((step) => <div className="rr-history-step" key={step.id}><strong>{step.decision}</strong><span>{step.actor_name} · {formatDate(step.created_at)}</span>{step.notes && <p>{step.notes}</p>}</div>) : <p>Request submitted on {formatDate(selectedRequest.created_at)}. No further history is available.</p>}</div>
                  )}
                  <div className="rr-detail-actions">
                    {canRecommend && statusCanRecommend && !isInstitution && <button type="button" className="rr-primary rr-action-button" disabled={selectedRequest.punitive_blocked} onClick={() => startAction('recommend')}>Recommend</button>}
                    {canAuthorise && statusCanDecide && !isInstitution && <><button type="button" className="rr-primary rr-action-button" disabled={selectedRequest.punitive_blocked} onClick={() => startAction('authorise')}>Authorise</button><button type="button" className="rr-secondary rr-action-button" onClick={() => startAction('reject')}>Reject</button></>}
                    {isInstitution && <button type="button" className="rr-secondary rr-action-button" onClick={() => setDetailTab('documents')}>View Checklist</button>}
                  </div>
                </div>
              </aside>
            )}
          </div>
        </main>
      </div>

      {newRequestOpen && (
        <div className="rr-modal-backdrop" role="presentation" onClick={() => setNewRequestOpen(false)}>
          <form className="rr-modal" role="dialog" aria-modal="true" aria-labelledby="rr-new-title" onSubmit={submitNewRequest} onClick={(event) => event.stopPropagation()}>
            <button className="rr-modal-close" type="button" aria-label="Close" onClick={() => setNewRequestOpen(false)}><Icon name="close" /></button>
            <h2 id="rr-new-title">New Release Request</h2>
            <p>Select an eligible FDR and provide the request details.</p>
            <label>FDR / Deposit<select required value={newInstrumentId} onChange={(event) => setNewInstrumentId(event.target.value)}><option value="">Select an FDR</option>{availableInstruments.map((instrument) => <option key={instrument.id} value={instrument.id}>{instrument.reference} · {instrument.institution_name || institutionById.get(instrument.institution_id)?.name} · {formatAmount(instrument.amount)}</option>)}</select></label>
            {newInstrument && <div className="rr-instrument-summary"><strong>{newInstrument.institution_name || institutionById.get(newInstrument.institution_id)?.name}</strong><span>{newInstrument.bank} · {formatDate(newInstrument.maturity_date)}</span></div>}
            <label>Reason for release<textarea required rows="4" value={newReason} onChange={(event) => setNewReason(event.target.value)} placeholder="Enter the reason for requesting release of the deposit." /></label>
            <label className="rr-checkbox"><input type="checkbox" checked={hasRequestLetter} onChange={(event) => setHasRequestLetter(event.target.checked)} /> Request Letter attached</label>
            <label className="rr-checkbox"><input type="checkbox" checked={hasAffidavit} onChange={(event) => setHasAffidavit(event.target.checked)} /> Affidavit 6 attached</label>
            <div className="rr-modal-actions"><button type="button" className="rr-secondary" onClick={() => setNewRequestOpen(false)}>Cancel</button><button type="submit" className="rr-primary" disabled={actionLoading || !availableInstruments.length}>{actionLoading ? 'Submitting…' : 'Submit Request'}</button></div>
          </form>
        </div>
      )}

      {actionOpen && (
        <div className="rr-modal-backdrop" role="presentation" onClick={() => setActionOpen(false)}>
          <form className="rr-modal" role="dialog" aria-modal="true" aria-labelledby="rr-action-title" onSubmit={submitWorkflowAction} onClick={(event) => event.stopPropagation()}>
            <button className="rr-modal-close" type="button" aria-label="Close" onClick={() => setActionOpen(false)}><Icon name="close" /></button>
            <h2 id="rr-action-title">{actionType === 'recommend' ? 'Recommend Release' : actionType === 'authorise' ? 'Authorise Release' : 'Reject Request'}</h2>
            <p>{selectedRequest?.id} · {selectedRequest?.institution_name}</p>
            {actionType === 'authorise' && <label>Speaking order reference<input value={speakingOrder} onChange={(event) => setSpeakingOrder(event.target.value)} placeholder="Optional; generated if left blank" /></label>}
            <label>{actionType === 'reject' ? 'Reason for rejection' : 'Notes'}<textarea rows="4" required={actionType === 'reject'} value={actionNotes} onChange={(event) => setActionNotes(event.target.value)} placeholder="Add workflow notes" /></label>
            <div className="rr-modal-actions"><button type="button" className="rr-secondary" onClick={() => setActionOpen(false)}>Cancel</button><button type="submit" className="rr-primary" disabled={actionLoading || (actionType === 'reject' && !actionNotes.trim())}>{actionLoading ? 'Saving…' : 'Confirm'}</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
