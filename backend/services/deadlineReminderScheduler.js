const cron = require('node-cron');
const Task = require('../models/Task');
const User = require('../models/User');
const Notification = require('../models/Notification');
const notificationService = require('./notificationService');

const CRON_EXPRESSION = process.env.DEADLINE_REMINDER_CRON || '*/30 * * * *';

let isRunning = false;

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
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

async function runDeadlineCheck() {
  if (isRunning) {
    console.log('[DeadlineReminder] Skipping — previous run still in progress');
    return;
  }
  isRunning = true;

  try {
    const now = new Date();
    const Organization = require('../models/Organization');
    const Board = require('../models/Board');

    const org = await Organization.findOne().select('settings.automations.deadlineReminder').lean();
    if (org?.settings?.automations?.deadlineReminder?.enabled === false) return;
    if (org?.settings?.automations?.deadlineReminder?.cronMode === 'external') return;

    const archivedBoards = await Board.find({ archived: true }).select('_id').lean();
    const archivedBoardIds = archivedBoards.map(b => b._id);

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

    const userIds = [...new Set(tasks.flatMap(t =>
      (t.assignedTo || []).map(id => id.toString())
    ))];
    const users = await User.find({ _id: { $in: userIds } }).lean();
    const userMap = new Map(users.map(u => [u._id.toString(), u]));

    const groupKeysToCheck = [];
    const taskNotifications = [];

    for (const task of tasks) {
      const dueDate = new Date(task.dueDate);
      const msUntilDue = dueDate.getTime() - now.getTime();
      const hoursUntilDue = msUntilDue / (1000 * 60 * 60);
      const isOverdue = msUntilDue < 0;
      const daysUntilDue = hoursUntilDue / 24;

      const tn = task.taskNotifications || {};
      const urgentEnabled = tn.urgentMode?.enabled !== false;
      const urgentThresholdDays = tn.urgentMode?.thresholdDays ?? 3;
      const urgentIntervalHours = tn.urgentMode?.intervalHours ?? 4;
      const intervalEnabled = tn.intervalReminder?.enabled === true;
      const intervalHours = tn.intervalReminder?.hours ?? 6;

      let effectiveIntervalHours = 0;
      if (!isOverdue && urgentEnabled && daysUntilDue <= urgentThresholdDays) {
        effectiveIntervalHours = urgentIntervalHours;
      } else if (intervalEnabled) {
        effectiveIntervalHours = intervalHours;
      }

      for (const userId of (task.assignedTo || []).map(id => id.toString())) {
        const user = userMap.get(userId);
        if (!user) continue;
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

        groupKeysToCheck.push(groupKey);
        taskNotifications.push({ userId, type, title, message, board: task.board, taskId: task._id, groupKey, taskTitle: task.title });
      }
    }

    if (!groupKeysToCheck.length) return;

    const existingKeys = await Notification.find({
      groupKey: { $in: groupKeysToCheck }
    }).select('groupKey').lean();
    const existingSet = new Set(existingKeys.map(n => n.groupKey));

    let sentCount = 0;
    for (const n of taskNotifications) {
      if (existingSet.has(n.groupKey)) continue;

      await notificationService.create({
        recipient: n.userId,
        type: n.type,
        title: n.title,
        message: n.message,
        board: n.board,
        task: n.taskId,
        groupKey: n.groupKey,
        taskTitle: n.taskTitle
      });

      sentCount++;
    }

    if (sentCount > 0) {
      console.log(`[DeadlineReminder] Sent ${sentCount} reminder(s)`);
    }
  } catch (err) {
    console.error('[DeadlineReminder] Error:', err.message);
  } finally {
    isRunning = false;
  }
}

function start() {
  const expression = cron.validate(CRON_EXPRESSION) ? CRON_EXPRESSION : '*/30 * * * *';
  const task = cron.schedule(expression, () => {
    runDeadlineCheck().catch((err) => console.error('[DeadlineReminder]', err.message));
  });

  setTimeout(() => {
    runDeadlineCheck().catch((err) => console.error('[DeadlineReminder] initial run:', err.message));
  }, 10000);

  console.log(`[DeadlineReminder] cron scheduled: ${expression}`);

  return () => {
    task.stop();
    console.log('[DeadlineReminder] Stopped');
  };
}

module.exports = { start, runDeadlineCheck };
