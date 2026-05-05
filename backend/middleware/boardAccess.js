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

      // Admin has full access
      if (role === 'admin') {
        req.board = board;
        return next();
      }

      // Board creator always has full access regardless of visibility
      if (board.createdBy?.toString() === userId) {
        req.board = board;
        return next();
      }

      // User role
      if (board.permissions.visibility === 'organization') {
        req.board = board;
        return next();
      }

      if (board.permissions.visibility === 'restricted') {
        const isAllowedUser = board.permissions.allowedUsers
          .some(id => id.toString() === userId);

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
