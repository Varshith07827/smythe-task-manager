const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const User = require('../models/User');
const Organization = require('../models/Organization');
const crypto = require('crypto');

async function seedAdmin() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/taskmanager';
  
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB');

    const adminsToSeed = [
      {
        name: 'System Admin',
        email: 'admin@smythe.local',
        password: 'SmytheDemo123!',
        orgName: 'Default Organization'
      },
      {
        name: 'Manohar Sripati',
        email: 'manoharsripati6@gmail.com',
        password: 'SmytheDemo123!',
        orgName: "Manohar's Organization"
      }
    ];

    for (const adminData of adminsToSeed) {
      let admin = await User.findOne({ email: adminData.email });
      if (admin) {
        console.log(`⚠️  Admin user ${adminData.email} already exists.`);
        continue;
      }

      console.log(`📝 Creating admin user: ${adminData.name}...`);
      admin = new User({
        name: adminData.name,
        email: adminData.email,
        password: adminData.password,
        role: 'admin',
        status: 'active'
      });

      console.log(`📝 Creating organization: ${adminData.orgName}...`);
      const org = await Organization.create({
        name: adminData.orgName,
        creator: admin._id,
        inviteCode: crypto.randomBytes(8).toString('hex'),
        members: [{ user: admin._id, role: 'admin' }]
      });

      admin.organization = org._id;
      await admin.save();

      console.log(`✅ Seeded ${adminData.email}`);
    }

    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║  ✅ ADMIN(S) SEEDED SUCCESSFULLY         ║');
    console.log('╠══════════════════════════════════════════╣');
    for (const adminData of adminsToSeed) {
      console.log(`║ Email:    ${adminData.email.padEnd(30)} ║`);
      console.log(`║ Password: ${adminData.password.padEnd(30)} ║`);
    }
    console.log('╚══════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('❌ Error seeding admin:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

seedAdmin();
