const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: {
    type: String,
    enum: [
      'task_assigned', 'task_unassigned', 'task_updated', 'task_completed',
      'status_changed', 'comment_added', 'mentioned', 'deadline_approaching',
      'deadline_overdue', 'board_shared', 'role_changed', 'bulk_assigned',
      'progress_digest', 'reminder'
    ],
    required: true
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  board: { type: mongoose.Schema.Types.ObjectId, ref: 'Board' },
  task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  read: { type: Boolean, default: false },
  readAt: { type: Date },
  groupKey: { type: String },
  expiresAt: { type: Date }
}, { timestamps: true });

notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Notification', notificationSchema);
