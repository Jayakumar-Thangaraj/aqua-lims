import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { HttpError, asyncHandler } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import { AuditLog, User } from '../models/system';
import { clearSession, hashPassword, issueSession, loadSessionUser, validateNewPassword, verifyPassword } from '../services/auth';

export const authRouter = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.isTest ? 1000 : 20, standardHeaders: true, legacyHeaders: false });

function meResponse(user: NonNullable<Awaited<ReturnType<typeof loadSessionUser>>>) {
  return {
    user: { id: user.id, userName: user.userName, changePasswordOnFirstLogon: user.changePasswordOnFirstLogon },
    permissions: user.perms,
    sessionIdleMinutes: config.sessionIdleMinutes,
  };
}

authRouter.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { userName, password } = req.body ?? {};
    const invalid = new HttpError(401, 'Invalid user name or password.', 'INVALID_CREDENTIALS');
    if (typeof userName !== 'string' || typeof password !== 'string' || !userName.trim()) throw invalid;
    const user: any = await User().findOne({ userName: userName.trim() }).collation({ locale: 'en', strength: 2 });
    if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) throw invalid;
    user.lastLoginAt = new Date();
    await user.save();
    issueSession(res, String(user._id));
    res.json(meResponse((await loadSessionUser(String(user._id)))!));
  }),
);

authRouter.post('/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

authRouter.get(
  '/me',
  requireAuth({ allowPasswordChange: true }),
  asyncHandler(async (req, res) => {
    res.json(meResponse(req.user!));
  }),
);

authRouter.post(
  '/change-password',
  requireAuth({ allowPasswordChange: true }),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    const user: any = await User().findById(req.user!.id);
    if (!user || !(await verifyPassword(String(currentPassword ?? ''), user.passwordHash)))
      throw new HttpError(422, 'The current password is incorrect.', 'VALIDATION', [
        { field: 'currentPassword', rule: 'password', message: 'The current password is incorrect.' },
      ]);
    const problem = validateNewPassword(newPassword);
    if (problem) throw new HttpError(422, problem, 'VALIDATION', [{ field: 'newPassword', rule: 'password', message: problem }]);
    if (newPassword === currentPassword)
      throw new HttpError(422, 'Choose a password different from the current one.', 'VALIDATION', [
        { field: 'newPassword', rule: 'password', message: 'Choose a password different from the current one.' },
      ]);
    user.passwordHash = await hashPassword(newPassword);
    user.changePasswordOnFirstLogon = false;
    await user.save();
    await AuditLog().create({
      at: new Date(),
      userId: req.user!.id,
      userName: req.user!.userName,
      entity: 'user',
      entityId: String(user._id),
      entityDisplay: user.userName,
      operation: 'ObjectChanged',
      property: 'password',
    });
    res.json(meResponse((await loadSessionUser(String(user._id)))!));
  }),
);
