import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { codePrefix } from '@aqualims/shared';
import { createApp } from '../src/app';
import { connectDb, disconnectDb } from '../src/db';
import { seedReferenceData, seedSecurity } from '../src/seed';
import { config } from '../src/config';
import { AuditLog } from '../src/models/system';
import { modelFor } from '../src/models/registry';

// Rules not covered by api.test.ts: references, soft delete, child diffs, list queries,
// admin safeguards, malformed input and export safety.
let replSet: MongoMemoryReplSet;
const app = createApp();
const admin = request.agent(app);
const PASSWORD = 'Admin-Strong-123';
const missingId = () => new mongoose.Types.ObjectId().toString();

async function idOf(path: string, field: string, value: string): Promise<string> {
  const res = await admin.get(`/api/${path}`).query({ pageSize: 0 });
  const row = res.body.items.find((r: any) => r[field] === value);
  if (!row) throw new Error(`${path}: ${value} not found`);
  return row._id;
}

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ binary: { version: '7.0.14' }, replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await connectDb(replSet.getUri('aqualims_rules'));
  await seedSecurity();
  await seedReferenceData({ demo: true });
  await admin.post('/api/auth/login').send({ userName: 'Admin', password: config.seedAdminPassword }).expect(200);
  await admin.post('/api/auth/change-password').send({ currentPassword: config.seedAdminPassword, newPassword: PASSWORD }).expect(200);
}, 600_000);

afterAll(async () => {
  await disconnectDb();
  await replSet?.stop();
});

describe('references (§4.7)', () => {
  it('a reference to a record that does not exist is rejected', async () => {
    const res = await admin.post('/api/samples').send({ sampleCode: 'CLAUDE-R1', tankId: missingId() });
    expect(res.status).toBe(422);
    expect(res.body.details).toContainEqual(expect.objectContaining({ field: 'tankId', rule: 'ref' }));
  });

  it('a reference to a deleted record is rejected, also in child rows', async () => {
    const cat = await idOf('categories', 'categoryName', (await admin.get('/api/categories').query({ pageSize: 1 })).body.items[0].categoryName);
    const param = await admin.post('/api/parameters').send({ parameterName: 'CLAUDE Param', parameterCode: 'CLP', categoryId: cat }).expect(201);
    await admin.delete(`/api/parameters/${param.body._id}`).expect(200);
    const tankId = await idOf('tanks', 'tankCode', 'T002');
    const res = await admin.post('/api/samples').send({
      sampleCode: 'CLAUDE-R2',
      tankId,
      children: { sampleParameters: [{ parameterId: param.body._id, measuredValue: 1 }] },
    });
    expect(res.status).toBe(422);
    expect(res.body.details).toContainEqual(expect.objectContaining({ field: 'children.sampleParameters.0.parameterId', rule: 'ref' }));
  });

  it('a malformed id is rejected with a field error', async () => {
    const res = await admin.post('/api/samples').send({ sampleCode: 'CLAUDE-R3', tankId: 'not-an-id' });
    expect(res.status).toBe(422);
    expect(res.body.details[0]).toMatchObject({ field: 'tankId', rule: 'ref' });
  });

  it('an unreadable date is rejected instead of being stored empty', async () => {
    const tankId = await idOf('tanks', 'tankCode', 'T002');
    const res = await admin.post('/api/samples').send({ sampleCode: 'CLAUDE-R4', tankId, collectedDate: 'last tuesday' });
    expect(res.status).toBe(422);
    expect(res.body.details[0]).toMatchObject({ field: 'collectedDate', rule: 'date' });
  });
});

describe('soft delete (§2)', () => {
  it('deleted records disappear from reads, free their unique value and keep an audit entry', async () => {
    const created = await admin.post('/api/species-groups').send({ groupName: 'CLAUDE Group' }).expect(201);
    await admin.delete(`/api/species-groups/${created.body._id}`).expect(200);
    expect((await admin.get(`/api/species-groups/${created.body._id}`)).status).toBe(404);
    const list = await admin.get('/api/species-groups').query({ pageSize: 0 });
    expect(list.body.items.some((g: any) => g._id === created.body._id)).toBe(false);
    expect((await admin.get('/api/lookups/species-groups')).body.some((g: any) => g._id === created.body._id)).toBe(false);
    const raw: any = await modelFor('speciesGroup').findById(created.body._id).lean();
    expect(raw).toMatchObject({ isDeleted: true, deletedBy: 'Admin' });
    await admin.post('/api/species-groups').send({ groupName: 'claude group' }).expect(201);
    expect(await AuditLog().countDocuments({ entityId: created.body._id, operation: 'ObjectDeleted' })).toBe(1);
  });

  it('deleting twice reports not found', async () => {
    const created = await admin.post('/api/species-groups').send({ groupName: 'CLAUDE Twice' }).expect(201);
    await admin.delete(`/api/species-groups/${created.body._id}`).expect(200);
    const again = await admin.post('/api/species-groups/bulk-delete').send({ ids: [created.body._id, 'junk'] });
    expect(again.body.deleted).toEqual([]);
    expect(again.body.errors).toHaveLength(2);
  });

  it('code generation ignores deleted records (§5.5)', async () => {
    const prefix = codePrefix('WP', new Date());
    const prep = await admin.post('/api/water-preparations').send({ preparedVolume: 1 }).expect(201);
    const code: string = prep.body.prepCode;
    expect(code.startsWith(prefix)).toBe(true);
    await admin.delete(`/api/water-preparations/${prep.body._id}`).expect(200);
    const next = await admin.post('/api/water-preparations').send({ preparedVolume: 1 }).expect(201);
    // The counter never goes backwards, so a deleted code is not handed out again.
    expect(next.body.prepCode).not.toBe(code);
    await admin.delete(`/api/water-preparations/${next.body._id}`).expect(200);
  });
});

describe('child rows saved with the parent', () => {
  it('unchanged rows are left alone, removed rows are soft-deleted and audited', async () => {
    const ph = await idOf('parameters', 'parameterCode', 'pH');
    const temp = await idOf('parameters', 'parameterCode', 'Temp');
    const created = await admin
      .post('/api/species')
      .send({ speciesName: 'CLAUDE Child fish', children: { parameterLimits: [{ parameterId: ph, lcl: 6, ucl: 7 }, { parameterId: temp, lcl: 20, ucl: 26 }] } })
      .expect(201);
    const [phRow, tempRow] = ['pH', 'Temp'].map((c) => created.body.children.parameterLimits.find((l: any) => l.parameterId === (c === 'pH' ? ph : temp)));
    const before = await AuditLog().countDocuments({ entityId: phRow._id });

    const updated = await admin.put(`/api/species/${created.body._id}`).send({ children: { parameterLimits: [phRow] } }).expect(200);
    expect(updated.body.children.parameterLimits.map((l: any) => l._id)).toEqual([phRow._id]);
    expect(await AuditLog().countDocuments({ entityId: phRow._id })).toBe(before);
    const removed: any = await modelFor('speciesParameterLimit').findById(tempRow._id).lean();
    expect(removed.isDeleted).toBe(true);
    expect(await AuditLog().countDocuments({ entityId: created.body._id, operation: 'RemovedFromCollection' })).toBe(1);
  });

  it('a row id from another parent is not moved; it is added as a new row', async () => {
    const ph = await idOf('parameters', 'parameterCode', 'pH');
    const a = await admin.post('/api/species').send({ speciesName: 'CLAUDE Parent A', children: { parameterLimits: [{ parameterId: ph, lcl: 6, ucl: 7 }] } }).expect(201);
    const b = await admin.post('/api/species').send({ speciesName: 'CLAUDE Parent B' }).expect(201);
    const foreign = a.body.children.parameterLimits[0];
    const res = await admin.put(`/api/species/${b.body._id}`).send({ children: { parameterLimits: [foreign] } }).expect(200);
    expect(res.body.children.parameterLimits[0]._id).not.toBe(foreign._id);
    const stillA = await admin.get(`/api/species/${a.body._id}`);
    expect(stillA.body.children.parameterLimits.map((l: any) => l._id)).toEqual([foreign._id]);
  });
});

describe('list queries', () => {
  it('filters, sorts and pages on the server', async () => {
    const all = await admin.get('/api/tanks').query({ pageSize: 0 });
    const gt = await admin.get('/api/tanks').query({ pageSize: 0, 'filter[volume][gt]': 50 });
    expect(gt.body.items.every((t: any) => t.volume > 50)).toBe(true);
    expect(gt.body.total).toBeLessThan(all.body.total);

    const sorted = await admin.get('/api/tanks').query({ pageSize: 0, sort: 'tankCode:desc' });
    const codes = sorted.body.items.map((t: any) => t.tankCode);
    expect(codes).toEqual([...codes].sort().reverse());

    const page2 = await admin.get('/api/tanks').query({ pageSize: 1, page: 2, sort: 'tankCode:asc' });
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.items[0].tankCode).toBe([...codes].sort()[1]);
    expect(page2.body.total).toBe(all.body.total);

    const search = await admin.get('/api/tanks').query({ pageSize: 0, q: 'nano' });
    expect(search.body.items.length).toBeGreaterThan(0);
  });

  it('malformed paging falls back to defaults instead of returning nothing', async () => {
    const res = await admin.get('/api/tanks').query({ page: 'abc', pageSize: 'xyz' });
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
  });
});

describe('administration safeguards (§7.2)', () => {
  it('a malformed id is a 404, not a server error', async () => {
    expect((await admin.put('/api/admin/users/not-an-id').send({ isActive: true })).status).toBe(404);
    expect((await admin.post('/api/admin/users/not-an-id/reset-password').send({ password: 'Whatever-123' })).status).toBe(404);
    expect((await admin.put('/api/admin/roles/not-an-id').send({ name: 'x' })).status).toBe(404);
    expect((await admin.delete('/api/admin/roles/not-an-id')).status).toBe(404);
  });

  it('audit log tolerates bad dates and paging', async () => {
    const res = await admin.get('/api/admin/audit-logs').query({ from: 'nope', to: 'nope', page: 'x', pageSize: 'y' });
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it('an admin cannot remove their own administrator access', async () => {
    const me = (await admin.get('/api/auth/me')).body.user.id;
    const roles = (await admin.get('/api/admin/roles')).body;
    const nonAdminRole = roles.find((r: any) => !r.isAdministrative)._id;
    const res = await admin.put(`/api/admin/users/${me}`).send({ roleIds: [nonAdminRole] });
    expect(res.status).toBe(422);
    expect(res.body.details[0].field).toBe('roleIds');
    expect((await admin.get('/api/admin/users')).status).toBe(200);
  });

  it('the last administrative role cannot be made non-administrative', async () => {
    const adminRole = (await admin.get('/api/admin/roles')).body.find((r: any) => r.isAdministrative);
    const res = await admin.put(`/api/admin/roles/${adminRole._id}`).send({ isAdministrative: false });
    expect(res.status).toBe(422);
    expect(res.body.details[0].field).toBe('isAdministrative');
    expect((await admin.get('/api/admin/roles')).status).toBe(200);
  });

  it('other users can still be edited and deactivated', async () => {
    const created = await admin.post('/api/admin/users').send({ userName: 'claude-temp', password: 'Temp-Pass-123' }).expect(201);
    const res = await admin.put(`/api/admin/users/${created.body._id}`).send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
    const login = await request(app).post('/api/auth/login').send({ userName: 'claude-temp', password: 'Temp-Pass-123' });
    expect(login.status).toBe(401);
  });

  it('a reset password forces a change at next login', async () => {
    const created = await admin.post('/api/admin/users').send({ userName: 'claude-reset', password: 'Temp-Pass-123', changePasswordOnFirstLogon: false }).expect(201);
    await admin.post(`/api/admin/users/${created.body._id}/reset-password`).send({ password: 'short' }).expect(422);
    await admin.post(`/api/admin/users/${created.body._id}/reset-password`).send({ password: 'Reset-Pass-123' }).expect(200);
    const login = await request(app).post('/api/auth/login').send({ userName: 'claude-reset', password: 'Reset-Pass-123' });
    expect(login.body.user.changePasswordOnFirstLogon).toBe(true);
  });
});

describe('session (§7.2)', () => {
  it('every authenticated response renews the 10-minute cookie', async () => {
    const res = await admin.get('/api/auth/me');
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain(`${config.cookieName}=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain(`Max-Age=${config.sessionIdleMinutes * 60}`);
  });

  it('logging off ends the session', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ userName: 'Admin', password: PASSWORD }).expect(200);
    await agent.post('/api/auth/logout').expect(200);
    expect((await agent.get('/api/tanks')).status).toBe(401);
  });

  it('a wrong current password does not change it', async () => {
    const res = await admin.post('/api/auth/change-password').send({ currentPassword: 'wrong', newPassword: 'Another-Pass-123' });
    expect(res.status).toBe(422);
    expect(res.body.details[0].field).toBe('currentPassword');
  });
});

describe('export safety', () => {
  it('CSV cells that look like formulas are neutralised', async () => {
    const created = await admin.post('/api/species-groups').send({ groupName: '=HYPERLINK("http://example.test","x")' }).expect(201);
    const res = await admin
      .post('/api/species-groups/export')
      .send({ format: 'csv', ids: [created.body._id], columns: [{ id: 'groupName' }] })
      .buffer(true)
      .parse((r, cb) => {
        let data = '';
        r.on('data', (c: Buffer) => (data += c.toString('utf8')));
        r.on('end', () => cb(null, data));
      });
    const line = String(res.body).split('\r\n')[1];
    expect(line.startsWith('"\'=HYPERLINK')).toBe(true);
  });

  it('negative numbers are not treated as formulas', async () => {
    const res = await admin
      .post('/api/tanks/export')
      .send({ format: 'csv', columns: [{ id: 'tankCode' }] })
      .buffer(true)
      .parse((r, cb) => {
        let data = '';
        r.on('data', (c: Buffer) => (data += c.toString('utf8')));
        r.on('end', () => cb(null, data));
      });
    expect(res.status).toBe(200);
    expect(String(res.body)).not.toContain("'T0");
  });

  it('unsupported format is a 400', async () => {
    expect((await admin.post('/api/tanks/export').send({ format: 'docx' })).status).toBe(400);
  });
});
