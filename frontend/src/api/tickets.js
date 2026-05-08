import api from './axios';

export const ticketsApi = {
  // User endpoints
  create: (data) => api.post('/tickets', data),
  getMine: (params) => api.get('/tickets/mine', { params }),
  getOne: (id) => api.get(`/tickets/${id}`),
  reply: (id, data) => api.post(`/tickets/${id}/reply`, data),
  getUnreadCount: () => api.get('/tickets/unread-count'),

  // Admin endpoints
  getAll: (params) => api.get('/tickets', { params }),
  updateStatus: (id, status) => api.patch(`/tickets/${id}/status`, { status }),
  updatePriority: (id, priority) => api.patch(`/tickets/${id}/priority`, { priority })
};
