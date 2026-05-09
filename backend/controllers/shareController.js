const mongoose = require('mongoose');
const TaskShare = require('../models/TaskShare');
const Task = require('../models/Task');
const Board = require('../models/Board');
const socketService = require('../services/socketService');
const activityService = require('../services/activityService');
const log = require('../utils/logger');

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
}

function sanitizeText(text, maxLen = 500) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/<[^>]*>/g, '').trim().slice(0, maxLen);
}

const shareController = {
  // ===================== CREATE TASK SHARE LINK =====================
  async createTaskShareLink(req, res) {
    try {
      const { taskId } = req.params;
      if (!isValidId(taskId)) return res.status(404).json({ error: 'Task not found' });

      const task = await Task.findById(taskId).select('board title');
      if (!task) return res.status(404).json({ error: 'Task not found' });

      const { permission = 'view', expiresIn } = req.body;
      if (!['view', 'edit'].includes(permission)) {
        return res.status(400).json({ error: 'Invalid permission level' });
      }

      let expiresAt = null;
      if (expiresIn) {
        const durations = { '1h': 3600, '24h': 86400, '7d': 604800, '30d': 2592000 };
        const seconds = durations[expiresIn];
        if (!seconds) return res.status(400).json({ error: 'Invalid expiration. Use: 1h, 24h, 7d, 30d' });
        expiresAt = new Date(Date.now() + seconds * 1000);
      }

      // Revoke any existing active shares for this task
      await TaskShare.updateMany(
        { task: taskId, revoked: false },
        { revoked: true, revokedAt: new Date(), revokedBy: req.user._id }
      );

      const share = await TaskShare.create({
        task: taskId,
        board: task.board,
        createdBy: req.user._id,
        permission,
        expiresAt
      });

      res.status(201).json({
        _id: share._id,
        token: share.token,
        permission: share.permission,
        expiresAt: share.expiresAt,
        createdAt: share.createdAt
      });
    } catch (err) {
      log.error('Share', `Create task share failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to create share link' });
    }
  },

  // ===================== GET TASK SHARE INFO =====================
  async getTaskShareInfo(req, res) {
    try {
      const { taskId } = req.params;
      if (!isValidId(taskId)) return res.status(404).json({ error: 'Task not found' });

      const share = await TaskShare.findOne({ task: taskId, revoked: false })
        .select('token permission expiresAt accessCount lastAccessedAt createdAt')
        .lean();

      if (!share) return res.json({ active: false });

      if (share.expiresAt && share.expiresAt < new Date()) {
        return res.json({ active: false, expired: true });
      }

      res.json({ active: true, ...share });
    } catch (err) {
      res.status(500).json({ error: 'Failed to get share info' });
    }
  },

  // ===================== REVOKE TASK SHARE LINK =====================
  async revokeTaskShareLink(req, res) {
    try {
      const { taskId } = req.params;
      if (!isValidId(taskId)) return res.status(404).json({ error: 'Task not found' });

      const result = await TaskShare.updateMany(
        { task: taskId, revoked: false },
        { revoked: true, revokedAt: new Date(), revokedBy: req.user._id }
      );

      res.json({ revoked: result.modifiedCount });
    } catch (err) {
      log.error('Share', `Revoke task share failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to revoke share link' });
    }
  },

  // ===================== ACCESS PUBLIC TASK (NO AUTH) =====================
  async getPublicTask(req, res) {
    try {
      const { token } = req.params;
      if (!token || token.length !== 64) return res.status(404).json({ error: 'Invalid share link' });

      const share = await TaskShare.findOne({ token });
      if (!share || !share.isActive()) {
        const reason = share?.revoked ? 'revoked' : share?.expiresAt < new Date() ? 'expired' : 'not_found';
        return res.status(404).json({ error: 'This share link is no longer valid', reason });
      }

      const task = await Task.findById(share.task)
        .populate('assignedTo', 'name avatar')
        .populate('assignedBy', 'name')
        .populate('comments.author', 'name avatar')
        .lean();

      if (!task || task.archived) {
        return res.status(404).json({ error: 'Task not found or archived' });
      }

      const board = await Board.findById(task.board).select('title columns').lean();

      // Update access count
      TaskShare.updateOne(
        { _id: share._id },
        { $inc: { accessCount: 1 }, lastAccessedAt: new Date() }
      ).catch(() => {});

      res.json({
        task,
        board: board ? { title: board.title, columns: board.columns } : null,
        permission: share.permission,
        shareId: share._id
      });
    } catch (err) {
      log.error('Share', `Public task access failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to load task' });
    }
  },

  // ===================== PUBLIC TASK UPDATE =====================
  async publicUpdateTask(req, res) {
    try {
      const { token } = req.params;
      if (!token || token.length !== 64) return res.status(404).json({ error: 'Invalid share link' });

      const share = await TaskShare.findOne({ token });
      if (!share || !share.isActive() || share.permission !== 'edit') {
        return res.status(403).json({ error: 'Edit access not available' });
      }

      const task = await Task.findById(share.task);
      if (!task || task.archived) return res.status(404).json({ error: 'Task not found' });

      const allowed = ['title', 'description', 'status', 'priority', 'dueDate', 'columnValues'];
      const updates = {};

      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          if (key === 'title') {
            const clean = sanitizeText(req.body[key], 500);
            if (!clean) return res.status(400).json({ error: 'Title cannot be empty' });
            updates[key] = clean;
          } else if (key === 'description') {
            updates[key] = sanitizeText(req.body[key], 5000);
          } else {
            updates[key] = req.body[key];
          }
        }
      }

      Object.assign(task, updates);
      await task.save();

      const populated = await Task.findById(task._id)
        .populate('assignedTo', 'name avatar')
        .populate('assignedBy', 'name')
        .populate('comments.author', 'name avatar')
        .lean();

      try {
        socketService.taskUpdated(task.board.toString(), populated, 'public');
      } catch {}

      res.json(populated);
    } catch (err) {
      log.error('Share', `Public task update failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to update task' });
    }
  },

  // ===================== PUBLIC ADD COMMENT =====================
  async publicAddComment(req, res) {
    try {
      const { token } = req.params;
      if (!token || token.length !== 64) return res.status(404).json({ error: 'Invalid share link' });

      const share = await TaskShare.findOne({ token });
      if (!share || !share.isActive() || share.permission !== 'edit') {
        return res.status(403).json({ error: 'Edit access not available' });
      }

      const { text, authorName } = req.body;
      if (!text?.trim()) return res.status(400).json({ error: 'Comment text is required' });

      const task = await Task.findById(share.task);
      if (!task || task.archived) return res.status(404).json({ error: 'Task not found' });

      task.comments.push({
        text: sanitizeText(text, 2000),
        author: share.createdBy, // attribute to share creator
        createdAt: new Date()
      });
      await task.save();

      const populated = await Task.findById(task._id)
        .populate('comments.author', 'name avatar')
        .lean();

      res.status(201).json(populated.comments[populated.comments.length - 1]);
    } catch (err) {
      log.error('Share', `Public comment failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to add comment' });
    }
  }
};

module.exports = shareController;
