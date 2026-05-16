const { getIO } = require('../config/socket');

const socketService = {
  taskUpdated(boardId, task, updatedBy) {
    const actor = typeof updatedBy === 'string'
      ? { _id: null, name: updatedBy }
      : { _id: updatedBy._id, name: updatedBy.name };
    getIO().to(`board:${boardId}`).emit('task:updated', {
      task,
      updatedBy: actor,
      timestamp: new Date()
    });
  },

  taskCreated(boardId, task, createdBy) {
    const actor = typeof createdBy === 'string'
      ? { _id: null, name: createdBy }
      : { _id: createdBy._id, name: createdBy.name };
    getIO().to(`board:${boardId}`).emit('task:created', {
      task,
      createdBy: actor,
      timestamp: new Date()
    });
  },

  taskDeleted(boardId, taskId, deletedBy) {
    const actor = typeof deletedBy === 'string'
      ? { _id: null, name: deletedBy }
      : { _id: deletedBy._id, name: deletedBy.name };
    getIO().to(`board:${boardId}`).emit('task:deleted', {
      taskId,
      deletedBy: actor,
      timestamp: new Date()
    });
  },

  boardUpdated(boardId, changes, updatedBy) {
    const actor = typeof updatedBy === 'string'
      ? { _id: null, name: updatedBy }
      : { _id: updatedBy._id, name: updatedBy.name };
    getIO().to(`board:${boardId}`).emit('board:updated', {
      changes,
      updatedBy: actor,
      timestamp: new Date()
    });
  },

  notifyUser(userId, notification) {
    getIO().to(`user:${userId}`).emit('notification:new', notification);
  },

  bulkTasksUpdated(boardId, taskIds, changes, updatedBy) {
    const actor = typeof updatedBy === 'string'
      ? { _id: null, name: updatedBy }
      : { _id: updatedBy._id, name: updatedBy.name };
    getIO().to(`board:${boardId}`).emit('tasks:bulk_updated', {
      taskIds,
      changes,
      updatedBy: actor,
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
