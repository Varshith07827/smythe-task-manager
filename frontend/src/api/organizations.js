import api from './axios';

/**
 * Organization API — single-org white-label model.
 * All calls use /me — the backend resolves the single org automatically.
 */
export const organizationsApi = {
  get:              ()           => api.get('/organizations/me'),
  update:           (data)       => api.patch('/organizations/me', data),
  getPublicBranding:()           => api.get('/organizations/branding/public'),
  getAutomations:   ()           => api.get('/organizations/me/automations'),
  updateAutomations:(data)       => api.patch('/organizations/me/automations', data),
  triggerAutomation:(job)        => api.post(`/organizations/me/automations/trigger/${job}`),
  uploadBrandingFile:(file, field) => {
    const form = new FormData();
    form.append('file', file);
    form.append('field', field);
    return api.post('/organizations/me/branding/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }
};
