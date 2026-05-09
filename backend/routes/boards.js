const router = require('express').Router();
const boardController = require('../controllers/boardController');
const taskController = require('../controllers/taskController');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { checkBoardAccess } = require('../middleware/boardAccess');
const { validateColumnValues } = require('../middleware/validate');

// Board CRUD
router.post('/', authenticate, boardController.create);
router.get('/', authenticate, boardController.getAll);
router.get('/archived', authenticate, authorize('admin'), boardController.getArchived);
router.get('/:boardId', authenticate, checkBoardAccess('view'), boardController.getOne);
router.patch('/:boardId', authenticate, checkBoardAccess('edit'), boardController.update);
router.patch('/:boardId/restore', authenticate, checkBoardAccess('edit'), boardController.restore);
router.delete('/:boardId', authenticate, checkBoardAccess('edit'), boardController.archive);
router.delete('/:boardId/permanent', authenticate, checkBoardAccess('edit'), boardController.permanentDelete);

// Columns
router.post('/:boardId/columns', authenticate, authorize('admin'), checkBoardAccess('edit'), boardController.addColumn);
router.put('/:boardId/columns', authenticate, authorize('admin'), checkBoardAccess('edit'), boardController.replaceColumns);
router.patch('/:boardId/columns/reorder', authenticate, authorize('admin'), checkBoardAccess('edit'), boardController.reorderColumns);
router.patch('/:boardId/columns/:colId', authenticate, authorize('admin'), checkBoardAccess('edit'), boardController.updateColumn);
router.delete('/:boardId/columns/:colId', authenticate, authorize('admin'), checkBoardAccess('edit'), boardController.removeColumn);

// Permissions
router.patch('/:boardId/permissions', authenticate, authorize('admin'), boardController.updatePermissions);

// Activity
router.get('/:boardId/activity', authenticate, checkBoardAccess('view'), boardController.getActivity);

// Send progress report email
router.post('/:boardId/send-report', authenticate, authorize('admin'), checkBoardAccess('view'), boardController.sendProgressReport);

// Scheduled assignee notifications (who receives email / in-app)
router.get('/:boardId/notification-schedule', authenticate, checkBoardAccess('view'), boardController.getNotificationSchedule);

// Tasks within a board
router.post('/:boardId/tasks', authenticate, checkBoardAccess('edit'), validateColumnValues, taskController.create);
router.get('/:boardId/tasks', authenticate, checkBoardAccess('view'), taskController.getAll);
router.get('/:boardId/tasks/:taskId', authenticate, checkBoardAccess('view'), taskController.getOne);
router.patch('/:boardId/tasks/:taskId', authenticate, checkBoardAccess('edit'), taskController.update);
router.delete('/:boardId/tasks/:taskId', authenticate, checkBoardAccess('edit'), taskController.archive);
router.patch('/:boardId/tasks/:taskId/unarchive', authenticate, checkBoardAccess('edit'), taskController.unarchive);
router.delete('/:boardId/tasks/:taskId/permanent', authenticate, checkBoardAccess('edit'), taskController.permanentDelete);
router.post('/:boardId/tasks/:taskId/remind', authenticate, checkBoardAccess('edit'), taskController.remind);
router.patch('/:boardId/tasks/:taskId/notifications', authenticate, checkBoardAccess('edit'), taskController.updateNotifications);

// Task comments
router.post('/:boardId/tasks/:taskId/comments', authenticate, checkBoardAccess('edit'), taskController.addComment);
router.patch('/:boardId/tasks/:taskId/comments/:commentId', authenticate, checkBoardAccess('edit'), taskController.updateComment);
router.delete('/:boardId/tasks/:taskId/comments/:commentId', authenticate, checkBoardAccess('edit'), taskController.deleteComment);

// Task activity
router.get('/:boardId/tasks/:taskId/activity', authenticate, checkBoardAccess('view'), taskController.getActivity);

// Bulk operations
router.post('/:boardId/tasks/bulk/assign', authenticate, authorize('admin'), checkBoardAccess('edit'), taskController.bulkAssign);
router.post('/:boardId/tasks/bulk/status', authenticate, authorize('admin'), checkBoardAccess('edit'), taskController.bulkStatusChange);
router.post('/:boardId/tasks/bulk/archive', authenticate, authorize('admin'), checkBoardAccess('edit'), taskController.bulkArchive);
router.post('/:boardId/tasks/bulk/unarchive', authenticate, authorize('admin'), checkBoardAccess('edit'), taskController.bulkUnarchive);
router.post('/:boardId/tasks/bulk/delete', authenticate, authorize('admin'), checkBoardAccess('edit'), taskController.bulkDelete);

module.exports = router;
