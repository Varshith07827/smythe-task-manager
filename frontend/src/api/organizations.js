import api from './axios';

export const organizationsApi = {
  get: (id) => api.get(`/organizations/${id}`),
  update: (id, data) => api.patch(`/organizations/${id}`, data),
  getPublicBranding: () => api.get('/organizations/branding/public'),
  getAutomations: (id) => api.get(`/organizations/${id}/automations`),
  updateAutomations: (id, data) => api.patch(`/organizations/${id}/automations`, data),
  triggerAutomation: (id, job) => api.post(`/organizations/${id}/automations/trigger/${job}`),
  uploadBrandingFile: (id, file, field) => {
    const form = new FormData();
    form.append('file', file);
    form.append('field', field);
    return api.post(`/organizations/${id}/branding/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }
};
