import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ENTITIES, type ChildDef } from '@aqualims/shared';
import { api, toQuery } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { IconPlus } from '../components/Icons';
import { Callout } from '../components/Modal';
import { DataGrid } from '../grid/DataGrid';
import { entityColumns } from '../grid/entityColumns';
import { EntityFormModal } from './EntityFormModal';
import { useForm } from './FormContext';

// Read-only list of related records that have their own form (e.g. a tank's samples).
export function ListChildGrid({ child }: { child: ChildDef }) {
  const form = useForm();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const cdef = ENTITIES[child.entity];
  const parentId = form.recordId;
  const [open, setOpen] = useState<{ id: string; initial?: Record<string, any>; locked?: string[] } | null>(null);
  const queryKey = ['childList', cdef.key, child.foreignKey, parentId];
  const list = useQuery({
    queryKey,
    queryFn: () => api<{ items: any[] }>(`/${cdef.apiPath}${toQuery({ pageSize: 0, [`filter[${child.foreignKey}][eq]`]: parentId })}`),
    enabled: Boolean(parentId) && can(cdef.key, 'read'),
  });

  if (!can(cdef.key, 'read')) return <Callout kind="warning">You don't have access to {cdef.listCaption}.</Callout>;

  const startNew = () => {
    const initial: Record<string, any> = {};
    const locked: string[] = [];
    for (const [field, source] of Object.entries(child.newDefaults ?? {})) {
      if (source.startsWith('@')) {
        const from = source.slice(1);
        initial[field] = from === '_id' ? parentId : form.values[from] ?? null;
        if (from === '_id') locked.push(field);
        const label = from === '_id' ? form.record?._display : form.labels[from];
        if (label) initial[`__label_${field}`] = label;
      } else initial[field] = source;
    }
    setOpen({ id: 'new', initial, locked });
  };

  return (
    <div className="child-grid">
      {!parentId ? (
        <Callout kind="info">Save this record first to add {cdef.listCaption.toLowerCase()}.</Callout>
      ) : (
        <DataGrid
          compact
          columns={entityColumns(cdef, child.columns)}
          data={list.data?.items ?? []}
          loading={list.isLoading}
          getRowId={(r) => r._id}
          onOpen={(r) => setOpen({ id: r._id })}
          emptyText={child.emptyText}
          rowClassName={(r) => (r.isOutOfRange ? 'out-of-range' : undefined)}
          toolbar={
            can(cdef.key, 'create') && (
              <button type="button" className="btn btn-ghost" onClick={startNew}>
                <IconPlus size={15} /> New
              </button>
            )
          }
        />
      )}
      {open && (
        <EntityFormModal
          def={cdef}
          recordId={open.id}
          initialValues={open.initial}
          lockedFields={open.locked}
          level={form.level + 1}
          onClose={(saved) => {
            setOpen(null);
            if (saved) {
              queryClient.invalidateQueries({ queryKey });
              queryClient.invalidateQueries({ queryKey: ['list', cdef.key] });
            }
          }}
        />
      )}
    </div>
  );
}
