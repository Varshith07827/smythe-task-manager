const router = require('express').Router();
const shareController = require('../controllers/shareController');
const { authenticate } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const { upload } = require('../services/uploadService');

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

// === Authenticated routes (task share management) ===
router.post('/tasks/:taskId/share', authenticate, shareController.createTaskShareLink);
router.get('/tasks/:taskId/share', authenticate, shareController.getTaskShareInfo);
router.delete('/tasks/:taskId/share', authenticate, shareController.revokeTaskShareLink);

// === Public routes (no auth — accessed via share token) ===
router.get('/public/:token', publicLimiter, shareController.getPublicTask);
router.patch('/public/:token', publicWriteLimiter, shareController.publicUpdateTask);
router.post('/public/:token/comments', publicWriteLimiter, shareController.publicAddComment);
router.post('/public/:token/attachments', publicWriteLimiter, shareController.preparePublicAttachmentUpload, upload.single('file'), shareController.publicUploadAttachment);
router.get('/public/:token/attachments/:attachmentId/view', publicLimiter, shareController.publicViewAttachment);
router.get('/public/:token/attachments/:attachmentId/download', publicLimiter, shareController.publicDownloadAttachment);

module.exports = router;
