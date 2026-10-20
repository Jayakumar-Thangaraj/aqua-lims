import { useEffect, useId, useState } from 'react';
import { enumOptions, formCaption, formatDate, n2, type FieldDef } from '@aqualims/shared';
import { IconInfo } from '../components/Icons';
import { RefLookup } from './RefLookup';

export interface EditorProps {
  fd: FieldDef;
  value: any;
  onChange: (value: any, label?: string, extra?: any) => void;
  label?: string;
  error?: string;
  readOnly?: boolean;
  compact?: boolean;
  level?: number;
  id?: string;
  inactive?: boolean;
  autoFocus?: boolean;
}

function toDateInput(value: any): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Changing the date keeps the stored time of day (XAF shows date only but stores the timestamp).
function fromDateInput(text: string, previous: any): string | null {
  if (!text) return null;
  const [y, m, d] = text.split('-').map(Number);
  const base = previous ? new Date(previous) : new Date();
  const next = Number.isNaN(base.getTime()) ? new Date() : base;
  next.setFullYear(y, m - 1, d);
  return next.toISOString();
}

export function NumberInput({ value, onChange, id, error, readOnly, integer, ariaLabel, autoFocus }: { value: any; onChange: (v: any) => void; id?: string; error?: string; readOnly?: boolean; integer?: boolean; ariaLabel?: string; autoFocus?: boolean }) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState('');
  useEffect(() => {
    if (!focused) setText(value === null || value === undefined || value === '' ? '' : String(value));
  }, [value, focused]);
  const shown = focused ? text : value === null || value === undefined || value === '' ? '' : integer ? String(value) : n2(Number(value));
  return (
    <input
      id={id}
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      className={`input num ${error ? 'invalid' : ''}`}
      value={shown}
      readOnly={readOnly}
      aria-label={ariaLabel}
      aria-invalid={Boolean(error)}
      autoFocus={autoFocus}
      onFocus={() => {
        setFocused(true);
        setText(value === null || value === undefined ? '' : String(value));
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setText(e.target.value);
        const raw = e.target.value.replace(/,/g, '').trim();
        if (raw === '') onChange(null);
        else if (!Number.isNaN(Number(raw))) onChange(Number(raw));
        else onChange(e.target.value);
      }}
    />
  );
}

export function Toggle({ checked, onChange, id, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; id?: string; disabled?: boolean; label: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? 'on' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="knob" />
    </button>
  );
}

// The input control alone (no caption) - used by forms and inline grid cells.
export function EditorControl({ fd, value, onChange, label, error, readOnly, compact, level = 0, id, inactive, autoFocus }: EditorProps) {
  const caption = formCaption(fd);
  if (readOnly || fd.readOnly || fd.system) {
    let text = '';
    if (fd.type === 'date') text = formatDate(value);
    else if (fd.type === 'number') text = value === null || value === undefined ? '' : n2(Number(value));
    else if (fd.type === 'ref') text = label ?? '';
    else if (fd.type === 'boolean') return <Toggle checked={Boolean(value)} onChange={() => undefined} disabled label={caption} />;
    else if (fd.type === 'enum') text = enumOptions(fd.enumName!).find((o) => o.key === value)?.caption ?? '';
    else text = value ?? '';
    return (
      <div className={`readonly-value ${compact ? 'compact' : ''}`} id={id}>
        {text || <span className="muted">—</span>}
      </div>
    );
  }
  switch (fd.type) {
    case 'string':
      return (
        <input
          id={id}
          type="text"
          className={`input ${error ? 'invalid' : ''}`}
          value={value ?? ''}
          maxLength={fd.maxLength}
          placeholder={fd.placeholder}
          aria-label={compact ? caption : undefined}
          aria-invalid={Boolean(error)}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'text':
      return compact ? (
        <input id={id} type="text" className={`input ${error ? 'invalid' : ''}`} value={value ?? ''} maxLength={fd.maxLength} aria-label={caption} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <textarea
          id={id}
          className={`input textarea ${error ? 'invalid' : ''}`}
          rows={fd.rows ?? 3}
          value={value ?? ''}
          maxLength={fd.maxLength}
          placeholder={fd.placeholder}
          aria-invalid={Boolean(error)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'number':
    case 'integer':
      return <NumberInput id={id} value={value} onChange={onChange} error={error} integer={fd.type === 'integer'} ariaLabel={compact ? caption : undefined} autoFocus={autoFocus} />;
    case 'boolean':
      return <Toggle id={id} checked={Boolean(value)} onChange={onChange} label={caption} />;
    case 'date':
      return (
        <input
          id={id}
          type="date"
          className={`input ${error ? 'invalid' : ''}`}
          value={toDateInput(value)}
          aria-label={compact ? caption : undefined}
          onChange={(e) => onChange(fromDateInput(e.target.value, value))}
        />
      );
    case 'enum':
      return (
        <select id={id} className={`input ${error ? 'invalid' : ''}`} value={value ?? ''} aria-label={compact || fd.hideCaption ? caption : undefined} onChange={(e) => onChange(e.target.value || null)}>
          {!fd.defaultValue && <option value="">Select…</option>}
          {enumOptions(fd.enumName!).map((o) => (
            <option key={o.key} value={o.key}>
              {o.caption}
            </option>
          ))}
        </select>
      );
    case 'ref':
      return (
        <RefLookup
          id={id}
          fd={fd}
          value={value}
          label={label}
          inactive={inactive}
          error={error}
          compact={compact}
          level={level}
          autoFocus={autoFocus}
          onChange={(id2, label2, item) => onChange(id2, label2, item)}
        />
      );
  }
}

// Caption above the control, required mark, tooltip and error text.
export function FieldEditor(props: EditorProps) {
  const autoId = useId();
  const id = props.id ?? autoId;
  const { fd, error } = props;
  const caption = formCaption(fd);
  const required = fd.required && !fd.readOnly && !fd.system;
  return (
    <div className={`field field-${fd.type} ${error ? 'has-error' : ''}`}>
      {!fd.hideCaption && (
        <label htmlFor={id} className="field-label">
          {caption}
          {required && <span className="req" aria-hidden> *</span>}
          {fd.tooltip && (
            <span className="tip" title={fd.tooltip} aria-label={fd.tooltip}>
              <IconInfo size={13} />
            </span>
          )}
        </label>
      )}
      <EditorControl {...props} id={id} />
      {error && (
        <div className="field-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
