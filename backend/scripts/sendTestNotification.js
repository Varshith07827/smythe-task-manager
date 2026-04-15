/**
 * Send one test email via Noteify (same path as app notifications).
<<<<<<< HEAD
 * Usage: npm run test:email -- recipient@email.com [organizationId]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');

const connectDB = require('../config/db');
const emailService = require('../services/emailService');

const to = process.argv[2];
const organizationId = process.argv[3];
if (!to || !to.includes('@')) {
  console.error('Usage: npm run test:email -- recipient@email.com [organizationId]');
=======
 * Usage: npm run test:email -- you@example.com
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const emailService = require('../services/emailService');

const to = process.argv[2];
if (!to || !to.includes('@')) {
  console.error('Usage: npm run test:email -- recipient@email.com');
>>>>>>> 4a2c44b9f852ac127d3b4c323269b1fa2d355676
  process.exit(1);
}

(async () => {
<<<<<<< HEAD
  await connectDB();

  const branding = await emailService.getAppBranding(organizationId);
  const appName = branding.siteTitle || branding.appTitle || 'Smythe';

  const html = emailService.buildNotificationEmail(
    'Test notification',
    `This is a branded test email from ${appName}.\n\nIf this text renders correctly, UTF-8 email content is working.`,
    'task_updated',
    branding
  );
  const result = await emailService.send(to, `${appName} - test notification`, html);
=======
  const appName = 'App';
  const html = emailService.buildNotificationEmail(
    'Test notification',
    'If you see this, email delivery (Noteify) is working.',
    'task_updated'
  );
  const result = await emailService.send(to, `${appName} — test notification`, html);
>>>>>>> 4a2c44b9f852ac127d3b4c323269b1fa2d355676
  if (result === null && !process.env.NOTEIFY_API_KEY) {
    console.error('NOTEIFY_API_KEY is not set in backend/.env');
    process.exit(1);
  }
  if (result === null) {
    console.error('Send failed (check server logs / Noteify response).');
    process.exit(1);
  }
  console.log('Test email sent to', to);
<<<<<<< HEAD
  await mongoose.connection.close();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  mongoose.connection.close().catch(() => {});
=======
  process.exit(0);
})().catch((e) => {
  console.error(e);
>>>>>>> 4a2c44b9f852ac127d3b4c323269b1fa2d355676
  process.exit(1);
});
