/**
 * Send one test email via Noteify (same path as app notifications).
 * Usage: npm run test:email -- you@example.com
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const emailService = require('../services/emailService');

const to = process.argv[2];
if (!to || !to.includes('@')) {
  console.error('Usage: npm run test:email -- recipient@email.com');
  process.exit(1);
}

(async () => {
  const appName = 'App';
  const html = emailService.buildNotificationEmail(
    'Test notification',
    'If you see this, email delivery (Noteify) is working.',
    'task_updated'
  );
  const result = await emailService.send(to, `${appName} — test notification`, html);
  if (result === null && !process.env.NOTEIFY_API_KEY) {
    console.error('NOTEIFY_API_KEY is not set in backend/.env');
    process.exit(1);
  }
  if (result === null) {
    console.error('Send failed (check server logs / Noteify response).');
    process.exit(1);
  }
  console.log('Test email sent to', to);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
