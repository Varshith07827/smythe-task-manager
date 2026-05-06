const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, select: false },
  role: {
    type: String,
    enum: ['admin', 'user'],
    default: 'user'
  },
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['active', 'inactive', 'invited'], default: 'invited' },
  avatar: { type: String },
  phone: { type: String, trim: true },
  lastActive: { type: Date },
  notificationPreferences: {
    inApp: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
    taskAssigned: { type: Boolean, default: true },
    taskUpdated: { type: Boolean, default: true },
    statusChanged: { type: Boolean, default: true },
    /** Notify when a task moves to one of these statuses. Empty array = all statuses (no filter). Non-empty = whitelist. */
    notifyOnStatuses: [{ type: String }],
    deadlineReminder: { type: Boolean, default: true },
    mentions: { type: Boolean, default: true },
    /** Board “progress summary” digests (scheduled every 4h when enabled on a board). */
    progressDigest: { type: Boolean, default: true },
    /** 'realtime' (default) or 'digest' — controls whether non-urgent notifications batch */
    deliveryMode: { type: String, enum: ['realtime', 'digest'], default: 'realtime' },
    quietHoursEnabled: { type: Boolean, default: false },
    quietHoursStart: { type: String, default: '22:00' },
    quietHoursEnd: { type: String, default: '08:00' },
    /** Hours before deadline to send reminder (default 24) */
    deadlineReminderHours: { type: Number, default: 24 },
    /** Hours between repeated reminders; 0 = send once only */
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

userSchema.index({ organization: 1, role: 1 });
// email index already created by `unique: true` on the schema field

module.exports = mongoose.model('User', userSchema);
