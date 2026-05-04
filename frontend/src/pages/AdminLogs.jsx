import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { boardsApi } from '../api/boards';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { alert } from '../components/AlertSystem';
import { motion } from 'framer-motion';

export default function AdminLogs() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const socket = useSocket();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [searchUser, setSearchUser] = useState('');
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [debouncedUser, setDebouncedUser] = useState('');

  // Redirect non-admins
  useEffect(() => {
    if (user && user.role !== 'admin') navigate('/');
  }, [user, navigate]);

  // Debounce search inputs
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchText), 400);
    return () => clearTimeout(t);
  }, [searchText]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedUser(searchUser), 400);
    return () => clearTimeout(t);
  }, [searchUser]);

  const loadLogs = useCallback(async () => {
    try {
      const params = { page, limit: 25 };
      if (debouncedSearch) params.search = debouncedSearch;
      if (debouncedUser) params.user = debouncedUser;
      const res = await boardsApi.getGlobalActivity(params);
      setLogs(res.data.logs);
      setTotal(res.data.total);
      setPages(res.data.pages);
    } catch {
      alert.error('Failed to load logs');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, debouncedUser]);

  useEffect(() => { setLoading(true); loadLogs(); }, [loadLogs]);

  // Auto-refresh on real-time events
  useEffect(() => {
    if (!socket) return;
    const refresh = () => { if (page === 1) loadLogs(); };
    socket.on('activity:logged', refresh);
    return () => { socket.off('activity:logged', refresh); };
  }, [socket, page, loadLogs]);

  const getActionIcon = (action) => {
    const svgProps = { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' };
    const icons = {
      task_created: { icon: <svg {...svgProps}><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>, color: 'var(--teal)' },
      task_updated: { icon: <svg {...svgProps}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>, color: 'var(--orange)' },
      status_changed: { icon: <svg {...svgProps}><polyline points="23 4 23 10 17 10"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10"/></svg>, color: 'var(--accent)' },
      task_deleted: { icon: <svg {...svgProps}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>, color: 'var(--red)' },
      task_archived: { icon: <svg {...svgProps}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>, color: 'var(--red)' },
      comment_added: { icon: <svg {...svgProps}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>, color: 'var(--purple, #8b5cf6)' },
      board_created: { icon: <svg {...svgProps}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>, color: 'var(--yellow)' },
      board_updated: { icon: <svg {...svgProps}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>, color: 'var(--yellow)' },
      task_assigned: { icon: <svg {...svgProps}><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg>, color: 'var(--teal)' },
    };
    return icons[action] || { icon: <svg {...svgProps}><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/></svg>, color: 'var(--text-tertiary)' };
  };

  const initials = (name) => name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';

  if (loading && logs.length === 0) return <div className="loading-spinner"><div className="spinner" /></div>;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="page-section-header">
        <div className="page-section-header-main">
          <h2 className="page-section-title">Global Logs</h2>
          <p className="page-section-subtitle">Activity across all users and projects ({total} total)</p>
        </div>
      </div>

      {/* Search filters */}
      <div className="toolbar-panel">
        <div className="toolbar">
          <input
            className="search-input"
            placeholder="Search by user name..."
            value={searchUser}
            onChange={e => { setSearchUser(e.target.value); setPage(1); }}
            style={{ maxWidth: 200 }}
          />
          <input
            className="search-input"
            placeholder="Search log text / project / task..."
            value={searchText}
            onChange={e => { setSearchText(e.target.value); setPage(1); }}
            style={{ maxWidth: 280 }}
          />
          <span className="toolbar-count">{total} log{total !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="empty-state">
          <h3>No logs found</h3>
          <p>Activity logs will appear here as users interact with the system</p>
        </div>
      ) : (
        <>
          <div className="task-table-wrap">
            <table className="task-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }} />
                  <th>User</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Project</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => {
                  const { icon, color } = getActionIcon(log.action);
                  return (
                    <tr key={log._id || i}>
                      <td style={{ textAlign: 'center', color }}>{icon}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="user-avatar" style={{ width: 24, height: 24, fontSize: 9, flexShrink: 0 }}>
                            {initials(log.user?.name)}
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 550 }}>{log.user?.name || 'System'}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{log.user?.email || ''}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: 12, color, fontWeight: 550 }}>
                          {log.action?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: 13 }}>{log.target?.name || '—'}</span>
                      </td>
                      <td>
                        {log.board ? (
                          <button
                            className="btn btn-ghost btn-xs"
                            onClick={() => navigate(`/boards/${log.board._id || log.board}`)}
                            style={{ fontSize: 12, padding: '2px 6px' }}
                          >
                            {log.board?.title || 'View'}
                          </button>
                        ) : '—'}
                      </td>
                      <td>
                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                          {log.createdAt ? new Date(log.createdAt).toLocaleString() : ''}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20, paddingBottom: 20 }}>
              <button
                className="btn btn-secondary btn-sm"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                Previous
              </button>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', alignSelf: 'center' }}>
                Page {page} of {pages}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                disabled={page >= pages}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
