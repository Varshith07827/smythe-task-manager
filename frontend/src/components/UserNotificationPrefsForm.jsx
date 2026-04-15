import {
  ALL_TASK_STATUSES,
  STATUS_ALERT_LABELS,
  normalizeNotificationPrefs
} from '../utils/notificationPrefs';

/**
 * Controlled form: prefs + setPrefs; parent calls onSave when user clicks Save.
 */
export default function UserNotificationPrefsForm({ prefs: rawPrefs, setPrefs, onSave }) {
  const prefs = normalizeNotificationPrefs(rawPrefs);

  const toggleNotifyStatus = (status) => {
    setPrefs((p) => {
      const n = normalizeNotificationPrefs(p);
      const cur = n.notifyOnStatuses || [];
      const next = cur.includes(status) ? cur.filter((s) => s !== status) : [...cur, status];
      return { ...n, notifyOnStatuses: next };
    });
  };

  const rows = [
    { key: 'inApp', label: 'In-app notifications' },
    { key: 'email', label: 'Email notifications' },
    { key: 'taskAssigned', label: 'Task assigned to me' },
    { key: 'taskUpdated', label: 'Task updates' },
    { key: 'deadlineReminder', label: 'Deadline reminders' },
    { key: 'mentions', label: 'Mentions' },
    { key: 'progressDigest', label: 'Project notification summaries (every 4h when enabled on a project)' }
  ];

  return (
    <div>
      {rows.map(({ key, label }) => (
        <label
          key={key}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 0',
            borderBottom: '1px solid var(--separator)',
            cursor: 'pointer'
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 450 }}>{label}</span>
          <input
            type="checkbox"
            checked={prefs[key] !== false}
            onChange={(e) => setPrefs((p) => ({ ...p, [key]: e.target.checked }))}
            style={{ width: 20, height: 20, accentColor: 'var(--accent)' }}
          />
        </label>
      ))}
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 0',
          borderBottom: '1px solid var(--separator)',
          cursor: 'pointer'
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 450 }}>Task status changes</span>
        <input
          type="checkbox"
          checked={prefs.statusChanged !== false}
          onChange={(e) => setPrefs((p) => ({ ...p, statusChanged: e.target.checked }))}
          style={{ width: 20, height: 20, accentColor: 'var(--accent)' }}
        />
      </label>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 14, marginBottom: 10, lineHeight: 1.45 }}>
        Alert me when a task I am involved with moves to:
      </p>
      <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
        {ALL_TASK_STATUSES.map((s) => (
          <label
            key={s}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              cursor: prefs.statusChanged === false ? 'not-allowed' : 'pointer',
              opacity: prefs.statusChanged === false ? 0.5 : 1
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 450 }}>{STATUS_ALERT_LABELS[s]}</span>
            <input
              type="checkbox"
              disabled={prefs.statusChanged === false}
              checked={(prefs.notifyOnStatuses || []).includes(s)}
              onChange={() => toggleNotifyStatus(s)}
              style={{ width: 20, height: 20, accentColor: 'var(--accent)' }}
            />
          </label>
        ))}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16 }}>
        Uncheck all statuses to turn off status-based alerts while keeping other notifications.
      </p>

      {/* Notification timing */}
      <div style={{ borderTop: '1px solid var(--separator)', marginTop: 12, paddingTop: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-tertiary)', marginBottom: 14 }}>
          Timing
        </div>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label">Deadline reminder</label>
          <select
            className="form-input"
            value={prefs.deadlineReminderHours ?? 24}
            onChange={e => setPrefs(p => ({ ...p, deadlineReminderHours: Number(e.target.value) }))}
          >
            <option value={6}>6 hours before</option>
            <option value={12}>12 hours before</option>
            <option value={24}>24 hours before</option>
            <option value={48}>48 hours before</option>
            <option value={72}>3 days before</option>
          </select>
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 0',
            borderBottom: '1px solid var(--separator)',
            cursor: 'pointer'
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 450 }}>Quiet hours</span>
          <input
            type="checkbox"
            checked={prefs.quietHoursEnabled === true}
            onChange={e => setPrefs(p => ({ ...p, quietHoursEnabled: e.target.checked }))}
            style={{ width: 20, height: 20, accentColor: 'var(--accent)' }}
          />
        </label>

        {prefs.quietHoursEnabled && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Start</label>
              <input
                type="time"
                className="form-input"
                value={prefs.quietHoursStart || '22:00'}
                onChange={e => setPrefs(p => ({ ...p, quietHoursStart: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">End</label>
              <input
                type="time"
                className="form-input"
                value={prefs.quietHoursEnd || '08:00'}
                onChange={e => setPrefs(p => ({ ...p, quietHoursEnd: e.target.value }))}
              />
            </div>
          </div>
        )}
      </div>

      <button type="button" className="btn btn-primary" style={{ marginTop: 4 }} onClick={onSave}>
        Save preferences
      </button>
    </div>
  );
}
