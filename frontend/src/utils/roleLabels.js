const ROLE_LABELS = {
  admin: 'Admin',
  user: 'User'
};

export function roleLabel(role) {
  return ROLE_LABELS[role] || role || 'Unknown';
}
