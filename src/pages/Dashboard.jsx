import E from '../lib/engine.js';
import { FDRS, CLAIMS, INST, RULES } from '../data/seed.js';
import { usePortal } from '../context/PortalContext.jsx';
import { Badge, PageHead, DataTable } from '../components/ui.jsx';
import OfficerInbox from './OfficerInbox.jsx';

function releaseState(f) {
  if (!f.rel) return '—';
  if (E.inst(f.inst).punitive) return <Badge tone="bad">Blocked: punitive action</Badge>;
  const m = E.missing(f);
  return m.length ? <Badge tone="warn">Missing: {m.join(', ')}</Badge> : <Badge tone="ok">Ready for committee</Badge>;
}

export default function Dashboard() {
  const { role, user } = usePortal();
  if (user.kind === 'officer') return <OfficerInbox />;
  const mine = (i) => E.vis(i, role, user.institutionId);
  const v = FDRS.filter((f) => mine(E.inst(f.inst)));
  const d = (f) => E.dd(f.mat);
  const kpis = [
    ['Active', v.filter((f) => d(f) >= 0).length],
    ['Expiring in 30 days', v.filter((f) => d(f) >= 0 && d(f) <= 30).length],
    ['Matured', v.filter((f) => d(f) < 0).length],
    ['Release requests', v.filter((f) => f.rel).length],
    ['Flagged claims', CLAIMS.filter((c) => mine(E.inst(c.inst)) && E.verify(c).st !== 'EXACT_MATCH').length],
    ['Penalty cases', INST.filter((i) => mine(i) && E.pen(i, i.paid).pct).length],
  ];
  const buckets = [...RULES.reminders].sort((a, b) => a - b);
  const rows = v.map((f) => {
    const n = d(f), r = buckets.find((x) => n <= x);
    return [
      E.inst(f.inst).name,
      <>{f.no}<br /><span className="meta">{f.bank}</span></>,
      E.fmt(f.amount),
      <>{f.mat}<br /><span className="meta">{n < 0 ? `${-n} days ago` : `${n} days`}</span></>,
      n < 0 ? <Badge tone="bad">Matured</Badge> : n <= 30 ? <Badge tone="warn">Expiring</Badge> : <Badge tone="ok">Active</Badge>,
      n < 0 ? 'Overdue' : r ? `Within ${r} days` : '—',
      releaseState(f),
    ];
  });
  return (
    <>
      <PageHead title="Dashboard" sub="Deposits and FDRs within your scope. Reminder buckets follow the configured lead times." />
      <section className="kpis" aria-label="Summary">
        {kpis.map(([l, n]) => <div className="kpi" key={l}><strong>{n}</strong><span>{l}</span></div>)}
      </section>
      <DataTable head={['Institution', 'FDR', 'Amount', 'Maturity', 'Status', 'Reminder', 'Release']} rows={rows} />
    </>
  );
}