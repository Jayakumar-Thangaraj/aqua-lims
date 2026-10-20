import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDateTime } from '@aqualims/shared';
import { ApiError, api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { EntityIcon, IconCancel, IconPlus, IconRefresh, IconSave } from '../../components/Icons';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { DataGrid } from '../../grid/DataGrid';
import { ToggleDisplay } from '../../grid/entityColumns';
import { Toggle } from '../../form/FieldEditor';

interface UserRow {
  _id: string;
  userName: string;
  isActive: boolean;
  changePasswordOnFirstLogon: boolean;
  roleIds: string[];
  roles: string[];
  lastLoginAt: string | null;
}

export function UsersPage() {
  const users = useQuery({ queryKey: ['admin-users'], queryFn: () => api<UserRow[]>('/admin/users') });
  const roles = useQuery({ queryKey: ['admin-roles'], queryFn: () => api<{ _id: string; name: string }[]>('/admin/roles') });
  const [editing, setEditing] = useState<UserRow | 'new' | null>(null);

  return (
    <div className="page">
      <div className="page-title">
        <EntityIcon name="NAV_Users" size={20} variant="tile" />
        <h1>Users</h1>
      </div>
      <div className="banner">Manage who can sign in, their roles, and password resets.</div>
      <DataGrid
        viewKey="admin.users"
        data={users.data ?? []}
        loading={users.isLoading}
        getRowId={(r) => r._id}
        onOpen={(r) => setEditing(r)}
        defaultSort={{ id: 'userName' }}
        columns={[
          { id: 'userName', header: 'User Name', size: 200, text: (r) => r.userName },
          { id: 'roles', header: 'Roles', size: 240, text: (r) => r.roles.join(', ') },
          { id: 'isActive', header: 'Active', size: 80, text: (r) => (r.isActive ? 'Yes' : 'No'), render: (r) => <ToggleDisplay on={r.isActive} /> },
          { id: 'pwd', header: 'Must Change Password', size: 170, text: (r) => (r.changePasswordOnFirstLogon ? 'Yes' : 'No') },
          { id: 'lastLoginAt', header: 'Last Login', size: 170, text: (r) => formatDateTime(r.lastLoginAt), sortValue: (r) => (r.lastLoginAt ? new Date(r.lastLoginAt).getTime() : 0) },
        ]}
        toolbar={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing('new')}>
              <IconPlus size={15} /> New
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => users.refetch()}>
              <IconRefresh size={15} /> Refresh
            </button>
          </>
        }
      />
      {editing && <UserForm user={editing === 'new' ? null : editing} roles={roles.data ?? []} onClose={() => setEditing(null)} />}
    </div>
  );
}

function UserForm({ user, roles, onClose }: { user: UserRow | null; roles: { _id: string; name: string }[]; onClose: () => void }) {
  const { me } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [userName, setUserName] = useState(user?.userName ?? '');
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [mustChange, setMustChange] = useState(user?.changePasswordOnFirstLogon ?? true);
  const [roleIds, setRoleIds] = useState<string[]>(user?.roleIds ?? []);
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      if (user) {
        await api(`/admin/users/${user._id}`, { method: 'PUT', body: { userName, isActive, changePasswordOnFirstLogon: mustChange, roleIds } });
        if (password) await api(`/admin/users/${user._id}/reset-password`, { method: 'POST', body: { password } });
      } else {
        await api('/admin/users', { method: 'POST', body: { userName, isActive, changePasswordOnFirstLogon: mustChange, roleIds, password } });
      }
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-roles'] });
      toast('User saved.', 'success', 2500);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.details) setErrors(Object.fromEntries(e.details.map((d) => [d.field, d.message])));
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={user ? `${user.userName} - User` : 'New User'}
      icon={<EntityIcon name="NAV_Users" size={17} variant="tile" />}
      width={560}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}><IconCancel size={15} /> Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}><IconSave size={15} /> {busy ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <div className="form">
        <div className="form-row" style={{ gridTemplateColumns: '3fr 1fr' }}>
          <div className={`field ${errors.userName ? 'has-error' : ''}`}>
            <label htmlFor="u-name" className="field-label">User Name<span className="req"> *</span></label>
            <input id="u-name" className="input" value={userName} onChange={(e) => setUserName(e.target.value)} />
            {errors.userName && <div className="field-error">{errors.userName}</div>}
          </div>
          <div className={`field ${errors.isActive ? 'has-error' : ''}`}>
            <span className="field-label">Active</span>
            <Toggle checked={isActive} onChange={setIsActive} label="Active" disabled={user?._id === me?.user.id} />
            {errors.isActive && <div className="field-error">{errors.isActive}</div>}
          </div>
        </div>
        <fieldset className={`field ${errors.roleIds ? 'has-error' : ''}`}>
          <legend className="field-label">Roles</legend>
          <div className="check-list">
            {roles.map((r) => (
              <label key={r._id}>
                <input type="checkbox" checked={roleIds.includes(r._id)} onChange={(e) => setRoleIds((ids) => (e.target.checked ? [...ids, r._id] : ids.filter((x) => x !== r._id)))} /> {r.name}
              </label>
            ))}
          </div>
          {errors.roleIds && <div className="field-error">{errors.roleIds}</div>}
        </fieldset>
        <div className={`field ${errors.password ? 'has-error' : ''}`}>
          <label htmlFor="u-pwd" className="field-label">
            {user ? 'Reset password' : 'Initial password'}
            {!user && <span className="req"> *</span>}
          </label>
          <input id="u-pwd" type="password" className="input" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={user ? 'Leave empty to keep the current password' : 'At least 8 characters'} />
          {errors.password && <div className="field-error">{errors.password}</div>}
        </div>
        <label className="inline-check">
          <input type="checkbox" checked={mustChange} onChange={(e) => setMustChange(e.target.checked)} /> Must change password at next login
        </label>
      </div>
    </Modal>
  );
}
