const cron = require('node-cron');
const Board = require('../models/Board');
const Task = require('../models/Task');
const notificationService = require('./notificationService');

const CRON_EXPRESSION = process.env.PROGRESS_DIGEST_CRON || '0 */4 * * *';

let isRunning = false;

async function runProgressDigestTick() {
  if (isRunning) {
    console.log('[ProgressDigest] Skipping — previous run still in progress');
    return;
  }
  isRunning = true;

  try {
    const Organization = require('../models/Organization');

    const org = await Organization.findOne().select('settings.automations.progressDigest').lean();
    if (org?.settings?.automations?.progressDigest?.enabled === false) return;
    if (org?.settings?.automations?.progressDigest?.cronMode === 'external') return;

    const boards = await Board.find({
      'progressDigest.enabled': true,
      archived: { $ne: true }
    })
      .select('title')
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
          tasks: userTasks
        });
      }
    }
  } catch (err) {
    console.error('[ProgressDigest] Error:', err.message);
  } finally {
    isRunning = false;
  }
}

function start() {
  const expression = cron.validate(CRON_EXPRESSION) ? CRON_EXPRESSION : '0 */4 * * *';
  const task = cron.schedule(expression, () => {
    runProgressDigestTick().catch((err) => console.error('[ProgressDigest]', err.message));
  });

  console.log(`[ProgressDigest] cron scheduled: ${expression}`);

  return () => {
    task.stop();
    console.log('[ProgressDigest] Stopped');
  };
}

module.exports = { start, runProgressDigestTick };
