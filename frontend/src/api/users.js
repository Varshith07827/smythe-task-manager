import api from './axios';

export const usersApi = {
  getOrgMembers: () => api.get('/users'),
  getMembers: () => api.get('/users/members'),
  changeRole: (id, role) => api.patch(`/users/${id}/role`, { role }),
  changeStatus: (id, status) => api.patch(`/users/${id}/status`, { status }),
  removeUser: (id) => api.delete(`/users/${id}`),
  restoreUser: (id) => api.patch(`/users/${id}/restore`),
  updateNotificationPrefs: (prefs) => api.patch('/users/me/notification-preferences', prefs),
  updateMemberNotificationPrefs: (userId, prefs) => api.patch(`/users/${userId}/notification-preferences`, prefs),
  verifyPassword: (password) => api.post('/users/me/verify-password', { password }),
  changePassword: (data) => api.patch('/users/me/password', data),
  requestPasswordSupport: (data) => api.post('/users/me/password-support', data),
  updateMember: (id, data) => api.patch(`/users/${id}/profile`, data),
  updateProfile: (data) => api.patch('/users/me/profile', data),
  uploadAvatar: (file) => {
    const form = new FormData();
    form.append('avatar', file);
    return api.post('/users/me/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  }
};
