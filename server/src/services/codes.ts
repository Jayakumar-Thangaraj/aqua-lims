import type { ClientSession } from 'mongoose';
import { codePrefix, formatCode, highestSuffix, ENTITIES, type EntityDef } from '@aqualims/shared';
import { Counter } from '../models/system';
import { modelFor } from '../models/registry';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function highestExisting(def: EntityDef, prefix: string, session?: ClientSession): Promise<number> {
  const field = def.code!.field;
  const docs = await modelFor(def.key)
    .find({ [field]: { $regex: `^${escapeRegex(prefix)}` } })
    .select(field)
    .session(session ?? null)
    .lean();
  return highestSuffix(prefix, (docs as any[]).map((d) => d[field]));
}

// Shown greyed on the New form; the real code is assigned on save.
export async function previewCode(kind: 'WP' | 'WC', date = new Date()): Promise<string> {
  const def = kind === 'WP' ? ENTITIES.waterPreparation : ENTITIES.waterChange;
  const prefix = codePrefix(kind, date);
  const counter: any = await Counter().findById(prefix).lean();
  const next = Math.max(counter?.seq ?? 0, await highestExisting(def, prefix)) + 1;
  return formatCode(prefix, next);
}

// Atomic: the counter is incremented inside the save transaction, so concurrent saves never collide.
export async function assignCode(kind: 'WP' | 'WC', session: ClientSession, date = new Date()): Promise<string> {
  const def = kind === 'WP' ? ENTITIES.waterPreparation : ENTITIES.waterChange;
  const prefix = codePrefix(kind, date);
  const existing = await highestExisting(def, prefix, session);
  await Counter().updateOne({ _id: prefix }, { $max: { seq: existing } }, { upsert: true, session });
  const counter: any = await Counter().findOneAndUpdate({ _id: prefix }, { $inc: { seq: 1 } }, { new: true, session }).lean();
  return formatCode(prefix, counter.seq);
}
