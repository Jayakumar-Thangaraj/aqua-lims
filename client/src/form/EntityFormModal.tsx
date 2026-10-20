import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ENTITIES, cascadeChildren, dataFields, defaultValues, getField, type EntityDef } from '@aqualims/shared';
import { ApiError, api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { EntityIcon, IconCancel, IconDetails, IconError, IconHistory, IconSave, IconUndo } from '../components/Icons';
import { Callout, ConfirmDialog, Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { FormContext, newRowKey, type ChildRow, type FormApi } from './FormContext';
import { Toggle } from './FieldEditor';
import { FormBody } from './FormRenderer';
import { HistoryPanel } from './HistoryPanel';

interface Props {
  def: EntityDef;
  recordId: string;
  initialValues?: Record<string, any>;
  lockedFields?: string[];
  level?: number;
  onClose: (saved?: any) => void;
}

function payloadOf(def: EntityDef, values: Record<string, any>, children: Record<string, ChildRow[]>) {
  const payload: Record<string, any> = {};
  for (const fd of dataFields(def)) {
    if (def.code && fd.name === def.code.field) continue;
    payload[fd.name] = values[fd.name] ?? null;
  }
  const kids: Record<string, any[]> = {};
  for (const child of cascadeChildren(def)) {
    const cdef = ENTITIES[child.entity];
    kids[child.name] = (children[child.name] ?? []).map((row) => {
      const out: Record<string, any> = {};
      if (row._id) out._id = row._id;
      for (const fd of dataFields(cdef)) if (fd.name !== child.foreignKey) out[fd.name] = row[fd.name] ?? null;
      return out;
    });
  }
  payload.children = kids;
  return payload;
}

function toRows(rows: any[] = []): ChildRow[] {
  return rows.map((r) => ({ ...r, _key: r._id ?? newRowKey() }));
}

export function EntityFormModal({ def, recordId, initialValues, lockedFields, level = 0, onClose }: Props) {
  const isNew = recordId === 'new';
  const { can, isAdmin } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [record, setRecord] = useState<any>(null);
  const [values, setValues] = useState<Record<string, any>>({});
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [children, setChildren] = useState<Record<string, ChildRow[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [extras, setExtras] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [view, setView] = useState<'details' | 'history'>('details');
  const [preview, setPreview] = useState<string | null>(null);
  const snapshot = useRef<string>('');

  const applyRecord = useCallback(
    (rec: any) => {
      setRecord(rec);
      const v: Record<string, any> = {};
      for (const fd of def.fields) v[fd.name] = rec[fd.name] ?? (fd.type === 'boolean' ? false : null);
      setValues(v);
      setLabels(rec._labels ?? {});
      const kids: Record<string, ChildRow[]> = {};
      for (const child of cascadeChildren(def)) kids[child.name] = toRows(rec.children?.[child.name]);
      setChildren(kids);
      snapshot.current = JSON.stringify(payloadOf(def, v, kids));
    },
    [def],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        if (isNew) {
          const v: Record<string, any> = defaultValues(def);
          const l: Record<string, string> = {};
          for (const [k, val] of Object.entries(initialValues ?? {})) {
            if (k.startsWith('__label_')) l[k.slice(8)] = val;
            else v[k] = val;
          }
          const kids: Record<string, ChildRow[]> = {};
          for (const child of cascadeChildren(def)) kids[child.name] = [];
          if (def.code) {
            const { code } = await api<{ code: string }>(`/${def.apiPath}/next-code`).catch(() => ({ code: '' }));
            v[def.code.field] = code;
            setPreview(code);
          }
          if (cancelled) return;
          setRecord(null);
          setValues(v);
          setLabels(l);
          setChildren(kids);
          snapshot.current = JSON.stringify(payloadOf(def, v, kids));
        } else {
          const rec = await api(`/${def.apiPath}/${recordId}`);
          if (cancelled) return;
          applyRecord(rec);
        }
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message ?? 'Could not load the record.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [def, recordId]); // eslint-disable-line react-hooks/exhaustive-deps

  const payload = useMemo(() => payloadOf(def, values, children), [def, values, children]);
  const dirty = !loading && JSON.stringify(payload) !== snapshot.current;
  const canSave = isNew ? can(def.key, 'create') : can(def.key, 'write');

  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);

  const formApi: FormApi = {
    def,
    values,
    labels,
    setValue: (name, value, label) => {
      setValues((v) => ({ ...v, [name]: value }));
      if (label !== undefined) setLabels((l) => ({ ...l, [name]: label }));
      setErrors((e) => {
        if (!e[name]) return e;
        const next = { ...e };
        delete next[name];
        return next;
      });
    },
    children,
    setChildRows: (name, update) => setChildren((c) => ({ ...c, [name]: typeof update === 'function' ? update(c[name] ?? []) : update })),
    errors,
    clearError: (path) =>
      setErrors((e) => {
        if (!e[path]) return e;
        const next = { ...e };
        delete next[path];
        return next;
      }),
    record,
    isNew,
    recordId: isNew ? null : recordId,
    level,
    lockedFields: new Set(lockedFields ?? []),
    extras,
    setExtra: (key, value) => setExtras((x) => ({ ...x, [key]: value })),
  };

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const saved = isNew
        ? await api(`/${def.apiPath}`, { method: 'POST', body: payload })
        : await api(`/${def.apiPath}/${recordId}`, { method: 'PUT', body: payload });
      queryClient.invalidateQueries({ queryKey: ['list', def.key] });
      queryClient.invalidateQueries({ queryKey: ['lookup', def.key] });
      queryClient.invalidateQueries({ queryKey: ['home'] });
      if (def.code && preview && saved[def.code.field] !== preview) toast(`Saved as ${saved[def.code.field]} (the previewed code was taken).`, 'info', 6000);
      else toast(`${def.formCaption ?? def.caption} saved.`, 'success', 2500);
      snapshot.current = JSON.stringify(payload);
      onClose(saved);
    } catch (e) {
      if (e instanceof ApiError && e.details) {
        const map: Record<string, string> = {};
        for (const d of e.details) if (!map[d.field]) map[d.field] = d.message;
        setErrors(map);
        toast(e.message, 'error', 6000);
      } else toast((e as Error).message, 'error', 6000);
    } finally {
      setSaving(false);
    }
  };

  const requestClose = () => {
    if (dirty) setConfirmClose(true);
    else onClose();
  };

  const formTitle = def.formCaption ?? def.caption;
  const title = isNew ? `New ${formTitle}` : `${record?._title || record?._display || ''}${record?._title || record?._display ? ' - ' : ''}${formTitle}`;
  const errorCount = Object.keys(errors).length;
  // "Active" is record status, not data entry: it sits in the title bar on every form.
  const activeField = getField(def, 'active');

  return (
    <Modal
      title={title}
      icon={<EntityIcon name={def.icon} size={17} variant="tile" />}
      width={def.formWidth ?? 760}
      level={level}
      onClose={requestClose}
      headerExtra={
        <>
          {activeField && view === 'details' && !loading && !loadError && (
            <label className="header-active" title={activeField.tooltip}>
              <span>{activeField.caption}</span>
              <Toggle
                checked={Boolean(values.active)}
                onChange={(v) => formApi.setValue('active', v)}
                label={activeField.caption}
                disabled={!canSave || formApi.lockedFields.has('active')}
              />
            </label>
          )}
          {!isNew && isAdmin && (
          <div className="view-switch" role="tablist">
            <button type="button" role="tab" aria-selected={view === 'details'} className={view === 'details' ? 'active' : ''} onClick={() => setView('details')}>
              <IconDetails size={14} /> Details
            </button>
            <button type="button" role="tab" aria-selected={view === 'history'} className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}>
              <IconHistory size={14} /> History
            </button>
          </div>
          )}
        </>
      }
      footer={
        <>
          <span className="footer-note">
            {errorCount > 0 ? (
              <span className="danger with-icon">
                <IconError size={14} /> Fix {errorCount} {errorCount === 1 ? 'error' : 'errors'} before saving
              </span>
            ) : (
              <span className="muted">
                <span className="req">*</span> Required field
              </span>
            )}
          </span>
          <button type="button" className="btn" onClick={requestClose}>
            <IconCancel size={15} /> Cancel
          </button>
          {canSave && view === 'details' && (
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving || loading || Boolean(loadError)}>
              <IconSave size={15} /> {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </>
      }
    >
      {loading ? (
        <div className="form-loading">Loading…</div>
      ) : loadError ? (
        <Callout kind="danger">{loadError}</Callout>
      ) : view === 'history' ? (
        <HistoryPanel entity={def.key} entityId={recordId} />
      ) : (
        <FormContext.Provider value={formApi}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (canSave) save();
            }}
          >
            <FormBody />
            <button type="submit" hidden aria-hidden tabIndex={-1} />
          </form>
        </FormContext.Provider>
      )}
      {confirmClose && (
        <ConfirmDialog
          title="Discard changes?"
          message="You have unsaved changes. Close without saving?"
          confirmLabel="Discard"
          confirmIcon={<IconUndo size={15} />}
          danger
          level={level + 2}
          onCancel={() => setConfirmClose(false)}
          onConfirm={() => {
            setConfirmClose(false);
            onClose();
          }}
        />
      )}
    </Modal>
  );
}
