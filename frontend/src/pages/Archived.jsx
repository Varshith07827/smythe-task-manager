import { useState, useEffect } from 'react';
import { boardsApi } from '../api/boards';
import { alert, useConfirm } from '../components/AlertSystem';
import { formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';

export default function Archived() {
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const confirm = useConfirm();

  useEffect(() => {
    boardsApi.getArchived().then(res => { setBoards(res.data); setLoading(false); })
      .catch(() => { alert.error('Could not load archived projects.'); setLoading(false); });
  }, []);

  const handleRestore = async (boardId) => {
    try {
      await boardsApi.restore(boardId);
      setBoards(prev => prev.filter(b => b._id !== boardId));
      alert.success('Project restored');
    } catch { alert.error('Could not restore project.'); }
  };

  const handleDelete = async (boardId, title) => {
    if (!(await confirm({
      title: 'Permanently Delete Project',
      message: `This will permanently delete "${title}" and all its tasks. This action cannot be undone.`,
      confirmText: 'Delete Forever',
      variant: 'danger'
    }))) return;
    try {
      await boardsApi.delete(boardId);
      setBoards(prev => prev.filter(b => b._id !== boardId));
      alert.success('Project permanently deleted');
    } catch { alert.error('Could not delete project.'); }
  };

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="page-section-header">
        <div className="page-section-header-main">
          <h2 className="page-section-title">Archived Projects</h2>
        </div>
      </div>

      {boards.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round">
              <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5" rx="1"/><line x1="10" y1="12" x2="14" y2="12"/>
            </svg>
          </div>
          <h3>No archived projects</h3>
          <p>Archived projects will appear here</p>
        </div>
      ) : (
        <div className="board-grid">
          {boards.map((board, i) => (
            <motion.div
              key={board._id}
              className="board-card board-card-archived"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <h3 style={{ opacity: 0.7, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{board.title}</h3>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => handleRestore(board._id)}
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
                    onClick={() => handleDelete(board._id, board.title)}
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
  );
}
