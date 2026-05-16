import api from './axios';
import axios from 'axios';

const publicApi = axios.create({ baseURL: '/api' });

export const sharesApi = {
  // Authenticated task share management
  createShareLink: (taskId, data) => api.post(`/shares/tasks/${taskId}/share`, data),
  getShareInfo: (taskId) => api.get(`/shares/tasks/${taskId}/share`),
  revokeShareLink: (taskId) => api.delete(`/shares/tasks/${taskId}/share`),

  // Public (no auth — uses a plain axios instance so 401 doesn't redirect to /login)
  getPublicTask: (token) => publicApi.get(`/shares/public/${token}`),
  publicUpdateTask: (token, data) => publicApi.patch(`/shares/public/${token}`, data),
  publicAddComment: (token, data) => publicApi.post(`/shares/public/${token}/comments`, data),
  publicUploadAttachment: (token, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return publicApi.post(`/shares/public/${token}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }
};
