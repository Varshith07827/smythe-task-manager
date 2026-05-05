import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { notificationsApi } from '../api/notifications';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

export default function NotificationBell() {
  const { user } = useAuth();
  const socket = useSocket();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const panelRef = useRef();
  const [panelPos, setPanelPos] = useState({ top: 0, right: 0 });

  const updatePanelPos = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      const panelWidth = Math.min(window.innerWidth - 16, 380);
      // Center under the bell but clamp to viewport
      let right = window.innerWidth - rect.right - 8;
      right = Math.max(8, Math.min(right, window.innerWidth - panelWidth - 8));
      setPanelPos({ top: rect.bottom + 8, right, width: panelWidth });
    } else {
      setPanelPos({ top: rect.bottom + 10, right: window.innerWidth - rect.right - 8, width: undefined });
    }
  }, []);

  useEffect(() => {
    notificationsApi.getUnreadCount().then(res => setUnreadCount(res.data.count)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handler = (notification) => {
      if (notification.targetUserId === user?._id) {
        setUnreadCount(c => c + 1);
        setNotifications(prev => [notification, ...prev]);
      }
    };
    socket.on('notification:new', handler);
    return () => socket.off('notification:new', handler);
  }, [socket, user]);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target) &&
          (!panelRef.current || !panelRef.current.contains(e.target))) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePanelPos();
    const onScroll = () => updatePanelPos();
    const onResize = () => updatePanelPos();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, updatePanelPos]);

  const handleOpen = async () => {
    setOpen(!open);
    if (!open) {
      try {
        const res = await notificationsApi.getAll();
        setNotifications(res.data);
      } catch {}
    }
  };

  const handleMarkAllRead = async () => {
    await notificationsApi.markAllAsRead();
    setUnreadCount(0);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleMarkRead = async (id) => {
    await notificationsApi.markAsRead(id);
    setUnreadCount(c => Math.max(0, c - 1));
    setNotifications(prev => prev.map(n => n._id === id ? { ...n, read: true } : n));
  };

  return (
    <div className="notification-bell" ref={ref}>
      <button className="btn btn-ghost" onClick={handleOpen} style={{ position: 'relative' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              className="notification-badge-count"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              className="notification-panel"
              ref={panelRef}
              style={{ position: 'fixed', top: panelPos.top, right: panelPos.right, ...(panelPos.width ? { width: panelPos.width } : {}) }}
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.2 }}
            >
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--separator)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>Notifications</span>
                {unreadCount > 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={handleMarkAllRead} style={{ fontSize: 12 }}>Mark all read</button>
                )}
              </div>
              {notifications.length === 0 ? (
                <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ margin: '0 auto 8px', display: 'block', opacity: 0.4 }}>
                    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 01-3.46 0"/>
                  </svg>
                  You're all caught up
                </div>
              ) : (
                notifications.map(n => (
                  <motion.div
                    key={n._id}
                    className={`notification-item ${!n.read ? 'unread' : ''}`}
                    onClick={() => !n.read && handleMarkRead(n._id)}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div className="notification-item-title">{n.title}</div>
                    <div className="notification-item-message">{n.message}</div>
                    <div className="notification-item-time">
                      {n.createdAt ? formatDistanceToNow(new Date(n.createdAt), { addSuffix: true }) : ''}
                    </div>
                  </motion.div>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
