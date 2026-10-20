import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { n2 } from '@aqualims/shared';
import { api } from '../api/client';
import { Modal } from '../components/Modal';
import { EntityIcon, IconCancel, IconCheck, IconEmpty } from '../components/Icons';
import { useToast } from '../components/Toast';
import { newRowKey, type ChildRow } from './FormContext';

interface SourceSpecies {
  _id: string;
  speciesName: string;
  commonName?: string;
  active?: boolean;
  limitCount: number;
}

interface SourceLimit {
  _id: string;
  parameterId: string;
  parameter: string;
  unitId: string | null;
  unit: string;
  lcl: number;
  ucl: number;
  optimalValue: number;
  notes: string | null;
}

// "Copy Parameter Limits": pick another species, tick its limits, copy them as unsaved rows.
export function CopyFromSpeciesDialog({
  speciesId,
  existingParameterIds,
  level,
  onClose,
  onCopy,
}: {
  speciesId: string | null;
  existingParameterIds: string[];
  level: number;
  onClose: () => void;
  onCopy: (rows: ChildRow[]) => void;
}) {
  const toast = useToast();
  const [sourceId, setSourceId] = useState('');
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const sources = useQuery({ queryKey: ['copy-sources', speciesId ?? 'new'], queryFn: () => api<SourceSpecies[]>(`/species/${speciesId ?? 'new'}/copy-sources`) });
  const limits = useQuery({
    queryKey: ['species-limits', sourceId],
    queryFn: () => api<SourceLimit[]>(`/species/${sourceId}/limits`),
    enabled: Boolean(sourceId),
  });
  const rows = useMemo(() => limits.data ?? [], [limits.data]);
  const allTicked = rows.length > 0 && rows.every((r) => ticked.has(r._id));

  const copy = () => {
    if (!sourceId) {
      onClose();
      return;
    }
    const existing = new Set(existingParameterIds);
    const added: ChildRow[] = [];
    let skipped = 0;
    for (const r of rows.filter((x) => ticked.has(x._id))) {
      if (existing.has(r.parameterId)) {
        skipped++;
        continue;
      }
      existing.add(r.parameterId);
      added.push({
        _key: newRowKey(),
        parameterId: r.parameterId,
        unitId: r.unitId,
        lcl: r.lcl,
        ucl: r.ucl,
        optimalValue: r.optimalValue,
        notes: r.notes,
        active: true,
        _labels: { parameterId: r.parameter, unitId: r.unit },
      });
    }
    let message = `${added.length} ${added.length === 1 ? 'parameter copied' : 'parameters copied'}`;
    if (skipped > 0) message += `, ${skipped} skipped (already defined for this species)`;
    message += '. Review the values and Save.';
    toast(message, added.length > 0 ? 'success' : 'warning', 4000);
    onCopy(added);
  };

  return (
    <Modal
      title="Copy Parameter Limits"
      icon={<EntityIcon name="BO_ParameterLimitImport" size={17} variant="tile" />}
      width={680}
      level={level}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            <IconCancel size={15} /> Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={copy} disabled={Boolean(sourceId) && ticked.size === 0}>
            <IconCheck size={15} /> OK
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="copy-source" className="field-label">
          Copy From Species
        </label>
        <select
          id="copy-source"
          className="input"
          value={sourceId}
          onChange={(e) => {
            setSourceId(e.target.value);
            setTicked(new Set());
          }}
        >
          <option value="">{sources.isLoading ? 'Loading…' : 'Select a species'}</option>
          {(sources.data ?? []).map((s) => (
            <option key={s._id} value={s._id}>
              {s.speciesName}
              {s.commonName ? ` (${s.commonName})` : ''} — {s.limitCount} {s.limitCount === 1 ? 'limit' : 'limits'}
            </option>
          ))}
        </select>
      </div>
      <h3 className="section-title">
        <EntityIcon name="BO_SpeciesParameterLimit" size={14} /> Parameter Limits
      </h3>
      <div className="grid-scroll">
        <table className="grid-table inline">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input type="checkbox" aria-label="Select all limits" checked={allTicked} disabled={rows.length === 0} onChange={() => setTicked(allTicked ? new Set() : new Set(rows.map((r) => r._id)))} />
              </th>
              <th>Parameter</th>
              <th className="num">LCL</th>
              <th className="num">UCL</th>
              <th className="num">Ideal</th>
              <th>Unit</th>
            </tr>
          </thead>
          <tbody>
            {!sourceId ? (
              <tr>
                <td colSpan={6} className="grid-empty"><IconEmpty size={18} /><span>Choose a species to see its limits.</span></td>
              </tr>
            ) : limits.isLoading ? (
              <tr>
                <td colSpan={6} className="grid-empty">Loading…</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r._id} className={existingParameterIds.includes(r.parameterId) ? 'muted-row' : undefined}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.parameter}`}
                      checked={ticked.has(r._id)}
                      onChange={() =>
                        setTicked((s) => {
                          const next = new Set(s);
                          if (next.has(r._id)) next.delete(r._id);
                          else next.add(r._id);
                          return next;
                        })
                      }
                    />
                  </td>
                  <td>
                    {r.parameter}
                    {existingParameterIds.includes(r.parameterId) && <span className="muted"> (already defined)</span>}
                  </td>
                  <td className="num">{n2(r.lcl)}</td>
                  <td className="num">{n2(r.ucl)}</td>
                  <td className="num">{n2(r.optimalValue)}</td>
                  <td>{r.unit}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
