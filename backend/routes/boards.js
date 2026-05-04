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
router.get('/archived', authenticate, boardController.getArchived);
router.get('/:boardId', authenticate, checkBoardAccess('view'), boardController.getOne);
router.patch('/:boardId', authenticate, checkBoardAccess('admin'), boardController.update);
router.patch('/:boardId/restore', authenticate, checkBoardAccess('admin'), boardController.restore);
router.delete('/:boardId', authenticate, checkBoardAccess('admin'), boardController.archive);
router.delete('/:boardId/permanent', authenticate, checkBoardAccess('admin'), boardController.permanentDelete);

// Columns
router.post('/:boardId/columns', authenticate, checkBoardAccess('admin'), boardController.addColumn);
router.put('/:boardId/columns', authenticate, checkBoardAccess('admin'), boardController.replaceColumns);
router.patch('/:boardId/columns/reorder', authenticate, checkBoardAccess('admin'), boardController.reorderColumns);
router.patch('/:boardId/columns/:colId', authenticate, checkBoardAccess('admin'), boardController.updateColumn);
router.delete('/:boardId/columns/:colId', authenticate, checkBoardAccess('admin'), boardController.removeColumn);

// Permissions
router.patch('/:boardId/permissions', authenticate, checkBoardAccess('admin'), boardController.updatePermissions);

// Activity
router.get('/:boardId/activity', authenticate, checkBoardAccess('view'), boardController.getActivity);

// Send progress report email
router.post('/:boardId/send-report', authenticate, checkBoardAccess('admin'), boardController.sendProgressReport);

// Scheduled assignee notifications (who receives email / in-app)
router.get('/:boardId/notification-schedule', authenticate, checkBoardAccess('view'), boardController.getNotificationSchedule);

// Tasks within a board
router.post('/:boardId/tasks', authenticate, checkBoardAccess('edit'), validateColumnValues, taskController.create);
router.get('/:boardId/tasks', authenticate, checkBoardAccess('view'), taskController.getAll);
router.get('/:boardId/tasks/:taskId', authenticate, checkBoardAccess('view'), taskController.getOne);
router.patch('/:boardId/tasks/:taskId', authenticate, checkBoardAccess('edit'), taskController.update);
router.delete('/:boardId/tasks/:taskId', authenticate, checkBoardAccess('admin'), taskController.archive);
router.delete('/:boardId/tasks/:taskId/permanent', authenticate, checkBoardAccess('admin'), taskController.permanentDelete);
router.post('/:boardId/tasks/:taskId/remind', authenticate, checkBoardAccess('admin'), taskController.remind);
router.patch('/:boardId/tasks/:taskId/notifications', authenticate, checkBoardAccess('admin'), taskController.updateNotifications);

// Task comments
router.post('/:boardId/tasks/:taskId/comments', authenticate, checkBoardAccess('edit'), taskController.addComment);
router.patch('/:boardId/tasks/:taskId/comments/:commentId', authenticate, checkBoardAccess('edit'), taskController.updateComment);
router.delete('/:boardId/tasks/:taskId/comments/:commentId', authenticate, checkBoardAccess('edit'), taskController.deleteComment);

// Task activity
router.get('/:boardId/tasks/:taskId/activity', authenticate, checkBoardAccess('view'), taskController.getActivity);

// Bulk operations
router.post('/:boardId/tasks/bulk/assign', authenticate, checkBoardAccess('admin'), taskController.bulkAssign);
router.post('/:boardId/tasks/bulk/status', authenticate, checkBoardAccess('admin'), taskController.bulkStatusChange);
router.post('/:boardId/tasks/bulk/archive', authenticate, checkBoardAccess('admin'), taskController.bulkArchive);
router.post('/:boardId/tasks/bulk/delete', authenticate, checkBoardAccess('admin'), taskController.bulkDelete);

module.exports = router;
