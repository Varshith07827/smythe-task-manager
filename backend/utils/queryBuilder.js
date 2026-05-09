// Reject objects injected via Express query parsing (e.g. ?status[$ne]=x)
function sanitizeFilter(val) {
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val.filter(v => typeof v === 'string');
  return undefined; // reject objects like { $ne: ... }
}

const buildTaskQuery = (filters, boardId) => {
  const query = { board: boardId };
  // Show archived tasks only when explicitly requested
  if (filters.showArchived === 'true' || filters.showArchived === true) {
    query.archived = true;
  } else {
    query.archived = { $ne: true };
  }
  // Remove showArchived so it doesn't pollute other filters
  delete filters.showArchived;

  if (filters.status) {
    const safe = sanitizeFilter(filters.status);
    if (safe) query.status = Array.isArray(safe) ? { $in: safe } : safe;
  }
  if (filters.priority) {
    const safe = sanitizeFilter(filters.priority);
    if (safe) query.priority = Array.isArray(safe) ? { $in: safe } : safe;
  }
  if (filters.assignedTo) {
    const safe = sanitizeFilter(filters.assignedTo);
    if (safe) query.assignedTo = Array.isArray(safe) ? { $in: safe } : safe;
  }
  if (filters.unassigned === true || filters.unassigned === 'true') {
    query.assignedTo = { $size: 0 };
  }
  if (filters.dueDateFrom || filters.dueDateTo) {
    query.dueDate = {};
    if (typeof filters.dueDateFrom === 'string') query.dueDate.$gte = new Date(filters.dueDateFrom);
    if (typeof filters.dueDateTo === 'string') query.dueDate.$lte = new Date(filters.dueDateTo);
  }
  if (filters.overdue === true || filters.overdue === 'true') {
    query.dueDate = { $lt: new Date() };
    query.status = { $nin: ['completed', 'cancelled'] };
  }
  if (filters.columnFilters) {
    let colFilters;
    try {
      colFilters = typeof filters.columnFilters === 'string'
        ? JSON.parse(filters.columnFilters)
        : filters.columnFilters;
    } catch {
      colFilters = {};
    }
    if (colFilters && typeof colFilters === 'object') {
      for (const [colId, value] of Object.entries(colFilters)) {
        if (!/^[a-f\d]{24}$/i.test(colId)) continue;
        const safeVal = sanitizeFilter(value);
        if (safeVal === undefined) continue;
        if (Array.isArray(safeVal)) {
          query[`columnValues.${colId}`] = { $in: safeVal };
        } else {
          query[`columnValues.${colId}`] = safeVal;
        }
      }
    }
  }
  if (filters.search && typeof filters.search === 'string') {
    query.$text = { $search: filters.search.slice(0, 200) };
  }
  if (filters.createdAfter && typeof filters.createdAfter === 'string') {
    query.createdAt = { $gte: new Date(filters.createdAfter) };
  }

  return query;
};

const buildTaskSort = (sortBy, sortDir = 'asc') => {
  const dir = sortDir === 'desc' ? 'desc' : 'asc'; // sanitize to valid values only
  const sortMap = {
    title: { title: dir === 'asc' ? 1 : -1 },
    status: { status: dir === 'asc' ? 1 : -1 },
    priority: { priority: dir === 'asc' ? 1 : -1 },
    dueDate: { dueDate: dir === 'asc' ? 1 : -1 },
    createdAt: { createdAt: dir === 'asc' ? 1 : -1 },
    order: { order: 1 },
    default: { order: 1, createdAt: -1 }
  };
  return sortMap[sortBy] || sortMap.default;
};

module.exports = { buildTaskQuery, buildTaskSort };
