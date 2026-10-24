export const Badge = ({ tone = 'info', children }) => <span className={`badge ${tone}`}>{children}</span>;

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