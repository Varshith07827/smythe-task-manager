const mongoose = require('mongoose');
const log = require('../utils/logger');

const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    log.error('DB', 'MONGO_URI environment variable is required');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri, {
      maxPoolSize: parseInt(process.env.MONGO_POOL_SIZE) || 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    });
    log.info('DB', 'MongoDB connected');
  } catch (err) {
    log.error('DB', 'MongoDB connection error', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
