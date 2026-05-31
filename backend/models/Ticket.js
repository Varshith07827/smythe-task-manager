const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  subject: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 300
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  guestEmail: {
    type: String,
    trim: true,
    lowercase: true,
    maxlength: 320
  },
  status: {
    type: String,
    enum: ['open', 'pending', 'resolved', 'closed'],
    default: 'open'
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  category: {
    type: String,
    enum: ['general', 'bug', 'feature', 'account', 'billing', 'other'],
    default: 'general'
  },
  lastMessageAt: {
    type: Date,
    default: Date.now
  },
  lastMessageBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Who last replied — helps determine "awaiting" state
  awaitingReplyFrom: {
    type: String,
    enum: ['user', 'admin'],
    default: 'admin'
  },
  closedAt: Date,
  closedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Read tracking per-user
  readBy: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    readAt: { type: Date, default: Date.now }
  }],
  messageCount: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
ticketSchema.index({ createdBy: 1, createdAt: -1 });
ticketSchema.index({ status: 1, lastMessageAt: -1 });
ticketSchema.index({ createdBy: 1, status: 1 });
ticketSchema.index({ awaitingReplyFrom: 1, status: 1 });

module.exports = mongoose.model('Ticket', ticketSchema);
