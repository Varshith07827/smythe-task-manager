const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  board: { type: mongoose.Schema.Types.ObjectId, ref: 'Board' },
  task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: {
    type: String,
    enum: [
      'board_created', 'board_updated', 'board_deleted', 'board_archived',
      'column_added', 'column_removed', 'column_updated',
      'task_created', 'task_updated', 'task_deleted', 'task_archived',
      'task_assigned', 'task_unassigned', 'status_changed',
      'comment_added', 'comment_edited', 'comment_deleted',
      'attachment_uploaded', 'attachment_deleted',
      'user_invited', 'user_removed', 'user_restored', 'role_changed',
      'bulk_update', 'bulk_assign', 'bulk_status_change', 'task_reminded'
    ],
    required: true
  },
  target: {
    type: { type: String, enum: ['board', 'task', 'user', 'column', 'attachment'] },
    id: mongoose.Schema.Types.ObjectId,
    name: String
  },
  changes: [{
    field: String,
    from: mongoose.Schema.Types.Mixed,
    to: mongoose.Schema.Types.Mixed
  }],
  metadata: mongoose.Schema.Types.Mixed,
  ipAddress: String,
  userAgent: String
}, { timestamps: true });

activityLogSchema.index({ organization: 1, createdAt: -1 });
activityLogSchema.index({ board: 1, createdAt: -1 });
activityLogSchema.index({ task: 1, createdAt: -1 });
activityLogSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
