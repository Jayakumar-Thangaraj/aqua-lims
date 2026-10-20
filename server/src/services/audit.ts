import type { ClientSession } from 'mongoose';
import { dataFields, enumCaption, type EntityDef } from '@aqualims/shared';
import { AuditLog } from '../models/system';
import { idOf, recordLabel, type LabelResolver } from './labels';

export interface Actor {
  id: string;
  userName: string;
}

interface Entry {
  at: Date;
  userId: string;
  userName: string;
  entity: string;
  entityId: string;
  entityDisplay: string | null;
  operation: string;
  property?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  parentEntity?: string | null;
  parentId?: string | null;
}

function sameValue(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => (v === undefined || v === '' ? null : v instanceof Date ? v.toISOString() : v == null ? null : String(v));
  return norm(a) === norm(b);
}

// Collects audit entries for one save and writes them inside the same transaction.
export class AuditWriter {
  private entries: Entry[] = [];
  private at = new Date();

  constructor(
    private actor: Actor,
    private resolver: LabelResolver,
  ) {}

  private async display(def: EntityDef, name: string, value: unknown): Promise<string | null> {
    if (value === null || value === undefined || value === '') return null;
    const fd = def.fields.find((x) => x.name === name);
    if (!fd) return String(value);
    if (fd.type === 'ref') return (await this.resolver.labelOf(fd.ref!, idOf(value))) || String(value);
    if (fd.type === 'enum') return enumCaption(fd.enumName!, String(value));
    if (fd.type === 'date') return new Date(value as string).toISOString();
    return String(value);
  }

  private base(def: EntityDef, record: any, display: string, operation: string, parent?: { def: EntityDef; id: string }): Entry {
    return {
      at: this.at,
      userId: this.actor.id,
      userName: this.actor.userName,
      entity: def.key,
      entityId: String(record._id),
      entityDisplay: display,
      operation,
      parentEntity: parent?.def.key ?? null,
      parentId: parent?.id ?? null,
    };
  }

  async created(def: EntityDef, record: any, parent?: { def: EntityDef; id: string }): Promise<void> {
    const display = await recordLabel(def, record, this.resolver);
    this.entries.push(this.base(def, record, display, 'ObjectCreated', parent));
    for (const fd of dataFields(def)) {
      const value = await this.display(def, fd.name, record[fd.name]);
      if (value === null) continue;
      this.entries.push({ ...this.base(def, record, display, 'InitialValueAssigned', parent), property: fd.name, newValue: value });
    }
  }

  async changed(def: EntityDef, before: any, after: any, parent?: { def: EntityDef; id: string }): Promise<boolean> {
    const display = await recordLabel(def, after, this.resolver);
    let any = false;
    for (const fd of dataFields(def)) {
      if (sameValue(before[fd.name], after[fd.name])) continue;
      any = true;
      this.entries.push({
        ...this.base(def, after, display, 'ObjectChanged', parent),
        property: fd.name,
        oldValue: await this.display(def, fd.name, before[fd.name]),
        newValue: await this.display(def, fd.name, after[fd.name]),
      });
    }
    return any;
  }

  async deleted(def: EntityDef, record: any, parent?: { def: EntityDef; id: string }): Promise<void> {
    this.entries.push(this.base(def, record, await recordLabel(def, record, this.resolver), 'ObjectDeleted', parent));
  }

  async collection(
    parentDef: EntityDef,
    parentRecord: any,
    operation: 'AddedToCollection' | 'RemovedFromCollection' | 'CollectionObjectChanged',
    collectionName: string,
    childDef: EntityDef,
    childRecord: any,
  ): Promise<void> {
    const parentDisplay = await recordLabel(parentDef, parentRecord, this.resolver);
    const childDisplay = await recordLabel(childDef, childRecord, this.resolver);
    this.entries.push({
      ...this.base(parentDef, parentRecord, parentDisplay, operation),
      property: collectionName,
      oldValue: operation === 'RemovedFromCollection' ? childDisplay : null,
      newValue: operation === 'RemovedFromCollection' ? null : childDisplay,
    });
  }

  async flush(session: ClientSession): Promise<void> {
    if (this.entries.length === 0) return;
    await AuditLog().insertMany(this.entries, { session });
    this.entries = [];
  }
}
