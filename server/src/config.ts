import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// server/.env, whichever folder the process was started from (API, seed or migration scripts).
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

export const config = {
  // MONGO_URI / DB_NAME are accepted too; DB_NAME overrides the database named in the URI.
  mongoUri: process.env.MONGODB_URI ?? process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/aqualims?replicaSet=rs0',
  dbName: process.env.DB_NAME || undefined,
  // API_PORT (not PORT): dev tools often set PORT for the web server and it would collide.
  port: Number(process.env.API_PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret-change-me',
  sessionIdleMinutes: Number(process.env.SESSION_IDLE_MINUTES ?? 10),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  cookieName: 'aqualims_session',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123',
  seedUserPassword: process.env.SEED_USER_PASSWORD ?? 'User@123',
  isTest: process.env.NODE_ENV === 'test' || process.env.VITEST === 'true',
};

if (process.env.NODE_ENV === 'production' && config.jwtSecret === 'dev-only-secret-change-me')
  throw new Error('JWT_SECRET must be set in production.');
