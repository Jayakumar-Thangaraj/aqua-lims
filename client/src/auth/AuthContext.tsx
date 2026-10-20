import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { can, type Operation, type PermissionSet } from '@aqualims/shared';
import { api, onSessionProblem } from '../api/client';

export interface Me {
  user: { id: string; userName: string; changePasswordOnFirstLogon: boolean };
  permissions: PermissionSet;
  sessionIdleMinutes: number;
}

interface AuthValue {
  me: Me | null;
  loading: boolean;
  sessionExpired: boolean;
  login: (userName: string, password: string) => Promise<Me>;
  logout: () => Promise<void>;
  setMe: (me: Me) => void;
  can: (type: string, op: Operation) => boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const queryClient = useQueryClient();
  const meRef = useRef<Me | null>(null);
  meRef.current = me;

  // Only a 401 means "signed out"; a server that is restarting or unreachable is retried briefly.
  useEffect(() => {
    let cancelled = false;
    const load = async (attempt: number) => {
      try {
        const result = await api<Me>('/auth/me');
        if (!cancelled) setMe(result);
      } catch (e: any) {
        if (!cancelled && e?.status !== 401 && e?.code !== 'PASSWORD_CHANGE_REQUIRED' && attempt < 6) {
          await new Promise((r) => setTimeout(r, 1000));
          if (!cancelled) return load(attempt + 1);
        }
        if (!cancelled) setMe(null);
      }
      if (!cancelled) setLoading(false);
    };
    load(0);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () =>
      onSessionProblem((error) => {
        if (error.status === 401) {
          // Only a session that was signed in can "expire"; the first /auth/me check is just signed-out.
          if (meRef.current) setSessionExpired(true);
          setMe(null);
          queryClient.clear();
        } else if (error.code === 'PASSWORD_CHANGE_REQUIRED') {
          setMe((current) => (current ? { ...current, user: { ...current.user, changePasswordOnFirstLogon: true } } : current));
        }
      }),
    [queryClient],
  );

  const login = useCallback(async (userName: string, password: string) => {
    const result = await api<Me>('/auth/login', { method: 'POST', body: { userName, password } });
    setSessionExpired(false);
    setMe(result);
    return result;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setMe(null);
      queryClient.clear();
    }
  }, [queryClient]);

  const value = useMemo<AuthValue>(
    () => ({
      me,
      loading,
      sessionExpired,
      login,
      logout,
      setMe,
      can: (type, op) => can(me?.permissions, type, op),
      isAdmin: Boolean(me?.permissions.isAdministrative),
    }),
    [me, loading, sessionExpired, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
