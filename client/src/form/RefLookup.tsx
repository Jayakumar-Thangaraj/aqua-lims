import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ENTITIES, enumCaption, formCaption, type FieldDef } from '@aqualims/shared';
import { useAuth } from '../auth/AuthContext';
import { IconChevronDown, IconClose, IconPlus } from '../components/Icons';
import { useLookup, type LookupItem } from '../lib/lookups';
import { EntityFormModal } from './EntityFormModal';

interface Props {
  fd: FieldDef;
  value: string | null;
  label?: string;
  inactive?: boolean;
  onChange: (id: string | null, label?: string, item?: LookupItem) => void;
  error?: string;
  compact?: boolean;
  level?: number;
  id?: string;
  autoFocus?: boolean;
}

// Searchable dropdown with clear (×) and create-new (+) buttons, like XAF's lookup editor.
// The option list is portalled to <body> with fixed positioning so grids and modals don't clip it.
export function RefLookup({ fd, value, label, inactive, onChange, error, compact, level = 0, id, autoFocus }: Props) {
  const target = ENTITIES[fd.ref!];
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { data: items = [], isLoading } = useLookup(fd.ref!, fd.refLabel);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const caption = formCaption(fd);

  const selected = items.find((i) => i._id === value);
  const shownLabel = selected?.label ?? label ?? '';
  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => [i.label, ...Object.values(i.columns)].some((s) => s.toLowerCase().includes(q)));
  }, [items, text]);

  // The list floats above everything (grids and modals clip absolutely positioned children).
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom - 8;
      const above = r.top - 8;
      const maxHeight = Math.min(260, Math.max(below, above));
      const top = below >= Math.min(160, maxHeight) || below >= above ? r.bottom + 2 : r.top - 2 - maxHeight;
      setPos({ top, left: r.left, width: r.width, maxHeight });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (item: LookupItem | null) => {
    onChange(item?._id ?? null, item?.label ?? '', item ?? undefined);
    setOpen(false);
    setText('');
  };

  const extraText = (item: LookupItem) => {
    if (fd.ref === 'waterPreparation' && item.status) return enumCaption('WaterPreparationStatus', item.status);
    const cols = target.lookup?.columns?.filter((c) => c !== (fd.refLabel ?? target.displayField)) ?? [];
    return cols.map((c) => item.columns[c]).filter(Boolean).join(' · ');
  };

  const canCreate = can(fd.ref!, 'create');
  const showInactive = (selected?.inactive ?? inactive) && !target.lookup?.activeOnly;

  return (
    <div ref={wrapRef} className={`lookup ${compact ? 'compact' : ''} ${error ? 'invalid' : ''}`}>
      <div className="lookup-control">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-label={compact ? caption : undefined}
          aria-invalid={Boolean(error)}
          className="lookup-input"
          placeholder={shownLabel ? undefined : fd.placeholder ?? 'Select…'}
          value={open ? text : shownLabel + (showInactive ? ' (inactive)' : '')}
          autoFocus={autoFocus}
          onFocus={() => {
            setOpen(true);
            setText('');
            setActive(Math.max(0, items.findIndex((i) => i._id === value)));
          }}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(filtered.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter' && open) {
              e.preventDefault();
              if (filtered[active]) choose(filtered[active]);
            } else if (e.key === 'Escape' && open) {
              e.stopPropagation();
              setOpen(false);
            } else if (e.key === 'Tab') setOpen(false);
          }}
        />
        {value && (
          <button type="button" className="icon-btn lookup-btn" aria-label={`Clear ${caption}`} title="Clear" onClick={() => choose(null)}>
            <IconClose size={13} />
          </button>
        )}
        {!compact && canCreate && fd.ref !== 'waterPreparation' && (
          <button type="button" className="icon-btn lookup-btn" aria-label={`New ${target.caption}`} title={`New ${target.caption}`} onClick={() => setCreating(true)}>
            <IconPlus size={14} />
          </button>
        )}
        <button type="button" className="icon-btn lookup-btn" tabIndex={-1} aria-label={`Show ${caption} options`} onClick={() => setOpen((o) => !o)}>
          <IconChevronDown size={14} />
        </button>
      </div>
      {open && pos && createPortal(
        <ul
          ref={listRef}
          className="lookup-list"
          role="listbox"
          style={{ top: pos.top, left: pos.left, minWidth: Math.max(pos.width, 200), maxHeight: pos.maxHeight }}
        >
          {isLoading && <li className="lookup-empty">Loading…</li>}
          {!isLoading && filtered.length === 0 && <li className="lookup-empty">No matches</li>}
          {filtered.map((item, index) => (
            <li
              key={item._id}
              data-index={index}
              role="option"
              aria-selected={item._id === value}
              className={`lookup-option ${index === active ? 'active' : ''} ${item._id === value ? 'selected' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(item);
              }}
              onMouseEnter={() => setActive(index)}
            >
              <span>{item.label || <span className="muted">(no name)</span>}</span>
              <span className="lookup-extra">
                {extraText(item)}
                {item.inactive && ' (inactive)'}
              </span>
            </li>
          ))}
        </ul>,
        document.body,
      )}
      {creating && (
        <EntityFormModal
          def={target}
          recordId="new"
          level={level + 1}
          onClose={(saved) => {
            setCreating(false);
            if (saved) {
              queryClient.invalidateQueries({ queryKey: ['lookup', fd.ref] });
              const labelField = fd.refLabel ?? target.displayField;
              onChange(saved._id, saved[labelField] ?? saved._display ?? '');
            }
          }}
        />
      )}
    </div>
  );
}
