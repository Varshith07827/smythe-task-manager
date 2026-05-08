const router = require('express').Router();
const ticketController = require('../controllers/ticketController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

router.use(authenticate);

// User routes
router.post('/', ticketController.createTicket);
router.get('/mine', ticketController.getMyTickets);
router.get('/unread-count', ticketController.getUnreadCount);
router.get('/:id', ticketController.getTicket);
router.post('/:id/reply', ticketController.replyToTicket);

// Admin routes
router.get('/', authorize('admin'), ticketController.getAllTickets);
router.patch('/:id/status', authorize('admin'), ticketController.updateTicketStatus);
router.patch('/:id/priority', authorize('admin'), ticketController.updateTicketPriority);

module.exports = router;
