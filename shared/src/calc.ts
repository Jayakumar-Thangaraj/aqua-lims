import Decimal from 'decimal.js';
import type { AlertSeverity, ResultStatus, TankHealthLevel } from './enums';
import { formatRange, n2 } from './format';

// Ported from AquaLIMS.Module/Global/WaterChangeAlertService.cs. Keep the behaviour identical.

export interface CalcParameter {
  id?: string;
  code?: string | null;
  name: string;
  defaultUnitSymbol?: string | null;
}

export interface CalcLimit {
  parameter?: CalcParameter | null;
  lcl: number;
  ucl: number;
}

export interface CalcSpecies {
  speciesName: string;
  parameterLimits: CalcLimit[];
}

export interface CalcResult {
  parameter?: CalcParameter | null;
  measuredValue: number;
}

export interface CalcTank {
  tankName: string;
  // In createdAt order: only the "source" label on ties depends on it.
  tankSpecies: { species?: CalcSpecies | null }[];
  parameterOverrides: CalcLimit[];
  samples?: { sampleParameters: (CalcResult & { testedDate: Date | string })[] }[];
  tankReadings?: { readingDate: Date | string; parameters: CalcResult[] }[];
}

export interface EffectiveLimit {
  code: string;
  parameterId?: string;
  parameterName: string;
  defaultUnitSymbol: string;
  lcl: number;
  ucl: number;
  source: string;
}

export interface CalcPrepReading {
  parameter?: CalcParameter | null;
  measuredValue: number;
  unitSymbol?: string | null;
}

export interface CalcPreparation {
  prepCode: string;
  readings: CalcPrepReading[];
}

export interface ParameterAlert {
  parameterName: string;
  parameterCode: string;
  measuredValue: number;
  lcl: number;
  ucl: number;
  severity: Exclude<AlertSeverity, 'InRange'>;
  limitSource: string;
  unitSymbol: string;
}

const BORDERLINE_FRACTION = new Decimal('0.05');
const MIN_BUFFER = new Decimal('0.1');
const APPROACHING_FRACTION = new Decimal('0.10');

const dec = (value: number) => new Decimal(value ?? 0);
const codeKey = (code: string) => code.toUpperCase();

// Effective LCL/UCL per parameter code (case-insensitive) for a tank. The strictest window across
// all species wins (highest LCL, lowest UCL); a tank override replaces the species limits entirely.
// Active flags are deliberately ignored, as in XAF.
export function resolveEffectiveLimits(tank: CalcTank | null | undefined): Map<string, EffectiveLimit> {
  const limits = new Map<string, EffectiveLimit>();
  if (!tank) return limits;

  for (const ts of tank.tankSpecies ?? []) {
    const species = ts.species;
    if (!species) continue;
    for (const limit of species.parameterLimits ?? []) {
      const parameter = limit.parameter;
      const code = parameter?.code;
      if (!parameter || !code) continue;
      const key = codeKey(code);
      const source = species.speciesName;
      const existing = limits.get(key);
      if (!existing) {
        limits.set(key, {
          code,
          parameterId: parameter.id,
          parameterName: parameter.name,
          defaultUnitSymbol: parameter.defaultUnitSymbol ?? '',
          lcl: limit.lcl,
          ucl: limit.ucl,
          source,
        });
      } else {
        limits.set(key, {
          ...existing,
          lcl: Decimal.max(dec(existing.lcl), dec(limit.lcl)).toNumber(),
          ucl: Decimal.min(dec(existing.ucl), dec(limit.ucl)).toNumber(),
          source: dec(existing.lcl).gte(dec(limit.lcl)) ? existing.source : source,
        });
      }
    }
  }

  for (const ov of tank.parameterOverrides ?? []) {
    const parameter = ov.parameter;
    const code = parameter?.code;
    if (!parameter || !code) continue;
    limits.set(codeKey(code), {
      code,
      parameterId: parameter.id,
      parameterName: parameter.name,
      defaultUnitSymbol: parameter.defaultUnitSymbol ?? '',
      lcl: ov.lcl,
      ucl: ov.ucl,
      source: 'Tank override',
    });
  }

  return limits;
}

export function getEffectiveLimit(
  limits: Map<string, EffectiveLimit>,
  parameter: CalcParameter | null | undefined,
): EffectiveLimit | undefined {
  const code = parameter?.code;
  if (!code) return undefined;
  return limits.get(codeKey(code));
}

// Strict result check - no borderline band.
export function classifyResult(value: number, lcl: number, ucl: number): Exclude<ResultStatus, 'NoLimit'> {
  const v = dec(value);
  if (v.lt(dec(lcl))) return 'Low';
  if (v.gt(dec(ucl))) return 'High';
  return 'OK';
}

export interface ResultEvaluation {
  limitRange: string;
  resultStatus: ResultStatus;
  isOutOfRange: boolean;
  limit?: EffectiveLimit;
}

// Limit + Status columns for a Sample Parameter / Tank Reading Parameter row.
export function evaluateResult(
  limits: Map<string, EffectiveLimit> | null,
  parameter: CalcParameter | null | undefined,
  measuredValue: number | null | undefined,
): ResultEvaluation {
  const limit = limits ? getEffectiveLimit(limits, parameter) : undefined;
  if (!limit) return { limitRange: '', resultStatus: 'NoLimit', isOutOfRange: false };
  const resultStatus = classifyResult(measuredValue ?? 0, limit.lcl, limit.ucl);
  return {
    limitRange: formatRange(limit.lcl, limit.ucl),
    resultStatus,
    isOutOfRange: resultStatus === 'Low' || resultStatus === 'High',
    limit,
  };
}

// Buffered classification used only by the Water Change prepared-water check.
export function classifySeverity(value: number, lcl: number, ucl: number): AlertSeverity {
  const v = dec(value);
  const lo = dec(lcl);
  const hi = dec(ucl);
  if (v.gte(lo) && v.lte(hi)) return 'InRange';
  const buffer = Decimal.max(hi.minus(lo).times(BORDERLINE_FRACTION), MIN_BUFFER);
  if (v.lt(lo.minus(buffer)) || v.gt(hi.plus(buffer))) return 'OutOfRange';
  return 'Borderline';
}

export function checkReadings(prep: CalcPreparation | null | undefined, tank: CalcTank | null | undefined): ParameterAlert[] {
  const alerts: ParameterAlert[] = [];
  if (!prep || !tank) return alerts;
  const limits = resolveEffectiveLimits(tank);
  if (limits.size === 0) return alerts;

  for (const reading of prep.readings ?? []) {
    const parameter = reading.parameter;
    const code = parameter?.code;
    if (!parameter || !code) continue;
    const limit = limits.get(codeKey(code));
    if (!limit) continue;
    const severity = classifySeverity(reading.measuredValue, limit.lcl, limit.ucl);
    if (severity === 'InRange') continue;
    alerts.push({
      parameterName: parameter.name,
      parameterCode: code,
      measuredValue: reading.measuredValue,
      lcl: limit.lcl,
      ucl: limit.ucl,
      severity,
      limitSource: limit.source,
      unitSymbol: reading.unitSymbol || parameter.defaultUnitSymbol || '',
    });
  }
  return alerts;
}

export function isBlank(text: string | null | undefined): boolean {
  return !text || text.trim().length === 0;
}

// The read-only "Alert Summary" text of the Water Change form, character for character.
export function buildAlertSummary(
  prep: CalcPreparation | null | undefined,
  tank: CalcTank | null | undefined,
  overrideNote: string | null | undefined,
  alerts: ParameterAlert[] = checkReadings(prep, tank),
): string {
  if (!tank || !prep) return 'Select a tank and a prepared water batch to see the parameter comparison.';
  if (alerts.length === 0) return `✓ All checked parameters are within range for ${tank.tankName}.`;

  const lines: string[] = [];
  lines.push(`Parameter check — ${prep.prepCode} vs ${tank.tankName}`);
  lines.push('');
  for (const a of alerts) {
    const marker = a.severity === 'OutOfRange' ? '✗' : '⚠';
    const unit = a.unitSymbol ? ` ${a.unitSymbol}` : '';
    lines.push(
      `  ${marker}  ${a.parameterName.padEnd(22)} ${n2(a.measuredValue)}${unit}   ` +
        `limit: ${n2(a.lcl)} – ${n2(a.ucl)}   [${a.severity.toUpperCase()}]`,
    );
    if (a.limitSource) lines.push(`       Source: ${a.limitSource}`);
  }
  const critical = alerts.filter((x) => x.severity === 'OutOfRange').length;
  if (critical > 0 && isBlank(overrideNote)) {
    lines.push('');
    lines.push(`${critical} critical issue(s) detected — an override note is required to save.`);
  }
  return lines.join('\n').trimEnd();
}

export interface WaterChangeCheck {
  alerts: ParameterAlert[];
  criticalCount: number;
  borderlineCount: number;
  requiresOverride: boolean;
  canSave: boolean;
  summaryText: string;
}

export const OVERRIDE_REQUIRED_MESSAGE =
  'Critical out-of-range parameters detected. Add an override note to acknowledge and proceed.';

export function summarizeWaterChange(
  prep: CalcPreparation | null | undefined,
  tank: CalcTank | null | undefined,
  overrideNote: string | null | undefined,
): WaterChangeCheck {
  const alerts = checkReadings(prep, tank);
  const criticalCount = alerts.filter((a) => a.severity === 'OutOfRange').length;
  const borderlineCount = alerts.filter((a) => a.severity === 'Borderline').length;
  const requiresOverride = criticalCount > 0;
  return {
    alerts,
    criticalCount,
    borderlineCount,
    requiresOverride,
    canSave: !requiresOverride || !isBlank(overrideNote),
    summaryText: buildAlertSummary(prep, tank, overrideNote, alerts),
  };
}

export interface TankHealth {
  level: TankHealthLevel;
  summary: string;
}

const toTime = (value: Date | string) => (value instanceof Date ? value : new Date(value)).getTime();

// Overall tank state from the latest result per parameter (Samples and Tank Readings together).
export function getTankHealth(tank: CalcTank | null | undefined): TankHealth {
  if (!tank) return { level: 'NoData', summary: '' };
  const limits = resolveEffectiveLimits(tank);
  if (limits.size === 0) return { level: 'NoData', summary: 'No parameter limits set for this tank.' };

  const results: { parameter: CalcParameter; value: number; when: number }[] = [];
  for (const sample of tank.samples ?? [])
    for (const r of sample.sampleParameters ?? [])
      if (r.parameter) results.push({ parameter: r.parameter, value: r.measuredValue, when: toTime(r.testedDate) });
  for (const reading of tank.tankReadings ?? [])
    for (const r of reading.parameters ?? [])
      if (r.parameter) results.push({ parameter: r.parameter, value: r.measuredValue, when: toTime(reading.readingDate) });

  // Group by code (first-appearance order); the latest result per group, ties keep the first one.
  const groups = new Map<string, (typeof results)[number]>();
  for (const r of results) {
    const code = r.parameter.code;
    if (!code || !limits.has(codeKey(code))) continue;
    const key = codeKey(code);
    const current = groups.get(key);
    if (!current || r.when > current.when) groups.set(key, r);
  }
  const latest = [...groups.values()];
  if (latest.length === 0) return { level: 'NoData', summary: 'No results yet for the parameters that have limits.' };

  const critical: string[] = [];
  const approaching: string[] = [];
  for (const r of latest) {
    const limit = limits.get(codeKey(r.parameter.code!))!;
    const status = classifyResult(r.value, limit.lcl, limit.ucl);
    if (status !== 'OK') {
      critical.push(`${r.parameter.name} ${n2(r.value)} ${status.toLowerCase()} (limit ${formatRange(limit.lcl, limit.ucl)})`);
      continue;
    }
    // No "approaching" on a zero-width limit; an LCL of 0 means "lower is better", so only a real
    // lower bound (e.g. pH 6.5) can be approached from below.
    const lcl = dec(limit.lcl);
    const ucl = dec(limit.ucl);
    const value = dec(r.value);
    const band = ucl.minus(lcl).times(APPROACHING_FRACTION);
    if (band.lte(0)) continue;
    if (lcl.gt(0) && value.minus(lcl).lte(band))
      approaching.push(`${r.parameter.name} ${n2(r.value)} near lower limit ${n2(limit.lcl)}`);
    else if (ucl.minus(value).lte(band))
      approaching.push(`${r.parameter.name} ${n2(r.value)} near upper limit ${n2(limit.ucl)}`);
  }

  if (critical.length > 0) return { level: 'Critical', summary: [...critical, ...approaching].join('; ') };
  if (approaching.length > 0) return { level: 'Warning', summary: approaching.join('; ') };
  return {
    level: 'Stable',
    summary: latest.length === 1 ? 'The latest result is within its limit.' : `All ${latest.length} latest results are within limits.`,
  };
}

// Parameters whose merged species window is empty (LCL > UCL).
export function conflictingLimits(limits: Map<string, EffectiveLimit>): EffectiveLimit[] {
  return [...limits.values()].filter((l) => dec(l.lcl).gt(dec(l.ucl)));
}

// "WP-202610-" / "WC-202610-"
export function codePrefix(kind: 'WP' | 'WC', date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${kind}-${yyyy}${mm}-`;
}

export function formatCode(prefix: string, sequence: number): string {
  return `${prefix}${String(sequence).padStart(3, '0')}`;
}

// Highest numeric suffix among codes with the prefix (0 when none).
export function highestSuffix(prefix: string, codes: (string | null | undefined)[]): number {
  let max = 0;
  for (const code of codes) {
    if (!code || !code.startsWith(prefix)) continue;
    const n = Number.parseInt(code.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}
