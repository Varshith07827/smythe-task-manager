const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const activityService = require('../services/activityService');

router.get('/global', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 25, search, user: userName, userId, boardId } = req.query;
    const result = await activityService.getGlobalActivity({
      page: parseInt(page),
      limit: Math.min(parseInt(limit) || 25, 100),
      search,
      userName,
      userId,
      boardId
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activity logs' });
  }
});

module.exports = router;
