import type { CalcParameter, CalcPreparation, CalcTank } from '@aqualims/shared';
import { modelFor } from '../models/registry';
import { idOf } from './labels';

const live = { isDeleted: false };

export interface ParameterLookup {
  byId: Map<string, CalcParameter>;
  unitSymbols: Map<string, string>;
}

// Parameters and units are small, rarely change and are needed by nearly every read, so they are
// cached in-process. Saves through the API clear it; the TTL covers writes made outside the API.
const PARAMETER_TTL_MS = 30_000;
let parameterCache: { at: number; value: Promise<ParameterLookup> } | null = null;

export function invalidateParameterCache(): void {
  parameterCache = null;
}

export function loadParameters(): Promise<ParameterLookup> {
  if (parameterCache && Date.now() - parameterCache.at < PARAMETER_TTL_MS) return parameterCache.value;
  const value = fetchParameters();
  parameterCache = { at: Date.now(), value };
  value.catch(() => {
    if (parameterCache?.value === value) parameterCache = null;
  });
  return value;
}

async function fetchParameters(): Promise<ParameterLookup> {
  const [parameters, units] = await Promise.all([
    modelFor('parameter').find(live).select('parameterName parameterCode defaultUnitId').lean(),
    modelFor('unit').find({}).select('unitSymbol').lean(),
  ]);
  const unitSymbols = new Map<string, string>(units.map((u: any) => [String(u._id), u.unitSymbol ?? '']));
  const byId = new Map<string, CalcParameter>();
  for (const p of parameters as any[])
    byId.set(String(p._id), {
      id: String(p._id),
      code: p.parameterCode,
      name: p.parameterName,
      defaultUnitSymbol: unitSymbols.get(idOf(p.defaultUnitId) ?? '') ?? '',
    });
  return { byId, unitSymbols };
}

// Builds the CalcTank shape for each tank in batched queries (no N+1).
export async function loadTankCalcs(
  tankIds: string[],
  options: { results?: boolean; params?: ParameterLookup } = {},
): Promise<Map<string, CalcTank>> {
  const ids = [...new Set(tankIds.filter(Boolean))];
  const out = new Map<string, CalcTank>();
  if (ids.length === 0) return out;
  const params = options.params ?? (await loadParameters());
  const param = (id: unknown) => params.byId.get(idOf(id) ?? '') ?? null;

  const [tanks, tankSpecies, overrides] = await Promise.all([
    modelFor('tank').find({ _id: { $in: ids } }).select('tankName').lean(),
    modelFor('tankSpecies').find({ ...live, tankId: { $in: ids } }).sort({ createdAt: 1, _id: 1 }).lean(),
    modelFor('tankParameterOverride').find({ ...live, tankId: { $in: ids } }).sort({ createdAt: 1, _id: 1 }).lean(),
  ]);
  const speciesIds = [...new Set((tankSpecies as any[]).map((ts) => idOf(ts.speciesId)).filter(Boolean))];
  const [species, limits] = await Promise.all([
    modelFor('species').find({ ...live, _id: { $in: speciesIds } }).select('speciesName').lean(),
    modelFor('speciesParameterLimit').find({ ...live, speciesId: { $in: speciesIds } }).sort({ createdAt: 1, _id: 1 }).lean(),
  ]);
  const speciesById = new Map<string, any>((species as any[]).map((s) => [String(s._id), { speciesName: s.speciesName, parameterLimits: [] as any[] }]));
  for (const l of limits as any[]) speciesById.get(idOf(l.speciesId) ?? '')?.parameterLimits.push({ parameter: param(l.parameterId), lcl: l.lcl ?? 0, ucl: l.ucl ?? 0 });

  for (const t of tanks as any[]) out.set(String(t._id), { tankName: t.tankName, tankSpecies: [], parameterOverrides: [], samples: [], tankReadings: [] });
  for (const ts of tankSpecies as any[]) out.get(idOf(ts.tankId)!)?.tankSpecies.push({ species: speciesById.get(idOf(ts.speciesId) ?? '') ?? null });
  for (const ov of overrides as any[]) out.get(idOf(ov.tankId)!)?.parameterOverrides.push({ parameter: param(ov.parameterId), lcl: ov.lcl ?? 0, ucl: ov.ucl ?? 0 });

  if (options.results) {
    const [samples, readings] = await Promise.all([
      modelFor('sample').find({ ...live, tankId: { $in: ids } }).select('tankId').sort({ createdAt: 1, _id: 1 }).lean(),
      modelFor('tankReading').find({ ...live, tankId: { $in: ids } }).select('tankId readingDate').sort({ createdAt: 1, _id: 1 }).lean(),
    ]);
    const [sampleParams, readingParams] = await Promise.all([
      modelFor('sampleParameter').find({ ...live, sampleId: { $in: samples.map((s: any) => s._id) } }).sort({ createdAt: 1, _id: 1 }).lean(),
      modelFor('tankReadingParameter').find({ ...live, tankReadingId: { $in: readings.map((r: any) => r._id) } }).sort({ createdAt: 1, _id: 1 }).lean(),
    ]);
    const sampleRows = new Map<string, any[]>();
    for (const sp of sampleParams as any[]) {
      const key = idOf(sp.sampleId)!;
      if (!sampleRows.has(key)) sampleRows.set(key, []);
      sampleRows.get(key)!.push({ parameter: param(sp.parameterId), measuredValue: sp.measuredValue ?? 0, testedDate: sp.testedDate ?? sp.createdAt });
    }
    for (const s of samples as any[]) out.get(idOf(s.tankId)!)?.samples!.push({ sampleParameters: sampleRows.get(String(s._id)) ?? [] });
    const readingRows = new Map<string, any[]>();
    for (const rp of readingParams as any[]) {
      const key = idOf(rp.tankReadingId)!;
      if (!readingRows.has(key)) readingRows.set(key, []);
      readingRows.get(key)!.push({ parameter: param(rp.parameterId), measuredValue: rp.measuredValue ?? 0 });
    }
    for (const r of readings as any[])
      out.get(idOf(r.tankId)!)?.tankReadings!.push({ readingDate: r.readingDate ?? r.createdAt, parameters: readingRows.get(String(r._id)) ?? [] });
  }
  return out;
}

export async function loadPreparationCalc(prepId: string | null, params?: ParameterLookup): Promise<CalcPreparation | null> {
  if (!prepId) return null;
  const prep: any = await modelFor('waterPreparation').findOne({ _id: prepId, ...live }).select('prepCode').lean();
  if (!prep) return null;
  const lookup = params ?? (await loadParameters());
  const readings = await modelFor('waterPrepReading').find({ ...live, waterPreparationId: prepId }).sort({ createdAt: 1, _id: 1 }).lean();
  return {
    prepCode: prep.prepCode,
    readings: (readings as any[]).map((r) => ({
      parameter: lookup.byId.get(idOf(r.parameterId) ?? '') ?? null,
      measuredValue: r.measuredValue ?? 0,
      unitSymbol: lookup.unitSymbols.get(idOf(r.unitId) ?? '') ?? null,
    })),
  };
}
