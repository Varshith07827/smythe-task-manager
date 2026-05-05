const cron = require('node-cron');
const Board = require('../models/Board');
const Task = require('../models/Task');
const notificationService = require('./notificationService');

const CRON_EXPRESSION = process.env.PROGRESS_DIGEST_CRON || '0 */4 * * *';

async function runProgressDigestTick() {
  const Organization = require('../models/Organization');

  // Orgs that have disabled progress digest
  const disabledOrgs = await Organization.find({
    'settings.automations.progressDigest.enabled': false
  }).select('_id').lean();
  const disabledOrgIds = new Set(disabledOrgs.map(o => o._id.toString()));

  const boards = await Board.find({
    'progressDigest.enabled': true,
    archived: { $ne: true }
  })
    .select('title organization')
    .lean();

  for (const board of boards) {
    if (disabledOrgIds.has(board.organization?.toString())) continue;
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
  if (!cron.validate(CRON_EXPRESSION)) {
    console.error(`[ProgressDigest] Invalid cron expression: "${CRON_EXPRESSION}" — falling back to 0 */4 * * *`);
    cron.schedule('0 */4 * * *', () => {
      runProgressDigestTick().catch((err) => console.error('[ProgressDigest]', err.message));
    });
  } else {
    cron.schedule(CRON_EXPRESSION, () => {
      runProgressDigestTick().catch((err) => console.error('[ProgressDigest]', err.message));
    });
  }
  console.log(`[ProgressDigest] cron scheduled: ${CRON_EXPRESSION}`);
}

module.exports = { start, runProgressDigestTick };
