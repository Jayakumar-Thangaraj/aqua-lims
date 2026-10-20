import { useState } from 'react';
import { ENTITIES, UNIT_PAIRS, getChild, getComputed, getField, type EntityDef, type FormCell, type FormItem } from '@aqualims/shared';
import { EntityIcon, ResultStatusBadge } from '../components/Icons';
import { EditorControl, FieldEditor } from './FieldEditor';
import { useForm } from './FormContext';
import { InlineChildGrid } from './InlineChildGrid';
import { ListChildGrid } from './ListChildGrid';
import { Widget } from './widgets';

function FieldSlot({ name, unitField }: { name: string; unitField?: string }) {
  const form = useForm();
  const fd = getField(form.def, name);
  const cd = getComputed(form.def, name);
  if (cd)
    return (
      <div className="field">
        <span className="field-label">{cd.caption}</span>
        <div className="readonly-value">
          {cd.kind === 'resultStatus' ? <ResultStatusBadge status={form.record?.[name]} /> : form.record?.[name] || <span className="muted">—</span>}
        </div>
      </div>
    );
  if (!fd) return null;
  const locked = form.lockedFields.has(name);
  const pair = unitField ?? UNIT_PAIRS[name];
  const error = form.errors[name];
  const wcCheck = form.extras.waterChangeCheck;
  const emphasise = name === 'overrideNote' && wcCheck?.requiresOverride && !String(form.values.overrideNote ?? '').trim();

  if (pair) {
    const ufd = getField(form.def, pair)!;
    return (
      <div className={`field ${error ? 'has-error' : ''}`}>
        <label className="field-label" htmlFor={`f-${name}`}>
          {fd.formCaption ?? fd.caption}
          {fd.required && <span className="req" aria-hidden> *</span>}
        </label>
        <div className="unit-pair">
          <EditorControl fd={fd} id={`f-${name}`} value={form.values[name]} error={error} onChange={(v) => form.setValue(name, v)} />
          <EditorControl fd={ufd} compact value={form.values[pair]} onChange={(v) => form.setValue(pair, v)} />
        </div>
        {error && <div className="field-error" role="alert">{error}</div>}
      </div>
    );
  }
  return (
    <div className={emphasise ? 'emphasis' : undefined}>
      <FieldEditor
        fd={fd}
        value={form.values[name]}
        label={form.labels[name]}
        inactive={form.record?._inactive?.[name]}
        error={error}
        readOnly={locked}
        level={form.level}
        autoFocus={form.def.focusField === name && form.isNew}
        onChange={(value, label) => form.setValue(name, value, label)}
      />
      {emphasise && !error && <div className="field-help danger">Required: critical parameters are out of range.</div>}
    </div>
  );
}

function Cell({ cell }: { cell: FormCell }) {
  if (cell.spacer) return <div />;
  if (cell.stack)
    return (
      <div className="form-stack">
        {cell.stack.map((n) => (
          <FieldSlot key={n} name={n} />
        ))}
      </div>
    );
  return <FieldSlot name={cell.field!} unitField={cell.unitField} />;
}

// A section or tab that holds a related grid takes that record type's icon; one with only fields takes the form's own.
function itemsIcon(def: EntityDef, items: FormItem[]): string | undefined {
  const item = items.find((it) => it.kind === 'child');
  const child = item?.kind === 'child' ? getChild(def, item.child) : undefined;
  return child ? ENTITIES[child.entity].icon : def.icon;
}

function Tabs({ tabs }: { tabs: { caption: string; items: FormItem[] }[] }) {
  const [active, setActive] = useState(0);
  const form = useForm();
  return (
    <div className="tabs">
      <div className="tab-list" role="tablist">
        {tabs.map((t, i) => (
          <button key={t.caption} type="button" role="tab" aria-selected={i === active} className={`tab ${i === active ? 'active' : ''}`} onClick={() => setActive(i)}>
            {itemsIcon(form.def, t.items) && <EntityIcon name={itemsIcon(form.def, t.items)} size={14} />}
            {t.caption}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.caption} role="tabpanel" hidden={i !== active} className="tab-panel">
          <Items items={t.items} />
        </div>
      ))}
    </div>
  );
}

export function Items({ items }: { items: FormItem[] }) {
  const form = useForm();
  return (
    <>
      {items.map((item, i) => {
        switch (item.kind) {
          case 'row': {
            const widths = item.cells.map((c) => c.width ?? 100 / item.cells.length);
            return (
              <div key={i} className="form-row" style={{ gridTemplateColumns: widths.map((w) => `minmax(0, ${w}fr)`).join(' ') }}>
                {item.cells.map((c, j) => (
                  <Cell key={j} cell={c} />
                ))}
              </div>
            );
          }
          case 'field':
            return <FieldSlot key={i} name={item.field} />;
          case 'section':
            return (
              <section key={i} className="form-section">
                <h3 className="section-title">
                  {itemsIcon(form.def, item.items) && <EntityIcon name={itemsIcon(form.def, item.items)} size={14} />}
                  {item.caption}
                </h3>
                <Items items={item.items} />
              </section>
            );
          case 'tabs':
            return <Tabs key={i} tabs={item.tabs} />;
          case 'child': {
            const child = getChild(form.def, item.child)!;
            return child.mode === 'inline' ? <InlineChildGrid key={i} child={child} /> : <ListChildGrid key={i} child={child} />;
          }
          case 'widget':
            return <Widget key={i} name={item.widget} />;
        }
      })}
    </>
  );
}

// The parent reference is not part of a child's layout; show it when the form is opened on its own.
export function FormBody() {
  const form = useForm();
  const parent = form.def.parentField;
  const layoutHas = (items: FormItem[]): boolean =>
    items.some((it) =>
      it.kind === 'row'
        ? it.cells.some((c) => c.field === parent || c.stack?.includes(parent!))
        : it.kind === 'field'
          ? it.field === parent
          : it.kind === 'section'
            ? layoutHas(it.items)
            : it.kind === 'tabs'
              ? it.tabs.some((t) => layoutHas(t.items))
              : false,
    );
  return (
    <div className="form">
      {parent && !layoutHas(form.def.form) && <FieldSlot name={parent} />}
      <Items items={form.def.form} />
    </div>
  );
}
