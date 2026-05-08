const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const connectDB = require('./config/db');
const { initSocket } = require('./config/socket');
const { AppError } = require('./utils/errors');
const log = require('./utils/logger');

const app = express();
const server = http.createServer(app);

initSocket(server);

const isProduction = process.env.NODE_ENV === 'production';

const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(helmet({
  contentSecurityPolicy: isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", ...allowedOrigins],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  } : false,
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: isProduction
    ? (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error('CORS blocked'));
      }
    : true,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Import']
}));

app.use(morgan(isProduction ? 'combined' : 'dev'));
app.use(express.json({ limit: '2mb' }));

app.set('trust proxy', 1);

app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Try again later.' }
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/otp', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/support', authLimiter);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/organizations', require('./routes/organizations'));
app.use('/api/boards', require('./routes/boards'));
app.use('/api/users', require('./routes/users'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/activity', require('./routes/activity'));
app.use('/api', require('./routes/attachments'));

app.get('/api/health', (req, res) => {
  const mongoose = require('mongoose');
  const dbState = mongoose.connection.readyState;
  const dbStatus = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  const healthy = dbState === 1;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    db: dbStatus[dbState] || 'unknown',
    schedulers: schedulerCleanups.length
  });
});

app.use((err, req, res, _next) => {
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      error: err.message,
      ...(err.details ? { details: err.details } : {})
    });
  }
  log.error('UnhandledError', err.stack || err.message);
  res.status(500).json({ error: isProduction ? 'Internal server error' : err.message });
});

process.on('unhandledRejection', (reason) => {
  log.error('UnhandledRejection', String(reason));
});

const PORT = process.env.PORT || 5000;

let schedulerCleanups = [];

connectDB().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    log.info('Server', `running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    schedulerCleanups.push(require('./services/progressDigestScheduler').start());
    schedulerCleanups.push(require('./services/deadlineReminderScheduler').start());
  });
});

function gracefulShutdown(signal) {
  log.info('Server', `${signal} received, shutting down gracefully...`);
  for (const cleanup of schedulerCleanups) {
    if (typeof cleanup === 'function') cleanup();
  }
  server.close(() => {
    const mongoose = require('mongoose');
    mongoose.connection.close(false).then(() => {
      log.info('Server', 'Database connection closed');
      process.exit(0);
    });
  });
  setTimeout(() => process.exit(1), 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
