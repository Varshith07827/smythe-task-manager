import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { boardsApi } from '../api/boards';
import { useAuth } from '../context/AuthContext';
import { roleLabel } from '../utils/roleLabels';
import { emitPinChange, onPinChange } from '../utils/pinEvents';
import { formatDistanceToNow } from 'date-fns';
import { alert, useConfirm } from '../components/AlertSystem';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid
} from 'recharts';
import CreateBoardModal from '../components/CreateBoardModal';
import ImportSpreadsheet from '../components/ImportSpreadsheet';
import Dropdown from '../components/Dropdown';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } }
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } }
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [boards, setBoards] = useState([]);
  const [archivedBoards, setArchivedBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showStats, setShowStats] = useState(() => {
    try { return JSON.parse(localStorage.getItem('smythe:showStats')) === true; } catch { return false; }
  });
  const pinKey = `smythe:pinnedBoards:${user?._id || 'default'}`;
  const [pinnedBoardIds, setPinnedBoardIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem(pinKey)) || []; } catch { return []; }
  });

  const togglePinBoard = (e, boardId) => {
    e.stopPropagation();
    setPinnedBoardIds(prev => {
      if (prev.includes(boardId)) {
        const next = prev.filter(id => id !== boardId);
        localStorage.setItem(pinKey, JSON.stringify(next));
        setTimeout(emitPinChange, 0);
        return next;
      }
      if (prev.length >= 5) {
        alert.error('Maximum 5 pinned projects');
        return prev;
      }
      const next = [...prev, boardId];
      localStorage.setItem(pinKey, JSON.stringify(next));
      setTimeout(emitPinChange, 0);
      return next;
    });
  };

  const orderKey = `smythe:boardOrder:${user?._id || 'default'}`;
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);
  const [dragFromIdx, setDragFromIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  const handleDragStart = (index) => { dragItem.current = index; setDragFromIdx(index); };
  const handleDragEnter = (index) => { dragOverItem.current = index; setDragOverIdx(index); };
  const handleDragEnd = () => {
    if (dragItem.current === null || dragOverItem.current === null || dragItem.current === dragOverItem.current) {
      dragItem.current = null; dragOverItem.current = null;
      setDragFromIdx(null); setDragOverIdx(null);
      return;
    }
    const reordered = [...boards];
    const [removed] = reordered.splice(dragItem.current, 1);
    reordered.splice(dragOverItem.current, 0, removed);
    setBoards(reordered);
    localStorage.setItem(orderKey, JSON.stringify(reordered.map(b => b._id)));
    dragItem.current = null;
    dragOverItem.current = null;
    setDragFromIdx(null); setDragOverIdx(null);
  };

  const applyStoredOrder = useCallback((boardList) => {
    try {
      const stored = JSON.parse(localStorage.getItem(orderKey));
      if (!Array.isArray(stored) || stored.length === 0) return boardList;
      const orderMap = new Map(stored.map((id, i) => [id, i]));
      return [...boardList].sort((a, b) => {
        const ai = orderMap.has(a._id) ? orderMap.get(a._id) : 9999;
        const bi = orderMap.has(b._id) ? orderMap.get(b._id) : 9999;
        return ai - bi;
      });
    } catch { return boardList; }
  }, [orderKey]);

  useEffect(() => { loadBoards(); }, []);
  useEffect(() => { localStorage.setItem('smythe:showStats', JSON.stringify(showStats)); }, [showStats]);

  // Sync pins when changed from sidebar
  useEffect(() => {
    return onPinChange(() => {
      try { setPinnedBoardIds(JSON.parse(localStorage.getItem(pinKey)) || []); } catch {}
    });
  }, [pinKey]);

  const loadBoards = async () => {
    try {
      const res = await boardsApi.getAll();
      setBoards(applyStoredOrder(res.data));
    } catch {
      alert.error('Unable to load your projects. Please refresh.');
    } finally {
      setLoading(false);
    }
  };

  const loadArchived = async () => {
    try {
      const res = await boardsApi.getArchived();
      setArchivedBoards(res.data);
    } catch {
      alert.error('Could not load archived projects.');
    }
  };

  const handleToggleArchived = () => {
    const next = !showArchived;
    setShowArchived(next);
    if (next) loadArchived();
  };

  const handleBoardCreated = (board) => {
    setBoards(prev => [board, ...prev]);
    setShowCreate(false);
    navigate(`/boards/${board._id}`);
  };

  const handleImported = (boardId) => {
    setShowImport(false);
    if (boardId) navigate(`/boards/${boardId}`);
    else loadBoards();
  };

  const handleArchiveBoard = async (e, boardId, boardTitle) => {
    e.stopPropagation();
    if (!(await confirm({
      title: 'Archive Project',
      message: `"${boardTitle}" will be archived and hidden from the dashboard. You can restore it later.`,
      confirmText: 'Archive',
      variant: 'danger'
    }))) return;
    try {
      await boardsApi.archive(boardId);
      setBoards(prev => prev.filter(b => b._id !== boardId));
      alert.success('Project archived');
    } catch {
      alert.error('Could not archive project.');
    }
  };

  const handleDeleteBoard = async (e, boardId, boardTitle) => {
    e.stopPropagation();
    if (!(await confirm({
      title: 'Permanently Delete Project',
      message: `This will permanently delete "${boardTitle}" and all its tasks. This action cannot be undone.`,
      confirmText: 'Delete Forever',
      variant: 'danger'
    }))) return;
    try {
      await boardsApi.delete(boardId);
      setArchivedBoards(prev => prev.filter(b => b._id !== boardId));
      alert.success('Project permanently deleted');
    } catch {
      alert.error('Could not delete project.');
    }
  };

  const handleRestoreBoard = async (e, boardId) => {
    e.stopPropagation();
    try {
      await boardsApi.restore(boardId);
      setArchivedBoards(prev => prev.filter(b => b._id !== boardId));
      loadBoards();
      alert.success('Project restored');
    } catch {
      alert.error('Could not restore project.');
    }
  };

  const stats = useMemo(() => {
    const total = boards.length;
    const totalColumns = boards.reduce((sum, b) => sum + (b.columns?.length || 0), 0);
    return { total, totalColumns };
  }, [boards]);

  const statusData = useMemo(() => {
    return [
      { name: 'Active', value: boards.length || 1, color: '#6366f1' },
      { name: 'Archived', value: archivedBoards.length || 0, color: '#9ca3af' },
    ].filter(d => d.value > 0);
  }, [boards, archivedBoards]);

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;

  return (
    <motion.div variants={container} initial="hidden" animate="show">
      {/* Header */}
      <motion.div variants={item} className="page-section-header">
        <div className="page-section-header-main">
          <h2 className="page-section-title page-section-title-lg">My Workspace</h2>
        </div>
        <div className="page-section-actions">
          <Dropdown
            buttonClassName="btn btn-primary"
            align="end"
            buttonContent={
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                New
                <svg className="dropdown-chevron" width="10" height="10" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
              </>
            }
          >
            {(close) => (
              <>
                <button type="button" className="dropdown-item" onClick={() => { setShowCreate(true); close(); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/></svg>
                  New project
                </button>
                <button type="button" className="dropdown-item" onClick={() => { setShowImport(true); close(); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Import spreadsheet
                </button>
              </>
            )}
          </Dropdown>
        </div>
      </motion.div>

      {/* Stats + Charts — collapsible, hidden by default */}
      <AnimatePresence>
        {showStats && boards.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-card-icon" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/></svg>
                </div>
                <div className="stat-card-label">Total Projects</div>
                <div className="stat-card-value">{stats.total}</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-icon" style={{ background: 'var(--green-subtle)', color: 'var(--green)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/></svg>
                </div>
                <div className="stat-card-label">Custom Columns</div>
                <div className="stat-card-value">{stats.totalColumns}</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-icon" style={{ background: 'var(--purple-subtle)', color: 'var(--purple)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
                </div>
                <div className="stat-card-label">Your Role</div>
                <div className="stat-card-value" style={{ fontSize: 20 }}>{roleLabel(user?.role)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-icon" style={{ background: 'var(--orange-subtle)', color: 'var(--orange)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                </div>
                <div className="stat-card-label">Active</div>
                <div className="stat-card-value">{boards.length}</div>
              </div>
            </div>

            <div className="charts-row">
              <div className="chart-card">
                <div className="chart-card-header">
                  <span className="chart-card-title">Project Overview</span>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={boards.slice(0, 8).map(b => ({
                    name: b.title.length > 12 ? b.title.slice(0, 12) + '...' : b.title,
                    columns: b.columns?.length || 0
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12 }} />
                    <Bar dataKey="columns" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="chart-card">
                <div className="chart-card-header">
                  <span className="chart-card-title">Status Distribution</span>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={4} dataKey="value">
                      {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 4 }}>
                  {statusData.map(d => (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                      {d.name} ({d.value})
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Boards */}
      {boards.length === 0 ? (
        <motion.div variants={item} className="empty-state">
          <div className="empty-state-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M9 3v18M15 3v18"/>
            </svg>
          </div>
          <h3>No projects yet</h3>
          <p>Create your first project to start managing tasks</p>
          <div className="empty-state-actions">
            <>
              <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>Create project</button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowImport(true)}>Import spreadsheet</button>
            </>
          </div>
        </motion.div>
      ) : (
        <motion.div variants={item}>
          <div style={{ marginBottom: 16 }} />
          <div className="board-grid">
            {boards.map((board, i) => {
              const isDragging = dragFromIdx === i;
              const isDropTarget = dragFromIdx !== null && dragOverIdx === i && dragFromIdx !== i;
              const dropSide = isDropTarget ? (dragFromIdx < i ? 'right' : 'left') : null;
              return (
              <motion.div
                key={board._id}
                className={`board-card${isDragging ? ' drag-source' : ''}${dropSide === 'left' ? ' drop-indicator-left' : ''}${dropSide === 'right' ? ' drop-indicator-right' : ''}`}
                onClick={() => navigate(`/boards/${board._id}`)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ y: -3 }}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragEnter={() => handleDragEnter(i)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
                style={board.color ? { '--board-color': board.color } : undefined}
              >
                {board.color && <div className="board-card-color-bar" style={{ background: board.color }} />}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <h3>{board.title}</h3>
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    <button
                      className="board-card-menu"
                      onClick={(e) => togglePinBoard(e, board._id)}
                      title={pinnedBoardIds.includes(board._id) ? 'Unpin from sidebar' : 'Pin to sidebar'}
                      style={{ color: pinnedBoardIds.includes(board._id) ? 'var(--accent)' : undefined }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill={pinnedBoardIds.includes(board._id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24z"/>
                      </svg>
                    </button>
                    {user?.role === 'admin' && (
                      <button
                        className="board-card-menu"
                        onClick={(e) => handleArchiveBoard(e, board._id, board.title)}
                        title="Archive project"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                          <polyline points="21 8 21 21 3 21 3 8"/>
                          <rect x="1" y="3" width="22" height="5" rx="1"/>
                          <line x1="10" y1="12" x2="14" y2="12"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
                <p>{board.description || 'No description'}</p>
                <div className="board-card-meta">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ opacity: 0.6 }}>
                      <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                    </svg>
                    {board.taskCount ?? 0} item{(board.taskCount ?? 0) !== 1 ? 's' : ''}
                  </span>
                  <span>{formatDistanceToNow(new Date(board.updatedAt || board.createdAt), { addSuffix: true })}</span>
                </div>
              </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Archived Projects */}
      <AnimatePresence>
        {showArchived && (
          <motion.div
            variants={item}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden', marginTop: 24 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '-0.02em' }}>Archived Projects</h3>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{archivedBoards.length} archived</span>
            </div>
            {archivedBoards.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>No archived projects</div>
            ) : (
              <div className="board-grid">
                {archivedBoards.map((board, i) => (
                  <motion.div
                    key={board._id}
                    className="board-card board-card-archived"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <h3 style={{ opacity: 0.7 }}>{board.title}</h3>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={(e) => handleRestoreBoard(e, board._id)}
                          title="Restore project"
                          style={{ fontSize: 11, gap: 4 }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 105.64-12.5L1 10"/>
                          </svg>
                          Restore
                        </button>
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={(e) => handleDeleteBoard(e, board._id, board.title)}
                          title="Delete permanently"
                          style={{ fontSize: 11, gap: 4, color: 'var(--red)' }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                          </svg>
                          Delete
                        </button>
                      </div>
                    </div>
                    <p style={{ opacity: 0.6 }}>{board.description || 'No description'}</p>
                    <div className="board-card-meta">
                      <span>Last Updated</span>
                      <span>{formatDistanceToNow(new Date(board.updatedAt || board.createdAt), { addSuffix: true })}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <AnimatePresence>
        {showCreate && (
          <CreateBoardModal onClose={() => setShowCreate(false)} onCreated={handleBoardCreated} />
        )}
      </AnimatePresence>

      {showImport && (
        <div className="modal-overlay">
          <div className="modal modal-lg" style={{ maxWidth: 860 }}>
            <div className="modal-header">
              <h3>Import from Spreadsheet</h3>
              <button className="modal-close" onClick={() => setShowImport(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <ImportSpreadsheet onImported={handleImported} />
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
