const mongoose = require('mongoose');
const https = require('https');
const http = require('http');
const Widget = require('../models/Widget');

const UNSAFE_PROTOCOLS = ['javascript:', 'data:', 'vbscript:', 'blob:', 'file:'];
const MAX_WIDGETS_PER_USER = 25;

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
}

function validateWidgetUrl(raw) {
  if (!raw || typeof raw !== 'string') return { valid: false, error: 'URL is required' };

  const trimmed = raw.trim();
  if (trimmed.length > 2048) return { valid: false, error: 'URL is too long (max 2048 characters)' };

  // Block unsafe protocols before even attempting to parse
  const lower = trimmed.toLowerCase();
  for (const proto of UNSAFE_PROTOCOLS) {
    if (lower.startsWith(proto)) {
      return { valid: false, error: `Unsafe protocol "${proto.replace(':', '')}" is not allowed` };
    }
  }

  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'Only http and https URLs are allowed' };
    }

    // Block local/internal addresses
    const host = parsed.hostname.toLowerCase();
    if (['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'].includes(host)) {
      return { valid: false, error: 'Local URLs are not allowed' };
    }
    if (/^(10|172\.(1[6-9]|2\d|3[01])|192\.168)\./.test(host)) {
      return { valid: false, error: 'Private network URLs are not allowed' };
    }
    if (host.endsWith('.local') || host.endsWith('.internal')) {
      return { valid: false, error: 'Internal network URLs are not allowed' };
    }

    return { valid: true, url: parsed.href };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Check if a URL allows iframe embedding by inspecting HTTP headers.
 * Returns { embeddable, reason }.
 */
function checkEmbedHeaders(targetUrl) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(targetUrl);
      const client = parsed.protocol === 'https:' ? https : http;
      const options = {
        method: 'HEAD',
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; EmbedCheck/1.0)'
        }
      };

      const req = client.request(options, (res) => {
        res.resume(); // consume data

        const xfo = (res.headers['x-frame-options'] || '').toLowerCase().trim();
        if (xfo === 'deny' || xfo === 'sameorigin') {
          return resolve({ embeddable: false, reason: 'x-frame-options' });
        }

        const csp = res.headers['content-security-policy'] || '';
        const match = csp.match(/frame-ancestors\s+([^;]+)/i);
        if (match) {
          const val = match[1].trim().toLowerCase();
          // If frame-ancestors is 'none' or 'self' only, it's blocked
          if (val === "'none'" || val === "'self'") {
            return resolve({ embeddable: false, reason: 'csp-frame-ancestors' });
          }
        }

        resolve({ embeddable: true });
      });

      req.on('error', () => resolve({ embeddable: true, reason: 'check-failed' }));
      req.on('timeout', () => { req.destroy(); resolve({ embeddable: true, reason: 'timeout' }); });
      req.end();
    } catch {
      resolve({ embeddable: true, reason: 'error' });
    }
  });
}

const widgetController = {
  async checkEmbed(req, res) {
    try {
      const { url } = req.query;
      if (!url) return res.status(400).json({ error: 'URL is required' });

      const validation = validateWidgetUrl(url);
      if (!validation.valid) return res.status(400).json({ error: validation.error });

      const result = await checkEmbedHeaders(validation.url);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async create(req, res) {
    try {
      const { name, url } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: 'Widget name is required' });
      if (name.trim().length > 200) return res.status(400).json({ error: 'Widget name is too long (max 200 characters)' });

      const validation = validateWidgetUrl(url);
      if (!validation.valid) return res.status(400).json({ error: validation.error });

      const count = await Widget.countDocuments({ userId: req.user._id });
      if (count >= MAX_WIDGETS_PER_USER) {
        return res.status(400).json({ error: `Maximum ${MAX_WIDGETS_PER_USER} widgets allowed per user` });
      }

      const widget = await Widget.create({
        userId: req.user._id,
        name: name.trim(),
        url: validation.url
      });

      res.status(201).json(widget);
    } catch (err) {
      if (err.name === 'ValidationError') {
        const msg = Object.values(err.errors).map(e => e.message).join(', ');
        return res.status(400).json({ error: msg });
      }
      res.status(500).json({ error: err.message });
    }
  },

  async getAll(req, res) {
    try {
      const widgets = await Widget.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .lean();
      res.json(widgets);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      if (!isValidId(req.params.id)) return res.status(404).json({ error: 'Widget not found' });

      const { name, url } = req.body;

      const widget = await Widget.findOne({ _id: req.params.id, userId: req.user._id });
      if (!widget) return res.status(404).json({ error: 'Widget not found' });

      if (name !== undefined) {
        if (!name.trim()) return res.status(400).json({ error: 'Widget name is required' });
        if (name.trim().length > 200) return res.status(400).json({ error: 'Widget name is too long' });
        widget.name = name.trim();
      }

      if (url !== undefined) {
        const validation = validateWidgetUrl(url);
        if (!validation.valid) return res.status(400).json({ error: validation.error });
        widget.url = validation.url;
      }

      await widget.save();
      res.json(widget);
    } catch (err) {
      if (err.name === 'ValidationError') {
        const msg = Object.values(err.errors).map(e => e.message).join(', ');
        return res.status(400).json({ error: msg });
      }
      res.status(500).json({ error: err.message });
    }
  },

  async delete(req, res) {
    try {
      if (!isValidId(req.params.id)) return res.status(404).json({ error: 'Widget not found' });

      const widget = await Widget.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
      if (!widget) return res.status(404).json({ error: 'Widget not found' });
      res.json({ message: 'Widget deleted' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
};

module.exports = widgetController;
