import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import { mergePermissions, type PermissionSet } from '@aqualims/shared';
import { config } from '../config';
import { Role, User } from '../models/system';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function validateNewPassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < 8) return 'The new password must be at least 8 characters long.';
  return null;
}

export function issueSession(res: Response, userId: string): void {
  const token = jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: `${config.sessionIdleMinutes}m` });
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: config.sessionIdleMinutes * 60 * 1000,
    path: '/',
  });
}

export function clearSession(res: Response): void {
  res.clearCookie(config.cookieName, { path: '/' });
}

export function readSession(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export interface SessionUser {
  id: string;
  userName: string;
  changePasswordOnFirstLogon: boolean;
  roleIds: string[];
  perms: PermissionSet;
}

export async function loadSessionUser(userId: string): Promise<SessionUser | null> {
  const user: any = await User().findById(userId).lean();
  if (!user || !user.isActive) return null;
  const roles = await Role().find({ _id: { $in: user.roleIds ?? [] } }).lean();
  return {
    id: String(user._id),
    userName: user.userName,
    changePasswordOnFirstLogon: Boolean(user.changePasswordOnFirstLogon),
    roleIds: (user.roleIds ?? []).map(String),
    perms: mergePermissions(roles as any[]),
  };
}
