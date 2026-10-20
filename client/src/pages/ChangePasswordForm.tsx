import { useState, type FormEvent } from 'react';
import { ApiError, api } from '../api/client';
import { useAuth, type Me } from '../auth/AuthContext';
import { IconKey } from '../components/Icons';
import { Callout } from '../components/Modal';

export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const { setMe } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!current) errs.currentPassword = 'Enter your current password.';
    if (next.length < 8) errs.newPassword = 'The new password must be at least 8 characters long.';
    if (next !== confirm) errs.confirm = "The passwords don't match.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const me = await api<Me>('/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      setMe(me);
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
      onDone?.();
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])));
      else setErrors({ form: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="password-form" onSubmit={submit} noValidate>
      {done && <Callout kind="success">Your password was changed.</Callout>}
      {errors.form && <Callout kind="danger">{errors.form}</Callout>}
      <div className={`field ${errors.currentPassword ? 'has-error' : ''}`}>
        <label htmlFor="cp-current" className="field-label">Current password</label>
        <input id="cp-current" type="password" className="input" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        {errors.currentPassword && <div className="field-error">{errors.currentPassword}</div>}
      </div>
      <div className={`field ${errors.newPassword ? 'has-error' : ''}`}>
        <label htmlFor="cp-new" className="field-label">New password</label>
        <input id="cp-new" type="password" className="input" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        {errors.newPassword ? <div className="field-error">{errors.newPassword}</div> : <div className="field-help">At least 8 characters.</div>}
      </div>
      <div className={`field ${errors.confirm ? 'has-error' : ''}`}>
        <label htmlFor="cp-confirm" className="field-label">Confirm new password</label>
        <input id="cp-confirm" type="password" className="input" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {errors.confirm && <div className="field-error">{errors.confirm}</div>}
      </div>
      <button type="submit" className="btn btn-primary" disabled={busy}>
        <IconKey size={15} /> {busy ? 'Saving…' : 'Change password'}
      </button>
    </form>
  );
}
