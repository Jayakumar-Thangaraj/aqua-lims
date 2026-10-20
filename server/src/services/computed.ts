import {
  conflictingLimits,
  evaluateResult,
  formatVolume,
  getTankHealth,
  resolveEffectiveLimits,
  type CalcTank,
  type EntityDef,
} from '@aqualims/shared';
import { modelFor } from '../models/registry';
import { idOf } from './labels';
import { loadParameters, loadTankCalcs, type ParameterLookup } from './tankContext';

// Limit + Status for result rows that all belong to one tank.
export function applyResultEvaluation(rows: any[], tank: CalcTank | null | undefined, params: ParameterLookup): void {
  const limits = tank ? resolveEffectiveLimits(tank) : null;
  for (const row of rows) {
    const evaluation = evaluateResult(limits, params.byId.get(idOf(row.parameterId) ?? ''), row.measuredValue);
    row.limitRange = evaluation.limitRange;
    row.resultStatus = evaluation.resultStatus;
    row.isOutOfRange = evaluation.isOutOfRange;
  }
}

async function evaluateByParent(rows: any[], parentKey: 'sample' | 'tankReading', parentField: string): Promise<void> {
  const parentIds = [...new Set(rows.map((r) => idOf(r[parentField])).filter(Boolean))] as string[];
  const [parents, params] = await Promise.all([modelFor(parentKey).find({ _id: { $in: parentIds } }).select('tankId').lean(), loadParameters()]);
  const tankOfParent = new Map<string, string>((parents as any[]).map((p) => [String(p._id), idOf(p.tankId) ?? '']));
  const tanks = await loadTankCalcs([...new Set(tankOfParent.values())], { params });
  for (const row of rows) applyResultEvaluation([row], tanks.get(tankOfParent.get(idOf(row[parentField]) ?? '') ?? ''), params);
}

export interface ComputedContext {
  // Tank contexts already loaded with results (saves loading them twice for one request).
  tanks?: Map<string, CalcTank>;
}

// Fills the computed (read-only) columns of an entity's rows.
export async function attachComputed(def: EntityDef, rows: any[], prefetched: ComputedContext = {}): Promise<void> {
  if (rows.length === 0) return;
  switch (def.key) {
    case 'tank': {
      const tanks = prefetched.tanks ?? (await loadTankCalcs(rows.map((r) => String(r._id)), { results: true }));
      for (const row of rows) {
        const health = getTankHealth(tanks.get(String(row._id)));
        row.healthLevel = health.level;
        row.healthSummary = health.summary;
      }
      break;
    }
    case 'sampleParameter':
      await evaluateByParent(rows, 'sample', 'sampleId');
      break;
    case 'tankReadingParameter':
      await evaluateByParent(rows, 'tankReading', 'tankReadingId');
      break;
    case 'waterPreparation':
      for (const row of rows) row.preparedAmount = formatVolume(row.preparedVolume, row.volumeUnit);
      break;
    case 'waterChange':
      for (const row of rows) {
        row.addedWater = formatVolume(row.volumeUsed, row.volumeUsedUnit);
        row.removedWater = formatVolume(row.volumeRemoved, row.volumeRemovedUnit);
      }
      break;
  }
}

export function tankExtras(tank: CalcTank | undefined): { effectiveLimits: any[]; conflicts: string[] } {
  const limits = resolveEffectiveLimits(tank);
  const effectiveLimits = [...limits.values()]
    .sort((a, b) => a.parameterName.localeCompare(b.parameterName))
    .map((l) => ({ parameterId: l.parameterId, parameterCode: l.code, parameterName: l.parameterName, lcl: l.lcl, ucl: l.ucl, source: l.source, unitSymbol: l.defaultUnitSymbol }));
  return { effectiveLimits, conflicts: conflictingLimits(limits).map((l) => l.parameterName) };
}
