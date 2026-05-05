const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['admin', 'user'] },
    joinedAt: { type: Date, default: Date.now }
  }],
  settings: {
    maxBoards: { type: Number, default: 50 },
    maxMembers: { type: Number, default: 100 },
    allowUserComments: { type: Boolean, default: true },
    allowSignup: { type: Boolean, default: false },
    automations: {
      deadlineReminder: { enabled: { type: Boolean, default: true } },
      progressDigest:   { enabled: { type: Boolean, default: true } }
    }
  },
  branding: {
    appTitle: { type: String, default: 'Smythe', trim: true },
    tagline: { type: String, default: '', trim: true },
    logoUrl: { type: String, default: '', trim: true },
    logoShape: { type: String, enum: ['circle', 'rounded', 'square'], default: 'rounded' },
    accentColor: { type: String, default: '#0a84ff', trim: true },
    logoSize: { type: Number, default: 48, min: 24, max: 120 },
    showLogoInHeader: { type: Boolean, default: true },
    showLogoInSidebar: { type: Boolean, default: true },
    headerLogoUrl: { type: String, default: '', trim: true },
    headerLogoHeight: { type: Number, default: 36, min: 20, max: 80 },
    showNameInHeader: { type: Boolean, default: true },
    useSameLogo: { type: Boolean, default: true },
    faviconUrl: { type: String, default: '', trim: true },
    siteTitle: { type: String, default: '', trim: true },
    sidebarColor: { type: String, default: '#1a1a2e', trim: true }
  },
  inviteCode: { type: String, unique: true }
}, { timestamps: true });

organizationSchema.index({ creator: 1 });
organizationSchema.index({ 'members.user': 1 });

module.exports = mongoose.model('Organization', organizationSchema);
