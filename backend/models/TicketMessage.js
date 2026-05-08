const mongoose = require('mongoose');

const ticketMessageSchema = new mongoose.Schema({
  ticket: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ticket',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  body: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 10000
  },
  // Whether this message is from an admin
  isAdminReply: {
    type: Boolean,
    default: false
  },
  // Soft delete
  deleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Edit tracking
  editedAt: Date,
  // For system messages (status changes, etc.)
  isSystemMessage: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

ticketMessageSchema.index({ ticket: 1, createdAt: 1 });
ticketMessageSchema.index({ sender: 1 });

module.exports = mongoose.model('TicketMessage', ticketMessageSchema);
