import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { DropIcon, EntityIcon, IconKey, IconLogOut, IconUser } from '../components/Icons';
import { ChangePasswordForm } from './ChangePasswordForm';

// Seeded accounts (and admin resets) must set a new password before using the app.
export function ChangePasswordPage() {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from ?? '/';
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <DropIcon size={36} />
          <span className="brand-name">
            Aqua <strong>LIMS</strong>
          </span>
        </div>
        <h1>Change your password</h1>
        <p className="muted">Hello {me?.user.userName}. Please choose a new password before continuing.</p>
        <ChangePasswordForm onDone={() => navigate(from === '/change-password' ? '/' : from, { replace: true })} />
        <button
          type="button"
          className="link-btn with-icon"
          onClick={async () => {
            await logout();
            navigate('/login');
          }}
        >
          <IconLogOut size={14} /> Log off
        </button>
      </div>
    </div>
  );
}

export function MyDetailsPage() {
  const { me } = useAuth();
  return (
    <div className="page narrow">
      <div className="page-title">
        <EntityIcon name="NAV_MyDetails" size={20} variant="tile" />
        <h1>My Details</h1>
      </div>
      <section className="card">
        <h3 className="section-title">
          <IconUser size={14} /> Account
        </h3>
        <div className="field">
          <span className="field-label">User Name</span>
          <div className="readonly-value">{me?.user.userName}</div>
        </div>
        <div className="field">
          <span className="field-label">Access</span>
          <div className="readonly-value">{me?.permissions.isAdministrative ? 'Administrator (full access)' : 'Standard user'}</div>
        </div>
      </section>
      <section className="card">
        <h3 className="section-title">
          <IconKey size={14} /> Change Password
        </h3>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
