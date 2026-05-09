import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { ticketsApi } from '../api/tickets';
import { alert } from '../components/AlertSystem';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';

const STATUS_COLORS = {
  open: { bg: 'var(--green-subtle)', color: 'var(--green)', label: 'Open' },
  pending: { bg: 'var(--orange-subtle)', color: 'var(--orange)', label: 'Pending' },
  resolved: { bg: 'var(--blue-subtle)', color: 'var(--blue)', label: 'Resolved' },
  closed: { bg: 'var(--bg-tertiary)', color: 'var(--text-tertiary)', label: 'Closed' }
};

const PRIORITY_COLORS = {
  low: { bg: 'var(--bg-tertiary)', color: 'var(--text-tertiary)', label: 'Low' },
  normal: { bg: 'var(--blue-subtle)', color: 'var(--blue)', label: 'Normal' },
  high: { bg: 'var(--orange-subtle)', color: 'var(--orange)', label: 'High' },
  urgent: { bg: 'var(--red-subtle)', color: 'var(--red)', label: 'Urgent' }
};

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.open;
  return <span className="ticket-status-badge" style={{ background: s.bg, color: s.color }}>{s.label}</span>;
}

function PriorityDot({ priority }) {
  const p = PRIORITY_COLORS[priority] || PRIORITY_COLORS.normal;
  return <span className="ticket-priority-dot" style={{ background: p.color }} title={p.label} />;
}

export default function Support() {
  const { user } = useAuth();
  const socket = useSocket();
  const isAdmin = user?.role === 'admin';

  // List state
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusCounts, setStatusCounts] = useState({});

  // Detail state
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Create state
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ subject: '', body: '', category: 'general', priority: 'normal' });
  const [creating, setCreating] = useState(false);

  // Reply state
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const replyInputRef = useRef(null);
  const selectedTicketRef = useRef(selectedTicket);
  useEffect(() => { selectedTicketRef.current = selectedTicket; }, [selectedTicket]);

  const loadTickets = useCallback(async () => {
    try {
      const params = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      if (search.trim()) params.search = search.trim();

      const res = isAdmin ? await ticketsApi.getAll(params) : await ticketsApi.getMine(params);
      setTickets(res.data.tickets);
      setTotalPages(res.data.pages);
      if (res.data.statusCounts) setStatusCounts(res.data.statusCounts);
    } catch {
      alert.error('Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search, isAdmin]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  // Socket listeners for real-time updates
  useEffect(() => {
    if (!socket) return;
    const handleTicketUpdate = (data) => {
      if (data.type === 'ticket:reply' && selectedTicketRef.current?._id === data.ticketId) {
        setMessages(prev => [...prev, data.message]);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
      if (data.type === 'ticket:status' && selectedTicketRef.current?._id === data.ticketId) {
        setSelectedTicket(prev => prev ? { ...prev, status: data.status } : null);
      }
      loadTickets();
    };
    socket.on('notification:new', handleTicketUpdate);
    return () => socket.off('notification:new', handleTicketUpdate);
  }, [socket, loadTickets]);

  const openTicket = async (ticket) => {
    setSelectedTicket(ticket);
    setDetailLoading(true);
    setReplyText('');
    try {
      const res = await ticketsApi.getOne(ticket._id);
      setSelectedTicket(res.data.ticket);
      setMessages(res.data.messages);
      // Mark as read in list
      setTickets(prev => prev.map(t => t._id === ticket._id ? { ...t, isUnread: false } : t));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 150);
    } catch {
      alert.error('Failed to load ticket');
      setSelectedTicket(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!createForm.subject.trim() || !createForm.body.trim()) return;
    setCreating(true);
    try {
      const res = await ticketsApi.create(createForm);
      setShowCreate(false);
      setCreateForm({ subject: '', body: '', category: 'general', priority: 'normal' });
      alert.success('Ticket created');
      loadTickets();
      openTicket(res.data);
    } catch (err) {
      alert.error(err.response?.data?.error || 'Failed to create ticket');
    } finally {
      setCreating(false);
    }
  };

  const handleReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedTicket) return;
    setSending(true);
    try {
      const res = await ticketsApi.reply(selectedTicket._id, { body: replyText });
      setMessages(prev => [...prev, res.data]);
      setReplyText('');
      loadTickets();
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err) {
      alert.error(err.response?.data?.error || 'Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (status) => {
    if (!selectedTicket) return;
    try {
      const res = await ticketsApi.updateStatus(selectedTicket._id, status);
      setSelectedTicket(res.data);
      loadTickets();
      // Reload messages to get system message
      const detail = await ticketsApi.getOne(selectedTicket._id);
      setMessages(detail.data.messages);
    } catch (err) {
      alert.error(err.response?.data?.error || 'Failed to update status');
    }
  };

  const handlePriorityChange = async (priority) => {
    if (!selectedTicket) return;
    try {
      const res = await ticketsApi.updatePriority(selectedTicket._id, priority);
      setSelectedTicket(res.data);
      loadTickets();
    } catch (err) {
      alert.error(err.response?.data?.error || 'Failed to update priority');
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="support-page">
      <div className="support-layout">
        {/* ==== TICKET LIST PANEL ==== */}
        <div className={`support-list-panel${selectedTicket ? ' support-list-panel--collapsed' : ''}`}>
          <div className="support-list-header">
            <h2 className="page-section-title">{isAdmin ? 'Support Tickets' : 'My Support'}</h2>
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)} style={{ gap: 4 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              New Ticket
            </button>
          </div>

          {/* Filters */}
          <div className="support-filters">
            <div className="support-search-wrap">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input className="support-search" placeholder="Search tickets..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <div className="support-status-tabs">
              {['', 'open', 'pending', 'resolved', 'closed'].map(s => (
                <button
                  key={s}
                  className={`support-status-tab${statusFilter === s ? ' active' : ''}`}
                  onClick={() => { setStatusFilter(s); setPage(1); }}
                >
                  {s ? STATUS_COLORS[s].label : 'All'}
                  {isAdmin && s && statusCounts[s] ? <span className="support-status-count">{statusCounts[s]}</span> : null}
                </button>
              ))}
            </div>
          </div>

          {/* Ticket List */}
          <div className="support-ticket-list">
            {loading ? (
              <div className="support-skeleton">
                {[1,2,3,4].map(i => <div key={i} className="support-skeleton-item" />)}
              </div>
            ) : tickets.length === 0 ? (
              <div className="support-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                </svg>
                <h4>No tickets yet</h4>
                <p>Create a new ticket to get help from the team</p>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {tickets.map(ticket => (
                  <motion.button
                    key={ticket._id}
                    className={`support-ticket-item${selectedTicket?._id === ticket._id ? ' active' : ''}${ticket.isUnread ? ' unread' : ''}`}
                    onClick={() => openTicket(ticket)}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    layout
                  >
                    <div className="support-ticket-item-top">
                      <PriorityDot priority={ticket.priority} />
                      <span className="support-ticket-item-subject">{ticket.subject}</span>
                      <StatusBadge status={ticket.status} />
                    </div>
                    <div className="support-ticket-item-meta">
                      {isAdmin && ticket.createdBy && (
                        <span className="support-ticket-item-user">{ticket.createdBy.name}</span>
                      )}
                      <span>{ticket.messageCount || 1} message{(ticket.messageCount || 1) !== 1 ? 's' : ''}</span>
                      <span>{formatDistanceToNow(new Date(ticket.lastMessageAt || ticket.createdAt), { addSuffix: true })}</span>
                    </div>
                    {ticket.isUnread && <span className="support-unread-dot" />}
                  </motion.button>
                ))}
              </AnimatePresence>
            )}

            {totalPages > 1 && (
              <div className="support-pagination">
                <button className="btn btn-ghost btn-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Page {page} of {totalPages}</span>
                <button className="btn btn-ghost btn-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
              </div>
            )}
          </div>
        </div>

        {/* ==== TICKET DETAIL / CONVERSATION ==== */}
        <div className={`support-detail-panel${selectedTicket ? ' support-detail-panel--open' : ''}`}>
          {!selectedTicket ? (
            <div className="support-detail-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.2" strokeLinecap="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
              <p>Select a ticket to view the conversation</p>
            </div>
          ) : (
            <>
              {/* Detail header */}
              <div className="support-detail-header">
                <button className="btn btn-ghost btn-sm support-back-btn" onClick={() => setSelectedTicket(null)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                </button>
                <div className="support-detail-header-info">
                  <h3 className="support-detail-subject">{selectedTicket.subject}</h3>
                  <div className="support-detail-badges">
                    <StatusBadge status={selectedTicket.status} />
                    <span className="ticket-status-badge" style={{ background: PRIORITY_COLORS[selectedTicket.priority]?.bg, color: PRIORITY_COLORS[selectedTicket.priority]?.color }}>
                      {PRIORITY_COLORS[selectedTicket.priority]?.label || 'Normal'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      #{selectedTicket._id.slice(-6)}
                    </span>
                  </div>
                </div>
                {isAdmin && (
                  <div className="support-detail-header-actions">
                    <select
                      className="toolbar-select"
                      value={selectedTicket.status}
                      onChange={e => handleStatusChange(e.target.value)}
                    >
                      <option value="open">Open</option>
                      <option value="pending">Pending</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                    <select
                      className="toolbar-select"
                      value={selectedTicket.priority}
                      onChange={e => handlePriorityChange(e.target.value)}
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Messages */}
              <div className="support-messages">
                {detailLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
                ) : (
                  <div className="support-messages-inner">
                    {messages.map(msg => {
                      if (msg.isSystemMessage) {
                        return (
                          <div key={msg._id} className="support-system-message">
                            <span>{msg.body}</span>
                            <span className="support-msg-time">
                              {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                        );
                      }
                      const isMine = msg.sender?._id === user?._id;
                      return (
                        <motion.div
                          key={msg._id}
                          className={`support-message${isMine ? ' support-message--mine' : ' support-message--other'}${msg.isAdminReply ? ' support-message--admin' : ''}`}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                        >
                          <div className="support-message-header">
                            <div className="support-message-avatar">
                              {msg.sender?.avatar ? (
                                <img src={msg.sender.avatar.startsWith('/api/') ? msg.sender.avatar : msg.sender.avatar} alt="" />
                              ) : (
                                <span>{msg.sender?.name?.charAt(0)?.toUpperCase() || '?'}</span>
                              )}
                            </div>
                            <span className="support-message-sender">
                              {msg.sender?.name || 'Unknown'}
                              {msg.isAdminReply && <span className="support-admin-tag">Admin</span>}
                            </span>
                            <span className="support-msg-time">
                              {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                          <div className="support-message-body">{msg.body}</div>
                        </motion.div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Reply box */}
              {selectedTicket.status !== 'closed' && (
                <form className="support-reply-bar" onSubmit={handleReply}>
                  <textarea
                    ref={replyInputRef}
                    className="support-reply-input"
                    placeholder="Type your reply..."
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(e); } }}
                    rows={1}
                  />
                  <button type="submit" className="btn btn-primary support-send-btn" disabled={sending || !replyText.trim()}>
                    {sending ? (
                      <div className="spinner" style={{ width: 16, height: 16 }} />
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    )}
                  </button>
                </form>
              )}
              {selectedTicket.status === 'closed' && (
                <div className="support-closed-bar">
                  <span>This ticket is closed.</span>
                  {isAdmin && (
                    <button className="btn btn-ghost btn-xs" onClick={() => handleStatusChange('open')}>Reopen</button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ==== CREATE TICKET MODAL ==== */}
      <AnimatePresence>
        {showCreate && (
          <div className="modal-overlay" onClick={() => setShowCreate(false)}>
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
                <h3>New Support Ticket</h3>
                <button className="modal-close" onClick={() => setShowCreate(false)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>
              <form onSubmit={handleCreate}>
                <div className="modal-body">
                  <div className="form-group">
                    <label className="form-label">Subject</label>
                    <input type="text" className="form-input" placeholder="Brief description of your issue" value={createForm.subject} onChange={e => setCreateForm(p => ({ ...p, subject: e.target.value }))} required maxLength={300} autoFocus />
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Category</label>
                      <select className="form-input" value={createForm.category} onChange={e => setCreateForm(p => ({ ...p, category: e.target.value }))}>
                        <option value="general">General</option>
                        <option value="bug">Bug Report</option>
                        <option value="feature">Feature Request</option>
                        <option value="account">Account</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Priority</label>
                      <select className="form-input" value={createForm.priority} onChange={e => setCreateForm(p => ({ ...p, priority: e.target.value }))}>
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Details</label>
                    <textarea className="form-input" placeholder="Describe your issue in detail..." value={createForm.body} onChange={e => setCreateForm(p => ({ ...p, body: e.target.value }))} required rows={5} maxLength={10000} />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={creating || !createForm.subject.trim() || !createForm.body.trim()}>
                    {creating ? 'Creating...' : 'Create Ticket'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
