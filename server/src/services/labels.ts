import { ENTITIES, enumCaption, formatDate, getField, type EntityDef, type EntityKey } from '@aqualims/shared';
import { modelFor } from '../models/registry';

export const idOf = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));

// Resolves what a reference shows (XAF DefaultProperty), with a per-request cache.
export class LabelResolver {
  private cache = new Map<string, Map<string, string>>();
  private inactive = new Map<string, Set<string>>();

  async labels(entity: EntityKey, ids: (string | null | undefined)[], labelField?: string): Promise<Map<string, string>> {
    const def = ENTITIES[entity];
    const fieldName = labelField ?? def.displayField;
    const cacheKey = `${entity}:${fieldName}`;
    let cache = this.cache.get(cacheKey);
    if (!cache) {
      cache = new Map();
      this.cache.set(cacheKey, cache);
    }
    const missing = [...new Set(ids.filter((x): x is string => Boolean(x)))].filter((id) => !cache!.has(id));
    if (missing.length > 0) {
      const select = def.hasActive ? `${fieldName} active` : fieldName;
      const docs = await modelFor(entity).find({ _id: { $in: missing } }).select(select).lean();
      const fd = getField(def, fieldName);
      let nested: Map<string, string> | undefined;
      if (fd?.type === 'ref') nested = await this.labels(fd.ref!, docs.map((d: any) => idOf(d[fieldName])), fd.refLabel);
      const inactive = this.inactive.get(entity) ?? new Set<string>();
      for (const d of docs as any[]) {
        const raw = d[fieldName];
        let label: string;
        if (fd?.type === 'ref') label = nested!.get(idOf(raw) ?? '') ?? '';
        else if (fd?.type === 'date') label = formatDate(raw);
        else if (fd?.type === 'enum') label = enumCaption(fd.enumName!, raw);
        else label = raw == null ? '' : String(raw);
        cache.set(String(d._id), label);
        if (def.hasActive && d.active === false) inactive.add(String(d._id));
      }
      this.inactive.set(entity, inactive);
    }
    return cache;
  }

  // Records saved in the current (uncommitted) transaction aren't visible to lookups yet.
  prime(entity: EntityKey, id: string, label: string, labelField?: string): void {
    const cacheKey = `${entity}:${labelField ?? ENTITIES[entity].displayField}`;
    if (!this.cache.has(cacheKey)) this.cache.set(cacheKey, new Map());
    this.cache.get(cacheKey)!.set(id, label);
  }

  isInactive(entity: EntityKey, id: string): boolean {
    return this.inactive.get(entity)?.has(id) ?? false;
  }

  async labelOf(entity: EntityKey, id: string | null): Promise<string> {
    if (!id) return '';
    return (await this.labels(entity, [id])).get(id) ?? '';
  }
}

// Adds `_labels: { [refField]: label }` to each row.
export async function attachLabels(def: EntityDef, rows: any[], resolver: LabelResolver): Promise<void> {
  for (const row of rows) row._labels = row._labels ?? {};
  // Reference fields resolve in parallel (one round trip for all of them, not one each).
  await Promise.all(
    def.fields
      .filter((fd) => fd.type === 'ref')
      .map(async (fd) => {
        const map = await resolver.labels(fd.ref!, rows.map((r) => idOf(r[fd.name])), fd.refLabel);
        for (const row of rows) {
          const id = idOf(row[fd.name]);
          row._labels[fd.name] = id ? map.get(id) ?? '' : '';
        }
      }),
  );
}

// Display label of one record of this entity (for audit entries and messages).
export async function recordLabel(def: EntityDef, record: any, resolver: LabelResolver): Promise<string> {
  const fd = getField(def, def.displayField);
  const raw = record?.[def.displayField];
  if (fd?.type === 'ref') return resolver.labelOf(fd.ref!, idOf(raw));
  if (fd?.type === 'date') return formatDate(raw);
  return raw == null ? '' : String(raw);
}
