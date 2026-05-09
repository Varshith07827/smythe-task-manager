import api from './axios';
import axios from 'axios';

export const sharesApi = {
  // Authenticated task share management
  createShareLink: (taskId, data) => api.post(`/shares/tasks/${taskId}/share`, data),
  getShareInfo: (taskId) => api.get(`/shares/tasks/${taskId}/share`),
  revokeShareLink: (taskId) => api.delete(`/shares/tasks/${taskId}/share`),

  // Public (no auth needed — uses raw axios to avoid auth interceptor redirect)
  getPublicTask: (token) => axios.get(`/api/shares/public/${token}`),
  publicUpdateTask: (token, data) => axios.patch(`/api/shares/public/${token}`, data),
  publicAddComment: (token, data) => axios.post(`/api/shares/public/${token}/comments`, data)
};
