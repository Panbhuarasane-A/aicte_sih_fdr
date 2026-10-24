import { useEffect, useState, useRef } from 'react';
import { usePortal } from '../context/PortalContext.jsx';
import { Badge, PageHead, DataTable } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import OfficerVerification from './OfficerVerification.jsx';

function InstitutionDocuments() {
  const { user } = usePortal();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const fileInputRef = useRef(null);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const data = await api.getDocuments();
      setDocs(data);
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const handleFileUpload = async (e) => {
    e.preventDefault();
    const files = fileInputRef.current?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('institution_id', user?.institution_id || 'INST-S01');
    formData.append('doc_type', 'FDR_CERTIFICATE');

    try {
      setUploading(true);
      setUploadMsg('');
      const uploaded = await api.uploadDocument(formData);
      setUploadMsg(`Document '${uploaded.file_name}' uploaded successfully. OCR & discrepancy check complete.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadDocuments();
    } catch (err) {
      alert(`Upload error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <PageHead
        title="Document content check & OCR"
        sub="Uploaded documents are virus-scanned, SHA-256 hashed, and OCR-extracted. Extracted values are compared with records. Results are discrepancy flags, never a determination of authenticity."
      />

      <section className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 className="h3">Upload Instrument / Affidavit Document</h2>
        <form onSubmit={handleFileUpload} style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.8rem', flexWrap: 'wrap' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.txt,.csv"
            required
            style={{ padding: '0.4rem', border: '1px solid #cbd5e1', borderRadius: '4px' }}
          />
          <button className="btn primary" type="submit" disabled={uploading}>
            {uploading ? 'Processing OCR...' : 'Upload & Verify Document'}
          </button>
        </form>
        {uploadMsg && <p style={{ color: '#166534', marginTop: '0.5rem', fontWeight: 500 }}>{uploadMsg}</p>}
      </section>

      {loading && <p>Loading documents from server...</p>}

      {!loading && docs.length === 0 && (
        <section className="card">
          <h2 className="h3">No documents uploaded yet</h2>
          <p className="meta">Upload an FDR certificate or affidavit above to initiate AI discrepancy detection.</p>
        </section>
      )}

      {!loading && docs.map((d) => {
        const flags = d.flags || [];
        const ext = d.extraction;

        return (
          <article className="card" key={d.id} style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 className="h3">{d.file_name}</h2>
                <p className="meta">
                  Institution: <strong>{d.institution_name || d.institution_id}</strong> · Type: {d.doc_type} · Virus scan: <Badge tone="ok">{d.virus_scan_status}</Badge> · SHA-256: <code style={{ fontSize: '0.75rem' }}>{d.hash?.slice(0, 16)}...</code>
                </p>
              </div>
              <div className="tags">
                {flags.length ? (
                  <Badge tone="bad">{flags.length} discrepancy flag{flags.length > 1 ? 's' : ''}</Badge>
                ) : (
                  <Badge tone="ok">Consistent with records</Badge>
                )}
              </div>
            </div>

            {ext && (
              <div style={{ margin: '1rem 0', padding: '0.8rem', backgroundColor: '#f8fafc', borderRadius: '6px', fontSize: '0.85rem' }}>
                <strong style={{ display: 'block', marginBottom: '0.4rem', color: '#334155' }}>Extracted Fields (OCR):</strong>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem' }}>
                  <div>Holder: <strong>{ext.holder || '—'}</strong></div>
                  <div>Amount: <strong>{ext.amount ? `₹${Number(ext.amount).toLocaleString('en-IN')}` : '—'}</strong></div>
                  <div>Issue Date: <strong>{ext.issue_date || '—'}</strong></div>
                  <div>Maturity Date: <strong>{ext.maturity_date || '—'}</strong></div>
                  <div>FDR Number: <strong>{ext.fdr_number || '—'}</strong></div>
                  <div>Bank: <strong>{ext.bank || '—'}</strong></div>
                </div>
              </div>
            )}

            {flags.length > 0 && (
              <div style={{ marginTop: '0.8rem' }}>
                <DataTable
                  head={['Field', 'Extracted Value', 'Expected Value', 'Severity', 'Rule Note']}
                  rows={flags.map((f) => [
                    f.field_name,
                    f.extracted_value || '—',
                    f.expected_value || '—',
                    <Badge tone={f.severity === 'FAIL' ? 'bad' : 'warn'}>{f.severity}</Badge>,
                    f.discrepancy_note
                  ])}
                />
              </div>
            )}

            <p className="meta note" style={{ marginTop: '0.8rem', fontStyle: 'italic', color: '#64748b' }}>
              AI-assisted discrepancy detection, not a determination of authenticity. Only an authorised officer decides.
            </p>
          </article>
        );
      })}
    </>
  );
}

export default function Documents() {
  const { user } = usePortal();
  return user?.kind === 'officer' ? <OfficerVerification /> : <InstitutionDocuments />;
}
