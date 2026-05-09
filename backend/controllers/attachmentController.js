const Attachment = require('../models/Attachment');
const Task = require('../models/Task');
const Board = require('../models/Board');
const activityService = require('../services/activityService');
const socketService = require('../services/socketService');
const { uploadService } = require('../services/uploadService');

async function checkAttachmentAccess(attachment, user) {
  if (user.role === 'admin') return true;
  const board = await Board.findById(attachment.board).select('permissions createdBy').lean();
  if (!board) return false;
  if (board.createdBy?.toString() === user._id.toString()) return true;
  const vis = board.permissions?.visibility || 'all';
  if (vis === 'all') return true;
  if (vis === 'restricted') {
    return (board.permissions.allowedUsers || []).some(id => id.toString() === user._id.toString());
  }
  return false;
}

async function checkTaskAccess(task, user) {
  if (user.role === 'admin') return true;
  const userId = user._id.toString();
  const board = await Board.findById(task.board).select('permissions createdBy').lean();
  if (!board) return false;
  if (board.createdBy?.toString() === userId) return true;

  const vis = board.permissions?.visibility || 'all';
  if (vis === 'restricted') {
    const allowed = (board.permissions?.allowedUsers || []).some(id => id.toString() === userId);
    if (!allowed) return false;
  }

  // For member users, only assigned tasks are readable/editable.
  return (task.assignedTo || []).some(id => id.toString() === userId);
}

const attachmentController = {
  async upload(req, res) {
    try {
      const { taskId } = req.params;
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'No file uploaded' });

      const task = await Task.findById(taskId);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      if (task.archived) return res.status(400).json({ error: 'Cannot upload to archived task' });
      if (!await checkTaskAccess(task, req.user)) {
        return res.status(403).json({ error: 'No access to this task' });
      }

      const attachment = await Attachment.create({
        task: taskId,
        board: task.board,
        uploadedBy: req.user._id,
        filename: file.originalname,
        storageKey: `${taskId}/${file.filename}`,
        mimeType: file.mimetype,
        size: file.size
      });

      await Task.findByIdAndUpdate(taskId, {
        $push: {
          attachments: attachment._id,
          history: {
            changedBy: req.user._id,
            action: 'attachment_added',
            field: 'attachments',
            newValue: attachment.filename,
            timestamp: new Date()
          }
        }
      });

      await activityService.log({
        board: task.board,
        task: taskId,
        user: req.user,
        action: 'attachment_uploaded',
        target: { type: 'attachment', id: attachment._id, name: file.originalname }
      });

      res.status(201).json(attachment);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async getTaskAttachments(req, res) {
    try {
      const task = await Task.findById(req.params.taskId).select('board assignedTo');
      if (!task) return res.status(404).json({ error: 'Task not found' });
      if (!await checkTaskAccess(task, req.user)) {
        return res.status(403).json({ error: 'No access to this task' });
      }

      const attachments = await Attachment.find({ task: req.params.taskId })
        .populate('uploadedBy', 'name avatar')
        .sort({ createdAt: -1 });
      res.json(attachments);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async download(req, res) {
    try {
      const attachment = await Attachment.findById(req.params.id);
      if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

      if (!await checkAttachmentAccess(attachment, req.user)) {
        return res.status(403).json({ error: 'No access to this attachment' });
      }

      const filePath = uploadService.getFilePath(attachment.storageKey);
      res.download(filePath, attachment.filename);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async view(req, res) {
    try {
      const attachment = await Attachment.findById(req.params.id);
      if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

      if (!await checkAttachmentAccess(attachment, req.user)) {
        return res.status(403).json({ error: 'No access to this attachment' });
      }

      const filePath = uploadService.getFilePath(attachment.storageKey);
      res.setHeader('Content-Type', attachment.mimeType);
      res.sendFile(filePath);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async delete(req, res) {
    try {
      const attachment = await Attachment.findById(req.params.id);
      if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

      if (!await checkAttachmentAccess(attachment, req.user)) {
        return res.status(403).json({ error: 'No access to this attachment' });
      }

      await uploadService.deleteFile(attachment.storageKey);

      await Task.findByIdAndUpdate(attachment.task, {
        $pull: { attachments: attachment._id },
        $push: {
          history: {
            changedBy: req.user._id,
            action: 'attachment_removed',
            field: 'attachments',
            oldValue: attachment.filename,
            timestamp: new Date()
          }
        }
      });

      await attachment.deleteOne();

      res.json({ message: 'Attachment deleted' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
};

module.exports = attachmentController;
