import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePortal } from '../context/PortalContext.jsx';
import { fdrRepo, institutionsRepo } from '../data/repositories.js';
import PortalSidebar from '../components/PortalSidebar.jsx';
import NotificationButton from '../components/NotificationButton.jsx';
import DateRangePicker from '../components/DateRangePicker.jsx';
import '../styles/fdr-registry.css';

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const EMPTY_FORM = {
  institution_id: '',
  type: 'FDR',
  reference: '',
  bank: '',
  amount: '',
  issue_date: '',
  maturity_date: '',
  status: 'active',
  replaces_id: '',
  remarks: '',
};

function parseDate(value) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysUntil(value) {
  const date = parseDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

function displayDate(value) {
  const date = parseDate(value);
  return date ? date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

function formatAmount(amount) {
  return `₹ ${Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function getRegistryStatus(instrument) {
  const status = (instrument.status || '').toLowerCase();
  if (status === 'renewed') return 'Renewed';
  if (status === 'released') return 'Released';
  const days = instrument.days_to_maturity ?? daysUntil(instrument.maturity_date);
  if (status === 'matured' || (days !== null && days < 0)) return 'Expired / Overdue';
  if (status === 'expiring' || (days !== null && days <= 30)) return 'Approaching';
  return 'Active';
}

const statusClass = {
  Active: 'is-active',
  Approaching: 'is-approaching',
  'Expired / Overdue': 'is-overdue',
  Renewed: 'is-renewed',
  Released: 'is-released',
};

function Icon({ name, size = 18 }) {
  const paths = {
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    alert: <><path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    reset: <><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" /><path d="M3 3v5h5" /></>,
    calculator: <><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 6h8M8 11h2m4 0h2m-8 4h2m4 0h2m-8 4h2m4 0h2" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function Modal({ title, children, onClose, className = '' }) {
  return (
    <div className="fdr-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className={`fdr-modal ${className}`} role="dialog" aria-modal="true" aria-labelledby="fdr-modal-title">
        <div className="fdr-modal-heading">
          <h2 id="fdr-modal-title">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close dialog">×</button>
        </div>
        {children}
      </section>
    </div>
  );
}

export default function Calculator() {
  const { user, signOut } = usePortal();
  const [instruments, setInstruments] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [institutionFilter, setInstitutionFilter] = useState('');
  const [bankFilter, setBankFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedInstrument, setSelectedInstrument] = useState(null);
  const [editingInstrument, setEditingInstrument] = useState(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [selectedCalcInstitution, setSelectedCalcInstitution] = useState('');
  const [paidOverride, setPaidOverride] = useState('');
  const [calc, setCalc] = useState(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcError, setCalcError] = useState('');

  const canManage = ['admin', 'head', 'scrutiny', 'finance'].includes(user?.role);
  const isInstitution = user?.kind === 'institution';
  const officerName = user?.name || 'AICTE Officer';
  const officerRole = user?.role === 'head'
    ? 'Regulation Bureau Head'
    : user?.region_scope
      ? `Scrutiny Officer, ${user.region_scope}`
      : isInstitution
        ? 'Institution Portal'
        : user?.role || 'AICTE Regulation Bureau';

  const loadRegistry = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [instrumentData, institutionData] = await Promise.all([
        fdrRepo.list(),
        institutionsRepo.list(),
      ]);
      setInstruments(instrumentData);
      setInstitutions(institutionData);
    } catch (requestError) {
      setError(`Unable to load the FDR registry: ${requestError.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRegistry();
  }, [loadRegistry]);

  useEffect(() => {
    if (!institutions.length) return;
    setSelectedCalcInstitution((current) => current || institutions[0].id);
  }, [institutions]);

  useEffect(() => {
    if (!calculatorOpen || !selectedCalcInstitution) return;
    let isMounted = true;
    setCalcLoading(true);
    setCalcError('');
    institutionsRepo.getDepositCalc(selectedCalcInstitution, paidOverride || undefined)
      .then((result) => { if (isMounted) setCalc(result); })
      .catch((requestError) => { if (isMounted) setCalcError(`Unable to calculate deposit: ${requestError.message}`); })
      .finally(() => { if (isMounted) setCalcLoading(false); });
    return () => { isMounted = false; };
  }, [calculatorOpen, paidOverride, selectedCalcInstitution]);

  const banks = useMemo(
    () => [...new Set(instruments.map((instrument) => instrument.bank).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [instruments],
  );

  const records = useMemo(() => instruments.map((instrument) => ({
    ...instrument,
    trackerStatus: getRegistryStatus(instrument),
    daysLeft: instrument.days_to_maturity ?? daysUntil(instrument.maturity_date),
  })), [instruments]);

  const activeCount = records.filter((record) => record.trackerStatus === 'Active').length;
  const approachingCount = records.filter((record) => record.trackerStatus === 'Approaching').length;
  const overdueCount = records.filter((record) => record.trackerStatus === 'Expired / Overdue').length;

  const filteredRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return records.filter((record) => {
      const matchesQuery = !normalizedQuery || [
        record.institution_name,
        record.reference,
        record.bank,
        record.institution_id,
        record.id,
      ].some((value) => value?.toLowerCase().includes(normalizedQuery));
      const matchesInstitution = !institutionFilter || record.institution_id === institutionFilter;
      const matchesBank = !bankFilter || record.bank === bankFilter;
      const matchesStatus = !statusFilter || record.trackerStatus === statusFilter;
      const matchesDate = (!fromDate || record.maturity_date >= fromDate)
        && (!toDate || record.maturity_date <= toDate);
      return matchesQuery && matchesInstitution && matchesBank && matchesStatus && matchesDate;
    }).sort((a, b) => a.maturity_date.localeCompare(b.maturity_date));
  }, [bankFilter, fromDate, institutionFilter, query, records, statusFilter, toDate]);

  const pageCount = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const visibleRecords = filteredRecords.slice((page - 1) * pageSize, page * pageSize);
  const firstRecord = filteredRecords.length ? (page - 1) * pageSize + 1 : 0;
  const lastRecord = Math.min(page * pageSize, filteredRecords.length);

  useEffect(() => {
    setPage(1);
  }, [query, institutionFilter, bankFilter, statusFilter, fromDate, toDate, pageSize]);

  const resetFilters = () => {
    setQuery('');
    setInstitutionFilter('');
    setBankFilter('');
    setStatusFilter('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const openRegister = () => {
    setEditingInstrument(null);
    setForm({ ...EMPTY_FORM, institution_id: institutions[0]?.id || '' });
    setError('');
    setNotice('');
    setRegisterOpen(true);
  };

  const openEdit = (instrument) => {
    setSelectedInstrument(null);
    setEditingInstrument(instrument);
    setForm({
      ...EMPTY_FORM,
      reference: instrument.reference || '',
      bank: instrument.bank || '',
      amount: String(instrument.amount ?? ''),
      issue_date: instrument.issue_date || '',
      maturity_date: instrument.maturity_date || '',
      status: instrument.status || 'active',
      replaces_id: instrument.replaces_id || '',
      remarks: instrument.remarks || '',
    });
  };

  const closeForm = () => {
    if (saving) return;
    setRegisterOpen(false);
    setEditingInstrument(null);
  };

  const submitInstrument = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (editingInstrument) {
        const updated = await fdrRepo.update(editingInstrument.id, {
          reference: form.reference.trim(),
          bank: form.bank.trim(),
          amount: Number(form.amount),
          issue_date: form.issue_date,
          maturity_date: form.maturity_date,
          status: form.status,
          replaces_id: form.replaces_id || null,
          remarks: form.remarks.trim() || null,
        });
        setNotice(`${updated.reference} was updated.`);
      } else {
        const created = await fdrRepo.create({
          institution_id: form.institution_id,
          type: form.type,
          reference: form.reference.trim(),
          bank: form.bank.trim(),
          amount: Number(form.amount),
          issue_date: form.issue_date,
          maturity_date: form.maturity_date,
          replaces_id: form.replaces_id || null,
          remarks: form.remarks.trim() || null,
        });
        setNotice(`${created.reference} was added to the registry.`);
      }
      setRegisterOpen(false);
      setEditingInstrument(null);
      await loadRegistry();
    } catch (requestError) {
      setError(`Unable to save FDR record: ${requestError.message}`);
    } finally {
      setSaving(false);
    }
  };

  const setField = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  return (
    <div className="fdr-page">
      <header className="fdr-header">
        <img className="fdr-banner" src="/aicte-tricolor-heritage-header.png" alt="AICTE — Technical Education for a Stronger India" />
        <div className="fdr-header-actions">
          <NotificationButton className="fdr-notification" />
          <div className="fdr-profile-wrap">
            <button className="fdr-profile" type="button" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen}>
              <span className="fdr-avatar">{officerName.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span>
              <span><strong>{officerName}</strong><small>{officerRole}</small></span>
              <span aria-hidden="true">⌄</span>
            </button>
            {profileOpen && <div className="fdr-profile-menu"><span>{officerName}</span><button type="button" onClick={signOut}>Sign out</button></div>}
          </div>
        </div>
      </header>

      <div className="fdr-layout">
        <PortalSidebar kind={isInstitution ? 'institution' : 'officer'} />
        <main className="fdr-main">
          <div className="fdr-heading-row">
            <div className="fdr-heading">
              <span className="fdr-heading-icon"><Icon name="file" size={25} /></span>
              <div>
                <h1>FDR Registry</h1>
                <p>View and manage all Fixed Deposit Receipts submitted by institutions, track maturity dates, and monitor status.</p>
              </div>
            </div>
            <div className="fdr-heading-actions">
              <DateRangePicker label="Maturity date range" value={{ from: fromDate, to: toDate }} onChange={(next) => { setFromDate(next.from); setToDate(next.to); }} />
              <button type="button" className="fdr-secondary-button" onClick={() => setCalculatorOpen(true)}><Icon name="calculator" size={15} /> Deposit Calculator</button>
              {canManage && <button type="button" className="fdr-primary-button" onClick={openRegister}><Icon name="plus" size={16} /> Register New FDR</button>}
            </div>
          </div>

          {error && !registerOpen && !editingInstrument && <div className="fdr-feedback is-error" role="alert">{error}<button type="button" onClick={loadRegistry}>Retry</button></div>}
          {notice && <div className="fdr-feedback" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss message">×</button></div>}

          <section className="fdr-metrics" aria-label="FDR registry summary">
            <button className="fdr-metric" type="button" onClick={resetFilters}>
              <span className="fdr-metric-icon is-blue"><Icon name="file" /></span>
              <span><small>Total FDRs</small><strong>{loading ? '—' : records.length.toLocaleString('en-IN')}</strong><em>All registered records</em></span>
            </button>
            <button className="fdr-metric" type="button" onClick={() => setStatusFilter('Active')}>
              <span className="fdr-metric-icon is-green"><Icon name="check" /></span>
              <span><small>Active FDRs</small><strong>{loading ? '—' : activeCount.toLocaleString('en-IN')}</strong><em>Currently active</em></span>
            </button>
            <button className="fdr-metric" type="button" onClick={() => setStatusFilter('Approaching')}>
              <span className="fdr-metric-icon is-amber"><Icon name="clock" /></span>
              <span><small>Approaching Maturity (≤ 30 days)</small><strong>{loading ? '—' : approachingCount.toLocaleString('en-IN')}</strong><em>Needs attention</em></span>
            </button>
            <button className="fdr-metric" type="button" onClick={() => setStatusFilter('Expired / Overdue')}>
              <span className="fdr-metric-icon is-red"><Icon name="alert" /></span>
              <span><small>Expired / Overdue</small><strong>{loading ? '—' : overdueCount.toLocaleString('en-IN')}</strong><em>Immediate review</em></span>
            </button>
          </section>

          <section className="fdr-filters" aria-label="Filter FDR registry">
            <label className="fdr-search"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by institution name, FDR number, bank name, or reference ID..." /></label>
            <select aria-label="Filter by institution" value={institutionFilter} onChange={(event) => setInstitutionFilter(event.target.value)}>
              <option value="">All Institutions</option>
              {institutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}
            </select>
            <select aria-label="Filter by bank" value={bankFilter} onChange={(event) => setBankFilter(event.target.value)}>
              <option value="">All Banks</option>
              {banks.map((bank) => <option key={bank} value={bank}>{bank}</option>)}
            </select>
            <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All Status</option>
              {Object.keys(statusClass).map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <button className="fdr-reset-button" type="button" onClick={resetFilters}><Icon name="reset" size={15} /> Reset</button>
          </section>

          <section className="fdr-registry-panel">
            <div className="fdr-table-heading"><h2>FDR Registry</h2><span>{loading ? 'Loading records…' : `Showing ${firstRecord}–${lastRecord} of ${filteredRecords.length.toLocaleString('en-IN')} records`}</span></div>
            <div className="fdr-table-scroll">
              <table>
                <thead><tr><th>#</th><th>FDR Number</th><th>Institution Name</th><th>Bank Name</th><th>Amount (₹)</th><th>Issue Date</th><th>Maturity Date</th><th>Status</th><th>Days Left</th><th>Actions</th></tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan="10" className="fdr-empty-state">Loading FDR registry…</td></tr>
                    : visibleRecords.length === 0 ? <tr><td colSpan="10" className="fdr-empty-state">{error ? 'FDR records could not be loaded.' : 'No FDR records match the selected filters.'}</td></tr>
                      : visibleRecords.map((record, index) => (
                        <tr key={record.id}>
                          <td>{(page - 1) * pageSize + index + 1}</td>
                          <td className="fdr-reference">{record.reference}</td>
                          <td>{record.institution_name || record.institution_id}</td>
                          <td>{record.bank}</td>
                          <td className="fdr-amount">{formatAmount(record.amount)}</td>
                          <td>{displayDate(record.issue_date)}</td>
                          <td>{displayDate(record.maturity_date)}</td>
                          <td><span className={`fdr-status ${statusClass[record.trackerStatus]}`}>{record.trackerStatus}</span></td>
                          <td><span className={`fdr-days ${record.daysLeft < 0 ? 'is-overdue' : record.daysLeft <= 30 ? 'is-approaching' : ''}`}>{record.daysLeft === null ? '—' : `${record.daysLeft} days`}</span></td>
                          <td>
                            <div className="fdr-row-actions">
                              <button type="button" title="View FDR details" aria-label={`View ${record.reference}`} onClick={() => setSelectedInstrument(record)}><Icon name="eye" size={15} /></button>
                              {canManage && <button type="button" title="Edit FDR" aria-label={`Edit ${record.reference}`} onClick={() => openEdit(record)}><Icon name="edit" size={15} /></button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
            <div className="fdr-pagination">
              <div className="fdr-page-buttons">
                <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>‹</button>
                {Array.from({ length: Math.min(pageCount, 5) }, (_, index) => {
                  const pageNumber = pageCount <= 5 ? index + 1 : Math.min(Math.max(page - 2, 1), pageCount - 4) + index;
                  return <button type="button" key={pageNumber} className={pageNumber === page ? 'is-current' : ''} onClick={() => setPage(pageNumber)}>{pageNumber}</button>;
                })}
                {pageCount > 5 && <><span>…</span><button type="button" onClick={() => setPage(pageCount)}>{pageCount}</button></>}
                <button type="button" aria-label="Next page" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>›</button>
              </div>
              <label>Items per page<select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>{PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
            </div>
          </section>
        </main>
      </div>

      {(registerOpen || editingInstrument) && (
        <Modal title={editingInstrument ? 'Edit FDR Record' : 'Register New FDR'} onClose={closeForm} className="fdr-form-modal">
          <form className="fdr-form" onSubmit={submitInstrument}>
            {!editingInstrument && <label>Institution<select required value={form.institution_id} onChange={setField('institution_id')}><option value="">Select institution</option>{institutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}</select></label>}
            <div className="fdr-form-grid">
              <label>FDR Number / Reference<input required value={form.reference} onChange={setField('reference')} placeholder="e.g. FDR-SBI-89211" /></label>
              <label>Bank Name<input required value={form.bank} onChange={setField('bank')} placeholder="Bank name" /></label>
              <label>Amount (₹)<input required type="number" min="0.01" step="0.01" value={form.amount} onChange={setField('amount')} /></label>
              <label>Issue Date<input required type="date" value={form.issue_date} onChange={setField('issue_date')} /></label>
              <label>Maturity Date<input required type="date" min={form.issue_date || undefined} value={form.maturity_date} onChange={setField('maturity_date')} /></label>
              {editingInstrument && <label>Status<select value={form.status} onChange={setField('status')}><option value="active">Active</option><option value="expiring">Expiring</option><option value="matured">Matured</option><option value="renewed">Renewed</option><option value="released">Released</option></select></label>}
              <label className="fdr-form-wide">Replaces existing FDR (optional)<select value={form.replaces_id} onChange={setField('replaces_id')}><option value="">No replacement</option>{instruments.filter((item) => item.id !== editingInstrument?.id).map((item) => <option key={item.id} value={item.id}>{item.reference} — {item.institution_name || item.institution_id}</option>)}</select></label>
              <label className="fdr-form-wide">Remarks<textarea rows="3" value={form.remarks} onChange={setField('remarks')} placeholder="Optional notes for this FDR record" /></label>
            </div>
            {error && <p className="fdr-form-error" role="alert">{error}</p>}
            <div className="fdr-form-actions"><button type="button" className="fdr-secondary-button" onClick={closeForm} disabled={saving}>Cancel</button><button type="submit" className="fdr-primary-button" disabled={saving}>{saving ? 'Saving…' : editingInstrument ? 'Save Changes' : 'Register FDR'}</button></div>
          </form>
        </Modal>
      )}

      {selectedInstrument && (
        <Modal title="FDR Details" onClose={() => setSelectedInstrument(null)}>
          <dl className="fdr-detail-list">
            <dt>FDR Number</dt><dd>{selectedInstrument.reference}</dd>
            <dt>Institution</dt><dd>{selectedInstrument.institution_name || selectedInstrument.institution_id}</dd>
            <dt>Bank</dt><dd>{selectedInstrument.bank}</dd>
            <dt>Amount</dt><dd>{formatAmount(selectedInstrument.amount)}</dd>
            <dt>Issue Date</dt><dd>{displayDate(selectedInstrument.issue_date)}</dd>
            <dt>Maturity Date</dt><dd>{displayDate(selectedInstrument.maturity_date)}</dd>
            <dt>Status</dt><dd><span className={`fdr-status ${statusClass[selectedInstrument.trackerStatus]}`}>{selectedInstrument.trackerStatus}</span></dd>
            <dt>Remarks</dt><dd>{selectedInstrument.remarks || '—'}</dd>
          </dl>
          {canManage && <div className="fdr-form-actions"><button className="fdr-primary-button" type="button" onClick={() => openEdit(selectedInstrument)}><Icon name="edit" size={15} /> Edit FDR</button></div>}
        </Modal>
      )}

      {calculatorOpen && (
        <Modal title="Deposit & Penalty Calculator" onClose={() => setCalculatorOpen(false)} className="fdr-calculator-modal">
          <div className="fdr-calc-controls">
            <label>Institution<select value={selectedCalcInstitution} onChange={(event) => { setSelectedCalcInstitution(event.target.value); setPaidOverride(''); }}><option value="">Select institution</option>{institutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}</select></label>
            <label>Simulate Payment Date<input type="date" value={paidOverride || calc?.paid_date || ''} onChange={(event) => setPaidOverride(event.target.value)} /></label>
          </div>
          {calcLoading && <p className="fdr-calc-message">Calculating deposit requirements…</p>}
          {calcError && <p className="fdr-form-error" role="alert">{calcError}</p>}
          {calc && !calcLoading && (
            <div className="fdr-calc-result">
              <h3>Required Deposit (Table 1.4 Rules)</h3>
              <p>{calc.calculation_breakdown}</p>
              <div><span>Base Deposit</span><strong>{formatAmount(calc.base_amount)}</strong><span>Concession</span><strong>{calc.concession_factor} ({calc.concession_category || 'None'})</strong><span>Land Tenure</span><strong>{calc.tenure_type} ({calc.lease_multiplier}×)</strong><span>Total Required</span><strong>{formatAmount(calc.required_deposit)}</strong></div>
              <h3>Payment Timeline &amp; Penalty</h3>
              <p>Intimation: {calc.intimation_date || '—'} · Due date: {calc.due_date || '—'} · Paid: {calc.paid_date || '—'}</p>
              <p className={calc.penalty_pct > 0 ? 'is-penalty' : 'is-clear'}>{calc.payment_status_text}{calc.penalty_amount > 0 ? ` · Penalty ${formatAmount(calc.penalty_amount)}` : ''}</p>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
