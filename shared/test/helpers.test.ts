import { describe, expect, it } from 'vitest';
import {
  ENTITIES,
  can,
  convertVolume,
  displayValue,
  enumCaption,
  enumKeyFromIndex,
  formatDate,
  formatRange,
  formatVolume,
  mergePermissions,
  n2,
  round4,
  sortValue,
  toNumber,
  validateRecord,
} from '../src';

describe('formatting (§5.7)', () => {
  it('n2 uses two decimals and a thousands separator, blank for empty', () => {
    expect(n2(1234.5)).toBe('1,234.50');
    expect(n2(0)).toBe('0.00');
    expect(n2(-0.005)).toBe('-0.01');
    expect(n2(null)).toBe('');
    expect(n2(undefined)).toBe('');
    expect(n2(Number.NaN)).toBe('');
  });

  it('formatVolume shows the unit caption and defaults to mL', () => {
    expect(formatVolume(2, 'Litre')).toBe('2.00 (L)');
    expect(formatVolume(null, null)).toBe('0.00 (mL)');
    expect(formatVolume(1.5, 'Gallon')).toBe('1.50 (gal)');
  });

  it('round4 matches SQL money precision', () => {
    expect(round4(1.23456)).toBe(1.2346);
    expect(round4(0.1 + 0.2)).toBe(0.3);
  });

  it('dates show date only and ignore invalid input', () => {
    expect(formatDate(new Date(2026, 9, 19, 15, 30))).toBe('10/19/2026');
    expect(formatDate('not a date')).toBe('');
    expect(formatDate(null)).toBe('');
  });

  it('formatRange', () => {
    expect(formatRange(6.5, 7.5)).toBe('6.50 – 7.50');
  });
});

describe('volume conversion (§4 Water Preparation)', () => {
  it('1 L = 1000 mL, 1 gal = 3.785 L', () => {
    expect(convertVolume(1, 'Litre', 'MilliLitre')).toBe(1000);
    expect(convertVolume(500, 'MilliLitre', 'Litre')).toBe(0.5);
    expect(convertVolume(1, 'Gallon', 'Litre')).toBeCloseTo(3.785, 3);
    expect(convertVolume(3.785, 'Litre', 'Gallon')).toBeCloseTo(1, 3);
    expect(convertVolume(7, 'Litre', 'Litre')).toBe(7);
  });
});

describe('enums', () => {
  it('captions and XPO index mapping', () => {
    expect(enumCaption('SampleStatus', 'InProgress')).toBe('In Progress');
    expect(enumCaption('SampleStatus', null)).toBe('');
    expect(enumCaption('SampleStatus', 'Unknown')).toBe('Unknown');
    expect(enumKeyFromIndex('WaterVolumeUnit', 2)).toBe('Gallon');
    expect(enumKeyFromIndex('WaterVolumeUnit', 9)).toBeNull();
    expect(enumKeyFromIndex('WaterVolumeUnit', null)).toBeNull();
  });
});

describe('toNumber', () => {
  it('accepts thousands separators, rejects text', () => {
    expect(toNumber('1,250.5')).toBe(1250.5);
    expect(toNumber(' 7 ')).toBe(7);
    expect(toNumber('')).toBeNull();
    expect(toNumber(null)).toBeNull();
    expect(Number.isNaN(toNumber('abc'))).toBe(true);
    expect(Number.isNaN(toNumber(Number.POSITIVE_INFINITY))).toBe(true);
  });
});

describe('permissions (§7)', () => {
  const reader = { permissions: [{ type: 'tank', read: true, create: false, write: false, delete: false, navigate: true }] };
  const writer = { permissions: [{ type: 'tank', read: false, create: true, write: true, delete: false, navigate: false }] };

  it('merging roles is a union (allow wins)', () => {
    const merged = mergePermissions([reader, writer]);
    expect(merged.isAdministrative).toBe(false);
    expect(merged.types.tank).toEqual({ read: true, create: true, write: true, delete: false, navigate: true });
    expect(can(merged, 'tank', 'delete')).toBe(false);
    expect(can(merged, 'sample', 'read')).toBe(false);
  });

  it('administrative bypasses every check; no permissions means no access', () => {
    expect(can(mergePermissions([reader, { isAdministrative: true }]), 'sample', 'delete')).toBe(true);
    expect(can(null, 'tank', 'read')).toBe(false);
    expect(mergePermissions([])).toEqual({ isAdministrative: false, types: {} });
  });
});

describe('display and sort values (grids, export, search)', () => {
  const sample = ENTITIES.sample;
  const row = { sampleCode: 'S-1', volume: 1500, status: 'InProgress', active: false, tankId: 'x', _labels: { tankId: 'Nano Tank' } };

  it('formats each field type', () => {
    expect(displayValue(sample, row, 'sampleCode')).toBe('S-1');
    expect(displayValue(sample, row, 'volume')).toBe('1,500.00');
    expect(displayValue(sample, row, 'status')).toBe('In Progress');
    expect(displayValue(sample, row, 'active')).toBe('No');
    expect(displayValue(sample, row, 'tankId')).toBe('Nano Tank');
    expect(displayValue(sample, { ...row, volume: null }, 'volume')).toBe('');
  });

  it('numbers sort numerically with blanks first', () => {
    const values = [{ volume: 10 }, { volume: 9 }, { volume: null }].map((r) => sortValue(sample, r, 'volume'));
    expect(values).toEqual([10, 9, Number.NEGATIVE_INFINITY]);
  });
});

describe('validation edge cases (§6)', () => {
  it('rejects an unknown enum value', () => {
    const errors = validateRecord(ENTITIES.sample, { sampleCode: 'S', tankId: 'x', status: 'Bogus' });
    expect(errors.map((e) => e.rule)).toContain('enum');
  });

  it('rejects a date that cannot be read', () => {
    const errors = validateRecord(ENTITIES.sample, { sampleCode: 'S', tankId: 'x', collectedDate: 'yesterday-ish' });
    expect(errors).toContainEqual(expect.objectContaining({ field: 'collectedDate', rule: 'date' }));
  });

  it('accepts ISO dates and Date objects', () => {
    expect(validateRecord(ENTITIES.sample, { sampleCode: 'S', tankId: 'x', collectedDate: '2026-10-19T09:00:00.000Z' })).toEqual([]);
    expect(validateRecord(ENTITIES.sample, { sampleCode: 'S', tankId: 'x', collectedDate: new Date() })).toEqual([]);
  });

  it('integers must be whole numbers', () => {
    const errors = validateRecord(ENTITIES.unit, { unitName: 'x', unitSymbol: 'x', sortOrder: 1.5 });
    expect(errors.map((e) => e.rule)).toContain('integer');
  });
});
