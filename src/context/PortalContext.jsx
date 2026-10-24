import { createContext, useContext, useState, useCallback } from 'react';
import { ROLES } from '../data/seed.js';

const Ctx = createContext(null);
export const usePortal = () => useContext(Ctx);
const now = () => new Date().toLocaleString('en-IN');

export function PortalProvider({ children }) {
  const [role, setRoleState] = useState(null);
  const [user, setUser] = useState(null);
  const [audit, setAudit] = useState([]);
  const [marks, setMarks] = useState({});
  const [registrationRequests, setRegistrationRequests] = useState([]);

  const log = useCallback((a, r = role) => {
    const actor = ROLES[r] || (r === 'institution' ? 'Institution user' : 'Portal visitor');
    setAudit((x) => [{ t: now(), u: actor, a }, ...x]);
  }, [role]);
  const signIn = useCallback(() => ({
    ok: false,
    error: 'Sign-in is unavailable until the portal is connected to an authorized AICTE identity service.',
  }), []);
  const signOut = useCallback(() => {
    log('Signed out');
    setUser(null);
    setRoleState(null);
  }, [log]);
  const updateRegistration = useCallback((id, status) => {
    if (!user || user.kind !== 'officer') throw new Error('Only an AICTE officer can update registration requests.');
    setRegistrationRequests((current) => current.map((request) => request.id === id ? { ...request, status } : request));
    log(`Registration request ${id} marked ${status}`);
  }, [log, user]);
  const mark = (kind, key) => {
    if (!user || user.kind !== 'officer') throw new Error('Only an AICTE officer can record verification actions.');
    setMarks((m) => ({ ...m, [kind + key]: true }));
    log(`${kind === 'v' ? 'Officer-verified' : 'Clarification requested'} ${key}`);
  };

  return <Ctx.Provider value={{
    role, user, signIn, signOut, audit, log, marks, mark,
    registrationRequests, updateRegistration,
  }}>{children}</Ctx.Provider>;
}