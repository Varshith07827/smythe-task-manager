const mongoose = require('mongoose');
require('dotenv').config();

async function testConnection() {
  console.log('🔍 Testing MongoDB Connection...\n');
  
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/taskmanager';
  console.log(`📍 URI: ${mongoUri}`);
  console.log(`🔗 NODE_ENV: ${process.env.NODE_ENV}\n`);

  try {
    console.log('⏳ Attempting connection...');
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 5000,
    });
    
    console.log('✅ Successfully connected to MongoDB!\n');
    
    // Get connection details
    const db = mongoose.connection.db;
    const admin = db.admin();
    const serverStatus = await admin.serverStatus();
    
    console.log('📊 Server Info:');
    console.log(`   Version: ${serverStatus.version}`);
    console.log(`   Uptime: ${serverStatus.uptime} seconds`);
    console.log(`   Connections: ${serverStatus.connections.current} active\n`);
    
    // List databases
    const databases = await admin.listDatabases();
    console.log(`📂 Databases (${databases.databases.length}):`);
    databases.databases.forEach(db => {
      console.log(`   - ${db.name}`);
    });
    
    await mongoose.connection.close();
    console.log('\n✅ Connection closed successfully');
    process.exit(0);
    
  } catch (err) {
    console.error('❌ Connection Failed:\n');
    console.error(`Error: ${err.message}`);
    console.error(`Code: ${err.code}\n`);
    
    if (err.message.includes('connect ECONNREFUSED')) {
      console.log('💡 MongoDB is not running locally.');
      console.log('   The backend will use in-memory MongoDB automatically.\n');
      console.log('   To run real MongoDB:');
      console.log('   • Windows: mongod.exe');
      console.log('   • macOS: brew services start mongodb-community');
      console.log('   • Linux: sudo systemctl start mongod');
    }
    
    process.exit(1);
  }
}

testConnection();
