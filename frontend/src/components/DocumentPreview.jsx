import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { attachmentsApi } from '../api/attachments';
import { authUrl } from '../utils/authUrl';

const EXT_COLORS = {
  pdf: '#ef4444',
  doc: '#3b82f6', docx: '#3b82f6',
  xls: '#10b981', xlsx: '#10b981',
  txt: '#6b7280', csv: '#6b7280',
  png: '#8b5cf6', jpg: '#8b5cf6', jpeg: '#8b5cf6', gif: '#f59e0b', webp: '#8b5cf6',
};

export default function DocumentPreview({ attachment, onClose }) {
  const [textContent, setTextContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const overlayRef = useRef(null);

  const isImage = attachment.mimeType?.startsWith('image/');
  const ext = attachment.filename?.split('.').pop()?.toLowerCase();
  const isPdf = ext === 'pdf';
  const isText = ['txt', 'csv'].includes(ext);
  const downloadUrl = authUrl(`/api/attachments/${attachment._id}/download`);
  const viewUrl = authUrl(`/api/attachments/${attachment._id}/view`);
  const color = EXT_COLORS[ext] || 'var(--accent)';

  useEffect(() => {
    if (isText) {
      attachmentsApi.download(attachment._id).then(res => {
        const reader = new FileReader();
        reader.onload = () => { setTextContent(reader.result); setLoading(false); };
        reader.readAsText(res.data);
      }).catch(() => { setTextContent('Unable to load file content.'); setLoading(false); });
    } else {
      setLoading(false);
    }
  }, [attachment._id, isText]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setZoom(z => Math.min(z + 0.25, 3));
      if (e.key === '-') setZoom(z => Math.max(z - 0.25, 0.25));
      if (e.key === '0') setZoom(1);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleDownload = async (e) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = attachment.filename;
    link.click();
  };

  return (
    <motion.div
      className="doc-preview-overlay"
      ref={overlayRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      {/* Top bar */}
      <motion.div
        className="doc-preview-topbar"
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -40, opacity: 0 }}
        transition={{ delay: 0.05, type: 'spring', damping: 28, stiffness: 350 }}
      >
        <div className="doc-preview-file-info">
          <span className="doc-preview-ext-badge" style={{ background: color + '18', color }}>
            {ext?.toUpperCase()}
          </span>
          <div>
            <div className="doc-preview-filename">{attachment.filename}</div>
            <div className="doc-preview-meta">
              {attachment.size ? `${(attachment.size / 1024).toFixed(0)} KB` : ''}
              {attachment.uploadedBy?.name ? ` · ${attachment.uploadedBy.name}` : ''}
            </div>
          </div>
        </div>

        <div className="doc-preview-controls">
          {(isImage || isPdf) && (
            <div className="doc-preview-zoom">
              <button onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))} title="Zoom out">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
              <span className="doc-preview-zoom-label">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => Math.min(z + 0.25, 3))} title="Zoom in">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
              <button onClick={() => setZoom(1)} title="Reset zoom" style={{ fontSize: 11, fontWeight: 600, width: 'auto', padding: '0 6px' }}>
                Reset
              </button>
            </div>
          )}
          <button className="doc-preview-action-btn" onClick={handleDownload} title="Download">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
          <button className="doc-preview-close" onClick={onClose} title="Close (Esc)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </motion.div>

      {/* Content */}
      <motion.div
        className="doc-preview-content"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ delay: 0.08, type: 'spring', damping: 26, stiffness: 320 }}
      >
        {loading ? (
          <div className="doc-preview-loading">
            <div className="spinner" />
            <span>Loading preview...</span>
          </div>
        ) : isImage ? (
          <div className="doc-preview-image-wrap" style={{ transform: `scale(${zoom})` }}>
            <img
              src={viewUrl}
              alt={attachment.filename}
              className="doc-preview-image"
              draggable={false}
            />
          </div>
        ) : isPdf ? (
          <div className="doc-preview-pdf-wrap" style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
            <iframe
              src={viewUrl}
              className="doc-preview-pdf"
              title={attachment.filename}
            />
          </div>
        ) : isText ? (
          <div className="doc-preview-text-wrap">
            <pre className="doc-preview-text">{textContent}</pre>
          </div>
        ) : (
          <div className="doc-preview-unsupported">
            <div className="doc-preview-unsupported-icon" style={{ background: color + '12', color }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <h4>Preview not available</h4>
            <p>This file type can't be previewed. Download it to view.</p>
            <button className="btn btn-primary btn-sm" onClick={handleDownload}>
              Download File
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
