import api from './axios';
import axios from 'axios';

export const sharesApi = {
  // Authenticated board owner/admin
  createShareLink: (boardId, data) => api.post(`/shares/boards/${boardId}/share`, data),
  getShareInfo: (boardId) => api.get(`/shares/boards/${boardId}/share`),
  revokeShareLink: (boardId) => api.delete(`/shares/boards/${boardId}/share`),

  // Public (no auth needed — uses raw axios to avoid auth interceptor redirect)
  getPublicBoard: (token) => axios.get(`/api/shares/public/${token}`),
  publicCreateTask: (token, data) => axios.post(`/api/shares/public/${token}/tasks`, data),
  publicUpdateTask: (token, taskId, data) => axios.patch(`/api/shares/public/${token}/tasks/${taskId}`, data),
  publicDeleteTask: (token, taskId) => axios.delete(`/api/shares/public/${token}/tasks/${taskId}`)
};
