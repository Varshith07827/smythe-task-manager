import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { boardsApi } from '../api/boards';
import { tasksApi } from '../api/tasks';
import { usersApi } from '../api/users';
import { useSocket } from '../context/SocketContext';
import { alert } from '../components/AlertSystem';

// Check if a string looks like a MongoDB ObjectId
const isObjectId = (str) => typeof str === 'string' && /^[a-f0-9]{24}$/.test(str);

export default function BoardActivity() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const socket = useSocket();
  const [board, setBoard] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [bRes, aRes] = await Promise.all([
        boardsApi.getOne(boardId),
        boardsApi.getActivity(boardId)
      ]);
      setBoard(bRes.data);
      setActivity(aRes.data?.activities || aRes.data || []);
    } catch {
      alert.error('Failed to load activity');
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh logs when tasks are created/updated/deleted or status changes
  useEffect(() => {
    if (!socket || !boardId) return;
    socket.emit('join:board', boardId);
    const refresh = () => loadData();
    socket.on('task:created', refresh);
    socket.on('task:updated', refresh);
    socket.on('task:deleted', refresh);
    socket.on('tasks:bulk_updated', refresh);
    socket.on('board:updated', refresh);
    socket.on('activity:logged', refresh);
    return () => {
      socket.emit('leave:board', boardId);
      socket.off('task:created', refresh);
      socket.off('task:updated', refresh);
      socket.off('task:deleted', refresh);
      socket.off('tasks:bulk_updated', refresh);
      socket.off('board:updated', refresh);
      socket.off('activity:logged', refresh);
    };
  }, [socket, boardId, loadData]);

  // Build column ID → name map for resolving hashes in old logs
  const colMap = useMemo(() => {
    const map = {};
    if (board?.columns) {
      for (const col of board.columns) {
        map[(col._id || col.id || '').toString()] = col.name;
      }
    }
    return map;
  }, [board]);

  const getTaskId = (entry) => {
    if (typeof entry.task === 'string') return entry.task;
    if (entry.task?.id) return entry.task.id;
    return entry.target?.id || null;
  };

  const getOldValue = (change) => change.oldValue !== undefined ? change.oldValue : change.from;
  const getNewValue = (change) => change.newValue !== undefined ? change.newValue : change.to;

  // Format a value for display - resolve hashes to column names
  const formatValue = (val) => {
    if (val === null || val === undefined) return '(empty)';
    if (typeof val !== 'object') return String(val);

    // If it's an object (like columnValues), resolve keys to column names
    if (!Array.isArray(val)) {
      const entries = Object.entries(val);
      if (entries.length === 0) return '(empty)';
      return entries.map(([k, v]) => {
        const name = colMap[k] || (isObjectId(k) ? `col:${k.slice(-6)}` : k);
        const display = v === null || v === undefined ? '(empty)' : String(v);
        return `${name}: ${display}`;
      }).join(', ');
    }

    return JSON.stringify(val);
  };

  // Format field name - resolve hashes
  const formatFieldName = (field) => {
    if (field === 'columnValues') return 'Column Values';
    if (isObjectId(field)) return colMap[field] || `col:${field.slice(-6)}`;
    return field.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
  };

  // Expand columnValues changes into readable sub-changes
  const expandChanges = (changes) => {
    if (!changes?.length) return [];
    const expanded = [];

    for (const change of changes) {
      if (change.field === 'columnValues') {
        const fromObj = (getOldValue(change)) || {};
        const toObj = (getNewValue(change)) || {};
        if (typeof fromObj === 'object' && typeof toObj === 'object' && !Array.isArray(fromObj)) {
          const allKeys = new Set([...Object.keys(fromObj), ...Object.keys(toObj)]);
          for (const key of allKeys) {
            const oldV = fromObj[key];
            const newV = toObj[key];
            if (JSON.stringify(oldV) !== JSON.stringify(newV)) {
              expanded.push({
                field: colMap[key] || (isObjectId(key) ? `col:${key.slice(-6)}` : key),
                from: oldV,
                to: newV
              });
            }
          }
          continue;
        }
      }
      expanded.push(change);
    }
    return expanded;
  };

  const canRestore = (entry) => {
    const taskId = getTaskId(entry);
    if (entry.action === 'task_updated' && entry.changes?.length > 0 && taskId) return true;
    if (entry.action === 'status_changed' && taskId) return true;
    if (entry.action === 'user_removed' && entry.target?.id) return true;
    return false;
  };

  const handleRestore = async (entry) => {
    if (!entry.changes?.length && !entry.target) {
      alert.error('Nothing to restore from this entry');
      return;
    }

    const action = entry.action;
    setRestoring(entry._id || entry.id);

    const taskId = getTaskId(entry);

    try {
      if (action === 'task_updated' && entry.changes?.length > 0 && taskId) {
        const revertData = {};
        for (const change of entry.changes) {
          const oldVal = getOldValue(change);
          if (change.field && oldVal !== undefined) {
            revertData[change.field] = oldVal;
          }
        }
        if (Object.keys(revertData).length > 0) {
          await tasksApi.update(boardId, taskId, revertData);
          alert.success('Changes reverted');
          loadData();
          return;
        }
      }

      if (action === 'status_changed' && taskId) {
        const statusChange = entry.changes?.find(c => c.field === 'status');
        const oldStatus = getOldValue(statusChange);
        if (oldStatus) {
          await tasksApi.update(boardId, taskId, { status: oldStatus });
          alert.success(`Status reverted to "${oldStatus}"`);
          loadData();
          return;
        }
      }

      if (action === 'user_removed' && entry.target?.id) {
        await usersApi.restoreUser(entry.target.id);
        alert.success(`Restored ${entry.target?.name || 'user'}`);
        loadData();
        return;
      }

      alert.error('Cannot auto-restore this action');
    } catch (err) {
      alert.error('Failed to restore: ' + (err.response?.data?.error || err.message));
    } finally {
      setRestoring(null);
    }
  };

  const getActionIcon = (action) => {
    const svgProps = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' };
    switch (action) {
      case 'task_created': return {
        icon: <svg {...svgProps}><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>,
        color: 'var(--teal)'
      };
      case 'task_updated': return {
        icon: <svg {...svgProps}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
        color: 'var(--orange)'
      };
      case 'status_changed': return {
        icon: <svg {...svgProps}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>,
        color: 'var(--accent)'
      };
      case 'task_deleted': case 'task_archived': return {
        icon: <svg {...svgProps}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>,
        color: 'var(--red)'
      };
      case 'board_created': case 'board_updated': return {
        icon: <svg {...svgProps}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/></svg>,
        color: 'var(--yellow)'
      };
      case 'comment_added': case 'comment_edited': return {
        icon: <svg {...svgProps}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
        color: 'var(--purple, #8b5cf6)'
      };
      case 'task_assigned': case 'task_unassigned': case 'bulk_assign': return {
        icon: <svg {...svgProps}><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg>,
        color: 'var(--teal)'
      };
      case 'attachment_uploaded': case 'attachment_deleted': return {
        icon: <svg {...svgProps}><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>,
        color: 'var(--teal)'
      };
      case 'column_added': case 'column_removed': case 'column_updated': return {
        icon: <svg {...svgProps}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/></svg>,
        color: 'var(--accent)'
      };
      case 'user_invited': case 'user_removed': case 'role_changed': return {
        icon: <svg {...svgProps}><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><circle cx="20" cy="7" r="4"/></svg>,
        color: 'var(--purple, #8b5cf6)'
      };
      case 'bulk_update': case 'bulk_status_change': return {
        icon: <svg {...svgProps}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>,
        color: 'var(--accent)'
      };
      case 'board_archived': case 'board_deleted': return {
        icon: <svg {...svgProps}><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5" rx="1"/><line x1="10" y1="12" x2="14" y2="12"/></svg>,
        color: 'var(--text-tertiary)'
      };
      default: return {
        icon: <svg {...svgProps}><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/></svg>,
        color: 'var(--text-tertiary)'
      };
    }
  };

  if (loading) return (
    <div className="page-loader">
      <div className="spinner" />
      <span className="page-loader-text">Loading activity...</span>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/boards/${boardId}`)} style={{ marginBottom: 8 }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" d="M15 8a.5.5 0 00-.5-.5H2.707l3.147-3.146a.5.5 0 10-.708-.708l-4 4a.5.5 0 000 .708l4 4a.5.5 0 00.708-.708L2.707 8.5H14.5A.5.5 0 0015 8z"/></svg>
            Back to Project
          </button>
          <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{board?.title} — Activity Log</h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{activity.length} logged actions</p>
        </div>
      </div>

      {activity.length === 0 ? (
        <div className="empty-state">
          <h3>No activity yet</h3>
          <p>Actions on this project will appear here</p>
        </div>
      ) : (
        <div className="activity-timeline">
          {activity.map((entry, i) => {
            const { icon, color } = getActionIcon(entry.action);
            const restorable = canRestore(entry);
            const displayChanges = expandChanges(entry.changes);
            return (
              <div key={entry._id || i} className="timeline-item">
                <div className="timeline-line" />
                <div className="timeline-dot" style={{ background: color, color: 'white' }}>{icon}</div>
                <div className="timeline-content">
                  <div className="timeline-header">
                    <div>
                      <span className="timeline-user">{entry.user?.name || 'System'}</span>
                      <span className="timeline-action">{entry.action?.replace(/_/g, ' ')}</span>
                      {entry.target?.name && <span className="timeline-target">"{entry.target.name}"</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {restorable && (
                        <button
                          className="btn btn-xs btn-secondary"
                          onClick={() => handleRestore(entry)}
                          disabled={restoring === (entry._id || entry.id)}
                        >
                          {restoring === (entry._id || entry.id) ? 'Restoring...' : 'Restore'}
                        </button>
                      )}
                      <span className="timeline-time">
                        {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ''}
                      </span>
                    </div>
                  </div>

                  {displayChanges.length > 0 && (
                    <div className="timeline-changes">
                      {displayChanges.map((c, j) => {
                        const oldVal = getOldValue(c);
                        const newVal = getNewValue(c);
                        return (
                          <div key={j} className="timeline-change-row">
                            <span className="timeline-field">{formatFieldName(c.field)}</span>
                            {oldVal !== undefined && oldVal !== null && (
                              <span className="activity-old">{formatValue(oldVal)}</span>
                            )}
                            <span className="activity-arrow">→</span>
                            {newVal !== undefined && newVal !== null && (
                              <span className="activity-new">{formatValue(newVal)}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
