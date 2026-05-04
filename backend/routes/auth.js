const router = require('express').Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests from this IP, please try again later' }
});

router.use(authLimiter);

router.post('/register/request', authController.registerRequest);
router.post('/register/confirm', authController.registerConfirm);
router.post('/login', authController.login);
router.post('/otp/request', authController.requestOtp);
router.post('/otp/verify', authController.verifyOtp);
router.post('/invite', authenticate, authorize('admin'), authController.invite);
router.post('/support', authController.submitSupport);
router.get('/me', authenticate, authController.getMe);

module.exports = router;
