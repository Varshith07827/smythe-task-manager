const router = require('express').Router();
const userController = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const AVATAR_DIR = path.join(__dirname, '..', 'uploads', 'avatars');
if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });

const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, AVATAR_DIR),
    filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_AVATAR_TYPES.has(file.mimetype)) return cb(null, true);
    cb(new Error('Unsupported avatar format. Use JPG, PNG, WEBP, or GIF.'));
  }
});

router.get('/', authenticate, authorize('admin'), userController.getOrgMembers);
router.get('/members', authenticate, userController.getMembers);
router.patch('/me/profile', authenticate, userController.updateProfile);
router.post('/me/avatar', authenticate, avatarUpload.single('avatar'), userController.uploadAvatar);
router.get('/avatar/:filename', userController.serveAvatar); // public — no auth
router.patch('/me/notification-preferences', authenticate, userController.updateNotificationPreferences);
router.post('/me/verify-password', authenticate, userController.verifyPassword);
router.patch('/me/password', authenticate, userController.changePassword);
router.post('/me/password-support', authenticate, userController.requestPasswordSupport);
router.patch('/:id/profile', authenticate, authorize('admin'), userController.updateMemberProfile);
router.patch('/:id/notification-preferences', authenticate, authorize('admin'), userController.updateMemberNotificationPreferences);
router.patch('/:id/role', authenticate, authorize('admin'), userController.changeRole);
router.patch('/:id/status', authenticate, authorize('admin'), userController.changeStatus);
router.patch('/:id/restore', authenticate, authorize('admin'), userController.restoreUser);
router.delete('/:id', authenticate, authorize('admin'), userController.removeUser);

module.exports = router;
