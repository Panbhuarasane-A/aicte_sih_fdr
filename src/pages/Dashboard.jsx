import { usePortal } from '../context/PortalContext.jsx';
import OfficerInbox from './OfficerInbox.jsx';
import InstitutionCommandCentre from '../components/InstitutionCommandCentre.jsx';

export default function Dashboard() {
  const { user } = usePortal();

  if (user?.kind === 'officer') {
    return <OfficerInbox />;
  }

  // Institution dashboard
  return <InstitutionCommandCentre />;
}
