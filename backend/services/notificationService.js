const Notification = require('../models/Notification');
const socketService = require('./socketService');
const emailService = require('./emailService');

const notificationService = {
  async create({ recipient, sender, type, title, message, board, task, groupKey, newStatus, emailHtml, taskTitle }) {
    const User = require('../models/User');

    // Skip all notifications for archived projects
    if (board) {
      const Board = require('../models/Board');
      const boardDoc = await Board.findById(board).select('archived').lean();
      if (boardDoc?.archived) return null;
    }

    const user = await User.findById(recipient);

    const prefMap = {
      task_assigned: 'taskAssigned',
      task_updated: 'taskUpdated',
      deadline_approaching: 'deadlineReminder',
      deadline_overdue: 'deadlineReminder',
      mentioned: 'mentions',
      status_changed: 'statusChanged',
      progress_digest: 'progressDigest',
      reminder: 'taskUpdated'
    };
    const prefKey = prefMap[type];
    if (prefKey && user?.notificationPreferences?.[prefKey] === false) {
      return null;
    }

    if (type === 'status_changed' && newStatus) {
      const chosen = user?.notificationPreferences?.notifyOnStatuses;
      if (Array.isArray(chosen)) {
        if (chosen.length === 0) return null;
        if (!chosen.includes(newStatus)) return null;
      }
    } else if (type === 'status_changed' && !newStatus) {
      return null;
    }

    const notification = await Notification.create({
      recipient,
      sender,
      type,
      title,
      message,
      board,
      task,
      groupKey,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });

    if (user?.notificationPreferences?.inApp !== false) {
      socketService.notifyUser(recipient.toString(), {
        _id: notification._id,
        type,
        title,
        message,
        board,
        task,
        sender,
        organization: user.organization,
        createdAt: notification.createdAt
      });
    }

    // Send email notification (fire-and-forget)
    if (user?.email && user?.notificationPreferences?.email !== false) {
      (async () => {
        try {
          const branding = await emailService.getAppBranding(user.organization);
          const appName = branding.appTitle || 'Smythe';
          const htmlBody = emailHtml || emailService.buildNotificationEmail(title, message, type, branding);
          const emailSubject = taskTitle ? `${appName} - ${taskTitle}: ${title}` : `${appName} - ${title}`;
          console.log(`[NotificationService] Sending email to ${user.email} — type: ${type}, subject: ${emailSubject}`);
          const result = await emailService.send(user.email, emailSubject, htmlBody);
          if (!result) {
            console.warn(`[NotificationService] Email send returned null for ${user.email}`);
          }
        } catch (emailErr) {
          console.error(`[NotificationService] Email send failed for ${user.email}:`, emailErr.message);
        }
      })();
    } else {
      console.log(`[NotificationService] Skipping email — user: ${user?.email || 'no email'}, emailPref: ${user?.notificationPreferences?.email}`);
    }

    return notification;
  },

  /**
   * Scheduled digest: assigned tasks on a board for one user (in-app + email).
   */
  async sendProgressDigest({ recipientId, boardId, boardTitle, boardOrganizationId, tasks }) {
    const User = require('../models/User');
    const user = await User.findById(recipientId);
    if (!user) return null;
    if (boardOrganizationId && user.organization?.toString() !== boardOrganizationId.toString()) {
      return null;
    }
    if (!tasks?.length) return null;

    const lines = tasks.map((t) => {
      const due = t.dueDate
        ? new Date(t.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        : null;
      const st = String(t.status || '').replace(/_/g, ' ');
      return `• ${t.title} — ${st}${due ? ` — due ${due}` : ''}`;
    });
    const message = [`Board: ${boardTitle}`, '', ...lines].join('\n');
    const branding = await emailService.getAppBranding(user.organization);
    const emailHtml = emailService.buildProgressDigestEmail(boardTitle, tasks, branding);

    return this.create({
      recipient: recipientId,
      sender: undefined,
      type: 'progress_digest',
      title: 'Your task progress summary',
      message,
      board: boardId,
      task: undefined,
      groupKey: `progress-digest:${boardId}:${recipientId}`,
      emailHtml
    });
  },

  async notifyMany(recipientIds, notificationData) {
    const notifications = await Promise.all(
      recipientIds.map(recipientId =>
        this.create({ ...notificationData, recipient: recipientId })
      )
    );
    return notifications.filter(Boolean);
  },

  /**
   * Clear unread deadline reminders for a task (when it's completed/cancelled).
   */
  async clearDeadlineReminders(taskId) {
    return Notification.deleteMany({
      task: taskId,
      type: { $in: ['deadline_approaching', 'deadline_overdue', 'reminder'] },
      read: false
    });
  },

  async markAsRead(notificationId, userId) {
    return Notification.findOneAndUpdate(
      { _id: notificationId, recipient: userId },
      { read: true, readAt: new Date() },
      { new: true }
    );
  },

  async markAllAsRead(userId) {
    return Notification.updateMany(
      { recipient: userId, read: false },
      { read: true, readAt: new Date() }
    );
  },

  async getUnreadCount(userId) {
    return Notification.countDocuments({ recipient: userId, read: false });
  },

  async getUserNotifications(userId, { page = 1, limit = 20 }) {
    return Notification.find({ recipient: userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('sender', 'name avatar')
      .lean();
  }
};

module.exports = notificationService;
