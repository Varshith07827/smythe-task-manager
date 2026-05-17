import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { tasksApi } from '../api/tasks';
import { boardsApi } from '../api/boards';
import { alert, useConfirm } from './AlertSystem';

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

function useDropdownPortal(isOpen, triggerRef) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    let top = rect.bottom + 4;
    let left = rect.left;
    // If dropdown would go off-screen bottom, show above
    if (top + 260 > vh) top = Math.max(8, rect.top - 260);
    // Clamp left
    if (left + 200 > window.innerWidth) left = window.innerWidth - 208;
    if (left < 8) left = 8;
    setPos({ top, left });
  }, [triggerRef]);

  useEffect(() => {
    if (!isOpen) return;
    updatePos();
    const onScroll = () => updatePos();
    const onResize = () => updatePos();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [isOpen, updatePos]);

  return pos;
}

export default function TaskRow({ task, columns, selected, onToggle, onClick, boardId, onUpdated, onDeleted, onStatusWorkflow, customStatuses: customStatusesProp, customPriorities: customPrioritiesProp, onBoardUpdated, isManager, draggable, onDragStart, onDragEnd }) {
  const confirm = useConfirm();
  const [editingCol, setEditingCol] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const [customStatusMode, setCustomStatusMode] = useState(false);
  const [customPriorityMode, setCustomPriorityMode] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customColor, setCustomColor] = useState('#0a84ff');

  const statusBtnRef = useRef(null);
  const priorityBtnRef = useRef(null);

  const statusPos = useDropdownPortal(showStatusMenu, statusBtnRef);
  const priorityPos = useDropdownPortal(showPriorityMenu, priorityBtnRef);

  const handleStatusClick = (e) => { e.stopPropagation(); setShowStatusMenu(!showStatusMenu); };

  const handleStatusSelect = (status) => {
    setShowStatusMenu(false);
    if (status === task.status) return;
    onStatusWorkflow(task, status);
  };

  const handlePriorityClick = (e) => { e.stopPropagation(); setShowPriorityMenu(!showPriorityMenu); };

  const handlePrioritySelect = async (priority) => {
    setShowPriorityMenu(false);
    if (priority === task.priority) return;
    try {
      const res = await tasksApi.update(boardId, task._id, { priority });
      onUpdated(res.data);
    } catch {
      alert.error('Could not update priority.');
    }
  };

  const handleSaveCustomStatus = async () => {
    if (!customName.trim()) return;
    const value = customName.trim().toLowerCase().replace(/\s+/g, '_');
    try {
      const boardRes = await boardsApi.getOne(boardId);
      const existing = boardRes.data.customStatuses || [];
      if (!existing.some(s => s.value === value)) {
        await boardsApi.update(boardId, { customStatuses: [...existing, { value, label: customName.trim(), color: customColor }] });
        onBoardUpdated?.();
      }
      onStatusWorkflow(task, value);
    } catch { alert.error('Could not save custom status.'); }
    setShowStatusMenu(false); setCustomStatusMode(false); setCustomName(''); setCustomColor('#0a84ff');
  };

  const handleSaveCustomPriority = async () => {
    if (!customName.trim()) return;
    const value = customName.trim().toLowerCase().replace(/\s+/g, '_');
    try {
      const boardRes = await boardsApi.getOne(boardId);
      const existing = boardRes.data.customPriorities || [];
      if (!existing.some(p => p.value === value)) {
        await boardsApi.update(boardId, { customPriorities: [...existing, { value, label: customName.trim(), color: customColor }] });
        onBoardUpdated?.();
      }
      const res = await tasksApi.update(boardId, task._id, { priority: value });
      onUpdated(res.data);
    } catch { alert.error('Could not save custom priority.'); }
    setShowPriorityMenu(false); setCustomPriorityMode(false); setCustomName(''); setCustomColor('#0a84ff');
  };

  const startCellEdit = (col, currentValue) => { setEditingCol(col._id); setEditValue(currentValue ?? ''); };

  const saveCellEdit = async (col) => {
    setEditingCol(null);
    let val = editValue;
    if (col.type === 'number' && val !== '') val = Number(val);
    if (col.type === 'checkbox') val = val === 'true' || val === true;
    const current = task.columnValues?.[col._id] ?? task.columnValues?.get?.(col._id);
    if (val === current || (val === '' && (current === undefined || current === null))) return;
    try {
      const newColumnValues = { ...(task.columnValues || {}), [col._id]: val === '' ? null : val };
      const res = await tasksApi.update(boardId, task._id, { columnValues: newColumnValues });
      onUpdated(res.data);
    } catch {
      alert.error('Could not save changes.');
    }
  };

  const getColumnValue = (col) => {
    const val = task.columnValues?.[col._id] || task.columnValues?.get?.(col._id);
    if (val === undefined || val === null || val === '') return null;
    switch (col.type) {
      case 'checkbox': return val ? 'Yes' : 'No';
      case 'date': try { return format(new Date(val), 'MMM d, yyyy'); } catch { return String(val); }
      case 'tag': return Array.isArray(val) ? val.join(', ') : String(val);
      default: return String(val);
    }
  };

  const renderCellEditor = (col) => {
    if (col.type === 'dropdown' || col.type === 'tag') {
      return (
        <select className="cell-input" value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => saveCellEdit(col)} autoFocus>
          <option value="">--</option>
          {col.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      );
    }
    if (col.type === 'checkbox') {
      return (
        <input type="checkbox" checked={editValue === true || editValue === 'true'}
          onChange={e => { setEditValue(e.target.checked); setTimeout(() => saveCellEdit({ ...col }), 0); }}
          style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} autoFocus
        />
      );
    }
    return (
      <input className="cell-input"
        type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
        value={editValue}
        onChange={e => setEditValue(e.target.value)}
        onBlur={() => saveCellEdit(col)}
        onKeyDown={e => { if (e.key === 'Enter') saveCellEdit(col); if (e.key === 'Escape') setEditingCol(null); }}
        autoFocus
      />
    );
  };

  const assignees = task.assignedTo || [];
  const initials = (name) => name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';
  const customStatuses = customStatusesProp || {};
  const customPriorities = customPrioritiesProp || {};
  const allStatuses = { ...DEFAULT_STATUS_DOTS, ...customStatuses };
  const allPriorities = { ...DEFAULT_PRIORITY_DOTS, ...customPriorities };
  const statusInfo = allStatuses[task.status] || DEFAULT_STATUS_DOTS.pending;
  const priorityInfo = allPriorities[task.priority] || DEFAULT_PRIORITY_DOTS.medium;

  const renderStatusDropdown = () => (
    <>
      {Object.entries(allStatuses).map(([key, val]) => (
        <div key={key} className={`status-dropdown-item ${key === task.status ? 'active' : ''}`} onClick={() => handleStatusSelect(key)}>
          <span className="status-dot" style={{ background: val.color }} />
          <span>{val.label}</span>
          {key === task.status && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto' }}><polyline points="20 6 9 17 4 12"/></svg>
          )}
        </div>
      ))}
      {isManager && (
      <div style={{ borderTop: '1px solid var(--separator)', marginTop: 4, paddingTop: 4 }}>
        {!customStatusMode ? (
          <div className="status-dropdown-item custom-option" onClick={() => { setCustomStatusMode(true); setCustomName(''); setCustomColor('#0a84ff'); }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            <span>Custom...</span>
          </div>
        ) : (
          <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="color" value={customColor} onChange={e => setCustomColor(e.target.value)} style={{ width: 24, height: 24, padding: 0, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }} />
              <input type="text" placeholder="Status name" value={customName} onChange={e => setCustomName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSaveCustomStatus(); }} autoFocus className="form-input" style={{ flex: 1, padding: '4px 8px', fontSize: 12, height: 28 }} />
            </div>
            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setCustomStatusMode(false)}>Cancel</button>
              <button type="button" className="btn btn-primary btn-xs" onClick={handleSaveCustomStatus} disabled={!customName.trim()}>Add</button>
            </div>
          </div>
        )}
      </div>
      )}
    </>
  );

  const renderPriorityDropdown = () => (
    <>
      {Object.entries(allPriorities).map(([key, val]) => (
        <div key={key} className={`status-dropdown-item ${key === task.priority ? 'active' : ''}`} onClick={() => handlePrioritySelect(key)}>
          <span className="status-dot" style={{ background: val.color }} />
          <span>{val.label}</span>
          {key === task.priority && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto' }}><polyline points="20 6 9 17 4 12"/></svg>
          )}
        </div>
      ))}
      {isManager && (
      <div style={{ borderTop: '1px solid var(--separator)', marginTop: 4, paddingTop: 4 }}>
        {!customPriorityMode ? (
          <div className="status-dropdown-item custom-option" onClick={() => { setCustomPriorityMode(true); setCustomName(''); setCustomColor('#0a84ff'); }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            <span>Custom...</span>
          </div>
        ) : (
          <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="color" value={customColor} onChange={e => setCustomColor(e.target.value)} style={{ width: 24, height: 24, padding: 0, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }} />
              <input type="text" placeholder="Priority name" value={customName} onChange={e => setCustomName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSaveCustomPriority(); }} autoFocus className="form-input" style={{ flex: 1, padding: '4px 8px', fontSize: 12, height: 28 }} />
            </div>
            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setCustomPriorityMode(false)}>Cancel</button>
              <button type="button" className="btn btn-primary btn-xs" onClick={handleSaveCustomPriority} disabled={!customName.trim()}>Add</button>
            </div>
          </div>
        )}
      </div>
      )}
    </>
  );

  return (
    <tr className={selected ? 'row-selected' : ''} style={{ '--row-priority-color': priorityInfo.color, cursor: draggable ? 'grab' : undefined }} draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <td className="row-priority-indicator" style={{ width: 40 }}>
        <div className={`checkbox ${selected ? 'checked' : ''}`} onClick={e => { e.stopPropagation(); onToggle(); }}>
          {selected && <svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4.5L4 7.5L10 1.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </div>
      </td>

      <td className="task-title-cell" onClick={onClick}>
        <span className="task-title-text">{task.title}</span>
      </td>

      <td onClick={e => e.stopPropagation()}>
        <div className="status-badge-btn" ref={statusBtnRef} onClick={handleStatusClick} style={{ '--status-color': statusInfo.color }}>
          <span className="status-dot" style={{ background: statusInfo.color }} />
          <span>{statusInfo.label}</span>
          <svg width="8" height="5" viewBox="0 0 8 5" fill="none" style={{ opacity: 0.35 }}><path d="M0.5 0.5L4 4L7.5 0.5" stroke="currentColor" strokeWidth="1"/></svg>
        </div>
        {showStatusMenu && createPortal(
          <>
            <div className="status-menu-backdrop" onClick={() => { setShowStatusMenu(false); setCustomStatusMode(false); }} />
            <div className="status-dropdown-menu status-dropdown-portal" style={{ position: 'fixed', top: statusPos.top, left: statusPos.left }}>
              {renderStatusDropdown()}
            </div>
          </>,
          document.body
        )}
      </td>

      <td onClick={e => e.stopPropagation()}>
        {isManager ? (
        <>
        <div className="status-badge-btn" ref={priorityBtnRef} onClick={handlePriorityClick} style={{ '--status-color': priorityInfo.color }}>
          <span className="status-dot" style={{ background: priorityInfo.color }} />
          <span>{priorityInfo.label}</span>
          <svg width="8" height="5" viewBox="0 0 8 5" fill="none" style={{ opacity: 0.35 }}><path d="M0.5 0.5L4 4L7.5 0.5" stroke="currentColor" strokeWidth="1"/></svg>
        </div>
        {showPriorityMenu && createPortal(
          <>
            <div className="status-menu-backdrop" onClick={() => { setShowPriorityMenu(false); setCustomPriorityMode(false); }} />
            <div className="status-dropdown-menu status-dropdown-portal" style={{ position: 'fixed', top: priorityPos.top, left: priorityPos.left }}>
              {renderPriorityDropdown()}
            </div>
          </>,
          document.body
        )}
        </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', fontSize: 13 }}>
            <span className="status-dot" style={{ background: priorityInfo.color }} />
            <span>{priorityInfo.label}</span>
          </div>
        )}
      </td>

      <td>
        {assignees.length > 0 ? (
          <div className="avatar-group">
            {assignees.slice(0, 3).map(u => (
              <div key={u._id} className="user-avatar" title={u.name}>{initials(u.name)}</div>
            ))}
            {assignees.length > 3 && (
              <div className="user-avatar" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>+{assignees.length - 3}</div>
            )}
          </div>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>&mdash;</span>
        )}
      </td>

      <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        {task.dueDate ? format(new Date(task.dueDate), 'MMM d, yyyy') : (
          <span style={{ color: 'var(--text-tertiary)' }}>&mdash;</span>
        )}
      </td>

      {columns.map(col => (
        <td key={col._id} onClick={e => e.stopPropagation()}>
          {editingCol === col._id ? renderCellEditor(col) : (
            <div className={`cell-value ${getColumnValue(col) === null ? 'empty' : ''}`}
              onClick={() => startCellEdit(col, task.columnValues?.[col._id] ?? task.columnValues?.get?.(col._id) ?? '')}>
              {getColumnValue(col) || 'Set value'}
            </div>
          )}
        </td>
      ))}

      <td onClick={e => e.stopPropagation()} className="row-action-cell">
        {selected && (
          <button type="button" className="btn btn-ghost btn-xs row-action-btn row-action-open" onClick={onClick} title="Open task">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        )}
      </td>
    </tr>
  );
}
