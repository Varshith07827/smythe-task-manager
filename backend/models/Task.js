const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  board: { type: mongoose.Schema.Types.ObjectId, ref: 'Board', required: true },
  title: { type: String, required: true, trim: true },
  description: { type: String },
  assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: {
    type: String,
    default: 'pending'
  },
  priority: {
    type: String,
    default: 'medium'
  },
  dueDate: { type: Date },
  startDate: { type: Date },
  completedAt: { type: Date },
  columnValues: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: new Map()
  },
  history: [{
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: {
      type: String,
      enum: ['created', 'updated', 'status_changed', 'assigned', 'unassigned',
             'commented', 'attachment_added', 'attachment_removed',
             'reminder_sent', 'notification_updated']
    },
    field: String,
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
    timestamp: { type: Date, default: Date.now },
    metadata: mongoose.Schema.Types.Mixed
  }],
  comments: [{
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    text: { type: String, required: true },
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdAt: { type: Date, default: Date.now },
    editedAt: { type: Date }
  }],
  attachments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Attachment'
  }],
  taskNotifications: {
    dailyReminder: { enabled: { type: Boolean, default: false }, hour: { type: Number, default: 9 } },
    intervalReminder: { enabled: { type: Boolean, default: false }, hours: { type: Number, default: 6 } },
    urgentMode: {
      enabled: { type: Boolean, default: true },
      thresholdDays: { type: Number, default: 3 },
      intervalHours: { type: Number, default: 4 }
    },
    deliveryMode: { type: String, default: 'realtime' },
    quietHoursEnabled: { type: Boolean, default: false },
    quietHoursStart: { type: String, default: '22:00' },
    quietHoursEnd: { type: String, default: '08:00' },
    statusChanged: { type: Boolean, default: true },
    notifyOnStatuses: { type: [String], default: ['pending', 'in_progress', 'completed', 'blocked', 'cancelled'] },
    lastRemindedAt: { type: Date, default: null }
  },
  order: { type: Number, default: 0 },
  parentTask: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
  archived: { type: Boolean, default: false }
}, { timestamps: true });

taskSchema.index({ board: 1, status: 1, order: 1 });
taskSchema.index({ board: 1, assignedTo: 1 });
taskSchema.index({ board: 1, dueDate: 1 });
taskSchema.index({ board: 1, priority: 1 });
taskSchema.index({ assignedTo: 1, status: 1, dueDate: 1 });
taskSchema.index({ title: 'text', description: 'text' });
taskSchema.index({ parentTask: 1 });
taskSchema.index({ archived: 1 });

module.exports = mongoose.model('Task', taskSchema);
