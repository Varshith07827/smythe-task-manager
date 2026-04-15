const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const activityService = require('../services/activityService');

// Admin-only: global activity logs across all projects
router.get('/global', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 25, search, user: userName, userId, boardId } = req.query;
    const result = await activityService.getGlobalActivity(
      req.user.organization,
      {
        page: parseInt(page),
        limit: parseInt(limit),
        search,
        userName,
        userId,
        boardId
      }
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
