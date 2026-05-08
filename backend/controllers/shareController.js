const mongoose = require('mongoose');
const BoardShare = require('../models/BoardShare');
const Board = require('../models/Board');
const Task = require('../models/Task');
const socketService = require('../services/socketService');
const activityService = require('../services/activityService');
const log = require('../utils/logger');

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
}

// Sanitize user input for task fields
function sanitizeText(text, maxLen = 500) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/<[^>]*>/g, '').trim().slice(0, maxLen);
}

const shareController = {
  // ===================== CREATE SHARE LINK =====================
  async createShareLink(req, res) {
    try {
      const { boardId } = req.params;
      if (!isValidId(boardId)) return res.status(404).json({ error: 'Board not found' });

      const board = await Board.findById(boardId).select('createdBy title');
      if (!board) return res.status(404).json({ error: 'Board not found' });

      // Only board owner or admin can share
      const isOwner = board.createdBy.toString() === req.user._id.toString();
      if (!isOwner && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only the board owner or an admin can share this board' });
      }

      const { permission = 'edit', expiresIn } = req.body;
      if (!['view', 'comment', 'edit'].includes(permission)) {
        return res.status(400).json({ error: 'Invalid permission level' });
      }

      // Calculate expiration
      let expiresAt = null;
      if (expiresIn) {
        const durations = { '1h': 3600, '24h': 86400, '7d': 604800, '30d': 2592000 };
        const seconds = durations[expiresIn];
        if (!seconds) return res.status(400).json({ error: 'Invalid expiration. Use: 1h, 24h, 7d, 30d' });
        expiresAt = new Date(Date.now() + seconds * 1000);
      }

      // Revoke any existing active shares for this board (one active link at a time)
      await BoardShare.updateMany(
        { board: boardId, revoked: false },
        { revoked: true, revokedAt: new Date(), revokedBy: req.user._id }
      );

      const share = await BoardShare.create({
        board: boardId,
        createdBy: req.user._id,
        permission,
        expiresAt
      });

      // Log activity
      try {
        await activityService.log({
          board: boardId,
          user: req.user._id,
          action: 'board_updated',
          target: { type: 'board', id: boardId, name: board.title },
          changes: [{ field: 'sharing', from: 'disabled', to: `${permission} access` }],
          req
        });
      } catch (err) {
        log.warn('Share', `Activity log failed: ${err.message}`);
      }

      res.status(201).json({
        _id: share._id,
        token: share.token,
        permission: share.permission,
        expiresAt: share.expiresAt,
        createdAt: share.createdAt
      });
    } catch (err) {
      log.error('Share', `Create failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to create share link' });
    }
  },

  // ===================== GET SHARE INFO FOR A BOARD =====================
  async getBoardShareInfo(req, res) {
    try {
      const { boardId } = req.params;
      if (!isValidId(boardId)) return res.status(404).json({ error: 'Board not found' });

      const share = await BoardShare.findOne({ board: boardId, revoked: false })
        .select('token permission expiresAt accessCount lastAccessedAt createdAt')
        .lean();

      if (!share) return res.json({ active: false });

      // Check if expired
      if (share.expiresAt && share.expiresAt < new Date()) {
        return res.json({ active: false, expired: true });
      }

      res.json({
        active: true,
        ...share
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to get share info' });
    }
  },

  // ===================== REVOKE SHARE LINK =====================
  async revokeShareLink(req, res) {
    try {
      const { boardId } = req.params;
      if (!isValidId(boardId)) return res.status(404).json({ error: 'Board not found' });

      const board = await Board.findById(boardId).select('createdBy title');
      if (!board) return res.status(404).json({ error: 'Board not found' });

      const isOwner = board.createdBy.toString() === req.user._id.toString();
      if (!isOwner && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only the board owner or an admin can revoke sharing' });
      }

      const result = await BoardShare.updateMany(
        { board: boardId, revoked: false },
        { revoked: true, revokedAt: new Date(), revokedBy: req.user._id }
      );

      try {
        await activityService.log({
          board: boardId,
          user: req.user._id,
          action: 'board_updated',
          target: { type: 'board', id: boardId, name: board.title },
          changes: [{ field: 'sharing', from: 'enabled', to: 'disabled' }],
          req
        });
      } catch (err) {
        log.warn('Share', `Activity log failed: ${err.message}`);
      }

      res.json({ revoked: result.modifiedCount });
    } catch (err) {
      log.error('Share', `Revoke failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to revoke share link' });
    }
  },

  // ===================== ACCESS PUBLIC BOARD (NO AUTH REQUIRED) =====================
  async getPublicBoard(req, res) {
    try {
      const { token } = req.params;
      if (!token || token.length !== 64) return res.status(404).json({ error: 'Invalid share link' });

      const share = await BoardShare.findOne({ token });
      if (!share || !share.isActive()) {
        const reason = share?.revoked ? 'revoked' : share?.expiresAt < new Date() ? 'expired' : 'not_found';
        return res.status(404).json({ error: 'This share link is no longer valid', reason });
      }

      const board = await Board.findById(share.board)
        .select('-permissions')
        .lean();
      if (!board || board.archived) {
        return res.status(404).json({ error: 'Board not found or archived' });
      }

      const tasks = await Task.find({ board: board._id, archived: { $ne: true } })
        .sort({ order: 1, createdAt: -1 })
        .populate('assignedTo', 'name avatar')
        .lean();

      // Update access count
      BoardShare.updateOne(
        { _id: share._id },
        { $inc: { accessCount: 1 }, lastAccessedAt: new Date() }
      ).catch(() => {});

      res.json({
        board,
        tasks,
        permission: share.permission,
        shareId: share._id
      });
    } catch (err) {
      log.error('Share', `Public access failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to load board' });
    }
  },

  // ===================== PUBLIC TASK CREATE =====================
  async publicCreateTask(req, res) {
    try {
      const { token } = req.params;
      if (!token || token.length !== 64) return res.status(404).json({ error: 'Invalid share link' });

      const share = await BoardShare.findOne({ token });
      if (!share || !share.isActive() || share.permission !== 'edit') {
        return res.status(403).json({ error: 'Edit access not available' });
      }

      const board = await Board.findById(share.board);
      if (!board || board.archived) return res.status(404).json({ error: 'Board not found' });

      const { title, description, status, priority, dueDate, columnValues } = req.body;

      if (!title?.trim()) return res.status(400).json({ error: 'Task title is required' });
      const cleanTitle = sanitizeText(title, 500);
      if (!cleanTitle) return res.status(400).json({ error: 'Task title is required' });

      const maxOrder = await Task.findOne({ board: board._id }).sort({ order: -1 }).select('order').lean();

      const task = await Task.create({
        board: board._id,
        title: cleanTitle,
        description: sanitizeText(description, 5000) || undefined,
        status: status || 'pending',
        priority: priority || 'medium',
        dueDate: dueDate || undefined,
        columnValues: columnValues || {},
        order: (maxOrder?.order ?? -1) + 1,
        history: [{
          changedBy: share.createdBy, // attribute to share creator
          action: 'created',
          metadata: { source: 'public_share' }
        }]
      });

      const populated = await Task.findById(task._id)
        .populate('assignedTo', 'name avatar')
        .lean();

      // Emit real-time update
      try {
        socketService.taskCreated(board._id.toString(), populated, 'public');
      } catch {}

      res.status(201).json(populated);
    } catch (err) {
      log.error('Share', `Public task create failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to create task' });
    }
  },

  // ===================== PUBLIC TASK UPDATE =====================
  async publicUpdateTask(req, res) {
    try {
      const { token, taskId } = req.params;
      if (!token || token.length !== 64) return res.status(404).json({ error: 'Invalid share link' });
      if (!isValidId(taskId)) return res.status(404).json({ error: 'Task not found' });

      const share = await BoardShare.findOne({ token });
      if (!share || !share.isActive() || share.permission !== 'edit') {
        return res.status(403).json({ error: 'Edit access not available' });
      }

      const task = await Task.findOne({ _id: taskId, board: share.board });
      if (!task) return res.status(404).json({ error: 'Task not found' });

      const allowed = ['title', 'description', 'status', 'priority', 'dueDate', 'startDate', 'columnValues', 'order'];
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
        .lean();

      try {
        socketService.taskUpdated(share.board.toString(), populated, 'public');
      } catch {}

      res.json(populated);
    } catch (err) {
      log.error('Share', `Public task update failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to update task' });
    }
  },

  // ===================== PUBLIC TASK DELETE =====================
  async publicDeleteTask(req, res) {
    try {
      const { token, taskId } = req.params;
      if (!token || token.length !== 64) return res.status(404).json({ error: 'Invalid share link' });
      if (!isValidId(taskId)) return res.status(404).json({ error: 'Task not found' });

      const share = await BoardShare.findOne({ token });
      if (!share || !share.isActive() || share.permission !== 'edit') {
        return res.status(403).json({ error: 'Edit access not available' });
      }

      const task = await Task.findOneAndUpdate(
        { _id: taskId, board: share.board },
        { archived: true },
        { new: true }
      );
      if (!task) return res.status(404).json({ error: 'Task not found' });

      try {
        socketService.taskDeleted(share.board.toString(), taskId, 'public');
      } catch {}

      res.json({ message: 'Task archived' });
    } catch (err) {
      log.error('Share', `Public task delete failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to delete task' });
    }
  }
};

module.exports = shareController;
