import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePortal } from '../context/PortalContext.jsx';
import { claimsRepo, documentsRepo, institutionsRepo, statementRepo } from '../data/repositories.js';
import PortalSidebar from '../components/PortalSidebar.jsx';
import NotificationButton from '../components/NotificationButton.jsx';
import '../styles/officer-verification.css';

function formatAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—';
}

function getBankAmount(claim) {
  const evidenceLines = claim.match_result?.evidence_lines || [];
  const evidence = evidenceLines.find((line) => (
    /statement match confirmed|vs statement line|candidate utr/i.test(line)
  ));
  if (!evidence) return null;

  const amount = evidence.match(
    /(?:statement line|confirmed:.*?·|candidate utr.*?·)\s*₹([\d,]+(?:\.\d+)?)/i,
  )?.[1];
  return amount ? Number(amount.replace(/,/g, '')) : null;
}

export default function OfficerVerification() {
  const { user, signOut } = usePortal();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState([]);
  const [claims, setClaims] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [institutionId, setInstitutionId] = useState(user?.institution_id || '');
  const [supportingFile, setSupportingFile] = useState(null);
  const [statementFile, setStatementFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const supportingInput = useRef(null);
  const statementInput = useRef(null);

  const loadVerificationData = async () => {
    setError('');
    try {
      const [documentData, claimData, institutionData] = await Promise.all([
        documentsRepo.list(),
        claimsRepo.list(),
        institutionsRepo.list(),
      ]);
      setDocuments(Array.isArray(documentData) ? documentData : []);
      setClaims(Array.isArray(claimData) ? claimData : []);
      setInstitutions(Array.isArray(institutionData) ? institutionData : []);
      if (!institutionId && Array.isArray(institutionData) && institutionData.length) {
        setInstitutionId(institutionData[0].id);
      }
      return true;
    } catch (loadError) {
      setError(`Could not load verification data: ${loadError.message}`);
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVerificationData();
  }, []);

  const matchedClaims = useMemo(
    () => claims.filter((claim) => claim.match_result?.classification === 'EXACT_MATCH'),
    [claims],
  );
  const reviewCount = claims.length - matchedClaims.length;
  const filteredClaims = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return claims;
    return claims.filter((claim) => (
      [claim.id, claim.utr, claim.institution_name, claim.institution_id]
        .some((value) => String(value || '').toLowerCase().includes(normalizedQuery))
    ));
  }, [claims, query]);

  const uploadSupportingDocument = async (event) => {
    event.preventDefault();
    if (!supportingFile) {
      setError('Choose a supporting document before uploading.');
      return;
    }
    if (!institutionId) {
      setError('Select an institution before uploading a supporting document.');
      return;
    }

    const formData = new FormData();
    formData.append('file', supportingFile);
    formData.append('institution_id', institutionId);
    formData.append('doc_type', 'FDR_CERTIFICATE');

    try {
      setUploading('document');
      setError('');
      setNotice('');
      await documentsRepo.upload(formData);
      setSupportingFile(null);
      if (supportingInput.current) supportingInput.current.value = '';
      setNotice('Supporting document uploaded. Document extraction and discrepancy checks have completed.');
      await loadVerificationData();
    } catch (uploadError) {
      setError(`Document upload failed: ${uploadError.message}`);
    } finally {
      setUploading('');
    }
  };

  const uploadBankStatement = async (event) => {
    event.preventDefault();
    if (!statementFile) {
      setError('Choose a bank statement before importing.');
      return;
    }

    const formData = new FormData();
    formData.append('file', statementFile);
    try {
      setUploading('statement');
      setError('');
      setNotice('');
      const result = await statementRepo.import(formData);
      setStatementFile(null);
      if (statementInput.current) statementInput.current.value = '';
      setNotice(`Bank statement imported: ${result.lines_imported ?? 0} lines added, ${result.lines_skipped_as_duplicate ?? 0} duplicates skipped.`);
      await loadVerificationData();
    } catch (uploadError) {
      setError(`Statement import failed: ${uploadError.message}`);
    } finally {
      setUploading('');
    }
  };

  const refreshVerification = async () => {
    setRefreshing(true);
    setNotice('');
    const refreshed = await loadVerificationData();
    if (refreshed) {
      setNotice('Verification results refreshed from uploaded documents and transaction records.');
    }
    setRefreshing(false);
  };

  const officerName = user?.name || 'AICTE Officer';
  const officerRole = user?.role === 'head'
    ? 'Regulation Bureau Head'
    : user?.region_scope
      ? `Scrutiny Officer, ${user.region_scope}`
      : 'AICTE Regulation Bureau';

  return (
    <div className="ov-page">
      <header className="ov-header">
        <img
          className="ov-header-banner"
          src="/aicte-tricolor-heritage-header.png"
          alt="AICTE — Technical Education for a Stronger India"
        />
        <div className="ov-header-actions">
          <NotificationButton className="ov-notification" />
          <button className="ov-profile" type="button" onClick={() => setUserMenuOpen((isOpen) => !isOpen)} aria-expanded={userMenuOpen}>
            <span className="ov-avatar">{officerName.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span>
            <span><strong>{officerName}</strong><small>{officerRole}</small></span>
            <span className="ov-chevron" aria-hidden="true">⌄</span>
          </button>
          {userMenuOpen && (
            <div className="ov-profile-menu">
              <span>{officerName}</span>
              <button type="button" onClick={() => { signOut(); navigate('/login'); }}>Sign out</button>
            </div>
          )}
        </div>
      </header>

      <div className="ov-layout">
        <PortalSidebar />

        <main className="ov-main">
          <div className="ov-title-row">
            <div>
              <h1>Document Verification</h1>
              <p>Upload documents and verify extracted details.</p>
            </div>
            <div className="ov-summary" aria-label="Verification summary">
              <div className="ov-summary-card is-files"><span>▣</span><small>Files</small><strong>{documents.length}</strong></div>
              <div className="ov-summary-card is-matched"><span>✓</span><small>Matched</small><strong>{matchedClaims.length}</strong></div>
              <div className="ov-summary-card is-review"><span>△</span><small>Review</small><strong>{reviewCount}</strong></div>
            </div>
          </div>

          {error && <div className="ov-feedback is-error" role="alert">{error}</div>}
          {notice && <div className="ov-feedback is-success" role="status">{notice}</div>}

          <section className="ov-panel">
            <div className="ov-panel-heading">
              <h2>Upload Documents</h2>
              {institutions.length > 0 && (
                <label className="ov-institution-select">
                  Institution
                  <select value={institutionId} onChange={(event) => setInstitutionId(event.target.value)}>
                    {institutions.map((institution) => (
                      <option key={institution.id} value={institution.id}>
                        {institution.name || institution.id}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="ov-upload-grid">
              <form className="ov-upload-card" onSubmit={uploadSupportingDocument}>
                <div className="ov-upload-icon is-document">▤</div>
                <div className="ov-upload-content">
                  <strong>Supporting Document</strong>
                  <small>PDF, JPG, PNG · Max 10 MB</small>
                  <label className="ov-file-picker">
                    Choose File
                    <input
                      ref={supportingInput}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(event) => setSupportingFile(event.target.files?.[0] || null)}
                    />
                  </label>
                  <button type="submit" disabled={uploading !== '' || !supportingFile}>
                    {uploading === 'document' ? 'Uploading…' : 'Upload'}
                  </button>
                  <small>{supportingFile?.name || 'Select a file, then upload'}</small>
                </div>
              </form>

              <form className="ov-upload-card" onSubmit={uploadBankStatement}>
                <div className="ov-upload-icon is-bank">▥</div>
                <div className="ov-upload-content">
                  <strong>Bank Statement</strong>
                  <small>CSV, XLS, XLSX, PDF · Max 10 MB</small>
                  <label className="ov-file-picker">
                    Choose File
                    <input
                      ref={statementInput}
                      type="file"
                      accept=".csv,.xls,.xlsx,.pdf"
                      onChange={(event) => setStatementFile(event.target.files?.[0] || null)}
                    />
                  </label>
                  <button type="submit" disabled={uploading !== '' || !statementFile}>
                    {uploading === 'statement' ? 'Importing…' : 'Import'}
                  </button>
                  <small>{statementFile?.name || 'Select a file, then import'}</small>
                </div>
              </form>
            </div>
          </section>

          <section className="ov-panel ov-process-panel">
            <div className="ov-process-title"><h2>AI Verification</h2></div>
            <div className="ov-process-flow" aria-label="Verification workflow">
              <div><span className="ov-process-icon is-blue">⌗</span><strong>Text Extraction</strong></div>
              <span className="ov-process-arrow">→</span>
              <div><span className="ov-process-icon is-green">✓</span><strong>Field Validation</strong></div>
              <span className="ov-process-arrow">→</span>
              <div><span className="ov-process-icon is-purple">↗</span><strong>Transaction Match</strong></div>
            </div>
            <div className="ov-process-action">
              <span className={`ov-ready ${loading ? 'is-loading' : ''}`}>
                <i />{loading ? 'Loading verification data' : 'Ready to verify'}
              </span>
              <button type="button" onClick={refreshVerification} disabled={refreshing || loading}>
                {refreshing ? 'Refreshing…' : '▶　Run AI Verification'}
              </button>
            </div>
          </section>

          <section className="ov-panel ov-crosscheck">
            <div className="ov-panel-heading">
              <h2>Transaction Cross-Check</h2>
              <label className="ov-search">
                <span className="sr">Search transaction ID</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search transaction ID"
                />
              </label>
            </div>
            {loading ? (
              <p className="ov-empty">Loading transaction records…</p>
            ) : filteredClaims.length === 0 ? (
              <p className="ov-empty">{claims.length ? 'No transactions match your search.' : 'No transactions available for verification.'}</p>
            ) : (
              <div className="ov-table-wrap">
                <table>
                  <thead>
                    <tr><th>Transaction ID</th><th>Document Amount</th><th>Bank Amount</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {filteredClaims.map((claim) => {
                      const matched = claim.match_result?.classification === 'EXACT_MATCH';
                      const status = matched ? 'Matched' : claim.match_result?.classification || 'Pending';
                      const bankAmount = getBankAmount(claim)
                        ?? (Number(claim.bank_amount ?? claim.matched_amount) > 0
                          ? Number(claim.bank_amount ?? claim.matched_amount)
                          : null);
                      return (
                        <tr key={claim.id}>
                          <td>{claim.utr || claim.id}</td>
                          <td>{formatAmount(claim.amount)}</td>
                          <td>{formatAmount(bankAmount)}</td>
                          <td><span className={`ov-status ${matched ? 'is-matched' : 'is-review'}`}>{matched ? '✓' : '△'} {status}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
