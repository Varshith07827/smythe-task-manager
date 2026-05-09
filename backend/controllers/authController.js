const User = require('../models/User');
const Organization = require('../models/Organization');
const { generateToken } = require('../middleware/auth');
const crypto = require('crypto');
const emailService = require('../services/emailService');
const log = require('../utils/logger');

const otpStore = new Map();
const pendingRegistrations = new Map();

const OTP_MAX_ATTEMPTS = 5;
const OTP_EXPIRY_MS = 10 * 60 * 1000;
const REG_EXPIRY_MS = 15 * 60 * 1000;

function generateOtp() {
  return crypto.randomInt(100000, 999999).toString();
}

function safeEqual(a, b) {
  try {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch { return false; }
}

function generateTempPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pw = '';
  for (let i = 0; i < 12; i++) pw += chars[crypto.randomInt(chars.length)];
  return pw;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of otpStore) {
    if (now > val.expires) otpStore.delete(key);
  }
  for (const [key, val] of pendingRegistrations) {
    if (now > val.expires) pendingRegistrations.delete(key);
  }
}, 60 * 1000);

const authController = {
  async requestOtp(req, res) {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: 'Email is required' });

      const normalizedEmail = email.toLowerCase().trim();
      const user = await User.findOne({ email: normalizedEmail });
      if (!user) return res.status(404).json({ error: 'No account found with this email' });
      if (user.status === 'inactive') return res.status(401).json({ error: 'Account deactivated' });

      const code = generateOtp();
      otpStore.set(normalizedEmail, { code, expires: Date.now() + OTP_EXPIRY_MS, attempts: 0 });

      const branding = await emailService.getAppBranding();
      const appName = branding.appTitle || 'TaskIT';
      const html = emailService.buildNotificationEmail(
        'Your login code',
        `Your one-time login code is:\n\n${code}\n\nThis code expires in 10 minutes.`,
        'task_assigned',
        branding
      );
      await emailService.send(normalizedEmail, `${appName} - Login Code`, html);

      res.json({ message: 'OTP sent to your email' });
    } catch (err) {
      log.error('Auth', `requestOtp: ${err.message}`);
      res.status(500).json({ error: 'Failed to send OTP' });
    }
  },

  async verifyOtp(req, res) {
    try {
      const { email, code } = req.body;
      if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });

      const normalizedEmail = email.toLowerCase().trim();
      const entry = otpStore.get(normalizedEmail);
      if (!entry) return res.status(401).json({ error: 'Invalid or expired code' });

      entry.attempts = (entry.attempts || 0) + 1;
      if (entry.attempts > OTP_MAX_ATTEMPTS) {
        otpStore.delete(normalizedEmail);
        return res.status(429).json({ error: 'Too many attempts. Please request a new code.' });
      }

      if (Date.now() > entry.expires) {
        otpStore.delete(normalizedEmail);
        return res.status(401).json({ error: 'Code expired' });
      }

      if (!safeEqual(entry.code, code.trim())) {
        return res.status(401).json({ error: 'Invalid code' });
      }

      otpStore.delete(normalizedEmail);

      const user = await User.findOne({ email: normalizedEmail });
      if (!user) return res.status(404).json({ error: 'User not found' });

      if (user.status === 'invited') {
        user.status = 'active';
        await user.save({ validateBeforeSave: false });
      }

      const token = generateToken(user._id);
      res.json({
        token,
        user: { _id: user._id, name: user.name, email: user.email, role: user.role }
      });
    } catch (err) {
      log.error('Auth', `verifyOtp: ${err.message}`);
      res.status(500).json({ error: 'Verification failed' });
    }
  },

  async registerRequest(req, res) {
    try {
      const { name, email, phone } = req.body;
      if (!name?.trim() || !email) {
        return res.status(400).json({ error: 'Name and email are required' });
      }

      const normalizedEmail = email.toLowerCase().trim();
      const existing = await User.findOne({ email: normalizedEmail });
      if (existing && existing.status !== 'inactive') {
        return res.status(400).json({ error: 'An account with this email already exists.' });
      }

      const code = generateOtp();
      pendingRegistrations.set(normalizedEmail, {
        name: name.trim(),
        email: normalizedEmail,
        phone: phone?.trim() || '',
        code,
        expires: Date.now() + REG_EXPIRY_MS
      });

      const branding = await emailService.getAppBranding();
      const htmlBody = emailService.buildNotificationEmail(
        'Confirm your registration',
        `Hi ${name.trim()},\n\nYour confirmation code is:\n\n${code}\n\nThis code expires in 15 minutes.\n\nIf you did not request this, please ignore this email.`,
        'task_assigned',
        branding
      );

      await emailService.send(normalizedEmail, 'Confirm your account', htmlBody);

      res.json({ message: 'Confirmation code sent to your email' });
    } catch (err) {
      log.error('Auth', `registerRequest: ${err.message}`);
      res.status(500).json({ error: 'Registration failed' });
    }
  },

  async registerConfirm(req, res) {
    try {
      const { email, code } = req.body;
      if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });

      const normalizedEmail = email.toLowerCase().trim();
      const pending = pendingRegistrations.get(normalizedEmail);
      if (!pending) return res.status(400).json({ error: 'No pending registration for this email. Please register again.' });
      if (Date.now() > pending.expires) {
        pendingRegistrations.delete(normalizedEmail);
        return res.status(400).json({ error: 'Confirmation code has expired. Please register again.' });
      }
      if (!safeEqual(pending.code, code.trim())) return res.status(400).json({ error: 'Invalid confirmation code' });

      const existing = await User.findOne({ email: pending.email });
      if (existing && existing.status !== 'inactive') {
        return res.status(400).json({ error: 'An account with this email already exists.' });
      }

      let org = await Organization.findOne().sort({ createdAt: 1 });

      if (!org) {
        org = await Organization.create({
          name: 'Default Organization',
          members: [],
          inviteCode: crypto.randomBytes(8).toString('hex')
        });
      }

      const tempPassword = generateTempPassword();

      let user;
      if (existing && existing.status === 'inactive') {
        user = existing;
        user.name = pending.name;
        if (pending.phone) user.phone = pending.phone;
        user.status = 'active';
        user.password = tempPassword;
        await user.save();
      } else {
        user = new User({
          name: pending.name,
          email: pending.email,
          password: tempPassword,
          phone: pending.phone || undefined,
          role: 'user',
          status: 'active'
        });
        await user.save();
      }

      await Organization.findByIdAndUpdate(org._id, {
        $pull: { members: { user: user._id } }
      });
      await Organization.findByIdAndUpdate(org._id, {
        $push: { members: { user: user._id, role: 'user' } }
      });

      pendingRegistrations.delete(normalizedEmail);

      const branding = await emailService.getAppBranding();
      const appName = branding.appTitle || 'TaskIT';
      const welcomeHtml = emailService.buildNotificationEmail(
        `Welcome to ${appName}!`,
        `Dear ${pending.name},\n\nThank you for joining ${appName}.\n\nPlease use the following details to login, and change your password after first login.\n\nEmail: ${pending.email}\nPassword: ${tempPassword}`,
        'task_assigned',
        branding
      );

      emailService.send(pending.email, `Welcome to ${appName}!`, welcomeHtml).catch(() => {});

      const allAdmins = await User.find({ role: 'admin', status: 'active' })
        .select('email name').lean();

      if (allAdmins.length) {
        const adminNotifyHtml = emailService.buildNotificationEmail(
          'New User Signed Up',
          `A new user has signed up on ${appName}.\n\nName: ${pending.name}\nEmail: ${pending.email}${pending.phone ? `\nPhone: ${pending.phone}` : ''}\nRegistered: ${new Date().toISOString()}`,
          'task_assigned',
          branding
        );
        for (const admin of allAdmins) {
          emailService.send(admin.email, `${appName} - New User Signed Up: ${pending.name}`, adminNotifyHtml).catch(() => {});
        }
      }

      res.status(201).json({
        message: 'Account created! Check your email for login credentials.'
      });
    } catch (err) {
      log.error('Auth', `registerConfirm: ${err.message}`);
      res.status(500).json({ error: 'Registration failed' });
    }
  },

  async login(req, res) {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

      const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
      if (!user) return res.status(401).json({ error: 'Invalid credentials' });

      const isMatch = await user.comparePassword(password);
      if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

      if (user.status === 'inactive') return res.status(401).json({ error: 'Account deactivated' });

      if (user.status === 'invited') {
        user.status = 'active';
        await user.save({ validateBeforeSave: false });
      }

      const token = generateToken(user._id);

      res.json({
        token,
        user: { _id: user._id, name: user.name, email: user.email, role: user.role }
      });
    } catch (err) {
      log.error('Auth', `login: ${err.message}`);
      res.status(500).json({ error: 'Login failed' });
    }
  },

  async invite(req, res) {
    try {
      const { email, name, role } = req.body;
      if (!email) return res.status(400).json({ error: 'Email is required' });

      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can invite users' });
      }

      const normalizedEmail = email.toLowerCase().trim();
      const validRole = ['admin', 'user'].includes(role) ? role : 'user';
      const tempPassword = generateTempPassword();

      const existing = await User.findOne({ email: normalizedEmail });
      let user;

      if (existing) {
        if (existing.status === 'active') {
          return res.status(400).json({ error: 'User already exists and is active' });
        }
        existing.name = name || existing.name;
        existing.role = validRole;
        existing.createdBy = req.user._id;
        existing.status = 'invited';
        existing.password = tempPassword;
        await existing.save({ validateModifiedOnly: true });
        user = existing;
      } else {
        user = await User.create({
          name: name || normalizedEmail.split('@')[0],
          email: normalizedEmail,
          password: tempPassword,
          role: validRole,
          createdBy: req.user._id,
          status: 'invited'
        });
      }

      const org = await Organization.findOne();
      if (org) {
        const alreadyMember = org.members.some(m => m.user.toString() === user._id.toString());
        if (!alreadyMember) {
          await Organization.findByIdAndUpdate(org._id, {
            $push: { members: { user: user._id, role: validRole } }
          });
        } else {
          await Organization.findOneAndUpdate(
            { _id: org._id, 'members.user': user._id },
            { $set: { 'members.$.role': validRole } }
          );
        }
      }

      const branding = await emailService.getAppBranding();
      const appName = branding.appTitle || 'TaskIT';
      const appUrl = process.env.APP_PUBLIC_URL || process.env.CLIENT_URL || 'http://localhost:5173';
      const html = emailService.buildNotificationEmail(
        `You've been invited to ${appName}`,
        `${req.user.name} invited you to join ${appName}.\n\nYour login credentials:\nEmail: ${normalizedEmail}\nPassword: ${tempPassword}\n\nYou can also use the Email Code (OTP) option to sign in without a password.\n\nWe recommend changing your password after your first login.`,
        'task_assigned',
        branding
      );
      emailService.send(normalizedEmail, `${appName} - You're invited!`, html).catch(err => {
        log.error('Auth', `invite email failed: ${err.message}`);
      });

      res.status(201).json({
        message: 'User invited',
        user: { _id: user._id, name: user.name, email: user.email, role: user.role },
        tempPassword
      });
    } catch (err) {
      log.error('Auth', `invite: ${err.message}`);
      res.status(500).json({ error: 'Invite failed' });
    }
  },

  async submitSupport(req, res) {
    try {
      const { email, subject, details } = req.body;
      if (!email) return res.status(400).json({ error: 'Email is required' });
      if (!subject?.trim() || !details?.trim()) return res.status(400).json({ error: 'Subject and details are required' });

      const normalizedEmail = email.toLowerCase().trim();
      const user = await User.findOne({ email: normalizedEmail });

      const admins = await User.find({
        role: 'admin',
        status: 'active'
      }).select('email name').lean();

      if (admins.length) {
        const branding = await emailService.getAppBranding();
        const appName = branding.appTitle || 'TaskIT';
        const timestamp = new Date().toISOString();

        const senderName = user ? user.name : normalizedEmail;
        const senderInfo = user ? `${user.name} (${user.email})` : `${normalizedEmail} (unregistered)`;

        const htmlBody = emailService.buildNotificationEmail(
          `Support Request: ${subject.trim().slice(0, 200)}`,
          `From: ${senderInfo}\nDate: ${timestamp}\n\nSubject: ${subject.trim().slice(0, 200)}\n\nDetails:\n${details.trim().slice(0, 5000)}`,
          'reminder',
          branding
        );

        const emailSubject = `${appName} - Support Request from ${senderName}`;
        for (const admin of admins) {
          emailService.send(admin.email, emailSubject, htmlBody).catch(() => {});
        }
      }

      res.json({ message: 'Support request sent to administrators' });
    } catch (err) {
      log.error('Auth', `submitSupport: ${err.message}`);
      res.status(500).json({ error: 'Failed to submit support request' });
    }
  },

  async getMe(req, res) {
    try {
      const user = await User.findById(req.user._id);
      res.json(user);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch profile' });
    }
  }
};

module.exports = authController;
