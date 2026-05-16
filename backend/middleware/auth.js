const jwt = require('jsonwebtoken');
const User = require('../models/User');

const lastActiveSeen = new Map();
const LAST_ACTIVE_DEBOUNCE_MS = 5 * 60 * 1000;

const MAX_CACHE_SIZE = 10000;
function pruneCache() {
  if (lastActiveSeen.size > MAX_CACHE_SIZE) {
    const cutoff = Date.now() - LAST_ACTIVE_DEBOUNCE_MS;
    for (const [k, v] of lastActiveSeen) {
      if (v < cutoff) lastActiveSeen.delete(k);
    }
  }
}

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    // Fallback for browser-initiated requests (<img>, <iframe>, direct downloads)
    // where custom Authorization headers cannot be attached.
    const queryToken = typeof req.query?.token === 'string' ? req.query.token : null;
    const token = headerToken || queryToken;
    if (!token) return res.status(401).json({ error: 'Authentication required' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user || user.status === 'inactive') {
      return res.status(401).json({ error: 'Invalid or inactive account' });
    }

    req.user = user;
    req.token = token;

    const uid = user._id.toString();
    const now = Date.now();
    if (!lastActiveSeen.has(uid) || now - lastActiveSeen.get(uid) > LAST_ACTIVE_DEBOUNCE_MS) {
      lastActiveSeen.set(uid, now);
      pruneCache();
      User.findByIdAndUpdate(uid, { lastActive: new Date() }).catch(() => {});
    }

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    res.status(401).json({ error: 'Invalid token' });
  }
};

const generateToken = (userId) => {
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn });
};

module.exports = { authenticate, generateToken };
