import api from './axios';

export const tasksApi = {
  getAll: (boardId, params = {}) => api.get(`/boards/${boardId}/tasks`, { params }),
  getOne: (boardId, taskId) => api.get(`/boards/${boardId}/tasks/${taskId}`),
  create: (boardId, data, options = {}) => api.post(`/boards/${boardId}/tasks`, data, options),
  update: (boardId, taskId, data) => api.patch(`/boards/${boardId}/tasks/${taskId}`, data),
  archive: (boardId, taskId) => api.delete(`/boards/${boardId}/tasks/${taskId}`),
  unarchive: (boardId, taskId) => api.patch(`/boards/${boardId}/tasks/${taskId}/unarchive`),
  permanentDelete: (boardId, taskId) => api.delete(`/boards/${boardId}/tasks/${taskId}/permanent`),
  bulkDelete: (boardId, data) => api.post(`/boards/${boardId}/tasks/bulk/delete`, data),

  // Actions & Comments
  addComment: (boardId, taskId, data) => api.post(`/boards/${boardId}/tasks/${taskId}/comments`, data),
  updateComment: (boardId, taskId, commentId, data) => api.patch(`/boards/${boardId}/tasks/${taskId}/comments/${commentId}`, data),
  deleteComment: (boardId, taskId, commentId) => api.delete(`/boards/${boardId}/tasks/${taskId}/comments/${commentId}`),
  remind: (boardId, taskId, data) => api.post(`/boards/${boardId}/tasks/${taskId}/remind`, data),

  // Activity
  getActivity: (boardId, taskId) => api.get(`/boards/${boardId}/tasks/${taskId}/activity`),

  // Per-task notifications
  updateNotifications: (boardId, taskId, data) => api.patch(`/boards/${boardId}/tasks/${taskId}/notifications`, data),

  // Reorder
  reorder: (boardId, data) => api.patch(`/boards/${boardId}/tasks/reorder`, data),

  // Bulk
  bulkAssign: (boardId, data) => api.post(`/boards/${boardId}/tasks/bulk/assign`, data),
  bulkStatus: (boardId, data) => api.post(`/boards/${boardId}/tasks/bulk/status`, data),
  bulkPriority: (boardId, data) => api.post(`/boards/${boardId}/tasks/bulk/priority`, data),
  bulkArchive: (boardId, data) => api.post(`/boards/${boardId}/tasks/bulk/archive`, data),
  bulkUnarchive: (boardId, data) => api.post(`/boards/${boardId}/tasks/bulk/unarchive`, data)
};
