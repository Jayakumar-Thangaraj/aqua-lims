import { Router } from 'express';
import { asyncHandler } from '../lib/errors';
import { ViewSetting } from '../models/system';

export const meRouter = Router();

meRouter.get(
  '/view-settings/:key',
  asyncHandler(async (req, res) => {
    const doc: any = await ViewSetting().findOne({ userId: req.user!.id, viewKey: req.params.key }).lean();
    res.json(doc?.settings ?? null);
  }),
);

meRouter.put(
  '/view-settings/:key',
  asyncHandler(async (req, res) => {
    await ViewSetting().updateOne(
      { userId: req.user!.id, viewKey: req.params.key },
      { $set: { settings: req.body ?? {} } },
      { upsert: true },
    );
    res.json({ ok: true });
  }),
);

meRouter.delete(
  '/view-settings/:key',
  asyncHandler(async (req, res) => {
    await ViewSetting().deleteOne({ userId: req.user!.id, viewKey: req.params.key });
    res.json({ ok: true });
  }),
);
