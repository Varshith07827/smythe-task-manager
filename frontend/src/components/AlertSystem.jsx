import { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ─────────── Toast System ─────────── */

let toastId = 0;
let addToastFn = null;

const ICONS = {
  success: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  error: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  info: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  warning: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
};

const ACCENT_COLORS = {
  success: '#10b981',
  error: '#ef4444',
  info: '#6366f1',
  warning: '#f59e0b',
};

const BG_COLORS = {
  success: 'rgba(16, 185, 129, 0.06)',
  error: 'rgba(239, 68, 68, 0.06)',
  info: 'rgba(99, 102, 241, 0.06)',
  warning: 'rgba(245, 158, 11, 0.06)',
};

function ToastItem({ toast: t, onDismiss }) {
  const [progress, setProgress] = useState(100);
  const startRef = useRef(Date.now());
  const duration = t.duration || 3500;

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(t.id), duration);
    const interval = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      setProgress(Math.max(0, 100 - (elapsed / duration) * 100));
    }, 30);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, [t.id, duration, onDismiss]);

  const type = t.type || 'info';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 80, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.9, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', damping: 25, stiffness: 350 }}
      className="scards-toast"
      style={{ '--toast-accent': ACCENT_COLORS[type], '--toast-bg': BG_COLORS[type] }}
    >
      <div className="scards-toast-accent" />
      <div className="scards-toast-icon">{ICONS[type]}</div>
      <div className="scards-toast-body">
        <span className="scards-toast-message">{t.message}</span>
        {t.action && (
          <button className="scards-toast-action" onClick={() => { t.action.onClick(); onDismiss(t.id); }}>
            {t.action.label}
          </button>
        )}
      </div>
      <button className="scards-toast-close" onClick={() => onDismiss(t.id)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
      <div className="scards-toast-progress">
        <div className="scards-toast-progress-bar" style={{ width: `${progress}%` }} />
      </div>
    </motion.div>
  );
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    addToastFn = (t) => {
      setToasts(prev => [...prev.slice(-4), { ...t, id: ++toastId }]);
    };
    return () => { addToastFn = null; };
  }, []);

  return (
    <div className="scards-toast-container">
      <AnimatePresence mode="popLayout">
        {toasts.map(t => <ToastItem key={t.id} toast={t} onDismiss={dismiss} />)}
      </AnimatePresence>
    </div>
  );
}

export const alert = {
  success: (message, opts) => addToastFn?.({ type: 'success', message, ...opts }),
  error: (message, opts) => addToastFn?.({ type: 'error', message, ...opts }),
  info: (message, opts) => addToastFn?.({ type: 'info', message, ...opts }),
  warning: (message, opts) => addToastFn?.({ type: 'warning', message, ...opts }),
};

/* ─────────── Confirm Dialog ─────────── */

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback(({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', variant = 'danger' } = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({ title, message, confirmText, cancelText, variant });
    });
  }, []);

  const handleClose = (result) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AnimatePresence>
        {state && (
          <motion.div
            className="confirm-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => handleClose(false)}
          >
            <motion.div
              className="confirm-dialog"
              initial={{ opacity: 0, scale: 0.92, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 10 }}
              transition={{ type: 'spring', damping: 28, stiffness: 400 }}
              onClick={e => e.stopPropagation()}
            >
              <div className={`confirm-icon confirm-icon--${state.variant || 'danger'}`}>
                {(state.variant === 'danger' || !state.variant) && (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                )}
                {state.variant === 'info' && (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                )}
                {state.variant === 'warning' && (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                )}
              </div>
              {state.title && <h3 className="confirm-title">{state.title}</h3>}
              {state.message && <p className="confirm-message">{state.message}</p>}
              <div className="confirm-actions">
                <button className="btn btn-ghost" onClick={() => handleClose(false)}>
                  {state.cancelText}
                </button>
                <button
                  className={`btn ${state.variant === 'danger' ? 'btn-danger' : 'btn-primary'}`}
                  onClick={() => handleClose(true)}
                  autoFocus
                >
                  {state.confirmText}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be inside ConfirmProvider');
  return ctx;
}
