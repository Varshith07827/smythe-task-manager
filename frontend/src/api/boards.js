import api from './axios';

export const boardsApi = {
  getAll: () => api.get('/boards'),
  getOne: (id) => api.get(`/boards/${id}`),
  create: (data) => api.post('/boards', data),
  update: (id, data) => api.patch(`/boards/${id}`, data),
  archive: (id) => api.delete(`/boards/${id}`),
  getArchived: () => api.get('/boards/archived'),
  restore: (id) => api.patch(`/boards/${id}/restore`),
  delete: (id) => api.delete(`/boards/${id}/permanent`),

  // Columns
  addColumn: (boardId, data) => api.post(`/boards/${boardId}/columns`, data),
  updateColumn: (boardId, colId, data) => api.patch(`/boards/${boardId}/columns/${colId}`, data),
  removeColumn: (boardId, colId) => api.delete(`/boards/${boardId}/columns/${colId}`),
  reorderColumns: (boardId, columnOrder) => api.patch(`/boards/${boardId}/columns/reorder`, { columnOrder }),
  replaceColumns: (boardId, columns) => api.put(`/boards/${boardId}/columns`, { columns }),

  // Permissions
  updatePermissions: (boardId, data) => api.patch(`/boards/${boardId}/permissions`, data),

  // Activity
  getActivity: (boardId, page = 1) => api.get(`/boards/${boardId}/activity?page=${page}`),

  getNotificationSchedule: (boardId) => api.get(`/boards/${boardId}/notification-schedule`),
  sendProgressReport: (boardId, email) => api.post(`/boards/${boardId}/send-report`, { email }),

  // Global activity logs (admin)
  getGlobalActivity: (params = {}) => api.get('/activity/global', { params })
};
