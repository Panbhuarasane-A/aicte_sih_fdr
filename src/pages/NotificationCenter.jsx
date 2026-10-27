import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePortal } from '../context/PortalContext.jsx';
import { notificationsRepo } from '../data/repositories.js';
import NotificationButton from '../components/NotificationButton.jsx';
import PortalSidebar from '../components/PortalSidebar.jsx';
import DateRangePicker from '../components/DateRangePicker.jsx';
import '../styles/notification-center.css';

const PAGE_SIZE = 7;
const READ_STORAGE_KEY = 'aicte_read_notifications';
const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'release', label: 'Release / Refund' },
  { id: 'registration', label: 'Institution Registration' },
  { id: 'action', label: 'Action Required' },
  { id: 'fdr', label: 'FDR & System' },
];

function safeReadIds() {
  try {
    const storedIds = JSON.parse(localStorage.getItem(READ_STORAGE_KEY) || '[]');
    return Array.isArray(storedIds) ? storedIds : [];
  } catch (error) {
    console.warn('Could not read notification state:', error);
    return [];
  }
}

function formatDate(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

function formatAmount(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function Icon({ name, size = 18 }) {
  const paths = {
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
    release: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6m-11 5 2 2 4-4" /></>,
    institution: <><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01M10 21v-4h4v4" /></>,
    alert: <><path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18m9 5 2 2 4-4" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m18 6-12 12M6 6l12 12" />,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function notificationRecords({ requests, claims, instruments }) {
  const records = [];
  requests.forEach((request) => {
    if (!['SUBMITTED', 'IN_SCRUTINY', 'RECOMMENDED'].includes(request.status)) return;
    records.push({
      id: `release-${request.id}`,
      category: 'release',
      icon: 'release',
      title: 'Release Request Submitted',
      institution: request.institution_name || request.institution_id,
      reference: request.instrument_ref || request.id,
      description: `Security deposit release request submitted for ${request.reason || 'workflow review'}.`,
      date: request.created_at,
      priority: request.punitive_blocked || !request.has_affidavit_6 || !request.has_request_letter ? 'High' : 'Medium',
      status: request.status,
      path: '/release-requests',
      action: 'Review Request',
    });
  });

  claims.forEach((claim) => {
    const classification = claim.match_result?.classification || 'PENDING';
    const hasMismatch = classification !== 'EXACT_MATCH';
    const isPending = claim.officer_decision === 'PENDING';
    if (!hasMismatch && !isPending) return;
    records.push({
      id: `claim-${claim.id}`,
      category: 'action',
      icon: 'alert',
      title: hasMismatch ? 'Transaction Mismatch Alert' : 'Transaction Verification Pending',
      institution: claim.institution_name || claim.institution_id,
      reference: claim.utr,
      description: claim.match_result?.suggested_action || `Transaction claim for ${formatAmount(claim.amount)} needs review.`,
      date: claim.created_at || claim.date,
      priority: hasMismatch ? 'High' : 'Medium',
      status: claim.officer_decision === 'PENDING' ? 'Unread' : claim.officer_decision,
      path: '/verify',
      action: hasMismatch ? 'View Details' : 'Review Transaction',
    });
  });

  instruments.forEach((instrument) => {
    const days = instrument.days_to_maturity;
    if (instrument.status === 'released' || days == null || days > 30) return;
    records.push({
      id: `fdr-${instrument.id}`,
      category: 'fdr',
      icon: 'calendar',
      title: days < 0 ? 'FDR Maturity Overdue' : 'FDR Maturity Reminder',
      institution: instrument.institution_name || instrument.institution_id,
      reference: instrument.reference,
      description: `FDR ${instrument.reference} ${days < 0 ? `passed maturity ${Math.abs(days)} days ago` : `matures in ${days} days`} (${instrument.maturity_date}).`,
      date: instrument.updated_at || instrument.created_at,
      priority: days <= 7 ? 'High' : 'Medium',
      status: 'Unread',
      path: '/maturities',
      action: 'View FDR',
    });
  });

  return records.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

export default function NotificationCenter() {
  const { user, signOut } = usePortal();
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [claims, setClaims] = useState([]);
  const [instruments, setInstruments] = useState([]);
  const [readIds, setReadIds] = useState(safeReadIds);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [priority, setPriority] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState('');
  const [detailVisible, setDetailVisible] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const officerName = user?.name || 'AICTE Officer';
  const officerRole = user?.role === 'institution'
    ? 'Institution Portal'
    : user?.region_scope ? `Scrutiny Officer, ${user.region_scope}` : 'AICTE Regulation Bureau';

  useEffect(() => {
    let mounted = true;
    notificationsRepo.getSources()
      .then((results) => {
        if (!mounted) return;
        const failures = [];
        const [requestResult, claimResult, instrumentResult] = results;
        if (requestResult.status === 'fulfilled') setRequests(requestResult.value);
        else failures.push(`release requests: ${requestResult.reason.message}`);
        if (claimResult.status === 'fulfilled') setClaims(claimResult.value);
        else failures.push(`transactions: ${claimResult.reason.message}`);
        if (instrumentResult.status === 'fulfilled') setInstruments(instrumentResult.value);
        else failures.push(`FDR records: ${instrumentResult.reason.message}`);
        if (failures.length === results.length) setError(`Unable to load notifications (${failures.join('; ')}).`);
        else if (failures.length) setError(`Some notification sources could not be loaded (${failures.join('; ')}).`);
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const notifications = useMemo(
    () => notificationRecords({ requests, claims, instruments }),
    [claims, instruments, requests],
  );
  const unreadCount = notifications.filter((item) => !readIds.includes(item.id)).length;
  const categoryCounts = useMemo(() => CATEGORIES.reduce((counts, item) => {
    counts[item.id] = item.id === 'all'
      ? notifications.length
      : notifications.filter((notice) => notice.category === item.id).length;
    return counts;
  }, {}), [notifications]);
  const filteredNotifications = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return notifications.filter((item) => {
      const matchesCategory = category === 'all' || item.category === category;
      const matchesPriority = !priority || item.priority === priority;
      const matchesUnread = !unreadOnly || !readIds.includes(item.id);
      const matchesQuery = !normalizedQuery || [
        item.institution, item.reference, item.title, item.description,
      ].some((value) => value?.toLowerCase().includes(normalizedQuery));
      const date = (item.date || '').slice(0, 10);
      return matchesCategory && matchesPriority && matchesUnread && matchesQuery
        && (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
    });
  }, [category, fromDate, notifications, priority, query, readIds, toDate, unreadOnly]);
  const visibleNotifications = filteredNotifications.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(filteredNotifications.length / PAGE_SIZE));
  const selectedNotification = detailVisible
    ? notifications.find((item) => item.id === selectedId) || filteredNotifications[0] || null
    : null;

  useEffect(() => { setPage(1); }, [category, fromDate, priority, query, toDate, unreadOnly]);
  useEffect(() => {
    if (filteredNotifications.length && !filteredNotifications.some((item) => item.id === selectedId)) {
      setSelectedId(filteredNotifications[0].id);
      setDetailVisible(true);
    }
  }, [filteredNotifications, selectedId]);
  useEffect(() => {
    if (!selectedId && notifications.length) setSelectedId(notifications[0].id);
  }, [notifications, selectedId]);

  const persistReadIds = (nextIds) => {
    try {
      localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(nextIds));
      setReadIds(nextIds);
    } catch (storageError) {
      setError(`Could not save notification read status: ${storageError.message}`);
    }
  };

  const markRead = (id) => persistReadIds([...new Set([...readIds, id])]);
  const markAllRead = () => persistReadIds([...new Set([...readIds, ...notifications.map((item) => item.id)])]);
  const openNotification = (item) => {
    setSelectedId(item.id);
    setDetailVisible(true);
    markRead(item.id);
  };
  const goToRelatedPage = (item) => {
    markRead(item.id);
    navigate(item.path);
  };

  return (
    <div className="nc-page">
      <header className="nc-header">
        <img className="nc-banner" src={`${import.meta.env.BASE_URL}aicte-tricolor-heritage-header.png`} alt="AICTE — Technical Education for a Stronger India" />
        <div className="nc-header-actions">
          <NotificationButton className="nc-bell" />
          <div className="nc-profile-wrap">
            <button className="nc-profile" type="button" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen}>
              <span className="nc-avatar">{officerName.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span>
              <span><strong>{officerName}</strong><small>{officerRole}</small></span>
              <span aria-hidden="true">⌄</span>
            </button>
            {profileOpen && <div className="nc-profile-menu"><span>{officerName}</span><button type="button" onClick={signOut}>Sign out</button></div>}
          </div>
        </div>
      </header>

      <div className="nc-layout">
        <PortalSidebar kind={user?.kind === 'institution' ? 'institution' : 'officer'} />
        <main className="nc-main">
          <div className="nc-title-row"><span className="nc-title-icon"><Icon name="bell" size={25} /></span><div><h1>Notification Centre</h1><p>View and manage system notifications, requests and alerts related to release/refund, verification and FDR updates.</p></div></div>
          {error && <div className="nc-error" role="alert">{error}</div>}

          <section className="nc-metrics">
            <div className="nc-metric"><span className="nc-metric-icon blue"><Icon name="release" /></span><div><small>Release / Refund Requests</small><strong>{categoryCounts.release || 0}</strong><em>{requests.filter((item) => ['SUBMITTED', 'IN_SCRUTINY', 'RECOMMENDED'].includes(item.status)).length} pending review</em></div></div>
            <div className="nc-metric"><span className="nc-metric-icon purple"><Icon name="institution" /></span><div><small>New Institution Registrations</small><strong>0</strong><em>Not available in current API</em></div></div>
            <div className="nc-metric"><span className="nc-metric-icon amber"><Icon name="alert" /></span><div><small>Action Required</small><strong>{categoryCounts.action || 0}</strong><em>Transaction verification alerts</em></div></div>
            <div className="nc-metric"><span className="nc-metric-icon green"><Icon name="calendar" /></span><div><small>FDR &amp; System Alerts</small><strong>{categoryCounts.fdr || 0}</strong><em>Due or overdue maturities</em></div></div>
          </section>

          <div className={`nc-workspace${selectedNotification ? '' : ' is-full'}`}>
            <section className="nc-list-panel">
              <div className="nc-toolbar">
                <div className="nc-tabs">{CATEGORIES.map((item) => <button type="button" key={item.id} className={category === item.id ? 'is-active' : ''} onClick={() => setCategory(item.id)}>{item.label}<b>{categoryCounts[item.id] || 0}</b></button>)}</div>
                <button className="nc-mark-all" type="button" onClick={markAllRead} disabled={!unreadCount}><Icon name="check" size={14} /> Mark All as Read</button>
              </div>
              <div className="nc-filters">
                <label className="nc-search"><Icon name="search" size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by institution name, reference number, or notification text..." /></label>
                <DateRangePicker label="Notification date range" value={{ from: fromDate, to: toDate }} onChange={(next) => { setFromDate(next.from); setToDate(next.to); }} />
                <select aria-label="Filter by priority" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">All Priority</option><option>High</option><option>Medium</option><option>Low</option></select>
                <label className="nc-unread"><input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} /> Unread Only</label>
              </div>
              <div className="nc-table-scroll">
                <table><thead><tr><th></th><th>Type</th><th>Title</th><th>Institution / Reference No.</th><th>Description</th><th>Date &amp; Time</th><th>Priority</th><th>Status</th><th>Action</th></tr></thead>
                  <tbody>{loading
                    ? <tr><td className="nc-empty" colSpan="9">Loading notifications…</td></tr>
                    : visibleNotifications.length === 0
                      ? <tr><td className="nc-empty" colSpan="9">No notifications match your filters.</td></tr>
                      : visibleNotifications.map((item) => {
                        const isRead = readIds.includes(item.id);
                        return <tr key={item.id} className={selectedNotification?.id === item.id ? 'is-selected' : ''} onClick={() => openNotification(item)}>
                          <td><input aria-label={`Select ${item.title}`} type="checkbox" checked={selectedNotification?.id === item.id} onChange={() => openNotification(item)} onClick={(event) => event.stopPropagation()} /></td>
                          <td><span className={`nc-row-icon ${item.category}`}><Icon name={item.icon} size={16} /></span></td>
                          <td><strong>{item.title}</strong></td>
                          <td>{item.institution}<small>{item.reference}</small></td>
                          <td className="nc-description">{item.description}</td>
                          <td>{formatDate(item.date)}</td>
                          <td><span className={`nc-priority ${item.priority.toLowerCase()}`}>{item.priority}</span></td>
                          <td><span className={`nc-status ${isRead ? 'read' : 'unread'}`}>{isRead ? 'Read' : 'Unread'}</span></td>
                          <td><button className="nc-row-action" type="button" onClick={(event) => { event.stopPropagation(); goToRelatedPage(item); }}><Icon name="check" size={13} />{item.action}</button></td>
                        </tr>;
                      })}</tbody>
                </table>
              </div>
              <div className="nc-pagination"><div>{Array.from({ length: pageCount }, (_, index) => index + 1).slice(0, 5).map((pageNumber) => <button type="button" key={pageNumber} className={pageNumber === page ? 'is-current' : ''} onClick={() => setPage(pageNumber)}>{pageNumber}</button>)}{pageCount > 5 && <span>…</span>}<button type="button" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>Next ›</button></div><span>Showing {filteredNotifications.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, filteredNotifications.length)} of {filteredNotifications.length} notifications</span></div>
            </section>

            {selectedNotification && <aside className="nc-details">
              <div className="nc-detail-head"><h2>Notification Details</h2><button type="button" aria-label="Close notification details" onClick={() => setDetailVisible(false)}><Icon name="close" size={15} /></button></div>
              <div className="nc-detail-body">
                <div className="nc-detail-title"><span className={`nc-row-icon ${selectedNotification.category}`}><Icon name={selectedNotification.icon} size={20} /></span><div><h3>{selectedNotification.title}</h3><p>{selectedNotification.institution}<small>{selectedNotification.reference}</small></p></div><span className={`nc-status ${readIds.includes(selectedNotification.id) ? 'read' : 'unread'}`}>{readIds.includes(selectedNotification.id) ? 'Read' : 'Unread'}</span></div>
                <div className="nc-detail-meta"><span><Icon name="calendar" size={13} />{formatDate(selectedNotification.date)}</span><span className={`nc-priority ${selectedNotification.priority.toLowerCase()}`}>{selectedNotification.priority} Priority</span></div>
                <section className="nc-detail-section"><h4>Message</h4><p>{selectedNotification.description}</p></section>
                <section className="nc-detail-section"><h4>Workflow Status</h4><div className="nc-flow"><span className="done">Submitted</span><span className={selectedNotification.category === 'release' ? 'current' : ''}>Under Review</span><span>Approval</span><span>Completed</span></div><small>{selectedNotification.status}</small></section>
                <div className="nc-detail-actions"><button type="button" className="nc-primary" onClick={() => goToRelatedPage(selectedNotification)}><Icon name="check" size={14} />{selectedNotification.action}</button><button type="button" className="nc-secondary" onClick={() => { markRead(selectedNotification.id); setDetailVisible(false); }}><Icon name="eye" size={14} />Mark as Read</button></div>
              </div>
            </aside>}
          </div>
        </main>
      </div>
    </div>
  );
}
