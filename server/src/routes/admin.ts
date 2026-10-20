import { Router } from 'express';
import mongoose from 'mongoose';
import { OPERATIONS, PERMISSION_TYPES } from '@aqualims/shared';
import { HttpError, asyncHandler, notFound } from '../lib/errors';
import { requireAdmin } from '../middleware/auth';
import { AuditLog, Role, User } from '../models/system';
import { hashPassword, validateNewPassword } from '../services/auth';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

const CI = { locale: 'en', strength: 2 };
const fieldError = (field: string, message: string) => new HttpError(422, message, 'VALIDATION', [{ field, rule: 'invalid', message }]);

// A malformed id is "not found", not a server error.
async function findOr404(model: mongoose.Model<any>, id: string, what: string): Promise<any> {
  const doc = mongoose.isValidObjectId(id) ? await model.findById(id) : null;
  if (!doc) throw notFound(what);
  return doc;
}

// Nobody may take away their own administrator access; this also guarantees one administrator always remains.
async function keepsAdminAccess(roleIds: unknown[], changedRole?: { id: string; isAdministrative: boolean }): Promise<boolean> {
  const roles = await Role().find({ _id: { $in: roleIds } }).lean();
  return (roles as any[]).some((r) => (changedRole && String(r._id) === changedRole.id ? changedRole.isAdministrative : r.isAdministrative));
}

async function logAdmin(req: any, entity: string, id: string, display: string, operation: string, property?: string) {
  await AuditLog().create({ at: new Date(), userId: req.user.id, userName: req.user.userName, entity, entityId: id, entityDisplay: display, operation, property: property ?? null });
}

function userOut(u: any, roles: Map<string, string>) {
  return {
    _id: String(u._id),
    userName: u.userName,
    isActive: u.isActive,
    changePasswordOnFirstLogon: u.changePasswordOnFirstLogon,
    roleIds: (u.roleIds ?? []).map(String),
    roles: (u.roleIds ?? []).map((r: any) => roles.get(String(r)) ?? '').filter(Boolean),
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}

async function roleNames() {
  return new Map<string, string>(((await Role().find().lean()) as any[]).map((r) => [String(r._id), r.name]));
}

adminRouter.get('/permission-types', (_req, res) => res.json({ types: PERMISSION_TYPES, operations: OPERATIONS }));

adminRouter.get(
  '/users',
  asyncHandler(async (_req, res) => {
    const roles = await roleNames();
    const users = await User().find().sort({ userName: 1 }).collation(CI).lean();
    res.json(users.map((u) => userOut(u, roles)));
  }),
);

async function validRoleIds(ids: unknown): Promise<mongoose.Types.ObjectId[]> {
  const list = Array.isArray(ids) ? ids.map(String).filter((x) => mongoose.isValidObjectId(x)) : [];
  const found = await Role().find({ _id: { $in: list } }).select('_id').lean();
  return found.map((r: any) => r._id);
}

adminRouter.post(
  '/users',
  asyncHandler(async (req, res) => {
    const userName = String(req.body?.userName ?? '').trim();
    if (!userName) throw fieldError('userName', '"User Name" must not be empty.');
    if (await User().findOne({ userName }).collation(CI)) throw fieldError('userName', 'A user with this name already exists.');
    const problem = validateNewPassword(req.body?.password);
    if (problem) throw fieldError('password', problem);
    const user: any = await User().create({
      userName,
      passwordHash: await hashPassword(req.body.password),
      isActive: req.body?.isActive !== false,
      changePasswordOnFirstLogon: req.body?.changePasswordOnFirstLogon !== false,
      roleIds: await validRoleIds(req.body?.roleIds),
    });
    await logAdmin(req, 'user', String(user._id), userName, 'ObjectCreated');
    res.status(201).json(userOut(user.toObject(), await roleNames()));
  }),
);

adminRouter.put(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const user: any = await findOr404(User(), req.params.id, 'User');
    if (req.body?.userName !== undefined) {
      const userName = String(req.body.userName).trim();
      if (!userName) throw fieldError('userName', '"User Name" must not be empty.');
      const clash = await User().findOne({ userName, _id: { $ne: user._id } }).collation(CI);
      if (clash) throw fieldError('userName', 'A user with this name already exists.');
      user.userName = userName;
    }
    if (req.body?.isActive !== undefined) {
      if (String(user._id) === req.user!.id && req.body.isActive === false) throw fieldError('isActive', "You can't deactivate your own account.");
      user.isActive = Boolean(req.body.isActive);
    }
    if (req.body?.changePasswordOnFirstLogon !== undefined) user.changePasswordOnFirstLogon = Boolean(req.body.changePasswordOnFirstLogon);
    if (req.body?.roleIds !== undefined) {
      const roleIds = await validRoleIds(req.body.roleIds);
      if (String(user._id) === req.user!.id && !(await keepsAdminAccess(roleIds)))
        throw fieldError('roleIds', "You can't remove your own administrator access.");
      user.roleIds = roleIds;
    }
    await user.save();
    await logAdmin(req, 'user', String(user._id), user.userName, 'ObjectChanged');
    res.json(userOut(user.toObject(), await roleNames()));
  }),
);

adminRouter.post(
  '/users/:id/reset-password',
  asyncHandler(async (req, res) => {
    const user: any = await findOr404(User(), req.params.id, 'User');
    const problem = validateNewPassword(req.body?.password);
    if (problem) throw fieldError('password', problem);
    user.passwordHash = await hashPassword(req.body.password);
    user.changePasswordOnFirstLogon = true;
    await user.save();
    await logAdmin(req, 'user', String(user._id), user.userName, 'ObjectChanged', 'password');
    res.json({ ok: true });
  }),
);

function cleanPermissions(input: unknown) {
  const known = new Set(PERMISSION_TYPES.map((t) => t.type));
  return (Array.isArray(input) ? input : [])
    .filter((p: any) => p && known.has(p.type))
    .map((p: any) => Object.fromEntries([['type', p.type], ...OPERATIONS.map((op) => [op, Boolean(p[op])])]));
}

adminRouter.get(
  '/roles',
  asyncHandler(async (_req, res) => {
    const roles = await Role().find().sort({ name: 1 }).collation(CI).lean();
    const counts = await User().aggregate([{ $unwind: '$roleIds' }, { $group: { _id: '$roleIds', count: { $sum: 1 } } }]);
    const countOf = new Map(counts.map((c: any) => [String(c._id), c.count]));
    res.json((roles as any[]).map((r) => ({ _id: String(r._id), name: r.name, isAdministrative: r.isAdministrative, permissions: r.permissions ?? [], userCount: countOf.get(String(r._id)) ?? 0 })));
  }),
);

adminRouter.post(
  '/roles',
  asyncHandler(async (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    if (!name) throw fieldError('name', '"Name" must not be empty.');
    if (await Role().findOne({ name }).collation(CI)) throw fieldError('name', 'A role with this name already exists.');
    const role: any = await Role().create({ name, isAdministrative: Boolean(req.body?.isAdministrative), permissions: cleanPermissions(req.body?.permissions) });
    await logAdmin(req, 'role', String(role._id), name, 'ObjectCreated');
    res.status(201).json({ ...role.toObject(), _id: String(role._id) });
  }),
);

adminRouter.put(
  '/roles/:id',
  asyncHandler(async (req, res) => {
    const role: any = await findOr404(Role(), req.params.id, 'Role');
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) throw fieldError('name', '"Name" must not be empty.');
      if (await Role().findOne({ name, _id: { $ne: role._id } }).collation(CI)) throw fieldError('name', 'A role with this name already exists.');
      role.name = name;
    }
    if (req.body?.isAdministrative !== undefined) {
      const isAdministrative = Boolean(req.body.isAdministrative);
      if (!isAdministrative && !(await keepsAdminAccess(req.user!.roleIds, { id: String(role._id), isAdministrative })))
        throw fieldError('isAdministrative', "You can't remove administrator access from a role you depend on.");
      role.isAdministrative = isAdministrative;
    }
    if (req.body?.permissions !== undefined) role.permissions = cleanPermissions(req.body.permissions);
    await role.save();
    await logAdmin(req, 'role', String(role._id), role.name, 'ObjectChanged');
    res.json({ ...role.toObject(), _id: String(role._id) });
  }),
);

adminRouter.delete(
  '/roles/:id',
  asyncHandler(async (req, res) => {
    const role: any = await findOr404(Role(), req.params.id, 'Role');
    const users = await User().countDocuments({ roleIds: role._id });
    if (users > 0) throw new HttpError(409, `The role "${role.name}" is assigned to ${users} user(s) and can't be deleted.`, 'IN_USE');
    await role.deleteOne();
    await logAdmin(req, 'role', String(role._id), role.name, 'ObjectDeleted');
    res.json({ ok: true });
  }),
);

adminRouter.get(
  '/audit-logs',
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string>;
    const filter: Record<string, unknown> = {};
    if (q.entity) filter.entity = q.entity;
    if (q.entityId) filter.entityId = q.entityId;
    if (q.operation) filter.operation = q.operation;
    if (q.userName) filter.userName = new RegExp(`^${q.userName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const from = q.from ? new Date(q.from) : null;
    const to = q.to ? new Date(q.to) : null;
    const at: Record<string, Date> = {};
    if (from && !Number.isNaN(from.getTime())) at.$gte = from;
    if (to && !Number.isNaN(to.getTime())) {
      to.setDate(to.getDate() + 1);
      at.$lt = to;
    }
    if (Object.keys(at).length) filter.at = at;
    const size = Number(q.pageSize ?? 50);
    const pageSize = Number.isInteger(size) ? Math.min(200, Math.max(1, size)) : 50;
    const pageNo = Number(q.page ?? 1);
    const page = Number.isInteger(pageNo) && pageNo >= 1 ? pageNo : 1;
    const [items, total] = await Promise.all([
      AuditLog().find(filter).sort({ at: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      AuditLog().countDocuments(filter),
    ]);
    res.json({ items: items.map((i: any) => ({ ...i, _id: String(i._id) })), total });
  }),
);
