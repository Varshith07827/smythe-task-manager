const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema({
  task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
  board: { type: mongoose.Schema.Types.ObjectId, ref: 'Board', required: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  filename: { type: String, required: true },
  storageKey: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  url: { type: String },
  thumbnailUrl: { type: String },
  metadata: {
    width: Number,
    height: Number,
    pages: Number
  }
}, { timestamps: true });

attachmentSchema.index({ task: 1 });
attachmentSchema.index({ board: 1 });

module.exports = mongoose.model('Attachment', attachmentSchema);
