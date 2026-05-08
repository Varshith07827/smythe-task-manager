import { useState, useEffect, useRef } from 'react';
import { sharesApi } from '../api/shares';
import { alert } from './AlertSystem';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';

export default function ShareModal({ boardId, boardTitle, onClose }) {
  const [loading, setLoading] = useState(true);
  const [shareInfo, setShareInfo] = useState(null);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState(false);

  // Create form
  const [permission, setPermission] = useState('edit');
  const [expiresIn, setExpiresIn] = useState('');

  const linkRef = useRef(null);
  const copyTimeout = useRef(null);

  useEffect(() => {
    loadShareInfo();
    return () => clearTimeout(copyTimeout.current);
  }, []);

  const loadShareInfo = async () => {
    try {
      const res = await sharesApi.getShareInfo(boardId);
      setShareInfo(res.data);
    } catch {
      setShareInfo({ active: false });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const data = { permission };
      if (expiresIn) data.expiresIn = expiresIn;
      const res = await sharesApi.createShareLink(boardId, data);
      setShareInfo({ active: true, ...res.data });
      alert.success('Share link created');
    } catch (err) {
      alert.error(err.response?.data?.error || 'Failed to create share link');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async () => {
    setRevoking(true);
    try {
      await sharesApi.revokeShareLink(boardId);
      setShareInfo({ active: false });
      alert.success('Share link revoked');
    } catch (err) {
      alert.error(err.response?.data?.error || 'Failed to revoke share link');
    } finally {
      setRevoking(false);
    }
  };

  const getShareUrl = () => {
    if (!shareInfo?.token) return '';
    return `${window.location.origin}/share/${shareInfo.token}`;
  };

  const handleCopy = async () => {
    const url = getShareUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      clearTimeout(copyTimeout.current);
      copyTimeout.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      if (linkRef.current) {
        linkRef.current.select();
        document.execCommand('copy');
        setCopied(true);
        clearTimeout(copyTimeout.current);
        copyTimeout.current = setTimeout(() => setCopied(false), 2000);
      }
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
        style={{ maxWidth: 520 }}
      >
        <div className="modal-header">
          <h3>Share Board</h3>
          <button className="modal-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="share-modal-body">
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30 }}>
              <div className="spinner" />
            </div>
          ) : shareInfo?.active ? (
            /* ===== ACTIVE SHARE ===== */
            <>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                <strong>{boardTitle}</strong> is shared with anyone who has the link.
              </div>

              {/* Link + Copy */}
              <div className="share-link-row">
                <input
                  ref={linkRef}
                  className="share-link-input"
                  value={getShareUrl()}
                  readOnly
                  onClick={e => e.target.select()}
                />
                <button
                  className={`btn btn-primary btn-sm share-copy-btn${copied ? ' copied' : ''}`}
                  onClick={handleCopy}
                >
                  {copied ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Copied
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                      </svg>
                      Copy
                    </>
                  )}
                </button>
              </div>

              {/* Info */}
              <div className="share-info">
                <div className="share-info-row">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                  <span>Permission: <strong>{shareInfo.permission}</strong></span>
                </div>
                {shareInfo.expiresAt && (
                  <div className="share-info-row">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                    <span>Expires {formatDistanceToNow(new Date(shareInfo.expiresAt), { addSuffix: true })}</span>
                  </div>
                )}
                {shareInfo.accessCount > 0 && (
                  <div className="share-info-row">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                    <span>Accessed {shareInfo.accessCount} time{shareInfo.accessCount !== 1 ? 's' : ''}</span>
                  </div>
                )}
                <div className="share-info-row">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                  <span>Created {formatDistanceToNow(new Date(shareInfo.createdAt), { addSuffix: true })}</span>
                </div>
              </div>

              {/* Revoke */}
              <div className="share-danger-zone">
                <div>
                  <div className="share-danger-label">Revoke access</div>
                  <div className="share-danger-hint">Anyone with the current link will lose access</div>
                </div>
                <button className="btn btn-danger btn-sm" onClick={handleRevoke} disabled={revoking}>
                  {revoking ? 'Revoking...' : 'Revoke'}
                </button>
              </div>
            </>
          ) : (
            /* ===== NO ACTIVE SHARE ===== */
            <>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Create a shareable link for <strong>{boardTitle}</strong>. Anyone with the link will be able to access this board without logging in.
              </div>

              <div className="share-settings">
                <div className="share-setting-row">
                  <span className="share-setting-label">Permission</span>
                  <select className="form-input" value={permission} onChange={e => setPermission(e.target.value)} style={{ width: 140, padding: '6px 10px', fontSize: 13 }}>
                    <option value="view">View only</option>
                    <option value="edit">Can edit</option>
                  </select>
                </div>
                <div className="share-setting-row">
                  <span className="share-setting-label">Expiration</span>
                  <select className="form-input" value={expiresIn} onChange={e => setExpiresIn(e.target.value)} style={{ width: 140, padding: '6px 10px', fontSize: 13 }}>
                    <option value="">Never</option>
                    <option value="1h">1 hour</option>
                    <option value="24h">24 hours</option>
                    <option value="7d">7 days</option>
                    <option value="30d">30 days</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
                  {creating ? 'Creating...' : 'Create Share Link'}
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
