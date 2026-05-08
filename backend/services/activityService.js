const ActivityLog = require('../models/ActivityLog');
const log = require('../utils/logger');

const activityService = {
  async log({ board, task, user, action, target, changes, metadata, req }) {
    try {
      const entry = await ActivityLog.create({
        board,
        task,
        user: user._id || user,
        action,
        target,
        changes,
        metadata,
        ipAddress: req?.ip,
        userAgent: req?.get?.('User-Agent')
      });

      if (board) {
        try {
          const socketService = require('./socketService');
          socketService.activityLogged(board.toString(), entry);
        } catch {}
      }
    } catch (err) {
      log.error('ActivityService', `Log error: ${err.message}`);
    }
  },

  addTaskHistory(task, { changedBy, action, field, oldValue, newValue, metadata }) {
    task.history.push({
      changedBy,
      action,
      field,
      oldValue,
      newValue,
      timestamp: new Date(),
      metadata
    });
  },

  diffChanges(oldObj, newObj, fields) {
    const changes = [];
    for (const field of fields) {
      const oldVal = oldObj[field];
      const newVal = newObj[field];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push({ field, from: oldVal, to: newVal });
      }
    }
    return changes;
  },

  async getBoardActivity(boardId, { page = 1, limit = 50 }) {
    return ActivityLog.find({ board: boardId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'name avatar')
      .lean();
  },

  async getTaskActivity(taskId) {
    return ActivityLog.find({ task: taskId })
      .sort({ createdAt: -1 })
      .populate('user', 'name avatar')
      .lean();
  },

  async getGlobalActivity({ page = 1, limit = 25, search, userName, userId, boardId }) {
    const User = require('../models/User');
    const query = {};
    if (userId) query.user = userId;
    if (boardId) query.board = boardId;
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 200);
      query.$or = [
        { action: { $regex: escaped, $options: 'i' } },
        { 'target.name': { $regex: escaped, $options: 'i' } }
      ];
    }
    if (userName) {
      const matchingUsers = await User.find({
        name: { $regex: userName, $options: 'i' }
      }).select('_id').lean();
      const userIds = matchingUsers.map(u => u._id);
      query.user = { $in: userIds };
    }

    const [logs, total] = await Promise.all([
      ActivityLog.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('user', 'name avatar email')
        .populate('board', 'title')
        .lean(),
      ActivityLog.countDocuments(query)
    ]);

    return { logs, total, page, pages: Math.ceil(total / limit) };
  }
};

module.exports = activityService;
