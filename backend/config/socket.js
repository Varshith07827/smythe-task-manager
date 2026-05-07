const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

let io;

const isProduction = () => process.env.NODE_ENV === 'production';

const initSocket = (server) => {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',').map(o => o.trim()).filter(Boolean);

  io = new Server(server, {
    cors: {
      origin: isProduction()
        ? (origin, cb) => {
            if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
            cb(new Error('CORS blocked'));
          }
        : true,
      methods: ['GET', 'POST']
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('_id name avatar status').lean();
      if (!user || user.status === 'inactive') return next(new Error('User not found'));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user._id.toString();
    socket.join(`user:${userId}`);

    socket.on('join:board', (boardId) => {
      if (typeof boardId === 'string' && /^[a-f\d]{24}$/i.test(boardId)) {
        socket.join(`board:${boardId}`);
      }
    });

    socket.on('leave:board', (boardId) => {
      if (typeof boardId === 'string') {
        socket.leave(`board:${boardId}`);
      }
    });

    socket.on('viewing:board', (boardId) => {
      if (typeof boardId === 'string' && /^[a-f\d]{24}$/i.test(boardId)) {
        socket.to(`board:${boardId}`).emit('user:viewing', {
          userId: socket.user._id,
          name: socket.user.name,
          avatar: socket.user.avatar
        });
      }
    });

    socket.on('cell:focus', ({ boardId, taskId, columnId }) => {
      if (typeof boardId === 'string' && /^[a-f\d]{24}$/i.test(boardId)) {
        socket.to(`board:${boardId}`).emit('cell:focused', {
          userId: socket.user._id,
          name: socket.user.name,
          taskId,
          columnId
        });
      }
    });

    socket.on('disconnect', () => {});
  });

  return io;
};

const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};

module.exports = { initSocket, getIO };
