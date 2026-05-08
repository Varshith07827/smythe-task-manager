const ROLE_HIERARCHY = { admin: 2, user: 1 };

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

const requireMinRole = (minRole) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (ROLE_HIERARCHY[req.user.role] < ROLE_HIERARCHY[minRole]) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

const getEditableFields = (role, board) => {
  const adminFields = [
    'title', 'description', 'assignedTo', 'assignedBy', 'status',
    'priority', 'dueDate', 'startDate', 'columnValues', 'order',
    'parentTask', 'archived'
  ];
  const userFields = ['title', 'description', 'assignedTo', 'dueDate', 'startDate', 'priority', 'status', 'columnValues', 'comments'];

  return role === 'admin' ? adminFields : userFields;
};

module.exports = { authorize, requireMinRole, getEditableFields, ROLE_HIERARCHY };
