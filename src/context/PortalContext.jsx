import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, setAuthToken, getAuthToken } from '../lib/api.js';

const Ctx = createContext(null);
export const usePortal = () => useContext(Ctx);
const now = () => new Date().toLocaleString('en-IN');

export function PortalProvider({ children }) {
  const [role, setRoleState] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [audit, setAudit] = useState([]);
  const [marks, setMarks] = useState({});
  const [registrationRequests, setRegistrationRequests] = useState([]);

  const log = useCallback((a) => {
    const actor = user?.full_name || 'Portal visitor';
    setAudit((x) => [{ t: now(), u: actor, a }, ...x]);
  }, [user]);

  // Restore session on mount
  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api.getMe()
      .then((userData) => {
        setUser({
          ...userData,
          kind: userData.role === 'institution' ? 'institution' : 'officer',
          name: userData.full_name,
        });
        setRoleState(userData.role === 'institution' ? 'institution' : userData.role);
      })
      .catch((err) => {
        console.warn('Session expired or invalid:', err);
        setAuthToken(null);
        setUser(null);
        setRoleState(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (username, password) => {
    try {
      const data = await api.login(username, password);
      setAuthToken(data.access_token);
      const userData = data.user;
      const formattedUser = {
        ...userData,
        kind: userData.role === 'institution' ? 'institution' : 'officer',
        name: userData.full_name,
      };
      setUser(formattedUser);
      setRoleState(userData.role === 'institution' ? 'institution' : userData.role);
      log(`Signed in successfully as ${userData.full_name} (${userData.role})`);
      return { ok: true, user: formattedUser };
    } catch (err) {
      return { ok: false, error: err.message || 'Invalid username or password' };
    }
  }, [log]);

  const signOut = useCallback(() => {
    log('Signed out');
    setAuthToken(null);
    setUser(null);
    setRoleState(null);
  }, [log]);

  const updateRegistration = useCallback((id, status) => {
    setRegistrationRequests((current) => current.map((request) => request.id === id ? { ...request, status } : request));
    log(`Registration request ${id} marked ${status}`);
  }, [log]);

  const mark = (kind, key) => {
    setMarks((m) => ({ ...m, [kind + key]: true }));
    log(`${kind === 'v' ? 'Officer-verified' : 'Clarification requested'} ${key}`);
  };

  return (
    <Ctx.Provider value={{
      role, user, loading, signIn, signOut, audit, log, marks, mark,
      registrationRequests, updateRegistration, api
    }}>
      {children}
    </Ctx.Provider>
  );
}
