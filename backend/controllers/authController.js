const User = require('../models/User');
const Organization = require('../models/Organization');
const { generateToken } = require('../middleware/auth');
const crypto = require('crypto');
const emailService = require('../services/emailService');

// In-memory OTP store (production should use Redis)
const otpStore = new Map();

// In-memory pending registrations (production should use Redis or DB)
const pendingRegistrations = new Map();

/** Constant-time string comparison to prevent timing attacks */
function safeEqual(a, b) {
  try {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch { return false; }
}

const authController = {
  async requestOtp(req, res) {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: 'Email is required' });

      const user = await User.findOne({ email });
      if (!user) return res.status(404).json({ error: 'No account found with this email' });
      if (user.status === 'inactive') return res.status(401).json({ error: 'Account deactivated' });

      const code = String(Math.floor(100000 + Math.random() * 900000));
      otpStore.set(email.toLowerCase(), { code, expires: Date.now() + 10 * 60 * 1000 });

      const branding = await emailService.getAppBranding(user.organization);
      const appName = branding.appTitle || 'Smythe';
      const html = emailService.buildNotificationEmail(
        'Your login code',
        `Your one-time login code is:\n\n${code}\n\nThis code expires in 10 minutes.`,
        'task_assigned',
        branding
      );
      await emailService.send(email, `${appName} - Login Code`, html);

      res.json({ message: 'OTP sent to your email' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async verifyOtp(req, res) {
    try {
      const { email, code } = req.body;
      if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });

      const entry = otpStore.get(email.toLowerCase());
      if (!entry) return res.status(401).json({ error: 'Invalid code' });

      // Increment attempt counter to prevent brute-force
      entry.attempts = (entry.attempts || 0) + 1;
      if (entry.attempts > 5) {
        otpStore.delete(email.toLowerCase());
        return res.status(429).json({ error: 'Too many attempts. Please request a new code.' });
      }

      if (!safeEqual(entry.code, code)) return res.status(401).json({ error: 'Invalid code' });
      if (Date.now() > entry.expires) {
        otpStore.delete(email.toLowerCase());
        return res.status(401).json({ error: 'Code expired' });
      }

      otpStore.delete(email.toLowerCase());

      const user = await User.findOne({ email });
      if (!user) return res.status(404).json({ error: 'User not found' });

      // Auto-fix legacy roles
      if (user.role === 'creator' || user.role === 'manager') {
        user.role = 'admin';
      }
      if (user.status === 'invited') {
        user.status = 'active';
      }
      await user.save({ validateBeforeSave: false });

      const token = generateToken(user._id);
      res.json({
        token,
        user: { _id: user._id, name: user.name, email: user.email, role: user.role, organization: user.organization }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async registerRequest(req, res) {
    try {
      const { name, email, phone } = req.body;
      if (!name?.trim() || !email) {
        return res.status(400).json({ error: 'Name and email are required' });
      }

      const existing = await User.findOne({ email });
      if (existing && existing.status !== 'inactive') return res.status(400).json({ error: 'An account with this email already exists.' });

      const code = String(Math.floor(100000 + Math.random() * 900000));
      pendingRegistrations.set(email.toLowerCase(), {
        name: name.trim(),
        email: email.toLowerCase(),
        phone: phone?.trim() || '',
        code,
        expires: Date.now() + 15 * 60 * 1000
      });

      const branding = await emailService.getAppBranding();
      const htmlBody = emailService.buildNotificationEmail(
        'Confirm your registration',
        `Hi ${name.trim()},\n\nYour confirmation code is:\n\n${code}\n\nThis code expires in 15 minutes.\n\nIf you did not request this, please ignore this email.`,
        'task_assigned',
        branding
      );

      await emailService.send(email, 'Confirm your account', htmlBody);

      res.json({ message: 'Confirmation code sent to your email' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async registerConfirm(req, res) {
    try {
      const { email, code } = req.body;
      if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });

      const pending = pendingRegistrations.get(email.toLowerCase());
      if (!pending) return res.status(400).json({ error: 'No pending registration for this email. Please register again.' });
      if (Date.now() > pending.expires) {
        pendingRegistrations.delete(email.toLowerCase());
        return res.status(400).json({ error: 'Confirmation code has expired. Please register again.' });
      }
      if (!safeEqual(pending.code, code.trim())) return res.status(400).json({ error: 'Invalid confirmation code' });

      // Check again in case someone else registered with same email during confirmation
      const existing = await User.findOne({ email: pending.email });
      if (existing && existing.status !== 'inactive') return res.status(400).json({ error: 'An account with this email already exists.' });

      // Find the default organization (first org in DB, or the one admins belong to)
      let org = await Organization.findOne().sort({ createdAt: 1 });

      if (!org) {
        // Need a creator — use any active admin, or a system placeholder
        const anyAdmin = await User.findOne({ role: 'admin', status: 'active' }).select('_id').lean();
        const creatorId = anyAdmin?._id || new (require('mongoose').Types.ObjectId)();
        org = await Organization.create({
          name: 'Default Organization',
          creator: creatorId,
          members: [],
          inviteCode: crypto.randomBytes(8).toString('hex')
        });
      }

      // Generate a readable temp password (same as invite flow)
      const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
      let tempPassword = '';
      for (let i = 0; i < 12; i++) tempPassword += chars[Math.floor(Math.random() * chars.length)];

      let user;
      if (existing && existing.status === 'inactive') {
        user = existing;
        user.name = pending.name;
        if (pending.phone) user.phone = pending.phone;
        user.status = 'active';
        user.password = tempPassword;
        user.organization = org._id;
        await user.save();
      } else {
        // Create user as a regular 'user' role with temp password
        user = new User({
          name: pending.name,
          email: pending.email,
          password: tempPassword,
          phone: pending.phone || undefined,
          role: 'user',
          status: 'active',
          organization: org._id
        });
        await user.save();
      }

      // Ensure no duplicates then Add user to org members
      await Organization.findByIdAndUpdate(org._id, {
        $pull: { members: { user: user._id } }
      });
      await Organization.findByIdAndUpdate(org._id, {
        $push: { members: { user: user._id, role: 'user' } }
      });

      pendingRegistrations.delete(email.toLowerCase());

      // Send welcome email with credentials (like invite flow)
      const branding = await emailService.getAppBranding(org._id);
      const appName = branding.appTitle || 'Smythe';
      const welcomeHtml = emailService.buildNotificationEmail(
        `Welcome to ${appName}!`,
        `Dear ${pending.name},\n\nThank you for joining ${appName}, we appreciate your interest to be part of our community.\n\nPlease use the following details to login, please change your password.\n\nEmail: ${pending.email}\nPassword: ${tempPassword}\n\nThank you`,
        'task_assigned',
        branding
      );

      emailService.send(pending.email, `Welcome to ${appName}!`, welcomeHtml).catch(() => {});

      // Notify all admin(s) in the DB about the new signup
      const allAdmins = await User.find({ role: 'admin', status: 'active' })
        .select('email name').lean();

      if (allAdmins.length) {
        const adminNotifyHtml = emailService.buildNotificationEmail(
          'New User Signed Up',
          `A new user has signed up on ${appName}.\n\nName: ${pending.name}\nEmail: ${pending.email}${pending.phone ? `\nPhone: ${pending.phone}` : ''}\nRegistered: ${new Date().toLocaleString()}`,
          'task_assigned',
          branding
        );
        for (const admin of allAdmins) {
          emailService.send(admin.email, `${appName} - New User Signed Up: ${pending.name}`, adminNotifyHtml).catch(() => {});
        }
      }

      // Don't auto-login — user will login with emailed credentials
      res.status(201).json({
        message: 'Account created! Check your email for login credentials.'
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // Legacy register (kept for backward compat but not exposed via routes)
  async register(req, res) {
    try {
      const { name, email, password, organizationName } = req.body;

      const existing = await User.findOne({ email });
      if (existing) return res.status(400).json({ error: 'Email already registered' });

      const user = new User({ name, email, password, role: 'admin', status: 'active' });
      await user.save();

      const org = await Organization.create({
        name: organizationName || `${name}'s Organization`,
        creator: user._id,
        members: [{ user: user._id, role: 'admin' }],
        inviteCode: crypto.randomBytes(8).toString('hex')
      });

      user.organization = org._id;
      await user.save({ validateBeforeSave: false });

      const token = generateToken(user._id);

      res.status(201).json({
        token,
        user: { _id: user._id, name: user.name, email: user.email, role: user.role, organization: org._id }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async login(req, res) {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

      const user = await User.findOne({ email }).select('+password');
      if (!user) return res.status(401).json({ error: 'Invalid credentials' });

      const isMatch = await user.comparePassword(password);
      if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

      if (user.status === 'inactive') return res.status(401).json({ error: 'Account deactivated' });

      // Auto-fix legacy roles
      if (user.role === 'creator' || user.role === 'manager') {
        user.role = 'admin';
      }

      if (user.status === 'invited') {
        user.status = 'active';
      }

      await user.save({ validateBeforeSave: false });

      const token = generateToken(user._id);

      res.json({
        token,
        user: { _id: user._id, name: user.name, email: user.email, role: user.role, organization: user.organization }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async invite(req, res) {
    try {
      const { email, name, role } = req.body;

      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can invite users' });
      }

      // Generate a readable temporary password
      const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
      let tempPassword = '';
      for (let i = 0; i < 12; i++) tempPassword += chars[Math.floor(Math.random() * chars.length)];

      const existing = await User.findOne({ email });
      let user;

      if (existing) {
        // If user is active in the same org, block
        if (existing.status === 'active' && existing.organization?.toString() === req.user.organization.toString()) {
          return res.status(400).json({ error: 'User already exists' });
        }
        // Re-invite: reactivate removed/inactive user
        existing.name = name || existing.name;
        existing.role = role || 'user';
        existing.organization = req.user.organization;
        existing.createdBy = req.user._id;
        existing.status = 'invited';
        existing.password = tempPassword;
        await existing.save({ validateModifiedOnly: true });
        user = existing;
      } else {
        user = await User.create({
          name: name || email.split('@')[0],
          email,
          password: tempPassword,
          role: role || 'user',
          organization: req.user.organization,
          createdBy: req.user._id,
          status: 'invited'
        });
      }

      // Ensure user is in org members (upsert)
      const org = await Organization.findById(req.user.organization);
      const alreadyMember = org.members.some(m => m.user.toString() === user._id.toString());
      if (!alreadyMember) {
        await Organization.findByIdAndUpdate(req.user.organization, {
          $push: { members: { user: user._id, role: role || 'user' } }
        });
      } else {
        await Organization.findOneAndUpdate(
          { _id: req.user.organization, 'members.user': user._id },
          { $set: { 'members.$.role': role || 'user' } }
        );
      }

      // Email the invited user their credentials
      const emailService = require('../services/emailService');
      const branding = await emailService.getAppBranding(req.user.organization);
      const appName = branding.appTitle || 'Smythe';
      const appUrl = process.env.APP_PUBLIC_URL || process.env.CLIENT_URL || 'http://localhost:5173';
      const html = emailService.buildNotificationEmail(
        `You've been invited to ${appName}`,
        `${req.user.name} invited you to join ${appName}.\n\nYour login credentials:\nEmail: ${email}\nPassword: ${tempPassword}\n\nYou can also use the Email Code (OTP) option to sign in without a password.\n\nWe recommend changing your password after your first login.`,
        'task_assigned',
        branding
      );
      emailService.send(email, `${appName} - You're invited!`, html).catch(err => {
        console.error('[Invite] Failed to send invite email:', err.message);
      });

      res.status(201).json({
        message: 'User invited',
        user: { _id: user._id, name: user.name, email: user.email, role: user.role },
        tempPassword
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async submitSupport(req, res) {
    try {
      const { email, subject, details } = req.body;
      if (!email) return res.status(400).json({ error: 'Email is required' });
      if (!subject?.trim() || !details?.trim()) return res.status(400).json({ error: 'Subject and details are required' });

      const user = await User.findOne({ email });

      // Only send if the email exists in the DB; always return success to avoid enumeration
      if (user) {
        const admins = await User.find({
          organization: user.organization,
          role: 'admin',
          status: 'active'
        }).select('email name').lean();

        if (admins.length) {
          const branding = await emailService.getAppBranding(user.organization);
          const appName = branding.appTitle || 'Smythe';
          const timestamp = new Date().toLocaleString();

          const htmlBody = emailService.buildNotificationEmail(
            `Support Request: ${subject}`,
            `From: ${user.name} (${user.email})\nDate: ${timestamp}\n\nSubject: ${subject}\n\nDetails:\n${details}`,
            'reminder',
            branding
          );

          const emailSubject = `${appName} - Support Request from ${user.name}`;
          for (const admin of admins) {
            emailService.send(admin.email, emailSubject, htmlBody).catch(err => {
              console.error(`[Support] Failed to email ${admin.email}:`, err.message);
            });
          }
        }
      }

      res.json({ message: 'Support request sent to administrators' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async getMe(req, res) {
    try {
      const user = await User.findById(req.user._id).populate('organization', 'name');
      res.json(user);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
};

module.exports = authController;
