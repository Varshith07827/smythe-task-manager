const { getIO } = require('../config/socket');

const socketService = {
  taskUpdated(boardId, task, updatedBy) {
    getIO().to(`board:${boardId}`).emit('task:updated', {
      task,
      updatedBy: { _id: updatedBy._id, name: updatedBy.name },
      timestamp: new Date()
    });
  },

  taskCreated(boardId, task, createdBy) {
    getIO().to(`board:${boardId}`).emit('task:created', {
      task,
      createdBy: { _id: createdBy._id, name: createdBy.name },
      timestamp: new Date()
    });
  },

  taskDeleted(boardId, taskId, deletedBy) {
    getIO().to(`board:${boardId}`).emit('task:deleted', {
      taskId,
      deletedBy: { _id: deletedBy._id, name: deletedBy.name },
      timestamp: new Date()
    });
  },

  boardUpdated(boardId, changes, updatedBy) {
    getIO().to(`board:${boardId}`).emit('board:updated', {
      changes,
      updatedBy: { _id: updatedBy._id, name: updatedBy.name },
      timestamp: new Date()
    });
  },

  notifyUser(userId, notification) {
    getIO().to(`user:${userId}`).emit('notification:new', notification);
  },

  bulkTasksUpdated(boardId, taskIds, changes, updatedBy) {
    getIO().to(`board:${boardId}`).emit('tasks:bulk_updated', {
      taskIds,
      changes,
      updatedBy: { _id: updatedBy._id, name: updatedBy.name },
      timestamp: new Date()
    });
  },

  activityLogged(boardId, activity) {
    getIO().to(`board:${boardId}`).emit('activity:logged', {
      activity,
      timestamp: new Date()
    });
  }
};

module.exports = socketService;
