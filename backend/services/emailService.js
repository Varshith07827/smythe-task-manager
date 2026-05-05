const DEFAULT_NOTEIFY_URL = 'https://noteify.org/email/';

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function noteifyUrl() {
  const raw = process.env.NOTEIFY_URL || DEFAULT_NOTEIFY_URL;
  return raw.endsWith('/') ? raw : `${raw}/`;
}

function publicAppUrl() {
  const base = process.env.APP_PUBLIC_URL || process.env.CLIENT_URL || 'http://localhost:5173';
  return base.replace(/\/$/, '');
}

/** Fetch branding from DB or fall back to defaults */
async function getAppBranding(organizationId) {
  try {
    const Organization = require('../models/Organization');
    const org = organizationId
      ? await Organization.findById(organizationId).select('branding').lean()
      : await Organization.findOne().select('branding').lean();
    return {
      appTitle: org?.branding?.appTitle || 'Smythe',
      tagline: org?.branding?.tagline || '',
      logoUrl: org?.branding?.logoUrl || '',
      logoShape: org?.branding?.logoShape || 'rounded',
      logoSize: org?.branding?.logoSize || 48,
      faviconUrl: org?.branding?.faviconUrl || '',
      siteTitle: org?.branding?.siteTitle || '',
      sidebarColor: org?.branding?.sidebarColor || '#1a1a2e',
      accentColor: org?.branding?.accentColor || '#0a84ff'
    };
  } catch {
    return {
      appTitle: 'Smythe',
      tagline: '',
      logoUrl: '',
      logoShape: 'rounded',
      logoSize: 48,
      faviconUrl: '',
      siteTitle: '',
      sidebarColor: '#1a1a2e',
      accentColor: '#0a84ff'
    };
  }
}

const emailService = {
  /**
   * Send an email notification via Noteify API
   */
  async send(email, subject, body) {
    const apiKey = process.env.NOTEIFY_API_KEY;
    if (!apiKey) {
      console.warn('[EmailService] NOTEIFY_API_KEY not set, skipping email');
      return null;
    }

    try {
      const response = await fetch(noteifyUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apikey: apiKey,
          email,
          subject,
          body
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        console.error('[EmailService] Failed to send email:', response.status, data);
        return null;
      }

      console.log(`[EmailService] Email sent to ${email}: "${subject}"`, JSON.stringify(data));
      return data;
    } catch (err) {
      console.error('[EmailService] Error sending email:', err.message);
      return null;
    }
  },

  /**
   * Build a styled HTML email body for task notifications
   */
  buildNotificationEmail(title, message, type, brandingOverride) {
    const safeTitle = escapeHtml(title);
    const safeMessage = escapeHtml(message);
    const appUrl = publicAppUrl();
    const appName = escapeHtml(brandingOverride?.appTitle || 'Smythe');

    const typeColors = {
      task_assigned: '#0a84ff',
      task_unassigned: '#ff9f0a',
      task_updated: '#64d2ff',
      task_completed: '#30d158',
      status_changed: '#bf5af2',
      comment_added: '#5e5ce6',
      mentioned: '#ff375f',
      deadline_approaching: '#ff9f0a',
      deadline_overdue: '#ff453a',
      board_shared: '#0a84ff',
      role_changed: '#bf5af2',
      bulk_assigned: '#0a84ff',
      progress_digest: '#30d158',
      reminder: '#ff9f0a'
    };

    const accentColor = brandingOverride?.accentColor || typeColors[type] || '#0a84ff';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,'SF Pro Display','Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid rgba(0,0,0,0.08);box-shadow:0 2px 12px rgba(0,0,0,0.06);">
    <div style="height:4px;background:linear-gradient(90deg,${accentColor},#bf5af2);"></div>
    <div style="padding:36px 32px;">
      <div style="margin-bottom:24px;">
        <span style="font-size:24px;font-weight:700;color:${accentColor};letter-spacing:-0.4px;">${appName}</span>
      </div>
      <h2 style="font-size:18px;font-weight:600;color:#1d1d1f;margin:0 0 8px;letter-spacing:-0.02em;">${safeTitle}</h2>
      <p style="font-size:15px;color:#6e6e73;margin:0 0 28px;line-height:1.55;white-space:pre-wrap;">${safeMessage}</p>
      <a href="${escapeHtml(appUrl)}" style="display:inline-block;padding:10px 24px;background:${accentColor};color:#fff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;letter-spacing:-0.01em;">Open ${appName}</a>
    </div>
    <div style="padding:16px 32px;border-top:1px solid rgba(0,0,0,0.06);">
      <p style="font-size:11px;color:#8e8e93;margin:0;">You're receiving this because you enabled email notifications in ${appName}.</p>
    </div>
  </div>
</body>
</html>`;
  },

  /** HTML list of assigned tasks for scheduled digest emails. */
  buildProgressDigestEmail(boardTitle, tasks, brandingOverride) {
    const safeBoard = escapeHtml(boardTitle);
    const appUrl = publicAppUrl();
    const appName = escapeHtml(brandingOverride?.appTitle || 'Smythe');
    const accentColor = brandingOverride?.accentColor || '#30d158';
    const rows = (tasks || []).map((t) => {
      const st = escapeHtml(String(t.status || '').replace(/_/g, ' '));
      const title = escapeHtml(t.title);
      const due = t.dueDate
        ? escapeHtml(
            new Date(t.dueDate).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            })
          )
        : '';
      return `<tr><td style="padding:10px 0;border-bottom:1px solid rgba(0,0,0,0.06);font-size:14px;color:#1d1d1f;font-weight:550;">${title}</td><td style="padding:10px 0;border-bottom:1px solid rgba(0,0,0,0.06);font-size:13px;color:#6e6e73;text-transform:capitalize;">${st}</td><td style="padding:10px 0;border-bottom:1px solid rgba(0,0,0,0.06);font-size:13px;color:#8e8e93;white-space:nowrap;">${due || '—'}</td></tr>`;
    }).join('');

    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,'SF Pro Display','Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid rgba(0,0,0,0.08);box-shadow:0 2px 12px rgba(0,0,0,0.06);">
    <div style="height:4px;background:linear-gradient(90deg,${accentColor},#64d2ff);"></div>
    <div style="padding:32px 28px;">
      <span style="font-size:22px;font-weight:700;color:${accentColor};">${appName}</span>
      <h2 style="font-size:17px;font-weight:600;color:#1d1d1f;margin:20px 0 6px;">Task progress summary</h2>
      <p style="font-size:14px;color:#6e6e73;margin:0 0 20px;">${safeBoard}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <thead><tr><th align="left" style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#8e8e93;padding:0 0 8px;">Task</th><th align="left" style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#8e8e93;padding:0 0 8px;">Status</th><th align="left" style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#8e8e93;padding:0 0 8px;">Due</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <a href="${escapeHtml(appUrl)}" style="display:inline-block;margin-top:24px;padding:10px 22px;background:${accentColor};color:#fff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">Open ${appName}</a>
    </div>
    <div style="padding:14px 28px;border-top:1px solid rgba(0,0,0,0.06);">
      <p style="font-size:11px;color:#8e8e93;margin:0;">Scheduled summary of tasks assigned to you. Change this in Settings &rarr; Notifications.</p>
    </div>
  </div>
</body>
</html>`;
  },

  /** Get branding for email subjects/bodies */
  getAppBranding
};

module.exports = emailService;
