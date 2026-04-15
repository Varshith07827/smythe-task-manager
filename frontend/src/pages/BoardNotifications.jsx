import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { boardsApi } from '../api/boards';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { motion } from 'framer-motion';
import { alert } from '../components/AlertSystem';

function initials(name) {
  return name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';
}

function statusLabel(s) {
  return String(s || '').replace(/_/g, ' ');
}

export default function BoardNotifications() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const socket = useSocket();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const canManage = user?.role === 'admin';

  const load = useCallback(async () => {
    try {
      const res = await boardsApi.getNotificationSchedule(boardId);
      setData(res.data);
    } catch {
      alert.error('Could not load notification schedule.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  useEffect(() => {
    if (!socket || !boardId) return;
    socket.emit('join:board', boardId);
    const onBoardUpdated = () => load();
    socket.on('board:updated', onBoardUpdated);
    return () => { socket.emit('leave:board', boardId); socket.off('board:updated', onBoardUpdated); };
  }, [socket, boardId, load]);

  const handleToggle = async (nextEnabled) => {
    if (!canManage) return;
    setToggling(true);
    try {
      const intervalHours = data?.schedule?.intervalHours || 4;
      await boardsApi.update(boardId, { progressDigest: { enabled: nextEnabled, intervalHours } });
      alert.success(nextEnabled ? 'Notifications enabled' : 'Notifications paused');
      await load();
    } catch {
      alert.error('Could not update this setting.');
    } finally {
      setToggling(false);
    }
  };

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;
  if (!data) return (
    <div className="empty-state">
      <h3>Project not found</h3>
      <p>This project may have been removed.</p>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/')}>Back to dashboard</button>
    </div>
  );

  const { schedule, recipients, emailDeliveryConfigured, boardTitle } = data;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="board-notifications-nav-row">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(`/boards/${boardId}`)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          Back to project
        </button>
        <Link to="/notifications" className="btn btn-ghost btn-sm">Notification center</Link>
      </div>

      <div className="page-section-header board-notifications-header">
        <div className="page-section-header-main">
          <h2 className="page-section-title">Project Notifications</h2>
          <p className="page-section-subtitle">
            {boardTitle} &mdash; every {schedule.intervalHours} hours, assignees get a task summary.
          </p>
        </div>
        {canManage && (
          <div className="board-notifications-schedule-toggle">
            <span className="board-notifications-schedule-label">{schedule.enabled ? 'Active' : 'Paused'}</span>
            <label className="board-notifications-switch-wrap">
              <input
                type="checkbox"
                className="sidebar-board-notification-switch"
                checked={!!schedule.enabled}
                disabled={toggling}
                onChange={e => handleToggle(e.target.checked)}
              />
            </label>
          </div>
        )}
      </div>

      {!emailDeliveryConfigured && (
        <div className="board-notifications-banner">
          Email delivery is not configured on the server. In-app summaries will still work.
        </div>
      )}

      {!schedule.enabled && (
        <div className="board-notifications-banner board-notifications-banner-muted">
          Notifications are paused. No summaries will be sent until an admin enables them.
        </div>
      )}

      <div className="card board-notifications-card">
        <h3 className="board-notifications-card-title">Recipients</h3>
        <p className="board-notifications-card-desc">
          People assigned to active tasks on this project. Delivery depends on each person's notification settings.
        </p>

        {recipients.length === 0 ? (
          <p className="board-notifications-empty">No assignees yet. Assign people to tasks to see them here.</p>
        ) : (
          <div className="board-notifications-table-wrap">
            <table className="task-table board-notifications-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Email</th>
                  <th>Tasks</th>
                  <th>Email</th>
                  <th>In-app</th>
                </tr>
              </thead>
              <tbody>
                {recipients.map(r => (
                  <tr key={r._id}>
                    <td>
                      <div className="board-notifications-person">
                        <div className="user-avatar board-notifications-avatar">{initials(r.name)}</div>
                        <span className="board-notifications-name">{r.name}</span>
                      </div>
                    </td>
                    <td className="board-notifications-email">{r.email || '—'}</td>
                    <td>
                      <span className="board-notifications-count">{r.taskCount}</span>
                      <ul className="board-notifications-task-list">
                        {r.tasks.map(t => (
                          <li key={t._id}>
                            <span className="board-notifications-task-title">{t.title}</span>
                            <span className="board-notifications-task-status">{statusLabel(t.status)}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td>
                      {r.optedOutOfBoardSummaries ? <span className="badge badge-cancelled">Opted out</span>
                        : r.emailNotificationsOff ? <span className="badge badge-pending">Off</span>
                        : !emailDeliveryConfigured ? <span className="badge badge-pending">No server</span>
                        : schedule.enabled && r.willReceiveEmail ? <span className="badge badge-completed">Yes</span>
                        : <span className="badge badge-pending">No</span>}
                    </td>
                    <td>
                      {r.optedOutOfBoardSummaries ? <span className="badge badge-cancelled">Opted out</span>
                        : schedule.enabled && r.willReceiveInApp ? <span className="badge badge-completed">Yes</span>
                        : <span className="badge badge-pending">No</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
}
