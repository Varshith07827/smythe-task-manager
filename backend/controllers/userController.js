const User = require('../models/User');
const Organization = require('../models/Organization');

const userController = {
  async getOrgMembers(req, res) {
    try {
      const users = await User.find({ organization: req.user.organization })
        .select('name email role status avatar lastActive notificationPreferences')
        .sort({ name: 1 });
      res.json(users);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // Lightweight member list — accessible by all authenticated users (for task assignment)
  async getMembers(req, res) {
    try {
      const users = await User.find({
        organization: req.user.organization,
        status: { $ne: 'inactive' }
      })
        .select('name email avatar status role')
        .sort({ name: 1 });
      res.json(users);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async changeRole(req, res) {
    try {
      const { role } = req.body;
      if (!['admin', 'user'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      const user = await User.findByIdAndUpdate(
        req.params.id,
        { role },
        { new: true }
      ).select('name email role');

      // Update role in org members too
      await Organization.updateOne(
        { _id: req.user.organization, 'members.user': req.params.id },
        { $set: { 'members.$.role': role } }
      );

      res.json(user);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async changeStatus(req, res) {
    try {
      const { status } = req.body;
      if (!['active', 'inactive'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const user = await User.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true }
      ).select('name email role status');

      res.json(user);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async removeUser(req, res) {
    try {
      const userId = req.params.id;

      await Organization.findByIdAndUpdate(req.user.organization, {
        $pull: { members: { user: userId } }
      });

      await User.findByIdAndUpdate(userId, {
        status: 'inactive',
        organization: null
      });

      res.json({ message: 'User removed from the organization' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async updateNotificationPreferences(req, res) {
    try {
      const user = await User.findById(req.user._id);
      if (!user.notificationPreferences) user.notificationPreferences = {};
      Object.assign(user.notificationPreferences, req.body);
      await user.save({ validateModifiedOnly: true });
      res.json(user.notificationPreferences);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  /** Admin: merge notification preferences for another org member. */
  async updateMemberNotificationPreferences(req, res) {
    const ALLOWED = new Set([
      'inApp', 'email', 'taskAssigned', 'taskUpdated', 'statusChanged',
      'deadlineReminder', 'mentions', 'progressDigest', 'notifyOnStatuses'
    ]);
    try {
      const target = await User.findById(req.params.id);
      if (!target || target.organization?.toString() !== req.user.organization?.toString()) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (!target.notificationPreferences) target.notificationPreferences = {};
      const body = req.body || {};
      for (const key of Object.keys(body)) {
        if (!ALLOWED.has(key)) continue;
        if (key === 'notifyOnStatuses') {
          if (Array.isArray(body.notifyOnStatuses)) {
            target.notificationPreferences.notifyOnStatuses = body.notifyOnStatuses;
          }
          continue;
        }
        target.notificationPreferences[key] = body[key];
      }
      await target.save({ validateModifiedOnly: true });
      res.json(target.notificationPreferences);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async updateProfile(req, res) {
    try {
      const { name, avatarUrl, email, phone } = req.body;
      const updates = {};
      if (name?.trim()) updates.name = name.trim();
      if (avatarUrl !== undefined) updates.avatar = avatarUrl;
      if (phone !== undefined) updates.phone = phone.trim();
      if (email?.trim() && email.trim() !== req.user.email) {
        const existing = await User.findOne({ email: email.trim().toLowerCase(), _id: { $ne: req.user._id } });
        if (existing) return res.status(400).json({ error: 'Email is already in use' });
        updates.email = email.trim().toLowerCase();
      }
      const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true })
        .select('name email role status avatar organization phone');
      res.json(user);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async uploadAvatar(req, res) {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const path = require('path');
      const fs = require('fs');
      const AVATAR_DIR = path.join(__dirname, '..', 'uploads', 'avatars');
      if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });

      // Delete old avatar if it was a local upload
      const existingUser = await User.findById(req.user._id).select('avatar');
      const oldAvatar = existingUser?.avatar;
      if (oldAvatar?.startsWith('/api/users/avatar/')) {
        const oldFile = path.join(AVATAR_DIR, path.basename(oldAvatar));
        if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
      }

      const avatarUrl = `/api/users/avatar/${req.file.filename}`;
      const user = await User.findByIdAndUpdate(req.user._id, { avatar: avatarUrl }, { new: true })
        .select('name email role status avatar organization');
      res.json({ url: avatarUrl, user });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async serveAvatar(req, res) {
    try {
      const path = require('path');
      const fs = require('fs');
      const AVATAR_DIR = path.join(__dirname, '..', 'uploads', 'avatars');
      const filePath = path.join(AVATAR_DIR, path.basename(req.params.filename));
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
      res.sendFile(filePath);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async requestPasswordSupport(req, res) {
    try {
      const { subject, details } = req.body;
      if (!subject?.trim() || !details?.trim()) {
        return res.status(400).json({ error: 'Subject and details are required' });
      }

      // Find all admin users in the organization
      const admins = await User.find({
        organization: req.user.organization,
        role: 'admin',
        status: 'active'
      }).select('email name').lean();

      if (!admins.length) {
        return res.status(404).json({ error: 'No admin users found' });
      }

      const emailService = require('../services/emailService');
      const branding = await emailService.getAppBranding(req.user.organization);
      const appName = branding.appTitle || 'Smythe';
      const timestamp = new Date().toLocaleString();

      const htmlBody = emailService.buildNotificationEmail(
        `Password Support Request: ${subject}`,
        `From: ${req.user.name} (${req.user.email})\nDate: ${timestamp}\n\nSubject: ${subject}\n\nDetails:\n${details}`,
        'reminder',
        branding
      );

      // Send email to all admins
      const emailSubject = `${appName} - Password Support Request from ${req.user.name}`;
      for (const admin of admins) {
        emailService.send(admin.email, emailSubject, htmlBody).catch(err => {
          console.error(`[PasswordSupport] Failed to email ${admin.email}:`, err.message);
        });
      }

      res.json({ message: 'Password support request sent to administrators' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async verifyPassword(req, res) {
    try {
      const { password } = req.body;
      if (!password) return res.status(400).json({ error: 'Password is required' });

      const user = await User.findById(req.user._id).select('+password');
      if (!user || !user.password) return res.status(400).json({ error: 'No password set for this account' });

      const isMatch = await user.comparePassword(password);
      if (!isMatch) return res.status(401).json({ error: 'Incorrect password' });

      res.json({ verified: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters' });
      }

      const user = await User.findById(req.user._id).select('+password');
      if (!user) return res.status(404).json({ error: 'User not found' });

      // If user has a password set, verify current password
      if (currentPassword) {
        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) return res.status(401).json({ error: 'Current password is incorrect' });
      }

      user.password = newPassword;
      await user.save({ validateModifiedOnly: true });

      res.json({ message: 'Password updated successfully' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
};

module.exports = userController;
