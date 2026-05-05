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
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const isPngMime = file.mimetype === 'image/png';
    const isPngExt = ext === '.png';
    cb(null, isPngMime && isPngExt);
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
    const defaults = { appTitle: 'Smythe', tagline: '', logoUrl: '', logoShape: 'rounded', accentColor: '#0a84ff', logoSize: 48, showLogoInHeader: true, showLogoInSidebar: true, headerLogoUrl: '', headerLogoHeight: 36, showNameInHeader: true, faviconUrl: '', siteTitle: '', sidebarColor: '#1a1a2e' };
    res.json({ ...defaults, ...org?.branding, allowSignup: org?.settings?.allowSignup || false });
  } catch (err) {
    res.json({ appTitle: 'Smythe', tagline: '', logoUrl: '', logoShape: 'rounded', accentColor: '#0a84ff', logoSize: 48, showLogoInHeader: true, showLogoInSidebar: true, headerLogoUrl: '', headerLogoHeight: 36, showNameInHeader: true, faviconUrl: '', siteTitle: '', sidebarColor: '#1a1a2e', allowSignup: false });
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
    if (!req.file) return res.status(400).json({ error: 'Only PNG files are allowed' });
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

// Automation config — GET returns current settings, PATCH updates them
router.get('/:id/automations', authenticate, authorize('admin'), async (req, res) => {
  try {
    const userOrgId = req.user.organization?.toString();
    if (userOrgId !== req.params.id) {
      return res.status(403).json({ error: 'Cannot access another organization' });
    }
    const org = await Organization.findById(req.params.id).select('settings.automations').lean();
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    const automations = org.settings?.automations || {};
    res.json({
      deadlineReminder: {
        enabled:       automations.deadlineReminder?.enabled !== false,
        cronMode:      automations.deadlineReminder?.cronMode || 'internal',
        webhookUrl:    automations.deadlineReminder?.webhookUrl || '',
        webhookSecret: automations.deadlineReminder?.webhookSecret || '',
        cronExpression: process.env.DEADLINE_REMINDER_CRON || '*/30 * * * *'
      },
      progressDigest: {
        enabled:       automations.progressDigest?.enabled !== false,
        cronMode:      automations.progressDigest?.cronMode || 'internal',
        webhookUrl:    automations.progressDigest?.webhookUrl || '',
        webhookSecret: automations.progressDigest?.webhookSecret || '',
        cronExpression: process.env.PROGRESS_DIGEST_CRON || '0 */4 * * *'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/automations', authenticate, authorize('admin'), async (req, res) => {
  try {
    const orgId = req.params.id;
    const userOrgId = req.user.organization?.toString();
    if (userOrgId !== orgId) {
      return res.status(403).json({ error: 'Cannot modify another organization' });
    }

    const { deadlineReminder, progressDigest } = req.body;
    const update = {};
    if (deadlineReminder !== undefined) {
      if (deadlineReminder.enabled !== undefined)
        update['settings.automations.deadlineReminder.enabled'] = !!deadlineReminder.enabled;
      if (deadlineReminder.cronMode !== undefined)
        update['settings.automations.deadlineReminder.cronMode'] = deadlineReminder.cronMode;
      if (deadlineReminder.webhookUrl !== undefined)
        update['settings.automations.deadlineReminder.webhookUrl'] = deadlineReminder.webhookUrl;
      if (deadlineReminder.webhookSecret !== undefined)
        update['settings.automations.deadlineReminder.webhookSecret'] = deadlineReminder.webhookSecret;
    }
    if (progressDigest !== undefined) {
      if (progressDigest.enabled !== undefined)
        update['settings.automations.progressDigest.enabled'] = !!progressDigest.enabled;
      if (progressDigest.cronMode !== undefined)
        update['settings.automations.progressDigest.cronMode'] = progressDigest.cronMode;
      if (progressDigest.webhookUrl !== undefined)
        update['settings.automations.progressDigest.webhookUrl'] = progressDigest.webhookUrl;
      if (progressDigest.webhookSecret !== undefined)
        update['settings.automations.progressDigest.webhookSecret'] = progressDigest.webhookSecret;
    }
    if (!Object.keys(update).length) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    await Organization.findByIdAndUpdate(orgId, { $set: update });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual triggers — for use with external cron services (cron-job.org, GitHub Actions, etc.)
router.post('/:id/automations/trigger/deadline-reminder', authenticate, authorize('admin'), async (req, res) => {
  try {
    const userOrgId = req.user.organization?.toString();
    if (userOrgId !== req.params.id) {
      return res.status(403).json({ error: 'Cannot trigger for another organization' });
    }
    const { runDeadlineCheck } = require('../services/deadlineReminderScheduler');
    await runDeadlineCheck();
    res.json({ ok: true, triggered: 'deadline-reminder' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/automations/trigger/progress-digest', authenticate, authorize('admin'), async (req, res) => {
  try {
    const userOrgId = req.user.organization?.toString();
    if (userOrgId !== req.params.id) {
      return res.status(403).json({ error: 'Cannot trigger for another organization' });
    }
    const { runProgressDigestTick } = require('../services/progressDigestScheduler');
    await runProgressDigestTick();
    res.json({ ok: true, triggered: 'progress-digest' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'PNG file is too large. Max size is 10MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  return next(err);
});

module.exports = router;
