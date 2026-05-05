const cron = require('node-cron');
const Task = require('../models/Task');
const User = require('../models/User');
const Notification = require('../models/Notification');
const notificationService = require('./notificationService');

const CRON_EXPRESSION = process.env.DEADLINE_REMINDER_CRON || '*/30 * * * *';

/**
 * Check if current time is within a user's quiet hours.
 */
function isQuietHours(user) {
  const prefs = user.notificationPreferences || {};
  if (!prefs.quietHoursEnabled) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = (prefs.quietHoursStart || '22:00').split(':').map(Number);
  const [endH, endM] = (prefs.quietHoursEnd || '08:00').split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    // Same-day range (e.g. 09:00 – 17:00)
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Overnight range (e.g. 22:00 – 08:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

async function runDeadlineCheck() {
  const now = new Date();
  const Board = require('../models/Board');
  const Organization = require('../models/Organization');

  // Orgs that have disabled deadline reminders OR set mode to external (handled by external cron)
  const disabledOrgs = await Organization.find({
    $or: [
      { 'settings.automations.deadlineReminder.enabled': false },
      { 'settings.automations.deadlineReminder.cronMode': 'external' }
    ]
  }).select('_id').lean();
  const disabledOrgIds = disabledOrgs.map(o => o._id);

  // Boards to exclude: archived OR belonging to a disabled/external-mode org
  const excludedBoards = await Board.find({
    $or: [
      { archived: true },
      ...(disabledOrgIds.length ? [{ organization: { $in: disabledOrgIds } }] : [])
    ]
  }).select('_id').lean();
  const archivedBoardIds = excludedBoards.map(b => b._id);

  // Find all non-archived tasks with a dueDate that have assignees (excluding archived boards)
  const tasks = await Task.find({
    archived: { $ne: true },
    dueDate: { $exists: true, $ne: null },
    status: { $nin: ['completed', 'cancelled'] },
    assignedTo: { $exists: true, $not: { $size: 0 } },
    ...(archivedBoardIds.length ? { board: { $nin: archivedBoardIds } } : {})
  })
    .select('title dueDate assignedTo board status taskNotifications')
    .lean();

  if (!tasks.length) return;

  // Collect all unique assignee IDs
  const userIds = [...new Set(tasks.flatMap(t =>
    (t.assignedTo || []).map(id => id.toString())
  ))];
  const users = await User.find({ _id: { $in: userIds } }).lean();
  const userMap = new Map(users.map(u => [u._id.toString(), u]));

  let sentCount = 0;

  for (const task of tasks) {
    const dueDate = new Date(task.dueDate);
    const msUntilDue = dueDate.getTime() - now.getTime();
    const hoursUntilDue = msUntilDue / (1000 * 60 * 60);
    const isOverdue = msUntilDue < 0;
    const daysUntilDue = hoursUntilDue / 24;

    // Per-task notification settings
    const tn = task.taskNotifications || {};
    const urgentEnabled = tn.urgentMode?.enabled !== false;
    const urgentThresholdDays = tn.urgentMode?.thresholdDays ?? 3;
    const urgentIntervalHours = tn.urgentMode?.intervalHours ?? 4;
    const intervalEnabled = tn.intervalReminder?.enabled === true;
    const intervalHours = tn.intervalReminder?.hours ?? 6;

    // Determine effective reminder interval for this task
    let effectiveIntervalHours = 0; // 0 = once per day default
    if (!isOverdue && urgentEnabled && daysUntilDue <= urgentThresholdDays) {
      effectiveIntervalHours = urgentIntervalHours; // urgent mode
    } else if (intervalEnabled) {
      effectiveIntervalHours = intervalHours;
    }

    // Assignee recipient set
    const allRecipients = new Set(
      (task.assignedTo || []).map(id => id.toString())
    );

    for (const userId of allRecipients) {
      const user = userMap.get(userId);
      if (!user) continue;

      // Skip if user disabled deadline reminders
      if (user.notificationPreferences?.deadlineReminder === false) continue;
      if (isQuietHours(user)) continue;

      const reminderHours = user.notificationPreferences?.deadlineReminderHours || 24;

      let type = null;
      let title = null;
      let message = null;

      if (isOverdue) {
        type = 'deadline_overdue';
        const overdueDays = Math.ceil(Math.abs(hoursUntilDue) / 24);
        title = 'Task overdue';
        message = `"${task.title}" was due ${overdueDays === 1 ? 'yesterday' : `${overdueDays} days ago`}.`;
      } else if (hoursUntilDue <= reminderHours) {
        type = 'deadline_approaching';
        const hoursLeft = Math.round(hoursUntilDue);
        if (hoursLeft < 1) title = 'Deadline in less than an hour';
        else if (hoursLeft < 24) title = `Deadline in ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}`;
        else { const daysLeft = Math.ceil(hoursUntilDue / 24); title = `Deadline in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`; }
        message = `"${task.title}" is due ${dueDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`;
      }

      if (!type) continue;

      let groupKey;
      if (effectiveIntervalHours > 0) {
        const windowIndex = Math.floor(now.getTime() / (effectiveIntervalHours * 3600000));
        groupKey = `${type}:${task._id}:${userId}:w${windowIndex}`;
      } else {
        const dateKey = now.toISOString().slice(0, 10);
        groupKey = `${type}:${task._id}:${userId}:${dateKey}`;
      }

      const existing = await Notification.findOne({ groupKey }).lean();
      if (existing) continue;

      await notificationService.create({
        recipient: userId,
        type,
        title,
        message,
        board: task.board,
        task: task._id,
        groupKey,
        taskTitle: task.title
      });

      sentCount++;
    }
  }

  if (sentCount > 0) {
    console.log(`[DeadlineReminder] Sent ${sentCount} reminder(s)`);
  }
}

function start() {
  if (!cron.validate(CRON_EXPRESSION)) {
    console.error(`[DeadlineReminder] Invalid cron expression: "${CRON_EXPRESSION}" — falling back to */30 * * * *`);
    cron.schedule('*/30 * * * *', () => {
      runDeadlineCheck().catch((err) => console.error('[DeadlineReminder]', err.message));
    });
  } else {
    cron.schedule(CRON_EXPRESSION, () => {
      runDeadlineCheck().catch((err) => console.error('[DeadlineReminder]', err.message));
    });
  }

  setTimeout(() => {
    runDeadlineCheck().catch((err) => console.error('[DeadlineReminder] initial run:', err.message));
  }, 10000);

  console.log(`[DeadlineReminder] cron scheduled: ${CRON_EXPRESSION}`);
}

module.exports = { start, runDeadlineCheck };
