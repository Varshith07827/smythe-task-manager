import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { widgetsApi } from '../api/widgets';
import { alert } from './AlertSystem';

const UNSAFE_PROTOCOLS = ['javascript:', 'data:', 'vbscript:', 'blob:', 'file:'];

function validateUrl(raw) {
  if (!raw || typeof raw !== 'string' || !raw.trim()) return 'URL is required';
  const trimmed = raw.trim();
  if (trimmed.length > 2048) return 'URL is too long (max 2048 characters)';
  const lower = trimmed.toLowerCase();
  for (const proto of UNSAFE_PROTOCOLS) {
    if (lower.startsWith(proto)) return `Unsafe protocol "${proto.replace(':', '')}" is not allowed`;
  }
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) return 'Only http and https URLs are allowed';
    return null;
  } catch {
    return 'Invalid URL format';
  }
}

export default function WidgetModal({ widget, onClose, onSaved }) {
  const isEdit = !!widget;
  const [name, setName] = useState(widget?.name || '');
  const [url, setUrl] = useState(widget?.url || '');
  const [urlError, setUrlError] = useState(null);
  const [embedWarning, setEmbedWarning] = useState(null); // null | 'checking' | 'blocked' | 'ok'
  const [loading, setLoading] = useState(false);
  const nameRef = useRef(null);
  const checkRef = useRef(0);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleUrlChange = (val) => {
    setUrl(val);
    if (urlError) setUrlError(null);
    if (embedWarning) setEmbedWarning(null);
  };

  const handleUrlBlur = async () => {
    if (!url.trim()) return;

    const err = validateUrl(url);
    if (err) { setUrlError(err); return; }

    // Check embed-ability
    const checkId = ++checkRef.current;
    setEmbedWarning('checking');
    try {
      const res = await widgetsApi.checkEmbed(url.trim());
      if (checkRef.current !== checkId) return; // stale
      setEmbedWarning(res.data.embeddable ? 'ok' : 'blocked');
    } catch {
      if (checkRef.current !== checkId) return;
      setEmbedWarning(null); // couldn't check, don't warn
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    const err = validateUrl(url);
    if (err) { setUrlError(err); return; }

    setLoading(true);
    try {
      if (isEdit) {
        const res = await widgetsApi.update(widget._id, { name: name.trim(), url: url.trim() });
        alert.success('Widget updated');
        onSaved(res.data);
      } else {
        const res = await widgetsApi.create({ name: name.trim(), url: url.trim() });
        alert.success('Widget created');
        onSaved(res.data);
      }
    } catch (err) {
      alert.error(err.response?.data?.error || `Failed to ${isEdit ? 'update' : 'create'} widget`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        className="modal"
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', damping: 28, stiffness: 400 }}
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Edit widget' : 'Create widget'}
      >
        <div className="modal-header">
          <h3>{isEdit ? 'Edit Widget' : 'New Widget'}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Widget Name</label>
              <input
                ref={nameRef}
                type="text"
                className="form-input"
                placeholder="e.g. Company Docs, Analytics..."
                value={name}
                onChange={e => setName(e.target.value)}
                required
                maxLength={200}
                autoComplete="off"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Website URL</label>
              <input
                type="url"
                className="form-input"
                placeholder="https://example.com"
                value={url}
                onChange={e => handleUrlChange(e.target.value)}
                onBlur={handleUrlBlur}
                required
                maxLength={2048}
                autoComplete="off"
                style={urlError ? { borderColor: 'var(--red)', boxShadow: '0 0 0 2px var(--red-subtle)' } : undefined}
              />
              {urlError && (
                <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {urlError}
                </p>
              )}
              {!urlError && embedWarning === 'checking' && (
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  Checking embed compatibility...
                </p>
              )}
              {!urlError && embedWarning === 'blocked' && (
                <p style={{ fontSize: 12, color: 'var(--orange)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 5, lineHeight: 1.4 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  This site blocks embedding. The widget will be saved as a quick-link that opens in a new tab.
                </p>
              )}
              {!urlError && embedWarning !== 'blocked' && embedWarning !== 'checking' && (
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
                  Enter the full URL including https://
                </p>
              )}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading || !name.trim() || !url.trim()}>
              {loading ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save Changes' : 'Create Widget')}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
