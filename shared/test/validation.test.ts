import { describe, expect, it } from 'vitest';
import { ENTITIES, ENTITY_LIST, getChild, validateChildRows, validateRecord } from '../src';

describe('validation (§6)', () => {
  it('required message uses the form caption', () => {
    const errors = validateRecord(ENTITIES.waterChange, { tankId: null, waterPreparationId: '' });
    expect(errors.map((e) => e.message)).toEqual(['"Tank" must not be empty.', '"Prepared Water" must not be empty.']);
  });

  it('0 is a valid required number', () => {
    const errors = validateRecord(ENTITIES.speciesParameterLimit, { speciesId: 'a', parameterId: 'b', lcl: 0, ucl: 0, optimalValue: 0 });
    expect(errors).toEqual([]);
  });

  it('29. LCL must not exceed UCL; Ideal must be within range', () => {
    const errors = validateRecord(ENTITIES.speciesParameterLimit, { speciesId: 'a', parameterId: 'b', lcl: 8, ucl: 6, optimalValue: 0 });
    expect(errors).toEqual([{ field: 'lcl', rule: 'lclUcl', message: 'LCL must be less than or equal to UCL.' }]);
    const ideal = validateRecord(ENTITIES.speciesParameterLimit, { speciesId: 'a', parameterId: 'b', lcl: 6, ucl: 8, optimalValue: 9 });
    expect(ideal[0].field).toBe('optimalValue');
  });

  it('duplicate parameter rows in a species are rejected', () => {
    const child = getChild(ENTITIES.species, 'parameterLimits')!;
    const errors = validateChildRows(child, [
      { parameterId: 'p1', lcl: 1, ucl: 2 },
      { parameterId: 'p1', lcl: 1, ucl: 2 },
    ]);
    expect(errors).toEqual([
      { field: 'children.parameterLimits.1.parameterId', rule: 'compoundUnique', message: 'This parameter already has a limit for this species.' },
    ]);
  });

  it('volumes cannot be negative', () => {
    const errors = validateRecord(ENTITIES.tank, { tankName: 'T', tankCode: 'C', volume: -1 });
    expect(errors[0]).toMatchObject({ field: 'volume', rule: 'nonNegative' });
  });

  it('registry is consistent: refs, children, layouts and columns point at real fields', () => {
    for (const def of ENTITY_LIST) {
      const names = new Set([...def.fields.map((f) => f.name), ...(def.computed ?? []).map((c) => c.name)]);
      for (const col of def.listColumns) expect(names.has(col.field), `${def.key}.${col.field}`).toBe(true);
      for (const fd of def.fields) if (fd.type === 'ref') expect(ENTITIES[fd.ref!], `${def.key}.${fd.name}`).toBeDefined();
      for (const child of def.children ?? []) {
        const cdef = ENTITIES[child.entity];
        const cnames = new Set([...cdef.fields.map((f) => f.name), ...(cdef.computed ?? []).map((c) => c.name)]);
        expect(cnames.has(child.foreignKey), `${def.key}.${child.name}.fk`).toBe(true);
        for (const col of child.columns) expect(cnames.has(col.field), `${def.key}.${child.name}.${col.field}`).toBe(true);
      }
      const visit = (items: any[]) => {
        for (const it of items) {
          if (it.kind === 'row')
            for (const c of it.cells) for (const n of [c.field, ...(c.stack ?? []), c.unitField].filter(Boolean)) expect(names.has(n), `${def.key} form ${n}`).toBe(true);
          if (it.kind === 'field') expect(names.has(it.field), `${def.key} form ${it.field}`).toBe(true);
          if (it.kind === 'section') visit(it.items);
          if (it.kind === 'tabs') for (const t of it.tabs) visit(t.items);
          if (it.kind === 'child') expect(getChild(def, it.child), `${def.key} child ${it.child}`).toBeDefined();
        }
      };
      visit(def.form);
    }
  });
});
