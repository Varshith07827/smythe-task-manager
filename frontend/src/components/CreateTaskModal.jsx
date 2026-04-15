import { useState, useEffect } from 'react';
import { tasksApi } from '../api/tasks';
import { usersApi } from '../api/users';
import { alert } from './AlertSystem';

export default function CreateTaskModal({ boardId, columns = [], customPriorities = [], onClose, onCreated }) {
  const today = new Date().toISOString().split('T')[0];
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState(today);
  const [assignedTo, setAssignedTo] = useState([]);
  const [members, setMembers] = useState([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [columnValues, setColumnValues] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    usersApi.getMembers().then(res => setMembers(res.data || [])).catch(() => {});
  }, []);

  const toggleAssignee = (userId) => {
    setAssignedTo(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const setColValue = (colId, value) => {
    setColumnValues(prev => ({ ...prev, [colId]: value }));
  };

  const renderColumnInput = (col) => {
    const colId = col._id;
    const value = columnValues[colId] ?? '';

    switch (col.type) {
      case 'text':
      case 'url':
      case 'email':
        return (
          <input
            type={col.type === 'url' ? 'url' : col.type === 'email' ? 'email' : 'text'}
            className="form-input"
            placeholder={`Enter ${col.name.toLowerCase()}`}
            value={value}
            onChange={e => setColValue(colId, e.target.value)}
          />
        );

      case 'number':
        return (
          <input
            type="number"
            className="form-input"
            placeholder={`Enter ${col.name.toLowerCase()}`}
            value={value}
            onChange={e => setColValue(colId, e.target.value ? Number(e.target.value) : '')}
          />
        );

      case 'dropdown':
        return (
          <select className="form-input" value={value} onChange={e => setColValue(colId, e.target.value)}>
            <option value="">Select {col.name.toLowerCase()}</option>
            {col.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        );

      case 'date':
        return <input type="date" className="form-input" value={value} onChange={e => setColValue(colId, e.target.value)} />;

      case 'checkbox':
        return (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
            <input
              type="checkbox"
              checked={!!value}
              onChange={e => setColValue(colId, e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
            />
            {col.name}
          </label>
        );

      case 'tag':
        return (
          <select className="form-input" value={value} onChange={e => setColValue(colId, e.target.value)}>
            <option value="">Select tag</option>
            {col.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        );

      default:
        return (
          <input
            type="text"
            className="form-input"
            placeholder={`Enter ${col.name.toLowerCase()}`}
            value={value}
            onChange={e => setColValue(colId, e.target.value)}
          />
        );
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    try {
      const data = { title, description, priority };
      if (dueDate) data.dueDate = dueDate;
      if (assignedTo.length > 0) data.assignedTo = assignedTo;

      const cleanCols = {};
      for (const [key, val] of Object.entries(columnValues)) {
        if (val !== '' && val !== null && val !== undefined) {
          cleanCols[key] = val;
        }
      }
      if (Object.keys(cleanCols).length > 0) {
        data.columnValues = cleanCols;
      }

      const res = await tasksApi.create(boardId, data);
      alert.success('Task created');
      onCreated(res.data);
    } catch (err) {
      alert.error(err.response?.data?.error || 'Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  const visibleColumns = columns.filter(c => c.visible !== false);
  const initials = (name) => name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';

  return (
    <div className="modal-overlay">
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Create Task</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Title</label>
              <input type="text" className="form-input" placeholder="What needs to be done?" value={title} onChange={e => setTitle(e.target.value)} required autoFocus />
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="form-input" placeholder="Add more details..." value={description} onChange={e => setDescription(e.target.value)} rows={3} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Priority</label>
                <select className="form-input" value={priority} onChange={e => setPriority(e.target.value)}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                  {customPriorities.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Due Date</label>
                <input type="date" className="form-input" value={dueDate} onChange={e => setDueDate(e.target.value)} min={today} />
              </div>
            </div>

            {/* Assign To */}
            <div className="form-group">
              <label className="form-label">Assign To</label>
              {/* Selected chips always shown */}
              {assignedTo.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {members.filter(m => assignedTo.includes(m._id)).map(m => (
                    <button
                      key={m._id}
                      type="button"
                      className="assignee-chip assignee-chip-selected"
                      onClick={() => toggleAssignee(m._id)}
                      style={{ cursor: 'pointer', border: '1.5px solid var(--accent)', background: 'var(--accent-subtle)' }}
                    >
                      <div className="user-avatar" style={{ width: 20, height: 20, fontSize: 8 }}>{initials(m.name)}</div>
                      {m.name}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  ))}
                </div>
              )}
              <input
                type="text"
                className="form-input"
                placeholder="Search and add users..."
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
              />
              {memberSearch.trim() && (
                <div style={{ marginTop: 4, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-primary)', maxHeight: 180, overflowY: 'auto' }}>
                  {members
                    .filter(m => m.status !== 'inactive' && !assignedTo.includes(m._id))
                    .filter(m => m.name?.toLowerCase().includes(memberSearch.toLowerCase()) || m.email?.toLowerCase().includes(memberSearch.toLowerCase()))
                    .map(m => (
                      <button
                        key={m._id}
                        type="button"
                        onClick={() => { toggleAssignee(m._id); setMemberSearch(''); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 14, color: 'var(--text-primary)' }}
                        onMouseOver={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseOut={e => e.currentTarget.style.background = 'none'}
                      >
                        <div className="user-avatar" style={{ width: 22, height: 22, fontSize: 9, flexShrink: 0 }}>{initials(m.name)}</div>
                        <div>
                          <div style={{ fontWeight: 550 }}>{m.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{m.email}</div>
                        </div>
                      </button>
                    ))}
                  {members.filter(m => m.status !== 'inactive' && !assignedTo.includes(m._id) && (m.name?.toLowerCase().includes(memberSearch.toLowerCase()) || m.email?.toLowerCase().includes(memberSearch.toLowerCase()))).length === 0 && (
                    <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-tertiary)' }}>No users found</div>
                  )}
                </div>
              )}
            </div>

            {visibleColumns.length > 0 && (
              <>
                <div style={{ borderTop: '1px solid var(--separator)', margin: '8px 0 20px', paddingTop: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-tertiary)', marginBottom: 14 }}>
                    Custom Fields
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: visibleColumns.length === 1 ? '1fr' : '1fr 1fr', gap: 14 }}>
                  {visibleColumns.map(col => (
                    <div key={col._id} className="form-group" style={{ marginBottom: 10 }}>
                      <label className="form-label">
                        {col.name}
                        {col.required && <span style={{ color: 'var(--red)', marginLeft: 3 }}>*</span>}
                      </label>
                      {renderColumnInput(col)}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
