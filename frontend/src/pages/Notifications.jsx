import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { usersApi } from '../api/users';
import { normalizeNotificationPrefs } from '../utils/notificationPrefs';
import { motion } from 'framer-motion';
import { alert } from '../components/AlertSystem';

function initials(name) {
  return name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 44,
        height: 26,
        borderRadius: 13,
        border: 'none',
        background: checked ? 'var(--accent)' : 'var(--border)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative',
        transition: 'background 0.2s',
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
        padding: 0,
      }}
    >
      <span style={{
        position: 'absolute',
        top: 3,
        left: checked ? 21 : 3,
        width: 20,
        height: 20,
        borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
      }} />
    </button>
  );
}

function PrefRow({ label, desc, checked, onChange, disabled }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      padding: '14px 0',
      borderBottom: '1px solid var(--separator)',
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</div>
        {desc && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{desc}</div>}
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function SectionCard({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      marginBottom: 16,
      overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '14px 20px',
          background: 'none',
          border: 'none',
          borderBottom: open ? '1px solid var(--border)' : 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{
          fontSize: 13,
          fontWeight: 650,
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}>
          {title}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2.5" strokeLinecap="round"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div style={{ padding: '0 20px 4px' }}>
          {children}
        </div>
      )}
    </div>
  );
}

export default function Notifications() {
  const { user, setUser } = useAuth();
  const [prefs, setPrefs] = useState(() => normalizeNotificationPrefs(null));
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState([]);
  const [savingMemberId, setSavingMemberId] = useState(null);
  const [editingMemberId, setEditingMemberId] = useState(null);

  const isAdmin = user?.role === 'admin';

  useEffect(() => { setPrefs(normalizeNotificationPrefs(user?.notificationPreferences)); }, [user]);
  useEffect(() => {
    if (!isAdmin) return;
    usersApi.getOrgMembers().then(res => setMembers(res.data)).catch(() => {});
  }, [isAdmin]);

  const toggle = (key) => setPrefs(p => ({ ...p, [key]: !p[key] }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await usersApi.updateNotificationPrefs(normalizeNotificationPrefs(prefs));
      setUser(u => {
        if (!u) return u;
        const next = { ...u, notificationPreferences: data };
        localStorage.setItem('user', JSON.stringify(next));
        return next;
      });
      alert.success('Preferences saved');
    } catch {
      alert.error('Could not save preferences');
    } finally {
      setSaving(false);
    }
  };

  const patchMember = useCallback(async (memberId, key, value) => {
    setSavingMemberId(memberId);
    try {
      const { data } = await usersApi.updateMemberNotificationPrefs(memberId, { [key]: value });
      setMembers(prev => prev.map(m => m._id === memberId ? { ...m, notificationPreferences: data } : m));
    } catch {
      alert.error('Could not update');
    } finally {
      setSavingMemberId(null);
    }
  }, []);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="page-section-header">
        <div className="page-section-header-main">
          <h2 className="page-section-title">Notifications</h2>
          <p className="page-section-subtitle">Choose what you want to be notified about.</p>
        </div>
      </div>

      {/* My preferences */}
      <SectionCard title="My preferences">
        <PrefRow
          label="In-app notifications"
          desc="Show alerts inside the app"
          checked={prefs.inApp !== false}
          onChange={v => setPrefs(p => ({ ...p, inApp: v }))}
        />
        <PrefRow
          label="Email notifications"
          desc="Send alerts to your email"
          checked={prefs.email !== false}
          onChange={v => setPrefs(p => ({ ...p, email: v }))}
        />
        <PrefRow
          label="Task assigned to me"
          checked={prefs.taskAssigned !== false}
          onChange={v => setPrefs(p => ({ ...p, taskAssigned: v }))}
        />
        <PrefRow
          label="Task updates"
          desc="Comments and changes on tasks you're involved with"
          checked={prefs.taskUpdated !== false}
          onChange={v => setPrefs(p => ({ ...p, taskUpdated: v }))}
        />
        <PrefRow
          label="Deadline reminders"
          checked={prefs.deadlineReminder !== false}
          onChange={v => setPrefs(p => ({ ...p, deadlineReminder: v }))}
        />
        <PrefRow
          label="Mentions"
          desc="When someone mentions you in a comment"
          checked={prefs.mentions !== false}
          onChange={v => setPrefs(p => ({ ...p, mentions: v }))}
        />
        <div style={{ paddingTop: 16, paddingBottom: 16 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save preferences'}
          </button>
        </div>
      </SectionCard>


      {/* Team — admin only */}
      {isAdmin && members.length > 0 && (
        <SectionCard title="Team">
          <div style={{ paddingTop: 4, paddingBottom: 8 }}>
            {members.map(m => {
              const p = normalizeNotificationPrefs(m.notificationPreferences);
              const busy = savingMemberId === m._id;
              const avatarUrl = m.avatar?.startsWith('/api/') ? m.avatar : null;
              const isEditing = editingMemberId === m._id;
              return (
                <div key={m._id} style={{ borderBottom: '1px solid var(--separator)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0' }}>
                    {/* Avatar */}
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={m.name} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                    ) : (
                      <div className="user-avatar" style={{ width: 36, height: 36, fontSize: 12, flexShrink: 0 }}>{initials(m.name)}</div>
                    )}

                    {/* Name + email */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.email}</div>
                    </div>

                    {/* Edit button */}
                    <button
                      type="button"
                      onClick={() => setEditingMemberId(isEditing ? null : m._id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '5px 10px', borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border)', background: isEditing ? 'var(--accent)' : 'var(--bg-primary)',
                        color: isEditing ? '#fff' : 'var(--text-secondary)',
                        fontSize: 12, fontWeight: 500, cursor: 'pointer',
                        transition: 'all 0.15s',
                        flexShrink: 0,
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      {isEditing ? 'Close' : 'Edit'}
                    </button>
                  </div>

                  {/* Expanded edit panel */}
                  {isEditing && (
                    <div style={{
                      padding: '8px 0 16px',
                      marginLeft: 48,
                    }}>
                      {[
                        { key: 'inApp', label: 'In-app notifications' },
                        { key: 'email', label: 'Email notifications' },
                        { key: 'taskAssigned', label: 'Task assigned' },
                        { key: 'taskUpdated', label: 'Task updates' },
                        { key: 'deadlineReminder', label: 'Deadline reminders' },
                        { key: 'mentions', label: 'Mentions' },
                      ].map(({ key, label }) => (
                        <div key={key} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '8px 0', borderBottom: '1px solid var(--separator)',
                        }}>
                          <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{label}</span>
                          <Toggle checked={p[key] !== false} onChange={v => patchMember(m._id, key, v)} disabled={busy} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}
    </motion.div>
  );
}
