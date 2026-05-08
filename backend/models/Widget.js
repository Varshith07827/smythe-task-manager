const mongoose = require('mongoose');

const widgetSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 200
  },
  url: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2048,
    validate: {
      validator: function (v) {
        try {
          const parsed = new URL(v);
          return ['http:', 'https:'].includes(parsed.protocol);
        } catch {
          return false;
        }
      },
      message: 'URL must be a valid http or https URL'
    }
  }
}, { timestamps: true });

widgetSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Widget', widgetSchema);
