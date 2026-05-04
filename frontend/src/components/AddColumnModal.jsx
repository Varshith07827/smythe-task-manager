import { useState } from 'react';
import { boardsApi } from '../api/boards';
import { alert } from './AlertSystem';

const COLUMN_TYPES = [
  { value: 'text', label: 'Text', icon: 'Aa', desc: 'Single line text' },
  { value: 'number', label: 'Number', icon: '#', desc: 'Numeric values' },
  { value: 'dropdown', label: 'Dropdown', icon: '\u25BC', desc: 'Single select from options' },
  { value: 'date', label: 'Date', icon: '\uD83D\uDCC5', desc: 'Date picker' },
  { value: 'checkbox', label: 'Checkbox', icon: '\u2713', desc: 'True/false toggle' },
  { value: 'tag', label: 'Tag', icon: '\uD83C\uDFF7', desc: 'Multi-select tags' },
  { value: 'url', label: 'URL', icon: '\uD83D\uDD17', desc: 'Web link' },
  { value: 'email', label: 'Email', icon: '@', desc: 'Email address' },
];

export default function AddColumnModal({ boardId, onClose, onAdded }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [options, setOptions] = useState('');
  const [required, setRequired] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !type) return;
    setLoading(true);
    try {
      const data = { name, type, required };
      if (['dropdown', 'tag'].includes(type) && options) {
        data.options = options.split(',').map(o => o.trim()).filter(Boolean);
      }
      const res = await boardsApi.addColumn(boardId, data);
      alert.success('Column added');
      onAdded(res.data);
    } catch (err) {
      alert.error(err.response?.data?.error || 'Failed to add column');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add Column</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Column Name</label>
              <input type="text" className="form-input" placeholder="e.g. Sprint, Category, Points" value={name} onChange={e => setName(e.target.value)} required autoFocus />
            </div>

            <div className="form-group">
              <label className="form-label">Column Type</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {COLUMN_TYPES.map(ct => (
                  <button
                    key={ct.value}
                    type="button"
                    onClick={() => setType(ct.value)}
                    style={{
                      padding: '12px 8px',
                      borderRadius: 'var(--radius-sm)',
                      border: `1.5px solid ${type === ct.value ? 'var(--accent)' : 'var(--border)'}`,
                      background: type === ct.value ? 'var(--accent-subtle)' : 'var(--bg-tertiary)',
                      color: type === ct.value ? 'var(--accent)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 18, marginBottom: 4 }}>{ct.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 550 }}>{ct.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {['dropdown', 'tag'].includes(type) && (
              <div className="form-group">
                <label className="form-label">Options (comma separated)</label>
                <input type="text" className="form-input" placeholder="Option 1, Option 2, Option 3" value={options} onChange={e => setOptions(e.target.value)} />
                {options && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {options.split(',').map(o => o.trim()).filter(Boolean).map((o, i) => (
                      <span key={i} className="badge" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>{o}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer', padding: '8px 0' }}>
              <input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
              Required field
            </label>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading || !type}>
              {loading ? 'Adding...' : 'Add Column'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
