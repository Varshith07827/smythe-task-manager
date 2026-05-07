/**
 * One-time migration: strips legacy multi-tenant fields from existing documents.
 *
 * Safe to run multiple times — uses $unset which is idempotent.
 * Run from backend/:  node scripts/migrateToSingleTenant.js
 *
 * What it does:
 *  1. Removes `organization` from all User documents
 *  2. Removes `organization` from all Board documents
 *  3. Changes Board visibility from 'organization' to 'all'
 *  4. Removes `organization` from all ActivityLog documents
 *  5. Removes `creator` from Organization document (if present)
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');

async function migrate() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is required in .env');
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  const db = mongoose.connection.db;
  console.log(`Connected to: ${db.databaseName}`);

  const results = {};

  const users = await db.collection('users').updateMany(
    { organization: { $exists: true } },
    { $unset: { organization: '' } }
  );
  results.users = users.modifiedCount;

  const boards = await db.collection('boards').updateMany(
    { organization: { $exists: true } },
    { $unset: { organization: '' } }
  );
  results.boards = boards.modifiedCount;

  const boardsVisibility = await db.collection('boards').updateMany(
    { 'permissions.visibility': 'organization' },
    { $set: { 'permissions.visibility': 'all' } }
  );
  results.boardsVisibilityFixed = boardsVisibility.modifiedCount;

  const activityLogs = await db.collection('activitylogs').updateMany(
    { organization: { $exists: true } },
    { $unset: { organization: '' } }
  );
  results.activityLogs = activityLogs.modifiedCount;

  const orgs = await db.collection('organizations').updateMany(
    { creator: { $exists: true } },
    { $unset: { creator: '' } }
  );
  results.orgsCreatorRemoved = orgs.modifiedCount;

  console.log('\n--- Migration complete ---');
  for (const [key, count] of Object.entries(results)) {
    console.log(`  ${key}: ${count} documents updated`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
