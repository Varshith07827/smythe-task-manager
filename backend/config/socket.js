const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: { origin: true, methods: ['GET', 'POST'] }
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);
      if (!user) return next(new Error('User not found'));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.name}`);

    if (socket.user.organization) {
      socket.join(`org:${socket.user.organization}`);
    }

    socket.on('join:board', (boardId) => {
      socket.join(`board:${boardId}`);
    });

    socket.on('leave:board', (boardId) => {
      socket.leave(`board:${boardId}`);
    });

    socket.on('viewing:board', (boardId) => {
      socket.to(`board:${boardId}`).emit('user:viewing', {
        userId: socket.user._id,
        name: socket.user.name,
        avatar: socket.user.avatar
      });
    });

    socket.on('cell:focus', ({ boardId, taskId, columnId }) => {
      socket.to(`board:${boardId}`).emit('cell:focused', {
        userId: socket.user._id,
        name: socket.user.name,
        taskId,
        columnId
      });
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.user.name}`);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};

module.exports = { initSocket, getIO };
