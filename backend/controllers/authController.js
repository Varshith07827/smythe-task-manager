const User = require('../models/User');
const Organization = require('../models/Organization');
const { generateToken } = require('../middleware/auth');
const crypto = require('crypto');
const emailService = require('../services/emailService');

// In-memory OTP store (production should use Redis)
const otpStore = new Map();

// In-memory pending registrations (production should use Redis or DB)
const pendingRegistrations = new Map();

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
      if (!entry || entry.code !== code) return res.status(401).json({ error: 'Invalid code' });
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
      const { name, email, password, phone, organizationName } = req.body;
      if (!name?.trim() || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required' });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }

      const existing = await User.findOne({ email });
      if (existing) return res.status(400).json({ error: 'Email already registered' });

      const code = String(Math.floor(100000 + Math.random() * 900000));
      pendingRegistrations.set(email.toLowerCase(), {
        name: name.trim(),
        email: email.toLowerCase(),
        password,
        phone: phone?.trim() || '',
        organizationName: organizationName?.trim() || '',
        code,
        expires: Date.now() + 15 * 60 * 1000
      });

      const htmlBody = emailService.buildNotificationEmail(
        'Confirm your registration',
        `Hi ${name.trim()},\n\nYour confirmation code is:\n\n${code}\n\nThis code expires in 15 minutes.\n\nIf you did not request this, please ignore this email.`,
        'task_assigned'
<<<<<<< HEAD
        ,
        await emailService.getAppBranding()
=======
>>>>>>> 4a2c44b9f852ac127d3b4c323269b1fa2d355676
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
      if (pending.code !== code.trim()) return res.status(400).json({ error: 'Invalid confirmation code' });

      // Check again in case someone else registered with same email during confirmation
      const existing = await User.findOne({ email: pending.email });
      if (existing) return res.status(400).json({ error: 'Email already registered' });

<<<<<<< HEAD
      // Find the default organization (first org in DB, or the one admins belong to)
      let org = await Organization.findOne().sort({ createdAt: 1 });

      if (!org) {
        // No org exists yet — create a default one
        org = await Organization.create({
          name: 'Default Organization',
          members: [],
          inviteCode: crypto.randomBytes(8).toString('hex')
        });
      }

      // Create user as a regular 'user' role and add to existing org
=======
      // Create user and organization
>>>>>>> 4a2c44b9f852ac127d3b4c323269b1fa2d355676
      const user = new User({
        name: pending.name,
        email: pending.email,
        password: pending.password,
        phone: pending.phone || undefined,
<<<<<<< HEAD
        role: 'user',
        status: 'active',
        organization: org._id
      });
      await user.save();

      // Add user to org members
      await Organization.findByIdAndUpdate(org._id, {
        $push: { members: { user: user._id, role: 'user' } }
      });

=======
        role: 'admin',
        status: 'active'
      });
      await user.save();

      const org = await Organization.create({
        name: pending.organizationName || `${pending.name}'s Organization`,
        creator: user._id,
        members: [{ user: user._id, role: 'admin' }],
        inviteCode: crypto.randomBytes(8).toString('hex')
      });

      user.organization = org._id;
      await user.save({ validateBeforeSave: false });

>>>>>>> 4a2c44b9f852ac127d3b4c323269b1fa2d355676
      pendingRegistrations.delete(email.toLowerCase());

      const token = generateToken(user._id);

      // Send welcome email to new user
<<<<<<< HEAD
      const branding = await emailService.getAppBranding(org._id);
      const appName = branding.siteTitle || branding.appTitle || 'Smythe';
      const logoMarkup = branding.logoUrl
        ? `<img src="${branding.logoUrl}" alt="${appName}" style="width:${Math.max(24, Math.min(branding.logoSize || 48, 120))}px;height:${Math.max(24, Math.min(branding.logoSize || 48, 120))}px;object-fit:contain;border-radius:${branding.logoShape === 'circle' ? '999px' : branding.logoShape === 'square' ? '6px' : '14px'};display:block;margin:0 auto 16px;" />`
        : `<div style="width:${Math.max(40, Math.min(branding.logoSize || 48, 120))}px;height:${Math.max(40, Math.min(branding.logoSize || 48, 120))}px;background:${branding.accentColor || '#0a84ff'};border-radius:${branding.logoShape === 'circle' ? '999px' : branding.logoShape === 'square' ? '6px' : '14px'};display:inline-flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:#fff;margin:0 auto 16px;">${appName[0] || 'S'}</div>`;
=======
      const appName = 'Smythe';
>>>>>>> 4a2c44b9f852ac127d3b4c323269b1fa2d355676
      const welcomeHtml = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:40px 20px">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
<<<<<<< HEAD
        <tr><td style="background:linear-gradient(135deg,${branding.sidebarColor || '#1a1a2e'} 0%,${branding.accentColor || '#0a84ff'} 100%);padding:40px;text-align:center">
          ${logoMarkup}
          <h1 style="color:#ffffff;font-size:26px;font-weight:700;margin:0;letter-spacing:-0.5px">Welcome to ${appName}!</h1>
          <p style="color:rgba(255,255,255,0.75);margin:8px 0 0;font-size:15px">${branding.tagline || 'Your account is ready'}</p>
        </td></tr>
        <tr><td style="padding:36px 40px">
          <p style="color:#1d1d1f;font-size:16px;margin:0 0 20px">Dear <strong>${pending.name}</strong>,</p>
          <p style="color:#6e6e73;font-size:15px;line-height:1.6;margin:0 0 24px">
            Thank you for joining <strong style="color:#1d1d1f">${appName}</strong>, we appreciate your interest to be part of our community.
          </p>
          <p style="color:#6e6e73;font-size:15px;line-height:1.6;margin:0 0 24px">
            Please use the following details to login. We recommend you change your password after first login.
          </p>
          <div style="background:#f5f5f7;border-radius:12px;padding:20px;margin-bottom:24px">
            <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#6e6e73;text-transform:uppercase;letter-spacing:0.5px">Your account</p>
            <p style="margin:0 0 6px;font-size:14px;color:#1d1d1f"><strong>Name:</strong> ${pending.name}</p>
            <p style="margin:0 0 6px;font-size:14px;color:#1d1d1f"><strong>Email:</strong> ${pending.email}</p>
            ${pending.phone ? `<p style="margin:0;font-size:14px;color:#1d1d1f"><strong>Phone:</strong> ${pending.phone}</p>` : ''}
          </div>
          <p style="color:#6e6e73;font-size:13px;margin:24px 0 0;padding-top:20px;border-top:1px solid #e5e5ea">
            Thank you
=======
        <tr><td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:40px;text-align:center">
          <div style="width:52px;height:52px;background:#0a84ff;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:#fff;margin-bottom:16px">${appName[0]}</div>
          <h1 style="color:#ffffff;font-size:26px;font-weight:700;margin:0;letter-spacing:-0.5px">Welcome to ${appName}!</h1>
          <p style="color:rgba(255,255,255,0.6);margin:8px 0 0;font-size:15px">Your account is ready</p>
        </td></tr>
        <tr><td style="padding:36px 40px">
          <p style="color:#1d1d1f;font-size:16px;margin:0 0 12px">Hi <strong>${pending.name}</strong>,</p>
          <p style="color:#6e6e73;font-size:15px;line-height:1.6;margin:0 0 24px">
            Your account has been created successfully. You are the admin of your new organization
            <strong style="color:#1d1d1f">${org.name}</strong>.
          </p>
          <div style="background:#f5f5f7;border-radius:12px;padding:20px;margin-bottom:24px">
            <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#6e6e73;text-transform:uppercase;letter-spacing:0.5px">Your account</p>
            <p style="margin:0 0 4px;font-size:14px;color:#1d1d1f"><strong>Name:</strong> ${pending.name}</p>
            <p style="margin:0 0 4px;font-size:14px;color:#1d1d1f"><strong>Email:</strong> ${pending.email}</p>
            ${pending.phone ? `<p style="margin:0;font-size:14px;color:#1d1d1f"><strong>Phone:</strong> ${pending.phone}</p>` : ''}
          </div>
          <p style="color:#6e6e73;font-size:14px;line-height:1.6;margin:0 0 24px">
            Get started by creating your first project board and inviting your team members.
          </p>
          <p style="color:#6e6e73;font-size:13px;margin:24px 0 0;padding-top:20px;border-top:1px solid #e5e5ea">
            If you didn't create this account, please contact support immediately.
>>>>>>> 4a2c44b9f852ac127d3b4c323269b1fa2d355676
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

      emailService.send(pending.email, `Welcome to ${appName}!`, welcomeHtml).catch(() => {});

<<<<<<< HEAD
      // Notify all admin(s) in the DB about the new signup
      const allAdmins = await User.find({ role: 'admin', status: 'active' })
=======
      // Notify all existing admins across the platform about the new signup
      const allAdmins = await User.find({ role: 'admin', status: 'active', _id: { $ne: user._id } })
>>>>>>> 4a2c44b9f852ac127d3b4c323269b1fa2d355676
        .select('email name').lean();

      if (allAdmins.length) {
        const adminNotifyHtml = emailService.buildNotificationEmail(
<<<<<<< HEAD
          'New User Signed Up',
          `A new user has signed up on ${appName}.\n\nName: ${pending.name}\nEmail: ${pending.email}${pending.phone ? `\nPhone: ${pending.phone}` : ''}\nRegistered: ${new Date().toLocaleString()}`,
          'task_assigned',
          branding
        );
        for (const admin of allAdmins) {
          emailService.send(admin.email, `${appName} - New User Signed Up: ${pending.name}`, adminNotifyHtml).catch(() => {});
=======
          'New User Registered',
          `A new account has been created on ${appName}.\n\nName: ${pending.name}\nEmail: ${pending.email}${pending.phone ? `\nPhone: ${pending.phone}` : ''}\nOrganization: ${org.name}\nRegistered: ${new Date().toLocaleString()}`,
          'task_assigned'
        );
        for (const admin of allAdmins) {
          emailService.send(admin.email, `${appName} - New User Registered: ${pending.name}`, adminNotifyHtml).catch(() => {});
>>>>>>> 4a2c44b9f852ac127d3b4c323269b1fa2d355676
        }
      }

      res.status(201).json({
        token,
        user: { _id: user._id, name: user.name, email: user.email, role: user.role, organization: org._id }
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
