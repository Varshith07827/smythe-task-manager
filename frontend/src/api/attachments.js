import api from './axios';

export const attachmentsApi = {
  upload: (taskId, file, onProgress) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/tasks/${taskId}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress
    });
  },
  getAll: (taskId) => api.get(`/tasks/${taskId}/attachments`),
  download: (id) => api.get(`/attachments/${id}/download`, { responseType: 'blob' }),
  delete: (id) => api.delete(`/attachments/${id}`)
};
