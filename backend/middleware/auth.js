const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '') || req.query.token;
    if (!token) {
      console.log('[Auth] No token provided');
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user || user.status === 'inactive') {
      console.log('[Auth] User not found or inactive:', decoded.userId);
      return res.status(401).json({ error: 'Invalid or inactive account' });
    }

    // Auto-fix legacy roles
    if (user.role === 'creator' || user.role === 'manager') {
      user.role = 'admin';
    }

    req.user = user;
    req.token = token;

    user.lastActive = new Date();
    await user.save({ validateBeforeSave: false });

    next();
  } catch (err) {
    console.log('[Auth] Token validation error:', err.message);
    res.status(401).json({ error: 'Invalid token' });
  }
};

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

module.exports = { authenticate, generateToken };
