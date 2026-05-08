import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { boardsApi } from '../api/boards';
import { tasksApi } from '../api/tasks';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { alert } from '../components/AlertSystem';
import { motion, AnimatePresence } from 'framer-motion';
import TaskRow from '../components/TaskRow';
import TaskDetail from '../components/TaskDetail';
import CreateTaskModal from '../components/CreateTaskModal';
import ImportSpreadsheet from '../components/ImportSpreadsheet';
import ColumnManager from '../components/ColumnManager';
import StatusWorkflowModal from '../components/StatusWorkflowModal';
import Dropdown from '../components/Dropdown';
import { format } from 'date-fns';

const STATUS_OPTIONS = ['pending', 'in_progress', 'completed', 'blocked', 'cancelled'];
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'critical'];

const PRIORITY_COLORS = {
  low: 'var(--green)',
  medium: 'var(--teal)',
  high: 'var(--orange)',
  critical: 'var(--red)'
};

export default function BoardView() {
  const { boardId } = useParams();
  const { user } = useAuth();
  const socket = useSocket();
  const [board, setBoard] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showColumnManager, setShowColumnManager] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [selectedTasks, setSelectedTasks] = useState(new Set());
  const [total, setTotal] = useState(0);
  const [workflowTask, setWorkflowTask] = useState(null);
  const [workflowStatus, setWorkflowStatus] = useState(null);
  const [showSendReport, setShowSendReport] = useState(false);
  const [reportEmail, setReportEmail] = useState('');
  const [sendingReport, setSendingReport] = useState(false);

  // View mode: 'table' or 'list'
  const [viewMode, setViewMode] = useState(() => {
    try { return localStorage.getItem('smythe:boardViewMode') || 'table'; } catch { return 'table'; }
  });
  useEffect(() => { localStorage.setItem('smythe:boardViewMode', viewMode); }, [viewMode]);

  // Resizable task detail panel
  const [detailWidth, setDetailWidth] = useState(() => {
    try { return Number(localStorage.getItem('smythe:detailWidth')) || Math.round(window.innerWidth * 0.5); } catch { return Math.round(window.innerWidth * 0.5); }
  });
  const resizing = useRef(false);
  const handleResizeStart = (e) => {
    e.preventDefault();
    resizing.current = true;
    const startX = e.clientX;
    const startW = detailWidth;
    const onMove = (ev) => {
      if (!resizing.current) return;
      const diff = startX - ev.clientX;
      const newW = Math.min(Math.max(startW + diff, 340), window.innerWidth * 0.7);
      setDetailWidth(newW);
    };
    const onUp = () => {
      resizing.current = false;
      localStorage.setItem('smythe:detailWidth', String(detailWidth));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const isManager = user?.role === 'admin';

  const loadBoard = useCallback(async () => {
    try {
      const res = await boardsApi.getOne(boardId);
      setBoard(res.data);
    } catch {
      alert.error('Could not load this project.');
    }
  }, [boardId]);

  const loadTasks = useCallback(async () => {
    try {
      const params = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (priorityFilter) params.priority = priorityFilter;
      const res = await tasksApi.getAll(boardId, params);
      setTasks(res.data.tasks);
      setTotal(res.data.total);
    } catch {
      alert.error('Could not load tasks.');
    } finally {
      setLoading(false);
    }
  }, [boardId, search, statusFilter, priorityFilter]);

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => { setLoading(true); loadBoard(); loadTasks(); }, [loadBoard, loadTasks]);

  // Auto-open task from notification link (?task=taskId)
  useEffect(() => {
    const taskParam = searchParams.get('task');
    if (taskParam && tasks.length > 0) {
      const found = tasks.find(t => t._id === taskParam);
      if (found) {
        setSelectedTask(found);
        // Clean up the query param
        setSearchParams(prev => {
          const next = new URLSearchParams(prev);
          next.delete('task');
          return next;
        }, { replace: true });
      }
    }
  }, [searchParams, tasks, setSearchParams]);

  useEffect(() => {
    if (!socket || !boardId) return;
    socket.emit('join:board', boardId);
    const onTaskCreated = ({ task }) => setTasks(prev => {
      if (prev.some(t => t._id === task._id)) return prev;
      return [...prev, task];
    });
    const onTaskUpdated = ({ task }) => {
      setTasks(prev => prev.map(t => t._id === task._id ? task : t));
      if (selectedTask?._id === task._id) setSelectedTask(task);
    };
    const onTaskDeleted = ({ taskId }) => {
      setTasks(prev => prev.filter(t => t._id !== taskId));
      if (selectedTask?._id === taskId) setSelectedTask(null);
    };
    const onBulkUpdated = ({ taskIds, changes }) => {
      setTasks(prev => prev.map(t => taskIds.includes(t._id) ? { ...t, ...changes } : t));
    };
    const onBoardUpdated = ({ changes }) => setBoard(prev => ({ ...prev, ...changes }));

    socket.on('task:created', onTaskCreated);
    socket.on('task:updated', onTaskUpdated);
    socket.on('task:deleted', onTaskDeleted);
    socket.on('tasks:bulk_updated', onBulkUpdated);
    socket.on('board:updated', onBoardUpdated);
    return () => {
      socket.emit('leave:board', boardId);
      socket.off('task:created', onTaskCreated);
      socket.off('task:updated', onTaskUpdated);
      socket.off('task:deleted', onTaskDeleted);
      socket.off('tasks:bulk_updated', onBulkUpdated);
      socket.off('board:updated', onBoardUpdated);
    };
  }, [socket, boardId, selectedTask]);

  const handleTaskCreated = (task) => {
    setTasks(prev => prev.some(t => t._id === task._id) ? prev : [...prev, task]);
    setShowCreateTask(false);
  };
  const handleImported = () => { setShowImport(false); loadBoard(); loadTasks(); };

  const toggleTaskSelection = (taskId) => {
    setSelectedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedTasks(selectedTasks.size === tasks.length ? new Set() : new Set(tasks.map(t => t._id)));
  };

  const handleBulkStatus = async (status) => {
    try {
      await tasksApi.bulkStatus(boardId, { taskIds: [...selectedTasks], status, boardId });
      setTasks(prev => prev.map(t => selectedTasks.has(t._id) ? { ...t, status } : t));
      setSelectedTasks(new Set());
      alert.success(`${selectedTasks.size} task${selectedTasks.size > 1 ? 's' : ''} updated`);
    } catch {
      alert.error('Could not update tasks. Please try again.');
    }
  };

  const handleBulkArchive = async () => {
    try {
      await tasksApi.bulkArchive(boardId, { taskIds: [...selectedTasks], boardId });
      setTasks(prev => prev.filter(t => !selectedTasks.has(t._id)));
      setSelectedTasks(new Set());
      alert.success('Tasks archived');
    } catch {
      alert.error('Could not archive tasks.');
    }
  };

  const handleBulkDelete = async () => {
    try {
      await tasksApi.bulkDelete(boardId, { taskIds: [...selectedTasks], boardId });
      setTasks(prev => prev.filter(t => !selectedTasks.has(t._id)));
      setSelectedTasks(new Set());
      alert.success('Tasks deleted');
    } catch {
      alert.error('Could not delete tasks.');
    }
  };

  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const handleStatusWorkflow = (task, newStatus) => {
    setWorkflowTask(task); setWorkflowStatus(newStatus);
  };

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;
  if (!board) return <div className="empty-state"><h3>Project not found</h3><p>This project may have been removed or you don't have access.</p></div>;

  const columns = (board.columns || []).filter(c => c.visible !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // Build custom status/priority maps from board settings
  const customStatusMap = {};
  (board.customStatuses || []).forEach(s => { customStatusMap[s.value || s.name?.toLowerCase().replace(/\s+/g, '_')] = { color: s.color || 'var(--accent)', label: s.name || s.label }; });
  const customPriorityMap = {};
  (board.customPriorities || []).forEach(p => { customPriorityMap[p.value || p.name?.toLowerCase().replace(/\s+/g, '_')] = { color: p.color || 'var(--teal)', label: p.name || p.label }; });

  const allPriorityColors = { ...PRIORITY_COLORS };
  (board.customPriorities || []).forEach(p => {
    const val = p.value || p.name?.toLowerCase().replace(/\s+/g, '_');
    allPriorityColors[val] = p.color || 'var(--teal)';
  });

  const DEFAULT_STATUS_DOTS = {
    pending: { color: 'var(--accent)', label: 'Pending' },
    in_progress: { color: 'var(--orange)', label: 'In Progress' },
    completed: { color: 'var(--green)', label: 'Completed' },
    blocked: { color: 'var(--red)', label: 'Blocked' },
    cancelled: { color: 'var(--text-tertiary)', label: 'Cancelled' }
  };
  const DEFAULT_PRIORITY_DOTS = {
    low: { color: 'var(--green)', label: 'Low' },
    medium: { color: 'var(--teal)', label: 'Medium' },
    high: { color: 'var(--orange)', label: 'High' },
    critical: { color: 'var(--red)', label: 'Critical' }
  };
  const allStatuses = { ...DEFAULT_STATUS_DOTS, ...customStatusMap };
  const allPriorities = { ...DEFAULT_PRIORITY_DOTS, ...customPriorityMap };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      {/* Board Header — compact single row */}
      <div className="page-section-header">
        <div className="page-section-header-main">
          <h2 className="page-section-title">{board.title}</h2>
        </div>
      </div>

      {/* Toolbar — search, filters, view toggle, actions all in one row */}
      <div className="toolbar-panel">
        <div className="toolbar">
          <input
            className="search-input"
            placeholder="Search tasks..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search tasks"
            style={{ maxWidth: 200 }}
          />
          <div className="toolbar-filters">
            <select className="toolbar-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filter by status">
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
            <select className="toolbar-select" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} aria-label="Filter by priority">
              <option value="">All priorities</option>
              {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <span className="toolbar-count">{total} task{total !== 1 ? 's' : ''}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="view-toggle">
              <button type="button" className={`view-toggle-btn${viewMode === 'table' ? ' active' : ''}`} onClick={() => setViewMode('table')} title="Table view">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" /></svg>
              </button>
              <button type="button" className={`view-toggle-btn${viewMode === 'list' ? ' active' : ''}`} onClick={() => setViewMode('list')} title="List view">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
              </button>
            </div>
            {isManager && (
              <Dropdown
                buttonClassName="btn btn-secondary btn-sm"
                align="end"
                buttonContent={
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
                  </>
                }
              >
                {(close) => (
                  <>
                    <button type="button" className="dropdown-item" onClick={() => { setShowImport(true); close(); }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                      Import
                    </button>
                    <button type="button" className="dropdown-item" onClick={() => { setShowColumnManager(true); close(); }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18" /></svg>
                      Manage Form Fields
                    </button>
                    <div className="dropdown-divider" />
                    <button type="button" className="dropdown-item" onClick={() => { setShowSendReport(true); close(); }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                      Send report via email
                    </button>
                  </>
                )}
              </Dropdown>
            )}
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowCreateTask(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              New
            </button>
          </div>
        </div>
      </div>

      {/* Bulk actions */}
      <AnimatePresence>
        {selectedTasks.size > 0 && (
          <motion.div
            className="bulk-bar"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <span className="bulk-bar-count">{selectedTasks.size} selected</span>
            <Dropdown
              buttonClassName="btn btn-sm btn-secondary"
              align="end"
              buttonContent={<>Set status <svg className="dropdown-chevron" width="10" height="10" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg></>}
            >
              {(close) => STATUS_OPTIONS.map(s => (
                <button key={s} type="button" className="dropdown-item" onClick={() => { handleBulkStatus(s); close(); }}>
                  {s.replace('_', ' ')}
                </button>
              ))}
            </Dropdown>
            {isManager && <button type="button" className="btn btn-sm btn-danger" onClick={handleBulkArchive}>Archive</button>}
            {isManager && <button type="button" className="btn btn-sm btn-danger" onClick={() => setConfirmBulkDelete(true)}>Delete</button>}
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSelectedTasks(new Set())}>Clear</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Task Content */}
      {tasks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </div>
          <h3>No items yet</h3>
          <p>Create your first item or import from a spreadsheet</p>
          <div className="empty-state-actions">
            <button type="button" className="btn btn-primary" onClick={() => setShowCreateTask(true)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg> New</button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowImport(true)}>Import</button>
          </div>
        </div>
      ) : viewMode === 'table' ? (
        /* ========== TABLE VIEW ========== */
        <div className="task-table-wrap">
          <table className="task-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <div className={`checkbox ${selectedTasks.size === tasks.length ? 'checked' : ''}`} onClick={toggleSelectAll}>
                    {selectedTasks.size === tasks.length && (
                      <svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4.5L4 7.5L10 1.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    )}
                  </div>
                </th>
                <th>Title</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Assigned</th>
                <th>Due Date</th>
                {columns.map(col => <th key={col._id}>{col.name}</th>)}
                <th className="task-table-actions-col" />
              </tr>
            </thead>
            <tbody>
              {tasks.map(task => (
                <TaskRow
                  key={task._id}
                  task={task}
                  columns={columns}
                  selected={selectedTasks.has(task._id)}
                  onToggle={() => toggleTaskSelection(task._id)}
                  onClick={() => setSelectedTask(task)}
                  boardId={boardId}
                  onUpdated={(updated) => setTasks(prev => prev.map(t => t._id === updated._id ? updated : t))}
                  onDeleted={(taskId) => setTasks(prev => prev.filter(t => t._id !== taskId))}
                  onStatusWorkflow={handleStatusWorkflow}
                  customStatuses={customStatusMap}
                  customPriorities={customPriorityMap}
                  onBoardUpdated={loadBoard}
                  isManager={isManager}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* ========== LIST / CARD VIEW ========== */
        <div className="task-list-view">
          {tasks.map(task => {
            const priorityColor = allPriorityColors[task.priority] || 'var(--teal)';
            const statusInfo = allStatuses[task.status] || DEFAULT_STATUS_DOTS.pending;
            const priorityInfo = allPriorities[task.priority] || DEFAULT_PRIORITY_DOTS.medium;
            const assignees = task.assignedTo || [];
            const initials = (name) => name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';
            return (
              <motion.div
                key={task._id}
                className="task-list-card"
                onClick={() => setSelectedTask(task)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ '--priority-color': priorityColor }}
              >
                <div className="task-list-card-priority-bar" style={{ background: priorityColor }} />
                <div className="task-list-card-body">
                  <div className="task-list-card-top">
                    <div className={`checkbox ${selectedTasks.has(task._id) ? 'checked' : ''}`} onClick={e => { e.stopPropagation(); toggleTaskSelection(task._id); }}>
                      {selectedTasks.has(task._id) && <svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4.5L4 7.5L10 1.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </div>
                    <span className="task-list-card-title">{task.title}</span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto', flexShrink: 0 }}>
                      <span className="status-badge-btn" style={{ '--status-color': statusInfo.color, padding: '3px 8px', fontSize: 11 }}>
                        <span className="status-dot" style={{ background: statusInfo.color, width: 6, height: 6 }} />
                        {statusInfo.label}
                      </span>
                      <span className="status-badge-btn" style={{ '--status-color': priorityInfo.color, padding: '3px 8px', fontSize: 11 }}>
                        <span className="status-dot" style={{ background: priorityInfo.color, width: 6, height: 6 }} />
                        {priorityInfo.label}
                      </span>
                    </div>
                  </div>
                  <div className="task-list-card-bottom">
                    {assignees.length > 0 && (
                      <div className="avatar-group" style={{ '--avatar-size': '22px' }}>
                        {assignees.slice(0, 3).map(u => (
                          <div key={u._id} className="user-avatar" style={{ width: 22, height: 22, fontSize: 8 }} title={u.name}>{initials(u.name)}</div>
                        ))}
                        {assignees.length > 3 && <div className="user-avatar" style={{ width: 22, height: 22, fontSize: 8, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>+{assignees.length - 3}</div>}
                      </div>
                    )}
                    {task.dueDate && (
                      <span className="task-list-card-due">{format(new Date(task.dueDate), 'MMM d')}</span>
                    )}
                    {task.comments?.length > 0 && (
                      <span className="task-list-card-meta">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                        {task.comments.length}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Task Detail Slide-over with blur backdrop */}
      <AnimatePresence>
        {selectedTask && (
          <>
            <motion.div
              className="task-detail-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <TaskDetail
              task={selectedTask}
              board={board}
              boardId={boardId}
              onClose={() => setSelectedTask(null)}
              onUpdated={(updated) => {
                setSelectedTask(updated);
                setTasks(prev => prev.map(t => t._id === updated._id ? updated : t));
              }}
              panelWidth={detailWidth}
              onResizeStart={handleResizeStart}
              onBoardUpdated={loadBoard}
            />
          </>
        )}
      </AnimatePresence>

      {showCreateTask && (
        <CreateTaskModal
          boardId={boardId}
          columns={board.columns}
          customPriorities={board.customPriorities}
          onClose={() => setShowCreateTask(false)}
          onCreated={handleTaskCreated}
        />
      )}

      {showColumnManager && (
        <ColumnManager
          board={board} boardId={boardId} userRole={user?.role}
          onClose={() => setShowColumnManager(false)}
          onBoardUpdated={loadBoard}
        />
      )}

      {workflowTask && workflowStatus && (
        <StatusWorkflowModal
          task={workflowTask} boardId={boardId} newStatus={workflowStatus}
          onClose={() => { setWorkflowTask(null); setWorkflowStatus(null); }}
          onUpdated={(updated) => {
            setTasks(prev => prev.map(t => t._id === updated._id ? updated : t));
            if (selectedTask?._id === updated._id) setSelectedTask(updated);
          }}
        />
      )}

      {showSendReport && (
        <div className="modal-overlay">
          <motion.div
            className="modal"
            onClick={e => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 400 }}
            style={{ maxWidth: 420 }}
          >
            <div className="modal-header">
              <h3>Send Progress Report</h3>
              <button className="modal-close" onClick={() => setShowSendReport(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="modal-body" style={{ padding: '16px 24px 24px' }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
                Send a summary of all tasks in <strong>{board.title}</strong> to an email address.
              </p>
              <label className="form-label" style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, display: 'block' }}>Recipient email</label>
              <input
                className="form-input"
                type="email"
                placeholder="name@company.com"
                value={reportEmail}
                onChange={e => setReportEmail(e.target.value)}
                autoFocus
                style={{ marginBottom: 16 }}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowSendReport(false)}>Cancel</button>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={!reportEmail.trim() || sendingReport}
                  onClick={async () => {
                    setSendingReport(true);
                    try {
                      await boardsApi.sendProgressReport(boardId, reportEmail.trim());
                      alert.success(`Report sent to ${reportEmail.trim()}`);
                      setShowSendReport(false);
                      setReportEmail('');
                    } catch {
                      alert.error('Could not send report. Check email settings.');
                    } finally {
                      setSendingReport(false);
                    }
                  }}
                >
                  {sendingReport ? 'Sending...' : 'Send Report'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {showImport && (
        <div className="modal-overlay">
          <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: 860 }}>
            <div className="modal-header">
              <h3>Import from Spreadsheet</h3>
              <button className="modal-close" onClick={() => setShowImport(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <ImportSpreadsheet existingBoardId={boardId} onImported={handleImported} />
            </div>
          </div>
        </div>
      )}

      {confirmBulkDelete && (
        <div className="modal-overlay">
          <motion.div
            className="modal"
            onClick={e => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 400 }}
            style={{ maxWidth: 400 }}
          >
            <div className="modal-header">
              <h3>Delete Tasks</h3>
              <button className="modal-close" onClick={() => setConfirmBulkDelete(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="modal-body" style={{ padding: '16px 24px 24px' }}>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 20 }}>
                Permanently delete <strong>{selectedTasks.size}</strong> task{selectedTasks.size !== 1 ? 's' : ''}? This cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setConfirmBulkDelete(false)}>Cancel</button>
                <button className="btn btn-danger btn-sm" onClick={() => { setConfirmBulkDelete(false); handleBulkDelete(); }}>Delete</button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
