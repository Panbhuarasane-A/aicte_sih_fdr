import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePortal } from '../context/PortalContext.jsx';
import { announcementsRepo, institutionsRepo } from '../data/repositories.js';
import NotificationButton from '../components/NotificationButton.jsx';
import PortalSidebar from '../components/PortalSidebar.jsx';
import '../styles/institution-announcements.css';

function AnnouncementCard({ item, specific, onRemove }) {
  const openAttachment = async (index) => {
    try {
      const blob = await announcementsRepo.downloadAttachment(item.id, index);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      window.alert(`Unable to open attachment: ${error.message}`);
    }
  };

  return (
    <article className="ia-card">
      <div className={`ia-card-icon${specific ? ' is-specific' : ''}`} aria-hidden="true">
        {specific ? '!' : 'i'}
      </div>
      <div className="ia-card-body">
        <div className="ia-card-meta">
          <span>{specific ? 'Institution-specific' : 'Common announcement'}</span>
          <time dateTime={item.date}>{item.date ? new Date(item.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Recently'}</time>
        </div>
        <h2>{item.title}</h2>
        <p>{item.description}</p>
        {item.reference && <small>Reference: {item.reference}</small>}
        {item.attachments?.length > 0 && (
          <div className="ia-card-attachments">
            {item.attachments.map((attachment, index) => (
              <button type="button" key={`${attachment.name}-${index}`} onClick={() => openAttachment(index)}>
                <span aria-hidden="true">{attachment.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'PPT'}</span>
                View {attachment.name}
              </button>
            ))}
          </div>
        )}
        {onRemove && (
          <button type="button" className="ia-remove-button" onClick={() => onRemove(item)}>
            Remove notification
          </button>
        )}
      </div>
    </article>
  );
}

function AttachmentPicker({ files, onChange, onRemove }) {
  return (
    <div className="ia-attachment-area">
      <label className="ia-upload-drop">
        <span className="ia-upload-cloud" aria-hidden="true">⌃</span>
        <span>Drag files here or <strong>browse</strong></span>
        <input type="file" accept=".pdf,.ppt,.pptx" multiple onChange={onChange} />
      </label>
      {files.length > 0 && (
        <ul className="ia-attachment-list">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`}>
              <span className={`ia-file-icon ${file.name.toLowerCase().endsWith('.pdf') ? 'is-pdf' : 'is-ppt'}`}>
                {file.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'PPT'}
              </span>
              <span className="ia-file-details">
                <strong>{file.name}</strong>
                <small>{(file.size / (1024 * 1024)).toFixed(1)} MB</small>
              </span>
              <button type="button" onClick={() => onRemove(index)} aria-label={`Remove ${file.name}`}>×</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PublisherPanel({ specific, institutions, selectedInstitutions, setSelectedInstitutions }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState([]);
  const [institutionSearch, setInstitutionSearch] = useState('');
  const [showInstitutionPicker, setShowInstitutionPicker] = useState(false);
  const [message, setMessage] = useState('');

  const filteredInstitutions = useMemo(() => institutions.filter((institution) => {
    const text = `${institution.name || ''} ${institution.id || institution.institution_id || ''}`.toLowerCase();
    return text.includes(institutionSearch.toLowerCase());
  }).slice(0, 8), [institutionSearch, institutions]);

  const addInstitution = (institution) => {
    const id = String(institution.id || institution.institution_id);
    if (!selectedInstitutions.some((item) => item.id === id)) {
      setSelectedInstitutions([...selectedInstitutions, {
        id,
        name: institution.name || institution.institution_name || 'Selected institution',
      }]);
    }
    setInstitutionSearch('');
    setShowInstitutionPicker(false);
  };

  const publish = async (event) => {
    event.preventDefault();
    if (!title.trim() || !description.trim() || (specific && !selectedInstitutions.length)) {
      setMessage(specific ? 'Add a title, description, and at least one institution.' : 'Add a title and description before publishing.');
      return;
    }
    const formData = new FormData();
    formData.append('title', title.trim());
    formData.append('description', description.trim());
    files.forEach((file) => formData.append('files', file));
    try {
      if (specific) {
        await Promise.all(selectedInstitutions.map((institution) => {
          const institutionForm = new FormData();
          institutionForm.append('title', title.trim());
          institutionForm.append('description', description.trim());
          institutionForm.append('institution_id', institution.id);
          files.forEach((file) => institutionForm.append('files', file));
          return announcementsRepo.create(institutionForm);
        }));
      } else {
        await announcementsRepo.create(formData);
      }
      setMessage(specific ? 'Notice sent to the selected institution.' : 'Announcement published to all institutions.');
      setTitle('');
      setDescription('');
      setFiles([]);
      if (specific) setSelectedInstitutions([]);
    } catch (publishError) {
      setMessage(`Unable to send announcement: ${publishError.message}`);
    }
  };

  const chooseFiles = (event) => {
    setFiles([...files, ...Array.from(event.target.files || [])]);
    event.target.value = '';
  };

  return (
    <form className="ia-compose-card" onSubmit={publish}>
      <div className="ia-compose-heading">
        <div>
          <h2>{specific ? 'Institution-specific announcements' : 'Common announcements'}</h2>
          <p>{specific ? 'Send notices to selected institutions.' : 'Notices shared with all institutions.'}</p>
        </div>
        <span className="ia-count-badge">{specific ? selectedInstitutions.length : '12'}</span>
      </div>

      {specific && (
        <>
          <label className="ia-field-label" htmlFor="institution-search">Select Institution(s) <span>*</span></label>
          <div className="ia-institution-picker">
            <div className="ia-search-field">
              <span aria-hidden="true">⌕</span>
              <input
                id="institution-search"
                value={institutionSearch}
                onFocus={() => setShowInstitutionPicker(true)}
                onChange={(event) => { setInstitutionSearch(event.target.value); setShowInstitutionPicker(true); }}
                placeholder="Enter institution number or college name"
              />
              <span aria-hidden="true">⌄</span>
            </div>
            {showInstitutionPicker && filteredInstitutions.length > 0 && (
              <div className="ia-institution-options">
                {filteredInstitutions.map((institution) => (
                  <button type="button" key={institution.id || institution.institution_id} onClick={() => addInstitution(institution)}>
                    {institution.id || institution.institution_id} · {institution.name || institution.institution_name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedInstitutions.length > 0 && (
            <div className="ia-selected-institutions">
              {selectedInstitutions.map((institution) => (
                <span key={institution.id}>{institution.id} · {institution.name}
                  <button type="button" onClick={() => setSelectedInstitutions(selectedInstitutions.filter((item) => item.id !== institution.id))} aria-label={`Remove ${institution.name}`}>×</button>
                </span>
              ))}
            </div>
          )}
        </>
      )}

      <label className="ia-field-label" htmlFor={`${specific ? 'specific' : 'common'}-title`}>
        {specific ? 'Notice / Circular Title' : 'Announcement / Circular Title'} <span>*</span>
      </label>
      <input id={`${specific ? 'specific' : 'common'}-title`} className="ia-form-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Enter title of the announcement" />

      {!specific && (
        <>
          <label className="ia-field-label" htmlFor="common-description">Description <span>*</span></label>
          <textarea id="common-description" className="ia-form-textarea" maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Enter detailed description of the announcement..." />
          <span className="ia-character-count">{description.length}/1000</span>
        </>
      )}

      {specific && (
        <>
          <label className="ia-field-label" htmlFor="specific-description">Description <span>*</span></label>
          <textarea id="specific-description" className="ia-form-textarea" maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Enter detailed notice or circular description..." />
        </>
      )}

      <div className="ia-upload-actions">
        <label className="ia-primary-upload">
          <span aria-hidden="true">⇧</span> Upload Circular
          <input type="file" accept=".pdf" multiple onChange={chooseFiles} />
        </label>
        <label className="ia-secondary-upload">
          <span aria-hidden="true">▧</span> Upload PPT
          <input type="file" accept=".ppt,.pptx" multiple onChange={chooseFiles} />
        </label>
      </div>
      <small className="ia-upload-hint">PDF, PPT, PPTX</small>

      <label className="ia-field-label ia-attachments-label">Attachments</label>
      <AttachmentPicker files={files} onChange={chooseFiles} onRemove={(index) => setFiles(files.filter((_, fileIndex) => fileIndex !== index))} />

      {message && <p className="ia-form-message" role="status">{message}</p>}
      <button type="submit" className="ia-publish-button">
        <span aria-hidden="true">➤</span>{specific ? 'Send to Selected Institution' : 'Publish to All Institutions'}
      </button>
    </form>
  );
}

export default function InstitutionAnnouncements() {
  const { user } = usePortal();
  const isInstitution = user?.kind === 'institution';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(isInstitution);
  const [error, setError] = useState('');
  const [institutions, setInstitutions] = useState([]);
  const [selectedInstitutions, setSelectedInstitutions] = useState([]);
  const [removingId, setRemovingId] = useState('');
  const institutionId = user?.institution_id;

  useEffect(() => {
    if (!isInstitution) {
      institutionsRepo.list().then(setInstitutions).catch(() => setInstitutions([]));
      return undefined;
    }
    let mounted = true;
    announcementsRepo.list()
      .then((values) => {
        if (!mounted) return;
        const records = (Array.isArray(values) ? values : []).map((value) => ({
          id: String(value.id),
          title: value.title,
          description: value.description,
          date: value.created_at,
          reference: value.id,
          institution: value.institution_id,
          attachments: Array.isArray(value.attachments) ? value.attachments : [],
        }));
        setItems(records);
      })
      .catch((loadError) => { if (mounted) setError(`Unable to load announcements: ${loadError.message}`); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [isInstitution]);

  const specific = useMemo(() => items.filter((item) => item.institution && item.institution === institutionId), [institutionId, items]);
  const common = useMemo(() => items.filter((item) => !item.institution || item.institution !== institutionId), [institutionId, items]);
  const removeAnnouncement = async (item) => {
    if (!window.confirm('Remove this announcement for all recipients?')) return;
    setRemovingId(item.id);
    try {
      await announcementsRepo.remove(item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
    } catch (removeError) {
      setError(`Unable to remove announcement: ${removeError.message}`);
    } finally {
      setRemovingId('');
    }
  };

  return (
    <div className="ia-page">
      <header className="ia-header">
        <img src={`${import.meta.env.BASE_URL}aicte-tricolor-heritage-header.png`} alt="AICTE — Technical Education for a Stronger India" />
        <div className="ia-header-actions">
          <NotificationButton className="ia-bell" />
          <Link to="/dashboard" className="ia-profile">{isInstitution ? (user?.institution_name || user?.name || 'Institution Portal') : (user?.name || 'AICTE Officer')} <span>⌄</span></Link>
        </div>
      </header>
      <div className="ia-layout">
        <PortalSidebar kind={isInstitution ? 'institution' : 'officer'} />
        <main className="ia-main">
          <div className="ia-breadcrumb"><Link to="/dashboard">{isInstitution ? 'Institution Portal' : 'Officer Command Centre'}</Link><span>/</span><strong>Announcements</strong></div>
          <div className="ia-title">
            <span className="ia-title-icon" aria-hidden="true">♧</span>
            <div><h1>Announcements</h1><p>{isInstitution ? 'Stay informed about portal updates and notices relevant to your institution.' : 'Publish circulars, PPT presentations, and notices to institutions.'}</p></div>
          </div>
          {isInstitution ? (
            <>
              {error && <div className="ia-error" role="alert">{error}</div>}
              {loading ? <div className="ia-empty">Loading announcements…</div> : (
                <div className="ia-sections">
                  <section className="ia-section"><div className="ia-section-heading"><div><h2>Common announcements</h2><p>Open notices shared with institutions.</p></div><b>{common.length}</b></div>{common.length ? common.map((item) => <AnnouncementCard key={`common-${item.id}`} item={item} onRemove={removingId === item.id ? undefined : removeAnnouncement} />) : <div className="ia-empty">There are no open common announcements.</div>}</section>
                  <section className="ia-section"><div className="ia-section-heading"><div><h2>Institution-specific announcements</h2><p>Notices addressed to your institution.</p></div><b>{specific.length}</b></div>{specific.length ? specific.map((item) => <AnnouncementCard key={`specific-${item.id}`} item={item} specific onRemove={removingId === item.id ? undefined : removeAnnouncement} />) : <div className="ia-empty">There are no institution-specific announcements.</div>}</section>
                </div>
              )}
            </>
          ) : (
            <div className="ia-compose-grid">
              <PublisherPanel institutions={institutions} selectedInstitutions={selectedInstitutions} setSelectedInstitutions={setSelectedInstitutions} />
              <PublisherPanel specific institutions={institutions} selectedInstitutions={selectedInstitutions} setSelectedInstitutions={setSelectedInstitutions} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
