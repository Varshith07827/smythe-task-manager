const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const User = require('../models/User');
const Organization = require('../models/Organization');
const crypto = require('crypto');

async function seedAdmin() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is required in .env');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    let org = await Organization.findOne();
    if (!org) {
      console.log('Creating organization...');
      org = await Organization.create({
        name: 'Default Organization',
        inviteCode: crypto.randomBytes(8).toString('hex'),
        members: [],
        settings: { maxBoards: 50, maxMembers: 100, allowUserComments: true }
      });
    }

    const adminEmail = 'admin@smythe.local';
    let admin = await User.findOne({ email: adminEmail });
    if (admin) {
      console.log(`Admin user ${adminEmail} already exists.`);
    } else {
      console.log('Creating admin user...');
      admin = await User.create({
        name: 'System Admin',
        email: adminEmail,
        password: 'SmytheDemo123!',
        role: 'admin',
        status: 'active'
      });

      org.members.push({ user: admin._id, role: 'admin' });
      await org.save();
      console.log(`Seeded ${adminEmail}`);
    }

    console.log('\n--- ADMIN SEEDED ---');
    console.log(`Email:    ${adminEmail}`);
    console.log('Password: SmytheDemo123!\n');

  } catch (error) {
    console.error('Error seeding admin:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

seedAdmin();
