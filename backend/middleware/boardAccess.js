const Board = require('../models/Board');

const checkBoardAccess = (requiredLevel = 'view') => {
  return async (req, res, next) => {
    try {
      const boardId = req.params.boardId || req.body.board;
      if (!boardId) return res.status(400).json({ error: 'Board ID required' });

      const board = await Board.findById(boardId);
      if (!board) return res.status(404).json({ error: 'Board not found' });

      const userId = req.user._id.toString();
      const role = req.user.role;

      if (role === 'admin') {
        req.board = board;
        return next();
      }

      if (board.createdBy?.toString() === userId) {
        req.board = board;
        return next();
      }

      const perms = board.permissions || {};
      const visibility = perms.visibility || 'all';

      if (visibility === 'all') {
        req.board = board;
        return next();
      }

      if (visibility === 'restricted') {
        const isAllowedUser = (perms.allowedUsers || []).some(id => id.toString() === userId);
        if (!isAllowedUser) {
          return res.status(403).json({ error: 'No access to this board' });
        }
      }

      req.board = board;
      next();
    } catch (err) {
      res.status(500).json({ error: 'Board access check failed' });
    }
  };
};

module.exports = { checkBoardAccess };
