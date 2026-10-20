import { Router } from 'express';
import mongoose from 'mongoose';
import {
  ENTITIES,
  entityByPath,
  evaluateResult,
  formatDate,
  getField,
  getTankHealth,
  resolveEffectiveLimits,
  type EntityDef,
} from '@aqualims/shared';
import { asyncHandler, notFound } from '../lib/errors';
import { ctxOf } from '../middleware/auth';
import { modelFor } from '../models/registry';
import { previewCode } from '../services/codes';
import { tankExtras } from '../services/computed';
import { requirePermission, waterChangeCheck } from '../services/crud';
import { LabelResolver, idOf } from '../services/labels';
import { loadParameters, loadTankCalcs } from '../services/tankContext';

export const domainRouter = Router();
const live = { isDeleted: false };

domainRouter.get(
  '/tanks/:id/effective-limits',
  asyncHandler(async (req, res) => {
    requirePermission(ctxOf(req), 'tank', 'read');
    if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Tank');
    const tanks = await loadTankCalcs([req.params.id]);
    if (!tanks.has(req.params.id)) throw notFound('Tank');
    res.json(tankExtras(tanks.get(req.params.id)));
  }),
);

domainRouter.get(
  '/tanks/:id/health',
  asyncHandler(async (req, res) => {
    requirePermission(ctxOf(req), 'tank', 'read');
    const tanks = await loadTankCalcs([req.params.id], { results: true });
    if (!tanks.has(req.params.id)) throw notFound('Tank');
    res.json(getTankHealth(tanks.get(req.params.id)));
  }),
);

// Limit + Status for unsaved grid rows (live preview while typing).
domainRouter.post(
  '/limits/evaluate',
  asyncHandler(async (req, res) => {
    const tankId = idOf(req.body?.tankId);
    const rows: { parameterId?: string; measuredValue?: number }[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const params = await loadParameters();
    const valid = tankId && mongoose.isValidObjectId(tankId);
    const tanks = valid ? await loadTankCalcs([tankId!], { params }) : new Map();
    const limits = valid && tanks.has(tankId!) ? resolveEffectiveLimits(tanks.get(tankId!)) : null;
    res.json(
      rows.map((r) => {
        const value = r.measuredValue === null || r.measuredValue === undefined || (r.measuredValue as unknown) === '' ? null : Number(r.measuredValue);
        const e = evaluateResult(limits, params.byId.get(idOf(r.parameterId) ?? ''), value ?? 0);
        return value === null ? { ...e, resultStatus: e.limitRange ? e.resultStatus : 'NoLimit', isOutOfRange: false } : e;
      }),
    );
  }),
);

domainRouter.get(
  '/water-changes/check',
  asyncHandler(async (req, res) => {
    requirePermission(ctxOf(req), 'waterChange', 'read');
    const tankId = idOf(req.query.tankId);
    const prepId = idOf(req.query.waterPreparationId);
    res.json(
      await waterChangeCheck(
        tankId && mongoose.isValidObjectId(tankId) ? tankId : null,
        prepId && mongoose.isValidObjectId(prepId) ? prepId : null,
        typeof req.query.overrideNote === 'string' ? req.query.overrideNote : null,
      ),
    );
  }),
);

domainRouter.get(
  '/water-preparations/next-code',
  asyncHandler(async (req, res) => {
    requirePermission(ctxOf(req), 'waterPreparation', 'create');
    res.json({ code: await previewCode('WP') });
  }),
);

domainRouter.get(
  '/water-changes/next-code',
  asyncHandler(async (req, res) => {
    requirePermission(ctxOf(req), 'waterChange', 'create');
    res.json({ code: await previewCode('WC') });
  }),
);

// Source species for "Copy from Species": other species that have at least one limit.
domainRouter.get(
  '/species/:id/copy-sources',
  asyncHandler(async (req, res) => {
    requirePermission(ctxOf(req), 'species', 'read');
    const exclude = mongoose.isValidObjectId(req.params.id) ? req.params.id : null;
    const counts = await modelFor('speciesParameterLimit').aggregate([
      { $match: { ...live, parameterId: { $ne: null } } },
      { $group: { _id: '$speciesId', count: { $sum: 1 } } },
    ]);
    const ids = counts.map((c: any) => c._id).filter((id: any) => id && String(id) !== exclude);
    const species = await modelFor('species').find({ ...live, _id: { $in: ids } }).select('speciesName commonName active').lean();
    const countOf = new Map(counts.map((c: any) => [String(c._id), c.count]));
    res.json(
      (species as any[])
        .map((s) => ({ _id: String(s._id), speciesName: s.speciesName, commonName: s.commonName, active: s.active, limitCount: countOf.get(String(s._id)) ?? 0 }))
        .sort((a, b) => a.speciesName.localeCompare(b.speciesName)),
    );
  }),
);

domainRouter.get(
  '/species/:id/limits',
  asyncHandler(async (req, res) => {
    requirePermission(ctxOf(req), 'speciesParameterLimit', 'read');
    if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Species');
    const limits = await modelFor('speciesParameterLimit').find({ ...live, speciesId: req.params.id, parameterId: { $ne: null } }).lean();
    const resolver = new LabelResolver();
    const [names, symbols] = await Promise.all([
      resolver.labels('parameter', limits.map((l: any) => idOf(l.parameterId))),
      resolver.labels('unit', limits.map((l: any) => idOf(l.unitId)), 'unitSymbol'),
    ]);
    res.json(
      (limits as any[])
        .map((l) => ({
          _id: String(l._id),
          parameterId: idOf(l.parameterId),
          parameter: names.get(idOf(l.parameterId) ?? '') ?? '',
          unitId: idOf(l.unitId),
          unit: symbols.get(idOf(l.unitId) ?? '') ?? '',
          lcl: l.lcl,
          ucl: l.ucl,
          optimalValue: l.optimalValue,
          notes: l.notes,
        }))
        .sort((a, b) => a.parameter.localeCompare(b.parameter)),
    );
  }),
);

// Light lists for dropdowns. Category / Measurement Type / Unit / Aquatic Environment show active records only.
domainRouter.get(
  '/lookups/:resource',
  asyncHandler(async (req, res) => {
    const def: EntityDef | undefined = entityByPath(req.params.resource);
    if (!def) throw notFound('Resource');
    requirePermission(ctxOf(req), def.key, 'read');
    const labelField = typeof req.query.labelField === 'string' && getField(def, req.query.labelField) ? req.query.labelField : def.displayField;
    const docs = await modelFor(def.key).find(live).lean();
    const resolver = new LabelResolver();
    const extraColumns = def.lookup?.columns ?? [];
    const refFields = def.fields.filter((f) => f.type === 'ref' && (f.name === labelField || f.name === def.displayField));
    const refLabels = new Map<string, Map<string, string>>();
    await Promise.all(refFields.map(async (fd) => refLabels.set(fd.name, await resolver.labels(fd.ref!, docs.map((d: any) => idOf(d[fd.name])), fd.refLabel))));
    const text = (d: any, name: string) => {
      const fd = getField(def, name);
      if (fd?.type === 'ref') return refLabels.get(name)?.get(idOf(d[name]) ?? '') ?? '';
      if (fd?.type === 'date') return formatDate(d[name]);
      return d[name] == null ? '' : String(d[name]);
    };
    let items = (docs as any[]).map((d) => ({
      _id: String(d._id),
      label: text(d, labelField) || text(d, def.displayField),
      inactive: def.hasActive ? d.active === false : false,
      columns: Object.fromEntries(extraColumns.map((c) => [c, text(d, c)])),
      sortOrder: d.sortOrder ?? 0,
      status: d.status ?? null,
      defaultUnitId: idOf(d.defaultUnitId),
    }));
    if (def.lookup?.activeOnly) items = items.filter((i) => !i.inactive);
    const sortBy = def.lookup?.sortBy ?? [];
    items.sort((a, b) => {
      if (def.key === 'waterPreparation') {
        const rank = (s: string | null) => (s === 'Ready' ? 0 : s === 'PartiallyUsed' ? 1 : s === 'Preparing' ? 2 : 3);
        const r = rank(a.status) - rank(b.status);
        if (r !== 0) return r;
        return b.label.localeCompare(a.label);
      }
      if (sortBy[0] === 'sortOrder' && a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.label.localeCompare(b.label);
    });
    res.json(items);
  }),
);

// Data for the Home dashboard.
domainRouter.get(
  '/home',
  asyncHandler(async (req, res) => {
    const ctx = ctxOf(req);
    const canRead = (key: string) => ctx.perms.isAdministrative || Boolean(ctx.perms.types[key]?.read);
    const out: Record<string, unknown> = {};
    const resolver = new LabelResolver();

    if (canRead('tank')) {
      const tanks = await modelFor('tank').find({ ...live, active: { $ne: false } }).sort({ tankName: 1 }).lean();
      const calcs = await loadTankCalcs(tanks.map((t: any) => String(t._id)), { results: true });
      out.tanks = (tanks as any[]).map((t) => ({ _id: String(t._id), tankName: t.tankName, tankCode: t.tankCode, ...getTankHealth(calcs.get(String(t._id))) }));
    }

    if (canRead('sampleParameter') || canRead('tankReadingParameter')) {
      const params = await loadParameters();
      const results: any[] = [];
      if (canRead('sampleParameter')) {
        const sps = await modelFor('sampleParameter').find(live).sort({ testedDate: -1 }).limit(300).lean();
        const samples = await modelFor('sample').find({ _id: { $in: sps.map((s: any) => s.sampleId) } }).select('tankId sampleCode').lean();
        const sampleById = new Map((samples as any[]).map((s) => [String(s._id), s]));
        for (const sp of sps as any[]) {
          const s = sampleById.get(idOf(sp.sampleId) ?? '');
          if (s) results.push({ kind: 'Sample', source: s.sampleCode, sourceId: String(s._id), tankId: idOf(s.tankId), parameterId: idOf(sp.parameterId), value: sp.measuredValue, unitId: idOf(sp.unitId), at: sp.testedDate });
        }
      }
      if (canRead('tankReadingParameter')) {
        const rps = await modelFor('tankReadingParameter').find(live).sort({ createdAt: -1 }).limit(300).lean();
        const readings = await modelFor('tankReading').find({ _id: { $in: rps.map((r: any) => r.tankReadingId) } }).select('tankId readingDate').lean();
        const readingById = new Map((readings as any[]).map((r) => [String(r._id), r]));
        for (const rp of rps as any[]) {
          const r = readingById.get(idOf(rp.tankReadingId) ?? '');
          if (r) results.push({ kind: 'Tank Reading', source: formatDate(r.readingDate), sourceId: String(r._id), tankId: idOf(r.tankId), parameterId: idOf(rp.parameterId), value: rp.measuredValue, unitId: idOf(rp.unitId), at: r.readingDate });
        }
      }
      const calcs = await loadTankCalcs(results.map((r) => r.tankId), { params });
      const tankNames = await resolver.labels('tank', results.map((r) => r.tankId));
      const units = await resolver.labels('unit', results.map((r) => r.unitId), 'unitSymbol');
      out.outOfRange = results
        .map((r) => {
          const e = evaluateResult(calcs.has(r.tankId) ? resolveEffectiveLimits(calcs.get(r.tankId)) : null, params.byId.get(r.parameterId ?? ''), r.value);
          return { ...r, tank: tankNames.get(r.tankId) ?? '', parameter: params.byId.get(r.parameterId ?? '')?.name ?? '', unit: units.get(r.unitId ?? '') ?? '', ...e, limit: undefined };
        })
        .filter((r) => r.isOutOfRange)
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, 10);
    }

    if (canRead('waterChange')) {
      const changes = await modelFor('waterChange').find(live).sort({ changeDate: -1, createdAt: -1 }).limit(5).lean();
      const tankNames = await resolver.labels('tank', changes.map((c: any) => idOf(c.tankId)));
      out.recentWaterChanges = (changes as any[]).map((c) => ({
        _id: String(c._id),
        changeCode: c.changeCode,
        tank: tankNames.get(idOf(c.tankId) ?? '') ?? '',
        status: c.status,
        changeDate: c.changeDate,
        overrideUsed: Boolean(c.overrideNote && String(c.overrideNote).trim()) && (c.alertsSnapshot ?? []).some((a: any) => a.severity === 'OutOfRange'),
      }));
    }
    out.can = {
      sample: ctx.perms.isAdministrative || Boolean(ctx.perms.types.sample?.create),
      tankReading: ctx.perms.isAdministrative || Boolean(ctx.perms.types.tankReading?.create),
      waterPreparation: ctx.perms.isAdministrative || Boolean(ctx.perms.types.waterPreparation?.create),
      waterChange: ctx.perms.isAdministrative || Boolean(ctx.perms.types.waterChange?.create),
    };
    res.json(out);
  }),
);

export { ENTITIES };
