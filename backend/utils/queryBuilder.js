const buildTaskQuery = (filters, boardId) => {
  const query = { board: boardId, archived: { $ne: true } };

  if (filters.status) {
    query.status = Array.isArray(filters.status) ? { $in: filters.status } : filters.status;
  }
  if (filters.priority) {
    query.priority = Array.isArray(filters.priority) ? { $in: filters.priority } : filters.priority;
  }
  if (filters.assignedTo) {
    query.assignedTo = Array.isArray(filters.assignedTo) ? { $in: filters.assignedTo } : filters.assignedTo;
  }
  if (filters.unassigned === true || filters.unassigned === 'true') {
    query.assignedTo = { $size: 0 };
  }
  if (filters.dueDateFrom || filters.dueDateTo) {
    query.dueDate = {};
    if (filters.dueDateFrom) query.dueDate.$gte = new Date(filters.dueDateFrom);
    if (filters.dueDateTo) query.dueDate.$lte = new Date(filters.dueDateTo);
  }
  if (filters.overdue === true || filters.overdue === 'true') {
    query.dueDate = { $lt: new Date() };
    query.status = { $nin: ['completed', 'cancelled'] };
  }
  if (filters.columnFilters) {
    const colFilters = typeof filters.columnFilters === 'string'
      ? JSON.parse(filters.columnFilters)
      : filters.columnFilters;
    for (const [colId, value] of Object.entries(colFilters)) {
      if (Array.isArray(value)) {
        query[`columnValues.${colId}`] = { $in: value };
      } else {
        query[`columnValues.${colId}`] = value;
      }
    }
  }
  if (filters.search) {
    query.$text = { $search: filters.search };
  }
  if (filters.createdAfter) {
    query.createdAt = { $gte: new Date(filters.createdAfter) };
  }

  return query;
};

const buildTaskSort = (sortBy, sortDir = 'asc') => {
  const sortMap = {
    title: { title: sortDir === 'asc' ? 1 : -1 },
    status: { status: sortDir === 'asc' ? 1 : -1 },
    priority: { priority: sortDir === 'asc' ? 1 : -1 },
    dueDate: { dueDate: sortDir === 'asc' ? 1 : -1 },
    createdAt: { createdAt: sortDir === 'asc' ? 1 : -1 },
    order: { order: 1 },
    default: { order: 1, createdAt: -1 }
  };
  return sortMap[sortBy] || sortMap.default;
};

module.exports = { buildTaskQuery, buildTaskSort };
