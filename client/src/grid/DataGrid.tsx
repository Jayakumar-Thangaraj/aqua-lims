import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getGroupedRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnOrderState,
  type ColumnSizingState,
  type ExpandedState,
  type FilterFn,
  type GroupingState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { api } from '../api/client';
import {
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconCollapseAll,
  IconColumns,
  IconCsv,
  IconEdit,
  IconEmpty,
  IconExpandAll,
  IconExport,
  IconFilter,
  IconFilterOff,
  IconFooter,
  IconGroup,
  IconHide,
  IconMenu,
  IconPdf,
  IconReset,
  IconSearch,
  IconSortAsc,
  IconSortClear,
  IconSortDesc,
  IconXlsx,
} from '../components/Icons';
import { MenuItem, Popover } from '../components/Popover';

export interface GridColumn<T> {
  id: string;
  header: string;
  size?: number;
  hidden?: boolean;
  numeric?: boolean;
  text: (row: T) => string;
  sortValue?: (row: T) => string | number;
  render?: (row: T) => ReactNode;
}

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

interface Settings {
  sorting: SortingState;
  columnFilters: ColumnFiltersState;
  grouping: GroupingState;
  columnVisibility: VisibilityState;
  columnOrder: ColumnOrderState;
  columnSizing: ColumnSizingState;
  pageSize: number;
  showFilterRow: boolean;
  showSearch: boolean;
  showGroupPanel: boolean;
  showFooter: boolean;
}

export interface DataGridProps<T> {
  viewKey?: string;
  columns: GridColumn<T>[];
  data: T[];
  getRowId: (row: T) => string;
  loading?: boolean;
  onOpen?: (row: T) => void;
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  rowClassName?: (row: T) => string | undefined;
  globalFilter?: string;
  toolbar?: ReactNode;
  onExport?: (format: ExportFormat, columnIds: string[], rowIds: string[]) => void;
  defaultSort?: { id: string; desc?: boolean };
  defaultFilterRow?: boolean;
  emptyText?: string;
  compact?: boolean;
}

const OPERATORS: { op: string; label: string; numeric?: boolean }[] = [
  { op: 'contains', label: 'Contains' },
  { op: 'notContains', label: "Doesn't contain" },
  { op: 'startsWith', label: 'Begins with' },
  { op: 'endsWith', label: 'Ends with' },
  { op: 'eq', label: 'Equals' },
  { op: 'neq', label: "Doesn't equal" },
  { op: 'lt', label: 'Is less than' },
  { op: 'lte', label: 'Is less than or equal to' },
  { op: 'gt', label: 'Is greater than' },
  { op: 'gte', label: 'Is greater than or equal to' },
];

function matches(text: string, numeric: number | null, op: string, value: string): boolean {
  const t = text.toLowerCase();
  const v = value.toLowerCase();
  const n = numeric !== null && value.trim() !== '' && !Number.isNaN(Number(value.replace(/,/g, ''))) ? Number(value.replace(/,/g, '')) : null;
  const useNum = numeric !== null && n !== null;
  switch (op) {
    case 'contains':
      return t.includes(v);
    case 'notContains':
      return !t.includes(v);
    case 'startsWith':
      return t.startsWith(v);
    case 'endsWith':
      return t.endsWith(v);
    case 'eq':
      return useNum ? numeric === n : t === v;
    case 'neq':
      return useNum ? numeric !== n : t !== v;
    case 'lt':
      return useNum ? numeric! < n! : t < v;
    case 'lte':
      return useNum ? numeric! <= n! : t <= v;
    case 'gt':
      return useNum ? numeric! > n! : t > v;
    case 'gte':
      return useNum ? numeric! >= n! : t >= v;
    default:
      return true;
  }
}

export function DataGrid<T>(props: DataGridProps<T>) {
  const { viewKey } = props;
  const settingsQuery = useQuery({
    queryKey: ['viewSettings', viewKey],
    queryFn: () => api<Partial<Settings> | null>(`/me/view-settings/${encodeURIComponent(viewKey!)}`),
    enabled: Boolean(viewKey),
    staleTime: Infinity,
    retry: false,
  });
  if (viewKey && settingsQuery.isLoading) return <div className="grid-loading">Loading…</div>;
  return <DataGridInner {...props} saved={settingsQuery.data ?? null} />;
}

function defaults<T>(props: DataGridProps<T>): Settings {
  return {
    sorting: props.defaultSort ? [{ id: props.defaultSort.id, desc: Boolean(props.defaultSort.desc) }] : [],
    columnFilters: [],
    grouping: [],
    columnVisibility: Object.fromEntries(props.columns.filter((c) => c.hidden).map((c) => [c.id, false])),
    columnOrder: [],
    columnSizing: {},
    pageSize: 20,
    showFilterRow: Boolean(props.defaultFilterRow),
    showSearch: false,
    showGroupPanel: false,
    showFooter: false,
  };
}

function DataGridInner<T>(props: DataGridProps<T> & { saved: Partial<Settings> | null }) {
  const { columns, data, getRowId, onOpen, selectable, onSelectionChange, rowClassName, viewKey, saved, compact } = props;
  const initial = useMemo(() => ({ ...defaults(props), ...(saved ?? {}) }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [sorting, setSorting] = useState<SortingState>(initial.sorting);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(initial.columnFilters);
  const [grouping, setGrouping] = useState<GroupingState>(initial.grouping);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(initial.columnVisibility);
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(initial.columnOrder);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(initial.columnSizing);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: initial.pageSize });
  const [showFilterRow, setShowFilterRow] = useState(initial.showFilterRow);
  const [showSearch, setShowSearch] = useState(initial.showSearch);
  const [showGroupPanel, setShowGroupPanel] = useState(initial.showGroupPanel);
  const [showFooter, setShowFooter] = useState(initial.showFooter);
  const [searchText, setSearchText] = useState('');
  const [expanded, setExpanded] = useState<ExpandedState>(true);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [filterFor, setFilterFor] = useState<string | null>(null);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  // Persist the layout per user (debounced).
  const firstRender = useRef(true);
  useEffect(() => {
    if (!viewKey) return;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const settings: Settings = { sorting, columnFilters, grouping, columnVisibility, columnOrder, columnSizing, pageSize: pagination.pageSize, showFilterRow, showSearch, showGroupPanel, showFooter };
    const t = setTimeout(() => {
      api(`/me/view-settings/${encodeURIComponent(viewKey)}`, { method: 'PUT', body: settings }).catch(() => undefined);
    }, 800);
    return () => clearTimeout(t);
  }, [viewKey, sorting, columnFilters, grouping, columnVisibility, columnOrder, columnSizing, pagination.pageSize, showFilterRow, showSearch, showGroupPanel, showFooter]);

  const colById = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);

  const opFilter: FilterFn<T> = (row, columnId, filterValue: { op: string; value: string }) => {
    const col = colById.get(columnId);
    if (!col || !filterValue || filterValue.value === '') return true;
    const numeric = col.numeric && col.sortValue ? Number(col.sortValue(row.original)) : null;
    return matches(col.text(row.original), Number.isFinite(numeric as number) ? numeric : null, filterValue.op, filterValue.value);
  };

  const tableColumns = useMemo<ColumnDef<T, any>[]>(() => {
    const out: ColumnDef<T, any>[] = [];
    if (selectable)
      out.push({
        id: '__select',
        size: 40,
        enableSorting: false,
        enableResizing: false,
        enableGrouping: false,
        enableHiding: false,
        header: ({ table }) => (
          <input
            type="checkbox"
            aria-label="Select all rows"
            checked={table.getIsAllRowsSelected()}
            ref={(el) => {
              if (el) el.indeterminate = table.getIsSomeRowsSelected();
            }}
            onChange={table.getToggleAllRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) =>
          row.getIsGrouped() ? null : (
            <input type="checkbox" aria-label="Select row" checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} onClick={(e) => e.stopPropagation()} />
          ),
      });
    if (onOpen)
      out.push({
        id: '__open',
        size: 44,
        enableSorting: false,
        enableResizing: false,
        enableGrouping: false,
        enableHiding: false,
        header: () => <span className="sr-only">Open</span>,
        cell: ({ row }) =>
          row.getIsGrouped() ? null : (
            <button type="button" className="icon-btn row-open" aria-label="Open record" onClick={(e) => { e.stopPropagation(); onOpen(row.original); }}>
              <IconEdit size={15} />
            </button>
          ),
      });
    for (const c of columns)
      out.push({
        id: c.id,
        header: c.header,
        size: c.size ?? 150,
        minSize: 50,
        accessorFn: (row: T) => c.text(row),
        sortingFn: (a, b) => {
          const av = c.sortValue ? c.sortValue(a.original) : c.text(a.original).toLowerCase();
          const bv = c.sortValue ? c.sortValue(b.original) : c.text(b.original).toLowerCase();
          return av < bv ? -1 : av > bv ? 1 : 0;
        },
        filterFn: opFilter,
        cell: ({ row }) => (c.render ? c.render(row.original) : c.text(row.original)),
      });
    return out;
  }, [columns, selectable, onOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const globalFilter = [props.globalFilter ?? '', showSearch ? searchText : ''].filter((s) => s.trim()).join(' ');

  const table = useReactTable({
    data,
    columns: tableColumns,
    getRowId: (row) => getRowId(row),
    state: { sorting, columnFilters, grouping, columnVisibility, columnOrder, columnSizing, pagination, expanded, rowSelection, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGroupingChange: (updater) => {
      setGrouping(updater);
      setExpanded(true);
    },
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    onPaginationChange: setPagination,
    onExpandedChange: setExpanded,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: (row) => !row.getIsGrouped(),
    enableMultiSort: true,
    isMultiSortEvent: (e: any) => e.shiftKey,
    columnResizeMode: 'onChange',
    globalFilterFn: (row, _columnId, value: string) => {
      const terms = String(value).toLowerCase().split(/\s+/).filter(Boolean);
      const text = columns.map((c) => c.text(row.original)).join(' ').toLowerCase();
      return terms.every((t) => text.includes(t));
    },
    getColumnCanGlobalFilter: () => true,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
    // Groups open expanded and columns keep their places when grouping.
    autoResetExpanded: false,
    groupedColumnMode: false,
  });

  useEffect(() => {
    const ids = Object.keys(rowSelection).filter((k) => rowSelection[k]);
    onSelectionChange?.(ids);
  }, [rowSelection]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drop selections of rows that no longer exist (after delete/refresh).
  useEffect(() => {
    const ids = new Set(data.map(getRowId));
    setRowSelection((sel) => {
      const next = Object.fromEntries(Object.entries(sel).filter(([k]) => ids.has(k)));
      return Object.keys(next).length === Object.keys(sel).length ? sel : next;
    });
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const pages = table.getPageCount();
    if (pagination.pageIndex > 0 && pagination.pageIndex >= pages) setPagination((p) => ({ ...p, pageIndex: Math.max(0, pages - 1) }));
  }, [data.length, columnFilters, globalFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const dataColumns = table.getAllLeafColumns().filter((c) => !c.id.startsWith('__'));
  const orderedDataColumns = (columnOrder.length ? [...columnOrder.filter((id) => colById.has(id)), ...dataColumns.map((c) => c.id).filter((id) => !columnOrder.includes(id))] : dataColumns.map((c) => c.id));

  const resetLayout = () => {
    const d = defaults(props);
    setSorting(d.sorting);
    setColumnFilters([]);
    setGrouping([]);
    setColumnVisibility(d.columnVisibility);
    setColumnOrder([]);
    setColumnSizing({});
    setPagination({ pageIndex: 0, pageSize: 20 });
    setShowFilterRow(d.showFilterRow);
    setShowSearch(false);
    setShowGroupPanel(false);
    setShowFooter(false);
    setMenuFor(null);
    if (viewKey) api(`/me/view-settings/${encodeURIComponent(viewKey)}`, { method: 'DELETE' }).catch(() => undefined);
  };

  const moveColumn = (id: string, delta: number) => {
    const order = [...orderedDataColumns];
    const i = order.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    setColumnOrder(['__select', '__open', ...order]);
  };

  const exportRows = (format: ExportFormat) => {
    setExportOpen(false);
    const visible = table.getVisibleLeafColumns().map((c) => c.id).filter((id) => !id.startsWith('__'));
    const rows = table.getPrePaginationRowModel().flatRows.filter((r) => !r.getIsGrouped()).map((r) => r.id);
    props.onExport?.(format, visible, rows);
  };

  const filteredCount = table.getFilteredRowModel().rows.length;
  const pageCount = Math.max(1, table.getPageCount());
  const visibleCount = table.getVisibleLeafColumns().length;

  return (
    <div className={`grid ${compact ? 'grid-compact' : ''}`}>
      <div className="grid-toolbar">
        <div className="grid-toolbar-left">{props.toolbar}</div>
        <div className="grid-toolbar-right">
          {props.onExport && (
            <div className="popover-anchor">
              <button type="button" className="btn btn-ghost" onClick={() => setExportOpen((o) => !o)} aria-haspopup="menu">
                <IconExport size={15} /> Export to <IconChevronDown size={14} />
              </button>
              <Popover open={exportOpen} onClose={() => setExportOpen(false)} align="right">
                <MenuItem icon={<IconCsv size={15} />} onClick={() => exportRows('csv')}>CSV File</MenuItem>
                <MenuItem icon={<IconXlsx size={15} />} onClick={() => exportRows('xlsx')}>XLSX File</MenuItem>
                <MenuItem icon={<IconPdf size={15} />} onClick={() => exportRows('pdf')}>PDF File</MenuItem>
              </Popover>
            </div>
          )}
          <div className="popover-anchor">
            <button type="button" className="icon-btn" aria-label="Column chooser" title="Column chooser" onClick={() => setChooserOpen((o) => !o)}>
              <IconColumns size={16} />
            </button>
            <Popover open={chooserOpen} onClose={() => setChooserOpen(false)} align="right" className="chooser">
              <div className="chooser-title">Columns</div>
              {orderedDataColumns.map((id, i) => {
                const col = table.getColumn(id)!;
                return (
                  <div key={id} className="chooser-row">
                    <label>
                      <input type="checkbox" checked={col.getIsVisible()} onChange={col.getToggleVisibilityHandler()} /> {colById.get(id)?.header}
                    </label>
                    <span>
                      <button type="button" className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => moveColumn(id, -1)}>
                        <IconArrowUp size={13} />
                      </button>
                      <button type="button" className="icon-btn" aria-label="Move down" disabled={i === orderedDataColumns.length - 1} onClick={() => moveColumn(id, 1)}>
                        <IconArrowDown size={13} />
                      </button>
                    </span>
                  </div>
                );
              })}
              <div className="chooser-options">
                <label><input type="checkbox" checked={showFilterRow} onChange={(e) => setShowFilterRow(e.target.checked)} /> Filter row</label>
                <label><input type="checkbox" checked={showSearch} onChange={(e) => setShowSearch(e.target.checked)} /> Search panel</label>
                <label><input type="checkbox" checked={showGroupPanel} onChange={(e) => setShowGroupPanel(e.target.checked)} /> Group panel</label>
                <label><input type="checkbox" checked={showFooter} onChange={(e) => setShowFooter(e.target.checked)} /> Footer</label>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={resetLayout}>
                <IconReset size={14} /> Reset layout
              </button>
            </Popover>
          </div>
        </div>
      </div>

      {showSearch && (
        <div className="grid-search">
          <IconSearch size={15} />
          <input type="search" placeholder="Search in this list…" value={searchText} onChange={(e) => setSearchText(e.target.value)} aria-label="Search in this list" autoFocus />
          {searchText && (
            <button type="button" className="icon-btn" aria-label="Clear search" onClick={() => setSearchText('')}>
              <IconClose size={14} />
            </button>
          )}
        </div>
      )}

      {(showGroupPanel || grouping.length > 0) && (
        <div className="grid-group-panel">
          {grouping.length === 0 ? (
            <span className="muted">Use a column's menu → "Group by this column" to group rows.</span>
          ) : (
            <>
              <span className="muted">Grouped by</span>
              {grouping.map((g) => (
                <span key={g} className="chip">
                  {colById.get(g)?.header}
                  <button type="button" className="icon-btn" aria-label={`Ungroup ${colById.get(g)?.header}`} onClick={() => setGrouping((gs) => gs.filter((x) => x !== g))}>
                    <IconClose size={12} />
                  </button>
                </span>
              ))}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => table.toggleAllRowsExpanded(true)}>
                <IconExpandAll size={14} /> Expand all
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => table.toggleAllRowsExpanded(false)}>
                <IconCollapseAll size={14} /> Collapse all
              </button>
            </>
          )}
        </div>
      )}

      <div className="grid-scroll">
        <table className="grid-table" style={{ width: table.getTotalSize() }}>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const col = header.column;
                  const isData = !col.id.startsWith('__');
                  const sorted = col.getIsSorted();
                  const filter = col.getFilterValue() as { op: string; value: string } | undefined;
                  return (
                    <th key={header.id} style={{ width: header.getSize() }} className={isData ? 'th-data' : 'th-util'} aria-sort={sorted ? (sorted === 'asc' ? 'ascending' : 'descending') : undefined}>
                      {isData ? (
                        <div className="th-inner">
                          <button type="button" className="th-label" onClick={col.getToggleSortingHandler()} title="Click to sort, Shift+click to add a sort">
                            {flexRender(col.columnDef.header, header.getContext())}
                            {sorted && <span className="sort-ind">{sorted === 'asc' ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />}{sorting.length > 1 ? sorting.findIndex((s) => s.id === col.id) + 1 : ''}</span>}
                            {filter?.value && <IconFilter size={11} className="filter-ind" />}
                          </button>
                          <div className={`th-tools ${filterFor === col.id || menuFor === col.id ? 'open' : ''}`}>
                          <div className="popover-anchor">
                            <button type="button" className={`icon-btn th-btn ${filter?.value ? 'active' : ''}`} aria-label={`Filter ${colById.get(col.id)?.header}`} onClick={() => setFilterFor(filterFor === col.id ? null : col.id)}>
                              <IconFilter size={13} />
                            </button>
                            <ColumnFilterPopover open={filterFor === col.id} onClose={() => setFilterFor(null)} value={filter} onApply={(v) => { col.setFilterValue(v); setFilterFor(null); }} />
                          </div>
                          <div className="popover-anchor">
                            <button type="button" className="icon-btn th-btn" aria-label={`${colById.get(col.id)?.header} column menu`} onClick={() => setMenuFor(menuFor === col.id ? null : col.id)}>
                              <IconMenu size={13} />
                            </button>
                            <Popover open={menuFor === col.id} onClose={() => setMenuFor(null)} align="right">
                              <MenuItem icon={<IconSortAsc size={15} />} onClick={() => { col.toggleSorting(false); setMenuFor(null); }}>Sort Ascending</MenuItem>
                              <MenuItem icon={<IconSortDesc size={15} />} onClick={() => { col.toggleSorting(true); setMenuFor(null); }}>Sort Descending</MenuItem>
                              <MenuItem icon={<IconSortClear size={15} />} onClick={() => { col.clearSorting(); setMenuFor(null); }} disabled={!sorted}>Clear Sorting</MenuItem>
                              <hr />
                              {col.getIsGrouped() ? (
                                <MenuItem icon={<IconGroup size={15} />} onClick={() => { col.toggleGrouping(); setMenuFor(null); }}>Ungroup</MenuItem>
                              ) : (
                                <MenuItem icon={<IconGroup size={15} />} onClick={() => { col.toggleGrouping(); setMenuFor(null); }}>Group By This Column</MenuItem>
                              )}
                              <MenuItem icon={<IconHide size={15} />} onClick={() => { col.toggleVisibility(false); setMenuFor(null); }}>Hide Column</MenuItem>
                              <MenuItem icon={<IconColumns size={15} />} onClick={() => { setMenuFor(null); setChooserOpen(true); }}>Column Chooser…</MenuItem>
                              <hr />
                              <MenuItem icon={<IconFilter size={15} />} onClick={() => { setShowFilterRow((v) => !v); setMenuFor(null); }}>{showFilterRow ? 'Hide' : 'Show'} Filter Row</MenuItem>
                              <MenuItem icon={<IconSearch size={15} />} onClick={() => { setShowSearch((v) => !v); setMenuFor(null); }}>{showSearch ? 'Hide' : 'Show'} Search Panel</MenuItem>
                              <MenuItem icon={<IconGroup size={15} />} onClick={() => { setShowGroupPanel((v) => !v); setMenuFor(null); }}>{showGroupPanel ? 'Hide' : 'Show'} Group Panel</MenuItem>
                              <MenuItem icon={<IconFooter size={15} />} onClick={() => { setShowFooter((v) => !v); setMenuFor(null); }}>{showFooter ? 'Hide' : 'Show'} Footer</MenuItem>
                              <MenuItem icon={<IconFilterOff size={15} />} onClick={() => { col.setFilterValue(undefined); setMenuFor(null); }} disabled={!filter}>Clear Filter</MenuItem>
                              <hr />
                              <MenuItem icon={<IconReset size={15} />} onClick={resetLayout}>Reset Layout</MenuItem>
                            </Popover>
                          </div>
                          </div>
                        </div>
                      ) : (
                        flexRender(col.columnDef.header, header.getContext())
                      )}
                      {col.getCanResize() && <div className={`resizer ${col.getIsResizing() ? 'resizing' : ''}`} onMouseDown={header.getResizeHandler()} onTouchStart={header.getResizeHandler()} />}
                    </th>
                  );
                })}
              </tr>
            ))}
            {showFilterRow && (
              <tr className="filter-row">
                {table.getVisibleLeafColumns().map((col) => (
                  <th key={col.id}>
                    {!col.id.startsWith('__') && (
                      <input
                        type="text"
                        aria-label={`Filter ${colById.get(col.id)?.header}`}
                        value={(col.getFilterValue() as any)?.op === 'contains' ? (col.getFilterValue() as any).value : ''}
                        onChange={(e) => col.setFilterValue(e.target.value ? { op: 'contains', value: e.target.value } : undefined)}
                      />
                    )}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {props.loading && data.length === 0 ? (
              <tr>
                <td colSpan={visibleCount} className="grid-empty">Loading…</td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={visibleCount} className="grid-empty">
                  <IconEmpty size={18} />
                  <span>{props.emptyText ?? 'No data to display'}</span>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => {
                if (row.getIsGrouped()) {
                  const col = colById.get(row.groupingColumnId!);
                  return (
                    <tr key={row.id} className="group-row">
                      <td colSpan={visibleCount}>
                        <button type="button" className="group-toggle" onClick={row.getToggleExpandedHandler()} style={{ paddingLeft: row.depth * 18 }}>
                          {row.getIsExpanded() ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                          {col?.header}: <strong>{String(row.groupingValue ?? '') || '(blank)'}</strong> <span className="muted">({row.subRows.length})</span>
                        </button>
                      </td>
                    </tr>
                  );
                }
                const extra = rowClassName?.(row.original) ?? '';
                return (
                  <tr
                    key={row.id}
                    className={`${extra} ${row.getIsSelected() ? 'selected' : ''} ${onOpen ? 'clickable' : ''}`}
                    onDoubleClick={() => onOpen?.(row.original)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.target === e.currentTarget) onOpen?.(row.original);
                    }}
                    tabIndex={onOpen ? 0 : undefined}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className={cell.column.id.startsWith('__') ? 'td-util' : colById.get(cell.column.id)?.numeric ? 'num' : undefined}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
          {showFooter && (
            <tfoot>
              <tr>
                <td colSpan={visibleCount}>Count: {filteredCount}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="grid-pager">
        <span>
          Page {table.getState().pagination.pageIndex + 1} of {pageCount} ({filteredCount} {filteredCount === 1 ? 'item' : 'items'})
        </span>
        <span className="pager-buttons">
          <button type="button" className="icon-btn" aria-label="Previous page" title="Previous page" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
            <IconChevronLeft size={16} />
          </button>
          {Array.from({ length: pageCount }, (_, i) => i)
            .filter((i) => pageCount <= 7 || Math.abs(i - pagination.pageIndex) <= 2 || i === 0 || i === pageCount - 1)
            .map((i) => (
              <button key={i} type="button" className={`page-btn ${i === pagination.pageIndex ? 'current' : ''}`} onClick={() => table.setPageIndex(i)} aria-current={i === pagination.pageIndex ? 'page' : undefined}>
                {i + 1}
              </button>
            ))}
          <button type="button" className="icon-btn" aria-label="Next page" title="Next page" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
            <IconChevronRight size={16} />
          </button>
        </span>
        <label className="page-size">
          Page size:
          <select value={pagination.pageSize} onChange={(e) => setPagination({ pageIndex: 0, pageSize: Number(e.target.value) })}>
            {[10, 20, 50, 100, 200].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function ColumnFilterPopover({ open, onClose, value, onApply }: { open: boolean; onClose: () => void; value?: { op: string; value: string }; onApply: (v: { op: string; value: string } | undefined) => void }) {
  const [op, setOp] = useState(value?.op ?? 'contains');
  const [text, setText] = useState(value?.value ?? '');
  useEffect(() => {
    if (open) {
      setOp(value?.op ?? 'contains');
      setText(value?.value ?? '');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Popover open={open} onClose={onClose} className="filter-pop">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onApply(text.trim() ? { op, value: text } : undefined);
        }}
      >
        <select value={op} onChange={(e) => setOp(e.target.value)} aria-label="Filter operator">
          {OPERATORS.map((o) => (
            <option key={o.op} value={o.op}>{o.label}</option>
          ))}
        </select>
        <input type="text" value={text} onChange={(e) => setText(e.target.value)} aria-label="Filter value" autoFocus />
        <div className="filter-actions">
          <button type="button" className="btn btn-sm" onClick={() => onApply(undefined)}>
            <IconFilterOff size={14} /> Clear
          </button>
          <button type="submit" className="btn btn-sm btn-primary">
            <IconCheck size={14} /> Apply
          </button>
        </div>
      </form>
    </Popover>
  );
}
