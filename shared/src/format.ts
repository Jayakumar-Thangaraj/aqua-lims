import { enumCaption } from './enums';

const n2Formatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// XAF's {0:n2}: two decimals with a thousands separator.
export function n2(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return '';
  return n2Formatter.format(Number(value));
}

// XPO stored decimals as SQL money (4 decimal places).
export function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

// "2.00 (L)" - Water Preparation "Prepared Amount", Water Change "Added Water" / "Removed Water".
export function formatVolume(value: number | null | undefined, unitKey: string | null | undefined): string {
  return `${n2(value ?? 0)} (${enumCaption('WaterVolumeUnit', unitKey ?? 'MilliLitre')})`;
}

// XAF shows date-time fields as a short date (10/19/2026) while storing the full timestamp.
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${formatDate(d)} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
}

export function formatRange(lcl: number, ucl: number): string {
  return `${n2(lcl)} – ${n2(ucl)}`;
}

const VOLUME_IN_ML: Record<string, number> = { MilliLitre: 1, Litre: 1000, Gallon: 3785 };

export function convertVolume(value: number, fromUnit: string, toUnit: string): number {
  const from = VOLUME_IN_ML[fromUnit] ?? 1;
  const to = VOLUME_IN_ML[toUnit] ?? 1;
  return (value * from) / to;
}
