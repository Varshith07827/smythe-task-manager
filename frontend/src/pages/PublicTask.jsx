import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { sharesApi } from '../api/shares';
import { useBranding } from '../context/BrandingContext';
import { alert } from '../components/AlertSystem';
import { motion } from 'framer-motion';
import { format } from 'date-fns';

const STATUS_COLORS = {
  pending: '#6b7280', in_progress: '#3b82f6', review: '#a855f7',
  completed: '#22c55e', cancelled: '#ef4444', blocked: '#f59e0b'
};
const PRIORITY_COLORS = { low: '#22c55e', medium: '#f59e0b', high: '#ef4444', critical: '#dc2626' };

function initials(name) {
  return name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';
}

export default function PublicTask() {
  const { token } = useParams();
  const branding = useBranding();
  const appName = branding.appTitle || 'TaskIT';

  const [task, setTask] = useState(null);
  const [board, setBoard] = useState(null);
  const [permission, setPermission] = useState('view');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Editing state
  const [editField, setEditField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  // Comment state
  const [commentText, setCommentText] = useState('');
  const [addingComment, setAddingComment] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const fileRef = useRef(null);

  const canEdit = permission === 'edit';
  const customStatuses = board?.customStatuses || [];
  const customPriorities = board?.customPriorities || [];
  const statusOptions = useMemo(
    () => [...new Set([...Object.keys(STATUS_COLORS), ...customStatuses.map(s => s.value), task?.status].filter(Boolean))],
    [customStatuses, task?.status]
  );
  const priorityOptions = useMemo(
    () => [...new Set([...Object.keys(PRIORITY_COLORS), ...customPriorities.map(p => p.value), task?.priority].filter(Boolean))],
    [customPriorities, task?.priority]
  );

  useEffect(() => {
    loadTask();
  }, [token]);

  const loadTask = async () => {
    try {
      setLoading(true);
      const res = await sharesApi.getPublicTask(token);
      setTask(res.data.task);
      setBoard(res.data.board);
      setPermission(res.data.permission);
    } catch (err) {
      const reason = err.response?.data?.reason;
      if (reason === 'revoked') setError('This share link has been revoked.');
      else if (reason === 'expired') setError('This share link has expired.');
      else setError('This share link is invalid or no longer available.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (field, value) => {
    setSaving(true);
    try {
      const res = await sharesApi.publicUpdateTask(token, { [field]: value });
      setTask(res.data);
      setEditField(null);
    } catch {
      // revert
    } finally {
      setSaving(false);
    }
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    setAddingComment(true);
    try {
      const res = await sharesApi.publicAddComment(token, { text: commentText.trim() });
      setTask(prev => ({ ...prev, comments: [...(prev.comments || []), res.data] }));
      setCommentText('');
    } catch {} finally {
      setAddingComment(false);
    }
  };

  const handleUploadAttachments = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploadingFiles(true);
    try {
      for (const file of files) {
        const res = await sharesApi.publicUploadAttachment(token, file);
        setTask(prev => ({ ...prev, attachments: [...(prev.attachments || []), res.data] }));
      }
      alert.success(`${files.length} file${files.length > 1 ? 's' : ''} uploaded`);
    } catch (err) {
      alert.error(err.response?.data?.error || 'Could not upload file');
    } finally {
      setUploadingFiles(false);
      e.target.value = '';
    }
  };

  if (loading) {
    return (
      <div className="public-board-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="public-board-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" />
          </svg>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: '16px 0 8px', color: 'var(--text-primary)' }}>Link unavailable</h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="public-board-page">
      {/* Banner */}
      <div className="public-board-banner">
        <div className="public-board-banner-left">
          <span style={{ fontWeight: 600 }}>{appName}</span>
          <span className="public-board-banner-tag">SHARED TASK</span>
          {!canEdit && <span className="public-board-banner-tag" style={{ background: 'rgba(255,255,255,0.15)' }}>VIEW ONLY</span>}
        </div>
      </div>

      {/* Content */}
      <div className="public-board-content" style={{ maxWidth: 800, margin: '0 auto', width: '100%' }}>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          {/* Header */}
          <div style={{ padding: '24px 0 16px' }}>
            {board && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6 }}>Board: {board.title}</div>}
            {editField === 'title' ? (
              <input
                className="form-input"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={() => { if (editValue.trim()) handleSave('title', editValue.trim()); else setEditField(null); }}
                onKeyDown={e => { if (e.key === 'Enter' && editValue.trim()) handleSave('title', editValue.trim()); if (e.key === 'Escape') setEditField(null); }}
                autoFocus
                style={{ fontSize: 22, fontWeight: 700, padding: '8px 12px' }}
              />
            ) : (
              <h1
                style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0, cursor: canEdit ? 'pointer' : 'default' }}
                onClick={() => { if (canEdit) { setEditField('title'); setEditValue(task.title); } }}
              >
                {task.title}
              </h1>
            )}
          </div>

          {/* Meta row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            {/* Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[task.status] || '#6b7280' }} />
              {canEdit ? (
                <select
                  className="toolbar-select"
                  value={task.status}
                  onChange={e => handleSave('status', e.target.value)}
                  style={{ border: 'none', background: 'none', padding: 0, fontSize: 13 }}
                >
                  {statusOptions.map(s => (
                    <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              ) : (
                <span style={{ fontSize: 13 }}>{task.status?.replace('_', ' ')}</span>
              )}
            </div>

            {/* Priority */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_COLORS[task.priority] || '#f59e0b' }} />
              {canEdit ? (
                <select
                  className="toolbar-select"
                  value={task.priority}
                  onChange={e => handleSave('priority', e.target.value)}
                  style={{ border: 'none', background: 'none', padding: 0, fontSize: 13 }}
                >
                  {priorityOptions.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              ) : (
                <span style={{ fontSize: 13 }}>{task.priority}</span>
              )}
            </div>

            {/* Due date */}
            {task.dueDate && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: 13 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                {format(new Date(task.dueDate), 'MMM d, yyyy')}
              </div>
            )}

            {/* Assigned */}
            {task.assignedTo?.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {task.assignedTo.map(u => (
                  <div key={u._id} className="user-avatar" style={{ width: 28, height: 28, fontSize: 10 }} title={u.name}>
                    {u.avatar ? <img src={u.avatar} alt={u.name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : initials(u.name)}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Description */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Description</h3>
            {editField === 'description' ? (
              <textarea
                className="form-input"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={() => { handleSave('description', editValue); }}
                autoFocus
                rows={5}
                style={{ fontSize: 14, lineHeight: 1.6 }}
              />
            ) : (
              <div
                onClick={() => { if (canEdit) { setEditField('description'); setEditValue(task.description || ''); } }}
                style={{ fontSize: 14, color: task.description ? 'var(--text-primary)' : 'var(--text-tertiary)', lineHeight: 1.6, whiteSpace: 'pre-wrap', cursor: canEdit ? 'pointer' : 'default', minHeight: 40 }}
              >
                {task.description || (canEdit ? 'Click to add description...' : 'No description')}
              </div>
            )}
          </div>

          {/* Attachments */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
              Files {task.attachments?.length > 0 && `(${task.attachments.length})`}
            </h3>
            {canEdit && (
              <div
                className="upload-area"
                style={{ marginBottom: 14 }}
                onClick={() => fileRef.current?.click()}
              >
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                  onChange={handleUploadAttachments}
                  style={{ display: 'none' }}
                />
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p style={{ fontSize: 13, fontWeight: 500, margin: '6px 0 2px' }}>
                  {uploadingFiles ? 'Uploading...' : 'Click to upload files'}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>
                  Images, PDFs, Office docs, TXT/CSV (max 25MB each)
                </p>
              </div>
            )}

            {task.attachments?.length > 0 ? (
              <div className="attachments-grid">
                {task.attachments.map(att => {
                  const ext = att.filename?.split('.').pop()?.toLowerCase();
                  const isImage = att.mimeType?.startsWith('image/');
                  const tokenParam = encodeURIComponent(token);
                  const viewHref = `/api/shares/public/${tokenParam}/attachments/${att._id}/view`;
                  const downloadHref = `/api/shares/public/${tokenParam}/attachments/${att._id}/download`;
                  return (
                    <div key={att._id} className="attachment-card">
                      {isImage ? (
                        <a className="attachment-thumb" href={viewHref} target="_blank" rel="noreferrer">
                          <img src={viewHref} alt={att.filename} />
                        </a>
                      ) : (
                        <div className="attachment-thumb attachment-thumb-file">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                          <span style={{ fontSize: 8, textTransform: 'uppercase', fontWeight: 600, color: 'var(--accent)' }}>{ext}</span>
                        </div>
                      )}
                      <div className="attachment-info">
                        <span className="attachment-name">{att.filename}</span>
                        <span className="attachment-meta">
                          {att.size ? `${(att.size / 1024).toFixed(0)} KB` : ''}
                          {att.uploadedBy?.name ? ` · ${att.uploadedBy.name}` : ''}
                        </span>
                      </div>
                      <div className="attachment-actions">
                        <a className="attachment-open" href={viewHref} target="_blank" rel="noreferrer" title="Open">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </a>
                        <a className="attachment-open" href={downloadHref} title="Download">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', fontStyle: 'italic', margin: 0 }}>No files attached yet.</p>
            )}
          </div>

          {/* Comments */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 24 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
              Comments {task.comments?.length > 0 && `(${task.comments.length})`}
            </h3>

            {task.comments?.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: canEdit ? 16 : 0 }}>
                {task.comments.map((c, i) => (
                  <div key={c._id || i} style={{ display: 'flex', gap: 10 }}>
                    <div className="user-avatar" style={{ width: 28, height: 28, fontSize: 10, flexShrink: 0 }}>
                      {initials(c.author?.name)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{c.author?.name || 'Unknown'}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          {c.createdAt ? format(new Date(c.createdAt), 'MMM d, h:mm a') : ''}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.text}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {canEdit && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea
                  className="form-input"
                  placeholder="Add a comment..."
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  rows={2}
                  style={{ flex: 1, fontSize: 13, resize: 'vertical' }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && commentText.trim()) { e.preventDefault(); handleAddComment(); } }}
                />
                <button className="btn btn-primary btn-sm" onClick={handleAddComment} disabled={addingComment || !commentText.trim()}>
                  {addingComment ? '...' : 'Post'}
                </button>
              </div>
            )}

            {!canEdit && task.comments?.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No comments yet.</p>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
