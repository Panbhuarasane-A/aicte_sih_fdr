import { usePortal } from '../context/PortalContext.jsx';
import { PageHead, DataTable } from '../components/ui.jsx';

export default function Audit() {
  const { audit } = usePortal();
  return (
    <>
      <PageHead title="Audit trail" sub="Every action in this session, newest first." />
      <DataTable head={['Time', 'User', 'Action']} rows={audit.map((a) => [a.t, a.u, a.a])} />
    </>
  );
}