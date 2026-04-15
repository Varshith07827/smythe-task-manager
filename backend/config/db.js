const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Use in-memory MongoDB if no MONGO_URI or if connection fails
    let uri = process.env.MONGO_URI;

    if (!uri || uri === 'mongodb://localhost:27017/taskmanager') {
      try {
        await mongoose.connect(uri || 'mongodb://localhost:27017/taskmanager');
        console.log('MongoDB connected');
        return;
      } catch {
        console.log('Local MongoDB not available, starting in-memory server...');
        const { MongoMemoryServer } = require('mongodb-memory-server');
        const mongod = await MongoMemoryServer.create();
        uri = mongod.getUri();
      }
    }

    await mongoose.connect(uri);
    console.log('MongoDB connected');

    // Auto-migrate legacy roles (creator/manager → admin)
    await migrateRoles();
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
};

async function migrateRoles() {
  try {
    const db = mongoose.connection.db;
    // Migrate users: creator/manager → admin
    const userResult = await db.collection('users').updateMany(
      { role: { $in: ['creator', 'manager'] } },
      { $set: { role: 'admin' } }
    );
    if (userResult.modifiedCount > 0) {
      console.log(`Migrated ${userResult.modifiedCount} user(s) from legacy roles to admin`);
    }
    // Migrate organization members
    const orgs = await db.collection('organizations').find({
      'members.role': { $in: ['creator', 'manager'] }
    }).toArray();
    for (const org of orgs) {
      const updated = org.members.map(m =>
        ['creator', 'manager'].includes(m.role) ? { ...m, role: 'admin' } : m
      );
      await db.collection('organizations').updateOne(
        { _id: org._id },
        { $set: { members: updated } }
      );
    }
    if (orgs.length > 0) {
      console.log(`Migrated members in ${orgs.length} organization(s) from legacy roles`);
    }
  } catch (err) {
    console.warn('Role migration skipped:', err.message);
  }
}

module.exports = connectDB;
