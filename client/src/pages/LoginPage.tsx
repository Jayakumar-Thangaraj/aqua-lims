import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { DropIcon, IconLogIn } from '../components/Icons';
import { Callout } from '../components/Modal';

export function LoginPage() {
  const { login, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const from = (location.state as any)?.from ?? '/';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await login(userName, password);
      navigate(me.user.changePasswordOnFirstLogon ? '/change-password' : from, { replace: true, state: { from } });
    } catch (err: any) {
      setError(err.message ?? 'Invalid user name or password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <DropIcon size={36} />
          <span className="brand-name">
            Aqua <strong>LIMS</strong>
          </span>
        </div>
        <h1>Log In</h1>
        <p className="muted">Welcome! Please enter your user name and password below.</p>
        {sessionExpired && !error && <Callout kind="warning">Your session expired. Please log in again.</Callout>}
        {error && <Callout kind="danger">{error}</Callout>}
        <div className="field">
          <label htmlFor="userName" className="field-label">User Name</label>
          <input id="userName" className="input" autoComplete="username" value={userName} onChange={(e) => setUserName(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label htmlFor="password" className="field-label">Password</label>
          <input id="password" type="password" className="input" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy || !userName.trim()}>
          <IconLogIn size={16} /> {busy ? 'Logging in…' : 'Log In'}
        </button>
      </form>
    </div>
  );
}
