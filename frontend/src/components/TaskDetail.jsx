import { useState, useEffect, useRef } from 'react';
import { tasksApi } from '../api/tasks';
import { boardsApi } from '../api/boards';
import { attachmentsApi } from '../api/attachments';
import { usersApi } from '../api/users';
import { useAuth } from '../context/AuthContext';
import { format, formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { alert } from './AlertSystem';
import DocumentPreview from './DocumentPreview';
import { authUrl } from '../utils/authUrl';

const DEFAULT_STATUSES = {
  pending: { color: 'var(--accent)', label: 'Pending' },
  in_progress: { color: 'var(--orange)', label: 'In Progress' },
  completed: { color: 'var(--green)', label: 'Completed' },
  blocked: { color: 'var(--red)', label: 'Blocked' },
  cancelled: { color: 'var(--text-tertiary)', label: 'Cancelled' }
};

const DEFAULT_PRIORITIES = {
  low: { color: 'var(--green)', label: 'Low' },
  medium: { color: 'var(--teal)', label: 'Medium' },
  high: { color: 'var(--orange)', label: 'High' },
  critical: { color: 'var(--red)', label: 'Critical' }
};

const LOG_LABELS = {
  created: 'Task created',
  updated: 'Updated',
  status_changed: 'Status changed',
  assigned: 'Assigned',
  unassigned: 'Unassigned',
  commented: 'Comment added',
  attachment_added: 'File attached',
  attachment_removed: 'File removed',
  reminder_sent: 'Reminder sent',
  notification_updated: 'Notification settings changed'
};

/* ── collapsible sub-section ── */
function SubSection({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: 8 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: '8px 12px', background: 'var(--bg-primary)',
          border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)' }}>{title}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2.5" strokeLinecap="round"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div style={{ padding: '10px 12px', background: 'var(--bg-primary)', borderTop: '1px solid var(--border)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

/* ── row inside a section ── */
function FieldRow({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
      <span style={{ fontSize: 12, color: 'var(--text-tertiary)', minWidth: 90, paddingTop: 2, fontWeight: 500 }}>{label}</span>
      <div style={{ flex: 1, fontSize: 13 }}>{children}</div>
    </div>
  );
}

export default function TaskDetail({ task: initialTask, board, boardId, onClose, onUpdated, panelWidth, onResizeStart, onBoardUpdated }) {
  const { user } = useAuth();
  const [task, setTask] = useState(initialTask);
  const [commentText, setCommentText] = useState('');
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [previewAtt, setPreviewAtt] = useState(null);
  const fileRef = useRef(null);

  /* tabs */
  const [activeTab, setActiveTab] = useState('details');

  /* remind / notify */
  const [showRemindModal, setShowRemindModal] = useState(false);
  const [remindText, setRemindText] = useState('');
  const [sendingRemind, setSendingRemind] = useState(false);

  /* assignees */
  const [editingAssignees, setEditingAssignees] = useState(false);
  const [members, setMembers] = useState([]);
  const [selectedAssignees, setSelectedAssignees] = useState([]);
  const [assigneeSearch, setAssigneeSearch] = useState('');

  /* custom status/priority */
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const [customStatusMode, setCustomStatusMode] = useState(false);
  const [customPriorityMode, setCustomPriorityMode] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customColor, setCustomColor] = useState('#0a84ff');

  /* per-task notifications */
  const [notifSettings, setNotifSettings] = useState(null);
  const [savingNotif, setSavingNotif] = useState(false);

  const isManager = user?.role === 'admin';

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = () => { setShowStatusMenu(false); setShowPriorityMenu(false); setCustomStatusMode(false); setCustomPriorityMode(false); };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  useEffect(() => {
    tasksApi.getOne(boardId, initialTask._id).then(res => {
      setTask(res.data);
      setTitle(res.data.title);
      setDescription(res.data.description || '');
      setNotifSettings(res.data.taskNotifications || {});
    }).catch(() => {});
    attachmentsApi.getAll(initialTask._id).then(res => setAttachments(res.data || [])).catch(() => {});
  }, [boardId, initialTask._id]);

  /* ── handlers ── */
  const handleSave = async () => {
    try {
      const res = await tasksApi.update(boardId, task._id, { title, description });
      setTask(res.data); onUpdated(res.data); setEditing(false);
      alert.success('Task updated');
    } catch { alert.error('Could not save changes.'); }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    try {
      await tasksApi.addComment(boardId, task._id, { text: commentText });
      const res = await tasksApi.getOne(boardId, task._id);
      setTask(res.data); setCommentText('');
    } catch { alert.error('Could not add comment.'); }
  };

  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentText, setEditingCommentText] = useState('');

  const handleSaveComment = async (commentId) => {
    if (!editingCommentText.trim()) return;
    try {
      await tasksApi.updateComment(boardId, task._id, commentId, { text: editingCommentText });
      const res = await tasksApi.getOne(boardId, task._id);
      setTask(res.data);
      setEditingCommentId(null);
    } catch { alert.error('Could not update comment.'); }
  };

  const handleDeleteComment = async (commentId) => {
    try {
      await tasksApi.deleteComment(boardId, task._id, commentId);
      const res = await tasksApi.getOne(boardId, task._id);
      setTask(res.data);
    } catch { alert.error('Could not delete comment.'); }
  };

  const handleStatusChange = async (status) => {
    try {
      const res = await tasksApi.update(boardId, task._id, { status });
      setTask(res.data); onUpdated(res.data);
    } catch { alert.error('Could not update status.'); }
  };

  const handlePriorityChange = async (priority) => {
    try {
      const res = await tasksApi.update(boardId, task._id, { priority });
      setTask(res.data); onUpdated(res.data);
    } catch { alert.error('Could not update priority.'); }
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
      const res = await tasksApi.update(boardId, task._id, { status: value });
      setTask(res.data); onUpdated(res.data);
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
      setTask(res.data); onUpdated(res.data);
    } catch { alert.error('Could not save custom priority.'); }
    setShowPriorityMenu(false); setCustomPriorityMode(false); setCustomName(''); setCustomColor('#0a84ff');
  };

  const handleDueDateChange = async (dueDate) => {
    try {
      const res = await tasksApi.update(boardId, task._id, { dueDate: dueDate || null });
      setTask(res.data); onUpdated(res.data);
    } catch { alert.error('Could not update due date.'); }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const res = await attachmentsApi.upload(task._id, file);
        setAttachments(prev => [...prev, res.data]);
      }
      alert.success(`${files.length} file${files.length > 1 ? 's' : ''} uploaded`);
    } catch { alert.error('Upload failed.'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const handleDeleteAttachment = async (id) => {
    try {
      await attachmentsApi.delete(id);
      setAttachments(prev => prev.filter(a => a._id !== id));
    } catch { alert.error('Could not delete file.'); }
  };

  const startEditAssignees = async () => {
    setSelectedAssignees((task.assignedTo || []).map(u => u._id));
    setEditingAssignees(true);
    if (members.length === 0) {
      try { const res = await usersApi.getMembers(); setMembers(res.data); }
      catch { alert.error('Could not load team users.'); }
    }
  };

  const toggleAssignee = (id) => setSelectedAssignees(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const saveAssignees = async () => {
    try {
      const res = await tasksApi.update(boardId, task._id, { assignedTo: selectedAssignees });
      setTask(res.data); onUpdated(res.data); setEditingAssignees(false);
      alert.success('Assignees updated');
    } catch { alert.error('Could not update assignees.'); }
  };

  const handleRemind = async () => {
    setSendingRemind(true);
    try {
      await tasksApi.remind(boardId, task._id, { text: remindText.trim() });
      const res = await tasksApi.getOne(boardId, task._id);
      setTask(res.data);
      alert.success('Reminder sent');
      setShowRemindModal(false); setRemindText('');
    } catch (err) { alert.error(err.response?.data?.error || 'Could not send reminder.'); }
    finally { setSendingRemind(false); }
  };

  const saveNotifSettings = async () => {
    setSavingNotif(true);
    try {
      const res = await tasksApi.updateNotifications(boardId, task._id, notifSettings);
      setNotifSettings(res.data);
      const fresh = await tasksApi.getOne(boardId, task._id);
      setTask(fresh.data);
      alert.success('Notification settings saved');
    } catch { alert.error('Could not save notification settings.'); }
    finally { setSavingNotif(false); }
  };

  const handleColumnChange = async (colId, value) => {
    try {
      const columnValues = { ...(task.columnValues || {}), [colId]: value };
      const res = await tasksApi.update(boardId, task._id, { columnValues });
      setTask(res.data); onUpdated(res.data);
    } catch { alert.error('Could not update field.'); }
  };

  const initials = (name) => name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';

  // Build combined status/priority maps including custom ones from board
  const customStatusMap = {};
  (board?.customStatuses || []).forEach(s => { customStatusMap[s.value] = { color: s.color || 'var(--accent)', label: s.label }; });
  const customPriorityMap = {};
  (board?.customPriorities || []).forEach(p => { customPriorityMap[p.value] = { color: p.color || 'var(--teal)', label: p.label }; });
  const allStatuses = { ...DEFAULT_STATUSES, ...customStatusMap };
  const allPriorities = { ...DEFAULT_PRIORITIES, ...customPriorityMap };

  const statusInfo = allStatuses[task.status] || DEFAULT_STATUSES.pending;
  const priorityInfo = allPriorities[task.priority] || DEFAULT_PRIORITIES.medium;
  const visibleColumns = (board?.columns || []).filter(c => c.visible !== false);

  const tabs = [
    { key: 'details', label: 'Details' },
    { key: 'attachments', label: `Files${attachments.length > 0 ? ` (${attachments.length})` : ''}` },
    ...(isManager && notifSettings ? [{ key: 'notifications', label: 'Notifications' }] : []),
    { key: 'logs', label: 'Logs' },
  ];

  return (
    <motion.div
      className="task-detail"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      style={panelWidth ? { width: panelWidth } : undefined}
    >
      {/* Resize handle */}
      {onResizeStart && (
        <div className="task-detail-resize-handle" onMouseDown={onResizeStart} title="Drag to resize" />
      )}

      {/* Header */}
      <div className="task-detail-header" style={{ borderBottom: '1px solid var(--separator)' }}>
        <div style={{ height: 3, background: statusInfo.color, borderRadius: '3px 3px 0 0', position: 'absolute', top: 0, left: 0, right: 0 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: statusInfo.color, flexShrink: 0, boxShadow: `0 0 0 3px ${statusInfo.color}22` }} />
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>{task.title}</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {isManager && (
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => setShowRemindModal(true)}
              title="Send reminder"
              style={{ color: 'var(--orange)', fontSize: 12, fontWeight: 600 }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>
              Remind
            </button>
          )}
          <button className="modal-close" onClick={onClose} style={{ width: 28, height: 28 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      </div>

      {/* Section tabs */}
      <div className="filter-pills" style={{ padding: '4px 20px', margin: 0, borderBottom: '1px solid var(--separator)' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            className={`filter-pill${activeTab === t.key ? ' active' : ''}`}
            onClick={() => setActiveTab(t.key)}
            style={{ fontSize: 12, padding: '8px 14px' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Body — one section at a time */}
      <div className="task-detail-body">

        {/* ═══ DETAILS TAB ═══ */}
        {activeTab === 'details' && (
          <div>
            <SubSection title="Task Information" defaultOpen>
              {/* Description */}
              <div style={{ marginBottom: 14 }}>
                {isManager && editing ? (
                  <>
                    <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} style={{ marginBottom: 8, fontWeight: 600 }} />
                    <textarea className="form-input" value={description} onChange={e => setDescription(e.target.value)} rows={5} style={{ lineHeight: 1.6, fontSize: 13 }} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button className="btn btn-primary btn-xs" onClick={handleSave}>Save</button>
                      <button className="btn btn-ghost btn-xs" onClick={() => setEditing(false)}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <div
                    onClick={isManager ? () => setEditing(true) : undefined}
                    style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', minHeight: 48, fontSize: 13, color: task.description ? 'var(--text-secondary)' : 'var(--text-tertiary)', fontStyle: task.description ? 'normal' : 'italic', lineHeight: 1.6, whiteSpace: 'pre-wrap', cursor: isManager ? 'pointer' : 'default' }}
                  >
                    {task.description || (isManager ? 'Click to add description...' : 'No description')}
                  </div>
                )}
              </div>

              <FieldRow label="Status">
                <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => { setShowStatusMenu(s => !s); setShowPriorityMenu(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px',
                      border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-secondary)', cursor: 'pointer', fontSize: 13, width: '100%',
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusInfo.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, textAlign: 'left', color: 'var(--text-primary)' }}>{statusInfo.label}</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>
                  {showStatusMenu && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 100,
                      background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden',
                    }}>
                      {Object.entries(allStatuses).map(([val, info]) => (
                        <button key={val} type="button"
                          onClick={() => { handleStatusChange(val); setShowStatusMenu(false); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 12px',
                            border: 'none', background: val === task.status ? 'var(--bg-hover)' : 'none',
                            cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)', textAlign: 'left',
                          }}
                          onMouseOver={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                          onMouseOut={e => e.currentTarget.style.background = val === task.status ? 'var(--bg-hover)' : 'none'}
                        >
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: info.color, flexShrink: 0 }} />
                          {info.label}
                          {val === task.status && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" style={{ marginLeft: 'auto' }}><polyline points="20 6 9 17 4 12" /></svg>}
                        </button>
                      ))}
                      {isManager && (
                      <div style={{ borderTop: '1px solid var(--border)' }}>
                        {!customStatusMode ? (
                          <button type="button"
                            onClick={() => { setCustomStatusMode(true); setCustomName(''); setCustomColor('#0a84ff'); }}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '7px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--accent)' }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                            Add custom status
                          </button>
                        ) : (
                          <div style={{ padding: '8px 12px' }}>
                            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                              <input type="color" value={customColor} onChange={e => setCustomColor(e.target.value)} style={{ width: 28, height: 28, border: 'none', padding: 0, cursor: 'pointer', borderRadius: 4 }} />
                              <input type="text" className="form-input" placeholder="Status name..." value={customName} onChange={e => setCustomName(e.target.value)} autoFocus style={{ fontSize: 12, padding: '4px 8px', flex: 1 }} onKeyDown={e => e.key === 'Enter' && handleSaveCustomStatus()} />
                            </div>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button className="btn btn-ghost btn-xs" onClick={() => setCustomStatusMode(false)}>Cancel</button>
                              <button className="btn btn-primary btn-xs" onClick={handleSaveCustomStatus}>Add</button>
                            </div>
                          </div>
                        )}
                      </div>
                      )}
                    </div>
                  )}
                </div>
              </FieldRow>

              <FieldRow label="Priority">
                {isManager ? (
                <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => { setShowPriorityMenu(s => !s); setShowStatusMenu(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px',
                      border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-secondary)', cursor: 'pointer', fontSize: 13, width: '100%',
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: priorityInfo.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, textAlign: 'left', color: 'var(--text-primary)' }}>{priorityInfo.label}</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>
                  {showPriorityMenu && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 100,
                      background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden',
                    }}>
                      {Object.entries(allPriorities).map(([val, info]) => (
                        <button key={val} type="button"
                          onClick={() => { handlePriorityChange(val); setShowPriorityMenu(false); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 12px',
                            border: 'none', background: val === task.priority ? 'var(--bg-hover)' : 'none',
                            cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)', textAlign: 'left',
                          }}
                          onMouseOver={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                          onMouseOut={e => e.currentTarget.style.background = val === task.priority ? 'var(--bg-hover)' : 'none'}
                        >
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: info.color, flexShrink: 0 }} />
                          {info.label}
                          {val === task.priority && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" style={{ marginLeft: 'auto' }}><polyline points="20 6 9 17 4 12" /></svg>}
                        </button>
                      ))}
                      <div style={{ borderTop: '1px solid var(--border)' }}>
                        {!customPriorityMode ? (
                          <button type="button"
                            onClick={() => { setCustomPriorityMode(true); setCustomName(''); setCustomColor('#0a84ff'); }}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '7px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--accent)' }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                            Add custom priority
                          </button>
                        ) : (
                          <div style={{ padding: '8px 12px' }}>
                            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                              <input type="color" value={customColor} onChange={e => setCustomColor(e.target.value)} style={{ width: 28, height: 28, border: 'none', padding: 0, cursor: 'pointer', borderRadius: 4 }} />
                              <input type="text" className="form-input" placeholder="Priority name..." value={customName} onChange={e => setCustomName(e.target.value)} autoFocus style={{ fontSize: 12, padding: '4px 8px', flex: 1 }} onKeyDown={e => e.key === 'Enter' && handleSaveCustomPriority()} />
                            </div>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button className="btn btn-ghost btn-xs" onClick={() => setCustomPriorityMode(false)}>Cancel</button>
                              <button className="btn btn-primary btn-xs" onClick={handleSaveCustomPriority}>Add</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: priorityInfo.color, flexShrink: 0 }} />
                    <span>{priorityInfo.label}</span>
                  </div>
                )}
              </FieldRow>

              <FieldRow label="Due Date">
                {isManager ? (
                  <input type="date" className="form-input" value={task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : ''} onChange={e => handleDueDateChange(e.target.value)} style={{ fontSize: 13, padding: '4px 8px' }} />
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '—'}</span>
                )}
              </FieldRow>

              <FieldRow label="Created">
                <span style={{ color: 'var(--text-secondary)' }}>
                  {task.createdAt ? formatDistanceToNow(new Date(task.createdAt), { addSuffix: true }) : '-'}
                </span>
              </FieldRow>

              {/* Assignees */}
              <FieldRow label="Assigned To">
                <div>
                  {editingAssignees ? (
                    <div>
                      {selectedAssignees.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                          {members.filter(m => selectedAssignees.includes(m._id)).map(m => (
                            <button key={m._id} type="button" className="assignee-chip assignee-chip-selected" onClick={() => toggleAssignee(m._id)} style={{ cursor: 'pointer', border: '1.5px solid var(--accent)', background: 'var(--accent-subtle)', fontSize: 11 }}>
                              <div className="user-avatar" style={{ width: 16, height: 16, fontSize: 7 }}>{initials(m.name)}</div>
                              {m.name}
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                          ))}
                        </div>
                      )}
                      <input type="text" className="form-input" placeholder="Search users..." value={assigneeSearch} onChange={e => setAssigneeSearch(e.target.value)} style={{ fontSize: 12, padding: '5px 8px', marginBottom: 4 }} autoFocus />
                      {assigneeSearch.trim() && (
                        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', maxHeight: 140, overflowY: 'auto', marginBottom: 6 }}>
                          {members.filter(m => m.status !== 'inactive' && !selectedAssignees.includes(m._id) && (m.name?.toLowerCase().includes(assigneeSearch.toLowerCase()) || m.email?.toLowerCase().includes(assigneeSearch.toLowerCase()))).map(m => (
                            <button key={m._id} type="button" onClick={() => { toggleAssignee(m._id); setAssigneeSearch(''); }} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '6px 10px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)' }} onMouseOver={e => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseOut={e => e.currentTarget.style.background = 'none'}>
                              <div className="user-avatar" style={{ width: 18, height: 18, fontSize: 7 }}>{initials(m.name)}</div>
                              <div><div style={{ fontWeight: 550 }}>{m.name}</div><div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{m.email}</div></div>
                            </button>
                          ))}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-primary btn-xs" onClick={saveAssignees}>Save</button>
                        <button className="btn btn-ghost btn-xs" onClick={() => { setEditingAssignees(false); setAssigneeSearch(''); }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                      {task.assignedTo?.length > 0 ? task.assignedTo.map(u => (
                        <div key={u._id} className="assignee-chip" style={{ fontSize: 11 }}>
                          <div className="user-avatar" style={{ width: 18, height: 18, fontSize: 7 }}>{initials(u.name)}</div>
                          {u.name}
                        </div>
                      )) : <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic', fontSize: 12 }}>No assignees</span>}
                      <button className="btn btn-ghost btn-xs" onClick={startEditAssignees} style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 4 }}>Edit</button>
                    </div>
                  )}
                </div>
              </FieldRow>

            </SubSection>

            {/* Other Details (custom columns) */}
            {visibleColumns.length > 0 && (
              <SubSection title="Other Details" defaultOpen>
                {visibleColumns.map(col => {
                  const val = task.columnValues?.[col._id] || task.columnValues?.get?.(col._id) || '';
                  return (
                    <FieldRow key={col._id} label={col.name}>
                      {col.type === 'select' ? (
                        <select className="form-input" value={val} onChange={e => handleColumnChange(col._id, e.target.value)} style={{ fontSize: 13, padding: '4px 8px' }}>
                          <option value="">-- Select --</option>
                          {(col.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : col.type === 'number' ? (
                        <input type="number" className="form-input" value={val} onChange={e => handleColumnChange(col._id, e.target.value)} placeholder="Enter value" style={{ fontSize: 13, padding: '4px 8px' }} />
                      ) : col.type === 'date' ? (
                        <input type="date" className="form-input" value={val} onChange={e => handleColumnChange(col._id, e.target.value)} style={{ fontSize: 13, padding: '4px 8px' }} />
                      ) : col.type === 'checkbox' ? (
                        <input type="checkbox" checked={val === true || val === 'true'} onChange={e => handleColumnChange(col._id, e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
                      ) : (
                        <input type="text" className="form-input" value={val} onChange={e => handleColumnChange(col._id, e.target.value)} placeholder="Enter value" style={{ fontSize: 13, padding: '4px 8px' }} />
                      )}
                    </FieldRow>
                  );
                })}
              </SubSection>
            )}

            {/* Comments */}
            <SubSection title={`Task Notes (${task.comments?.length || 0})`} defaultOpen>
              <form onSubmit={handleAddComment} style={{ marginBottom: 12 }}>
                <textarea className="form-input" placeholder="Add a note..." value={commentText} onChange={e => setCommentText(e.target.value)} rows={2} style={{ marginBottom: 6, fontSize: 13 }} />
                <button type="submit" className="btn btn-primary btn-xs" disabled={!commentText.trim()}>Add Note</button>
              </form>
              {task.comments?.slice().reverse().map((c) => {
                const isOwn = c.author?._id === user?._id || c.author?._id?.toString() === user?._id?.toString();
                const isEditing = editingCommentId === c._id?.toString();
                return (
                  <div key={c._id} style={{
                    padding: '10px 12px', marginBottom: 8,
                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div className="user-avatar" style={{ width: 22, height: 22, fontSize: 8 }}>{initials(c.author?.name)}</div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{c.author?.name || 'Unknown'}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{c.createdAt ? formatDistanceToNow(new Date(c.createdAt), { addSuffix: true }) : ''}</span>
                      {c.editedAt && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>(edited)</span>}
                      {isOwn && !isEditing && (
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                          <button
                            className="btn btn-ghost btn-xs"
                            style={{ fontSize: 11, padding: '2px 6px' }}
                            onClick={() => { setEditingCommentId(c._id?.toString()); setEditingCommentText(c.text); }}
                          >Edit</button>
                          <button
                            className="btn btn-ghost btn-xs"
                            style={{ fontSize: 11, padding: '2px 6px', color: 'var(--red)' }}
                            onClick={() => handleDeleteComment(c._id?.toString())}
                          >Delete</button>
                        </div>
                      )}
                    </div>
                    {isEditing ? (
                      <div>
                        <textarea
                          className="form-input"
                          value={editingCommentText}
                          onChange={e => setEditingCommentText(e.target.value)}
                          rows={3}
                          autoFocus
                          style={{ fontSize: 13, marginBottom: 6 }}
                        />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-primary btn-xs" onClick={() => handleSaveComment(c._id?.toString())} disabled={!editingCommentText.trim()}>Save</button>
                          <button className="btn btn-ghost btn-xs" onClick={() => setEditingCommentId(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.text}</p>
                    )}
                  </div>
                );
              })}
            </SubSection>
          </div>
        )}

        {/* ═══ ATTACHMENTS TAB ═══ */}
        {activeTab === 'attachments' && (
          <div>
            <div className="upload-area" onClick={() => fileRef.current?.click()} style={{ marginBottom: 10 }}>
              <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" onChange={handleFileUpload} style={{ display: 'none' }} />
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              <p style={{ fontSize: 13, fontWeight: 500, margin: '6px 0 2px' }}>{uploading ? 'Uploading...' : 'Click to upload'}</p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>Images, PDFs, documents up to 25MB</p>
            </div>
            {attachments.length > 0 ? (
              <div className="attachments-grid" style={{ marginBottom: 10 }}>
                {attachments.map(att => {
                  const isImage = att.mimeType?.startsWith('image/');
                  const ext = att.filename?.split('.').pop()?.toLowerCase();
                  const canPreview = isImage || ext === 'pdf' || ['txt', 'csv'].includes(ext);
                  return (
                    <motion.div key={att._id} className="attachment-card" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                      {isImage ? (
                        <div className="attachment-thumb" onClick={() => setPreviewAtt(att)} style={{ cursor: 'pointer' }}>
                          <img src={authUrl(`/api/attachments/${att._id}/view`)} alt={att.filename} />
                        </div>
                      ) : (
                        <div className="attachment-thumb attachment-thumb-file">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                          <span style={{ fontSize: 8, textTransform: 'uppercase', fontWeight: 600, color: 'var(--accent)' }}>{ext}</span>
                        </div>
                      )}
                      <div className="attachment-info">
                        <span className="attachment-name">{att.filename}</span>
                        <span className="attachment-meta">{att.size ? `${(att.size / 1024).toFixed(0)} KB` : ''}{att.uploadedBy?.name ? ` · ${att.uploadedBy.name}` : ''}</span>
                      </div>
                      <div className="attachment-actions">
                        {canPreview && <button className="attachment-open" onClick={() => setPreviewAtt(att)} title="Preview"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg></button>}
                        <a className="attachment-open" href={authUrl(`/api/attachments/${att._id}/download`)} download={att.filename} title="Download" onClick={e => e.stopPropagation()}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg></a>
                        <button className="attachment-delete" onClick={() => handleDeleteAttachment(att._id)} title="Delete"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', fontStyle: 'italic', textAlign: 'center', padding: '16px 0' }}>No files yet</p>
            )}
          </div>
        )}

        {/* ═══ NOTIFICATIONS TAB ═══ */}
        {activeTab === 'notifications' && isManager && notifSettings && (
          <div>
            <SubSection title="Reminders" defaultOpen>
              {/* Interval reminder */}
              <div style={{ marginBottom: 14, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: notifSettings.intervalReminder?.enabled ? 8 : 0 }}>
                  <input type="checkbox" checked={notifSettings.intervalReminder?.enabled || false}
                    onChange={e => setNotifSettings(p => ({ ...p, intervalReminder: { ...p.intervalReminder, enabled: e.target.checked } }))}
                    style={{ accentColor: 'var(--accent)', width: 14, height: 14, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Repeat reminder every</span>
                </label>
                {notifSettings.intervalReminder?.enabled && (
                  <div style={{ marginLeft: 22 }}>
                    <select className="form-input" value={notifSettings.intervalReminder?.hours || 6}
                      onChange={e => setNotifSettings(p => ({ ...p, intervalReminder: { ...p.intervalReminder, hours: Number(e.target.value) } }))}
                      style={{ padding: '5px 8px', fontSize: 12, width: '100%' }}>
                      <option value={2}>2 hours</option>
                      <option value={4}>4 hours</option>
                      <option value={6}>6 hours</option>
                      <option value={8}>8 hours</option>
                      <option value={12}>12 hours</option>
                      <option value={24}>24 hours</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Urgent mode */}
              <div style={{ marginBottom: 14, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: notifSettings.urgentMode?.enabled !== false ? 8 : 0 }}>
                  <input type="checkbox" checked={notifSettings.urgentMode?.enabled !== false}
                    onChange={e => setNotifSettings(p => ({ ...p, urgentMode: { ...p.urgentMode, enabled: e.target.checked } }))}
                    style={{ accentColor: 'var(--accent)', width: 14, height: 14, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Urgent mode</span>
                </label>
                {notifSettings.urgentMode?.enabled !== false && (
                  <div style={{ marginLeft: 22, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)', minWidth: 70 }}>When due in</span>
                      <select className="form-input" value={notifSettings.urgentMode?.thresholdDays || 3}
                        onChange={e => setNotifSettings(p => ({ ...p, urgentMode: { ...p.urgentMode, thresholdDays: Number(e.target.value) } }))}
                        style={{ padding: '5px 8px', fontSize: 12, flex: 1 }}>
                        <option value={1}>1 day</option>
                        <option value={2}>2 days</option>
                        <option value={3}>3 days</option>
                        <option value={5}>5 days</option>
                        <option value={7}>1 week</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)', minWidth: 70 }}>Interval</span>
                      <select className="form-input" value={notifSettings.urgentMode?.intervalHours || 4}
                        onChange={e => setNotifSettings(p => ({ ...p, urgentMode: { ...p.urgentMode, intervalHours: Number(e.target.value) } }))}
                        style={{ padding: '5px 8px', fontSize: 12, flex: 1 }}>
                        <option value={1}>Every hour</option>
                        <option value={2}>Every 2 hours</option>
                        <option value={4}>Every 4 hours</option>
                        <option value={6}>Every 6 hours</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Daily reminder */}
              <div style={{ marginBottom: 14, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: notifSettings.dailyReminder?.enabled ? 8 : 0 }}>
                  <input type="checkbox" checked={notifSettings.dailyReminder?.enabled || false}
                    onChange={e => setNotifSettings(p => ({ ...p, dailyReminder: { ...p.dailyReminder, enabled: e.target.checked } }))}
                    style={{ accentColor: 'var(--accent)', width: 14, height: 14, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Daily reminder</span>
                </label>
                {notifSettings.dailyReminder?.enabled && (
                  <div style={{ marginLeft: 22 }}>
                    <select className="form-input" value={notifSettings.dailyReminder?.hour ?? 9}
                      onChange={e => setNotifSettings(p => ({ ...p, dailyReminder: { ...p.dailyReminder, hour: Number(e.target.value) } }))}
                      style={{ padding: '5px 8px', fontSize: 12, width: '100%' }}>
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Quiet hours */}
              <div style={{ marginBottom: 14, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: notifSettings.quietHoursEnabled ? 8 : 0 }}>
                  <input type="checkbox" checked={notifSettings.quietHoursEnabled === true}
                    onChange={e => setNotifSettings(p => ({ ...p, quietHoursEnabled: e.target.checked }))}
                    style={{ accentColor: 'var(--accent)', width: 14, height: 14, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Quiet hours</span>
                </label>
                {notifSettings.quietHoursEnabled && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginLeft: 22 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 3 }}>Start</div>
                      <input type="time" className="form-input" value={notifSettings.quietHoursStart || '22:00'}
                        onChange={e => setNotifSettings(p => ({ ...p, quietHoursStart: e.target.value }))}
                        style={{ fontSize: 12, padding: '5px 8px', width: '100%' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 3 }}>End</div>
                      <input type="time" className="form-input" value={notifSettings.quietHoursEnd || '08:00'}
                        onChange={e => setNotifSettings(p => ({ ...p, quietHoursEnd: e.target.value }))}
                        style={{ fontSize: 12, padding: '5px 8px', width: '100%' }} />
                    </div>
                  </div>
                )}
              </div>
            </SubSection>

            <SubSection title="Status alerts">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={notifSettings.statusChanged !== false}
                  onChange={e => setNotifSettings(p => ({ ...p, statusChanged: e.target.checked }))}
                  style={{ accentColor: 'var(--accent)', width: 14, height: 14 }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Notify on status changes</span>
              </label>
              {Object.entries(allStatuses).map(([s, info]) => {
                const active = (notifSettings.notifyOnStatuses || []).includes(s);
                return (
                  <label key={s} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '7px 8px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                    marginBottom: 4, cursor: notifSettings.statusChanged === false ? 'not-allowed' : 'pointer',
                    opacity: notifSettings.statusChanged === false ? 0.45 : 1,
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: info.color, flexShrink: 0 }} />
                      {info.label}
                    </span>
                    <input type="checkbox" checked={active} disabled={notifSettings.statusChanged === false}
                      onChange={() => setNotifSettings(p => {
                        const cur = p.notifyOnStatuses || [];
                        return { ...p, notifyOnStatuses: active ? cur.filter(x => x !== s) : [...cur, s] };
                      })}
                      style={{ accentColor: 'var(--accent)', width: 14, height: 14 }} />
                  </label>
                );
              })}
            </SubSection>

            {notifSettings.lastRemindedAt && (
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '10px 0 8px' }}>
                Last manual reminder: {formatDistanceToNow(new Date(notifSettings.lastRemindedAt), { addSuffix: true })}
              </p>
            )}

            <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={saveNotifSettings} disabled={savingNotif}>
              {savingNotif ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}

        {/* ═══ LOGS TAB ═══ */}
        {activeTab === 'logs' && (
          <div>
            {task.history?.length > 0 ? (
              task.history.slice().reverse().slice(0, 50).map((h, i) => {
                const isFieldUpdate = h.action === 'updated' && h.field;
                const rawLabel = LOG_LABELS[h.action] || h.action?.replace(/_/g, ' ');
                const label = isFieldUpdate ? h.field.replace(/_/g, ' ') : rawLabel;
                const hasChange = h.oldValue !== undefined || h.newValue !== undefined;
                const isNotifLog = ['reminder_sent', 'notification_updated'].includes(h.action);
                return (
                  <div key={i} className="activity-item" style={{ borderLeft: isNotifLog ? '2px solid var(--orange)' : '2px solid var(--border)', paddingLeft: 10, marginBottom: 10 }}>
                    <div className="activity-content">
                      <div className="activity-text" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                        <strong style={{ textTransform: 'capitalize', fontSize: 12 }}>{label}</strong>
                        {hasChange && h.action !== 'notification_updated' && (
                          <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 11 }}>
                            {h.oldValue !== undefined && <span className="activity-old">{String(h.oldValue)}</span>}
                            {h.oldValue !== undefined && h.newValue !== undefined && <span className="activity-arrow">&rarr;</span>}
                            {h.newValue !== undefined && <span className="activity-new">{String(h.newValue)}</span>}
                          </span>
                        )}
                      </div>
                      <span className="activity-time" style={{ fontSize: 11 }}>
                        {h.changedBy?.name && <span style={{ color: 'var(--text-secondary)', marginRight: 4 }}>{h.changedBy.name} &middot;</span>}
                        {h.timestamp ? formatDistanceToNow(new Date(h.timestamp), { addSuffix: true }) : ''}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', fontStyle: 'italic', textAlign: 'center', padding: '16px 0' }}>No activity yet</p>
            )}
          </div>
        )}
      </div>

      {/* Remind modal */}
      <AnimatePresence>
        {showRemindModal && (
          <div className="modal-overlay" style={{ zIndex: 1000 }}>
            <motion.div className="modal" style={{ maxWidth: 380 }} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
              <div className="modal-header">
                <h3>Send Reminder</h3>
                <button className="modal-close" onClick={() => setShowRemindModal(false)}>&times;</button>
              </div>
              <div className="modal-body">
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
                  Sends an immediate notification to all assignees.
                </p>
                <textarea className="form-input" placeholder="Optional message..." value={remindText} onChange={e => setRemindText(e.target.value)} rows={3} style={{ marginBottom: 14 }} autoFocus />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowRemindModal(false)}>Cancel</button>
                  <button className="btn btn-primary btn-sm" onClick={handleRemind} disabled={sendingRemind}>{sendingRemind ? 'Sending...' : 'Send'}</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {previewAtt && <DocumentPreview attachment={previewAtt} onClose={() => setPreviewAtt(null)} />}
      </AnimatePresence>
    </motion.div>
  );
}
