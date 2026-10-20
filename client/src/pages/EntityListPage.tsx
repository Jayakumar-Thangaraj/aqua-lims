import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { entityByPath } from '@aqualims/shared';
import { api, download } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { EntityIcon, IconPlus, IconRefresh, IconTrash } from '../components/Icons';
import { Callout, ConfirmDialog } from '../components/Modal';
import { useToast } from '../components/Toast';
import { EntityFormModal } from '../form/EntityFormModal';
import { DataGrid } from '../grid/DataGrid';
import { entityColumns } from '../grid/entityColumns';
import { useGlobalSearch } from '../layout/SearchContext';
import { NotFoundPage } from './NotFoundPage';

export function EntityListPage() {
  const { resource, id } = useParams();
  const def = entityByPath(resource ?? '');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const { query } = useGlobalSearch();
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const list = useQuery({
    queryKey: ['list', def?.key],
    queryFn: () => api<{ items: any[]; total: number }>(`/${def!.apiPath}?pageSize=0`),
    enabled: Boolean(def) && can(def!.key, 'read'),
  });
  const columns = useMemo(() => (def ? entityColumns(def, def.listColumns) : []), [def]);

  useEffect(() => {
    if (def) document.title = `${def.listCaption} - Aqua LIMS`;
  }, [def]);

  if (!def) return <NotFoundPage />;
  if (!can(def.key, 'read')) return <div className="page"><Callout kind="warning">You don't have permission to view {def.listCaption}.</Callout></div>;

  const remove = async () => {
    setConfirmDelete(false);
    try {
      const result = await api<{ deleted: string[]; errors: { id: string; message: string }[] }>(`/${def.apiPath}/bulk-delete`, { method: 'POST', body: { ids: selected } });
      if (result.deleted.length) toast(`${result.deleted.length} ${result.deleted.length === 1 ? 'record' : 'records'} deleted.`, 'success');
      for (const e of result.errors) toast(e.message, 'error', 8000);
      queryClient.invalidateQueries({ queryKey: ['list', def.key] });
      queryClient.invalidateQueries({ queryKey: ['lookup', def.key] });
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  return (
    <div className="page">
      <div className="page-title">
        <EntityIcon name={def.icon} size={20} variant="tile" />
        <h1>{def.listCaption}</h1>
      </div>
      <div className="banner">{def.banner}</div>
      <DataGrid
        key={def.key}
        viewKey={def.key}
        columns={columns}
        data={list.data?.items ?? []}
        loading={list.isLoading}
        getRowId={(r) => r._id}
        selectable
        onSelectionChange={setSelected}
        onOpen={(row) => navigate(`/${def.apiPath}/${row._id}`)}
        rowClassName={(r) => (def.highlightOutOfRange && r.isOutOfRange ? 'out-of-range' : undefined)}
        globalFilter={query}
        defaultSort={{ id: def.defaultSort.field, desc: def.defaultSort.desc }}
        defaultFilterRow={def.filterRowDefault}
        onExport={async (format, columnIds, rowIds) => {
          try {
            await download(`/${def.apiPath}/export`, { format, ids: rowIds, columns: columnIds.map((c) => ({ id: c, caption: columns.find((x) => x.id === c)?.header })) }, `${def.apiPath}.${format}`);
          } catch (e: any) {
            toast(e.message, 'error');
          }
        }}
        toolbar={
          <>
            {can(def.key, 'create') && (
              <button type="button" className="btn btn-ghost" onClick={() => navigate(`/${def.apiPath}/new`)}>
                <IconPlus size={15} /> New
              </button>
            )}
            {can(def.key, 'delete') && (
              <button type="button" className="btn btn-ghost" disabled={selected.length === 0} onClick={() => setConfirmDelete(true)}>
                <IconTrash size={15} /> Delete
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={() => list.refetch()}>
              <IconRefresh size={15} /> Refresh
            </button>
          </>
        }
      />
      {id && (
        <EntityFormModal
          key={`${def.key}-${id}`}
          def={def}
          recordId={id}
          onClose={() => navigate(`/${def.apiPath}`)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete"
          message="You are about to delete the selected record(s). Do you want to proceed?"
          confirmLabel="Delete"
          confirmIcon={<IconTrash size={15} />}
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={remove}
        />
      )}
    </div>
  );
}
