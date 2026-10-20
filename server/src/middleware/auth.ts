import type { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { HttpError } from '../lib/errors';
import { issueSession, loadSessionUser, readSession, type SessionUser } from '../services/auth';
import type { Ctx } from '../services/crud';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

// Valid session required; the cookie is re-issued on every request (10-minute sliding idle timeout).
export function requireAuth(options: { allowPasswordChange?: boolean } = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = readSession(req.cookies?.[config.cookieName]);
      if (!userId) throw new HttpError(401, 'Your session has expired. Please log in again.', 'UNAUTHENTICATED');
      const user = await loadSessionUser(userId);
      if (!user) throw new HttpError(401, 'Your session has expired. Please log in again.', 'UNAUTHENTICATED');
      if (user.changePasswordOnFirstLogon && !options.allowPasswordChange)
        throw new HttpError(403, 'You must change your password before continuing.', 'PASSWORD_CHANGE_REQUIRED');
      req.user = user;
      issueSession(res, user.id);
      next();
    } catch (e) {
      next(e);
    }
  };
}

export function ctxOf(req: Request): Ctx {
  const user = req.user!;
  return { user: { id: user.id, userName: user.userName }, perms: user.perms };
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user?.perms.isAdministrative) return next(new HttpError(403, 'Administrators only.', 'FORBIDDEN'));
  next();
}
