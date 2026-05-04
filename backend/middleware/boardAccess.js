const checkBoardAccess = (requiredLevel = 'view') => {
  return async (req, res, next) => {
    try {
      const boardId = req.params.boardId || req.body.board;
      if (!boardId) return res.status(400).json({ error: 'Board ID required' });

      const board = await Board.findById(boardId);
      if (!board) return res.status(404).json({ error: 'Board not found' });

      // Block access to archived boards except for restore operations
      const isRestoreRoute = req.path?.endsWith('/restore') || req.originalUrl?.includes('/restore');
      if (board.archived && !isRestoreRoute) {
        return res.status(404).json({ error: 'Board not found' });
      }

      const userId = req.user._id.toString();
      const role = req.user.role;

      // System Admin has full access
      if (role === 'admin') {
        req.board = board;
        return next();
      }

      const isCreator = board.createdBy && board.createdBy.toString() === userId;
      const isManager = board.permissions?.allowedManagers?.some(id => id.toString() === userId);

      // Require board admin rights for destructive/schema changes
      if (requiredLevel === 'admin') {
        if (isCreator || isManager) {
          req.board = board;
          return next();
        }
        return res.status(403).json({ error: 'Board admin access required' });
      }

      // User role checking for 'view' or 'edit' tasks
      if (board.permissions.visibility === 'organization') {
        req.board = board;
        return next();
      }

      if (board.permissions.visibility === 'restricted') {
        const isAllowedUser = board.permissions?.allowedUsers?.some(id => id.toString() === userId);

        if (!isAllowedUser && !isManager && !isCreator) {
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
