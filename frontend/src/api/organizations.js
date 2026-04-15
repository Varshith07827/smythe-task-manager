import api from './axios';

export const organizationsApi = {
  get: (id) => api.get(`/organizations/${id}`),
  update: (id, data) => api.patch(`/organizations/${id}`, data),
  getPublicBranding: () => api.get('/organizations/branding/public'),
  uploadBrandingFile: (id, file, field) => {
    const form = new FormData();
    form.append('file', file);
    form.append('field', field);
    return api.post(`/organizations/${id}/branding/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }
};
