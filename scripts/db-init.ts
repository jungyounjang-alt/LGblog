import { initSchema } from '../server/db/pg.ts';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

await initSchema();
console.log('schema initialised');
process.exit(0);
