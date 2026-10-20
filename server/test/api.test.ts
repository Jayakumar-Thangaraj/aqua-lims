import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { codePrefix } from '@aqualims/shared';
import { createApp } from '../src/app';
import { connectDb, disconnectDb } from '../src/db';
import { seedReferenceData, seedSecurity } from '../src/seed';
import { config } from '../src/config';
import { AuditLog } from '../src/models/system';

let replSet: MongoMemoryReplSet;
const app = createApp();
const admin = request.agent(app);
const NEW_ADMIN_PASSWORD = 'Admin-Strong-123';

async function idOf(path: string, field: string, value: string): Promise<string> {
  const res = await admin.get(`/api/${path}`).query({ pageSize: 0 });
  const row = res.body.items.find((r: any) => r[field] === value);
  if (!row) throw new Error(`${path}: ${value} not found`);
  return row._id;
}

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ binary: { version: '7.0.14' }, replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await connectDb(replSet.getUri('aqualims_test'));
  await seedSecurity();
  await seedReferenceData({ demo: true });
}, 600_000);

afterAll(async () => {
  await disconnectDb();
  await replSet?.stop();
});

describe('authentication & security (§7)', () => {
  it('rejects bad credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ userName: 'Admin', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid user name or password.');
  });

  it('forces a password change for seeded accounts before business access', async () => {
    const login = await admin.post('/api/auth/login').send({ userName: 'admin', password: config.seedAdminPassword });
    expect(login.status).toBe(200);
    expect(login.body.user.changePasswordOnFirstLogon).toBe(true);
    const blocked = await admin.get('/api/tanks');
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    const changed = await admin.post('/api/auth/change-password').send({ currentPassword: config.seedAdminPassword, newPassword: NEW_ADMIN_PASSWORD });
    expect(changed.status).toBe(200);
    expect((await admin.get('/api/tanks')).status).toBe(200);
  });

  it('31. Default-role user can manage own password but gets 403 on business data', async () => {
    const user = request.agent(app);
    await user.post('/api/auth/login').send({ userName: 'User', password: config.seedUserPassword }).expect(200);
    await user.post('/api/auth/change-password').send({ currentPassword: config.seedUserPassword, newPassword: 'User-Strong-123' }).expect(200);
    const me = await user.get('/api/auth/me');
    expect(me.body.permissions.isAdministrative).toBe(false);
    expect((await user.get('/api/tanks')).status).toBe(403);
    expect((await user.get('/api/admin/users')).status).toBe(403);
  });

  it('32. an expired or invalid session is rejected', async () => {
    const res = await request(app).get('/api/tanks').set('Cookie', `${config.cookieName}=not-a-token`);
    expect(res.status).toBe(401);
  });
});

describe('computed columns (§5)', () => {
  it('8/9. tank health in the list', async () => {
    const res = await admin.get('/api/tanks').query({ pageSize: 0 });
    const t001 = res.body.items.find((t: any) => t.tankCode === 'T001');
    const t002 = res.body.items.find((t: any) => t.tankCode === 'T002');
    expect(t001).toMatchObject({ healthLevel: 'Stable', healthSummary: 'The latest result is within its limit.' });
    expect(t002).toMatchObject({ healthLevel: 'NoData', healthSummary: 'No results yet for the parameters that have limits.' });
    expect(t001._labels.sourceId).toBe('Freshwater');
  });

  it('1. effective limits of T001', async () => {
    const id = await idOf('tanks', 'tankCode', 'T001');
    const res = await admin.get(`/api/tanks/${id}`);
    const byCode = Object.fromEntries(res.body.effectiveLimits.map((l: any) => [l.parameterCode, l]));
    expect(Object.keys(byCode)).toHaveLength(7);
    expect(byCode.pH).toMatchObject({ lcl: 6, ucl: 7.5, source: 'Tank override' });
    expect(res.body.children.tankSpecies).toHaveLength(4);
    expect(res.body.children.tankSpecies[0]._labels.speciesId).toBe('Green Bronze Cory');
  });

  it('5. sample results carry limit and status', async () => {
    const id = await idOf('samples', 'sampleCode', '01');
    const res = await admin.get(`/api/samples/${id}`);
    expect(res.body.children.sampleParameters[0]).toMatchObject({ limitRange: '6.00 – 7.50', resultStatus: 'OK', isOutOfRange: false });
    const list = await admin.get('/api/sample-parameters').query({ pageSize: 0 });
    expect(list.body.items[0]).toMatchObject({ limitRange: '6.00 – 7.50', resultStatus: 'OK' });
  });

  it('live evaluation of unsaved rows', async () => {
    const tankId = await idOf('tanks', 'tankCode', 'T001');
    const ph = await idOf('parameters', 'parameterCode', 'pH');
    const res = await admin.post('/api/limits/evaluate').send({ tankId, rows: [{ parameterId: ph, measuredValue: 5.99 }, { parameterId: ph, measuredValue: 7 }] });
    expect(res.body.map((r: any) => r.resultStatus)).toEqual(['Low', 'OK']);
  });

  it('preparation and water change list helpers', async () => {
    const res = await admin.get('/api/water-preparations').query({ pageSize: 0 });
    expect(res.body.items[0]).toMatchObject({ prepCode: 'WP-202608-001', preparedAmount: '2.00 (L)' });
  });
});

describe('water change gate (§6.3)', () => {
  let tankId: string;
  let prepId: string;

  beforeAll(async () => {
    tankId = await idOf('tanks', 'tankCode', 'T002');
    prepId = await idOf('water-preparations', 'prepCode', 'WP-202608-001');
  });

  it('18. the check endpoint returns the exact summary', async () => {
    const res = await admin.get('/api/water-changes/check').query({ tankId, waterPreparationId: prepId });
    expect(res.body.criticalCount).toBe(1);
    expect(res.body.summaryText).toBe(
      'Parameter check — WP-202608-001 vs Nano Tank\n\n  ✗  Total Dissolved Solids 57.00 ppm   limit: 150.00 – 220.00   [OUTOFRANGE]\n       Source: Tank override\n\n1 critical issue(s) detected — an override note is required to save.',
    );
  });

  it('19. saving needs an override note', async () => {
    const blocked = await admin.post('/api/water-changes').send({ tankId, waterPreparationId: prepId, overrideNote: '  ' });
    expect(blocked.status).toBe(422);
    expect(blocked.body.message).toBe('Critical out-of-range parameters detected. Add an override note to acknowledge and proceed.');
    expect(blocked.body.details[0].field).toBe('overrideNote');

    const ok = await admin.post('/api/water-changes').send({ tankId, waterPreparationId: prepId, overrideNote: 'Emergency', volumeUsed: 2, volumeUsedUnit: 'Litre' });
    expect(ok.status).toBe(201);
    expect(ok.body.changeCode).toBe(`${codePrefix('WC')}001`);
    expect(ok.body.status).toBe('Planned');
    expect(ok.body.alertsSnapshot).toHaveLength(1);
    expect(ok.body.addedWater).toBe('2.00 (L)');

    const audit = await AuditLog().find({ entity: 'waterChange', entityId: ok.body._id }).lean();
    expect(audit.some((a: any) => a.operation === 'ObjectCreated' && a.userName === 'Admin')).toBe(true);
  });

  it('deleting a water change clears links from tank readings', async () => {
    const wc = await admin.post('/api/water-changes').send({ tankId, waterPreparationId: prepId, overrideNote: 'Test' }).expect(201);
    const reading = await admin.post('/api/tank-readings').send({ tankId, waterChangeId: wc.body._id, context: 'BeforeWaterChange' }).expect(201);
    expect(reading.body._labels.waterChangeId).toBe(wc.body.changeCode);
    await admin.delete(`/api/water-changes/${wc.body._id}`).expect(200);
    const after = await admin.get(`/api/tank-readings/${reading.body._id}`);
    expect(after.body.waterChangeId).toBeNull();
  });
});

describe('codes (§5.5)', () => {
  it('23. concurrent creates never duplicate', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => admin.post('/api/water-preparations').send({ preparedVolume: 1 })));
    for (const r of results) expect(r.status).toBe(201);
    const codes = results.map((r) => r.body.prepCode).sort();
    expect(new Set(codes).size).toBe(5);
    expect(codes[0]).toBe(`${codePrefix('WP')}001`);
    expect(codes[4]).toBe(`${codePrefix('WP')}005`);
  });

  it('preview code', async () => {
    const res = await admin.get('/api/water-preparations/next-code');
    expect(res.body.code).toBe(`${codePrefix('WP')}006`);
  });
});

describe('validation & integrity (§6, §4.7)', () => {
  it('28. unique is case-insensitive', async () => {
    const res = await admin.post('/api/species').send({ speciesName: 'betta SPLENDENS' });
    expect(res.status).toBe(422);
    expect(res.body.details[0]).toMatchObject({ field: 'speciesName', rule: 'unique' });
  });

  it('29. LCL must not exceed UCL', async () => {
    const tankId = await idOf('tanks', 'tankCode', 'T001');
    const param = await idOf('parameters', 'parameterCode', 'Fe');
    const res = await admin.post('/api/tank-parameter-overrides').send({ tankId, parameterId: param, lcl: 8, ucl: 6 });
    expect(res.status).toBe(422);
    expect(res.body.details[0].message).toBe('LCL must be less than or equal to UCL.');
  });

  it('30. referenced records cannot be deleted', async () => {
    const unitId = await idOf('units', 'unitSymbol', 'dGH');
    const res = await admin.delete(`/api/units/${unitId}`);
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('General Hardness');
    const tankId = await idOf('tanks', 'tankCode', 'T001');
    const tank = await admin.delete(`/api/tanks/${tankId}`);
    expect(tank.status).toBe(409);
    expect(tank.body.message).toBe("This tank has samples, readings or water changes and can't be deleted. Set it inactive instead.");
  });

  it('27. species and limit rows save together; duplicates are rejected', async () => {
    const ph = await idOf('parameters', 'parameterCode', 'pH');
    const temp = await idOf('parameters', 'parameterCode', 'Temp');
    const tds = await idOf('parameters', 'parameterCode', 'TDS');
    const dup = await admin.post('/api/species').send({
      speciesName: 'CLAUDE Test fish',
      children: { parameterLimits: [{ parameterId: ph, lcl: 6, ucl: 7 }, { parameterId: ph, lcl: 6, ucl: 7 }] },
    });
    expect(dup.status).toBe(422);
    expect(dup.body.details[0].field).toBe('children.parameterLimits.1.parameterId');

    const created = await admin.post('/api/species').send({
      speciesName: 'CLAUDE Test fish',
      children: { parameterLimits: [{ parameterId: ph, lcl: 6, ucl: 7, optimalValue: 6.5 }, { parameterId: temp, lcl: 20, ucl: 25 }] },
    });
    expect(created.status).toBe(201);
    expect(created.body.children.parameterLimits).toHaveLength(2);
    const keep = created.body.children.parameterLimits.find((l: any) => l.parameterId === ph);
    const updated = await admin.put(`/api/species/${created.body._id}`).send({
      children: { parameterLimits: [{ ...keep, ucl: 7.5 }, { parameterId: tds, lcl: 100, ucl: 200 }] },
    });
    expect(updated.status).toBe(200);
    const limits = updated.body.children.parameterLimits;
    expect(limits.map((l: any) => l._labels.parameterId).sort()).toEqual(['Total Dissolved Solids', 'pH']);
    expect(limits.find((l: any) => l.parameterId === ph).ucl).toBe(7.5);

    const sources = await admin.get(`/api/species/${created.body._id}/copy-sources`);
    expect(sources.body.some((s: any) => s._id === created.body._id)).toBe(false);
    const fromNew = await admin.get('/api/species/new/copy-sources');
    expect(fromNew.body.map((s: any) => s.speciesName)).toContain('CLAUDE Test fish');

    await admin.delete(`/api/species/${created.body._id}`).expect(200);
    const gone = await admin.get('/api/species-parameter-limits').query({ pageSize: 0, 'filter[speciesId][eq]': created.body._id });
    expect(gone.body.total).toBe(0);
  });

  it('active-only lookups hide inactive units', async () => {
    const res = await admin.get('/api/lookups/units').query({ labelField: 'unitSymbol' });
    const labels = res.body.map((i: any) => i.label);
    expect(labels).toContain('mL');
    expect(labels).not.toContain('gal');
    const species = await admin.get('/api/lookups/species');
    expect(species.body.find((s: any) => s.label === 'Betta splendens').inactive).toBe(true);
  });
});

describe('export & settings', () => {
  it('36. tank export includes health columns', async () => {
    const list = await admin.get('/api/tanks').query({ pageSize: 0 });
    const res = await admin
      .post('/api/tanks/export')
      .send({ format: 'xlsx', ids: list.body.items.map((r: any) => r._id), columns: [{ id: 'tankCode' }, { id: 'healthLevel' }, { id: 'healthSummary' }] })
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    const ws = wb.worksheets[0];
    expect(ws.getRow(1).values).toEqual([undefined, 'Tank Code', 'Health', 'Health Detail']);
    const values = [ws.getRow(2).values, ws.getRow(3).values].map((v: any) => v.slice(1));
    expect(values).toContainEqual(['T001', 'Stable', 'The latest result is within its limit.']);
  });

  it('35. per-user view settings persist', async () => {
    await admin.put('/api/me/view-settings/tank').send({ pageSize: 50 }).expect(200);
    expect((await admin.get('/api/me/view-settings/tank')).body).toEqual({ pageSize: 50 });
    await admin.delete('/api/me/view-settings/tank').expect(200);
    expect((await admin.get('/api/me/view-settings/tank')).body).toBeNull();
  });

  it('33. audit entries record the user', async () => {
    const res = await admin.get('/api/admin/audit-logs').query({ entity: 'species', operation: 'ObjectDeleted' });
    expect(res.body.items[0]).toMatchObject({ userName: 'Admin', entityDisplay: 'CLAUDE Test fish' });
  });
});
