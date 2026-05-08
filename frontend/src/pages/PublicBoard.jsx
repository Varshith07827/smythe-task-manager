import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { sharesApi } from '../api/shares';
import { motion, AnimatePresence } from 'framer-motion';
import { format, formatDistanceToNow } from 'date-fns';

const STATUS_MAP = {
  pending: { color: 'var(--accent)', label: 'Pending' },
  in_progress: { color: 'var(--orange)', label: 'In Progress' },
  completed: { color: 'var(--green)', label: 'Completed' },
  blocked: { color: 'var(--red)', label: 'Blocked' },
  cancelled: { color: 'var(--text-tertiary)', label: 'Cancelled' }
};

const PRIORITY_MAP = {
  low: { color: 'var(--green)', label: 'Low' },
  medium: { color: 'var(--teal)', label: 'Medium' },
  high: { color: 'var(--orange)', label: 'High' },
  critical: { color: 'var(--red)', label: 'Critical' }
};

/* Dropdown portal — matches the normal board behavior */
function useDropdownPos(isOpen, triggerRef) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const update = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    let top = rect.bottom + 4;
    let left = rect.left;
    if (top + 260 > window.innerHeight) top = Math.max(8, rect.top - 260);
    if (left + 200 > window.innerWidth) left = window.innerWidth - 208;
    if (left < 8) left = 8;
    setPos({ top, left });
  }, [triggerRef]);

  useEffect(() => {
    if (!isOpen) return;
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [isOpen, update]);
  return pos;
}

export default function PublicBoard() {
  const { token } = useParams();
  const [board, setBoard] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [permission, setPermission] = useState('view');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Detail panel
  const [selectedTask, setSelectedTask] = useState(null);
  const [editField, setEditField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const editRef = useRef(null);

  // Create task
  const [showCreateRow, setShowCreateRow] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const createRef = useRef(null);

  const canEdit = permission === 'edit';

  const loadBoard = useCallback(async () => {
    try {
      const res = await sharesApi.getPublicBoard(token);
      setBoard(res.data.board);
      setTasks(res.data.tasks);
      setPermission(res.data.permission);
    } catch (err) {
      const reason = err.response?.data?.reason;
      if (reason === 'expired') setError('This share link has expired.');
      else if (reason === 'revoked') setError('This share link has been revoked.');
      else setError('This share link is not valid or the board no longer exists.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadBoard(); }, [loadBoard]);
  useEffect(() => {
    if (showCreateRow && createRef.current) {
      createRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      createRef.current.focus();
    }
  }, [showCreateRow]);

  // Custom statuses from board
  const customStatusMap = {};
  (board?.customStatuses || []).forEach(s => {
    const val = s.value || s.name?.toLowerCase().replace(/\s+/g, '_');
    customStatusMap[val] = { color: s.color || 'var(--accent)', label: s.name || s.label };
  });
  const customPriorityMap = {};
  (board?.customPriorities || []).forEach(p => {
    const val = p.value || p.name?.toLowerCase().replace(/\s+/g, '_');
    customPriorityMap[val] = { color: p.color || 'var(--teal)', label: p.name || p.label };
  });
  const allStatuses = { ...STATUS_MAP, ...customStatusMap };
  const allPriorities = { ...PRIORITY_MAP, ...customPriorityMap };

  // --- Task actions ---
  const handleStatusChange = async (taskId, status) => {
    try {
      const res = await sharesApi.publicUpdateTask(token, taskId, { status });
      setTasks(prev => prev.map(t => t._id === taskId ? res.data : t));
      if (selectedTask?._id === taskId) setSelectedTask(res.data);
    } catch {}
  };

  const handlePriorityChange = async (taskId, priority) => {
    try {
      const res = await sharesApi.publicUpdateTask(token, taskId, { priority });
      setTasks(prev => prev.map(t => t._id === taskId ? res.data : t));
      if (selectedTask?._id === taskId) setSelectedTask(res.data);
    } catch {}
  };

  const handleFieldSave = async (taskId, field, value) => {
    try {
      const res = await sharesApi.publicUpdateTask(token, taskId, { [field]: value });
      setTasks(prev => prev.map(t => t._id === taskId ? res.data : t));
      if (selectedTask?._id === taskId) setSelectedTask(res.data);
    } catch {}
    setEditField(null);
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!newTitle.trim() || creating) return;
    setCreating(true);
    try {
      const res = await sharesApi.publicCreateTask(token, { title: newTitle.trim() });
      setTasks(prev => [...prev, res.data]);
      setNewTitle('');
      setShowCreateRow(false);
    } catch {} finally { setCreating(false); }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await sharesApi.publicDeleteTask(token, taskId);
      setTasks(prev => prev.filter(t => t._id !== taskId));
      if (selectedTask?._id === taskId) setSelectedTask(null);
    } catch {}
  };

  // Filter
  const filtered = tasks.filter(t => {
    if (search && !t.title?.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter && t.status !== statusFilter) return false;
    return true;
  });

  const columns = (board?.columns || []).filter(c => c.visible !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (loading) return (
    <div className="public-board-page">
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
    </div>
  );

  if (error) return (
    <div className="public-board-error">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.2" strokeLinecap="round">
        <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
      </svg>
      <h2>Link unavailable</h2>
      <p>{error}</p>
    </div>
  );

  return (
    <div className="public-board-page">
      {/* Top banner */}
      <div className="public-board-banner">
        <div className="public-board-banner-left">
          <span className="public-board-banner-tag">Shared Board</span>
          <span style={{ opacity: 0.7 }}>Anyone with this link can {permission} this board</span>
        </div>
        <span className="public-board-banner-perm">{permission}</span>
      </div>

      {/* Header */}
      <div className="public-board-header">
        <div>
          <h1 className="public-board-title">{board?.title}</h1>
          {board?.description && <p className="public-board-desc">{board.description}</p>}
        </div>
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreateRow(true)} style={{ gap: 4, flexShrink: 0 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Add Task
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="public-board-toolbar">
        <input className="search-input" placeholder="Search tasks..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 220 }} />
        <select className="toolbar-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(allStatuses).map(([val, info]) => <option key={val} value={val}>{info.label}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)' }}>
          {filtered.length} task{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table content */}
      <div className="public-board-content">
        {filtered.length === 0 && !showCreateRow ? (
          <div className="public-board-empty">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.3" strokeLinecap="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
            </svg>
            <h3>No tasks yet</h3>
            <p>{canEdit ? 'Click "Add Task" to create the first task' : 'This board has no tasks'}</p>
          </div>
        ) : (
          <div className="task-table-wrap">
            <table className="task-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Assigned</th>
                  <th>Due Date</th>
                  {columns.map(col => <th key={col._id}>{col.name}</th>)}
                  {canEdit && <th className="task-table-actions-col" />}
                </tr>
              </thead>
              <tbody>
                {/* Create row */}
                {showCreateRow && canEdit && (
                  <tr style={{ background: 'var(--accent-subtle)' }}>
                    <td colSpan={5 + columns.length + (canEdit ? 1 : 0)}>
                      <form onSubmit={handleCreateTask} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input ref={createRef} className="public-create-input" placeholder="Task title..." value={newTitle} onChange={e => setNewTitle(e.target.value)} style={{ flex: 1 }} />
                        <button type="submit" className="btn btn-primary btn-sm" disabled={creating || !newTitle.trim()}>{creating ? '...' : 'Add'}</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setShowCreateRow(false); setNewTitle(''); }}>Cancel</button>
                      </form>
                    </td>
                  </tr>
                )}

                {filtered.map(task => (
                  <PublicTaskRow
                    key={task._id}
                    task={task}
                    columns={columns}
                    allStatuses={allStatuses}
                    allPriorities={allPriorities}
                    canEdit={canEdit}
                    isSelected={selectedTask?._id === task._id}
                    onStatusChange={handleStatusChange}
                    onPriorityChange={handlePriorityChange}
                    onDelete={handleDeleteTask}
                    onClick={() => setSelectedTask(task)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Task Detail Slide-over */}
      <AnimatePresence>
        {selectedTask && (
          <>
            <motion.div className="task-detail-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedTask(null)} />
            <motion.div
              className="task-detail"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            >
              {/* Header */}
              <div className="task-detail-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: (allStatuses[selectedTask.status] || STATUS_MAP.pending).color, flexShrink: 0 }} />
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{selectedTask.title}</h3>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedTask(null)} style={{ padding: 6, flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>

              <div className="task-detail-body">
                {/* Title */}
                {editField === 'title' ? (
                  <input
                    ref={editRef}
                    className="public-edit-input"
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onBlur={() => { if (editValue.trim()) handleFieldSave(selectedTask._id, 'title', editValue.trim()); else setEditField(null); }}
                    onKeyDown={e => { if (e.key === 'Enter' && editValue.trim()) handleFieldSave(selectedTask._id, 'title', editValue.trim()); if (e.key === 'Escape') setEditField(null); }}
                    autoFocus
                    style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}
                  />
                ) : (
                  <h2
                    style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, cursor: canEdit ? 'pointer' : 'default', lineHeight: 1.4 }}
                    onClick={() => { if (canEdit) { setEditField('title'); setEditValue(selectedTask.title); } }}
                  >
                    {selectedTask.title}
                  </h2>
                )}

                {/* Fields */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <DetailField label="Status">
                    {canEdit ? (
                      <InlineDropdown
                        items={allStatuses}
                        value={selectedTask.status}
                        onSelect={(v) => handleStatusChange(selectedTask._id, v)}
                      />
                    ) : (
                      <BadgeDisplay map={allStatuses} value={selectedTask.status} fallback={STATUS_MAP.pending} />
                    )}
                  </DetailField>

                  <DetailField label="Priority">
                    {canEdit ? (
                      <InlineDropdown
                        items={allPriorities}
                        value={selectedTask.priority}
                        onSelect={(v) => handlePriorityChange(selectedTask._id, v)}
                      />
                    ) : (
                      <BadgeDisplay map={allPriorities} value={selectedTask.priority} fallback={PRIORITY_MAP.medium} />
                    )}
                  </DetailField>

                  <DetailField label="Due Date">
                    {canEdit ? (
                      <input
                        type="date"
                        className="public-edit-input"
                        value={selectedTask.dueDate ? format(new Date(selectedTask.dueDate), 'yyyy-MM-dd') : ''}
                        onChange={e => handleFieldSave(selectedTask._id, 'dueDate', e.target.value || null)}
                        style={{ width: 160, padding: '4px 8px', fontSize: 13 }}
                      />
                    ) : (
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        {selectedTask.dueDate ? format(new Date(selectedTask.dueDate), 'MMM d, yyyy') : '—'}
                      </span>
                    )}
                  </DetailField>

                  {selectedTask.assignedTo?.length > 0 && (
                    <DetailField label="Assigned">
                      <div className="avatar-group" style={{ '--avatar-size': '24px' }}>
                        {selectedTask.assignedTo.slice(0, 5).map(u => (
                          <div key={u._id} className="user-avatar" style={{ width: 24, height: 24, fontSize: 9 }} title={u.name}>
                            {u.name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?'}
                          </div>
                        ))}
                      </div>
                    </DetailField>
                  )}

                  <DetailField label="Description">
                    {editField === 'description' ? (
                      <textarea
                        className="public-edit-input"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={() => handleFieldSave(selectedTask._id, 'description', editValue)}
                        rows={4}
                        autoFocus
                        style={{ fontSize: 13, resize: 'vertical' }}
                      />
                    ) : (
                      <div
                        style={{ fontSize: 13, color: selectedTask.description ? 'var(--text-primary)' : 'var(--text-tertiary)', cursor: canEdit ? 'pointer' : 'default', whiteSpace: 'pre-wrap', lineHeight: 1.55, minHeight: 24 }}
                        onClick={() => { if (canEdit) { setEditField('description'); setEditValue(selectedTask.description || ''); } }}
                      >
                        {selectedTask.description || (canEdit ? 'Add a description...' : 'No description')}
                      </div>
                    )}
                  </DetailField>

                  {/* Custom columns */}
                  {columns.map(col => {
                    const val = selectedTask.columnValues?.[col._id] || '';
                    return (
                      <DetailField key={col._id} label={col.name}>
                        <span style={{ fontSize: 13, color: val ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                          {val || '—'}
                        </span>
                      </DetailField>
                    );
                  })}
                </div>

                {/* Delete */}
                {canEdit && (
                  <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border-light)' }}>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteTask(selectedTask._id)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                      Archive Task
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ========= Sub-components ========= */

function DetailField({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span style={{ fontSize: 12, color: 'var(--text-tertiary)', minWidth: 90, paddingTop: 3, fontWeight: 500 }}>{label}</span>
      <div style={{ flex: 1, fontSize: 13 }}>{children}</div>
    </div>
  );
}

function BadgeDisplay({ map, value, fallback }) {
  const info = map[value] || fallback;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
      <span className="status-dot" style={{ background: info.color }} />
      {info.label}
    </span>
  );
}

/* Portal-based dropdown matching the normal board's status dropdown */
function InlineDropdown({ items, value, onSelect }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const pos = useDropdownPos(open, btnRef);
  const info = items[value] || Object.values(items)[0];

  return (
    <>
      <div className="status-badge-btn" ref={btnRef} onClick={() => setOpen(!open)} style={{ '--status-color': info.color }}>
        <span className="status-dot" style={{ background: info.color }} />
        <span>{info.label}</span>
        <svg width="8" height="5" viewBox="0 0 8 5" fill="none" style={{ opacity: 0.35 }}><path d="M0.5 0.5L4 4L7.5 0.5" stroke="currentColor" strokeWidth="1" /></svg>
      </div>
      {open && createPortal(
        <>
          <div className="status-menu-backdrop" onClick={() => setOpen(false)} />
          <div className="status-dropdown-menu status-dropdown-portal" style={{ position: 'fixed', top: pos.top, left: pos.left }}>
            {Object.entries(items).map(([key, val]) => (
              <div key={key} className={`status-dropdown-item${key === value ? ' active' : ''}`} onClick={() => { onSelect(key); setOpen(false); }}>
                <span className="status-dot" style={{ background: val.color }} />
                <span>{val.label}</span>
                {key === value && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto' }}><polyline points="20 6 9 17 4 12" /></svg>
                )}
              </div>
            ))}
          </div>
        </>,
        document.body
      )}
    </>
  );
}

/* Table row using badge-button dropdowns like the normal board */
function PublicTaskRow({ task, columns, allStatuses, allPriorities, canEdit, isSelected, onStatusChange, onPriorityChange, onDelete, onClick }) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const statusRef = useRef(null);
  const priorityRef = useRef(null);
  const statusPos = useDropdownPos(showStatusMenu, statusRef);
  const priorityPos = useDropdownPos(showPriorityMenu, priorityRef);

  const sInfo = allStatuses[task.status] || STATUS_MAP.pending;
  const pInfo = allPriorities[task.priority] || PRIORITY_MAP.medium;
  const assignees = task.assignedTo || [];
  const initials = (name) => name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';

  return (
    <tr className={isSelected ? 'row-selected' : ''} style={{ '--row-priority-color': pInfo.color }}>
      <td className="task-title-cell" onClick={onClick}>
        <span className="task-title-text">{task.title}</span>
      </td>

      <td onClick={e => e.stopPropagation()}>
        {canEdit ? (
          <>
            <div className="status-badge-btn" ref={statusRef} onClick={() => setShowStatusMenu(!showStatusMenu)} style={{ '--status-color': sInfo.color }}>
              <span className="status-dot" style={{ background: sInfo.color }} />
              <span>{sInfo.label}</span>
              <svg width="8" height="5" viewBox="0 0 8 5" fill="none" style={{ opacity: 0.35 }}><path d="M0.5 0.5L4 4L7.5 0.5" stroke="currentColor" strokeWidth="1" /></svg>
            </div>
            {showStatusMenu && createPortal(
              <>
                <div className="status-menu-backdrop" onClick={() => setShowStatusMenu(false)} />
                <div className="status-dropdown-menu status-dropdown-portal" style={{ position: 'fixed', top: statusPos.top, left: statusPos.left }}>
                  {Object.entries(allStatuses).map(([key, val]) => (
                    <div key={key} className={`status-dropdown-item${key === task.status ? ' active' : ''}`} onClick={() => { onStatusChange(task._id, key); setShowStatusMenu(false); }}>
                      <span className="status-dot" style={{ background: val.color }} />
                      <span>{val.label}</span>
                      {key === task.status && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto' }}><polyline points="20 6 9 17 4 12" /></svg>}
                    </div>
                  ))}
                </div>
              </>,
              document.body
            )}
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', fontSize: 13 }}>
            <span className="status-dot" style={{ background: sInfo.color }} />
            <span>{sInfo.label}</span>
          </div>
        )}
      </td>

      <td onClick={e => e.stopPropagation()}>
        {canEdit ? (
          <>
            <div className="status-badge-btn" ref={priorityRef} onClick={() => setShowPriorityMenu(!showPriorityMenu)} style={{ '--status-color': pInfo.color }}>
              <span className="status-dot" style={{ background: pInfo.color }} />
              <span>{pInfo.label}</span>
              <svg width="8" height="5" viewBox="0 0 8 5" fill="none" style={{ opacity: 0.35 }}><path d="M0.5 0.5L4 4L7.5 0.5" stroke="currentColor" strokeWidth="1" /></svg>
            </div>
            {showPriorityMenu && createPortal(
              <>
                <div className="status-menu-backdrop" onClick={() => setShowPriorityMenu(false)} />
                <div className="status-dropdown-menu status-dropdown-portal" style={{ position: 'fixed', top: priorityPos.top, left: priorityPos.left }}>
                  {Object.entries(allPriorities).map(([key, val]) => (
                    <div key={key} className={`status-dropdown-item${key === task.priority ? ' active' : ''}`} onClick={() => { onPriorityChange(task._id, key); setShowPriorityMenu(false); }}>
                      <span className="status-dot" style={{ background: val.color }} />
                      <span>{val.label}</span>
                      {key === task.priority && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto' }}><polyline points="20 6 9 17 4 12" /></svg>}
                    </div>
                  ))}
                </div>
              </>,
              document.body
            )}
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', fontSize: 13 }}>
            <span className="status-dot" style={{ background: pInfo.color }} />
            <span>{pInfo.label}</span>
          </div>
        )}
      </td>

      <td>
        {assignees.length > 0 ? (
          <div className="avatar-group">
            {assignees.slice(0, 3).map(u => (
              <div key={u._id} className="user-avatar" title={u.name}>{initials(u.name)}</div>
            ))}
            {assignees.length > 3 && <div className="user-avatar" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>+{assignees.length - 3}</div>}
          </div>
        ) : <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>&mdash;</span>}
      </td>

      <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        {task.dueDate ? format(new Date(task.dueDate), 'MMM d, yyyy') : <span style={{ color: 'var(--text-tertiary)' }}>&mdash;</span>}
      </td>

      {columns.map(col => {
        const val = task.columnValues?.[col._id] || '';
        return (
          <td key={col._id} style={{ fontSize: 12, color: val ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
            {val || '—'}
          </td>
        );
      })}

      {canEdit && (
        <td onClick={e => e.stopPropagation()} className="row-action-cell">
          <button className="btn btn-ghost btn-xs" onClick={() => onDelete(task._id)} title="Archive" style={{ padding: 4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.8" strokeLinecap="round">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </button>
        </td>
      )}
    </tr>
  );
}
