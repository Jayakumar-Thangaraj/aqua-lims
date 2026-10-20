import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config';
import { connectDb } from './db';
import { createApp } from './app';
import { seedSecurity } from './seed';

const here = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  await connectDb(config.mongoUri);
  // A fresh database still gets the two built-in accounts, so the app can be opened.
  await seedSecurity();
  const app = createApp({ clientDist: path.resolve(here, '../../client/dist') });
  app.listen(config.port, () => console.log(`Aqua LIMS API listening on http://localhost:${config.port}`));
}

main().catch((e) => {
  console.error('Failed to start the API:', e);
  process.exit(1);
});
