import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePortal } from '../context/PortalContext.jsx';
import { documentsRepo, fdrRepo, claimsRepo } from '../data/repositories.js';
import OfficerVerification from './OfficerVerification.jsx';
import NotificationButton from '../components/NotificationButton.jsx';
import '../styles/institution-documents.css';
import { getInstitutionDocumentStatus } from '../utils/documentStatus.js';

const DOCUMENT_TYPES = [
  { value: 'FDR_CERTIFICATE', label: 'FDR' },
  { value: 'PAYMENT_PROOF', label: 'Payment proof' },
  { value: 'AFFIDAVIT_3', label: 'Affidavit 3' },
  { value: 'AFFIDAVIT_6', label: 'Affidavit 6' },
  { value: 'REQUEST_LETTER', label: 'Request letter' },
  { value: 'STATEMENT', label: 'Bank statement' },
  { value: 'OTHER', label: 'Other' },
];

const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.xlsx', '.csv', '.jpg', '.jpeg', '.png', '.webp'];
const MAX_FILE_SIZE = 15 * 1024 * 1024;

function InstitutionDocuments() {
  const { user, signOut } = usePortal();
  const navigate = useNavigate();

  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadNotice, setUploadNotice] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [documentType, setDocumentType] = useState('');
  const [linkedRecord, setLinkedRecord] = useState('');
  const [belongsToInstitution, setBelongsToInstitution] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [records, setRecords] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [profileDropdown, setProfileDropdown] = useState(false);

  const fileInputRef = useRef(null);
  const uploadCardRef = useRef(null);

  const institutionName = user?.institution_name || user?.name || 'Bengaluru Institute of Technology';
  const institutionCode = user?.institution_id || 'INST-S01';

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const [data, fdrs, claims] = await Promise.all([
        documentsRepo.list(institutionCode),
        fdrRepo.list(`institution_id=${encodeURIComponent(institutionCode)}`),
        claimsRepo.list()
      ]);
      setDocs(Array.isArray(data) ? data : []);
      setRecords([
        ...(Array.isArray(fdrs) ? fdrs.map((record) => ({ id: `FDR:${record.id}`, label: `FDR · ${record.reference}`, kind: 'FDR' })) : []),
        ...(Array.isArray(claims) ? claims
          .filter((claim) => claim.institution_id === institutionCode)
          .map((claim) => ({ id: `CLAIM:${claim.id}`, label: `Claim · ${claim.utr}`, kind: 'Claim' })) : [])
      ]);
    } catch (err) {
      console.warn('Could not fetch server documents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const handleSelectFileClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const validateFile = (file) => {
    if (!file) return 'Choose a document to upload.';
    const extension = `.${file.name.split('.').pop().toLowerCase()}`;
    if (!ACCEPTED_EXTENSIONS.includes(extension)) return 'Choose a PDF, DOCX, XLSX, CSV, JPG, PNG, or WEBP file.';
    if (!file.size) return 'The selected file is empty.';
    if (file.size > MAX_FILE_SIZE) return 'The selected file is larger than the 15 MB limit.';
    return '';
  };

  const handleFileChange = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setSelectedFile(files[0]);
    setFormErrors((current) => ({ ...current, file: validateFile(files[0]) }));
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      setSelectedFile(files[0]);
      setFormErrors((current) => ({ ...current, file: validateFile(files[0]) }));
    }
  };

  const processUpload = async (file) => {
    setUploadNotice('');
    setUploadError('');
    setUploading(true);
    setUploadProgress(15);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('institution_id', institutionCode);
    formData.append('doc_type', documentType);
    if (linkedRecord) {
      const [recordKind, recordId] = linkedRecord.split(':');
      formData.append(recordKind === 'CLAIM' ? 'claim_id' : 'instrument_id', recordId);
    }

    try {
      const progressTimer = setInterval(() => {
        setUploadProgress((p) => (p < 85 ? p + 15 : p));
      }, 200);

      const uploaded = await documentsRepo.upload(formData);
      clearInterval(progressTimer);
      setUploadProgress(100);

      setUploadNotice(uploaded.gate_state === 'held'
        ? 'Your document needs an additional review before processing. You will be notified.'
        : 'Your document has been received and is being screened.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadDocuments();
    } catch (err) {
      setUploadError(`Document upload failed: ${err.message}`);
    } finally {
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
      }, 600);
    }
  };

  const requiresLinkedRecord = documentType === 'FDR_CERTIFICATE' || documentType === 'PAYMENT_PROOF';

  const handleUpload = async () => {
    const errors = {
      type: documentType ? '' : 'Select a document type.',
      linked: requiresLinkedRecord && !linkedRecord ? 'Select the linked deposit, claim, or FDR.' : '',
      file: validateFile(selectedFile),
      ownership: belongsToInstitution ? '' : 'Confirm that this document belongs to your institution.'
    };
    setFormErrors(errors);
    if (Object.values(errors).some(Boolean)) return;
    await processUpload(selectedFile);
  };

  const handleUploadToAicte = () => {
    setSelectedDoc(null);
    setUploadNotice('Select the document you want to submit to AICTE, then choose Upload and verify.');
    uploadCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => fileInputRef.current?.focus(), 350);
  };

  const displayDocuments = docs.map((d) => ({
      id: d.id,
      file_name: d.file_name,
      uploaded_on: new Date(d.uploaded_at || Date.now()).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      ...getInstitutionDocumentStatus(d),
      gate_state: d.gate_state,
      gate_reason: d.gate_reason,
      extraction: d.extraction,
      flags: d.flags || []
    }));

  return (
    <div className="idv-page">
      {/* 1. TOP HEADER */}
      <header className="idv-header">
        <Link className="idv-brand" to="/dashboard">
          {/* AICTE emblem */}
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)',
            display: 'grid',
            placeItems: 'center',
            boxShadow: '0 2px 8px rgba(245, 158, 11, 0.35)',
            border: '2px solid #ffffff'
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </div>
          <div className="idv-brand-text">
            <div className="idv-brand-title">
              <span>AICTE</span>
              <span className="idv-brand-divider">|</span>
              <span className="idv-brand-portal-title">Security Deposit / FDR Management Portal</span>
            </div>
            <span className="idv-brand-sub">Institution Portal · Regulation Bureau</span>
          </div>
        </Link>

        {/* Subtle decorative heritage tricolour image banner */}
        <div
          className="idv-header-banner-bg"
          style={{ backgroundImage: `url('/aicte-tricolor-heritage-header.png')` }}
          aria-hidden="true"
        />

        <div className="idv-header-actions">
          <NotificationButton className="idv-notif-btn" />

          {/* User Profile Pill */}
          <div
            className="idv-profile-pill"
            onClick={() => setProfileDropdown(!profileDropdown)}
            style={{ position: 'relative' }}
          >
            <div className="idv-profile-avatar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v4M12 14v4M16 14v4" />
              </svg>
            </div>
            <span className="idv-profile-name">Registrar · {institutionName}</span>
            <span style={{ fontSize: '11px', color: '#64748b' }}>⌄</span>

            {profileDropdown && (
              <div style={{
                position: 'absolute', top: '46px', right: 0, background: '#ffffff',
                border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                padding: '10px 0', minWidth: '220px', zIndex: 100
              }}>
                <div style={{ padding: '8px 16px', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f2b48' }}>{institutionName}</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>AICTE ID: {institutionCode}</div>
                </div>
                <button
                  type="button"
                  onClick={() => { signOut(); navigate('/login'); }}
                  style={{
                    width: '100%', padding: '10px 16px', background: 'none', border: 'none',
                    textAlign: 'left', color: '#dc2626', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '8px'
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                  </svg>
                  Sign out
                </button>
              </div>
            )}
          </div>

          {/* Quick Sign Out Button */}
          <button
            type="button"
            className="idv-signout-btn"
            onClick={() => { signOut(); navigate('/login'); }}
            aria-label="Sign out"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            <span>Sign out</span>
          </button>
        </div>
      </header>

      {/* 2. HORIZONTAL NAVIGATION BAR */}
      <nav className="idv-nav" aria-label="Portal Navigation">
        <Link to="/dashboard" className="idv-nav-item">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span>Overview</span>
        </Link>
        <Link to="/documents" className="idv-nav-item is-active">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <span>Upload Documents</span>
        </Link>
      </nav>

      {/* 3. MAIN WORKSPACE */}
      <main className="idv-main">
        {/* Breadcrumb */}
        <div className="idv-breadcrumb">
          <span>Institution Portal</span>
          <span className="idv-breadcrumb-sep">/</span>
          <span>Documents</span>
          <span className="idv-breadcrumb-sep">/</span>
          <strong style={{ color: '#0f2b48' }}>AI Verification</strong>
        </div>

        {/* Page Title */}
        <div className="idv-page-title-row">
          <div className="idv-title-icon-box">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <line x1="10" y1="9" x2="8" y2="9" />
            </svg>
          </div>
          <div className="idv-page-title-text">
            <h1>AI Document Verification</h1>
            <p>Upload a financial document to extract key fields and check for discrepancies against your submitted records.</p>
          </div>
          {import.meta.env.VITE_USE_SYNTHETIC_ONLY === 'true' && (
            <span className="idv-synthetic-pill">Synthetic data only</span>
          )}
        </div>

        {/* Notices */}
        {uploadNotice && (
          <div style={{
            padding: '12px 18px',
            backgroundColor: '#dcfce7',
            border: '1px solid #86efac',
            borderRadius: '12px',
            marginBottom: '20px',
            color: '#166534',
            fontSize: '13.5px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <span>✓</span>
            <span>{uploadNotice}</span>
          </div>
        )}
        {uploadError && (
          <div style={{
            padding: '12px 18px',
            backgroundColor: '#fee2e2',
            border: '1px solid #fca5a5',
            borderRadius: '12px',
            marginBottom: '20px',
            color: '#991b1b',
            fontSize: '13.5px',
            fontWeight: 600
          }}>
            <strong>Error:</strong> {uploadError}
          </div>
        )}

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(',')}
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {/* TWO-COLUMN GRID */}
        <div className="idv-grid">
          {/* LEFT COLUMN */}
          <div className="idv-left-col">
            {/* UPLOAD CARD */}
            <div
              ref={uploadCardRef}
              className={`idv-upload-card ${isDragging ? 'is-dragging' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <div className="idv-form-fields">
                <label>
                  Document type
                  <select value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
                    <option value="">Select document type</option>
                    {DOCUMENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                  {formErrors.type && <small className="idv-field-error">{formErrors.type}</small>}
                </label>
                <label>
                  Linked record {requiresLinkedRecord ? '(required)' : '(optional)'}
                  <select value={linkedRecord} onChange={(e) => setLinkedRecord(e.target.value)}>
                    <option value="">Select deposit, claim, or FDR</option>
                    {records.map((record) => <option key={record.id} value={record.id}>{record.label}</option>)}
                  </select>
                  {formErrors.linked && <small className="idv-field-error">{formErrors.linked}</small>}
                </label>
              </div>

              {/* PDF Document graphic with Cloud Upload Badge */}
              <div className="idv-illustration-wrap">
                <div className="idv-pdf-graphic">
                  <div className="idv-pdf-corner" />
                  <span className="idv-pdf-badge">PDF</span>
                </div>
                <div className="idv-cloud-circle">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                    <polyline points="12 12 12 8 10 10" />
                    <polyline points="12 8 14 10" />
                  </svg>
                </div>
              </div>

              <h2 className="idv-upload-heading">Upload your document</h2>
              <p className="idv-upload-sub">PDF, DOCX, XLSX, CSV, JPG, PNG, WEBP · Max 15 MB</p>

              {selectedFile && (
                <div className="idv-file-chip">
                  <span>{selectedFile.name}</span>
                  <small>{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</small>
                  <button type="button" onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>Remove</button>
                </div>
              )}
              {formErrors.file && <div className="idv-field-error">{formErrors.file}</div>}

              {/* Action Buttons */}
              <div className="idv-upload-btn-row">
                <button
                  type="button"
                  className="idv-btn-primary"
                  onClick={handleSelectFileClick}
                  disabled={uploading}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                  </svg>
                  <span>{uploading ? `Uploading (${uploadProgress}%)...` : 'Choose file'}</span>
                </button>
              </div>
              <label className="idv-ownership-check">
                <input type="checkbox" checked={belongsToInstitution} onChange={(e) => setBelongsToInstitution(e.target.checked)} />
                <span>This document belongs to my institution.</span>
              </label>
              {formErrors.ownership && <div className="idv-field-error">{formErrors.ownership}</div>}
              <button type="button" className="idv-btn-primary idv-upload-submit" onClick={handleUpload} disabled={uploading}>
                Upload and verify
              </button>

              {/* Notice */}
              <div className="idv-upload-notice">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span>Results identify discrepancies and do not independently certify source or authorship.</span>
              </div>
            </div>

            {/* RECENT DOCUMENT CHECKS */}
            <div className="idv-recent-card">
              <div className="idv-card-header-row">
                <h3 className="idv-card-title">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  <span>My documents</span>
                </h3>
                <span className="idv-card-link" onClick={() => loadDocuments()}>View all →</span>
              </div>

              <div className="idv-table-wrap">
                <table className="idv-table">
                  <thead>
                    <tr>
                      <th>File</th>
                      <th>Uploaded on</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayDocuments.map((doc, idx) => (
                      <tr key={`${doc.id}-${idx}`}>
                        <td>
                          <div className="idv-file-cell">
                            <span className="idv-file-icon">PDF</span>
                            <span>{doc.file_name}</span>
                          </div>
                        </td>
                        <td style={{ color: '#64748b', fontSize: '12.5px' }}>
                          {doc.uploaded_on}
                        </td>
                        <td>
                          <span className={`idv-badge ${doc.status_tone}`}>
                            <span>{doc.icon}</span>
                            <span>{doc.label}</span>
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="idv-view-btn"
                            onClick={() => setSelectedDoc(doc)}
                          >
                            View details &gt;
                          </button>
                          {['cleared', 'released_by_officer'].includes(doc.gate_state) && (
                            <button
                              type="button"
                              className="idv-upload-aicte-btn"
                              onClick={handleUploadToAicte}
                            >
                              Upload to AICTE
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="idv-right-col">
            {/* 1. "WHAT HAPPENS NEXT?" CARD */}
            <div className="idv-next-card">
              <div className="idv-next-header">
                <span>✦</span>
                <span>What happens next?</span>
              </div>

              <div className="idv-process-row">
                {/* Step 1 */}
                <div className="idv-step-box">
                  <div className="idv-step-icon-wrap step-1">
                    <span className="idv-step-num s-1">1</span>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                      <path d="M12 13v-5M9 11l3-3 3 3" />
                    </svg>
                  </div>
                  <h4 className="idv-step-title">Upload document</h4>
                  <p className="idv-step-desc">Submit your financial document (PDF / Image).</p>
                  <span className="idv-step-arrow">→</span>
                </div>

                {/* Step 2 */}
                <div className="idv-step-box">
                  <div className="idv-step-icon-wrap step-2">
                    <span className="idv-step-num s-2">2</span>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="9" y1="13" x2="15" y2="13" />
                      <line x1="9" y1="17" x2="13" y2="17" />
                    </svg>
                  </div>
                  <h4 className="idv-step-title">Extract fields</h4>
                  <p className="idv-step-desc">AI reads and extracts key information.</p>
                  <span className="idv-step-arrow">→</span>
                </div>

                {/* Step 3 */}
                <div className="idv-step-box">
                  <div className="idv-step-icon-wrap step-3">
                    <span className="idv-step-num s-3">3</span>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
                      <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
                      <path d="M7 21h10M12 3v18M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
                    </svg>
                  </div>
                  <h4 className="idv-step-title">Compare with records</h4>
                  <p className="idv-step-desc">Matches with your submitted data and available records.</p>
                  <span className="idv-step-arrow">→</span>
                </div>

                {/* Step 4 */}
                <div className="idv-step-box">
                  <div className="idv-step-icon-wrap step-4">
                    <span className="idv-step-num s-4">4</span>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <rect width="18" height="18" x="3" y="3" rx="2" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                  </div>
                  <h4 className="idv-step-title">Review results</h4>
                  <p className="idv-step-desc">View findings, evidence and next actions.</p>
                </div>
              </div>
            </div>

            {/* 2. BEFORE YOU UPLOAD CARD */}
            <div className="idv-protect-card">
              <div className="idv-shield-wrap">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </div>
              <div className="idv-protect-copy">
                <h3>Before you upload</h3>
                <p>Use the original file, avoid cropped or password-protected documents, and upload records belonging to your institution.</p>
              </div>

              {/* Decorative subtle tricolour wave accent in bottom right */}
              <svg className="idv-tricolor-accent" viewBox="0 0 120 40" fill="none">
                <path d="M0 35 C 40 38, 70 20, 120 10" stroke="#f97316" strokeWidth="4" strokeLinecap="round" />
                <path d="M0 38 C 40 40, 75 25, 120 16" stroke="#22c55e" strokeWidth="4" strokeLinecap="round" />
              </svg>
            </div>

            {/* 3. RECENT ACTIVITY CARD */}
            <div className="idv-activity-card">
              <div className="idv-card-header-row" style={{ marginBottom: '16px' }}>
                <h3 className="idv-card-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2">
                    <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
                    <path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6Z" />
                  </svg>
                  <span>Recent activity</span>
                </h3>
              </div>

              {uploading ? (
                <div style={{ textAlign: 'center', padding: '24px 10px' }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    border: '3px solid #dbeafe', borderTopColor: '#2563eb',
                    animation: 'oa-spin 0.8s linear infinite', margin: '0 auto 12px'
                  }} />
                  <strong style={{ display: 'block', fontSize: '13px', color: '#1e40af' }}>
                    Analyzing document with AI OCR...
                  </strong>
                  <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                    Scanning text, validating amounts, checking date logic
                  </span>
                </div>
              ) : displayDocuments.length > 0 ? (
                <div className="idv-activity-list">
                  {displayDocuments.slice(0, 4).map((doc) => (
                    <button
                      type="button"
                      className="idv-activity-item"
                      key={doc.id}
                      onClick={() => setSelectedDoc(doc)}
                    >
                      <span className="idv-activity-dot" aria-hidden="true" />
                      <span className="idv-activity-copy">
                        <strong>{doc.file_name}</strong>
                        <small>{doc.label} · {doc.uploaded_on}</small>
                      </span>
                      <span aria-hidden="true">›</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="idv-activity-empty">
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  <strong>No recent activity</strong>
                  <p>Your uploaded documents and screening updates will appear here.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* OCR EXTRACTION DETAILS MODAL */}
      {selectedDoc && (
        <div className="idv-modal-overlay" onClick={() => setSelectedDoc(null)}>
          <div className="idv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="idv-modal-head">
              <div>
                <h2>{selectedDoc.file_name}</h2>
                <div style={{ marginTop: '6px' }}>
                  <span className={`idv-badge ${selectedDoc.status_tone}`}>
                    <span>{selectedDoc.icon}</span>
                    <span>{selectedDoc.label}</span>
                  </span>
                  {selectedDoc.extraction?.page_regions?.is_synthetic_demo && (
                    <span className="idv-synthetic-pill">Synthetic data</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="idv-modal-close"
                onClick={() => setSelectedDoc(null)}
                aria-label="Close details"
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: '14px', fontSize: '13px', fontWeight: 700, color: '#0f2b48' }}>
              Extracted OCR Fields
            </div>

            <div className="idv-ocr-grid">
              <div className="idv-ocr-item">
                <small>Holder / Institution</small>
                <strong>{selectedDoc.extraction ? (selectedDoc.extraction.holder || 'Not available') : 'Locked until screening is cleared'}</strong>
              </div>
              <div className="idv-ocr-item">
                <small>Issuing Bank</small>
                <strong>{selectedDoc.extraction?.bank || 'Not available'}</strong>
              </div>
              <div className="idv-ocr-item">
                <small>Instrument / Amount</small>
                <strong style={{ color: selectedDoc.status_tone === 'warn' ? '#b45309' : '#15803d' }}>
                  {selectedDoc.extraction?.amount || '—'}
                </strong>
              </div>
              <div className="idv-ocr-item">
                <small>FDR / Reference No</small>
                <strong>{selectedDoc.extraction?.fdr_number || '—'}</strong>
              </div>
              <div className="idv-ocr-item">
                <small>IFSC</small>
                <strong>{selectedDoc.extraction?.page_regions?.ifsc || '—'}</strong>
              </div>
              <div className="idv-ocr-item">
                <small>AICTE Institution ID</small>
                <strong>{selectedDoc.extraction?.page_regions?.institution_aicte_id || '—'}</strong>
              </div>
              <div className="idv-ocr-item">
                <small>Transaction / UTR</small>
                <strong>{selectedDoc.extraction?.page_regions?.utr || '—'}</strong>
              </div>
              <div className="idv-ocr-item">
                <small>Issue Date</small>
                <strong>{selectedDoc.extraction?.issue_date || '—'}</strong>
              </div>
              <div className="idv-ocr-item">
                <small>Maturity Date</small>
                <strong>{selectedDoc.extraction?.maturity_date || '—'}</strong>
              </div>
            </div>

            {selectedDoc.flags && selectedDoc.flags.length > 0 ? (
              <div>
                <div style={{ marginBottom: '10px', fontSize: '13px', fontWeight: 700, color: '#b45309' }}>
                  Discrepancy Findings ({selectedDoc.flags.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {selectedDoc.flags.map((f, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '12px 16px',
                        background: '#fef3c7',
                        border: '1px solid #fde68a',
                        borderRadius: '10px',
                        fontSize: '12.5px',
                        color: '#92400e'
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                        {f.field_name}: extracted '{f.extracted_value}' vs expected '{f.expected_value}'
                      </div>
                      <div>{f.discrepancy_note}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : selectedDoc.gate_state && !['cleared', 'released_by_officer'].includes(selectedDoc.gate_state) ? (
              <div className="idv-locked-message">
                <strong>Fields are locked until screening is cleared.</strong>
                <span>{selectedDoc.gate_reason || 'Please wait for screening or follow the next step shown in the document status.'}</span>
              </div>
            ) : (
              <div style={{
                padding: '14px 18px',
                background: '#dcfce7',
                border: '1px solid #bbf7d0',
                borderRadius: '10px',
                color: '#166534',
                fontSize: '13px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>✓</span>
                <span>No discrepancy findings were returned for the extracted fields.</span>
              </div>
            )}

            <div style={{ marginTop: '24px', textAlign: 'right' }}>
              {['cleared', 'released_by_officer'].includes(selectedDoc.gate_state) && (
                <button
                  type="button"
                  className="idv-btn-secondary"
                  onClick={handleUploadToAicte}
                  style={{ padding: '8px 20px', fontSize: '13px', marginRight: '8px' }}
                >
                  Upload to AICTE
                </button>
              )}
              <button
                type="button"
                className="idv-btn-primary"
                onClick={() => setSelectedDoc(null)}
                style={{ padding: '8px 20px', fontSize: '13px' }}
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Documents() {
  const { user } = usePortal();
  return user?.kind === 'officer' ? <OfficerVerification /> : <InstitutionDocuments />;
}
