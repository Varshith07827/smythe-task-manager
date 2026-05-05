require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Organization = require('./models/Organization');
const Board = require('./models/Board');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  // Get all orgs
  const orgs = await Organization.find();
  if (orgs.length <= 1) {
    console.log('Only 1 org found, nothing to merge.');
    // However, ensure all users are in this org
    if (orgs.length === 1) {
      await mongoose.connection.collection('users').updateMany(
        { organization: null },
        { $set: { organization: orgs[0]._id } }
      );
      const allUsers = await User.find({ organization: orgs[0]._id });
      const members = allUsers.map(u => ({ user: u._id, role: u.role || 'user', joinedAt: new Date() }));
      await Organization.updateOne({ _id: orgs[0]._id }, { $set: { members } });
    }
    process.exit(0);
  }

  // Pick the one with the admin
  const admin = await User.findOne({ role: 'admin' });
  let targetOrgId;
  if (admin && admin.organization) {
    targetOrgId = admin.organization;
    console.log('Target org chosen based on admin:', targetOrgId);
  } else {
    // just pick the last one
    targetOrgId = orgs[orgs.length - 1]._id;
    console.log('Target org chosen (last one):', targetOrgId);
  }

  // Get all orgs to delete
  const orgsToDelete = orgs.filter(o => o._id.toString() !== targetOrgId.toString());
  
  for (const oldOrg of orgsToDelete) {
    console.log('Merging from old org:', oldOrg._id);
    // Move Users
    await mongoose.connection.collection('users').updateMany(
      { organization: oldOrg._id },
      { $set: { organization: targetOrgId } }
    );
    // Move Boards
    await mongoose.connection.collection('boards').updateMany(
      { organization: oldOrg._id },
      { $set: { organization: targetOrgId } }
    );
    // Move Activity Logs
    await mongoose.connection.collection('activitylogs').updateMany(
      { organization: oldOrg._id },
      { $set: { organization: targetOrgId } }
    );
  }

  // Move null users too! (some have null)
  await mongoose.connection.collection('users').updateMany(
    { organization: null },
    { $set: { organization: targetOrgId } }
  );

  // Now rebuild members array for targetOrg:
  const allUsers = await User.find({ organization: targetOrgId });
  const members = allUsers.map(u => ({ user: u._id, role: u.role || 'user', joinedAt: new Date() }));
  
  await Organization.updateOne({ _id: targetOrgId }, { $set: { members } });

  // Finally delete old orgs
  for (const oldOrg of orgsToDelete) {
    await Organization.deleteOne({ _id: oldOrg._id });
    console.log('Deleted old org:', oldOrg._id);
  }

  console.log('Successfully merged everything into a single organization!');
  process.exit(0);
});
