import { columnCaption, displayValue, getComputed, getField, sortValue, type EntityDef, type ListColumnDef } from '@aqualims/shared';
import { HealthBadge, ResultStatusBadge } from '../components/Icons';
import type { GridColumn } from './DataGrid';

export function ToggleDisplay({ on }: { on: boolean }) {
  return (
    <span className={`switch switch-static ${on ? 'on' : ''}`} role="img" aria-label={on ? 'Yes' : 'No'}>
      <span className="knob" />
    </span>
  );
}

export function entityColumns(def: EntityDef, columns: ListColumnDef[]): GridColumn<any>[] {
  return columns.map((c) => {
    const fd = getField(def, c.field);
    const cd = getComputed(def, c.field);
    const numeric = fd?.type === 'number' || fd?.type === 'integer';
    const header = columnCaption(def, c.field);
    const preferred = c.width ?? (fd?.type === 'boolean' ? 80 : numeric ? 110 : 160);
    const col: GridColumn<any> = {
      id: c.field,
      header,
      // Wide enough for the caption plus the sort indicator.
      size: Math.max(preferred, header.length * 8 + 40),
      hidden: c.hidden,
      numeric,
      text: (row) => displayValue(def, row, c.field),
      sortValue: (row) => sortValue(def, row, c.field),
    };
    if (fd?.type === 'boolean') col.render = (row) => <ToggleDisplay on={Boolean(row[c.field])} />;
    if (fd?.type === 'ref') col.render = (row) => (
      <>
        {displayValue(def, row, c.field)}
        {row._inactive?.[c.field] && <span className="muted"> (inactive)</span>}
      </>
    );
    if (cd?.kind === 'resultStatus') col.render = (row) => <ResultStatusBadge status={row[c.field]} />;
    if (cd?.kind === 'healthLevel') col.render = (row) => <HealthBadge level={row[c.field]} />;
    if (fd?.type === 'text') col.render = (row) => <span className="cell-clip" title={row[c.field] ?? ''}>{row[c.field] ?? ''}</span>;
    return col;
  });
}
