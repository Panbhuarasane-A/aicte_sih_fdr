import { useEffect, useMemo, useState } from 'react';
import { usePortal } from '../context/PortalContext.jsx';
import { fdrRepo, institutionsRepo } from '../data/repositories.js';
import PortalSidebar from '../components/PortalSidebar.jsx';
import NotificationButton from '../components/NotificationButton.jsx';
import DateRangePicker from '../components/DateRangePicker.jsx';
import '../styles/maturity-tracker.css';

const today = new Date();
today.setHours(0, 0, 0, 0);

function parseDate(value) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function displayDate(value, options = { day: '2-digit', month: 'short', year: 'numeric' }) {
  const date = parseDate(value);
  return date ? date.toLocaleDateString('en-GB', options) : '—';
}

function formatAmount(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function maturityState(instrument) {
  const status = (instrument.status || '').toLowerCase();
  if (status === 'renewed') return 'Renewed';
  if (status === 'released') return 'Released';
  const days = instrument.days_to_maturity ?? null;
  if (days !== null && days < 0) return 'Overdue';
  if (days !== null && days <= 30) return 'Due in 30 days';
  return 'Upcoming';
}

const statusClass = {
  Overdue: 'is-overdue',
  'Due in 30 days': 'is-due',
  Upcoming: 'is-upcoming',
  Renewed: 'is-renewed',
  Released: 'is-released',
};

function Icon({ name, size = 18 }) {
  const paths = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    alert: <><path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    money: <><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
    bulb: <><path d="M9 18h6m-5 4h4m-2-20a7 7 0 0 0-4 12.7c.6.4 1 1.2 1 2.3h6c0-1.1.4-1.9 1-2.3A7 7 0 0 0 12 2Z" /></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function CalendarPanel({ month, setMonth, instruments, selectedDate, setSelectedDate }) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const counts = instruments.reduce((result, instrument) => {
    if (instrument.maturity_date) {
      const day = result[instrument.maturity_date] || { total: 0, overdue: false, dueSoon: false };
      day.total += 1;
      day.overdue ||= instrument.tracker_status === 'Overdue';
      day.dueSoon ||= instrument.tracker_status === 'Due in 30 days';
      result[instrument.maturity_date] = day;
    }
    return result;
  }, {});
  const cells = Array.from({ length: firstDay.getDay() + daysInMonth }, (_, index) => (
    index < firstDay.getDay() ? null : index - firstDay.getDay() + 1
  ));

  const moveMonth = (offset) => setMonth(new Date(month.getFullYear(), month.getMonth() + offset, 1));

  return (
    <section className="mt-panel mt-calendar-panel" aria-label="Maturity calendar">
      <h2 className="mt-panel-title"><Icon name="calendar" /> Maturity Calendar</h2>
      <div className="mt-calendar-month">
        <button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month">‹</button>
        <strong>{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong>
        <button type="button" onClick={() => moveMonth(1)} aria-label="Next month">›</button>
      </div>
      <div className="mt-calendar-grid mt-calendar-weekdays" aria-hidden="true">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="mt-calendar-grid">
        {cells.map((day, index) => {
          if (!day) return <span className="mt-calendar-empty" key={`empty-${index}`} />;
          const date = new Date(month.getFullYear(), month.getMonth(), day);
          const key = dateKey(date);
          const dayMaturities = counts[key];
          const dueCount = dayMaturities?.total || 0;
          const isSelected = selectedDate === key;
          const isToday = dateKey(today) === key;
          return (
            <button
              type="button"
              key={key}
              className={`mt-calendar-day${dayMaturities?.dueSoon ? ' has-due' : ''}${dayMaturities?.overdue ? ' has-overdue' : ''}${dueCount && !dayMaturities?.dueSoon && !dayMaturities?.overdue ? ' has-other' : ''}${isSelected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}`}
              onClick={() => setSelectedDate(isSelected ? '' : key)}
              aria-label={`${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}${dueCount ? `, ${dueCount} maturities` : ''}`}
              aria-pressed={isSelected}
            >
              {day}
              {dueCount > 1 && <small>{dueCount}</small>}
            </button>
          );
        })}
      </div>
      <div className="mt-calendar-legend">
        <span><i className="is-due" /> Due in 30 days</span>
        <span><i className="is-overdue" /> Overdue</span>
        <span><i className="is-other" /> Other</span>
      </div>
    </section>
  );
}

export default function MaturityTracker() {
  const { user, signOut } = usePortal();
  const [instruments, setInstruments] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [institutionId, setInstitutionId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedInstrument, setSelectedInstrument] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    Promise.all([fdrRepo.list(), institutionsRepo.list()])
      .then(([instrumentData, institutionData]) => {
        if (!isMounted) return;
        setInstruments(instrumentData);
        setInstitutions(institutionData);
        setError('');
      })
      .catch((requestError) => {
        if (isMounted) setError(`Unable to load maturity records: ${requestError.message}`);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => { isMounted = false; };
  }, []);

  const institutionById = useMemo(
    () => new Map(institutions.map((institution) => [institution.id, institution])),
    [institutions],
  );

  const enrichedInstruments = useMemo(() => instruments.map((instrument) => {
    const maturityDate = parseDate(instrument.maturity_date);
    const daysToMaturity = instrument.days_to_maturity
      ?? (maturityDate ? Math.ceil((maturityDate - today) / 86400000) : null);
    return {
      ...instrument,
      days_to_maturity: daysToMaturity,
      tracker_status: maturityState({ ...instrument, days_to_maturity: daysToMaturity }),
    };
  }), [instruments]);

  const dueSoon = enrichedInstruments.filter((item) => item.tracker_status === 'Due in 30 days');
  const overdue = enrichedInstruments.filter((item) => item.tracker_status === 'Overdue');
  const renewedThisMonth = enrichedInstruments.filter((item) => (
    item.tracker_status === 'Renewed'
    && item.updated_at
    && item.updated_at.slice(0, 7) === dateKey(today).slice(0, 7)
  ));

  const filteredInstruments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return enrichedInstruments.filter((instrument) => {
      const institution = institutionById.get(instrument.institution_id);
      const searchMatches = !normalizedQuery || [
        instrument.institution_name,
        instrument.reference,
        instrument.bank,
        instrument.institution_id,
      ].some((value) => value?.toLowerCase().includes(normalizedQuery));
      const statusMatches = !statusFilter || instrument.tracker_status === statusFilter;
      const institutionMatches = !institutionId || instrument.institution_id === institutionId;
      const dateMatches = (!startDate || instrument.maturity_date >= startDate)
        && (!endDate || instrument.maturity_date <= endDate)
        && (!selectedDate || instrument.maturity_date === selectedDate);
      return searchMatches && statusMatches && institutionMatches && dateMatches && institution !== undefined;
    }).sort((a, b) => a.maturity_date.localeCompare(b.maturity_date));
  }, [enrichedInstruments, endDate, institutionById, institutionId, query, selectedDate, startDate, statusFilter]);

  const nearestMaturity = enrichedInstruments
    .filter((item) => item.tracker_status !== 'Renewed' && item.tracker_status !== 'Released' && item.days_to_maturity >= 0)
    .sort((a, b) => a.days_to_maturity - b.days_to_maturity)[0];
  const highestAmount = enrichedInstruments
    .filter((item) => item.tracker_status !== 'Released')
    .sort((a, b) => b.amount - a.amount)[0];
  const overdueInstitutions = new Set(overdue.map((item) => item.institution_id)).size;
  const officerName = user?.name || 'AICTE Officer';
  const officerRole = user?.role === 'institution' ? 'Institution Portal' : user?.region_scope ? `Scrutiny Officer, ${user.region_scope}` : 'AICTE Regulation Bureau';
  const statusOptions = ['Due in 30 days', 'Overdue', 'Upcoming', 'Renewed', 'Released'];

  return (
    <div className="mt-page">
      <header className="mt-header">
        <img className="mt-banner" src="/aicte-tricolor-heritage-header.png" alt="AICTE — Technical Education for a Stronger India" />
        <div className="mt-header-actions">
          <NotificationButton className="mt-notification" />
          <div className="mt-profile-wrap">
            <button className="mt-profile" type="button" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen}>
              <span className="mt-avatar">{officerName.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span>
              <span className="mt-profile-copy"><strong>{officerName}</strong><small>{officerRole}</small></span>
              <span aria-hidden="true">⌄</span>
            </button>
            {profileOpen && (
              <div className="mt-profile-menu">
                <span>{officerName}</span>
                <button type="button" onClick={signOut}>Sign out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mt-layout">
        <PortalSidebar kind={user?.kind === 'institution' ? 'institution' : 'officer'} />
        <main className="mt-main">
          <div className="mt-heading">
            <div className="mt-heading-icon"><Icon name="calendar" size={25} /></div>
            <div>
              <h1>Maturity Tracker</h1>
              <p>Track upcoming, expired and renewed FDRs with institution-wise details.</p>
            </div>
          </div>

          {error && <div className="mt-feedback" role="alert">{error}</div>}

          <div className="mt-content-grid">
            <div className="mt-primary-column">
              <section className="mt-metrics" aria-label="Maturity summary">
                <button className="mt-metric-card" type="button" onClick={() => { setStatusFilter(''); setSelectedDate(''); }}>
                  <span className="mt-metric-icon is-blue"><Icon name="calendar" /></span>
                  <span><small>Total FDRs</small><strong>{loading ? '—' : enrichedInstruments.length.toLocaleString('en-IN')} <b>›</b></strong><em>Across all institutions</em></span>
                </button>
                <button className="mt-metric-card" type="button" onClick={() => setStatusFilter('Due in 30 days')}>
                  <span className="mt-metric-icon is-amber"><Icon name="alert" /></span>
                  <span><small>Due in 30 Days</small><strong>{loading ? '—' : dueSoon.length.toLocaleString('en-IN')} <b>›</b></strong><em>Needs attention</em></span>
                </button>
                <button className="mt-metric-card" type="button" onClick={() => setStatusFilter('Overdue')}>
                  <span className="mt-metric-icon is-red"><Icon name="alert" /></span>
                  <span><small>Overdue</small><strong>{loading ? '—' : overdue.length.toLocaleString('en-IN')} <b>›</b></strong><em>Immediate action</em></span>
                </button>
                <button className="mt-metric-card" type="button" onClick={() => setStatusFilter('Renewed')}>
                  <span className="mt-metric-icon is-green"><Icon name="check" /></span>
                  <span><small>Renewed This Month</small><strong>{loading ? '—' : renewedThisMonth.length.toLocaleString('en-IN')} <b>›</b></strong><em>Successfully processed</em></span>
                </button>
              </section>

              <section className="mt-filters" aria-label="Filter maturities">
                <label className="mt-search">
                  <Icon name="search" size={16} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by institution name, FDR number or reference ID..." />
                </label>
                <select aria-label="Filter by institution" value={institutionId} onChange={(event) => setInstitutionId(event.target.value)}>
                  <option value="">All Institutions</option>
                  {institutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}
                </select>
                <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="">All Status</option>
                  {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
                <DateRangePicker label="Maturity date range" value={{ from: startDate, to: endDate }} onChange={(next) => { setStartDate(next.from); setEndDate(next.to); }} />
              </section>

              {selectedDate && (
                <div className="mt-selected-date">
                  Showing maturities on {displayDate(selectedDate)}.
                  <button type="button" onClick={() => setSelectedDate('')}>Clear date</button>
                </div>
              )}

              <section className="mt-panel mt-table-panel">
                <div className="mt-table-heading">
                  <h2 className="mt-panel-title"><Icon name="calendar" /> Upcoming Maturities</h2>
                  <span>{loading ? 'Loading…' : `${filteredInstruments.length} records`}</span>
                </div>
                <div className="mt-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Institution Name</th>
                        <th>FDR Number</th>
                        <th>Amount (₹)</th>
                        <th>Maturity Date</th>
                        <th>Days Left</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr><td colSpan="7" className="mt-table-message">Loading maturity records…</td></tr>
                      ) : filteredInstruments.length === 0 ? (
                        <tr><td colSpan="7" className="mt-table-message">{error ? 'Maturity records could not be loaded.' : 'No maturity records match your filters.'}</td></tr>
                      ) : filteredInstruments.map((instrument) => {
                        const institution = institutionById.get(instrument.institution_id);
                        const isOverdue = instrument.tracker_status === 'Overdue';
                        return (
                          <tr key={instrument.id}>
                            <td><strong>{instrument.institution_name || institution?.name || instrument.institution_id}</strong><small>{institution?.state || institution?.region || 'AICTE approved institution'}</small></td>
                            <td>{instrument.reference}</td>
                            <td>{formatAmount(instrument.amount)}</td>
                            <td>{displayDate(instrument.maturity_date)}</td>
                            <td><span className={`mt-days ${isOverdue ? 'is-overdue' : instrument.days_to_maturity <= 30 ? 'is-due' : ''}`}>{instrument.days_to_maturity < 0 ? `${instrument.days_to_maturity} days` : `${instrument.days_to_maturity ?? '—'} days`}</span></td>
                            <td><span className={`mt-status ${statusClass[instrument.tracker_status]}`}>{instrument.tracker_status}</span></td>
                            <td><button className="mt-view-button" type="button" onClick={() => setSelectedInstrument(instrument)}><Icon name="eye" size={14} /> View <span>›</span></button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <aside className="mt-side-column">
              <CalendarPanel month={month} setMonth={setMonth} instruments={enrichedInstruments} selectedDate={selectedDate} setSelectedDate={setSelectedDate} />
              <section className="mt-panel mt-insights">
                <h2 className="mt-panel-title"><Icon name="bulb" /> Quick Insights</h2>
                <div className="mt-insight-row">
                  <span className="mt-insight-icon is-blue"><Icon name="calendar" /></span>
                  <span><small>Nearest Maturity</small><strong>{nearestMaturity ? displayDate(nearestMaturity.maturity_date) : 'No upcoming maturity'}</strong><em>{nearestMaturity ? `${nearestMaturity.days_to_maturity} days left` : 'All records checked'}</em></span>
                </div>
                <div className="mt-insight-row">
                  <span className="mt-insight-icon is-blue"><Icon name="money" /></span>
                  <span><small>Highest Amount (FDR)</small><strong>{highestAmount ? formatAmount(highestAmount.amount) : '—'}</strong><em>{highestAmount?.institution_name || 'No FDR data available'}</em></span>
                </div>
                <div className="mt-insight-row">
                  <span className="mt-insight-icon is-red"><Icon name="alert" /></span>
                  <span><small>Most Overdue (Count)</small><strong>{overdue.length}</strong><em>Across {overdueInstitutions} institution{overdueInstitutions === 1 ? '' : 's'}</em></span>
                </div>
                <div className="mt-compliance-note">
                  <Icon name="shield" />
                  <span><strong>Stay compliant</strong><small>Track maturities and avoid penalties or disruptions.</small></span>
                </div>
              </section>
            </aside>
          </div>
        </main>
      </div>

      {selectedInstrument && (
        <div className="mt-modal-backdrop" role="presentation" onClick={() => setSelectedInstrument(null)}>
          <section className="mt-detail-modal" role="dialog" aria-modal="true" aria-labelledby="mt-detail-title" onClick={(event) => event.stopPropagation()}>
            <button className="mt-modal-close" type="button" onClick={() => setSelectedInstrument(null)} aria-label="Close details">×</button>
            <h2 id="mt-detail-title">FDR Maturity Details</h2>
            <dl>
              <dt>Institution</dt><dd>{selectedInstrument.institution_name || institutionById.get(selectedInstrument.institution_id)?.name || selectedInstrument.institution_id}</dd>
              <dt>FDR Number</dt><dd>{selectedInstrument.reference}</dd>
              <dt>Bank</dt><dd>{selectedInstrument.bank}</dd>
              <dt>Amount</dt><dd>{formatAmount(selectedInstrument.amount)}</dd>
              <dt>Issue Date</dt><dd>{displayDate(selectedInstrument.issue_date)}</dd>
              <dt>Maturity Date</dt><dd>{displayDate(selectedInstrument.maturity_date)}</dd>
              <dt>Status</dt><dd>{selectedInstrument.tracker_status}</dd>
              {selectedInstrument.remarks && <><dt>Remarks</dt><dd>{selectedInstrument.remarks}</dd></>}
            </dl>
          </section>
        </div>
      )}
    </div>
  );
}
