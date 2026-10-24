import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

const STORAGE_KEY = 'aicte-institution-workspace-local-v1';
const SECTIONS = [
  ['dashboard', 'Dashboard', 'grid'],
  ['transactions', 'Transactions', 'match'],
  ['documents', 'Upload Documents', 'records'],
  ['deposits', 'FDR / Deposit Details', 'calendar'],
  ['requests', 'Release / Refund Request', 'release'],
  ['verification', 'AI Document Verification', 'verify'],
  ['assistant', 'AI Assistant', 'spark'],
  ['reports', 'Reports', 'report'],
  ['settings', 'Profile & Settings', 'settings'],
];
const TRANSACTION_STATUSES = [
  ['pending', 'Under review'],
  ['matched', 'Matched (manual)'],
  ['attention', 'Amount mismatch (manual)'],
];
const REQUEST_STATUSES = [
  ['draft', 'Draft (local)'],
  ['prepared', 'Prepared (local)'],
];

function emptyWorkspace() {
  return { institutionName: '', transactions: [], deposits: [], documents: [], requests: [] };
}

function Icon({ name }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    match: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    records: <><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    release: <><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M5 17v4h14v-4" /></>,
    verify: <><path d="M4 7h12m0 0-3-3m3 3-3 3M20 17H8m0 0 3-3m-3 3 3 3" /></>,
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2L12 3Z" /><path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z" /></>,
    report: <><path d="M5 3h14v18H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19 15 2 1-2 4-2-1-2 1v2h-5v-2l-2-1-2 1-2-4 2-1v-2l-2-1 2-4 2 1 2-1V6h5v2l2 1 2-1 2 4-2 1v2Z" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 1 1 8 0v3" /></>,
    upload: <><path d="M12 16V4m0 0L8 8m4-4 4 4" /><path d="M4 15v5h16v-5" /></>,
    plus: <path d="M12 5v14m-7-7h14" />,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
  };
  return <svg className="institution-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function readWorkspace() {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return emptyWorkspace();
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || !Array.isArray(value.transactions)
    || !Array.isArray(value.deposits) || !Array.isArray(value.documents) || !Array.isArray(value.requests)) {
    throw new Error('The saved institution workspace data is invalid. Clear local workspace data to start fresh.');
  }
  return { ...emptyWorkspace(), ...value };
}

function money(value) {
  if (value === '' || value === undefined || value === null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value));
}

function soon(date) {
  if (!date) return false;
  const due = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() + 30);
  return !Number.isNaN(due.getTime()) && due >= today && due <= end;
}

function saveCSV(filename, rows) {
  const csv = rows.map((row) => row.map((value) => {
    const text = String(value ?? '');
    const safeText = /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safeText.replaceAll('"', '""')}"`;
  }).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function makeId() {
  return window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function Metric({ label, value, caption, icon, tone, onClick }) {
  return <button className={`institution-metric metric-${tone}`} type="button" onClick={onClick}><span className="institution-metric-icon"><Icon name={icon} /></span><span><small>{label}</small><strong>{value}</strong><em>{caption}</em></span><b aria-hidden="true">›</b></button>;
}

function SectionTitle({ title, sub, action }) {
  return <div className="institution-section-title"><div><h2>{title}</h2><p>{sub}</p></div>{action}</div>;
}

function Empty({ title, sub }) {
  return <div className="institution-empty"><Icon name="records" /><strong>{title}</strong><span>{sub}</span></div>;
}

export default function InstitutionPreview() {
  const fileInputRef = useRef(null);
  const [workspace, setWorkspace] = useState(emptyWorkspace);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [section, setSection] = useState('dashboard');
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [queryResult, setQueryResult] = useState('');
  const [fileNames, setFileNames] = useState([]);
  const [transactionForm, setTransactionForm] = useState(false);
  const [depositForm, setDepositForm] = useState(false);
  const [requestForm, setRequestForm] = useState(false);

  useEffect(() => {
    try {
      setWorkspace(readWorkspace());
    } catch (loadError) {
      console.error('Unable to load institution preview local workspace.', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load local workspace data.');
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded || error) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    } catch (saveError) {
      console.error('Unable to save institution preview local workspace.', saveError);
      setError('The browser could not save this workspace. Local changes may not persist.');
    }
  }, [loaded, error, workspace]);

  const totalDeposits = useMemo(() => workspace.deposits.reduce((sum, deposit) => sum + Number(deposit.amount || 0), 0), [workspace.deposits]);
  const metrics = {
    deposits: workspace.deposits.length,
    verified: workspace.transactions.filter((transaction) => transaction.status === 'matched').length,
    pending: workspace.transactions.filter((transaction) => transaction.status !== 'matched').length,
    maturities: workspace.deposits.filter((deposit) => soon(deposit.maturityDate)).length,
    activeDeposits: workspace.deposits.filter((deposit) => !deposit.maturityDate || new Date(`${deposit.maturityDate}T00:00:00`) >= new Date()).length,
    expired: workspace.deposits.filter((deposit) => {
      if (!deposit.maturityDate) return false;
      const maturity = new Date(`${deposit.maturityDate}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return maturity < today;
    }).length,
  };

  function notify(message) {
    setToast(message);
    window.setTimeout(() => setToast(''), 4000);
  }

  function addTransaction(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setWorkspace((current) => ({
      ...current,
      transactions: [{
        id: makeId(), reference: String(data.get('reference')).trim(), date: String(data.get('date')),
        amount: Number(data.get('amount')), bank: String(data.get('bank')).trim(),
        status: 'pending', createdAt: new Date().toISOString(),
      }, ...current.transactions],
    }));
    event.currentTarget.reset();
    setTransactionForm(false);
    notify('Transaction saved to this browser only. It has not been submitted or verified.');
  }

  function addDeposit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setWorkspace((current) => ({
      ...current,
      deposits: [{
        id: makeId(), reference: String(data.get('reference')).trim(), bank: String(data.get('bank')).trim(),
        amount: Number(data.get('amount')), issueDate: String(data.get('issueDate')), maturityDate: String(data.get('maturityDate')),
        createdAt: new Date().toISOString(),
      }, ...current.deposits],
    }));
    event.currentTarget.reset();
    setDepositForm(false);
    notify('Deposit details saved locally. No FDR was submitted for official verification.');
  }

  function addRequest(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setWorkspace((current) => ({
      ...current,
      requests: [{
        id: makeId(), reference: String(data.get('reference')).trim(),
        reason: String(data.get('reason')).trim(), status: 'draft', createdAt: new Date().toISOString(),
      }, ...current.requests],
    }));
    event.currentTarget.reset();
    setRequestForm(false);
    notify('Release request saved as a local draft. It was not submitted to AICTE.');
  }

  function addDocuments() {
    if (!fileNames.length) return;
    setWorkspace((current) => ({
      ...current,
      documents: [...fileNames.map((name) => ({ id: makeId(), name, status: 'Selected locally', addedAt: new Date().toISOString() })), ...current.documents],
    }));
    setFileNames([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    notify('Document names added to the local list. File contents were not uploaded.');
  }

  function updateTransactionStatus(id, status) {
    setWorkspace((current) => ({
      ...current,
      transactions: current.transactions.map((transaction) => transaction.id === id ? { ...transaction, status } : transaction),
    }));
    notify('Local transaction label updated. This is not an official verification result.');
  }

  function exportReport() {
    const rows = [
      ['Record type', 'Reference', 'Details', 'Amount INR', 'Date', 'Local status'],
      ...workspace.transactions.map((item) => ['Transaction', item.reference, `${item.bank} · ${item.date}`, item.amount, item.date, item.status]),
      ...workspace.deposits.map((item) => ['FDR / Deposit', item.reference, item.bank, item.amount, item.maturityDate, 'Local entry']),
      ...workspace.documents.map((item) => ['Document', item.name, 'File not uploaded', '', item.addedAt.slice(0, 10), item.status]),
      ...workspace.requests.map((item) => ['Release / Refund', item.reference, item.reason, '', item.createdAt.slice(0, 10), item.status]),
    ];
    saveCSV('institution-local-workspace-report.csv', rows);
    notify('Exported local workspace summary as CSV.');
  }

  function searchLocal(event) {
    event.preventDefault();
    const value = query.trim().toLocaleLowerCase();
    if (!value) {
      setQueryResult('Enter a search term.');
      return;
    }
    const results = [
      ...workspace.transactions.filter((item) => `${item.reference} ${item.bank} ${item.status} ${item.date}`.toLocaleLowerCase().includes(value)).map((item) => `Transaction ${item.reference} · ${item.bank} · ${item.status}`),
      ...workspace.deposits.filter((item) => `${item.reference} ${item.bank} ${item.maturityDate}`.toLocaleLowerCase().includes(value)).map((item) => `Deposit ${item.reference} · ${item.bank} · maturity ${item.maturityDate || 'not entered'}`),
      ...workspace.documents.filter((item) => item.name.toLocaleLowerCase().includes(value)).map((item) => `Document ${item.name} · file not uploaded`),
      ...workspace.requests.filter((item) => `${item.reference} ${item.reason} ${item.status}`.toLocaleLowerCase().includes(value)).map((item) => `Request ${item.reference} · ${item.status}`),
    ];
    setQueryResult(results.length ? results.join('\n') : 'No matching local records.');
    setSection('assistant');
  }

  function clearWorkspace() {
    if (!window.confirm('Delete all institution preview data stored in this browser? This cannot be undone.')) return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      setWorkspace(emptyWorkspace());
      setError('');
      setQuery('');
      setQueryResult('');
      notify('Local institution workspace cleared.');
    } catch (clearError) {
      console.error('Unable to clear institution preview data.', clearError);
      setError('Unable to clear local workspace data.');
    }
  }

  function selectSection(next) {
    setSection(next);
    setToast('');
  }

  const transactionTable = workspace.transactions.length ? (
    <div className="institution-table-wrap"><table className="institution-table"><thead><tr><th>Date</th><th>UTR / Reference</th><th>Amount</th><th>Bank</th><th>Status (local)</th></tr></thead><tbody>
      {workspace.transactions.map((transaction) => <tr key={transaction.id}><td>{transaction.date}</td><td>{transaction.reference}</td><td>{money(transaction.amount)}</td><td>{transaction.bank}</td><td><select aria-label={`Local status for ${transaction.reference}`} value={transaction.status} onChange={(event) => updateTransactionStatus(transaction.id, event.target.value)}>{TRANSACTION_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td></tr>)}
    </tbody></table></div>
  ) : <Empty title="No transactions added" sub="Add a transaction entry to organize it in this browser." />;

  const depositTable = workspace.deposits.length ? (
    <div className="institution-table-wrap"><table className="institution-table"><thead><tr><th>FDR / Reference</th><th>Bank</th><th>Amount</th><th>Issue date</th><th>Maturity date</th></tr></thead><tbody>
      {workspace.deposits.map((deposit) => <tr key={deposit.id}><td>{deposit.reference}</td><td>{deposit.bank}</td><td>{money(deposit.amount)}</td><td>{deposit.issueDate || '—'}</td><td>{deposit.maturityDate || '—'}</td></tr>)}
    </tbody></table></div>
  ) : <Empty title="No FDR or deposit details" sub="Enter your own details to organize them locally." />;

  function renderSection() {
    if (section === 'transactions') return <section className="institution-panel"><SectionTitle title="Transactions" sub="Organize transaction references in this browser." action={<button className="institution-primary-button" onClick={() => setTransactionForm(!transactionForm)} type="button"><Icon name="plus" /> Add transaction</button>} />{transactionForm && <form className="institution-form" onSubmit={addTransaction}><label>UTR / reference<input name="reference" required maxLength="100" /></label><label>Transaction date<input name="date" type="date" required /></label><label>Amount (INR)<input name="amount" type="number" min="0" step="0.01" required /></label><label>Bank name<input name="bank" required maxLength="100" /></label><div className="institution-form-actions"><button className="institution-primary-button" type="submit">Save locally</button><button type="button" className="institution-secondary-button" onClick={() => setTransactionForm(false)}>Cancel</button></div></form>}{transactionTable}<p className="institution-panel-note">A “Matched” label is manually selected and is not a bank reconciliation or official verification.</p></section>;
    if (section === 'deposits') return <section className="institution-panel"><SectionTitle title="FDR / Deposit Details" sub="Keep a local list of deposit details and maturity dates." action={<button className="institution-primary-button" type="button" onClick={() => setDepositForm(!depositForm)}><Icon name="plus" /> Add FDR</button>} />{depositForm && <form className="institution-form" onSubmit={addDeposit}><label>FDR / reference number<input name="reference" required maxLength="100" /></label><label>Bank name<input name="bank" required maxLength="100" /></label><label>Principal amount (INR)<input name="amount" type="number" min="0" step="0.01" required /></label><label>Issue date<input name="issueDate" type="date" /></label><label>Maturity date<input name="maturityDate" type="date" /></label><div className="institution-form-actions"><button className="institution-primary-button" type="submit">Save locally</button><button type="button" className="institution-secondary-button" onClick={() => setDepositForm(false)}>Cancel</button></div></form>}{depositTable}<p className="institution-panel-note">No bank connection, certificate upload, or official FDR verification is active.</p></section>;
    if (section === 'documents') return <section className="institution-panel"><SectionTitle title="Upload Documents" sub="Choose files locally to prepare a document checklist." /><div className="institution-upload-box"><span className="institution-upload-icon"><Icon name="upload" /></span><strong>Select documents</strong><p>Selection is local only; files are not uploaded or transmitted.</p><label className="institution-secondary-button institution-file-button" htmlFor="institution-file-input">Choose files</label>{fileNames.length > 0 && <div className="institution-selected-files"><strong>{fileNames.length} file name(s) selected</strong><ul>{fileNames.map((name) => <li key={name}>{name}</li>)}</ul><button type="button" className="institution-primary-button" onClick={addDocuments}>Add names to local list</button></div>}</div><div className="institution-list-heading"><h3>Selected document names</h3><span>{workspace.documents.length}</span></div>{workspace.documents.length ? <ul className="institution-document-list">{workspace.documents.map((document) => <li key={document.id}><Icon name="records" /><span><strong>{document.name}</strong><small>File not uploaded · {new Date(document.addedAt).toLocaleDateString()}</small></span><em>{document.status}</em></li>)}</ul> : <Empty title="No documents listed" sub="Selected file names can be added above; file contents remain on your device." />}</section>;
    if (section === 'requests') return <section className="institution-panel"><SectionTitle title="Release / Refund Requests" sub="Prepare local request notes; submission is not connected." action={<button className="institution-primary-button" type="button" onClick={() => setRequestForm(!requestForm)}><Icon name="plus" /> New request</button>} />{requestForm && <form className="institution-form" onSubmit={addRequest}><label>FDR / reference number<input name="reference" required maxLength="100" /></label><label className="institution-form-wide">Reason / notes<textarea name="reason" required maxLength="500" rows="3" /></label><div className="institution-form-actions"><button className="institution-primary-button" type="submit">Save local draft</button><button type="button" className="institution-secondary-button" onClick={() => setRequestForm(false)}>Cancel</button></div></form>}{workspace.requests.length ? <div className="institution-table-wrap"><table className="institution-table"><thead><tr><th>Reference</th><th>Reason</th><th>Created</th><th>Local status</th></tr></thead><tbody>{workspace.requests.map((request) => <tr key={request.id}><td>{request.reference}</td><td>{request.reason}</td><td>{new Date(request.createdAt).toLocaleDateString()}</td><td><select value={request.status} aria-label={`Local request status for ${request.reference}`} onChange={(event) => setWorkspace((current) => ({ ...current, requests: current.requests.map((item) => item.id === request.id ? { ...item, status: event.target.value } : item) }))}>{REQUEST_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td></tr>)}</tbody></table></div> : <Empty title="No release or refund requests" sub="Create a local draft to organize a request for later submission through an official service." />}<p className="institution-panel-note">No request is sent to AICTE from this preview.</p></section>;
    if (section === 'verification') return <section className="institution-panel"><SectionTitle title="AI Document Verification" sub="The AICTE document verification service is not configured." /><div className="institution-connection-card"><Icon name="lock" /><div><strong>Verification is unavailable</strong><p>This preview cannot inspect documents, verify signatures, or validate bank records. No AI analysis is performed.</p></div></div><h3 className="institution-subheading">Local document checklist</h3>{workspace.documents.length ? <ul className="institution-document-list">{workspace.documents.map((document) => <li key={document.id}><Icon name="records" /><span><strong>{document.name}</strong><small>Manual review required · file not uploaded</small></span><em>Not verified</em></li>)}</ul> : <Empty title="No document entries" sub="Add local document names in Upload Documents. Nothing is automatically verified." />}<p className="institution-panel-note">Only an authorized AICTE service can provide official document verification.</p></section>;
    if (section === 'assistant') return <section className="institution-panel"><SectionTitle title="AI Assistant" sub="Search your local entries. This is a basic text search, not an AI assistant." /><form className="institution-search-form" onSubmit={searchLocal}><label className="sr" htmlFor="institution-local-search">Search local workspace</label><Icon name="search" /><input id="institution-local-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search references, bank names, statuses, or documents" /><button className="institution-primary-button" type="submit">Search</button></form><div className="institution-connection-card"><Icon name="lock" /><div><strong>Local workspace search only</strong><p>Your query is matched against records saved in this browser. No AICTE database is connected.</p></div></div>{queryResult && <pre className="institution-search-results" role="status">{queryResult}</pre>}</section>;
    if (section === 'reports') return <section className="institution-panel"><SectionTitle title="Reports" sub="Export a summary of records entered in this local workspace." action={<button className="institution-primary-button" type="button" onClick={exportReport}><Icon name="records" /> Export CSV</button>} /><div className="institution-report-grid"><div><span>Deposit entries</span><strong>{metrics.deposits}</strong><small>Local records</small></div><div><span>Transactions</span><strong>{workspace.transactions.length}</strong><small>Local records</small></div><div><span>Documents</span><strong>{workspace.documents.length}</strong><small>Names only; not uploaded</small></div><div><span>Requests</span><strong>{workspace.requests.length}</strong><small>Drafts only</small></div></div><p className="institution-panel-note">This report is generated from this browser only and is not an official statement.</p></section>;
    if (section === 'settings') return <section className="institution-panel"><SectionTitle title="Profile & Settings" sub="Set a local display label and manage this browser’s workspace." /><form className="institution-form institution-settings-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); setWorkspace((current) => ({ ...current, institutionName: String(data.get('institutionName')).trim() })); notify('Local display name saved. It is not an AICTE registration record.'); }}><label>Institution display name (local only)<input name="institutionName" maxLength="120" defaultValue={workspace.institutionName} placeholder="Enter a local display label" /></label><p className="institution-panel-note">Your AICTE institution ID and registered profile are not available in this unconnected preview.</p><div className="institution-form-actions"><button className="institution-primary-button" type="submit">Save display name</button></div></form><div className="institution-danger-zone"><div><strong>Clear local workspace</strong><p>Remove deposits, transactions, document names, and request drafts saved in this browser.</p></div><button type="button" className="institution-danger-button" onClick={clearWorkspace}>Clear all local data</button></div></section>;

    return <div className="institution-dashboard-sections">
      <section className="institution-panel institution-recent"><SectionTitle title="Recent Transactions" sub="Track local transaction entries and their manually selected labels." action={<button type="button" className="institution-text-button" onClick={() => selectSection('transactions')}>View all →</button>} />{transactionTable}</section>
      <section className="institution-panel institution-deposit-overview"><SectionTitle title="FDR / Deposit Overview" sub="Local deposit list · total recorded value" action={<button type="button" className="institution-text-button" onClick={() => selectSection('deposits')}>View all →</button>} /><div className="institution-deposit-summary"><strong>{metrics.deposits}</strong><span>Total FDR / deposit entries</span><b>{money(totalDeposits)}</b></div><div className="institution-mini-stats"><div><span>Active</span><strong>{metrics.activeDeposits}</strong></div><div><span>Maturing in 30 days</span><strong>{metrics.maturities}</strong></div><div><span>Past maturity</span><strong>{metrics.expired}</strong></div></div>{depositTable}</section>
      <section className="institution-panel institution-verification-summary"><SectionTitle title="Transaction Verification Status" sub="Local transaction labels only; no bank verification is performed." action={<button type="button" className="institution-text-button" onClick={() => selectSection('verification')}>View details →</button>} /><div className="institution-process-steps"><div><b>1</b><strong>Entry saved</strong><small>Local only</small></div><i /><div><b>2</b><strong>Bank validation</strong><small>Unavailable</small></div><i /><div><b>3</b><strong>Official review</strong><small>Unavailable</small></div></div></section>
      <section className="institution-panel institution-quick-actions"><SectionTitle title="Quick Actions" sub="Local workspace tools" /><button type="button" onClick={() => { selectSection('documents'); fileInputRef.current?.click(); }}><Icon name="upload" /><span><strong>Upload documents</strong><small>File selection only; not transmitted</small></span></button><button type="button" onClick={() => { setTransactionForm(true); selectSection('transactions'); }}><Icon name="match" /><span><strong>Add transaction</strong><small>Save a local entry</small></span></button><button type="button" onClick={() => { setRequestForm(true); selectSection('requests'); }}><Icon name="release" /><span><strong>Prepare release request</strong><small>Local draft only</small></span></button><button type="button" onClick={() => selectSection('assistant')}><Icon name="spark" /><span><strong>Search local records</strong><small>Basic text search</small></span></button></section>
      <section className="institution-panel institution-help"><Icon name="lock" /><div><strong>Need official portal access?</strong><p>Sign-in, uploads, bank matching, and requests require authorized AICTE services.</p><Link to="/login">Return to sign in</Link></div></section>
    </div>;
  }

  return (
    <main className="institution-preview">
      <header className="institution-topbar">
        <Link className="institution-brand" to="/login"><img src="/india-gov-portal.png" alt="National Portal of India" /><span><strong>AICTE</strong><small>All India Council for Technical Education</small></span><i /><span className="institution-brand-extra">Technical Education<br />for a Stronger India</span></Link>
        <div className="institution-topbar-right"><span className="institution-local-tag"><i /> LOCAL PREVIEW · NOT SIGNED IN</span><button type="button" className="institution-icon-button" aria-label="Notifications unavailable" title="Notifications require an official service" disabled><Icon name="bell" /><b>0</b></button><div className="institution-profile"><span className="institution-avatar">I</span><span><strong>{workspace.institutionName || 'Institution workspace'}</strong><small>AICTE ID unavailable</small></span></div><Link className="institution-login-link" to="/login">Sign in</Link></div>
      </header>
      <input ref={fileInputRef} id="institution-file-input" className="sr" type="file" multiple onChange={(event) => setFileNames(Array.from(event.target.files ?? []).map((file) => file.name))} />
      <div className="institution-shell">
        <aside className="institution-sidebar" aria-label="Institution portal sections">
          <nav>{SECTIONS.map(([id, label, icon]) => <button type="button" key={id} className={section === id ? 'institution-nav-item active' : 'institution-nav-item'} onClick={() => selectSection(id)} aria-current={section === id ? 'page' : undefined}><Icon name={icon} /><span>{label}</span></button>)}</nav>
          <div className="institution-side-security"><Icon name="lock" /><span><strong>Local preview</strong><small>Not connected to AICTE</small></span></div>
        </aside>
        <section className="institution-content">
          <div className="institution-notice" role="note"><strong>This is a frontend preview, not an AICTE institution account.</strong><span>Do not enter confidential, personal, or real financial data. Changes are saved only in this browser; no uploads or requests are transmitted.</span></div>
          {error && <div className="institution-error" role="alert"><strong>Workspace storage issue</strong><span>{error}</span><button type="button" onClick={clearWorkspace}>Clear local data</button></div>}
          {toast && <div className="institution-toast" role="status">{toast}</div>}
          <header className="institution-welcome"><div><p>INSTITUTION PORTAL · LOCAL WORKSPACE</p><h1>Welcome{workspace.institutionName ? `, ${workspace.institutionName}` : ''}</h1><span>Track locally entered deposits and transaction notes. Official services are not connected.</span></div><div className="institution-date"><Icon name="calendar" /><span>Local workspace<br /><strong>Preview mode</strong></span></div></header>
          {section === 'dashboard' && <div className="institution-metrics">
            <Metric label="Total Deposits & FDRs" value={metrics.deposits} caption={money(totalDeposits)} icon="records" tone="blue" onClick={() => selectSection('deposits')} />
            <Metric label="Transactions marked matched" value={metrics.verified} caption="Manual label · not verified" icon="match" tone="green" onClick={() => selectSection('transactions')} />
            <Metric label="Pending transaction entries" value={metrics.pending} caption="Saved in this browser" icon="verify" tone="orange" onClick={() => selectSection('transactions')} />
            <Metric label="Upcoming maturities" value={metrics.maturities} caption="Within next 30 days" icon="calendar" tone="violet" onClick={() => selectSection('deposits')} />
          </div>}
          {section !== 'dashboard' && <div className="institution-page-title"><span>INSTITUTION PORTAL</span><h1>{SECTIONS.find(([id]) => id === section)?.[1]}</h1></div>}
          {renderSection()}
          <footer className="institution-footer"><span>AICTE · Security Deposit & FDR Management Portal</span><span>Local preview · not an official account or statement</span></footer>
        </section>
      </div>
    </main>
  );
}
