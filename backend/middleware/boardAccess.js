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
      const userOrgId = req.user.organization?.toString();
      const boardOrgId = board.organization?.toString();

      // Org boundary check: users must belong to the same org as the board
      if (userOrgId && boardOrgId && userOrgId !== boardOrgId) {
        return res.status(403).json({ error: 'No access to this board' });
      }

      // Admin has full access within their org
      if (role === 'admin') {
        req.board = board;
        return next();
      }

      // Board creator always has full access
      if (board.createdBy?.toString() === userId) {
        req.board = board;
        return next();
      }

      // Default permissions if not set
      const perms = board.permissions || {};
      const visibility = perms.visibility || 'organization';

      if (visibility === 'organization') {
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
