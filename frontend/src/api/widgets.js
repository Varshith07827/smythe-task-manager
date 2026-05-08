import api from './axios';

export const widgetsApi = {
  getAll: () => api.get('/widgets'),
  create: (data) => api.post('/widgets', data),
  update: (id, data) => api.patch(`/widgets/${id}`, data),
  delete: (id) => api.delete(`/widgets/${id}`),
  checkEmbed: (url) => api.get('/widgets/check-embed', { params: { url } })
};
