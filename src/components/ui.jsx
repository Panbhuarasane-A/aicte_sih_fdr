import { getStatusDefinition } from '../data/statuses.js';

export const Badge = ({ tone = 'info', children }) => <span className={`badge ${tone}`}>{children}</span>;

export const StatusBadge = ({ statusMap, code, className = '' }) => {
  const status = getStatusDefinition(statusMap, code);
  const label = status?.label || 'Unknown status';
  const iconPaths = {
    check: <path d="m5 12 4 4L19 6" />,
    alert: <><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4 4" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    copy: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.4-3" /></>,
  };

  return (
    <span
      className={`status-badge status-badge--${status?.color || 'neutral'} ${className}`.trim()}
      title={status?.description || 'The status is not recognized.'}
      aria-label={`${label}${status?.description ? `: ${status.description}` : ''}`}
    >
      <svg className="status-badge__icon" viewBox="0 0 24 24" aria-hidden="true">{iconPaths[status?.icon] || iconPaths.file}</svg>
      {label}
    </span>
  );
};

export const PageHead = ({ title, sub }) => (
  <header className="pagehead">
    <h1 className="h2">{title}</h1>
    <p className="meta">{sub}</p>
  </header>
);

export const DataTable = ({ head, rows, empty = 'No records in your scope.' }) => (
  <div className="tablewrap" tabIndex={0} role="region" aria-label="Data table">
    <table>
      <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
      <tbody>
        {rows.length
          ? rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)
          : <tr><td colSpan={head.length}>{empty}</td></tr>}
      </tbody>
    </table>
  </div>
);

export const statusTone = (s) => (s === 'EXACT_MATCH' ? 'ok' : s === 'POSSIBLE_MATCH' ? 'warn' : 'bad');
