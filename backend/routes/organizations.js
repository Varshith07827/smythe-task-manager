/**
 * Organization routes — single-org white-label model.
 *
 * The instance has exactly ONE organization in its DB.
 * All routes use /me to auto-resolve it; no org ID in URLs.
 *
 * Public:
 *   GET  /organizations/branding/public   — login-page branding (no auth)
 *   GET  /organizations/branding/file/:f  — serve uploaded logo/favicon (no auth)
 *
 * Authenticated:
 *   GET   /organizations/me               — get the org
 *   PATCH /organizations/me               — update name/settings (admin only)
 *   POST  /organizations/me/branding/upload
 *   GET   /organizations/me/automations   — automation settings (admin only)
 *   PATCH /organizations/me/automations
 *   POST  /organizations/me/automations/trigger/deadline-reminder
 *   POST  /organizations/me/automations/trigger/progress-digest
 */
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
    filename:    (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, file.mimetype === 'image/png' && ext === '.png');
  }
});

/** Helper: always returns the single org document */
async function getOrg() {
  return Organization.findOne().lean();
}
async function getOrgFull() {
  return Organization.findOne();
}

// ─── Public endpoints (no auth) ────────────────────────────────────────────

// Serve uploaded branding files
router.get('/branding/file/:filename', (req, res) => {
  const filePath = path.join(BRANDING_DIR, path.basename(req.params.filename));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(filePath);
});

// Login-page branding snapshot
router.get('/branding/public', async (req, res) => {
  try {
    const org = await Organization.findOne().select('branding settings.allowSignup').lean();
    const defaults = {
      appTitle: 'Smythe', tagline: '', logoUrl: '', logoShape: 'rounded',
      accentColor: '#0a84ff', logoSize: 48, showLogoInHeader: true,
      showLogoInSidebar: true, headerLogoUrl: '', headerLogoHeight: 36,
      showNameInHeader: true, faviconUrl: '', siteTitle: '', sidebarColor: '#1a1a2e'
    };
    res.json({ ...defaults, ...org?.branding, allowSignup: org?.settings?.allowSignup || false });
  } catch (err) {
    res.json({
      appTitle: 'Smythe', tagline: '', logoUrl: '', logoShape: 'rounded',
      accentColor: '#0a84ff', logoSize: 48, showLogoInHeader: true,
      showLogoInSidebar: true, headerLogoUrl: '', headerLogoHeight: 36,
      showNameInHeader: true, faviconUrl: '', siteTitle: '', sidebarColor: '#1a1a2e',
      allowSignup: false
    });
  }
});

// ─── Authenticated /me routes ───────────────────────────────────────────────

router.get('/me', authenticate, async (req, res) => {
  try {
    const org = await Organization.findOne().populate('members.user', 'name email role status avatar');
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    res.json(org);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/me', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { name, settings, branding } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (settings !== undefined) {
      for (const [k, v] of Object.entries(settings)) {
        update[`settings.${k}`] = v;
      }
    }
    if (branding !== undefined) {
      // Whitelist branding fields to prevent arbitrary key injection
      const BRANDING_FIELDS = [
        'appTitle', 'tagline', 'logoUrl', 'logoShape', 'accentColor', 'logoSize',
        'showLogoInHeader', 'showLogoInSidebar', 'headerLogoUrl', 'headerLogoHeight',
        'showNameInHeader', 'useSameLogo', 'faviconUrl', 'siteTitle', 'sidebarColor'
      ];
      for (const [k, v] of Object.entries(branding)) {
        if (BRANDING_FIELDS.includes(k)) update[`branding.${k}`] = v;
      }
    }
    const org = await Organization.findOneAndUpdate({}, { $set: update }, { new: true });
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
router.post('/me/branding/upload', authenticate, authorize('admin'), brandingUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Only PNG files are allowed' });
    const field = req.body.field;
    if (!['logoUrl', 'faviconUrl'].includes(field)) {
      return res.status(400).json({ error: 'field must be logoUrl or faviconUrl' });
    }

    const fileUrl = `/api/organizations/branding/file/${req.file.filename}`;

    // Delete old file if it was a local upload
    const org = await Organization.findOne().select('branding').lean();
    const oldUrl = org?.branding?.[field];
    if (oldUrl?.startsWith('/api/organizations/branding/file/')) {
      const oldFilename = path.basename(oldUrl);
      const oldPath = path.join(BRANDING_DIR, oldFilename);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    await Organization.findOneAndUpdate({}, { $set: { [`branding.${field}`]: fileUrl } });

    try {
      const emailService = require('../services/emailService');
      if (emailService._clearBrandingCache) emailService._clearBrandingCache();
    } catch { }

    res.json({ url: fileUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Automation config ──────────────────────────────────────────────────────

router.get('/me/automations', authenticate, authorize('admin'), async (req, res) => {
  try {
    const org = await Organization.findOne().select('settings.automations').lean();
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    const automations = org.settings?.automations || {};
    res.json({
      deadlineReminder: {
        enabled:        automations.deadlineReminder?.enabled !== false,
        cronMode:       automations.deadlineReminder?.cronMode || 'internal',
        webhookUrl:     automations.deadlineReminder?.webhookUrl || '',
        webhookSecret:  automations.deadlineReminder?.webhookSecret || '',
        cronExpression: process.env.DEADLINE_REMINDER_CRON || '*/30 * * * *'
      },
      progressDigest: {
        enabled:        automations.progressDigest?.enabled !== false,
        cronMode:       automations.progressDigest?.cronMode || 'internal',
        webhookUrl:     automations.progressDigest?.webhookUrl || '',
        webhookSecret:  automations.progressDigest?.webhookSecret || '',
        cronExpression: process.env.PROGRESS_DIGEST_CRON || '0 */4 * * *'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/me/automations', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { deadlineReminder, progressDigest } = req.body;
    const update = {};

    // Validate webhook URLs — must be https:// and not internal IPs
    const validateWebhookUrl = (url) => {
      if (!url || url === '') return true; // blank = disabled
      try {
        const parsed = new URL(url);
        if (!['https:', 'http:'].includes(parsed.protocol)) return false;
        // Block internal/private IPs
        const host = parsed.hostname;
        if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(host)) return false;
        if (/^(10|172\.(1[6-9]|2\d|3[01])|192\.168)\./.test(host)) return false;
        return true;
      } catch { return false; }
    };

    const VALID_CRON_MODES = ['internal', 'external'];

    if (deadlineReminder !== undefined) {
      if (deadlineReminder.enabled !== undefined)
        update['settings.automations.deadlineReminder.enabled'] = !!deadlineReminder.enabled;
      if (deadlineReminder.cronMode !== undefined && VALID_CRON_MODES.includes(deadlineReminder.cronMode))
        update['settings.automations.deadlineReminder.cronMode'] = deadlineReminder.cronMode;
      if (deadlineReminder.webhookUrl !== undefined) {
        if (!validateWebhookUrl(deadlineReminder.webhookUrl))
          return res.status(400).json({ error: 'Invalid webhook URL for deadline reminder' });
        update['settings.automations.deadlineReminder.webhookUrl'] = deadlineReminder.webhookUrl;
      }
      if (deadlineReminder.webhookSecret !== undefined)
        update['settings.automations.deadlineReminder.webhookSecret'] = String(deadlineReminder.webhookSecret).slice(0, 256);
    }
    if (progressDigest !== undefined) {
      if (progressDigest.enabled !== undefined)
        update['settings.automations.progressDigest.enabled'] = !!progressDigest.enabled;
      if (progressDigest.cronMode !== undefined && VALID_CRON_MODES.includes(progressDigest.cronMode))
        update['settings.automations.progressDigest.cronMode'] = progressDigest.cronMode;
      if (progressDigest.webhookUrl !== undefined) {
        if (!validateWebhookUrl(progressDigest.webhookUrl))
          return res.status(400).json({ error: 'Invalid webhook URL for progress digest' });
        update['settings.automations.progressDigest.webhookUrl'] = progressDigest.webhookUrl;
      }
      if (progressDigest.webhookSecret !== undefined)
        update['settings.automations.progressDigest.webhookSecret'] = String(progressDigest.webhookSecret).slice(0, 256);
    }
    if (!Object.keys(update).length) return res.status(400).json({ error: 'No valid fields to update' });
    await Organization.findOneAndUpdate({}, { $set: update });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual triggers — for external cron services (cron-job.org, GitHub Actions, Render, etc.)
router.post('/me/automations/trigger/deadline-reminder', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { runDeadlineCheck } = require('../services/deadlineReminderScheduler');
    await runDeadlineCheck();
    res.json({ ok: true, triggered: 'deadline-reminder' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/me/automations/trigger/progress-digest', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { runProgressDigestTick } = require('../services/progressDigestScheduler');
    await runProgressDigestTick();
    res.json({ ok: true, triggered: 'progress-digest' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Multer error handler ───────────────────────────────────────────────────

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'PNG file is too large. Max size is 10MB.' });
    return res.status(400).json({ error: err.message });
  }
  return next(err);
});

module.exports = router;
