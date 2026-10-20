// npm run seed                      -> seed reference data + demo records into an empty database
// npm run seed -- --reset           -> wipe domain data (keeps users/roles) and seed again
// npm run seed -- --no-demo         -> reference data only
// npm run seed -- --reset-accounts  -> recreate Admin/User with the initial passwords (first-login state)
import { config } from '@aqualims/server/config';
import { connectDb, disconnectDb } from '@aqualims/server/db';
import { Role, User, ViewSetting } from '@aqualims/server/models/system';
import { clearDomainData, isDomainDataPresent, seedReferenceData, seedSecurity } from '@aqualims/server/seed';

const args = new Set(process.argv.slice(2));

await connectDb(config.mongoUri);
try {
  if (args.has('--reset-accounts')) {
    await Promise.all([User().deleteMany({}), Role().deleteMany({}), ViewSetting().deleteMany({})]);
    console.log('Users, roles and saved layouts removed.');
  } else {
    if (args.has('--reset')) {
      await clearDomainData();
      console.log('Domain data cleared.');
    }
    if (await isDomainDataPresent()) {
      console.log('Reference data already present - nothing to do (use --reset to start over).');
    } else {
      await seedReferenceData({ demo: !args.has('--no-demo') });
      console.log('Reference data seeded.');
    }
  }
  await seedSecurity();
  console.log('Accounts ready: Admin and User, with the SEED_*_PASSWORD values from server/.env (a password change is required at first login).');
} finally {
  await disconnectDb();
}
