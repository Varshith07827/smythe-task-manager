const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Debounce lastActive writes: only update DB at most once per 5 minutes per user
const lastActiveSeen = new Map();
const LAST_ACTIVE_DEBOUNCE_MS = 5 * 60 * 1000;

const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '') || req.query.token;
    if (!token) return res.status(401).json({ error: 'Authentication required' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user || user.status === 'inactive') {
      return res.status(401).json({ error: 'Invalid or inactive account' });
    }

    // Auto-fix legacy roles on the fly
    if (user.role === 'creator' || user.role === 'manager') {
      user.role = 'admin';
    }

    req.user = user;
    req.token = token;

    // Debounced lastActive — avoid a DB write on every single request
    const uid = user._id.toString();
    const now = Date.now();
    if (!lastActiveSeen.has(uid) || now - lastActiveSeen.get(uid) > LAST_ACTIVE_DEBOUNCE_MS) {
      lastActiveSeen.set(uid, now);
      User.findByIdAndUpdate(uid, { lastActive: new Date() }).catch(() => {});
    }

    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

module.exports = { authenticate, generateToken };
