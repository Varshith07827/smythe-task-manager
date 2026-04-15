const cron = require('node-cron');
const Board = require('../models/Board');
const Task = require('../models/Task');
const notificationService = require('./notificationService');

/** Wall-clock every 4 hours (UTC minute 0). */
const CRON_EXPRESSION = '0 */4 * * *';

async function runProgressDigestTick() {
  const boards = await Board.find({
    'progressDigest.enabled': true,
    archived: { $ne: true }
  })
    .select('title organization')
    .lean();

  for (const board of boards) {
    const tasks = await Task.find({
      board: board._id,
      archived: { $ne: true },
      assignedTo: { $exists: true, $not: { $size: 0 } }
    })
      .select('title status dueDate assignedTo')
      .lean();

    const byUser = new Map();
    for (const task of tasks) {
      for (const uid of task.assignedTo || []) {
        const id = uid.toString();
        if (!byUser.has(id)) byUser.set(id, []);
        byUser.get(id).push({
          title: task.title,
          status: task.status,
          dueDate: task.dueDate
        });
      }
    }

    for (const [userId, userTasks] of byUser) {
      await notificationService.sendProgressDigest({
        recipientId: userId,
        boardId: board._id,
        boardTitle: board.title,
        boardOrganizationId: board.organization,
        tasks: userTasks
      });
    }
  }
}

function start() {
  cron.schedule(CRON_EXPRESSION, () => {
    runProgressDigestTick().catch((err) => console.error('[ProgressDigest]', err.message));
  });
  console.log('[ProgressDigest] cron scheduled: every 4 hours');
}

module.exports = { start, runProgressDigestTick };
