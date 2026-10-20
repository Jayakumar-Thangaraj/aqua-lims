import { useEffect, useMemo, useState } from 'react';
import {
  ENTITIES,
  columnCaption,
  defaultValues,
  displayValue,
  getComputed,
  getField,
  type ChildDef,
} from '@aqualims/shared';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { IconCopy, IconEmpty, IconExport, IconPlus, IconTrash, ResultStatusBadge, IconWarning } from '../components/Icons';
import { useLookup } from '../lib/lookups';
import { CopyFromSpeciesDialog } from './CopyFromSpeciesDialog';
import { EditorControl } from './FieldEditor';
import { newRowKey, useForm, type ChildRow } from './FormContext';

const RESULT_ENTITIES = new Set(['sampleParameter', 'tankReadingParameter']);
const AUTOFILL_ALWAYS = new Set(['speciesParameterLimit']);
const AUTOFILL_WHEN_EMPTY = new Set(['sampleParameter', 'tankReadingParameter', 'waterPrepReading']);

function downloadCsv(name: string, header: string[], rows: string[][]) {
  const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const text = '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Child rows edited in place and saved together with the parent (one Save, no per-grid save bar).
export function InlineChildGrid({ child }: { child: ChildDef }) {
  const form = useForm();
  const { can } = useAuth();
  const cdef = ENTITIES[child.entity];
  const rows = form.children[child.name] ?? [];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copyOpen, setCopyOpen] = useState(false);
  const parameters = useLookup('parameter', undefined, getField(cdef, 'parameterId') !== undefined);
  const units = useLookup('unit', 'unitSymbol', getField(cdef, 'unitId') !== undefined);
  const evaluate = RESULT_ENTITIES.has(cdef.key);
  const tankId = form.values.tankId ?? null;
  const editable = can(cdef.key, 'write') || can(cdef.key, 'create');

  const setRows = (update: (rows: ChildRow[]) => ChildRow[]) => form.setChildRows(child.name, update);

  const updateCell = (key: string, field: string, value: any, label?: string) => {
    setRows((current) =>
      current.map((r) => {
        if (r._key !== key) return r;
        const next: ChildRow = { ...r, [field]: value, _labels: { ...(r._labels ?? {}) } };
        if (label !== undefined) next._labels![field] = label;
        // Parameter -> Unit auto-fill (always for species limits, only when empty elsewhere).
        if (field === 'parameterId' && getField(cdef, 'unitId')) {
          const param = parameters.data?.find((p) => p._id === value);
          const shouldFill = AUTOFILL_ALWAYS.has(cdef.key) || (AUTOFILL_WHEN_EMPTY.has(cdef.key) && !r.unitId);
          if (shouldFill) {
            next.unitId = param?.defaultUnitId ?? (AUTOFILL_ALWAYS.has(cdef.key) ? null : r.unitId);
            next._labels!.unitId = units.data?.find((u) => u._id === next.unitId)?.label ?? '';
          }
        }
        return next;
      }),
    );
  };

  // Live Limit / Status for result rows, from the tank selected on the parent form.
  const evalKey = evaluate ? JSON.stringify([tankId, rows.map((r) => [r.parameterId ?? null, r.measuredValue ?? null])]) : '';
  useEffect(() => {
    if (!evaluate) return;
    const controller = new AbortController();
    const t = setTimeout(() => {
      const payload = rows.map((r) => ({ parameterId: r.parameterId, measuredValue: r.measuredValue }));
      api<any[]>('/limits/evaluate', { method: 'POST', body: { tankId, rows: payload }, signal: controller.signal })
        .then((results) =>
          setRows((current) =>
            current.map((r, i) =>
              results[i] ? { ...r, limitRange: results[i].limitRange, resultStatus: results[i].resultStatus, isOutOfRange: results[i].isOutOfRange } : r,
            ),
          ),
        )
        .catch(() => undefined);
    }, 300);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [evalKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const addRow = () => {
    const row: ChildRow = { _key: newRowKey(), ...defaultValues(cdef), _labels: {} };
    delete row[child.foreignKey];
    if (evaluate) Object.assign(row, { limitRange: '', resultStatus: 'NoLimit', isOutOfRange: false });
    setRows((current) => [row, ...current]);
  };

  const deleteSelected = () => {
    setRows((current) => current.filter((r) => !selected.has(r._key)));
    setSelected(new Set());
  };

  const columns = child.columns;
  const rowErrors = useMemo(() => {
    const out: { index: number; message: string }[] = [];
    const prefix = `children.${child.name}.`;
    for (const [path, message] of Object.entries(form.errors)) {
      if (!path.startsWith(prefix)) continue;
      const index = Number(path.slice(prefix.length).split('.')[0]);
      out.push({ index, message });
    }
    return out.sort((a, b) => a.index - b.index);
  }, [form.errors, child.name]);

  const exportRows = () =>
    downloadCsv(
      `${form.def.apiPath}-${child.name}`,
      columns.map((c) => columnCaption(cdef, c.field)),
      rows.map((r) => columns.map((c) => displayValue(cdef, r, c.field))),
    );

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r._key));

  return (
    <div className="child-grid">
      <div className="grid-toolbar">
        <div className="grid-toolbar-left">
          {can(cdef.key, 'create') && (
            <button type="button" className="btn btn-ghost" onClick={addRow}>
              <IconPlus size={15} /> {child.newCaption ?? 'New'}
            </button>
          )}
          {child.copyFromSpecies && can(cdef.key, 'create') && (
            <button type="button" className="btn btn-ghost" title="Copy parameter limits from another species" onClick={() => setCopyOpen(true)}>
              <IconCopy size={15} /> Copy from Species
            </button>
          )}
          {can(cdef.key, 'delete') && (
            <button type="button" className="btn btn-ghost" disabled={selected.size === 0} onClick={deleteSelected}>
              <IconTrash size={15} /> Delete
            </button>
          )}
        </div>
        <div className="grid-toolbar-right">
          <button type="button" className="btn btn-ghost" onClick={exportRows} disabled={rows.length === 0}>
            <IconExport size={15} /> Export to CSV
          </button>
        </div>
      </div>
      <div className="grid-scroll">
        <table className="grid-table inline">
          <thead>
            <tr>
              <th className="th-util" style={{ width: 36 }}>
                <input
                  type="checkbox"
                  aria-label="Select all rows"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r._key)))}
                />
              </th>
              {columns.map((c) => (
                <th key={c.field} style={{ width: c.width }} className="th-data">
                  <span className="th-static">
                    {columnCaption(cdef, c.field)}
                    {getField(cdef, c.field)?.required && <span className="req" aria-hidden> *</span>}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="grid-empty">
                  <IconEmpty size={18} />
                  <span>{child.emptyText ?? 'No data to display'}</span>
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={row._key} className={`${row.isOutOfRange ? 'out-of-range' : ''} ${!row._id ? 'new-row' : ''}`}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select row ${index + 1}`}
                      checked={selected.has(row._key)}
                      onChange={() =>
                        setSelected((s) => {
                          const next = new Set(s);
                          if (next.has(row._key)) next.delete(row._key);
                          else next.add(row._key);
                          return next;
                        })
                      }
                    />
                  </td>
                  {columns.map((c) => {
                    const fd = getField(cdef, c.field);
                    const cd = getComputed(cdef, c.field);
                    const error = form.errors[`children.${child.name}.${index}.${c.field}`];
                    if (cd)
                      return (
                        <td key={c.field} className="computed">
                          {cd.kind === 'resultStatus' ? <ResultStatusBadge status={row[c.field]} /> : row[c.field] ?? ''}
                        </td>
                      );
                    return (
                      <td key={c.field} className={error ? 'cell-error' : undefined} title={error}>
                        <EditorControl
                          fd={fd!}
                          compact
                          value={row[c.field]}
                          label={row._labels?.[c.field]}
                          inactive={row._inactive?.[c.field]}
                          error={error}
                          level={form.level}
                          readOnly={!editable}
                          autoFocus={!row._id && index === 0 && c === columns[0] && !row[c.field]}
                          onChange={(value, label) => {
                            updateCell(row._key, c.field, value, label);
                            if (error) form.clearError(`children.${child.name}.${index}.${c.field}`);
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {rowErrors.length > 0 && (
        <ul className="grid-errors" role="alert">
          {rowErrors.map((e, i) => (
            <li key={i}>
              <IconWarning size={13} /> Row {e.index + 1}: {e.message}
            </li>
          ))}
        </ul>
      )}
      {copyOpen && (
        <CopyFromSpeciesDialog
          speciesId={form.recordId}
          existingParameterIds={rows.map((r) => r.parameterId).filter(Boolean)}
          level={form.level + 1}
          onClose={() => setCopyOpen(false)}
          onCopy={(newRows) => {
            setRows((current) => [...newRows, ...current]);
            setCopyOpen(false);
          }}
        />
      )}
    </div>
  );
}
