// SQL Server (XAF AquaLIMS) -> MongoDB migration (spec §14).
//
// By default only data you created is copied: every business table, plus tables from older versions
// of the model and orphaned rows, which go to "legacy*" archive collections. XAF's own tables
// (security users/roles/permissions, audit trail, model differences, XPObjectType/XPWeakReference)
// are left behind; Aqua LIMS creates its own accounts and starts its own audit trail.
//
//   npm run migrate                    # into an empty database
//   npm run migrate -- --reset         # wipe domain data, audit and legacy archives first (accounts are kept)
//   npm run migrate -- --dry-run       # read and report only
//   npm run migrate -- --with-security # also merge XAF users/roles (password MIGRATED_USER_PASSWORD, change at first login)
//   npm run migrate -- --with-audit    # also copy XAF's audit trail
//   npm run migrate -- --no-legacy     # skip the legacy archive collections
//
// Source: SQLSERVER_CONNECTION (ODBC connection string; Windows authentication by default).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import sql from 'msnodesqlv8';
import {
  ENTITIES,
  OPERATIONS,
  dataFields,
  enumKeyFromIndex,
  round4,
  type EntityDef,
  type EntityKey,
  type FieldDef,
} from '@aqualims/shared';
import { config } from '@aqualims/server/config';
import { connectDb, disconnectDb } from '@aqualims/server/db';
import { modelFor } from '@aqualims/server/models/registry';
import { AuditLog, Role, User } from '@aqualims/server/models/system';
import { hashPassword } from '@aqualims/server/services/auth';
import { clearDomainData, initCounters, isDomainDataPresent } from '@aqualims/server/seed';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const CONNECTION =
  process.env.SQLSERVER_CONNECTION ?? 'Driver={ODBC Driver 17 for SQL Server};Server=(local)\\SQL2022;Database=AquaLIMS;Trusted_Connection=yes;';
const MIGRATED_PASSWORD = process.env.MIGRATED_USER_PASSWORD ?? 'ChangeMe@123';

// Parents before children, referenced records before referencing ones.
const ORDER: EntityKey[] = [
  'measurementType', 'unit', 'category', 'parameter', 'aquaticEnvironment', 'waterSource', 'treatmentType',
  'speciesGroup', 'species', 'speciesParameterLimit', 'tank', 'tankSpecies', 'tankParameterOverride',
  'sample', 'sampleParameter', 'waterPreparation', 'waterPrepSource', 'waterPrepTreatment', 'waterPrepReading',
  'waterChange', 'tankReading', 'tankReadingParameter',
];

// Tables left by earlier versions of the XAF model (no class uses them now) -> archive collections.
const LEGACY_TABLES: { table: string; collection: string }[] = [
  { table: 'Genus', collection: 'legacyGenus' },
  { table: 'Source', collection: 'legacySources' },
  { table: 'SpeciesType', collection: 'legacySpeciesTypes' },
];
const ORPHANS_COLLECTION = 'legacyOrphans';
// Old many-to-many link that some water prep treatments still use instead of their FK column.
const PREP_TREATMENT_LINK = 'WaterPrepTreatmentTreatments_WaterPreparationWaterPreparations';
const SYSTEM_COLUMNS = new Set(['Oid', 'OID', 'GCRecord', 'OptimisticLockField', 'ObjectType']);

interface Report {
  startedAt: string;
  finishedAt?: string;
  dryRun: boolean;
  source: string;
  target: string;
  counts: Record<string, { read: number; inserted: number }>;
  skipped: { table: string; legacyOid: string; reason: string }[];
  warnings: string[];
  users: { userName: string; action: string }[];
  roles: { name: string; action: string; unmappedTypes: string[] }[];
  audit?: { read: number; inserted: number; unmapped: number };
  legacy: { collection: string; source: string; rows: number }[];
  excludedXafTables: string[];
}

const camel = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

// A raw SQL row as a plain document: system columns dropped, GUIDs lower-cased, names camelCased.
function rawDoc(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (SYSTEM_COLUMNS.has(k) || k.startsWith('__')) continue;
    out[camel(k)] = typeof v === 'string' && /^[0-9A-F]{8}-([0-9A-F]{4}-){3}[0-9A-F]{12}$/i.test(v) ? v.toLowerCase() : v;
  }
  return out;
}

function query<T = any>(text: string): Promise<T[]> {
  return new Promise((resolve, reject) => sql.query(CONNECTION, text, (err: any, rows: any) => (err ? reject(err) : resolve(rows ?? []))));
}

const guid = (v: unknown) => (v ? String(v).toLowerCase() : null);

// XAF column names are the property names; references drop our "Id" suffix.
function columnFor(fd: FieldDef): string {
  if (fd.name === 'lcl') return 'LCL';
  if (fd.name === 'ucl') return 'UCL';
  const base = fd.type === 'ref' && fd.name.endsWith('Id') ? fd.name.slice(0, -2) : fd.name;
  return base[0].toUpperCase() + base.slice(1);
}

async function readTable(def: EntityDef): Promise<any[]> {
  if (def.abo)
    return query(
      `SELECT t.*, b.Active AS __Active, b.CreatedDate AS __CreatedDate, b.LastUpdatedDate AS __LastUpdatedDate
       FROM [${def.modelName}] t JOIN AquaBaseObject b ON b.Oid = t.Oid WHERE b.GCRecord IS NULL`,
    );
  return query(`SELECT * FROM [${def.modelName}] WHERE GCRecord IS NULL`);
}

async function main() {
  const report: Report = {
    startedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    source: CONNECTION.replace(/(Pwd|Password)=[^;]*/gi, '$1=***'),
    target: config.mongoUri.replace(/\/\/[^@]*@/, '//***@'),
    counts: {},
    skipped: [],
    warnings: [],
    users: [],
    roles: [],
    legacy: [],
    excludedXafTables: [
      ...(args.has('--with-security') ? [] : ['PermissionPolicyUser', 'PermissionPolicyRole', 'PermissionPolicy*PermissionsObject', 'PermissionPolicyUserUsers_PermissionPolicyRoleRoles']),
      ...(args.has('--with-audit') ? [] : ['AuditDataItemPersistent', 'AuditedObjectWeakReference']),
      'ModelDifference',
      'ModelDifferenceAspect',
      'XPObjectType',
      'XPWeakReference',
    ],
  };
  const orphans: Record<string, unknown>[] = [];

  // 1. Read everything and give every live row its new ObjectId first, so references resolve in any order.
  const rowsByEntity = new Map<EntityKey, any[]>();
  const idMap = new Map<string, { entity: EntityKey; id: mongoose.Types.ObjectId }>();
  for (const key of ORDER) {
    const rows = await readTable(ENTITIES[key]);
    rowsByEntity.set(key, rows);
    for (const row of rows) idMap.set(guid(row.Oid)!, { entity: key, id: new mongoose.Types.ObjectId() });
    report.counts[key] = { read: rows.length, inserted: 0 };
  }

  if (!DRY_RUN) {
    await connectDb(config.mongoUri);
    if (args.has('--reset')) {
      await clearDomainData();
      for (const name of [...LEGACY_TABLES.map((l) => l.collection), ORPHANS_COLLECTION])
        await mongoose.connection.db!.collection(name).deleteMany({});
    } else if (await isDomainDataPresent()) throw new Error('The target database already has data. Run with --reset to replace it.');
  }

  // 2. Convert and insert.
  for (const key of ORDER) {
    const def = ENTITIES[key];
    const docs: any[] = [];
    for (const row of rowsByEntity.get(key)!) {
      const legacyOid = guid(row.Oid)!;
      const doc: any = {
        _id: idMap.get(legacyOid)!.id,
        legacyOid,
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
        createdBy: 'migration',
        updatedBy: 'migration',
        createdAt: row.__CreatedDate ?? new Date(),
        updatedAt: row.__LastUpdatedDate ?? row.__CreatedDate ?? new Date(),
      };
      let skip: string | null = null;
      for (const fd of dataFields(def)) {
        const raw = fd.name === 'active' && def.abo ? row.__Active : row[columnFor(fd)];
        switch (fd.type) {
          case 'ref': {
            const target = guid(raw);
            const mapped = target ? idMap.get(target) : undefined;
            if (target && (!mapped || mapped.entity !== fd.ref)) {
              const msg = `${def.modelName}.${columnFor(fd)} points to ${target}, which is missing or deleted`;
              if (fd.name === def.parentField) skip = msg;
              else report.warnings.push(`${msg} (${legacyOid}); left empty.`);
            }
            if (!target && fd.name === def.parentField) skip = `${def.modelName} has no ${columnFor(fd)} (orphan)`;
            doc[fd.name] = mapped && mapped.entity === fd.ref ? mapped.id : null;
            break;
          }
          case 'enum':
            doc[fd.name] = raw === null || raw === undefined ? fd.defaultValue ?? null : enumKeyFromIndex(fd.enumName!, Number(raw));
            break;
          case 'number':
            doc[fd.name] = raw === null || raw === undefined ? null : round4(Number(raw));
            break;
          case 'integer':
            doc[fd.name] = raw === null || raw === undefined ? 0 : Number(raw);
            break;
          case 'boolean':
            // AquaticEnvironment.Active can be NULL in SQL: treat as inactive.
            doc[fd.name] = raw === null || raw === undefined ? false : Boolean(raw);
            break;
          case 'date':
            doc[fd.name] = raw ? new Date(raw) : null;
            break;
          default:
            doc[fd.name] = raw === null || raw === undefined || String(raw).trim() === '' ? null : String(raw).trim();
        }
      }
      if (key === 'waterChange') doc.alertsSnapshot = [];
      if (skip) {
        report.skipped.push({ table: def.modelName, legacyOid, reason: `${skip} - kept in ${ORPHANS_COLLECTION}` });
        const orphan: Record<string, unknown> = { table: def.modelName, legacyOid, reason: skip, data: rawDoc(row), migratedAt: new Date() };
        if (key === 'waterPrepTreatment') {
          const links = await query(`SELECT WaterPreparations FROM ${PREP_TREATMENT_LINK} WHERE Treatments = '${legacyOid}'`);
          const prepOid = guid(links[0]?.WaterPreparations);
          if (prepOid)
            orphan.linkedVia = { table: PREP_TREATMENT_LINK, waterPreparationLegacyOid: prepOid, waterPreparationId: idMap.get(prepOid)?.id ?? null };
        }
        orphans.push(orphan);
        continue;
      }
      docs.push(doc);
    }
    if (!DRY_RUN && docs.length) {
      try {
        const result = await modelFor(key).collection.insertMany(docs, { ordered: false });
        report.counts[key].inserted = result.insertedCount;
      } catch (e: any) {
        report.counts[key].inserted = e?.result?.insertedCount ?? e?.insertedCount ?? 0;
        for (const we of e?.writeErrors ?? [])
          report.skipped.push({ table: def.modelName, legacyOid: docs[we.index]?.legacyOid, reason: `rejected by MongoDB: ${we.errmsg ?? we.message}` });
      }
    } else report.counts[key].inserted = DRY_RUN ? 0 : docs.length;
  }

  // 3. Legacy tables and orphaned rows -> archive collections (kept, not shown in the app).
  if (!args.has('--no-legacy')) {
    for (const { table, collection } of LEGACY_TABLES) {
      const exists = await query(`SELECT 1 AS x FROM sys.tables WHERE name = '${table}'`);
      if (exists.length === 0) continue;
      const cols = await query(`SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('${table}') AND name = 'GCRecord'`);
      const rows = await query(`SELECT * FROM [${table}]${cols.length ? ' WHERE GCRecord IS NULL' : ''}`);
      const docs = rows.map((r) => ({ legacyOid: guid(r.Oid ?? r.OID), sourceTable: table, ...rawDoc(r), migratedAt: new Date() }));
      if (!DRY_RUN && docs.length) await mongoose.connection.db!.collection(collection).insertMany(docs);
      report.legacy.push({ collection, source: table, rows: docs.length });
    }
    if (!DRY_RUN && orphans.length) await mongoose.connection.db!.collection(ORPHANS_COLLECTION).insertMany(orphans);
    report.legacy.push({ collection: ORPHANS_COLLECTION, source: 'orphaned rows of current tables', rows: orphans.length });
  }

  // 4. Roles and users - XAF security tables, only with --with-security (passwords are never copied).
  const classToType = new Map<string, string>(Object.values(ENTITIES).map((e) => [e.modelName, e.key]));
  classToType.set('PermissionPolicyUser', 'user');
  classToType.set('PermissionPolicyRole', 'role');
  const withSecurity = args.has('--with-security');
  const roles = withSecurity ? await query(`SELECT Oid, Name, IsAdministrative FROM PermissionPolicyRole WHERE GCRecord IS NULL`) : [];
  const typePerms = withSecurity
    ? await query(`SELECT Role, TargetType, ReadState, WriteState, CreateState, DeleteState, NavigateState FROM PermissionPolicyTypePermissionsObject WHERE GCRecord IS NULL`)
    : [];
  const roleIdMap = new Map<string, mongoose.Types.ObjectId>();
  for (const r of roles) {
    const unmapped: string[] = [];
    const permissions = typePerms
      .filter((p) => guid(p.Role) === guid(r.Oid))
      .map((p) => {
        const cls = String(p.TargetType ?? '').split('.').pop() ?? '';
        const type = classToType.get(cls);
        if (!type) {
          unmapped.push(String(p.TargetType));
          return null;
        }
        const allow = (v: unknown) => v === 1 || v === true;
        return { type, read: allow(p.ReadState), write: allow(p.WriteState), create: allow(p.CreateState), delete: allow(p.DeleteState), navigate: allow(p.NavigateState) };
      })
      .filter(Boolean) as any[];
    if (DRY_RUN) {
      report.roles.push({ name: r.Name, action: 'would merge', unmappedTypes: unmapped });
      continue;
    }
    let role: any = await Role().findOne({ name: r.Name }).collation({ locale: 'en', strength: 2 });
    const action = role ? 'merged' : 'created';
    if (!role) role = new (Role())({ name: r.Name });
    role.isAdministrative = Boolean(r.IsAdministrative);
    role.legacyOid = guid(r.Oid);
    if (permissions.length || action === 'created') role.permissions = permissions.map((p) => Object.fromEntries([['type', p.type], ...OPERATIONS.map((op) => [op, p[op]])]));
    await role.save();
    roleIdMap.set(guid(r.Oid)!, role._id);
    report.roles.push({ name: r.Name, action, unmappedTypes: unmapped });
  }

  const users = withSecurity ? await query(`SELECT Oid, UserName, IsActive FROM PermissionPolicyUser WHERE GCRecord IS NULL`) : [];
  const links = withSecurity ? await query(`SELECT Users, Roles FROM PermissionPolicyUserUsers_PermissionPolicyRoleRoles`) : [];
  const migratedHash = DRY_RUN || !withSecurity ? '' : await hashPassword(MIGRATED_PASSWORD);
  for (const u of users) {
    const roleIds = links.filter((l) => guid(l.Users) === guid(u.Oid)).map((l) => roleIdMap.get(guid(l.Roles)!)).filter(Boolean);
    if (DRY_RUN) {
      report.users.push({ userName: u.UserName, action: 'would merge' });
      continue;
    }
    const existing: any = await User().findOne({ userName: u.UserName }).collation({ locale: 'en', strength: 2 });
    if (existing) {
      existing.legacyOid = guid(u.Oid);
      existing.isActive = Boolean(u.IsActive);
      existing.roleIds = [...new Set([...existing.roleIds.map(String), ...roleIds.map(String)])];
      await existing.save();
      report.users.push({ userName: u.UserName, action: 'merged (password kept)' });
    } else {
      await User().create({ userName: u.UserName, passwordHash: migratedHash, isActive: Boolean(u.IsActive), changePasswordOnFirstLogon: true, roleIds, legacyOid: guid(u.Oid) });
      report.users.push({ userName: u.UserName, action: 'created (temporary password, must change at first login)' });
    }
  }

  // 5. XAF audit trail - only with --with-audit.
  if (args.has('--with-audit')) {
    const auditRows = await query(
      `SELECT a.ModifiedOn, a.OperationType, a.PropertyName, a.OldValue, a.NewValue, a.UserName, w.DisplayName, x.TargetKey, o.TypeName
       FROM AuditDataItemPersistent a
       LEFT JOIN AuditedObjectWeakReference w ON w.Oid = a.AuditedObject
       LEFT JOIN XPWeakReference x ON x.Oid = w.Oid
       LEFT JOIN XPObjectType o ON o.OID = x.TargetType
       WHERE a.GCRecord IS NULL`,
    );
    let unmapped = 0;
    const docs = auditRows.map((a) => {
      const cls = String(a.TypeName ?? '').split('.').pop() ?? '';
      const entity = classToType.get(cls) ?? cls;
      const key = /'([0-9a-f-]{36})'/i.exec(String(a.TargetKey ?? ''))?.[1]?.toLowerCase() ?? null;
      const mapped = key ? idMap.get(key) : undefined;
      if (!mapped) unmapped++;
      return {
        at: a.ModifiedOn ? new Date(a.ModifiedOn) : new Date(0),
        userId: null,
        userName: a.UserName ?? null,
        entity,
        entityId: mapped ? String(mapped.id) : key ?? 'unknown',
        entityDisplay: a.DisplayName ?? null,
        operation: a.OperationType ?? 'Unknown',
        property: a.PropertyName ?? null,
        oldValue: a.OldValue ?? null,
        newValue: a.NewValue ?? null,
        parentEntity: null,
        parentId: null,
      };
    });
    if (!DRY_RUN && docs.length) await AuditLog().collection.insertMany(docs, { ordered: false });
    report.audit = { read: auditRows.length, inserted: DRY_RUN ? 0 : docs.length, unmapped };
  }

  if (!DRY_RUN) await initCounters();
  report.finishedAt = new Date().toISOString();
  const file = path.resolve(here, `../migration-report-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));

  console.log(`${DRY_RUN ? 'Dry run' : 'Migration'} finished. Report: ${file}`);
  for (const [k, c] of Object.entries(report.counts)) console.log(`  ${k.padEnd(24)} read ${String(c.read).padStart(4)}  inserted ${String(c.inserted).padStart(4)}`);
  if (report.audit) console.log(`  auditLogs                read ${String(report.audit.read).padStart(4)}  inserted ${String(report.audit.inserted).padStart(4)}`);
  for (const l of report.legacy) console.log(`  ${l.collection.padEnd(24)} archived ${String(l.rows).padStart(4)}  (from ${l.source})`);
  console.log(`  not migrated (XAF framework tables): ${report.excludedXafTables.join(', ')}`);
  console.log(`  skipped: ${report.skipped.length}, warnings: ${report.warnings.length}`);
  for (const s of report.skipped) console.log(`   - ${s.table} ${s.legacyOid}: ${s.reason}`);
  for (const u of report.users) console.log(`  user ${u.userName}: ${u.action}`);
}

main()
  .catch((e) => {
    console.error('Migration failed:', e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => (DRY_RUN ? undefined : disconnectDb()));
