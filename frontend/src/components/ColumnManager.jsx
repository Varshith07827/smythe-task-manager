import { useState, useEffect } from 'react';
import { boardsApi } from '../api/boards';
import { alert, useConfirm } from './AlertSystem';

const COLUMN_TYPES = [
  { value: 'text', label: 'Text', icon: 'Aa' },
  { value: 'number', label: 'Number', icon: '#' },
  { value: 'date', label: 'Date', icon: '📅' },
  { value: 'dropdown', label: 'Dropdown', icon: '▼' },
  { value: 'checkbox', label: 'Checkbox', icon: '☑' },
  { value: 'user', label: 'User', icon: '👤' },
  { value: 'url', label: 'URL', icon: '🔗' },
  { value: 'email', label: 'Email', icon: '@' },
  { value: 'tag', label: 'Tags', icon: '⊞' }
];

const CHECKPOINT_KEY = (boardId) => `scards_checkpoints_${boardId}`;

function getCheckpoints(boardId) {
  try {
    return JSON.parse(localStorage.getItem(CHECKPOINT_KEY(boardId)) || '[]');
  } catch { return []; }
}

function saveCheckpoints(boardId, list) {
  localStorage.setItem(CHECKPOINT_KEY(boardId), JSON.stringify(list.slice(0, 10)));
}

export default function ColumnManager({ board, boardId, userRole, onClose, onBoardUpdated }) {
  const confirm = useConfirm();
  const canEdit = userRole === 'admin';
  const [columns, setColumns] = useState((board.columns || []).map(c => ({ ...c })));
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [newCol, setNewCol] = useState({ name: '', type: 'text', options: '' });
  const [deletedStack, setDeletedStack] = useState([]);
  const [checkpoints, setCheckpoints] = useState([]);
  const [showCheckpoints, setShowCheckpoints] = useState(false);
  const [tab, setTab] = useState('columns');

  useEffect(() => {
    setCheckpoints(getCheckpoints(boardId));
  }, [boardId]);

  // --- Column operations ---

  const handleToggleVisibility = async (col) => {
    try {
      const newVisible = col.visible === false ? true : false;
      await boardsApi.updateColumn(boardId, col._id, { visible: newVisible });
      setColumns(prev => prev.map(c => c._id === col._id ? { ...c, visible: newVisible } : c));
      alert.success(`Column "${col.name}" ${newVisible ? 'shown' : 'hidden'}`);
    } catch {
      alert.error('Failed to update column');
    }
  };

  const handleRename = async (col) => {
    if (!editName.trim() || editName === col.name) {
      setEditingId(null);
      return;
    }
    try {
      await boardsApi.updateColumn(boardId, col._id, { name: editName.trim() });
      setColumns(prev => prev.map(c => c._id === col._id ? { ...c, name: editName.trim() } : c));
      setEditingId(null);
      alert.success('Column renamed');
    } catch {
      alert.error('Failed to rename');
    }
  };

  const handleDelete = async (col) => {
    if (!(await confirm({ title: 'Delete Column', message: `Delete "${col.name}"? You can undo this.`, confirmText: 'Delete', variant: 'danger' }))) return;
    try {
      await boardsApi.removeColumn(boardId, col._id);
      setDeletedStack(prev => [...prev, col]);
      setColumns(prev => prev.filter(c => c._id !== col._id));

      alert.success(`Deleted "${col.name}"`, { duration: 8000, action: { label: 'Undo', onClick: () => handleUndoDelete(col) } });
    } catch {
      alert.error('Failed to delete column');
    }
  };

  const handleUndoDelete = async (col) => {
    try {
      const data = { name: col.name, type: col.type };
      if (col.options?.length) data.options = col.options;
      if (col.required) data.required = col.required;
      if (col.defaultValue !== undefined) data.defaultValue = col.defaultValue;

      const res = await boardsApi.addColumn(boardId, data);
      const newCols = res.data.columns || [];
      setColumns(newCols);
      setDeletedStack(prev => prev.filter(c => c._id !== col._id));
      alert.success(`Column "${col.name}" restored`);
    } catch {
      alert.error('Failed to restore column');
    }
  };

  const handleAdd = async () => {
    if (!newCol.name.trim()) return;
    setSaving(true);
    try {
      const data = { name: newCol.name.trim(), type: newCol.type };
      if ((newCol.type === 'dropdown' || newCol.type === 'tag') && newCol.options.trim()) {
        data.options = newCol.options.split(',').map(o => o.trim()).filter(Boolean);
      }
      const res = await boardsApi.addColumn(boardId, data);
      setColumns(res.data.columns || []);
      setNewCol({ name: '', type: 'text', options: '' });
      setAddMode(false);
      alert.success('Column added');
    } catch {
      alert.error('Failed to add column');
    } finally {
      setSaving(false);
    }
  };

  const handleMoveUp = async (index) => {
    if (index === 0) return;
    const newOrder = [...columns];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    setColumns(newOrder);
    try {
      await boardsApi.reorderColumns(boardId, newOrder.map(c => c._id));
    } catch {
      alert.error('Failed to reorder');
      setColumns(columns);
    }
  };

  const handleMoveDown = async (index) => {
    if (index >= columns.length - 1) return;
    const newOrder = [...columns];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    setColumns(newOrder);
    try {
      await boardsApi.reorderColumns(boardId, newOrder.map(c => c._id));
    } catch {
      alert.error('Failed to reorder');
      setColumns(columns);
    }
  };

  // --- Checkpoint operations ---

  const handleSaveCheckpoint = () => {
    const checkpoint = {
      id: Date.now(),
      name: `Checkpoint ${new Date().toLocaleString()}`,
      columns: columns.map(c => ({ name: c.name, type: c.type, options: c.options, required: c.required, visible: c.visible, order: c.order })),
      createdAt: new Date().toISOString()
    };
    const updated = [checkpoint, ...checkpoints].slice(0, 10);
    setCheckpoints(updated);
    saveCheckpoints(boardId, updated);
    alert.success('Checkpoint saved');
  };

  const handleRestoreCheckpoint = async (cp) => {
    if (!(await confirm({ title: 'Restore Checkpoint', message: `Restore columns to ${new Date(cp.createdAt).toLocaleString()}? This will replace all current columns.`, confirmText: 'Restore', variant: 'warning' }))) return;

    try {
      const res = await boardsApi.replaceColumns(boardId, cp.columns);
      setColumns(res.data.columns || []);
      onBoardUpdated(res.data);
      alert.success('Checkpoint restored');
    } catch {
      alert.error('Failed to restore checkpoint');
    }
  };

  const handleDeleteCheckpoint = (id) => {
    const updated = checkpoints.filter(c => c.id !== id);
    setCheckpoints(updated);
    saveCheckpoints(boardId, updated);
  };

  const handleClose = () => {
    onBoardUpdated({ ...board, columns });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal modal-lg column-manager-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Manage Columns</h3>
          <button className="modal-close" onClick={handleClose}>&times;</button>
        </div>

        {/* Tab bar */}
        <div className="detail-tabs" style={{ padding: '0 24px' }}>
          <button className={`detail-tab ${tab === 'columns' ? 'active' : ''}`} onClick={() => setTab('columns')}>Columns</button>
          <button className={`detail-tab ${tab === 'checkpoints' ? 'active' : ''}`} onClick={() => setTab('checkpoints')}>
            Checkpoints {checkpoints.length > 0 && <span className="tab-count">{checkpoints.length}</span>}
          </button>
          {deletedStack.length > 0 && (
            <button className={`detail-tab ${tab === 'trash' ? 'active' : ''}`} onClick={() => setTab('trash')}>
              Trash <span className="tab-count" style={{ background: 'var(--red-subtle)', color: 'var(--red)' }}>{deletedStack.length}</span>
            </button>
          )}
        </div>

        <div className="modal-body" style={{ padding: '12px 24px 20px' }}>
          {/* --- Columns Tab --- */}
          {tab === 'columns' && (
            <>
              {columns.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
                  No custom columns yet
                </div>
              ) : (
                <div className="col-manager-list">
                  {columns.map((col, i) => (
                    <div key={col._id} className={`col-manager-item ${col.visible === false ? 'hidden-col' : ''}`}>
                      {canEdit && (
                        <div className="col-manager-reorder">
                          <button className="col-reorder-btn" onClick={() => handleMoveUp(i)} disabled={i === 0} title="Move up">
                            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M7.646 4.646a.5.5 0 01.708 0l6 6a.5.5 0 01-.708.708L8 5.707l-5.646 5.647a.5.5 0 01-.708-.708l6-6z"/></svg>
                          </button>
                          <button className="col-reorder-btn" onClick={() => handleMoveDown(i)} disabled={i >= columns.length - 1} title="Move down">
                            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M1.646 4.646a.5.5 0 01.708 0L8 10.293l5.646-5.647a.5.5 0 01.708.708l-6 6a.5.5 0 01-.708 0l-6-6a.5.5 0 010-.708z"/></svg>
                          </button>
                        </div>
                      )}

                      <button className={`col-vis-toggle ${col.visible !== false ? 'visible' : ''}`} onClick={() => handleToggleVisibility(col)} title={col.visible !== false ? 'Hide' : 'Show'}>
                        {col.visible !== false ? (
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 011.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0114.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 011.172 8z"/><path d="M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM4.5 8a3.5 3.5 0 117 0 3.5 3.5 0 01-7 0z"/></svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 00-2.79.588l.77.771A5.944 5.944 0 018 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0114.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.165.165-.337.328-.517.486l.708.709z"/><path d="M11.297 9.176a3.5 3.5 0 00-4.474-4.474l.823.823a2.5 2.5 0 012.829 2.829l.822.822zm-2.943 1.299l.822.822a3.5 3.5 0 01-4.474-4.474l.823.823a2.5 2.5 0 002.829 2.829z"/><path d="M3.35 5.47c-.18.16-.353.322-.518.487A13.134 13.134 0 001.172 8l.195.288c.335.48.83 1.12 1.465 1.755C4.121 11.332 5.881 12.5 8 12.5c.716 0 1.39-.133 2.02-.36l.77.772A7.029 7.029 0 018 13.5C3 13.5 0 8 0 8s.939-1.721 2.641-3.238l.708.708zM13.646 14.354l-12-12 .708-.708 12 12-.708.708z"/></svg>
                        )}
                      </button>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        {canEdit && editingId === col._id ? (
                          <input className="col-rename-input" value={editName} onChange={e => setEditName(e.target.value)} onBlur={() => handleRename(col)} onKeyDown={e => { if (e.key === 'Enter') handleRename(col); if (e.key === 'Escape') setEditingId(null); }} autoFocus />
                        ) : (
                          <div className="col-manager-name" onClick={canEdit ? () => { setEditingId(col._id); setEditName(col.name); } : undefined} style={canEdit ? undefined : { cursor: 'default' }}>{col.name}</div>
                        )}
                        <span className="col-manager-type">{col.type}</span>
                      </div>

                      {canEdit && (
                        <button className="col-delete-btn" onClick={() => handleDelete(col)} title="Delete">
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/><path fillRule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H5.5l1-1h3l1 1h2.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {canEdit && (
                addMode ? (
                  <div className="col-add-form">
                    <input className="form-input" placeholder="Column name" value={newCol.name} onChange={e => setNewCol(prev => ({ ...prev, name: e.target.value }))} autoFocus style={{ marginBottom: 8 }} />
                    <select className="form-input" value={newCol.type} onChange={e => setNewCol(prev => ({ ...prev, type: e.target.value }))} style={{ marginBottom: 8 }}>
                      {COLUMN_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                    </select>
                    {(newCol.type === 'dropdown' || newCol.type === 'tag') && (
                      <input className="form-input" placeholder="Options (comma separated)" value={newCol.options} onChange={e => setNewCol(prev => ({ ...prev, options: e.target.value }))} style={{ marginBottom: 8 }} />
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={saving || !newCol.name.trim()}>{saving ? 'Adding...' : 'Add Column'}</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setAddMode(false)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setAddMode(true)} style={{ flex: 1 }}>
                      + Add Column
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={handleSaveCheckpoint} title="Save current column layout as a checkpoint">
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M2 1a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V2a1 1 0 00-1-1H9.5a1 1 0 00-1 1v7.293l2.646-2.647a.5.5 0 01.708.708l-3.5 3.5a.5.5 0 01-.708 0l-3.5-3.5a.5.5 0 11.708-.708L7.5 9.293V2a2 2 0 012-2H14a2 2 0 012 2v12a2 2 0 01-2 2H2a2 2 0 01-2-2V2a2 2 0 012-2h2.5a.5.5 0 010 1H2z"/></svg>
                      Save Checkpoint
                    </button>
                  </div>
                )
              )}
            </>
          )}

          {/* --- Checkpoints Tab --- */}
          {tab === 'checkpoints' && (
            <>
              {checkpoints.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
                  <p style={{ marginBottom: 12 }}>No checkpoints saved yet</p>
                  <button className="btn btn-primary btn-sm" onClick={() => { handleSaveCheckpoint(); }}>Save Current Layout</button>
                </div>
              ) : (
                <div className="col-manager-list">
                  {checkpoints.map(cp => (
                    <div key={cp.id} className="checkpoint-item">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                          {cp.columns.length} column{cp.columns.length !== 1 ? 's' : ''}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          {cp.columns.map(c => c.name).join(', ')}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                          {new Date(cp.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <button className="btn btn-sm btn-secondary" onClick={() => handleRestoreCheckpoint(cp)}>Restore</button>
                      <button className="col-delete-btn" style={{ opacity: 1 }} onClick={() => handleDeleteCheckpoint(cp.id)} title="Delete checkpoint">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z"/></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* --- Trash Tab --- */}
          {tab === 'trash' && (
            <>
              {deletedStack.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
                  Trash is empty
                </div>
              ) : (
                <div className="col-manager-list">
                  {deletedStack.map(col => (
                    <div key={col._id} className="col-manager-item" style={{ opacity: 0.7 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="col-manager-name" style={{ cursor: 'default' }}>{col.name}</div>
                        <span className="col-manager-type">{col.type}</span>
                      </div>
                      <button className="btn btn-sm btn-secondary" onClick={() => handleUndoDelete(col)}>Restore</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
