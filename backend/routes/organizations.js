const router = require('express').Router();
const Organization = require('../models/Organization');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const BRANDING_DIR = path.join(__dirname, '..', 'uploads', 'branding');
if (!fs.existsSync(BRANDING_DIR)) fs.mkdirSync(BRANDING_DIR, { recursive: true });

const brandingUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, BRANDING_DIR),
    filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon'];
    cb(null, allowed.includes(file.mimetype));
  }
});

// Serve branding files publicly (no auth — used on login page)
router.get('/branding/file/:filename', (req, res) => {
  const filePath = path.join(BRANDING_DIR, path.basename(req.params.filename));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(filePath);
});

// Public branding endpoint — no auth required (used on login page)
router.get('/branding/public', async (req, res) => {
  try {
    // Get the most recently updated org's branding + signup setting
    const org = await Organization.findOne().sort({ updatedAt: -1 }).select('branding settings.allowSignup').lean();
    const defaults = { appTitle: 'Smythe', tagline: '', logoUrl: '', logoShape: 'rounded', accentColor: '#0a84ff', logoSize: 48, faviconUrl: '', siteTitle: '', sidebarColor: '#1a1a2e' };
    res.json({ ...defaults, ...org?.branding, allowSignup: org?.settings?.allowSignup || false });
  } catch (err) {
    res.json({ appTitle: 'Smythe', tagline: '', logoUrl: '', logoShape: 'rounded', accentColor: '#0a84ff', logoSize: 48, faviconUrl: '', siteTitle: '', sidebarColor: '#1a1a2e', allowSignup: false });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const org = await Organization.findById(req.params.id)
      .populate('members.user', 'name email role status avatar');
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    res.json(org);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { name, settings, branding } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (settings !== undefined) {
      for (const [k, v] of Object.entries(settings)) {
        update[`settings.${k}`] = v;
      }
    }
    if (branding !== undefined) update.branding = branding;
    const org = await Organization.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true }
    );

    // Clear email service branding cache so emails use new branding immediately
    try {
      const emailService = require('../services/emailService');
      if (emailService._clearBrandingCache) emailService._clearBrandingCache();
    } catch { }

    res.json(org);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload branding image (logo or favicon)
router.post('/:id/branding/upload', authenticate, authorize('admin'), brandingUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const field = req.body.field; // 'logoUrl' or 'faviconUrl'
    if (!['logoUrl', 'faviconUrl'].includes(field)) {
      return res.status(400).json({ error: 'field must be logoUrl or faviconUrl' });
    }

    const fileUrl = `/api/organizations/branding/file/${req.file.filename}`;

    // Delete old file if it was a local upload
    const org = await Organization.findById(req.params.id).select('branding').lean();
    const oldUrl = org?.branding?.[field];
    if (oldUrl?.startsWith('/api/organizations/branding/file/')) {
      const oldFilename = path.basename(oldUrl);
      const oldPath = path.join(BRANDING_DIR, oldFilename);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    await Organization.findByIdAndUpdate(req.params.id, {
      $set: { [`branding.${field}`]: fileUrl }
    });

    // Clear email branding cache
    try {
      const emailService = require('../services/emailService');
      if (emailService._clearBrandingCache) emailService._clearBrandingCache();
    } catch { }

    res.json({ url: fileUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
