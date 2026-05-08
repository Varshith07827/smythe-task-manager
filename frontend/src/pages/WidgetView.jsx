import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { widgetsApi } from '../api/widgets';
import { motion } from 'framer-motion';

function getDomain(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

function getFaviconUrl(url) {
  const domain = getDomain(url);
  return domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32` : '';
}

export default function WidgetView() {
  const { widgetId } = useParams();
  const navigate = useNavigate();
  const [widget, setWidget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [iframeStatus, setIframeStatus] = useState('loading'); // 'loading' | 'loaded' | 'blocked'
  const [reloadCount, setReloadCount] = useState(0);
  const [skipIframe, setSkipIframe] = useState(false);
  const iframeRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await widgetsApi.getAll();
        const found = res.data.find(w => w._id === widgetId);
        if (!found) { navigate('/'); return; }
        setWidget(found);
      } catch {
        navigate('/');
      } finally {
        setLoading(false);
      }
    })();
  }, [widgetId, navigate]);

  // Server-side embed check — runs before/alongside iframe load
  useEffect(() => {
    if (!widget) return;
    let cancelled = false;

    setIframeStatus('loading');
    setSkipIframe(false);

    // Quick server-side header check
    (async () => {
      try {
        const res = await widgetsApi.checkEmbed(widget.url);
        if (cancelled) return;
        if (!res.data.embeddable) {
          setIframeStatus('blocked');
          setSkipIframe(true);
        }
      } catch {
        // Server check failed — fall through to client-side detection
      }
    })();

    // Fallback timeout in case both server check and iframe load stall
    timerRef.current = setTimeout(() => {
      setIframeStatus(prev => prev === 'loading' ? 'blocked' : prev);
    }, 15000);

    return () => { cancelled = true; clearTimeout(timerRef.current); };
  }, [widget, reloadCount]);

  // Detect iframe load vs blocked (client-side fallback)
  const handleIframeLoad = useCallback(() => {
    clearTimeout(timerRef.current);
    setIframeStatus(prev => prev === 'blocked' ? prev : 'loaded');
  }, []);

  const handleIframeError = useCallback(() => {
    clearTimeout(timerRef.current);
    setIframeStatus('blocked');
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40 }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!widget) return null;

  const domain = getDomain(widget.url);
  const favicon = getFaviconUrl(widget.url);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="widget-view-page"
    >
      {/* Toolbar */}
      <div className="widget-view-toolbar">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')} style={{ gap: 6, flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          <span className="widget-view-toolbar-back-text">Dashboard</span>
        </button>
        <div className="widget-view-toolbar-info">
          {favicon && <img src={favicon} alt="" width="16" height="16" style={{ borderRadius: 3, flexShrink: 0 }} onError={e => { e.target.style.display = 'none'; }} />}
          <span className="widget-view-toolbar-name">{widget.name}</span>
          <span className="widget-view-toolbar-domain">{domain}</span>
        </div>
        <div className="widget-view-toolbar-actions">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setReloadCount(c => c + 1)}
            title="Reload"
            style={{ padding: '4px 8px' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/>
              <path d="M20.49 9A9 9 0 015.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/>
            </svg>
          </button>
          <a
            href={widget.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
            title="Open in new tab"
            style={{ padding: '4px 8px' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
        </div>
      </div>

      {/* Iframe container */}
      <div className="widget-view-iframe-wrap">
        {iframeStatus === 'loading' && (
          <div className="widget-view-loading-overlay">
            <div className="spinner" />
            <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-tertiary)' }}>Loading {domain}...</p>
          </div>
        )}

        {iframeStatus === 'blocked' && (
          <div className="widget-view-blocked">
            <div className="widget-view-blocked-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round">
                <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                <line x1="7" y1="7" x2="17" y2="14" /><line x1="17" y1="7" x2="7" y2="14" />
              </svg>
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
              Embedding Not Available
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 380, marginBottom: 20 }}>
              <strong>{domain}</strong> prevents being embedded in other websites for security reasons. You can open it directly instead.
            </p>
            <a
              href={widget.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
              style={{ gap: 6 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              Open Externally
            </a>
          </div>
        )}

        {/* Only render iframe if server check hasn't already determined it's blocked */}
        {!skipIframe && (
          <iframe
            ref={iframeRef}
            key={widget ? `${widget.url}-${reloadCount}` : 'empty'}
            src={widget.url}
            title={widget.name}
            className="widget-view-iframe"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer"
            loading="lazy"
            onLoad={handleIframeLoad}
            onError={handleIframeError}
            style={{ opacity: iframeStatus === 'loaded' ? 1 : 0 }}
          />
        )}
      </div>
    </motion.div>
  );
}
