import { useState, useRef } from 'react';
import { tasksApi } from '../api/tasks';
import { attachmentsApi } from '../api/attachments';
import { alert } from './AlertSystem';

const statusSvg = (paths) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths}</svg>;

const STATUS_CONFIG = {
  pending: {
    label: 'Pending',
    color: 'var(--accent)',
    icon: statusSvg(<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>),
    prompt: 'Add notes about why this task is pending',
    fields: ['notes'],
    placeholder: 'e.g. Waiting for approval, requirements unclear...'
  },
  in_progress: {
    label: 'In Progress',
    color: 'var(--orange)',
    icon: statusSvg(<><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></>),
    prompt: 'Update progress details',
    fields: ['notes', 'progress', 'images'],
    placeholder: 'What are you working on? Any blockers?'
  },
  completed: {
    label: 'Completed',
    color: 'var(--green)',
    icon: statusSvg(<><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>),
    prompt: 'Add completion report',
    fields: ['notes', 'images'],
    placeholder: 'Summary of what was done, results, outcome...'
  },
  blocked: {
    label: 'Blocked',
    color: 'var(--red)',
    icon: statusSvg(<><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></>),
    prompt: 'Describe what\'s blocking this task',
    fields: ['notes', 'images'],
    placeholder: 'What is the blocker? Who can help resolve it?'
  },
  cancelled: {
    label: 'Cancelled',
    color: 'var(--text-tertiary)',
    icon: statusSvg(<><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>),
    prompt: 'Reason for cancellation',
    fields: ['notes'],
    placeholder: 'Why is this being cancelled?'
  }
};

const CLOSED_STATUSES = ['completed', 'cancelled'];

export default function StatusWorkflowModal({ task, boardId, newStatus, onClose, onUpdated }) {
  const isReopening = CLOSED_STATUSES.includes(task.status) && !CLOSED_STATUSES.includes(newStatus);
  const config = STATUS_CONFIG[newStatus] || {
    label: newStatus.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    color: 'var(--accent)',
    icon: statusSvg(<><circle cx="12" cy="12" r="10"/></>),
    prompt: 'Add notes about this status change',
    fields: ['notes'],
    placeholder: 'Optional notes...'
  };
  const [notes, setNotes] = useState('');
  const [progress, setProgress] = useState(50);
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [saving, setSaving] = useState(false);
  const [sendReminder, setSendReminder] = useState(isReopening);
  const fileRef = useRef(null);

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files);
    setFiles(prev => [...prev, ...selected]);

    selected.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          setPreviews(prev => [...prev, { name: file.name, url: ev.target.result, type: 'image' }]);
        };
        reader.readAsDataURL(file);
      } else {
        setPreviews(prev => [...prev, { name: file.name, type: 'file' }]);
      }
    });
    e.target.value = '';
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      // Build comment text from workflow
      let commentText = `**Status → ${config.label}**`;
      if (notes.trim()) commentText += `\n${notes.trim()}`;
      if (config.fields.includes('progress')) commentText += `\nProgress: ${progress}%`;

      // Update status
      const res = await tasksApi.update(boardId, task._id, { status: newStatus });

      // Add workflow comment if there's content
      if (notes.trim() || config.fields.includes('progress')) {
        await tasksApi.addComment(boardId, task._id, { text: commentText });
      }

      // Upload attachments
      for (const file of files) {
        try {
          await attachmentsApi.upload(task._id, file);
        } catch {
          alert.error(`Failed to upload ${file.name}`);
        }
      }

      // Send reminder to assignees if reopening and checkbox is checked
      if (sendReminder && isReopening) {
        try {
          await tasksApi.remind(boardId, task._id, { text: `Task reopened — moved to ${config.label}` });
        } catch { /* non-critical */ }
      }

      onUpdated(res.data);
      onClose();
      alert.success(`Status updated to ${config.label}`);
    } catch {
      alert.error('Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickUpdate = async () => {
    setSaving(true);
    try {
      const res = await tasksApi.update(boardId, task._id, { status: newStatus });
      if (sendReminder && isReopening) {
        try {
          await tasksApi.remind(boardId, task._id, { text: `Task reopened — moved to ${config.label}` });
        } catch { /* non-critical */ }
      }
      onUpdated(res.data);
      onClose();
    } catch {
      alert.error('Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal workflow-modal" style={{ maxWidth: 500 }}>
        {/* Header with status indicator */}
        <div className="modal-header" style={{ gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="workflow-status-dot" style={{ background: config.color }} />
            <div>
              <h3 style={{ margin: 0 }}>Move to {config.label}</h3>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0, fontWeight: 400 }}>{task.title}</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body" style={{ padding: '16px 24px 20px' }}>
          {/* Prompt */}
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>{config.prompt}</p>

          {/* Notes textarea */}
          <div style={{ marginBottom: 16 }}>
            <textarea
              className="form-input"
              placeholder={config.placeholder}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              style={{ resize: 'vertical' }}
              autoFocus
            />
          </div>

          {/* Progress slider for in_progress */}
          {config.fields.includes('progress') && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 550, color: 'var(--text-secondary)' }}>Progress</label>
                <span style={{ fontSize: 13, fontWeight: 600, color: config.color }}>{progress}%</span>
              </div>
              <div className="progress-slider-track">
                <div className="progress-slider-fill" style={{ width: `${progress}%`, background: config.color }} />
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={progress}
                onChange={e => setProgress(Number(e.target.value))}
                className="progress-slider-input"
              />
            </div>
          )}

          {/* Image/File upload for applicable statuses */}
          {config.fields.includes('images') && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 550, color: 'var(--text-secondary)' }}>Attachments</label>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => fileRef.current?.click()}
                  style={{ color: 'var(--accent)' }}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2a.5.5 0 01.5.5v5h5a.5.5 0 010 1h-5v5a.5.5 0 01-1 0v-5h-5a.5.5 0 010-1h5v-5A.5.5 0 018 2z"/></svg>
                  Add files
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
              </div>

              {/* File previews */}
              {previews.length > 0 && (
                <div className="attachment-preview-grid">
                  {previews.map((p, i) => (
                    <div key={i} className="attachment-preview-item">
                      {p.type === 'image' ? (
                        <img src={p.url} alt={p.name} />
                      ) : (
                        <div className="attachment-preview-file">
                          <svg width="20" height="20" viewBox="0 0 16 16" fill="var(--text-tertiary)"><path d="M4 0a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V4.414A2 2 0 0013.414 3L11 .586A2 2 0 009.586 0H4zm5.586 1L13 4.414V14a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1h5.586z"/></svg>
                        </div>
                      )}
                      <span className="attachment-preview-name">{p.name}</span>
                      <button className="attachment-preview-remove" onClick={() => removeFile(i)}>&times;</button>
                    </div>
                  ))}
                </div>
              )}

              {previews.length === 0 && (
                <div
                  className="upload-drop-mini"
                  onClick={() => fileRef.current?.click()}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="var(--text-tertiary)"><path d="M4.406 1.342A5.53 5.53 0 018 0c2.69 0 4.923 2 5.166 4.579C14.758 4.804 16 6.137 16 7.773 16 9.569 14.502 11 12.687 11H10a.5.5 0 010-1h2.688C13.979 10 15 8.988 15 7.773c0-1.216-1.02-2.228-2.313-2.228h-.5v-.5C12.188 2.825 10.328 1 8 1a4.53 4.53 0 00-2.941 1.1c-.757.652-1.153 1.438-1.153 2.055v.448l-.445.049C2.064 4.805 1 5.952 1 7.318 1 8.785 2.23 10 3.781 10H6a.5.5 0 010 1H3.781C1.708 11 0 9.366 0 7.318c0-1.763 1.266-3.223 2.942-3.593.143-.863.698-1.723 1.464-2.383z"/><path d="M7.646 4.146a.5.5 0 01.708 0l3 3a.5.5 0 01-.708.708L8.5 5.707V14.5a.5.5 0 01-1 0V5.707L5.354 7.854a.5.5 0 11-.708-.708l3-3z"/></svg>
                  <span>Drop images or click to upload</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Reopen reminder option */}
        {isReopening && (task.assignedTo?.length > 0) && (
          <div style={{ padding: '0 24px 16px' }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13
            }}>
              <input
                type="checkbox"
                checked={sendReminder}
                onChange={e => setSendReminder(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
              />
              <div>
                <div style={{ fontWeight: 550 }}>Send reminder to assignees</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  Notify {task.assignedTo.length} assignee{task.assignedTo.length !== 1 ? 's' : ''} that this task has been reopened
                </div>
              </div>
            </label>
          </div>
        )}

        {/* Footer */}
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <button className="btn btn-ghost btn-sm" onClick={handleQuickUpdate} disabled={saving}>
            Skip & Update
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={saving}>Cancel</button>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleSubmit}
              disabled={saving}
              style={{ minWidth: 100 }}
            >
              {saving ? 'Saving...' : `Update Status`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
