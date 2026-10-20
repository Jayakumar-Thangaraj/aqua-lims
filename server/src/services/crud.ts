import mongoose, { type ClientSession } from 'mongoose';
import {
  ENTITIES,
  OVERRIDE_REQUIRED_MESSAGE,
  can,
  cascadeChildren,
  columnCaption,
  dataFields,
  displayValue,
  formCaption,
  formatDate,
  getField,
  isBlank,
  referencesTo,
  sortValue,
  summarizeWaterChange,
  toNumber,
  uniqueMessage,
  validateChildRows,
  validateRecord,
  type ChildDef,
  type EntityDef,
  type EntityKey,
  type FieldError,
  type Operation,
  type PermissionSet,
} from '@aqualims/shared';
import { CASE_INSENSITIVE, modelFor } from '../models/registry';
import { HttpError, ValidationFailed, forbidden, notFound } from '../lib/errors';
import { AuditWriter, type Actor } from './audit';
import { assignCode } from './codes';
import { applyResultEvaluation, attachComputed, tankExtras, type ComputedContext } from './computed';
import { LabelResolver, attachLabels, idOf, recordLabel } from './labels';
import { invalidateParameterCache, loadParameters, loadPreparationCalc, loadTankCalcs } from './tankContext';

export interface Ctx {
  user: Actor;
  perms: PermissionSet;
}

const live = { isDeleted: false };

export function requirePermission(ctx: Ctx, type: string, op: Operation): void {
  if (!can(ctx.perms, type, op)) throw forbidden();
}

// Cached reference data must not outlive a committed change to it.
function afterCommit(def: EntityDef): void {
  if (def.key === 'parameter' || def.key === 'unit') invalidateParameterCache();
}

export async function runInTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result!;
  } finally {
    await session.endSession();
  }
}

// ─── Payload normalisation ──────────────────────────────────────────────────

function normaliseValue(fd: { type: string }, value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  switch (fd.type) {
    case 'string':
    case 'text': {
      const s = String(value).trim();
      return s === '' ? null : s;
    }
    case 'number':
    case 'integer':
      return toNumber(value);
    case 'boolean':
      return Boolean(value);
    case 'date': {
      if (value === '') return null;
      const d = new Date(value as string);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    case 'enum':
      return value === '' ? null : String(value);
    case 'ref': {
      const id = idOf(value);
      if (!id) return null;
      return mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : '__invalid__';
    }
  }
  return value;
}

function pickData(def: EntityDef, payload: Record<string, unknown>, options: { asChild?: boolean; isNew: boolean }): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const fd of dataFields(def)) {
    if (options.asChild && fd.name === def.parentField) continue;
    if (def.code && fd.name === def.code.field) continue;
    if (!(fd.name in payload)) {
      if (options.isNew && fd.defaultValue !== undefined) data[fd.name] = fd.defaultValue === 'now' ? new Date() : fd.defaultValue;
      continue;
    }
    data[fd.name] = normaliseValue(fd, payload[fd.name]);
  }
  return data;
}

function invalidRefErrors(def: EntityDef, data: Record<string, unknown>, prefix = ''): FieldError[] {
  return dataFields(def)
    .filter((fd) => fd.type === 'ref' && data[fd.name] === '__invalid__')
    .map((fd) => ({ field: `${prefix}${fd.name}`, rule: 'ref', message: `"${formCaption(fd)}" is not a valid selection.` }));
}

// A well-formed id must also point at a live record (deleted or unknown ids are rejected).
async function missingRefErrors(
  targets: { def: EntityDef; data: Record<string, unknown>; prefix: string }[],
  session: ClientSession,
): Promise<FieldError[]> {
  const wanted = new Map<EntityKey, Set<string>>();
  for (const { def, data } of targets)
    for (const fd of dataFields(def))
      if (fd.type === 'ref' && data[fd.name] instanceof mongoose.Types.ObjectId)
        (wanted.get(fd.ref!) ?? wanted.set(fd.ref!, new Set()).get(fd.ref!)!).add(String(data[fd.name]));
  const found = new Map<string, Set<string>>();
  for (const [entity, ids] of wanted) {
    const docs = await modelFor(entity)
      .find({ ...live, _id: { $in: [...ids] } })
      .select('_id')
      .session(session)
      .lean();
    found.set(entity, new Set((docs as any[]).map((d) => String(d._id))));
  }
  const errors: FieldError[] = [];
  for (const { def, data, prefix } of targets)
    for (const fd of dataFields(def))
      if (fd.type === 'ref' && data[fd.name] instanceof mongoose.Types.ObjectId && !found.get(fd.ref!)?.has(String(data[fd.name])))
        errors.push({ field: `${prefix}${fd.name}`, rule: 'ref', message: `"${formCaption(fd)}" refers to a record that no longer exists.` });
  return errors;
}

function refTargets(def: EntityDef, data: Record<string, unknown>, payload: Record<string, any>) {
  const targets = [{ def, data, prefix: '' }];
  for (const { child, rows } of childPayloads(def, payload)) {
    const cdef = ENTITIES[child.entity];
    rows.forEach((r, i) => targets.push({ def: cdef, data: pickData(cdef, r, { asChild: true, isNew: true }), prefix: `children.${child.name}.${i}.` }));
  }
  return targets;
}

// ─── Unique checks (case-insensitive, non-deleted) ──────────────────────────

async function uniqueErrors(def: EntityDef, data: Record<string, unknown>, selfId: unknown, session: ClientSession): Promise<FieldError[]> {
  const errors: FieldError[] = [];
  const model = modelFor(def.key);
  for (const fd of def.fields) {
    if (!fd.unique) continue;
    const value = data[fd.name];
    if (value === null || value === undefined || value === '') continue;
    const clash = await model
      .findOne({ ...live, [fd.name]: value, _id: { $ne: selfId } })
      .collation(CASE_INSENSITIVE)
      .select('_id')
      .session(session)
      .lean();
    if (clash) errors.push({ field: fd.name, rule: 'unique', message: uniqueMessage(formCaption(fd)) });
  }
  for (const cu of def.compoundUnique ?? []) {
    if (cu.fields.some((x) => data[x] === null || data[x] === undefined)) continue;
    const clash = await model
      .findOne({ ...live, ...Object.fromEntries(cu.fields.map((x) => [x, data[x]])), _id: { $ne: selfId } })
      .select('_id')
      .session(session)
      .lean();
    if (clash) errors.push({ field: cu.field, rule: 'compoundUnique', message: cu.message });
  }
  return errors;
}

// ─── Output shaping ─────────────────────────────────────────────────────────

function toPlain(doc: any): any {
  const out: any = { ...doc };
  out._id = String(doc._id);
  for (const [k, v] of Object.entries(out)) {
    if (v instanceof mongoose.Types.ObjectId) out[k] = String(v);
    else if (Array.isArray(v)) out[k] = v.map((x) => (x instanceof mongoose.Types.ObjectId ? String(x) : x));
  }
  delete out.__v;
  return out;
}

export async function decorate(def: EntityDef, docs: any[], resolver = new LabelResolver(), prefetched: ComputedContext = {}): Promise<any[]> {
  const rows = docs.map(toPlain);
  await Promise.all([attachLabels(def, rows, resolver), attachComputed(def, rows, prefetched)]);
  for (const fd of def.fields)
    if (fd.type === 'ref')
      for (const row of rows) {
        const id = idOf(row[fd.name]);
        if (id && resolver.isInactive(fd.ref!, id)) (row._inactive ??= {})[fd.name] = true;
      }
  return rows;
}

export { displayValue };

// ─── List ───────────────────────────────────────────────────────────────────

export interface ListQuery {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  filter?: Record<string, Record<string, string>>;
  ids?: string[];
}

function applyFilter(def: EntityDef, row: any, name: string, op: string, value: string): boolean {
  const fd = getField(def, name);
  const text = displayValue(def, row, name).toLowerCase();
  const v = String(value ?? '').toLowerCase();
  if (fd?.type === 'ref' && op === 'eq' && mongoose.isValidObjectId(value)) return idOf(row[name]) === value;
  const numeric = fd && (fd.type === 'number' || fd.type === 'integer') ? Number(row[name]) : null;
  const target = numeric !== null ? Number(value) : null;
  switch (op) {
    case 'contains':
      return text.includes(v);
    case 'notContains':
      return !text.includes(v);
    case 'startsWith':
      return text.startsWith(v);
    case 'endsWith':
      return text.endsWith(v);
    case 'eq':
      return numeric !== null ? numeric === target : text === v;
    case 'neq':
      return numeric !== null ? numeric !== target : text !== v;
    case 'lt':
      return numeric !== null ? numeric < target! : text < v;
    case 'lte':
      return numeric !== null ? numeric <= target! : text <= v;
    case 'gt':
      return numeric !== null ? numeric > target! : text > v;
    case 'gte':
      return numeric !== null ? numeric >= target! : text >= v;
    default:
      return true;
  }
}

export async function listRecords(def: EntityDef, query: ListQuery, ctx: Ctx): Promise<{ items: any[]; total: number }> {
  requirePermission(ctx, def.key, 'read');
  const mongoFilter: Record<string, unknown> = { ...live };
  // Reference equality filters go to the database (used by child list grids).
  for (const [name, ops] of Object.entries(query.filter ?? {})) {
    const fd = getField(def, name);
    if (fd?.type === 'ref' && ops.eq && mongoose.isValidObjectId(ops.eq)) mongoFilter[name] = new mongoose.Types.ObjectId(ops.eq);
  }
  if (query.ids) mongoFilter._id = { $in: query.ids.filter((x) => mongoose.isValidObjectId(x)) };
  const docs = await modelFor(def.key).find(mongoFilter).lean();
  let rows = await decorate(def, docs);

  const columns = [...def.fields.map((f) => f.name), ...(def.computed ?? []).map((c) => c.name)];
  if (query.q && query.q.trim()) {
    const q = query.q.trim().toLowerCase();
    rows = rows.filter((row) => columns.some((c) => displayValue(def, row, c).toLowerCase().includes(q)));
  }
  for (const [name, ops] of Object.entries(query.filter ?? {}))
    for (const [op, value] of Object.entries(ops)) rows = rows.filter((row) => applyFilter(def, row, name, op, value));

  const sorts = (query.sort ?? `${def.defaultSort.field}:${def.defaultSort.desc ? 'desc' : 'asc'}`)
    .split(',')
    .map((s) => s.split(':'))
    .filter(([f]) => f);
  rows.sort((a, b) => {
    for (const [f, dir] of sorts) {
      const av = sortValue(def, a, f);
      const bv = sortValue(def, b, f);
      if (av < bv) return dir === 'desc' ? 1 : -1;
      if (av > bv) return dir === 'desc' ? -1 : 1;
    }
    return 0;
  });

  const total = rows.length;
  const pageSize = query.pageSize ?? 20;
  const page = Math.max(1, query.page ?? 1);
  const items = pageSize > 0 ? rows.slice((page - 1) * pageSize, page * pageSize) : rows;
  return { items, total };
}

// ─── Get ────────────────────────────────────────────────────────────────────

async function loadChildren(def: EntityDef, parent: any, resolver: LabelResolver): Promise<Record<string, any[]>> {
  const loads = cascadeChildren(def).map(async (child) => {
    const cdef = ENTITIES[child.entity];
    const docs = await modelFor(child.entity)
      .find({ ...live, [child.foreignKey]: parent._id })
      .sort({ createdAt: 1, _id: 1 })
      .lean();
    const rows = docs.map(toPlain);
    await Promise.all([
      attachLabels(cdef, rows, resolver),
      (async () => {
        if (cdef.key === 'sampleParameter' || cdef.key === 'tankReadingParameter') {
          const params = await loadParameters();
          const tankId = idOf(parent.tankId);
          const tanks = tankId ? await loadTankCalcs([tankId], { params }) : new Map();
          applyResultEvaluation(rows, tankId ? tanks.get(tankId) : null, params);
        } else await attachComputed(cdef, rows);
      })(),
    ]);
    return [child.name, rows] as const;
  });
  return Object.fromEntries(await Promise.all(loads));
}

export async function getRecord(def: EntityDef, id: string, ctx: Ctx): Promise<any> {
  requirePermission(ctx, def.key, 'read');
  if (!mongoose.isValidObjectId(id)) throw notFound(def.caption);
  const doc: any = await modelFor(def.key).findOne({ _id: id, ...live }).lean();
  if (!doc) throw notFound(def.caption);
  const resolver = new LabelResolver();
  // Every round trip to the database costs real latency, so independent loads run together and the
  // tank context (limits + results) is loaded once for both health and effective limits.
  const tankId = String(doc._id);
  const tanks = def.key === 'tank' ? loadTankCalcs([tankId], { results: true }) : undefined;
  const [[row], children, check] = await Promise.all([
    tanks ? tanks.then((t) => decorate(def, [doc], resolver, { tanks: t })) : decorate(def, [doc], resolver),
    loadChildren(def, doc, resolver),
    def.key === 'waterChange' ? waterChangeCheck(idOf(doc.tankId), idOf(doc.waterPreparationId), doc.overrideNote) : undefined,
  ]);
  row._display = await recordLabel(def, row, resolver);
  row.children = children;
  if (tanks) Object.assign(row, tankExtras((await tanks).get(tankId)));
  if (def.key === 'tankReading') row._title = `${row._labels.tankId ?? ''} ${formatDate(row.readingDate)}`.trim();
  if (check) row.check = check;
  return row;
}

export async function waterChangeCheck(tankId: string | null, prepId: string | null, overrideNote: string | null | undefined) {
  const params = await loadParameters();
  const [tanks, prep] = await Promise.all([tankId ? loadTankCalcs([tankId], { params }) : Promise.resolve(new Map()), loadPreparationCalc(prepId, params)]);
  return summarizeWaterChange(prep, tankId ? tanks.get(tankId) : null, overrideNote);
}

// ─── Save ───────────────────────────────────────────────────────────────────

interface ChildPayload {
  child: ChildDef;
  rows: Record<string, unknown>[];
}

function childPayloads(def: EntityDef, payload: Record<string, any>): ChildPayload[] {
  const children = (payload.children ?? {}) as Record<string, unknown>;
  return cascadeChildren(def)
    .filter((c) => Array.isArray(children[c.name]))
    .map((c) => ({ child: c, rows: children[c.name] as Record<string, unknown>[] }));
}

async function beforeSave(def: EntityDef, data: Record<string, any>, isNew: boolean, session: ClientSession): Promise<void> {
  if (def.code && isNew) data[def.code.field] = await assignCode(def.code.kind, session);
  if (def.key === 'waterChange') {
    const check = await waterChangeCheck(idOf(data.tankId), idOf(data.waterPreparationId), data.overrideNote);
    if (check.requiresOverride && isBlank(data.overrideNote))
      throw new ValidationFailed([{ field: 'overrideNote', rule: 'WC_OverrideRequired', message: OVERRIDE_REQUIRED_MESSAGE }], OVERRIDE_REQUIRED_MESSAGE);
    data.alertsSnapshot = check.alerts;
  }
}

async function saveChildren(
  def: EntityDef,
  parent: any,
  payloads: ChildPayload[],
  ctx: Ctx,
  audit: AuditWriter,
  session: ClientSession,
  isNew: boolean,
): Promise<void> {
  for (const { child, rows } of payloads) {
    const cdef = ENTITIES[child.entity];
    const model = modelFor(child.entity);
    const existing = isNew ? [] : await model.find({ ...live, [child.foreignKey]: parent._id }).session(session).lean();
    const existingById = new Map((existing as any[]).map((d) => [String(d._id), d]));
    const keep = new Set(rows.map((r) => idOf(r._id)).filter((x): x is string => Boolean(x) && existingById.has(x!)));

    for (const old of existing as any[]) {
      if (keep.has(String(old._id))) continue;
      requirePermission(ctx, cdef.key, 'delete');
      await softDeleteCascade(cdef, old, ctx, audit, session, { def, id: String(parent._id) });
      await audit.collection(def, parent, 'RemovedFromCollection', child.name, cdef, old);
    }
    for (const raw of rows) {
      const id = idOf(raw._id);
      const before = id ? existingById.get(id) : undefined;
      const data = pickData(cdef, raw, { asChild: true, isNew: !before });
      if (before) {
        const after = { ...before, ...data };
        const changed = dataFields(cdef).some((fd) => fd.name !== child.foreignKey && String(before[fd.name] ?? '') !== String(after[fd.name] ?? ''));
        if (!changed) continue;
        requirePermission(ctx, cdef.key, 'write');
        await model.updateOne({ _id: before._id }, { $set: { ...data, updatedBy: ctx.user.userName } }, { session });
        await audit.changed(cdef, before, after, { def, id: String(parent._id) });
        await audit.collection(def, parent, 'CollectionObjectChanged', child.name, cdef, after);
      } else {
        requirePermission(ctx, cdef.key, 'create');
        const [created] = await model.create([{ ...data, [child.foreignKey]: parent._id, createdBy: ctx.user.userName, updatedBy: ctx.user.userName }], { session });
        const plain = created.toObject();
        await audit.created(cdef, plain, { def, id: String(parent._id) });
        await audit.collection(def, parent, 'AddedToCollection', child.name, cdef, plain);
      }
    }
  }
}

function validatePayload(def: EntityDef, payload: Record<string, any>, isNew: boolean, data: Record<string, unknown>): FieldError[] {
  const errors = validateRecord(def, payload, { isNew });
  errors.push(...invalidRefErrors(def, data));
  for (const { child, rows } of childPayloads(def, payload)) {
    errors.push(...validateChildRows(child, rows));
    rows.forEach((r, i) => {
      const cdata = pickData(ENTITIES[child.entity], r, { asChild: true, isNew: true });
      errors.push(...invalidRefErrors(ENTITIES[child.entity], cdata, `children.${child.name}.${i}.`));
    });
  }
  return errors;
}

export async function createRecord(def: EntityDef, payload: Record<string, any>, ctx: Ctx): Promise<any> {
  requirePermission(ctx, def.key, 'create');
  const data = pickData(def, payload, { isNew: true });
  const errors = validatePayload(def, payload, true, data);
  if (errors.length) throw new ValidationFailed(errors);

  const id = await runInTransaction(async (session) => {
    const integrity = [...(await missingRefErrors(refTargets(def, data, payload), session)), ...(await uniqueErrors(def, data, null, session))];
    if (integrity.length) throw new ValidationFailed(integrity);
    await beforeSave(def, data, true, session);
    const resolver = new LabelResolver();
    const audit = new AuditWriter(ctx.user, resolver);
    const [doc] = await modelFor(def.key).create([{ ...data, createdBy: ctx.user.userName, updatedBy: ctx.user.userName }], { session });
    const plain = doc.toObject();
    resolver.prime(def.key, String(doc._id), await recordLabel(def, plain, resolver));
    await audit.created(def, plain);
    await saveChildren(def, plain, childPayloads(def, payload), ctx, audit, session, true);
    await audit.flush(session);
    return String(doc._id);
  });
  afterCommit(def);
  return getRecord(def, id, ctx);
}

export async function updateRecord(def: EntityDef, id: string, payload: Record<string, any>, ctx: Ctx): Promise<any> {
  requirePermission(ctx, def.key, 'write');
  if (!mongoose.isValidObjectId(id)) throw notFound(def.caption);
  const data = pickData(def, payload, { isNew: false });
  await runInTransaction(async (session) => {
    const model = modelFor(def.key);
    const before: any = await model.findOne({ _id: id, ...live }).session(session).lean();
    if (!before) throw notFound(def.caption);
    const merged = { ...before, ...data };
    const errors = validatePayload(def, { ...stringifyRefs(before), ...payload }, false, data);
    if (errors.length) throw new ValidationFailed(errors);
    const integrity = [...(await missingRefErrors(refTargets(def, data, payload), session)), ...(await uniqueErrors(def, merged, before._id, session))];
    if (integrity.length) throw new ValidationFailed(integrity);
    await beforeSave(def, merged, false, session);
    const resolver = new LabelResolver();
    const audit = new AuditWriter(ctx.user, resolver);
    const update: Record<string, unknown> = { ...data, updatedBy: ctx.user.userName };
    if (def.key === 'waterChange') update.alertsSnapshot = merged.alertsSnapshot;
    await model.updateOne({ _id: before._id }, { $set: update }, { session });
    await audit.changed(def, before, merged);
    await saveChildren(def, merged, childPayloads(def, payload), ctx, audit, session, false);
    // Touch the parent so "Last Updated" moves when only children changed.
    await model.updateOne({ _id: before._id }, { $set: { updatedAt: new Date() } }, { session, timestamps: false });
    await audit.flush(session);
  });
  afterCommit(def);
  return getRecord(def, id, ctx);
}

function stringifyRefs(doc: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc)) out[k] = v instanceof mongoose.Types.ObjectId ? String(v) : v;
  return out;
}

// ─── Delete ─────────────────────────────────────────────────────────────────

async function softDeleteCascade(
  def: EntityDef,
  record: any,
  ctx: Ctx,
  audit: AuditWriter,
  session: ClientSession,
  parent?: { def: EntityDef; id: string },
): Promise<void> {
  for (const child of cascadeChildren(def)) {
    const rows = await modelFor(child.entity).find({ ...live, [child.foreignKey]: record._id }).session(session).lean();
    for (const row of rows) await softDeleteCascade(ENTITIES[child.entity], row, ctx, audit, session, { def, id: String(record._id) });
  }
  for (const { entity, field } of referencesTo(def.key))
    if (field.onTargetDelete === 'clear')
      await modelFor(entity.key).updateMany({ ...live, [field.name]: record._id }, { $set: { [field.name]: null } }, { session });
  await modelFor(def.key).updateOne(
    { _id: record._id },
    { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: ctx.user.userName } },
    { session },
  );
  await audit.deleted(def, record, parent);
}

async function blockingReferences(def: EntityDef, id: unknown, session: ClientSession, resolver: LabelResolver): Promise<string | null> {
  const cascaded = new Set(cascadeChildren(def).map((c) => `${c.entity}.${c.foreignKey}`));
  for (const { entity, field } of referencesTo(def.key)) {
    if (field.onTargetDelete === 'clear' || cascaded.has(`${entity.key}.${field.name}`)) continue;
    const refs = await modelFor(entity.key).find({ ...live, [field.name]: id }).limit(3).session(session).lean();
    if (refs.length === 0) continue;
    if (def.deleteBlockedMessage) return def.deleteBlockedMessage;
    // Child records also name their parent, e.g. Tank Species "Dario dario" in Nano Tank.
    const parentField = entity.parentField && entity.parentField !== field.name ? getField(entity, entity.parentField) : undefined;
    const labels = await Promise.all(
      refs.map(async (r: any) => {
        const own = await recordLabel(entity, r, resolver);
        if (!parentField) return own;
        const parent = await resolver.labelOf(parentField.ref!, idOf(r[parentField.name]));
        return parent ? `${own}" in "${parent}` : own;
      }),
    );
    const names = labels.filter(Boolean).map((l) => `"${l}"`).join(', ');
    const tail = def.hasActive ? ' Set it inactive instead.' : ' Remove those references first.';
    return `It is used by ${entity.caption} ${names}${refs.length === 3 ? ' and possibly more' : ''}, so it can't be deleted.${tail}`;
  }
  return null;
}

export async function deleteRecords(def: EntityDef, ids: string[], ctx: Ctx): Promise<{ deleted: string[]; errors: { id: string; message: string }[] }> {
  requirePermission(ctx, def.key, 'delete');
  const deleted: string[] = [];
  const errors: { id: string; message: string }[] = [];
  for (const id of ids) {
    if (!mongoose.isValidObjectId(id)) {
      errors.push({ id, message: `${def.caption} was not found.` });
      continue;
    }
    try {
      await runInTransaction(async (session) => {
        const record: any = await modelFor(def.key).findOne({ _id: id, ...live }).session(session).lean();
        if (!record) throw notFound(def.caption);
        const resolver = new LabelResolver();
        const blocked = await blockingReferences(def, record._id, session, resolver);
        if (blocked) {
          const label = await recordLabel(def, record, resolver);
          throw new HttpError(409, label && !def.deleteBlockedMessage ? `"${label}": ${blocked}` : blocked, 'IN_USE');
        }
        const audit = new AuditWriter(ctx.user, resolver);
        await softDeleteCascade(def, record, ctx, audit, session);
        await audit.flush(session);
      });
      deleted.push(id);
    } catch (e: any) {
      if (e instanceof HttpError) errors.push({ id, message: e.message });
      else throw e;
    }
  }
  if (deleted.length) afterCommit(def);
  return { deleted, errors };
}

export { columnCaption };
