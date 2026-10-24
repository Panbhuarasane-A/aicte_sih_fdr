import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

const STORAGE_KEY = 'aicte-officer-workspace-local-v1';
const STATUS_OPTIONS = [
  ['pending', 'Pending review'],
  ['attention', 'Attention'],
  ['matched', 'Matched (manual)'],
  ['resolved', 'Resolved (manual)'],
];
const CASE_TYPES = ['FDR', 'Transaction', 'Registration', 'Maturity', 'Release request', 'Other'];
const NAV_ITEMS = [
  ['overview', 'Overview', 'grid'],
  ['queue', 'Review Queue', 'records'],
  ['verification', 'Verification', 'verify'],
  ['assistant', 'Local Search', 'spark'],
];

function Icon({ name }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    records: <><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    match: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    attention: <><path d="M12 3 2.8 19h18.4L12 3Z" /><path d="M12 9v4m0 3h.01" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    verify: <><path d="M4 7h12m0 0-3-3m3 3-3 3M20 17H8m0 0 3-3m-3 3 3 3" /></>,
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2L12 3Z" /><path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z" /></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 1 1 8 0v3" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M5 17v4h14v-4" /></>,
    plus: <path d="M12 5v14m-7-7h14" />,
  };
  return <svg className="officer-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function loadLocalRecords() {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === null) return [];
  const parsed = JSON.parse(stored);
  if (!Array.isArray(parsed) || parsed.some((record) => (
    !record || typeof record.id !== 'string' || typeof record.institution !== 'string'
    || typeof record.caseType !== 'string' || typeof record.issue !== 'string'
    || !STATUS_OPTIONS.some(([status]) => status === record.status)
  ))) {
    throw new Error('Saved local workspace data is not in the expected format. Export or clear this browser’s local workspace data to continue safely.');
  }
  return parsed;
}

function dateWithinNext30Days(dateString) {
  if (!dateString) return false;
  const due = new Date(`${dateString}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() + 30);
  return !Number.isNaN(due.getTime()) && due >= today && due <= end;
}

function formatAmount(value) {
  if (value === '' || value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value));
}

function statusLabel(status) {
  return STATUS_OPTIONS.find(([value]) => value === status)?.[1] ?? 'Unknown';
}

function createBlankForm() {
  return { institution: '', caseType: 'FDR', issue: '', amount: '', dueDate: '', status: 'pending' };
}

function MetricCard({ label, value, caption, tone, icon, onClick }) {
  return (
    <button className={`officer-metric officer-metric--${tone}`} type="button" onClick={onClick}>
      <span className="officer-metric-icon"><Icon name={icon} /></span>
      <span className="officer-metric-copy"><span className="officer-metric-label">{label}</span><strong>{value}</strong><span>{caption}</span></span>
      <span className="officer-metric-arrow" aria-hidden="true">›</span>
    </button>
  );
}

export default function OfficerPreview() {
  const [records, setRecords] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [notice, setNotice] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(createBlankForm);
  const [filter, setFilter] = useState('all');
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    try {
      setRecords(loadLocalRecords());
    } catch (error) {
      console.error('Unable to load officer preview local data.', error);
      setStorageError(error instanceof Error ? error.message : 'Unable to read local workspace data.');
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded || storageError) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (error) {
      console.error('Unable to save officer preview local data.', error);
      setStorageError('This browser could not save your local workspace data. Changes may be lost when you leave this page.');
    }
  }, [isLoaded, records, storageError]);

  const stats = useMemo(() => ({
    total: records.length,
    matched: records.filter((record) => record.status === 'matched').length,
    attention: records.filter((record) => record.status === 'attention' || record.status === 'pending').length,
    dueSoon: records.filter((record) => dateWithinNext30Days(record.dueDate)).length,
  }), [records]);

  const filteredRecords = useMemo(() => {
    let results = [...records];
    if (filter === 'attention') results = results.filter((record) => record.status === 'attention' || record.status === 'pending');
    if (filter === 'matched') results = results.filter((record) => record.status === 'matched');
    if (filter === 'due') results = results.filter((record) => dateWithinNext30Days(record.dueDate));
    if (query.trim()) {
      const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
      results = results.filter((record) => {
        const content = `${record.institution} ${record.caseType} ${record.issue} ${record.status} ${record.dueDate ?? ''} ${record.amount ?? ''}`.toLocaleLowerCase();
        return terms.every((term) => content.includes(term));
      });
    }
    return results.sort((first, second) => {
      const priority = { attention: 0, pending: 1, matched: 2, resolved: 3 };
      return priority[first.status] - priority[second.status]
        || (first.dueDate || '9999-12-31').localeCompare(second.dueDate || '9999-12-31')
        || (second.updatedAt ?? '').localeCompare(first.updatedAt ?? '');
    });
  }, [records, filter, query]);

  const matchedPercent = stats.total ? Math.round((stats.matched / stats.total) * 100) : 0;

  function updateForm(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function startAdd() {
    setEditingId(null);
    setForm(createBlankForm());
    setFormOpen(true);
    setNotice('');
    document.getElementById('local-record-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function startEdit(record) {
    setEditingId(record.id);
    setForm({
      institution: record.institution,
      caseType: record.caseType,
      issue: record.issue,
      amount: record.amount ?? '',
      dueDate: record.dueDate ?? '',
      status: record.status,
    });
    setFormOpen(true);
    setNotice('');
    document.getElementById('local-record-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function saveRecord(event) {
    event.preventDefault();
    const record = {
      ...form,
      id: editingId ?? (window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`),
      amount: form.amount === '' ? '' : Number(form.amount),
      createdAt: records.find((item) => item.id === editingId)?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setRecords((current) => editingId
      ? current.map((item) => item.id === editingId ? record : item)
      : [record, ...current]);
    setForm(createBlankForm());
    setFormOpen(false);
    setEditingId(null);
    setNotice(editingId ? 'Local record updated.' : 'Local record added.');
  }

  function updateStatus(id, status) {
    setRecords((current) => current.map((record) => record.id === id
      ? { ...record, status, updatedAt: new Date().toISOString() }
      : record));
    setNotice('Local status updated. This is not an official verification result.');
  }

  function deleteRecord(record) {
    if (!window.confirm(`Remove the local record for ${record.institution}? This cannot be undone.`)) return;
    setRecords((current) => current.filter((item) => item.id !== record.id));
    setNotice('Local record removed.');
  }

  function submitSearch(event) {
    event.preventDefault();
    setFilter('all');
    setQuery(queryInput.trim());
    setNotice(queryInput.trim() ? `Showing local records matching “${queryInput.trim()}”.` : 'Showing all local records.');
    document.getElementById('queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function exportRecords() {
    const header = ['Institution', 'Case type', 'Issue', 'Amount INR', 'Due date', 'Local status'];
    const values = records.map((record) => [record.institution, record.caseType, record.issue, record.amount, record.dueDate, statusLabel(record.status)]);
    const csv = [header, ...values].map((row) => row.map((value) => {
      const text = String(value ?? '');
      const safeText = /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safeText.replaceAll('"', '""')}"`;
    }).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'aicte-officer-local-workspace.csv';
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice('Exported local workspace records as CSV.');
  }

  function clearWorkspace() {
    if (!window.confirm('Delete every record saved in this browser’s local officer workspace? This cannot be undone.')) return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      setStorageError('');
      setRecords([]);
      setQuery('');
      setQueryInput('');
      setFilter('all');
      setNotice('Local workspace cleared.');
    } catch (error) {
      console.error('Unable to clear officer preview local data.', error);
      setStorageError('Unable to clear local workspace data in this browser.');
    }
  }

  return (
    <main className="officer-preview">
      <header className="officer-topbar">
        <Link className="officer-preview-brand" to="/login">
          <img src="/india-gov-portal.png" alt="National Portal of India" />
          <span><strong>All India Council for Technical Education</strong><small>Ministry of Education · Government of India</small></span>
        </Link>
        <div className="officer-topbar-tools">
          <span className="officer-preview-tag"><span aria-hidden="true" />Local workspace · not official</span>
          <Link className="officer-exit-link" to="/login"><Icon name="lock" /> Back to sign in</Link>
        </div>
      </header>

      <div className="officer-shell">
        <aside className="officer-sidebar" aria-label="Officer dashboard sections">
          <nav>
            {NAV_ITEMS.map(([id, label, icon]) => <a key={id} className={id === 'overview' ? 'officer-nav-item is-current' : 'officer-nav-item'} href={`#${id}`} aria-current={id === 'overview' ? 'page' : undefined}><Icon name={icon} /><span>{label}</span></a>)}
          </nav>
          <div className="officer-sidebar-foot">
            <Icon name="lock" />
            <span><strong>Local browser storage</strong><small>Not shared with AICTE or other users.</small></span>
          </div>
        </aside>

        <section className="officer-workspace" id="overview">
          <div className="officer-preview-notice" role="note">
            <strong>Local workspace only · not connected to AICTE</strong>
            <span>Records you enter are saved in this browser only. Do not enter confidential, personal, or real financial data. Local statuses are not official verification.</span>
          </div>
          {storageError && <div className="officer-storage-error" role="alert"><strong>Local storage issue</strong><span>{storageError}</span><button type="button" onClick={clearWorkspace}>Clear local workspace</button></div>}
          {notice && <p className="officer-action-notice" role="status">{notice}</p>}

          <header className="officer-dashboard-heading">
            <div>
              <p className="officer-eyebrow">REGULATION BUREAU · PERSONAL WORKSPACE</p>
              <h1>Officer Command Centre</h1>
              <p>Organize records you enter here. This is not an authorized AICTE service.</p>
            </div>
            <span className="officer-live-status"><i /> Local only</span>
          </header>

          <div className="officer-metrics" aria-label="Local workspace summary">
            <MetricCard label="All records" value={stats.total} caption="Saved in this browser" tone="blue" icon="records" onClick={() => { setFilter('all'); document.getElementById('queue')?.scrollIntoView({ behavior: 'smooth' }); }} />
            <MetricCard label="Matching" value={stats.matched} caption="Manually marked matched" tone="green" icon="match" onClick={() => { setFilter('matched'); document.getElementById('queue')?.scrollIntoView({ behavior: 'smooth' }); }} />
            <MetricCard label="Attention" value={stats.attention} caption="Pending or attention" tone="orange" icon="attention" onClick={() => { setFilter('attention'); document.getElementById('queue')?.scrollIntoView({ behavior: 'smooth' }); }} />
            <MetricCard label="Next 30 days" value={stats.dueSoon} caption="Based on entered due dates" tone="violet" icon="calendar" onClick={() => { setFilter('due'); document.getElementById('queue')?.scrollIntoView({ behavior: 'smooth' }); }} />
          </div>

          <div className="officer-content-grid">
            <div className="officer-main-column">
              <div className="officer-overview-grid">
                <section className="officer-panel officer-verification" id="verification" aria-labelledby="verification-title">
                  <div className="officer-panel-heading">
                    <div><h2 id="verification-title">Financial Verification Overview</h2><p>Summary calculated from your local entries</p></div>
                    <span className="officer-panel-indicator">LOCAL</span>
                  </div>
                  <div className="officer-verification-body">
                    <div className="officer-verification-ring" aria-label={`${matchedPercent}% of local records marked matched`}><span>{matchedPercent}%</span><small>Marked matched</small></div>
                    <div className="officer-verification-stats">
                      <div className="officer-stat-card officer-stat-card--green"><span>Manually matched</span><strong>{stats.matched}</strong><small>Local status only</small></div>
                      <div className="officer-stat-card officer-stat-card--orange"><span>Need attention</span><strong>{stats.attention}</strong><small>Pending or attention</small></div>
                    </div>
                  </div>
                  <p className="officer-panel-footnote"><Icon name="lock" /> No bank, FDR, or official verification service is connected.</p>
                </section>

                <section className="officer-panel officer-quick-actions" aria-labelledby="quick-actions-title">
                  <div className="officer-panel-heading"><div><h2 id="quick-actions-title">Quick Actions</h2><p>Manage this browser’s workspace</p></div></div>
                  <button className="officer-action" type="button" onClick={startAdd}><span className="officer-action-icon is-blue"><Icon name="plus" /></span><span><strong>Add a local record</strong><small>Enter your own case details</small></span><b>›</b></button>
                  <button className="officer-action" type="button" onClick={() => document.getElementById('queue')?.scrollIntoView({ behavior: 'smooth' })}><span className="officer-action-icon is-violet"><Icon name="records" /></span><span><strong>Open review queue</strong><small>Filter and update local statuses</small></span><b>›</b></button>
                  <button className="officer-action" type="button" onClick={exportRecords}><span className="officer-action-icon is-green"><Icon name="download" /></span><span><strong>Export local records</strong><small>Download a CSV file</small></span><b>›</b></button>
                  <p className="officer-actions-note">Local actions only. Nothing is submitted to AICTE.</p>
                </section>
              </div>

              <section className="officer-panel officer-queue" id="queue" aria-labelledby="queue-title">
                <div className="officer-panel-heading">
                  <div><h2 id="queue-title">Priority Review Queue</h2><p>{filteredRecords.length} local {filteredRecords.length === 1 ? 'record' : 'records'} · {filter === 'all' ? 'all statuses' : `filtered by ${filter}`}</p></div>
                  <div className="officer-queue-actions">
                    <button className="officer-view-all" type="button" onClick={exportRecords}>Export CSV</button>
                    <button className="officer-view-all officer-danger-action" type="button" onClick={clearWorkspace} disabled={!records.length}>Clear all</button>
                    <button className="officer-add-button" type="button" onClick={startAdd}><Icon name="plus" /> Add record</button>
                  </div>
                </div>
                <div className="officer-queue-filters" aria-label="Filter local records">
                  {[
                    ['all', `All (${stats.total})`],
                    ['attention', `Attention (${stats.attention})`],
                    ['matched', `Matched (${stats.matched})`],
                    ['due', `Due soon (${stats.dueSoon})`],
                  ].map(([value, label]) => <button key={value} type="button" className={filter === value ? 'is-active' : ''} aria-pressed={filter === value} onClick={() => { setFilter(value); setQuery(''); setQueryInput(''); }}>{label}</button>)}
                </div>

                {formOpen && (
                  <form className="officer-record-form" id="local-record-form" onSubmit={saveRecord}>
                    <div className="officer-form-heading"><div><h3>{editingId ? 'Edit local record' : 'Add local record'}</h3><p>Saved only in this browser. This does not submit an official case.</p></div><button type="button" className="officer-close-button" aria-label="Close form" onClick={() => { setFormOpen(false); setEditingId(null); }}><Icon name="close" /></button></div>
                    <div className="officer-form-grid">
                      <label>Institution / reference<input name="institution" value={form.institution} onChange={updateForm} maxLength="120" required /></label>
                      <label>Case type<select name="caseType" value={form.caseType} onChange={updateForm}>{CASE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
                      <label className="officer-form-wide">Issue / notes<input name="issue" value={form.issue} onChange={updateForm} maxLength="240" required /></label>
                      <label>Amount (INR, optional)<input name="amount" type="number" min="0" step="0.01" value={form.amount} onChange={updateForm} /></label>
                      <label>Due date (optional)<input name="dueDate" type="date" value={form.dueDate} onChange={updateForm} /></label>
                      <label>Status<select name="status" value={form.status} onChange={updateForm}>{STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    </div>
                    <div className="officer-form-actions"><button className="officer-add-button" type="submit">{editingId ? 'Save changes' : 'Add to local workspace'}</button><button className="officer-cancel-button" type="button" onClick={() => { setFormOpen(false); setEditingId(null); }}>Cancel</button></div>
                  </form>
                )}

                <div className="officer-queue-table-wrap">
                  <table className="officer-queue-table">
                    <thead><tr><th scope="col">Institution / Reference</th><th scope="col">Type</th><th scope="col">Issue</th><th scope="col">Amount</th><th scope="col">Due date</th><th scope="col">Local status</th><th scope="col">Actions</th></tr></thead>
                    <tbody>
                      {filteredRecords.length ? filteredRecords.map((record) => (
                        <tr key={record.id}>
                          <td>{record.institution}</td><td>{record.caseType}</td><td>{record.issue}</td><td>{formatAmount(record.amount)}</td><td>{record.dueDate || '—'}</td>
                          <td><select className={`officer-status-select status-${record.status}`} aria-label={`Local status for ${record.institution}`} value={record.status} onChange={(event) => updateStatus(record.id, event.target.value)}>{STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
                          <td><div className="officer-row-actions"><button type="button" onClick={() => startEdit(record)}>Edit</button><button type="button" className="officer-danger-action" onClick={() => deleteRecord(record)}>Remove</button></div></td>
                        </tr>
                      )) : <tr><td colSpan="7"><div className="officer-queue-empty"><Icon name="records" /><strong>{records.length ? 'No records match this view' : 'Your local queue is empty'}</strong><span>{records.length ? 'Try another filter or search query.' : 'Add a record you want to organize in this browser.'}</span></div></td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <aside className="officer-panel officer-assistant" id="assistant" aria-labelledby="assistant-title">
              <div className="officer-assistant-title"><span className="officer-assistant-mark"><Icon name="spark" /></span><div><h2 id="assistant-title">Local Workspace Search</h2><p>Search only the records you entered in this browser.</p></div></div>
              <div className="officer-local-search-intro"><Icon name="search" /><strong>Search your local records</strong><p>Try a name, case type, status, issue keyword, amount, or due date.</p></div>
              <form className="officer-assistant-form" onSubmit={submitSearch}>
                <label className="sr" htmlFor="officer-assistant-query">Search local records</label>
                <input id="officer-assistant-query" type="search" value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="e.g. pending FDR or due soon" />
                <button type="submit" aria-label="Search local records"><Icon name="search" /></button>
              </form>
              {query && <div className="officer-local-search-results" role="status"><strong>{filteredRecords.length} matching {filteredRecords.length === 1 ? 'record' : 'records'}</strong><span>Query: “{query}”</span><button type="button" onClick={() => { setQuery(''); setQueryInput(''); setFilter('all'); }}>Clear search</button></div>}
              <div className="officer-assistant-security"><Icon name="lock" /><p><strong>Local data only</strong><span>Search runs in this page against browser storage. It is not AI-backed and does not contact AICTE.</span></p></div>
              <div className="officer-assistant-footer"><span>Personal workspace tools</span><small>No official records, notifications, or verification</small></div>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
