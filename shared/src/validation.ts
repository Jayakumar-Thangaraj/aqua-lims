import Decimal from 'decimal.js';
import { ENUMS, type EnumOption } from './enums';
import { ENTITIES, dataFields, formCaption, type ChildDef, type EntityDef, type FieldDef } from './entities';

export interface FieldError {
  field: string;
  rule: string;
  message: string;
}

export type RecordValues = Record<string, unknown>;

export const requiredMessage = (caption: string) => `"${caption}" must not be empty.`;
export const uniqueMessage = (caption: string) =>
  `The "${caption}" field must be unique. Another record already has this value.`;

function isEmptyValue(fd: FieldDef, value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (fd.type === 'string' || fd.type === 'text' || fd.type === 'ref' || fd.type === 'enum')
    return String(value).trim() === '';
  if (fd.type === 'number' || fd.type === 'integer') return typeof value === 'string' ? value.trim() === '' : false;
  return false;
}

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : NaN;
}

export interface ValidateOptions {
  // Editing inside the parent form: the parent reference is filled in by the server.
  asChild?: boolean;
  isNew?: boolean;
}

export function validateRecord(def: EntityDef, rec: RecordValues, options: ValidateOptions = {}): FieldError[] {
  const errors: FieldError[] = [];
  for (const fd of dataFields(def)) {
    if (options.asChild && fd.name === def.parentField) continue;
    if (def.code && fd.name === def.code.field) continue;
    const caption = formCaption(fd);
    const value = rec[fd.name];

    if (fd.required && isEmptyValue(fd, value)) {
      errors.push({ field: fd.name, rule: 'required', message: requiredMessage(caption) });
      continue;
    }
    if (value === null || value === undefined || value === '') continue;

    if ((fd.type === 'string' || fd.type === 'text') && fd.maxLength && String(value).length > fd.maxLength)
      errors.push({ field: fd.name, rule: 'maxLength', message: `"${caption}" can't be longer than ${fd.maxLength} characters.` });

    if (fd.type === 'number' || fd.type === 'integer') {
      const n = toNumber(value);
      if (n === null || Number.isNaN(n)) {
        errors.push({ field: fd.name, rule: 'number', message: `"${caption}" must be a number.` });
        continue;
      }
      if (fd.type === 'integer' && !Number.isInteger(n))
        errors.push({ field: fd.name, rule: 'integer', message: `"${caption}" must be a whole number.` });
      if (fd.nonNegative && n < 0)
        errors.push({ field: fd.name, rule: 'nonNegative', message: `"${caption}" can't be negative.` });
    }

    // Without this an unreadable date was silently stored as empty.
    if (fd.type === 'date' && Number.isNaN(new Date(value as string).getTime()))
      errors.push({ field: fd.name, rule: 'date', message: `"${caption}" is not a valid date.` });

    if (fd.type === 'enum' && fd.enumName) {
      const options = ENUMS[fd.enumName] as readonly EnumOption[];
      if (!options.some((o) => o.key === value))
        errors.push({ field: fd.name, rule: 'enum', message: `"${caption}" has an invalid value.` });
    }
  }
  errors.push(...entityRules(def, rec));
  return errors;
}

// Rules added in the MERN rebuild (LCL <= UCL, Ideal within range).
function entityRules(def: EntityDef, rec: RecordValues): FieldError[] {
  const errors: FieldError[] = [];
  if (def.key === 'speciesParameterLimit' || def.key === 'tankParameterOverride') {
    const lcl = toNumber(rec.lcl);
    const ucl = toNumber(rec.ucl);
    if (lcl !== null && ucl !== null && !Number.isNaN(lcl) && !Number.isNaN(ucl)) {
      if (new Decimal(lcl).gt(ucl))
        errors.push({ field: 'lcl', rule: 'lclUcl', message: 'LCL must be less than or equal to UCL.' });
      if (def.key === 'speciesParameterLimit') {
        const ideal = toNumber(rec.optimalValue);
        if (ideal !== null && !Number.isNaN(ideal) && ideal !== 0 && (new Decimal(ideal).lt(lcl) || new Decimal(ideal).gt(ucl)))
          errors.push({ field: 'optimalValue', rule: 'idealRange', message: 'Ideal must be between LCL and UCL.' });
      }
    }
  }
  return errors;
}

// Validates rows of an inline child grid; field paths are "children.<name>.<index>.<field>".
export function validateChildRows(child: ChildDef, rows: RecordValues[]): FieldError[] {
  const def = ENTITIES[child.entity];
  const errors: FieldError[] = [];
  rows.forEach((rowValues, index) => {
    for (const e of validateRecord(def, rowValues, { asChild: true }))
      errors.push({ ...e, field: `children.${child.name}.${index}.${e.field}` });
  });
  for (const cu of def.compoundUnique ?? []) {
    const keyFields = cu.fields.filter((x) => x !== def.parentField);
    const seen = new Map<string, number>();
    rows.forEach((rowValues, index) => {
      const values = keyFields.map((k) => rowValues[k]);
      if (values.some((v) => v === null || v === undefined || v === '')) return;
      const key = values.map(String).join('|');
      if (seen.has(key))
        errors.push({ field: `children.${child.name}.${index}.${cu.field}`, rule: 'compoundUnique', message: cu.message });
      else seen.set(key, index);
    });
  }
  return errors;
}

// Default values for a new record (dates "now" resolved by the caller's clock).
export function defaultValues(def: EntityDef, now: Date = new Date()): RecordValues {
  const values: RecordValues = {};
  for (const fd of dataFields(def)) {
    if (fd.defaultValue === undefined) values[fd.name] = fd.type === 'boolean' ? false : null;
    else if (fd.defaultValue === 'now') values[fd.name] = now.toISOString();
    else values[fd.name] = fd.defaultValue;
  }
  return values;
}
