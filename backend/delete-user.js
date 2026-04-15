const path = require('path');
require('dotenv').config({ path: path.join(__dirname, './.env') });
const mongoose = require('mongoose');
const User = require('./models/User');

async function deleteUser() {
  let uri = process.env.MONGO_URI;
  
  if (!uri) {
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongod = await MongoMemoryServer.create();
      uri = mongod.getUri();
      console.log('✅ In-memory MongoDB started');
    } catch (err) {
      console.error('❌ Failed to start MongoDB:', err.message);
      process.exit(1);
    }
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log('✅ Connected to MongoDB\n');

    const email = 'manoharsripati6@gmail.com';
    console.log(`🗑️  Deleting user: ${email}`);
    
    const result = await User.deleteOne({ email });
    
    if (result.deletedCount === 0) {
      console.log(`❌ User not found: ${email}`);
    } else {
      console.log(`✅ Successfully deleted user: ${email}\n`);
      console.log('╔════════════════════════════════════╗');
      console.log('║  User Removed                      ║');
      console.log('╠════════════════════════════════════╣');
      console.log(`║ Email: ${email}`);
      console.log('║ Status: Deleted ✓                  ║');
      console.log('╚════════════════════════════════════╝\n');
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

deleteUser();
