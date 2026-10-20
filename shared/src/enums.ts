export interface EnumOption {
  key: string;
  caption: string;
}

// Order matters: XPO stored these enums as their zero-based position (used by the SQL migration).
export const ENUMS = {
  SampleStatus: [
    { key: 'Pending', caption: 'Pending' },
    { key: 'InProgress', caption: 'In Progress' },
    { key: 'Completed', caption: 'Completed' },
  ],
  TankReadingContext: [
    { key: 'Routine', caption: 'Routine' },
    { key: 'BeforeWaterChange', caption: 'Before Water Change' },
    { key: 'AfterWaterChange', caption: 'After Water Change' },
    { key: 'BeforeMedication', caption: 'Before Medication' },
    { key: 'AfterMedication', caption: 'After Medication' },
    { key: 'Other', caption: 'Other' },
  ],
  WaterPreparationStatus: [
    { key: 'Preparing', caption: 'Preparing' },
    { key: 'Ready', caption: 'Ready' },
    { key: 'PartiallyUsed', caption: 'Partially Used' },
    { key: 'Used', caption: 'Used' },
  ],
  WaterChangeStatus: [
    { key: 'Planned', caption: 'Planned' },
    { key: 'InProgress', caption: 'In Progress' },
    { key: 'Completed', caption: 'Completed' },
  ],
  WaterVolumeUnit: [
    { key: 'MilliLitre', caption: 'mL' },
    { key: 'Litre', caption: 'L' },
    { key: 'Gallon', caption: 'gal' },
  ],
  ResultStatus: [
    { key: 'NoLimit', caption: 'No limit' },
    { key: 'Low', caption: 'Low' },
    { key: 'OK', caption: 'OK' },
    { key: 'High', caption: 'High' },
  ],
  TankHealthLevel: [
    { key: 'NoData', caption: 'No data' },
    { key: 'Stable', caption: 'Stable' },
    { key: 'Warning', caption: 'Warning' },
    { key: 'Critical', caption: 'Critical' },
  ],
} as const satisfies Record<string, readonly EnumOption[]>;

export type EnumName = keyof typeof ENUMS;

export type ResultStatus = 'NoLimit' | 'Low' | 'OK' | 'High';
export type TankHealthLevel = 'NoData' | 'Stable' | 'Warning' | 'Critical';
export type AlertSeverity = 'InRange' | 'Borderline' | 'OutOfRange';
export type WaterVolumeUnit = 'MilliLitre' | 'Litre' | 'Gallon';

export function enumOptions(name: EnumName): readonly EnumOption[] {
  return ENUMS[name];
}

export function enumCaption(name: EnumName, key: string | null | undefined): string {
  if (key == null) return '';
  const option = (ENUMS[name] as readonly EnumOption[]).find((o) => o.key === key);
  return option ? option.caption : String(key);
}

export function enumKeyFromIndex(name: EnumName, index: number | null | undefined): string | null {
  if (index == null) return null;
  const option = (ENUMS[name] as readonly EnumOption[])[index];
  return option ? option.key : null;
}
