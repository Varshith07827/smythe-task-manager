export const ALL_TASK_STATUSES = ['pending', 'in_progress', 'completed', 'blocked', 'cancelled'];

export const STATUS_ALERT_LABELS = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Completed',
  blocked: 'Blocked',
  cancelled: 'Cancelled'
};

export function normalizeNotificationPrefs(raw) {
  const r = raw || {};
  const base = {
    inApp: true,
    email: true,
    taskAssigned: true,
    taskUpdated: true,
    statusChanged: true,
    deadlineReminder: true,
    mentions: true,
    progressDigest: true,
    notifyOnStatuses: [...ALL_TASK_STATUSES],
    deliveryMode: 'realtime',
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
    deadlineReminderHours: 24,
    reminderIntervalHours: 0,
    ...r
  };
  if (!Array.isArray(r.notifyOnStatuses)) {
    base.notifyOnStatuses = [...ALL_TASK_STATUSES];
  }
  return base;
}
