import { useState } from 'react';
import E from '../lib/engine.js';
import { INST } from '../data/seed.js';
import { usePortal } from '../context/PortalContext.jsx';
import { Badge, PageHead } from '../components/ui.jsx';

export default function Calculator() {
  const { role, user } = usePortal();
  const options = INST.filter((i) => E.vis(i, role, user.institutionId));
  const [id, setId] = useState('I1');
  const [paidOverride, setPaid] = useState(null);
  if (!options.length) {
    return (
      <>
        <PageHead title="Deposit and penalty calculator" sub="Calculations require configured official AICTE deposit and penalty rules." />
        <section className="card"><h2 className="h3">No institution data available</h2><p className="meta">Connect an authorized institution data source and official AICTE deposit and penalty rules to enable calculations.</p></section>
      </>
    );
  }
  const i = options.find((x) => x.id === id) || options[0];
  const paid = paidOverride || i.paid, r = E.req(i), p = E.pen(i, paid);
  return (
    <>
      <PageHead title="Deposit and penalty calculator" sub="Required deposit and late-payment position, computed from the configurable rules." />
      <div className="card fields">
        <label>Institution
          <select value={i.id} onChange={(e) => { setId(e.target.value); setPaid(null); }}>
            {options.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <label>Payment date
          <input type="date" value={paid} onChange={(e) => setPaid(e.target.value)} />
        </label>
      </div>
      <article className="card">
        <h2 className="h3">Required deposit</h2>
        <p>{r.txt}</p>
        <h2 className="h3">Payment position</h2>
        <ul className="evidence">
          <li>Intimation: {i.intim}</li><li>Proof due (15 days): {p.dl}</li><li>Paid: {paid}</li>
        </ul>
        <p><Badge tone={p.pct ? 'bad' : 'ok'}>{p.t}</Badge> {p.amt ? `Penalty ${E.fmt(p.amt)}, recommended for officer action` : ''}</p>
      </article>
    </>
  );
}