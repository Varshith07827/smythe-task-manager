const Board = require('../models/Board');
const Task = require('../models/Task');
const activityService = require('../services/activityService');
const socketService = require('../services/socketService');
const notificationService = require('../services/notificationService');

const boardController = {
  async create(req, res) {
    try {
      const { title, description, columns, color } = req.body;
      if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

      const board = await Board.create({
        title: title.trim(),
        description: description?.slice(0, 5000),
        color: color || '',
        createdBy: req.user._id,
        columns: columns || []
      });

      await activityService.log({
        board: board._id,
        user: req.user,
        action: 'board_created',
        target: { type: 'board', id: board._id, name: title.trim() },
        req
      });

      res.status(201).json(board);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async getAll(req, res) {
    try {
      const userId = req.user._id;
      const role = req.user.role;

      let query;
      if (role === 'admin') {
        query = { archived: { $ne: true } };
      } else {
        const [assignedBoardIds, createdBoardIds] = await Promise.all([
          Task.distinct('board', { assignedTo: userId, archived: { $ne: true } }),
          Board.distinct('_id', { createdBy: userId, archived: { $ne: true } })
        ]);
        const allIds = [...new Set([
          ...assignedBoardIds.map(id => id.toString()),
          ...createdBoardIds.map(id => id.toString())
        ])];
        query = {
          archived: { $ne: true },
          _id: { $in: allIds }
        };
      }

      const boards = await Board.find(query)
        .select('title description color createdAt updatedAt columns permissions.visibility')
        .sort({ createdAt: -1 })
        .lean();

      const boardIds = boards.map(b => b._id);
      const taskCounts = await Task.aggregate([
        { $match: { board: { $in: boardIds }, archived: { $ne: true } } },
        { $group: { _id: '$board', count: { $sum: 1 } } }
      ]);
      const countMap = Object.fromEntries(taskCounts.map(t => [t._id.toString(), t.count]));
      const boardsWithCount = boards.map(b => ({ ...b, taskCount: countMap[b._id.toString()] || 0 }));

      res.json(boardsWithCount);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async getOne(req, res) {
    try {
      const board = await Board.findById(req.params.boardId)
        .populate('createdBy', 'name avatar');
      if (!board) return res.status(404).json({ error: 'Board not found' });
      res.json(board);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      const allowed = ['title', 'description', 'color', 'defaultSort', 'defaultFilter', 'progressDigest', 'customStatuses', 'customPriorities'];
      const $set = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) $set[key] = req.body[key];
      }
      if (Object.keys($set).length === 0) {
        const board = await Board.findById(req.params.boardId);
        if (!board) return res.status(404).json({ error: 'Board not found' });
        return res.json(board);
      }

      const board = await Board.findByIdAndUpdate(req.params.boardId, { $set }, { new: true });
      if (!board) return res.status(404).json({ error: 'Board not found' });

      socketService.boardUpdated(board._id, $set, req.user);
      res.json(board);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async archive(req, res) {
    try {
      const board = await Board.findById(req.params.boardId).select('createdBy archived');
      if (!board) return res.status(404).json({ error: 'Board not found' });
      const isAdmin = req.user.role === 'admin';
      const isOwner = board.createdBy?.toString() === req.user._id.toString();
      if (!isAdmin && !isOwner) return res.status(403).json({ error: 'Only the board creator or an admin can archive this project' });
      await Board.findByIdAndUpdate(req.params.boardId, { archived: true });
      res.json({ message: 'Board archived' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async getArchived(req, res) {
    try {
      const boards = await Board.find({ archived: true })
        .select('title description color createdAt columns permissions.visibility')
        .sort({ createdAt: -1 })
        .lean();
      res.json(boards);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async restore(req, res) {
    try {
      const board = await Board.findById(req.params.boardId).select('createdBy');
      if (!board) return res.status(404).json({ error: 'Board not found' });
      const isAdmin = req.user.role === 'admin';
      const isOwner = board.createdBy?.toString() === req.user._id.toString();
      if (!isAdmin && !isOwner) return res.status(403).json({ error: 'Only the board creator or an admin can restore this project' });
      const updated = await Board.findByIdAndUpdate(req.params.boardId, { archived: false }, { new: true });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async permanentDelete(req, res) {
    try {
      const board = await Board.findById(req.params.boardId).select('createdBy archived');
      if (!board) return res.status(404).json({ error: 'Board not found' });
      if (!board.archived) return res.status(400).json({ error: 'Board must be archived before permanent deletion' });
      const isAdmin = req.user.role === 'admin';
      const isOwner = board.createdBy?.toString() === req.user._id.toString();
      if (!isAdmin && !isOwner) return res.status(403).json({ error: 'Only the board creator or an admin can delete this project' });
      await Task.deleteMany({ board: board._id });
      await Board.findByIdAndDelete(board._id);
      res.json({ message: 'Board permanently deleted' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async addColumn(req, res) {
    try {
      const board = await Board.findById(req.params.boardId);
      if (!board) return res.status(404).json({ error: 'Board not found' });
      const { name, type, options, required, defaultValue } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: 'Column name is required' });
      board.columns.push({
        name: name.trim(), type, options, required, defaultValue,
        order: board.columns.length
      });
      await board.save();

      socketService.boardUpdated(board._id, { columns: board.columns }, req.user);
      res.json(board);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async updateColumn(req, res) {
    try {
      const board = await Board.findById(req.params.boardId);
      if (!board) return res.status(404).json({ error: 'Board not found' });
      const col = board.columns.id(req.params.colId);
      if (!col) return res.status(404).json({ error: 'Column not found' });

      Object.assign(col, req.body);
      await board.save();

      socketService.boardUpdated(board._id, { columns: board.columns }, req.user);
      res.json(board);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async removeColumn(req, res) {
    try {
      const board = await Board.findById(req.params.boardId);
      if (!board) return res.status(404).json({ error: 'Board not found' });
      board.columns.pull({ _id: req.params.colId });
      await board.save();

      socketService.boardUpdated(board._id, { columns: board.columns }, req.user);
      res.json(board);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async replaceColumns(req, res) {
    try {
      const board = await Board.findById(req.params.boardId);
      if (!board) return res.status(404).json({ error: 'Board not found' });

      const { columns } = req.body;
      if (!Array.isArray(columns)) return res.status(400).json({ error: 'columns must be an array' });

      board.columns = columns.map((col, idx) => ({
        name: col.name,
        type: col.type || 'text',
        options: col.options || [],
        required: col.required || false,
        defaultValue: col.defaultValue,
        visible: col.visible !== false,
        order: idx
      }));
      await board.save();

      socketService.boardUpdated(board._id, { columns: board.columns }, req.user);
      res.json(board);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async reorderColumns(req, res) {
    try {
      const board = await Board.findById(req.params.boardId);
      if (!board) return res.status(404).json({ error: 'Board not found' });
      const { columnOrder } = req.body;
      if (!Array.isArray(columnOrder)) return res.status(400).json({ error: 'columnOrder must be an array' });
      columnOrder.forEach((id, idx) => {
        const col = board.columns.id(id);
        if (col) col.order = idx;
      });

      await board.save();
      socketService.boardUpdated(board._id, { columns: board.columns }, req.user);
      res.json(board);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async updatePermissions(req, res) {
    try {
      const { visibility, allowedUsers, userCanComment,
              userCanChangeStatus, userEditableColumns } = req.body;

      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can modify board permissions' });
      }

      const board = await Board.findByIdAndUpdate(req.params.boardId, {
        $set: {
          'permissions.visibility': visibility,
          'permissions.allowedUsers': allowedUsers,
          'permissions.userCanComment': userCanComment,
          'permissions.userCanChangeStatus': userCanChangeStatus,
          'permissions.userEditableColumns': userEditableColumns
        }
      }, { new: true });

      if (!board) return res.status(404).json({ error: 'Board not found' });

      if (allowedUsers?.length) {
        await notificationService.notifyMany(allowedUsers, {
          sender: req.user._id,
          type: 'board_shared',
          title: 'Board Shared',
          message: `You now have access to "${board.title}"`,
          board: board._id
        });
      }

      socketService.boardUpdated(board._id, { permissions: board.permissions }, req.user);
      res.json(board);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async getActivity(req, res) {
    try {
      const { page = 1, limit = 50 } = req.query;
      const activity = await activityService.getBoardActivity(
        req.params.boardId,
        { page: parseInt(page), limit: Math.min(parseInt(limit) || 50, 100) }
      );
      res.json(activity);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async getNotificationSchedule(req, res) {
    try {
      const { boardId } = req.params;
      const board = await Board.findById(boardId).select('title progressDigest').lean();
      if (!board) return res.status(404).json({ error: 'Board not found' });

      const User = require('../models/User');
      const tasks = await Task.find({
        board: boardId,
        archived: { $ne: true },
        assignedTo: { $exists: true, $not: { $size: 0 } }
      })
        .select('title status assignedTo')
        .populate('assignedTo', 'name email avatar notificationPreferences')
        .lean();

      const byUser = new Map();
      for (const t of tasks) {
        for (const u of t.assignedTo || []) {
          if (!u?._id) continue;
          const id = u._id.toString();
          if (!byUser.has(id)) byUser.set(id, { user: u, tasks: [] });
          byUser.get(id).tasks.push({ _id: t._id, title: t.title, status: t.status });
        }
      }

      const scheduleEnabled = !!board.progressDigest?.enabled;
      const emailDeliveryConfigured = !!process.env.NOTEIFY_API_KEY;

      const recipients = Array.from(byUser.values()).map(({ user: u, tasks: taskList }) => {
        const p = u.notificationPreferences || {};
        const digestOk = p.progressDigest !== false;
        const emailOk = p.email !== false && !!u.email;
        const inAppOk = p.inApp !== false;
        return {
          _id: u._id,
          name: u.name,
          email: u.email,
          avatar: u.avatar,
          taskCount: taskList.length,
          tasks: taskList,
          willReceiveEmail: scheduleEnabled && digestOk && emailOk && emailDeliveryConfigured,
          willReceiveInApp: scheduleEnabled && digestOk && inAppOk,
          optedOutOfBoardSummaries: !digestOk,
          emailNotificationsOff: p.email === false
        };
      });

      recipients.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      res.json({
        boardTitle: board.title,
        schedule: {
          enabled: scheduleEnabled,
          intervalHours: board.progressDigest?.intervalHours || 4
        },
        recipients,
        emailDeliveryConfigured
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async sendProgressReport(req, res) {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: 'Email is required' });

      const board = await Board.findById(req.params.boardId).select('title').lean();
      if (!board) return res.status(404).json({ error: 'Board not found' });

      const tasks = await Task.find({
        board: req.params.boardId,
        archived: { $ne: true }
      })
        .select('title status priority dueDate assignedTo')
        .populate('assignedTo', 'name')
        .sort({ createdAt: -1 })
        .lean();

      const emailService = require('../services/emailService');
      const branding = await emailService.getAppBranding();
      const appName = branding.appTitle || 'Smythe';
      const htmlBody = emailService.buildProgressDigestEmail(board.title, tasks, branding);
      const subject = `${appName} - ${board.title} progress report`;

      const result = await emailService.send(email, subject, htmlBody);
      if (!result) {
        return res.status(500).json({ error: 'Email delivery is not configured on the server.' });
      }

      res.json({ message: `Progress report sent to ${email}` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
};

module.exports = boardController;
