import { Router, type Request } from 'express';
import { entityByPath, type EntityDef } from '@aqualims/shared';
import { HttpError, asyncHandler, notFound } from '../lib/errors';
import { ctxOf } from '../middleware/auth';
import { createRecord, deleteRecords, getRecord, listRecords, updateRecord, type ListQuery } from '../services/crud';
import { buildExport, type ExportFormat } from '../services/export';

export const entitiesRouter = Router();

function defOf(req: Request): EntityDef {
  const def = entityByPath(req.params.resource);
  if (!def) throw notFound('Resource');
  return def;
}

function parseQuery(req: Request): ListQuery {
  const q = req.query as Record<string, any>;
  const pageSize = q.pageSize === undefined ? 20 : Number(q.pageSize);
  const page = Number(q.page);
  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    pageSize: Number.isInteger(pageSize) && pageSize >= 0 ? pageSize : 20,
    sort: typeof q.sort === 'string' ? q.sort : undefined,
    q: typeof q.q === 'string' ? q.q : undefined,
    filter: typeof q.filter === 'object' && q.filter ? (q.filter as Record<string, Record<string, string>>) : undefined,
  };
}

entitiesRouter.get(
  '/:resource',
  asyncHandler(async (req, res) => {
    res.json(await listRecords(defOf(req), parseQuery(req), ctxOf(req)));
  }),
);

entitiesRouter.post(
  '/:resource/bulk-delete',
  asyncHandler(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    res.json(await deleteRecords(defOf(req), ids, ctxOf(req)));
  }),
);

entitiesRouter.post(
  '/:resource/export',
  asyncHandler(async (req, res) => {
    const def = defOf(req);
    const format = String(req.body?.format ?? 'csv') as ExportFormat;
    if (!['csv', 'xlsx', 'pdf'].includes(format)) throw new HttpError(400, 'Unsupported export format.');
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    const columns = Array.isArray(req.body?.columns) && req.body.columns.length ? req.body.columns : def.listColumns.map((c) => ({ id: c.field }));
    const { items } = await listRecords(def, { ids, pageSize: 0 }, ctxOf(req));
    const byId = new Map(items.map((r) => [r._id, r]));
    const rows = ids.length ? ids.map((id) => byId.get(id)).filter(Boolean) : items;
    const file = await buildExport(def, rows, columns, format);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${def.apiPath}.${file.extension}"`);
    res.send(file.buffer);
  }),
);

entitiesRouter.get(
  '/:resource/:id',
  asyncHandler(async (req, res) => {
    res.json(await getRecord(defOf(req), req.params.id, ctxOf(req)));
  }),
);

entitiesRouter.post(
  '/:resource',
  asyncHandler(async (req, res) => {
    res.status(201).json(await createRecord(defOf(req), req.body ?? {}, ctxOf(req)));
  }),
);

entitiesRouter.put(
  '/:resource/:id',
  asyncHandler(async (req, res) => {
    res.json(await updateRecord(defOf(req), req.params.id, req.body ?? {}, ctxOf(req)));
  }),
);

entitiesRouter.delete(
  '/:resource/:id',
  asyncHandler(async (req, res) => {
    const result = await deleteRecords(defOf(req), [req.params.id], ctxOf(req));
    if (result.errors.length) throw new HttpError(409, result.errors[0].message, 'IN_USE');
    res.json(result);
  }),
);
