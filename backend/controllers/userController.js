const User = require('../models/User');
const Organization = require('../models/Organization');
const Board = require('../models/Board');
const Task = require('../models/Task');
const ActivityLog = require('../models/ActivityLog');
const activityService = require('../services/activityService');

const userController = {
  async getOrgMembers(req, res) {
    try {
      const users = await User.find({ status: { $ne: 'inactive' } })
        .select('name email role status avatar lastActive notificationPreferences')
        .sort({ name: 1 });
      res.json(users);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async getMembers(req, res) {
    try {
      const users = await User.find({
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

      if (req.params.id === req.user._id.toString()) {
        return res.status(400).json({ error: 'Cannot change your own role' });
      }

      const user = await User.findByIdAndUpdate(
        req.params.id,
        { role },
        { new: true }
      ).select('name email role');

      if (!user) return res.status(404).json({ error: 'User not found' });

      const org = await Organization.findOne();
      if (org) {
        await Organization.updateOne(
          { _id: org._id, 'members.user': req.params.id },
          { $set: { 'members.$.role': role } }
        );
      }

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

      if (req.params.id === req.user._id.toString()) {
        return res.status(400).json({ error: 'Cannot change your own status' });
      }

      const user = await User.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true }
      ).select('name email role status');

      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json(user);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async removeUser(req, res) {
    try {
      const userId = req.params.id;

      if (userId === req.user._id.toString()) {
        return res.status(400).json({ error: 'Cannot remove yourself' });
      }

      const user = await User.findById(userId).select('name email role status');
      if (!user) return res.status(404).json({ error: 'User not found' });

      const boardIds = await Board.find().distinct('_id');
      const affectedTasks = await Task.find({ board: { $in: boardIds }, assignedTo: userId })
        .select('_id title board')
        .lean();
      const affectedBoards = [...new Map(affectedTasks.map(task => [task.board.toString(), task.board])).values()];

      if (affectedTasks.length > 0) {
        await Task.updateMany(
          { _id: { $in: affectedTasks.map(task => task._id) } },
          { $pull: { assignedTo: userId } }
        );
      }

      const org = await Organization.findOne();
      if (org) {
        await Organization.findByIdAndUpdate(org._id, {
          $pull: { members: { user: userId } }
        });
      }

      await User.findByIdAndUpdate(userId, { status: 'inactive' });

      const taskIds = affectedTasks.map(task => task._id);
      const removalLogs = affectedBoards.length > 0 ? affectedBoards : [null];
      for (const boardId of removalLogs) {
        await activityService.log({
          board: boardId || undefined,
          user: req.user,
          action: 'user_removed',
          target: { type: 'user', id: user._id, name: user.name },
          changes: [
            { field: 'status', from: user.status, to: 'inactive' }
          ],
          metadata: {
            previousStatus: user.status,
            taskIds,
            boardId: boardId || null
          },
          req
        });
      }

      res.json({
        message: 'User removed from the organization',
        removedTasks: affectedTasks.length
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async restoreUser(req, res) {
    try {
      const userId = req.params.id;

      const user = await User.findById(userId).select('name email role status');
      if (!user) return res.status(404).json({ error: 'User not found' });

      const removalLog = await ActivityLog.findOne({
        action: 'user_removed',
        'target.id': userId
      }).sort({ createdAt: -1 });

      if (!removalLog) {
        return res.status(404).json({ error: 'No deletion log found for this user' });
      }

      const previousStatus = removalLog.metadata?.previousStatus || 'active';
      const taskIds = Array.isArray(removalLog.metadata?.taskIds) ? removalLog.metadata.taskIds : [];

      await User.findByIdAndUpdate(userId, { status: previousStatus });

      const org = await Organization.findOne();
      if (org) {
        await Organization.updateOne(
          { _id: org._id },
          { $pull: { members: { user: userId } } }
        );
        await Organization.updateOne(
          { _id: org._id },
          { $addToSet: { members: { user: userId, role: user.role } } }
        );
      }

      if (taskIds.length > 0) {
        await Task.updateMany(
          { _id: { $in: taskIds } },
          { $addToSet: { assignedTo: userId } }
        );
      }

      await activityService.log({
        user: req.user,
        action: 'user_restored',
        target: { type: 'user', id: user._id, name: user.name },
        changes: [
          { field: 'status', from: 'inactive', to: previousStatus }
        ],
        metadata: {
          restoredFromLogId: removalLog._id,
          taskIds
        },
        req
      });

      res.json({
        message: 'User restored',
        restoredTasks: taskIds.length
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async updateNotificationPreferences(req, res) {
    try {
      const ALLOWED = new Set([
        'inApp', 'email', 'taskAssigned', 'taskUpdated', 'statusChanged',
        'deadlineReminder', 'mentions', 'progressDigest', 'notifyOnStatuses',
        'deliveryMode', 'quietHoursEnabled', 'quietHoursStart', 'quietHoursEnd',
        'deadlineReminderHours', 'reminderIntervalHours'
      ]);

      const user = await User.findById(req.user._id);
      if (!user.notificationPreferences) user.notificationPreferences = {};

      for (const key of Object.keys(req.body)) {
        if (ALLOWED.has(key)) {
          user.notificationPreferences[key] = req.body[key];
        }
      }

      await user.save({ validateModifiedOnly: true });
      res.json(user.notificationPreferences);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async updateMemberNotificationPreferences(req, res) {
    const ALLOWED = new Set([
      'inApp', 'email', 'taskAssigned', 'taskUpdated', 'statusChanged',
      'deadlineReminder', 'mentions', 'progressDigest', 'notifyOnStatuses'
    ]);
    try {
      const target = await User.findById(req.params.id);
      if (!target) return res.status(404).json({ error: 'User not found' });

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
      if (name?.trim()) updates.name = name.trim().slice(0, 200);
      if (avatarUrl !== undefined) updates.avatar = avatarUrl;
      if (phone !== undefined) updates.phone = (phone || '').trim().slice(0, 30);
      if (email?.trim() && email.trim() !== req.user.email) {
        const normalizedEmail = email.trim().toLowerCase();
        const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: req.user._id } });
        if (existing) return res.status(400).json({ error: 'Email is already in use' });
        updates.email = normalizedEmail;
      }
      const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true })
        .select('name email role status avatar phone');
      res.json(user);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async updateMemberProfile(req, res) {
    try {
      const { name, email, phone, role } = req.body;
      const target = await User.findById(req.params.id);
      if (!target) return res.status(404).json({ error: 'User not found' });
      const updates = {};
      if (name?.trim()) updates.name = name.trim().slice(0, 200);
      if (phone !== undefined) updates.phone = (phone || '').trim().slice(0, 30);
      if (email?.trim()) {
        const lower = email.trim().toLowerCase();
        if (lower !== target.email) {
          const existing = await User.findOne({ email: lower, _id: { $ne: target._id } });
          if (existing) return res.status(400).json({ error: 'Email is already in use' });
        }
        updates.email = lower;
      }
      if (role && ['user', 'admin'].includes(role) && target._id.toString() !== req.user._id.toString()) {
        updates.role = role;
      }
      const updated = await User.findByIdAndUpdate(target._id, updates, { new: true })
        .select('name email role status avatar phone createdAt');
      res.json(updated);
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

      const existingUser = await User.findById(req.user._id).select('avatar');
      const oldAvatar = existingUser?.avatar;
      if (oldAvatar?.startsWith('/api/users/avatar/')) {
        const oldFile = path.join(AVATAR_DIR, path.basename(oldAvatar));
        if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
      }

      const avatarUrl = `/api/users/avatar/${req.file.filename}`;
      const user = await User.findByIdAndUpdate(req.user._id, { avatar: avatarUrl }, { new: true })
        .select('name email role status avatar');
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
      const filename = path.basename(req.params.filename);
      if (!/^[a-f0-9-]+\.\w+$/i.test(filename)) {
        return res.status(400).json({ error: 'Invalid filename' });
      }
      const filePath = path.join(AVATAR_DIR, filename);
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

      const admins = await User.find({
        role: 'admin',
        status: 'active'
      }).select('email name').lean();

      if (!admins.length) {
        return res.status(404).json({ error: 'No admin users found' });
      }

      const emailService = require('../services/emailService');
      const branding = await emailService.getAppBranding();
      const appName = branding.appTitle || 'Smythe';
      const timestamp = new Date().toISOString();

      const htmlBody = emailService.buildNotificationEmail(
        `Password Support Request: ${subject.trim().slice(0, 200)}`,
        `From: ${req.user.name} (${req.user.email})\nDate: ${timestamp}\n\nSubject: ${subject.trim().slice(0, 200)}\n\nDetails:\n${details.trim().slice(0, 5000)}`,
        'reminder',
        branding
      );

      const emailSubject = `${appName} - Password Support Request from ${req.user.name}`;
      for (const admin of admins) {
        emailService.send(admin.email, emailSubject, htmlBody).catch(() => {});
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
      if (newPassword.length > 128) {
        return res.status(400).json({ error: 'Password too long' });
      }
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required' });
      }

      const user = await User.findById(req.user._id).select('+password');
      if (!user) return res.status(404).json({ error: 'User not found' });

      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) return res.status(401).json({ error: 'Current password is incorrect' });

      user.password = newPassword;
      await user.save({ validateModifiedOnly: true });

      res.json({ message: 'Password updated successfully' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
};

module.exports = userController;
