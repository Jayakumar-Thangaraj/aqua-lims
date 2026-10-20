import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PERMISSION_TYPES, formatDateTime } from '@aqualims/shared';
import { api, toQuery } from '../../api/client';
import { EntityIcon, IconChevronLeft, IconChevronRight, IconEmpty, IconFilter } from '../../components/Icons';

const OPERATIONS = ['ObjectCreated', 'InitialValueAssigned', 'ObjectChanged', 'ObjectDeleted', 'AddedToCollection', 'RemovedFromCollection', 'CollectionObjectChanged'];

export function AuditLogPage() {
  const [filters, setFilters] = useState({ from: '', to: '', userName: '', entity: '', operation: '' });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const logs = useQuery({
    queryKey: ['audit', applied, page],
    queryFn: () => api<{ items: any[]; total: number }>(`/admin/audit-logs${toQuery({ ...applied, page, pageSize })}`),
  });
  const total = logs.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const caption = (type: string) => PERMISSION_TYPES.find((t) => t.type === type)?.caption ?? type;

  return (
    <div className="page">
      <div className="page-title">
        <EntityIcon name="NAV_AuditLog" size={20} variant="tile" />
        <h1>Audit Log</h1>
      </div>
      <div className="banner">Every change made in Aqua LIMS: who, when, what, and the old and new values.</div>
      <form
        className="filter-bar"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setApplied(filters);
        }}
      >
        <label>From <input type="date" className="input" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>
        <label>To <input type="date" className="input" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>
        <label>User <input className="input" value={filters.userName} onChange={(e) => setFilters({ ...filters, userName: e.target.value })} /></label>
        <label>
          Record type
          <select className="input" value={filters.entity} onChange={(e) => setFilters({ ...filters, entity: e.target.value })}>
            <option value="">All</option>
            {PERMISSION_TYPES.map((t) => (
              <option key={t.type} value={t.type}>{t.caption}</option>
            ))}
          </select>
        </label>
        <label>
          Action
          <select className="input" value={filters.operation} onChange={(e) => setFilters({ ...filters, operation: e.target.value })}>
            <option value="">All</option>
            {OPERATIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-primary"><IconFilter size={15} /> Apply</button>
      </form>
      <div className="grid">
        <div className="grid-scroll">
          <table className="grid-table inline">
            <thead>
              <tr>
                <th>When</th>
                <th>User</th>
                <th>Record type</th>
                <th>Record</th>
                <th>Action</th>
                <th>Field</th>
                <th>Old value</th>
                <th>New value</th>
              </tr>
            </thead>
            <tbody>
              {logs.isLoading ? (
                <tr><td colSpan={8} className="grid-empty">Loading…</td></tr>
              ) : (logs.data?.items ?? []).length === 0 ? (
                <tr><td colSpan={8} className="grid-empty"><IconEmpty size={18} /><span>No audit entries match these filters.</span></td></tr>
              ) : (
                logs.data!.items.map((h) => (
                  <tr key={h._id}>
                    <td>{formatDateTime(h.at)}</td>
                    <td>{h.userName}</td>
                    <td>{caption(h.entity)}</td>
                    <td>{h.entityDisplay}</td>
                    <td>{h.operation}</td>
                    <td>{h.property ?? ''}</td>
                    <td><span className="cell-clip" title={h.oldValue ?? ''}>{h.oldValue ?? ''}</span></td>
                    <td><span className="cell-clip" title={h.newValue ?? ''}>{h.newValue ?? ''}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="grid-pager">
          <span>Page {page} of {pages} ({total} entries)</span>
          <span className="pager-buttons">
            <button type="button" className="icon-btn" aria-label="Previous page" disabled={page <= 1} title="Previous page" onClick={() => setPage((p) => p - 1)}><IconChevronLeft size={16} /></button>
            <button type="button" className="icon-btn" aria-label="Next page" disabled={page >= pages} title="Next page" onClick={() => setPage((p) => p + 1)}><IconChevronRight size={16} /></button>
          </span>
        </div>
      </div>
    </div>
  );
}
