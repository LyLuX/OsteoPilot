import { createContext, useContext, useEffect, useState } from 'react';
import { api, setCsrfToken } from '../api/client.js';
const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let alive = true;
    api
      .get('/auth/me')
      .then((s) => {
        if (alive) {
          setCsrfToken(s.csrfToken);
          setUser(s.user);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const expired = () => {
      setUser(null);
      setCsrfToken('');
      setNotice('Votre session a expiré. Reconnectez-vous.');
    };
    window.addEventListener('osteopilot:session-expired', expired);
    return () => window.removeEventListener('osteopilot:session-expired', expired);
  }, []);
  const authenticated = Boolean(user);
  useEffect(() => {
    if (!authenticated) return undefined;
    let lastActivity = Date.now();
    let lastRefresh = Date.now();
    let refreshing = false;
    let closing = false;
    const activity = () => {
      lastActivity = Date.now();
    };
    const timer = window.setInterval(() => {
      const now = Date.now();
      if (now - lastActivity >= 15 * 60000 && !closing) {
        closing = true;
        api
          .post('/auth/logout')
          .catch(() => {})
          .finally(() => {
            setUser(null);
            setCsrfToken('');
            setNotice('Déconnexion après 15 minutes d’inactivité.');
          });
      } else if (!refreshing && now - lastRefresh >= 5 * 60000 && lastActivity > lastRefresh) {
        refreshing = true;
        api
          .post('/auth/refresh')
          .then((s) => {
            lastRefresh = Date.now();
            setUser(s.user);
          })
          .catch(() => {})
          .finally(() => {
            refreshing = false;
          });
      }
    }, 15000);
    window.addEventListener('pointerdown', activity);
    window.addEventListener('keydown', activity);
    return () => {
      clearInterval(timer);
      window.removeEventListener('pointerdown', activity);
      window.removeEventListener('keydown', activity);
    };
  }, [authenticated]);
  const login = async (email, password) => {
    const session = await api.post('/auth/login', { email, password });
    setCsrfToken(session.csrfToken);
    setUser(session.user);
    setNotice('');
  };
  const logout = async () => {
    await api.post('/auth/logout');
    setCsrfToken('');
    setUser(null);
  };
  return (
    <AuthContext.Provider
      value={{ user, loading, login, logout, notice, can: (p) => user?.permissions.includes(p) }}
    >
      {children}
    </AuthContext.Provider>
  );
}
