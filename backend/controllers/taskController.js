const Task = require('../models/Task');
const Board = require('../models/Board');
const User = require('../models/User');
const activityService = require('../services/activityService');
const socketService = require('../services/socketService');
const notificationService = require('../services/notificationService');
const { buildTaskQuery, buildTaskSort } = require('../utils/queryBuilder');
const { getEditableFields } = require('../middleware/rbac');
const log = require('../utils/logger');

const MAX_BULK = 100;

const taskController = {
  async create(req, res) {
    try {
      const { boardId } = req.params;
      const { title, description, assignedTo, priority, dueDate, startDate, columnValues, parentTask } = req.body;
      if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

      const creatorId = req.user._id.toString();
      const assigneeIds = assignedTo ? [...assignedTo] : [];
      if (!assigneeIds.some(id => id.toString() === creatorId)) {
        assigneeIds.unshift(creatorId);
      }

      if (assigneeIds.length) {
        const validUsers = await User.find({
          _id: { $in: assigneeIds },
          status: { $in: ['active', 'invited'] }
        }).select('_id').lean();
        const validIds = new Set(validUsers.map(u => u._id.toString()));
        const invalid = assigneeIds.filter(id => !validIds.has(id.toString()));
        if (invalid.length) {
          return res.status(400).json({ error: 'One or more assignees are not valid active users' });
        }
      }

      const taskCount = await Task.countDocuments({ board: boardId, archived: { $ne: true } });

      const task = await Task.create({
        board: boardId,
        title: title.trim(),
        description: description?.slice(0, 10000),
        assignedTo: assigneeIds,
        assignedBy: req.user._id,
        priority,
        dueDate,
        startDate,
        columnValues: columnValues || {},
        parentTask,
        order: taskCount,
        history: [{
          changedBy: req.user._id,
          action: 'created',
          timestamp: new Date()
        }]
      });

      const populated = await Task.findById(task._id)
        .populate('assignedTo', 'name avatar')
        .populate('assignedBy', 'name');

      if (assigneeIds?.length) {
        for (const userId of assigneeIds) {
          if (userId.toString() !== req.user._id.toString()) {
            await notificationService.create({
              recipient: userId,
              sender: req.user._id,
              type: 'task_assigned',
              title: 'Task Assigned',
              message: `You were assigned to "${title.trim()}"`,
              board: boardId,
              task: task._id,
              taskTitle: title.trim()
            });
          }
        }
      }

      await activityService.log({
        board: boardId,
        task: task._id,
        user: req.user,
        action: 'task_created',
        target: { type: 'task', id: task._id, name: title.trim() },
        req
      });

      socketService.taskCreated(boardId, populated, req.user);
      res.status(201).json(populated);
    } catch (err) {
      log.error('Task', `Create failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to create task' });
    }
  },

  async getAll(req, res) {
    try {
      const { boardId } = req.params;
      const { page = 1, limit = 50, sortBy, sortDir, ...filters } = req.query;
      const safeLimit = Math.min(parseInt(limit) || 50, 200);

      const query = buildTaskQuery(filters, boardId);
      if (req.user.role === 'user') {
        query.assignedTo = req.user._id;
      }
      const sort = buildTaskSort(sortBy, sortDir);

      const [tasks, total] = await Promise.all([
        Task.find(query)
          .sort(sort)
          .skip((parseInt(page) - 1) * safeLimit)
          .limit(safeLimit)
          .populate('assignedTo', 'name avatar')
          .populate('assignedBy', 'name')
          .lean(),
        Task.countDocuments(query)
      ]);

      res.json({
        tasks,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / safeLimit)
      });
    } catch (err) {
      log.error('Task', `GetAll failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to fetch tasks' });
    }
  },

  async getOne(req, res) {
    try {
      const task = await Task.findById(req.params.taskId)
        .populate('assignedTo', 'name avatar email')
        .populate('assignedBy', 'name')
        .populate('comments.author', 'name avatar')
        .populate('attachments');

      if (!task) return res.status(404).json({ error: 'Task not found' });
      res.json(task);
    } catch (err) {
      log.error('Task', `GetOne failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to fetch task' });
    }
  },

  async update(req, res) {
    try {
      const task = await Task.findById(req.params.taskId);
      if (!task) return res.status(404).json({ error: 'Task not found' });

      const board = req.board || await Board.findById(task.board);
      const editableFields = getEditableFields(req.user.role, board);
      const updates = {};

      for (const [key, value] of Object.entries(req.body)) {
        if (editableFields.includes(key)) {
          updates[key] = value;
        }
      }

      const changes = activityService.diffChanges(task.toObject(), updates,
        Object.keys(updates));

      const statusChanged = updates.status && updates.status !== task.status;
      const newStatusValue = statusChanged ? updates.status : null;

      if (statusChanged) {
        activityService.addTaskHistory(task, {
          changedBy: req.user._id,
          action: 'status_changed',
          field: 'status',
          oldValue: task.status,
          newValue: updates.status
        });
        if (updates.status === 'completed') {
          updates.completedAt = new Date();
        }
        if (['completed', 'cancelled'].includes(updates.status)) {
          notificationService.clearDeadlineReminders(task._id).catch(() => {});
        }
      }

      Object.assign(task, updates);
      activityService.addTaskHistory(task, {
        changedBy: req.user._id,
        action: 'updated',
        metadata: { fields: Object.keys(updates) }
      });

      await task.save();

      const populated = await Task.findById(task._id)
        .populate('assignedTo', 'name avatar')
        .populate('assignedBy', 'name');

      await activityService.log({
        board: task.board,
        task: task._id,
        user: req.user,
        action: 'task_updated',
        target: { type: 'task', id: task._id, name: task.title },
        changes,
        req
      });

      if (newStatusValue) {
        // Respect per-task notification settings
        const tn = task.taskNotifications || {};
        const taskStatusNotifEnabled = tn.statusChanged !== false;
        const allowedStatuses = Array.isArray(tn.notifyOnStatuses) && tn.notifyOnStatuses.length > 0
          ? tn.notifyOnStatuses : null;
        const statusAllowed = !allowedStatuses || allowedStatuses.includes(newStatusValue);

        if (taskStatusNotifEnabled && statusAllowed) {
          const actorId = req.user._id.toString();
          const recipientIds = new Set(
            (task.assignedTo || []).map(id => id.toString()).filter(id => id !== actorId)
          );

          if (recipientIds.size === 0) {
            const admins = await User.find({
              role: 'admin', _id: { $ne: req.user._id }
            }).select('_id').lean();
            for (const a of admins) recipientIds.add(a._id.toString());
          }

          const statusLabel = newStatusValue.replace(/_/g, ' ');
          for (const rid of recipientIds) {
            await notificationService.create({
              recipient: rid,
              sender: req.user._id,
              type: 'status_changed',
              title: 'Task status updated',
              message: `${req.user.name} moved "${task.title}" to ${statusLabel}`,
              board: task.board,
              task: task._id,
              newStatus: newStatusValue
            });
          }
        }
      }

      socketService.taskUpdated(task.board.toString(), populated, req.user);
      res.json(populated);
    } catch (err) {
      log.error('Task', `Update failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to update task' });
    }
  },

  async archive(req, res) {
    try {
      const task = await Task.findByIdAndUpdate(
        req.params.taskId,
        { archived: true },
        { new: true }
      );
      if (!task) return res.status(404).json({ error: 'Task not found' });
      socketService.taskDeleted(task.board.toString(), task._id, req.user);
      res.json({ message: 'Task archived' });
    } catch (err) {
      log.error('Task', `Archive failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to archive task' });
    }
  },

  async unarchive(req, res) {
    try {
      const task = await Task.findByIdAndUpdate(
        req.params.taskId,
        { archived: false },
        { new: true }
      ).populate('assignedTo', 'name avatar').populate('assignedBy', 'name');
      if (!task) return res.status(404).json({ error: 'Task not found' });
      // Emit an update event (task was modified) so clients can reconcile archived/active lists
      socketService.taskUpdated(task.board.toString(), task, req.user);
      res.json(task);
    } catch (err) {
      log.error('Task', `Unarchive failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to unarchive task' });
    }
  },

  async permanentDelete(req, res) {
    try {
      const task = await Task.findById(req.params.taskId);
      if (!task) return res.status(404).json({ error: 'Task not found' });

      const boardId = task.board.toString();
      await Task.deleteOne({ _id: task._id });

      await activityService.log({
        board: boardId,
        task: task._id,
        user: req.user,
        action: 'task_deleted',
        target: { type: 'task', id: task._id, name: task.title },
        req
      });

      socketService.taskDeleted(boardId, task._id, req.user);
      res.json({ message: 'Task permanently deleted' });
    } catch (err) {
      log.error('Task', `PermanentDelete failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to delete task' });
    }
  },

  async bulkDelete(req, res) {
    try {
      const { taskIds, boardId } = req.body;
      if (!taskIds?.length) return res.status(400).json({ error: 'taskIds are required' });
      if (taskIds.length > MAX_BULK) return res.status(400).json({ error: `Maximum ${MAX_BULK} tasks per bulk operation` });

      const bid = boardId || req.params.boardId;
      const tasks = await Task.find({ _id: { $in: taskIds }, board: bid }).select('_id title').lean();
      await Task.deleteMany({ _id: { $in: taskIds }, board: bid });

      for (const t of tasks) {
        await activityService.log({
          board: bid,
          task: t._id,
          user: req.user,
          action: 'task_deleted',
          target: { type: 'task', id: t._id, name: t.title },
          req
        });
      }

      socketService.bulkTasksUpdated(bid, taskIds, { deleted: true }, req.user);
      res.json({ deleted: tasks.length });
    } catch (err) {
      log.error('Task', `BulkDelete failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to delete tasks' });
    }
  },

  async addComment(req, res) {
    try {
      const { text, mentions } = req.body;
      if (!text?.trim()) return res.status(400).json({ error: 'Comment text is required' });
      const task = await Task.findById(req.params.taskId);
      if (!task) return res.status(404).json({ error: 'Task not found' });

      task.comments.push({
        author: req.user._id,
        text: text.trim().slice(0, 10000),
        mentions: mentions || []
      });

      activityService.addTaskHistory(task, {
        changedBy: req.user._id,
        action: 'commented'
      });

      await task.save();

      const actorId = req.user._id.toString();
      const assigneeIds = (task.assignedTo || []).map(id => id.toString());
      for (const uid of assigneeIds) {
        if (uid !== actorId) {
          await notificationService.create({
            recipient: uid,
            sender: req.user._id,
            type: 'comment_added',
            title: 'New comment',
            message: `${req.user.name} commented on "${task.title}"`,
            board: task.board,
            task: task._id
          });
        }
      }
      if (mentions?.length) {
        for (const userId of mentions) {
          if (!assigneeIds.includes(userId.toString())) {
            await notificationService.create({
              recipient: userId,
              sender: req.user._id,
              type: 'mentioned',
              title: 'You were mentioned',
              message: `${req.user.name} mentioned you in "${task.title}"`,
              board: task.board,
              task: task._id
            });
          }
        }
      }

      socketService.taskUpdated(task.board.toString(), task, req.user);
      res.json(task.comments[task.comments.length - 1]);
    } catch (err) {
      log.error('Task', `AddComment failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to add comment' });
    }
  },

  async updateComment(req, res) {
    try {
      const { taskId, commentId } = req.params;
      const { text } = req.body;
      if (!text?.trim()) return res.status(400).json({ error: 'Text is required' });

      const task = await Task.findById(taskId);
      if (!task) return res.status(404).json({ error: 'Task not found' });

      const comment = task.comments.id(commentId);
      if (!comment) return res.status(404).json({ error: 'Comment not found' });
      if (comment.author.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'You can only edit your own comments' });
      }

      comment.text = text.trim().slice(0, 10000);
      comment.editedAt = new Date();
      await task.save();

      const populated = await Task.findById(taskId)
        .populate('comments.author', 'name avatar')
        .lean();

      res.json(populated.comments.find(c => c._id.toString() === commentId));
    } catch (err) {
      log.error('Task', `UpdateComment failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to update comment' });
    }
  },

  async deleteComment(req, res) {
    try {
      const { taskId, commentId } = req.params;

      const task = await Task.findById(taskId);
      if (!task) return res.status(404).json({ error: 'Task not found' });

      const comment = task.comments.id(commentId);
      if (!comment) return res.status(404).json({ error: 'Comment not found' });
      if (comment.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'You can only delete your own comments' });
      }

      comment.deleteOne();
      await task.save();

      socketService.taskUpdated(task.board.toString(), task, req.user);
      res.json({ message: 'Comment deleted' });
    } catch (err) {
      log.error('Task', `DeleteComment failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to delete comment' });
    }
  },

  async getActivity(req, res) {
    try {
      const activity = await activityService.getTaskActivity(req.params.taskId);
      res.json(activity);
    } catch (err) {
      log.error('Task', `GetActivity failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to fetch activity' });
    }
  },

  async bulkAssign(req, res) {
    try {
      const { taskIds, assignTo, boardId } = req.body;
      if (!taskIds?.length || !assignTo?.length) {
        return res.status(400).json({ error: 'taskIds and assignTo are required' });
      }
      if (taskIds.length > MAX_BULK) {
        return res.status(400).json({ error: `Maximum ${MAX_BULK} tasks per bulk operation` });
      }

      const bid = boardId || req.params.boardId;
      const result = await Task.updateMany(
        { _id: { $in: taskIds }, board: bid },
        {
          $addToSet: { assignedTo: { $each: assignTo } },
          $push: {
            history: {
              changedBy: req.user._id,
              action: 'assigned',
              field: 'assignedTo',
              newValue: assignTo,
              timestamp: new Date(),
              metadata: { bulk: true, count: taskIds.length }
            }
          }
        }
      );

      const bulkTasks = await Task.find({ _id: { $in: taskIds }, board: bid }).select('title').lean();
      for (const userId of assignTo) {
        if (userId.toString() === req.user._id.toString()) continue;
        for (const t of bulkTasks) {
          await notificationService.create({
            recipient: userId,
            sender: req.user._id,
            type: 'task_assigned',
            title: 'Task Assigned',
            message: `You were assigned to "${t.title}"`,
            board: bid,
            task: t._id,
            taskTitle: t.title
          });
        }
      }

      socketService.bulkTasksUpdated(bid, taskIds, { assignedTo: assignTo }, req.user);
      res.json({ modified: result.modifiedCount });
    } catch (err) {
      log.error('Task', `BulkAssign failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to assign tasks' });
    }
  },

  async bulkStatusChange(req, res) {
    try {
      const { taskIds, status, boardId } = req.body;
      if (!taskIds?.length || !status) {
        return res.status(400).json({ error: 'taskIds and status are required' });
      }
      if (taskIds.length > MAX_BULK) {
        return res.status(400).json({ error: `Maximum ${MAX_BULK} tasks per bulk operation` });
      }

      const bid = boardId || req.params.boardId;
      const completedAt = status === 'completed' ? new Date() : null;
      const result = await Task.updateMany(
        { _id: { $in: taskIds }, board: bid },
        {
          $set: { status, ...(completedAt && { completedAt }) },
          $push: {
            history: {
              changedBy: req.user._id,
              action: 'status_changed',
              field: 'status',
              newValue: status,
              timestamp: new Date(),
              metadata: { bulk: true }
            }
          }
        }
      );

      const tasks = await Task.find({
        _id: { $in: taskIds },
        board: bid,
        archived: { $ne: true }
      }).select('title assignedTo assignedBy board taskNotifications').lean();

      const actorId = req.user._id.toString();
      const statusLabel = status.replace(/_/g, ' ');
      let cachedAdminIds = null;
      for (const t of tasks) {
        const tn = t.taskNotifications || {};
        const taskStatusNotifEnabled = tn.statusChanged !== false;
        const allowedStatuses = Array.isArray(tn.notifyOnStatuses) && tn.notifyOnStatuses.length > 0
          ? tn.notifyOnStatuses : null;
        const statusAllowed = !allowedStatuses || allowedStatuses.includes(status);
        if (!taskStatusNotifEnabled || !statusAllowed) continue;

        const recipientIds = new Set();
        for (const uid of t.assignedTo || []) {
          if (uid.toString() !== actorId) recipientIds.add(uid.toString());
        }
        if (t.assignedBy && t.assignedBy.toString() !== actorId) {
          recipientIds.add(t.assignedBy.toString());
        }
        if (recipientIds.size === 0) {
          if (!cachedAdminIds) {
            const admins = await User.find({
              role: 'admin', _id: { $ne: req.user._id }
            }).select('_id').lean();
            cachedAdminIds = admins.map(a => a._id.toString());
          }
          for (const id of cachedAdminIds) recipientIds.add(id);
        }
        for (const rid of recipientIds) {
          await notificationService.create({
            recipient: rid,
            sender: req.user._id,
            type: 'status_changed',
            title: 'Task status updated',
            message: `${req.user.name} moved "${t.title}" to ${statusLabel}`,
            board: t.board,
            task: t._id,
            newStatus: status
          });
        }
      }

      if (['completed', 'cancelled'].includes(status)) {
        for (const tid of taskIds) {
          notificationService.clearDeadlineReminders(tid).catch(() => {});
        }
      }

      socketService.bulkTasksUpdated(bid, taskIds, { status }, req.user);
      res.json({ modified: result.modifiedCount });
    } catch (err) {
      log.error('Task', `BulkStatusChange failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to update task statuses' });
    }
  },

  async bulkArchive(req, res) {
    try {
      const { taskIds, boardId } = req.body;
      if (!taskIds?.length) return res.status(400).json({ error: 'taskIds are required' });
      if (taskIds.length > MAX_BULK) return res.status(400).json({ error: `Maximum ${MAX_BULK} tasks per bulk operation` });

      const bid = boardId || req.params.boardId;
      const result = await Task.updateMany(
        { _id: { $in: taskIds }, board: bid },
        { $set: { archived: true } }
      );

      socketService.bulkTasksUpdated(bid, taskIds, { archived: true }, req.user);
      res.json({ archived: result.modifiedCount });
    } catch (err) {
      log.error('Task', `BulkArchive failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to archive tasks' });
    }
  },

  async bulkUnarchive(req, res) {
    try {
      const { taskIds, boardId } = req.body;
      if (!taskIds?.length) return res.status(400).json({ error: 'taskIds are required' });
      if (taskIds.length > MAX_BULK) return res.status(400).json({ error: `Maximum ${MAX_BULK} tasks per bulk operation` });

      const bid = boardId || req.params.boardId;
      const result = await Task.updateMany(
        { _id: { $in: taskIds }, board: bid },
        { $set: { archived: false } }
      );

      socketService.bulkTasksUpdated(bid, taskIds, { archived: false }, req.user);
      res.json({ restored: result.modifiedCount });
    } catch (err) {
      log.error('Task', `BulkUnarchive failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to unarchive tasks' });
    }
  },

  async updateNotifications(req, res) {
    try {
      const task = await Task.findById(req.params.taskId);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      const { dailyReminder, intervalReminder, urgentMode,
              statusChanged, notifyOnStatuses, deliveryMode,
              quietHoursEnabled, quietHoursStart, quietHoursEnd } = req.body;
      if (dailyReminder !== undefined) Object.assign(task.taskNotifications.dailyReminder, dailyReminder);
      if (intervalReminder !== undefined) Object.assign(task.taskNotifications.intervalReminder, intervalReminder);
      if (urgentMode !== undefined) Object.assign(task.taskNotifications.urgentMode, urgentMode);
      if (statusChanged !== undefined) task.taskNotifications.statusChanged = statusChanged;
      if (notifyOnStatuses !== undefined) task.taskNotifications.notifyOnStatuses = notifyOnStatuses;
      if (deliveryMode !== undefined) task.taskNotifications.deliveryMode = deliveryMode;
      if (quietHoursEnabled !== undefined) task.taskNotifications.quietHoursEnabled = quietHoursEnabled;
      if (quietHoursStart !== undefined) task.taskNotifications.quietHoursStart = quietHoursStart;
      if (quietHoursEnd !== undefined) task.taskNotifications.quietHoursEnd = quietHoursEnd;

      task.markModified('taskNotifications');

      activityService.addTaskHistory(task, {
        changedBy: req.user._id,
        action: 'notification_updated',
        field: 'taskNotifications',
        newValue: JSON.stringify(task.taskNotifications),
        timestamp: new Date()
      });
      await task.save();

      res.json(task.taskNotifications);
    } catch (err) {
      log.error('Task', `UpdateNotifications failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to update notifications' });
    }
  },

  async remind(req, res) {
    try {
      const { text } = req.body;
      const task = await Task.findById(req.params.taskId)
        .populate('assignedTo', 'name');
      if (!task) return res.status(404).json({ error: 'Task not found' });

      const recipientIds = new Set();
      for (const u of task.assignedTo || []) {
        recipientIds.add(u._id.toString());
      }

      if (!recipientIds.size) {
        return res.status(400).json({ error: 'No assignees to remind' });
      }

      for (const rid of recipientIds) {
        await notificationService.create({
          recipient: rid,
          sender: req.user._id,
          type: 'reminder',
          title: 'Task Reminder',
          message: `${req.user.name} sent a reminder for "${task.title}"${text ? `: ${text.slice(0, 500)}` : ''}`,
          board: task.board,
          task: task._id
        });
      }

      task.history.push({
        changedBy: req.user._id,
        action: 'reminder_sent',
        field: 'reminder',
        newValue: text?.slice(0, 500) || 'Manual reminder sent',
        timestamp: new Date()
      });
      if (!task.taskNotifications) task.taskNotifications = {};
      task.taskNotifications.lastRemindedAt = new Date();
      task.markModified('taskNotifications');
      await task.save();

      await activityService.log({
        board: task.board,
        task: task._id,
        user: req.user,
        action: 'task_reminded',
        target: { type: 'task', id: task._id, name: task.title },
        req
      });

      res.json({ message: 'Reminders sent' });
    } catch (err) {
      log.error('Task', `Remind failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to send reminders' });
    }
  }
};

module.exports = taskController;
