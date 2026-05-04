const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const connectDB = require('./config/db');
const { initSocket } = require('./config/socket');

const app = express();
const server = http.createServer(app);

// Initialize Socket.io
initSocket(server);

// Middleware
app.use(helmet());
const ALLOWED_ORIGIN = process.env.CLIENT_URL || 'http://localhost:5173';
app.use(cors({ origin: ALLOWED_ORIGIN, credentials: true }));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

// Trust proxy (required behind Nginx for rate limiting & IP detection)
app.set('trust proxy', 1);

// Rate limiting (skip auth login/register so dev quick-login and retries are not blocked)
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  validate: { xForwardedForHeader: false },
  skip: (req) => {
    const u = req.originalUrl || '';
    return u.includes('/auth/login') || u.includes('/auth/register') || u.includes('/auth/otp/');
  }
}));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/organizations', require('./routes/organizations'));
app.use('/api/boards', require('./routes/boards'));
app.use('/api/users', require('./routes/users'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/activity', require('./routes/activity'));
app.use('/api', require('./routes/attachments'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

// Start
const PORT = process.env.PORT || 5000;
connectDB().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    require('./services/progressDigestScheduler').start();
    require('./services/deadlineReminderScheduler').start();
  });
});
