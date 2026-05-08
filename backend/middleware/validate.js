const Board = require('../models/Board');
const columnValidator = require('../utils/columnValidator');

const validateColumnValues = async (req, res, next) => {
  if (!req.body.columnValues) return next();

  try {
    const boardId = req.body.board || req.params.boardId;
    const board = req.board || await Board.findById(boardId);
    if (!board) return res.status(404).json({ error: 'Board not found' });

    const skipRequired = req.user?.role === 'admin' && (req.headers['x-import'] === 'true' || req.body._skipRequired === true);
    const { valid, errors } = columnValidator.validate(
      req.body.columnValues,
      board.columns,
      { skipRequired }
    );

    if (!valid) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    req.board = board;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Validation error' });
  }
};

module.exports = { validateColumnValues };
