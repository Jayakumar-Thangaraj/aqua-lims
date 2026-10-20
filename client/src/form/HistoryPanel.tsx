import { useQuery } from '@tanstack/react-query';
import { formatDateTime } from '@aqualims/shared';
import { api, toQuery } from '../api/client';
import { IconHistory } from '../components/Icons';

const OPERATION_LABELS: Record<string, string> = {
  ObjectCreated: 'Created',
  InitialValueAssigned: 'Initial value',
  ObjectChanged: 'Changed',
  ObjectDeleted: 'Deleted',
  AddedToCollection: 'Added to',
  RemovedFromCollection: 'Removed from',
  CollectionObjectChanged: 'Changed in',
};

export function HistoryPanel({ entity, entityId }: { entity: string; entityId: string }) {
  const history = useQuery({
    queryKey: ['history', entity, entityId],
    queryFn: () => api<{ items: any[]; total: number }>(`/admin/audit-logs${toQuery({ entity, entityId, pageSize: 200 })}`),
  });
  if (history.isLoading) return <div className="form-loading">Loading history…</div>;
  const items = history.data?.items ?? [];
  if (items.length === 0)
    return (
      <div className="empty-inline">
        <IconHistory size={18} />
        <span>No history recorded for this record.</span>
      </div>
    );
  return (
    <table className="grid-table inline history">
      <thead>
        <tr>
          <th>When</th>
          <th>User</th>
          <th>Action</th>
          <th>Field</th>
          <th>Old value</th>
          <th>New value</th>
        </tr>
      </thead>
      <tbody>
        {items.map((h) => (
          <tr key={h._id}>
            <td>{formatDateTime(h.at)}</td>
            <td>{h.userName}</td>
            <td>{OPERATION_LABELS[h.operation] ?? h.operation}</td>
            <td>{h.property ?? ''}</td>
            <td><span className="cell-clip" title={h.oldValue ?? ''}>{h.oldValue ?? ''}</span></td>
            <td><span className="cell-clip" title={h.newValue ?? ''}>{h.newValue ?? ''}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
