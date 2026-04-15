const router = require('express').Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

router.post('/register/request', authController.registerRequest);
router.post('/register/confirm', authController.registerConfirm);
router.post('/login', authController.login);
router.post('/otp/request', authController.requestOtp);
router.post('/otp/verify', authController.verifyOtp);
router.post('/invite', authenticate, authorize('admin'), authController.invite);
router.post('/support', authController.submitSupport);
router.get('/me', authenticate, authController.getMe);

module.exports = router;
