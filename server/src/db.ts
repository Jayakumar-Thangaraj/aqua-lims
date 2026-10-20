import mongoose from 'mongoose';
import { config } from './config';
import { registerModels } from './models/registry';

export async function connectDb(uri: string, dbName: string | undefined = uri === config.mongoUri ? config.dbName : undefined): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  registerModels();
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000, ...(dbName ? { dbName } : {}) });
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  return mongoose;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

export function isLocalMongo(uri: string = config.mongoUri): boolean {
  return /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(uri);
}
