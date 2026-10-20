import { enumCaption } from './enums';
import { getComputed, getField, type EntityDef } from './entities';
import { formatDate, n2 } from './format';

// Text shown for a field or computed column of a row (grids, exports, search, filters).
export function displayValue(def: EntityDef, row: any, name: string): string {
  const fd = getField(def, name);
  if (fd) {
    const value = row?.[name];
    switch (fd.type) {
      case 'ref':
        return row?._labels?.[name] ?? '';
      case 'enum':
        return enumCaption(fd.enumName!, value);
      case 'number':
        return value === null || value === undefined || value === '' ? '' : n2(Number(value));
      case 'integer':
        return value === null || value === undefined ? '' : String(value);
      case 'date':
        return formatDate(value);
      case 'boolean':
        return value ? 'Yes' : 'No';
      default:
        return value === null || value === undefined ? '' : String(value);
    }
  }
  const cd = getComputed(def, name);
  if (cd?.kind === 'resultStatus') return enumCaption('ResultStatus', row?.[name]);
  if (cd?.kind === 'healthLevel') return enumCaption('TankHealthLevel', row?.[name]);
  return row?.[name] === null || row?.[name] === undefined ? '' : String(row[name]);
}

// Typed value used for sorting.
export function sortValue(def: EntityDef, row: any, name: string): string | number {
  const fd = getField(def, name);
  if (fd && (fd.type === 'number' || fd.type === 'integer')) {
    const v = row?.[name];
    return v === null || v === undefined || v === '' ? Number.NEGATIVE_INFINITY : Number(v);
  }
  if (fd?.type === 'date') return row?.[name] ? new Date(row[name]).getTime() : 0;
  if (fd?.type === 'boolean') return row?.[name] ? 1 : 0;
  return displayValue(def, row, name).toLowerCase();
}
