const mongoose = require('mongoose');
const crypto = require('crypto');

const taskShareSchema = new mongoose.Schema({
  task: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true
  },
  board: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  token: {
    type: String,
    required: true,
    unique: true,
    default: () => crypto.randomBytes(32).toString('hex')
  },
  permission: {
    type: String,
    enum: ['view', 'edit'],
    default: 'view'
  },
  expiresAt: {
    type: Date,
    default: null
  },
  revoked: {
    type: Boolean,
    default: false
  },
  revokedAt: Date,
  revokedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  accessCount: {
    type: Number,
    default: 0
  },
  lastAccessedAt: Date
}, {
  timestamps: true
});

taskShareSchema.index({ task: 1, revoked: 1 });
taskShareSchema.index({ token: 1 }, { unique: true });
taskShareSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { expiresAt: { $ne: null } } });

taskShareSchema.methods.isActive = function () {
  if (this.revoked) return false;
  if (this.expiresAt && this.expiresAt < new Date()) return false;
  return true;
};

module.exports = mongoose.model('TaskShare', taskShareSchema);
