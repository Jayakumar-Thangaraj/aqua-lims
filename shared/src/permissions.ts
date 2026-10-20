import { ENTITY_LIST } from './entities';

export const OPERATIONS = ['read', 'create', 'write', 'delete', 'navigate'] as const;
export type Operation = (typeof OPERATIONS)[number];

export interface TypePermission {
  type: string;
  read: boolean;
  create: boolean;
  write: boolean;
  delete: boolean;
  navigate: boolean;
}

export interface PermissionSet {
  isAdministrative: boolean;
  types: Record<string, Omit<TypePermission, 'type'>>;
}

// Every type that can be granted: the domain entities plus the security/audit types.
export const PERMISSION_TYPES: { type: string; caption: string }[] = [
  ...ENTITY_LIST.map((e) => ({ type: e.key, caption: e.caption })),
  { type: 'user', caption: 'User' },
  { type: 'role', caption: 'Role' },
  { type: 'auditLog', caption: 'Audit Log' },
];

export function can(perms: PermissionSet | null | undefined, type: string, op: Operation): boolean {
  if (!perms) return false;
  if (perms.isAdministrative) return true;
  return Boolean(perms.types[type]?.[op]);
}

// Union of the roles' grants (allow wins), as XAF merged role permissions.
export function mergePermissions(roles: { isAdministrative?: boolean; permissions?: TypePermission[] }[]): PermissionSet {
  const result: PermissionSet = { isAdministrative: false, types: {} };
  for (const role of roles) {
    if (role.isAdministrative) result.isAdministrative = true;
    for (const p of role.permissions ?? []) {
      const current = result.types[p.type] ?? { read: false, create: false, write: false, delete: false, navigate: false };
      for (const op of OPERATIONS) current[op] = current[op] || Boolean(p[op]);
      result.types[p.type] = current;
    }
  }
  return result;
}
