import E from '../lib/engine.js';
import { CLAIMS } from '../data/seed.js';
import { usePortal } from '../context/PortalContext.jsx';
import { Badge, PageHead, statusTone } from '../components/ui.jsx';

export default function Verify() {
  const { role, user, marks, mark } = usePortal();
  const list = CLAIMS.filter((c) => E.vis(E.inst(c.inst), role, user.institutionId));
  return (
    <>
      <PageHead title="Transaction verification" sub="Each claim is checked against the bank statement. A match shows consistency with the statement, not proof of genuineness." />
      {list.length === 0 && <section className="card"><h2 className="h3">No transaction records available</h2><p className="meta">Connect an authorized AICTE transaction and bank-statement service to review records.</p></section>}
      {list.map((c) => {
        const i = E.inst(c.inst), r = E.verify(c), k = c.inst + c.utr, rq = E.req(i).amt, exact = r.st === 'EXACT_MATCH';
        return (
          <article className="card" key={k}>
            <h2 className="h3">{i.name}</h2>
            <p className="meta">{c.utr} · {E.fmt(c.amt)} · {c.date}</p>
            <div className="tags">
              <Badge>INSTITUTION_SUBMITTED</Badge>
              {exact && <Badge>STATEMENT_MATCHED</Badge>}
              {marks['v' + k] && <Badge tone="ok">OFFICER_VERIFIED</Badge>}
              {marks['q' + k] && <Badge tone="warn">CLARIFICATION_REQUESTED</Badge>}
              <Badge tone={statusTone(r.st)}>{r.st}</Badge>
            </div>
            <ul className="evidence">
              {r.ev.map((e) => <li key={e}>{e}</li>)}
              {exact && c.amt < rq && <li>Shortfall against required deposit: {E.fmt(rq - c.amt)} (required {E.fmt(rq)})</li>}
              <li>Suggested action: {r.act}</li>
            </ul>
            {user.kind === 'officer'
              ? <div className="actions">
                <button className="btn primary" disabled={!exact || marks['v' + k]} onClick={() => mark('v', k)}>Mark officer-verified</button>
                <button className="btn secondary" disabled={marks['q' + k]} onClick={() => mark('q', k)}>Request clarification</button>
              </div>
              : <p className="meta">Verification is reviewed by an authorized AICTE officer.</p>}
          </article>
        );
      })}
    </>
  );
}