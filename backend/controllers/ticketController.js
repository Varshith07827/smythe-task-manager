const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');
const TicketMessage = require('../models/TicketMessage');
const User = require('../models/User');
const socketService = require('../services/socketService');
const notificationService = require('../services/notificationService');
const log = require('../utils/logger');

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
}

// Sanitize message body — strip HTML tags to prevent XSS
function sanitizeBody(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

const ticketController = {
  // ===================== CREATE TICKET =====================
  async createTicket(req, res) {
    try {
      const { subject, body, category, priority } = req.body;
      const userId = req.user._id;

      if (!subject?.trim()) return res.status(400).json({ error: 'Subject is required' });
      if (!body?.trim()) return res.status(400).json({ error: 'Message is required' });
      if (subject.trim().length > 300) return res.status(400).json({ error: 'Subject is too long (max 300 characters)' });

      const cleanBody = sanitizeBody(body);
      if (!cleanBody) return res.status(400).json({ error: 'Message is required' });
      if (cleanBody.length > 10000) return res.status(400).json({ error: 'Message is too long (max 10000 characters)' });

      // Rate limit: max 10 open tickets per user
      const openCount = await Ticket.countDocuments({
        createdBy: userId,
        status: { $in: ['open', 'pending'] }
      });
      if (openCount >= 10) {
        return res.status(429).json({ error: 'Too many open tickets. Please wait for existing tickets to be resolved.' });
      }

      const ticket = await Ticket.create({
        subject: subject.trim(),
        createdBy: userId,
        category: category || 'general',
        priority: priority || 'normal',
        lastMessageAt: new Date(),
        lastMessageBy: userId,
        awaitingReplyFrom: 'admin',
        messageCount: 1,
        readBy: [{ user: userId, readAt: new Date() }]
      });

      await TicketMessage.create({
        ticket: ticket._id,
        sender: userId,
        body: cleanBody,
        isAdminReply: false
      });

      const populated = await Ticket.findById(ticket._id)
        .populate('createdBy', 'name email avatar')
        .lean();

      // Notify admins
      try {
        const admins = await User.find({ role: 'admin', status: 'active' }).select('_id').lean();
        for (const admin of admins) {
          socketService.notifyUser(admin._id.toString(), {
            type: 'ticket:new',
            ticket: populated
          });
        }
      } catch (err) {
        log.warn('Ticket', `Failed to notify admins: ${err.message}`);
      }

      res.status(201).json(populated);
    } catch (err) {
      log.error('Ticket', `Create failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to create ticket' });
    }
  },

  // ===================== GET USER'S TICKETS =====================
  async getMyTickets(req, res) {
    try {
      const userId = req.user._id;
      const { status, search, page = 1, limit = 20 } = req.query;

      const filter = { createdBy: userId };
      if (status && ['open', 'pending', 'resolved', 'closed'].includes(status)) {
        filter.status = status;
      }
      if (search?.trim()) {
        filter.subject = { $regex: search.trim(), $options: 'i' };
      }

      const skip = (Math.max(1, parseInt(page)) - 1) * Math.min(50, parseInt(limit) || 20);
      const lim = Math.min(50, parseInt(limit) || 20);

      const [tickets, total] = await Promise.all([
        Ticket.find(filter)
          .sort({ lastMessageAt: -1 })
          .skip(skip)
          .limit(lim)
          .populate('createdBy', 'name email avatar')
          .populate('lastMessageBy', 'name')
          .lean(),
        Ticket.countDocuments(filter)
      ]);

      // Mark unread status for user
      const ticketsWithRead = tickets.map(t => ({
        ...t,
        isUnread: !t.readBy?.some(r => r.user.toString() === userId.toString())
      }));

      res.json({ tickets: ticketsWithRead, total, page: parseInt(page), pages: Math.ceil(total / lim) });
    } catch (err) {
      log.error('Ticket', `Get my tickets failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to fetch tickets' });
    }
  },

  // ===================== GET ALL TICKETS (ADMIN) =====================
  async getAllTickets(req, res) {
    try {
      const { status, search, awaiting, priority, page = 1, limit = 20 } = req.query;

      const filter = {};
      if (status && ['open', 'pending', 'resolved', 'closed'].includes(status)) {
        filter.status = status;
      }
      if (awaiting && ['user', 'admin'].includes(awaiting)) {
        filter.awaitingReplyFrom = awaiting;
      }
      if (priority && ['low', 'normal', 'high', 'urgent'].includes(priority)) {
        filter.priority = priority;
      }
      if (search?.trim()) {
        filter.$or = [
          { subject: { $regex: search.trim(), $options: 'i' } }
        ];
      }

      const skip = (Math.max(1, parseInt(page)) - 1) * Math.min(50, parseInt(limit) || 20);
      const lim = Math.min(50, parseInt(limit) || 20);

      const [tickets, total, statusCounts] = await Promise.all([
        Ticket.find(filter)
          .sort({ lastMessageAt: -1 })
          .skip(skip)
          .limit(lim)
          .populate('createdBy', 'name email avatar')
          .populate('lastMessageBy', 'name')
          .lean(),
        Ticket.countDocuments(filter),
        Ticket.aggregate([
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ])
      ]);

      const counts = {};
      statusCounts.forEach(s => { counts[s._id] = s.count; });

      // Mark unread status for admin
      const adminId = req.user._id.toString();
      const ticketsWithRead = tickets.map(t => ({
        ...t,
        isUnread: !t.readBy?.some(r => r.user.toString() === adminId)
      }));

      res.json({
        tickets: ticketsWithRead,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / lim),
        statusCounts: counts
      });
    } catch (err) {
      log.error('Ticket', `Get all tickets failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to fetch tickets' });
    }
  },

  // ===================== GET SINGLE TICKET + MESSAGES =====================
  async getTicket(req, res) {
    try {
      if (!isValidId(req.params.id)) return res.status(404).json({ error: 'Ticket not found' });

      const filter = { _id: req.params.id };
      // Non-admins can only see their own tickets
      if (req.user.role !== 'admin') {
        filter.createdBy = req.user._id;
      }

      const ticket = await Ticket.findOne(filter)
        .populate('createdBy', 'name email avatar role')
        .populate('closedBy', 'name')
        .lean();

      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

      const messages = await TicketMessage.find({ ticket: ticket._id, deleted: { $ne: true } })
        .sort({ createdAt: 1 })
        .populate('sender', 'name email avatar role')
        .lean();

      // Mark as read by current user
      await Ticket.updateOne(
        { _id: ticket._id },
        {
          $pull: { readBy: { user: req.user._id } }
        }
      );
      await Ticket.updateOne(
        { _id: ticket._id },
        {
          $push: { readBy: { user: req.user._id, readAt: new Date() } }
        }
      );

      res.json({ ticket, messages });
    } catch (err) {
      log.error('Ticket', `Get ticket failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to fetch ticket' });
    }
  },

  // ===================== REPLY TO TICKET =====================
  async replyToTicket(req, res) {
    try {
      if (!isValidId(req.params.id)) return res.status(404).json({ error: 'Ticket not found' });

      const { body } = req.body;
      if (!body?.trim()) return res.status(400).json({ error: 'Message is required' });

      const cleanBody = sanitizeBody(body);
      if (!cleanBody) return res.status(400).json({ error: 'Message is required' });
      if (cleanBody.length > 10000) return res.status(400).json({ error: 'Message is too long' });

      const filter = { _id: req.params.id };
      if (req.user.role !== 'admin') {
        filter.createdBy = req.user._id;
      }

      const ticket = await Ticket.findOne(filter);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

      // Don't allow replies to closed tickets (unless admin reopens first)
      if (ticket.status === 'closed') {
        return res.status(400).json({ error: 'This ticket is closed. Reopen it to continue the conversation.' });
      }

      const isAdmin = req.user.role === 'admin';

      const message = await TicketMessage.create({
        ticket: ticket._id,
        sender: req.user._id,
        body: cleanBody,
        isAdminReply: isAdmin
      });

      // Update ticket metadata
      ticket.lastMessageAt = new Date();
      ticket.lastMessageBy = req.user._id;
      ticket.messageCount = (ticket.messageCount || 0) + 1;

      if (isAdmin) {
        ticket.awaitingReplyFrom = 'user';
        if (ticket.status === 'open') ticket.status = 'pending';
        // Clear read for ticket creator so they see it as unread
        ticket.readBy = ticket.readBy.filter(r => r.user.toString() !== ticket.createdBy.toString());
      } else {
        ticket.awaitingReplyFrom = 'admin';
        if (ticket.status === 'resolved') ticket.status = 'open'; // Reopen on user reply
        // Clear read for all admins
        const admins = await User.find({ role: 'admin', status: 'active' }).select('_id').lean();
        const adminIds = admins.map(a => a._id.toString());
        ticket.readBy = ticket.readBy.filter(r => !adminIds.includes(r.user.toString()));
      }

      // Mark as read by sender
      ticket.readBy = ticket.readBy.filter(r => r.user.toString() !== req.user._id.toString());
      ticket.readBy.push({ user: req.user._id, readAt: new Date() });

      await ticket.save();

      const populatedMessage = await TicketMessage.findById(message._id)
        .populate('sender', 'name email avatar role')
        .lean();

      // Real-time notification
      try {
        if (isAdmin) {
          // Notify ticket creator
          socketService.notifyUser(ticket.createdBy.toString(), {
            type: 'ticket:reply',
            ticketId: ticket._id,
            message: populatedMessage
          });
          await notificationService.create({
            recipient: ticket.createdBy,
            sender: req.user._id,
            type: 'mentioned',
            title: 'Support Reply',
            message: `Admin replied to your ticket: "${ticket.subject}"`
          });
        } else {
          // Notify all admins
          const admins = await User.find({ role: 'admin', status: 'active' }).select('_id').lean();
          for (const admin of admins) {
            socketService.notifyUser(admin._id.toString(), {
              type: 'ticket:reply',
              ticketId: ticket._id,
              message: populatedMessage
            });
          }
        }
      } catch (err) {
        log.warn('Ticket', `Notification failed: ${err.message}`);
      }

      res.status(201).json(populatedMessage);
    } catch (err) {
      log.error('Ticket', `Reply failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to send reply' });
    }
  },

  // ===================== UPDATE TICKET STATUS (ADMIN) =====================
  async updateTicketStatus(req, res) {
    try {
      if (!isValidId(req.params.id)) return res.status(404).json({ error: 'Ticket not found' });

      const { status } = req.body;
      if (!status || !['open', 'pending', 'resolved', 'closed'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const ticket = await Ticket.findById(req.params.id);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

      const oldStatus = ticket.status;
      ticket.status = status;

      if (status === 'closed') {
        ticket.closedAt = new Date();
        ticket.closedBy = req.user._id;
      } else if (oldStatus === 'closed') {
        ticket.closedAt = undefined;
        ticket.closedBy = undefined;
      }

      await ticket.save();

      // Create system message
      await TicketMessage.create({
        ticket: ticket._id,
        sender: req.user._id,
        body: `Status changed from ${oldStatus} to ${status}`,
        isAdminReply: true,
        isSystemMessage: true
      });

      ticket.messageCount = (ticket.messageCount || 0) + 1;
      ticket.lastMessageAt = new Date();
      ticket.lastMessageBy = req.user._id;
      await ticket.save();

      // Notify ticket creator
      try {
        socketService.notifyUser(ticket.createdBy.toString(), {
          type: 'ticket:status',
          ticketId: ticket._id,
          status,
          oldStatus
        });
        await notificationService.create({
          recipient: ticket.createdBy,
          sender: req.user._id,
          type: 'status_changed',
          title: 'Ticket Status Updated',
          message: `Your ticket "${ticket.subject}" has been marked as ${status}`
        });
      } catch (err) {
        log.warn('Ticket', `Status notification failed: ${err.message}`);
      }

      const populated = await Ticket.findById(ticket._id)
        .populate('createdBy', 'name email avatar')
        .populate('closedBy', 'name')
        .lean();

      res.json(populated);
    } catch (err) {
      log.error('Ticket', `Status update failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to update status' });
    }
  },

  // ===================== UPDATE TICKET PRIORITY (ADMIN) =====================
  async updateTicketPriority(req, res) {
    try {
      if (!isValidId(req.params.id)) return res.status(404).json({ error: 'Ticket not found' });

      const { priority } = req.body;
      if (!priority || !['low', 'normal', 'high', 'urgent'].includes(priority)) {
        return res.status(400).json({ error: 'Invalid priority' });
      }

      const ticket = await Ticket.findByIdAndUpdate(
        req.params.id,
        { priority },
        { new: true }
      ).populate('createdBy', 'name email avatar').lean();

      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

      res.json(ticket);
    } catch (err) {
      log.error('Ticket', `Priority update failed: ${err.message}`);
      res.status(500).json({ error: 'Failed to update priority' });
    }
  },

  // ===================== GET UNREAD COUNT =====================
  async getUnreadCount(req, res) {
    try {
      const userId = req.user._id.toString();
      const isAdmin = req.user.role === 'admin';

      let filter;
      if (isAdmin) {
        // Admin: count tickets where admin hasn't read
        filter = {
          status: { $in: ['open', 'pending'] },
          'readBy.user': { $ne: req.user._id }
        };
      } else {
        // User: count own tickets where user hasn't read
        filter = {
          createdBy: req.user._id,
          status: { $ne: 'closed' },
          'readBy.user': { $ne: req.user._id }
        };
      }

      const count = await Ticket.countDocuments(filter);
      res.json({ count });
    } catch (err) {
      res.status(500).json({ error: 'Failed to get unread count' });
    }
  }
};

module.exports = ticketController;
