const mongoose = require('mongoose');
const crypto = require('crypto');

const boardShareSchema = new mongoose.Schema({
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
  // Secure random token — 32 bytes hex = 64 chars, non-guessable
  token: {
    type: String,
    required: true,
    unique: true,
    default: () => crypto.randomBytes(32).toString('hex')
  },
  permission: {
    type: String,
    enum: ['view', 'comment', 'edit'],
    default: 'edit'
  },
  // Optional expiration
  expiresAt: {
    type: Date,
    default: null
  },
  // Revocation
  revoked: {
    type: Boolean,
    default: false
  },
  revokedAt: Date,
  revokedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Optional password protection
  password: {
    type: String,
    default: null
  },
  // Access tracking
  accessCount: {
    type: Number,
    default: 0
  },
  lastAccessedAt: Date,
  // Rate limit tracking
  maxAccessesPerHour: {
    type: Number,
    default: 100
  }
}, {
  timestamps: true
});

boardShareSchema.index({ board: 1, revoked: 1 });
boardShareSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { expiresAt: { $ne: null } } });

// Check if link is still valid
boardShareSchema.methods.isActive = function () {
  if (this.revoked) return false;
  if (this.expiresAt && this.expiresAt < new Date()) return false;
  return true;
};

module.exports = mongoose.model('BoardShare', boardShareSchema);
