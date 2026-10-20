// Starts a persistent single-node MongoDB replica set on 127.0.0.1:27017 (data in ../.data/mongo).
// Uses the official mongod binary downloaded by mongodb-memory-server, so no system install is needed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { config } from '@aqualims/server/config';
import { isLocalMongo } from '@aqualims/server/db';

// Using Atlas or another external server: nothing to start. Stay alive so `npm run dev` keeps running.
if (!isLocalMongo(config.mongoUri)) {
  console.log('MONGODB_URI points to an external MongoDB server - the local database is not started.');
  setInterval(() => undefined, 1 << 30);
  await new Promise(() => undefined);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(here, '../.data/mongo');
const port = Number(process.env.MONGO_PORT ?? 27017);
fs.mkdirSync(dbPath, { recursive: true });

const replSet = await MongoMemoryReplSet.create({
  binary: { version: process.env.MONGO_VERSION ?? '7.0.14' },
  replSet: { name: 'rs0', count: 1, storageEngine: 'wiredTiger' },
  instanceOpts: [{ port, dbPath, storageEngine: 'wiredTiger' }],
});
await replSet.waitUntilRunning();
console.log(`MongoDB replica set ready: mongodb://127.0.0.1:${port}/aqualims?replicaSet=rs0 (data: ${dbPath})`);

const stop = async () => {
  await replSet.stop({ doCleanup: false, force: false });
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => undefined, 1 << 30);
