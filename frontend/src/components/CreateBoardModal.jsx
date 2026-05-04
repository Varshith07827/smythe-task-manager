import { useState } from 'react';
import { boardsApi } from '../api/boards';
import { alert } from './AlertSystem';

export default function CreateBoardModal({ onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#0a84ff');
  const [loading, setLoading] = useState(false);

  const presetColors = ['#0a84ff', '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4'];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    try {
      const res = await boardsApi.create({ title, description, color });
      alert.success('Project created');
      onCreated(res.data);
    } catch (err) {
      alert.error(err.response?.data?.error || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Create New Project</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Project Title</label>
              <input type="text" className="form-input" placeholder="e.g. Sprint Project" value={title} onChange={e => setTitle(e.target.value)} required autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Description (optional)</label>
              <textarea className="form-input" placeholder="What is this project for?" value={description} onChange={e => setDescription(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Project Color</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {presetColors.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    style={{
                      width: 28, height: 28, borderRadius: '50%', background: c, border: color === c ? '2.5px solid var(--text-primary)' : '2px solid transparent',
                      cursor: 'pointer', outline: color === c ? '2px solid var(--bg-primary)' : 'none', outlineOffset: -4, transition: 'border 0.15s, outline 0.15s', flexShrink: 0
                    }}
                  />
                ))}
                <input
                  type="color"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  style={{ width: 28, height: 28, padding: 0, border: '1px solid var(--border)', borderRadius: '50%', cursor: 'pointer' }}
                  title="Custom color"
                />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
