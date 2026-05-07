const notificationService = require('../services/notificationService');

const notificationController = {
  async getNotifications(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const notifications = await notificationService.getUserNotifications(
        req.user._id,
        { page: parseInt(page) || 1, limit: Math.min(parseInt(limit) || 20, 100) }
      );
      res.json(notifications);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async getUnreadCount(req, res) {
    try {
      const count = await notificationService.getUnreadCount(req.user._id);
      res.json({ count });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async markAsRead(req, res) {
    try {
      const notification = await notificationService.markAsRead(req.params.id, req.user._id);
      res.json(notification);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async markAllAsRead(req, res) {
    try {
      await notificationService.markAllAsRead(req.user._id);
      res.json({ message: 'All notifications marked as read' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
};

module.exports = notificationController;
