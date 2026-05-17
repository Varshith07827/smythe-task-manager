const mongoose = require('mongoose');

const columnSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 100 },
  type: {
    type: String,
    enum: ['text', 'number', 'dropdown', 'date', 'checkbox', 'user', 'url', 'email', 'tag'],
    required: true
  },
  options: [String],
  required: { type: Boolean, default: false },
  defaultValue: mongoose.Schema.Types.Mixed,
  order: { type: Number },
  width: { type: Number, default: 150 },
  visible: { type: Boolean, default: true },
  color: { type: String }
}, { _id: true });

const boardSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, maxlength: 5000 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  columns: [columnSchema],
  permissions: {
    visibility: {
      type: String,
      enum: ['all', 'restricted'],
      default: 'all'
    },
    allowedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    userCanComment: { type: Boolean, default: true },
    userCanChangeStatus: { type: Boolean, default: true },
    userEditableColumns: [mongoose.Schema.Types.ObjectId]
  },
  defaultSort: { field: String, direction: { type: String, enum: ['asc', 'desc'] } },
  defaultFilter: mongoose.Schema.Types.Mixed,
  progressDigest: {
    enabled: { type: Boolean, default: false },
    intervalHours: { type: Number, default: 4 }
  },
  customStatuses: [{
    value: { type: String, required: true },
    label: { type: String, required: true },
    color: { type: String, default: '#0a84ff' }
  }],
  customPriorities: [{
    value: { type: String, required: true },
    label: { type: String, required: true },
    color: { type: String, default: '#0a84ff' }
  }],
  color: { type: String, default: '' },
  archived: { type: Boolean, default: false }
}, { timestamps: true });

// Normalize legacy visibility values before save
boardSchema.pre('save', function (next) {
  if (this.permissions?.visibility && !['all', 'restricted'].includes(this.permissions.visibility)) {
    this.permissions.visibility = 'all';
  }
  next();
});

boardSchema.index({ archived: 1, createdAt: -1 });
boardSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Board', boardSchema);
