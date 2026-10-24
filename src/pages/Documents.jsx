import E from '../lib/engine.js';
import { DOCS, FDRS } from '../data/seed.js';
import { usePortal } from '../context/PortalContext.jsx';
import { Badge, PageHead, DataTable } from '../components/ui.jsx';

export default function Documents() {
  const { role, user } = usePortal();
  const list = DOCS.filter((d) => E.vis(E.inst(FDRS.find((f) => f.id === d.fdr).inst), role, user.institutionId));
  return (
    <>
      <PageHead title="Document content check" sub="Extracted values are compared with the submitted record. Results are discrepancy flags, not a finding on authenticity." />
      {list.length === 0 && <section className="card"><h2 className="h3">No document records available</h2><p className="meta">Connect an authorized AICTE document service to review submissions.</p></section>}
      {list.map((d) => {
        const fl = E.doc(d);
        return (
          <article className="card" key={d.name}>
            <h2 className="h3">{d.name}</h2>
            <div className="tags">
              {fl.length ? <Badge tone="bad">{fl.length} flag{fl.length > 1 ? 's' : ''}</Badge> : <Badge tone="ok">No discrepancies found</Badge>}
            </div>
            {fl.length > 0 && <DataTable head={['Field', 'Extracted from document', 'Expected from record']} rows={fl.map((x) => [x.k, x.a, x.b])} />}
            <p className="meta note">AI-assisted discrepancy detection. Not a determination of authenticity.</p>
          </article>
        );
      })}
    </>
  );
}