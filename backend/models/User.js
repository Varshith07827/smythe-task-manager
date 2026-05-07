const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 200 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  password: { type: String, required: true, select: false },
  role: {
    type: String,
    enum: ['admin', 'user'],
    default: 'user'
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['active', 'inactive', 'invited'], default: 'invited' },
  avatar: { type: String },
  phone: { type: String, trim: true, maxlength: 30 },
  lastActive: { type: Date },
  notificationPreferences: {
    inApp: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
    taskAssigned: { type: Boolean, default: true },
    taskUpdated: { type: Boolean, default: true },
    statusChanged: { type: Boolean, default: true },
    notifyOnStatuses: [{ type: String }],
    deadlineReminder: { type: Boolean, default: true },
    mentions: { type: Boolean, default: true },
    progressDigest: { type: Boolean, default: true },
    deliveryMode: { type: String, enum: ['realtime', 'digest'], default: 'realtime' },
    quietHoursEnabled: { type: Boolean, default: false },
    quietHoursStart: { type: String, default: '22:00' },
    quietHoursEnd: { type: String, default: '08:00' },
    deadlineReminderHours: { type: Number, default: 24 },
    reminderIntervalHours: { type: Number, default: 0 }
  }
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.index({ role: 1, status: 1 });

module.exports = mongoose.model('User', userSchema);
