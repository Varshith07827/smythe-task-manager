const router = require('express').Router();
const attachmentController = require('../controllers/attachmentController');
const { authenticate } = require('../middleware/auth');
const { upload } = require('../services/uploadService');

router.post('/tasks/:taskId/attachments', authenticate, upload.single('file'), attachmentController.upload);
router.get('/tasks/:taskId/attachments', authenticate, attachmentController.getTaskAttachments);
router.get('/attachments/:id/download', authenticate, attachmentController.download);
router.get('/attachments/:id/view', authenticate, attachmentController.view);
router.delete('/attachments/:id', authenticate, attachmentController.delete);

module.exports = router;
