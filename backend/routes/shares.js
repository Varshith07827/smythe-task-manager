const router = require('express').Router();
const shareController = require('../controllers/shareController');
const { authenticate } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

// Rate limit for public endpoints — prevent abuse
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' }
});

const publicWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many write operations. Please slow down.' }
});

// === Authenticated routes (board owners/admins managing shares) ===
router.post('/boards/:boardId/share', authenticate, shareController.createShareLink);
router.get('/boards/:boardId/share', authenticate, shareController.getBoardShareInfo);
router.delete('/boards/:boardId/share', authenticate, shareController.revokeShareLink);

// === Public routes (no auth — accessed via share token) ===
router.get('/public/:token', publicLimiter, shareController.getPublicBoard);
router.post('/public/:token/tasks', publicWriteLimiter, shareController.publicCreateTask);
router.patch('/public/:token/tasks/:taskId', publicWriteLimiter, shareController.publicUpdateTask);
router.delete('/public/:token/tasks/:taskId', publicWriteLimiter, shareController.publicDeleteTask);

module.exports = router;
