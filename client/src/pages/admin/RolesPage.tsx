import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { OPERATIONS, type Operation, type TypePermission } from '@aqualims/shared';
import { ApiError, api } from '../../api/client';
import { EntityIcon, IconCancel, IconPlus, IconRefresh, IconSave, IconTrash } from '../../components/Icons';
import { Callout, ConfirmDialog, Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { DataGrid } from '../../grid/DataGrid';
import { Toggle } from '../../form/FieldEditor';

interface RoleRow {
  _id: string;
  name: string;
  isAdministrative: boolean;
  permissions: TypePermission[];
  userCount: number;
}

const OP_LABEL: Record<Operation, string> = { read: 'Read', create: 'Create', write: 'Write', delete: 'Delete', navigate: 'Navigate' };

export function RolesPage() {
  const roles = useQuery({ queryKey: ['admin-roles'], queryFn: () => api<RoleRow[]>('/admin/roles') });
  const [editing, setEditing] = useState<RoleRow | 'new' | null>(null);
  return (
    <div className="page">
      <div className="page-title">
        <EntityIcon name="NAV_Roles" size={20} variant="tile" />
        <h1>Roles</h1>
      </div>
      <div className="banner">Roles grant permissions per record type. Administrative roles have full access.</div>
      <DataGrid
        viewKey="admin.roles"
        data={roles.data ?? []}
        loading={roles.isLoading}
        getRowId={(r) => r._id}
        onOpen={(r) => setEditing(r)}
        defaultSort={{ id: 'name' }}
        columns={[
          { id: 'name', header: 'Name', size: 220, text: (r) => r.name },
          { id: 'admin', header: 'Administrative', size: 140, text: (r) => (r.isAdministrative ? 'Yes' : 'No') },
          { id: 'users', header: 'Users', size: 90, numeric: true, text: (r) => String(r.userCount), sortValue: (r) => r.userCount },
          { id: 'perms', header: 'Permissions', size: 320, text: (r) => (r.isAdministrative ? 'Full access' : `${r.permissions.filter((p) => OPERATIONS.some((op) => p[op])).length} record types`) },
        ]}
        toolbar={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing('new')}>
              <IconPlus size={15} /> New
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => roles.refetch()}>
              <IconRefresh size={15} /> Refresh
            </button>
          </>
        }
      />
      {editing && <RoleForm role={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RoleForm({ role, onClose }: { role: RoleRow | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const types = useQuery({ queryKey: ['permission-types'], queryFn: () => api<{ types: { type: string; caption: string }[] }>('/admin/permission-types') });
  const [name, setName] = useState(role?.name ?? '');
  const [isAdministrative, setIsAdministrative] = useState(role?.isAdministrative ?? false);
  const [perms, setPerms] = useState<Record<string, TypePermission>>(() => Object.fromEntries((role?.permissions ?? []).map((p) => [p.type, p])));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const get = (type: string): TypePermission => perms[type] ?? { type, read: false, create: false, write: false, delete: false, navigate: false };
  const set = (type: string, op: Operation, value: boolean) => setPerms((p) => ({ ...p, [type]: { ...get(type), [op]: value } }));
  const setRow = (type: string, value: boolean) => setPerms((p) => ({ ...p, [type]: { type, read: value, create: value, write: value, delete: value, navigate: value } }));

  const save = async () => {
    setErrors({});
    const body = { name, isAdministrative, permissions: Object.values(perms) };
    try {
      if (role) await api(`/admin/roles/${role._id}`, { method: 'PUT', body });
      else await api('/admin/roles', { method: 'POST', body });
      queryClient.invalidateQueries({ queryKey: ['admin-roles'] });
      toast('Role saved.', 'success', 2500);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.details) setErrors(Object.fromEntries(e.details.map((d) => [d.field, d.message])));
      toast((e as Error).message, 'error');
    }
  };

  const remove = async () => {
    setConfirmDelete(false);
    try {
      await api(`/admin/roles/${role!._id}`, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: ['admin-roles'] });
      toast('Role deleted.', 'success');
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <Modal
      title={role ? `${role.name} - Role` : 'New Role'}
      icon={<EntityIcon name="NAV_Roles" size={17} variant="tile" />}
      width={860}
      onClose={onClose}
      footer={
        <>
          {role && (
            <button type="button" className="btn btn-ghost danger footer-left" onClick={() => setConfirmDelete(true)}>
              <IconTrash size={15} /> Delete role
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}><IconCancel size={15} /> Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save}><IconSave size={15} /> Save</button>
        </>
      }
    >
      <div className="form">
        <div className="form-row" style={{ gridTemplateColumns: '3fr 1fr' }}>
          <div className={`field ${errors.name ? 'has-error' : ''}`}>
            <label htmlFor="r-name" className="field-label">Name<span className="req"> *</span></label>
            <input id="r-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
            {errors.name && <div className="field-error">{errors.name}</div>}
          </div>
          <div className={`field ${errors.isAdministrative ? 'has-error' : ''}`}>
            <span className="field-label">Administrative</span>
            <Toggle checked={isAdministrative} onChange={setIsAdministrative} label="Administrative" />
            {errors.isAdministrative && <div className="field-error">{errors.isAdministrative}</div>}
          </div>
        </div>
        {isAdministrative ? (
          <Callout kind="info">Administrative roles have full access to every record type and to Administration.</Callout>
        ) : (
          <div className="grid-scroll">
            <table className="grid-table inline perm-matrix">
              <thead>
                <tr>
                  <th>Record type</th>
                  {OPERATIONS.map((op) => (
                    <th key={op} className="center">{OP_LABEL[op]}</th>
                  ))}
                  <th className="center">All</th>
                </tr>
              </thead>
              <tbody>
                {(types.data?.types ?? []).map((t) => {
                  const p = get(t.type);
                  const all = OPERATIONS.every((op) => p[op]);
                  return (
                    <tr key={t.type}>
                      <td>{t.caption}</td>
                      {OPERATIONS.map((op) => (
                        <td key={op} className="center">
                          <input type="checkbox" aria-label={`${OP_LABEL[op]} ${t.caption}`} checked={p[op]} onChange={(e) => set(t.type, op, e.target.checked)} />
                        </td>
                      ))}
                      <td className="center">
                        <input type="checkbox" aria-label={`All permissions for ${t.caption}`} checked={all} onChange={(e) => setRow(t.type, e.target.checked)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {confirmDelete && (
        <ConfirmDialog title="Delete role" message={`Delete the role "${role?.name}"?`} confirmLabel="Delete" confirmIcon={<IconTrash size={15} />} danger onCancel={() => setConfirmDelete(false)} onConfirm={remove} />
      )}
    </Modal>
  );
}
