import api from './axios';

export const authApi = {
  login: (data) => api.post('/auth/login', data),
  registerRequest: (data) => api.post('/auth/register/request', data),
  registerConfirm: (data) => api.post('/auth/register/confirm', data),
  invite: (data) => api.post('/auth/invite', data),
  getMe: () => api.get('/auth/me'),
  requestOtp: (email) => api.post('/auth/otp/request', { email }),
  verifyOtp: (email, code) => api.post('/auth/otp/verify', { email, code }),
  submitSupport: (data) => api.post('/auth/support', data)
};
