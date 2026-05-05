import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usersApi } from '../api/users';
import { authApi } from '../api/auth';
import { organizationsApi } from '../api/organizations';
import CollapsibleCard from '../components/CollapsibleCard';
import { normalizeNotificationPrefs } from '../utils/notificationPrefs';
import { useBranding } from '../context/BrandingContext';
import { motion } from 'framer-motion';
import { alert } from '../components/AlertSystem';

const colorTones = {
  warm: [
    { color: '#ef4444', label: 'Red' }, { color: '#f97316', label: 'Orange' },
    { color: '#f59e0b', label: 'Amber' }, { color: '#eab308', label: 'Yellow' },
    { color: '#f43f5e', label: 'Rose' }, { color: '#ea580c', label: 'Dark Orange' },
  ],
  cold: [
    { color: '#3b82f6', label: 'Sky' }, { color: '#0a84ff', label: 'Standard Blue' },
    { color: '#6366f1', label: 'Indigo' }, { color: '#0ea5e9', label: 'Cyan' },
    { color: '#14b8a6', label: 'Teal' }, { color: '#0284c7', label: 'Ocean' }
  ],
  soft: [
    { color: '#fca5a5', label: 'Soft Red' }, { color: '#fdba74', label: 'Soft Orange' },
    { color: '#93c5fd', label: 'Soft Blue' }, { color: '#a78bfa', label: 'Soft Purple' },
    { color: '#a7f3d0', label: 'Soft Emerald' }, { color: '#fbcfe8', label: 'Soft Pink' },
  ],
  vibrant: [
    { color: '#ef0000', label: 'Neon Red' }, { color: '#10b981', label: 'Neon Green' },
    { color: '#d946ef', label: 'Neon Fuchsia' }, { color: '#06b6d4', label: 'Neon Cyan' },
    { color: '#8b5cf6', label: 'Vibrant Purple' }, { color: '#ec4899', label: 'Vibrant Pink' },
  ]
};

const defaultColorMixes = [
  { name: 'Midnight Blue', accent: '#3b82f6', sidebar: '#1e293b' },
  { name: 'Forest', accent: '#10b981', sidebar: '#14532d' },
  { name: 'Sunset', accent: '#f97316', sidebar: '#450a0a' },
  { name: 'Royal', accent: '#8b5cf6', sidebar: '#3b0764' },
  { name: 'Classic', accent: '#0a84ff', sidebar: '#1a1a2e' },
];

export default function Settings() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const { refresh: refreshBranding } = useBranding();
  const [members, setMembers] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('user');
  const [activeTab, setActiveTab] = useState(() => user?.role === 'admin' ? 'users' : 'notifications');
  const [savingMemberNotifyId, setSavingMemberNotifyId] = useState(null);
  const [branding, setBranding] = useState({ appTitle: 'Smythe', tagline: '', logoUrl: '', logoShape: 'rounded', accentColor: '#0a84ff', logoSize: 48, headerLogoUrl: '', headerLogoHeight: 36, headerLogoScale: 1, faviconUrl: '', siteTitle: '', sidebarColor: '#1a1a2e', useSameLogo: true, showLogoInHeader: true, showLogoInSidebar: true, showFaviconInSidebar: true, showNameInHeader: true });
  const [allowSignup, setAllowSignup] = useState(false);
  const [brandingLoading, setBrandingLoading] = useState(false);
  const [showLogoPreview, setShowLogoPreview] = useState(false);
  const [activeColorTone, setActiveColorTone] = useState('warm');
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [userSearch, setUserSearch] = useState('');
  const [editUser, setEditUser] = useState(null); // { _id, name, email, role, phone }
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState('user');
  const [savingEdit, setSavingEdit] = useState(false);
  const [showSupportPasswordPrompt, setShowSupportPasswordPrompt] = useState(false);
  const [supportPasswordInput, setSupportPasswordInput] = useState('');
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [showPasswordSupport, setShowPasswordSupport] = useState(false);
  const [supportSubject, setSupportSubject] = useState('');
  const [supportDetails, setSupportDetails] = useState('');
  const [sendingSupport, setSendingSupport] = useState(false);
  const [automations, setAutomations] = useState(null);
  const [savingAutomations, setSavingAutomations] = useState(false);
  const [triggeringJob, setTriggeringJob] = useState(null);

  const isAdmin = user?.role === 'admin';

  const loadMembers = useCallback(async () => {
    if (!user) return;
    try {
      const res = isAdmin ? await usersApi.getOrgMembers() : await usersApi.getMembers();
      setMembers(res.data || []);
    } catch {
      setMembers([]);
    }
  }, [isAdmin, user]);

  useEffect(() => {
    if (user) loadMembers();
    if (user?.organization) {
      const orgId = typeof user.organization === 'object' ? user.organization._id : user.organization;
      organizationsApi.get(orgId).then(res => {
        if (res.data?.branding) setBranding(b => ({ ...b, ...res.data.branding }));
        if (res.data?.settings?.allowSignup !== undefined) setAllowSignup(res.data.settings.allowSignup);
      }).catch(() => { });
      if (user?.role === 'admin') {
        organizationsApi.getAutomations(orgId).then(res => setAutomations(res.data)).catch(() => { });
      }
    }
  }, [user, loadMembers]);

  useEffect(() => {
    if (!user || activeTab !== 'users') return;
    const timer = setInterval(() => {
      loadMembers();
    }, 15000);
    return () => clearInterval(timer);
  }, [activeTab, loadMembers, user]);

  const [lastInvite, setLastInvite] = useState(null);

  const handleInvite = async (e) => {
    e.preventDefault();
    try {
      const res = await authApi.invite({ email: inviteEmail, name: inviteName, role: inviteRole });
      setLastInvite({ email: res.data.user.email, password: res.data.tempPassword });
      alert.success(`Invited ${res.data.user.email}`);
      setMembers(prev => {
        const exists = prev.some(m => m._id === res.data.user._id);
        return exists ? prev.map(m => m._id === res.data.user._id ? res.data.user : m) : [...prev, res.data.user];
      });
      setInviteEmail(''); setInviteName('');
    } catch (err) {
      const msg = err.response?.data?.error;
      if (msg?.includes('exists') || msg?.includes('duplicate')) {
        alert.error('This person has already been invited.');
      } else {
        alert.error(msg || 'Could not send invite. Please try again.');
      }
    }
  };

  const openEditUser = (m) => {
    setEditUser(m);
    setEditName(m.name || '');
    setEditEmail(m.email || '');
    setEditPhone(m.phone || '');
    setEditRole(m.role || 'user');
  };

  const handleSaveEditUser = async () => {
    if (!editUser) return;
    setSavingEdit(true);
    try {
      await usersApi.updateMember(editUser._id, { name: editName.trim(), email: editEmail.trim(), phone: editPhone.trim(), role: editRole });
      setMembers(prev => prev.map(m => m._id === editUser._id ? { ...m, name: editName.trim(), email: editEmail.trim(), phone: editPhone.trim(), role: editRole } : m));
      alert.success('User updated');
      setEditUser(null);
    } catch (err) {
      alert.error(err.response?.data?.error || 'Could not update user.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleRoleChange = async (id, role) => {
    try {
      await usersApi.changeRole(id, role);
      setMembers(prev => prev.map(m => m._id === id ? { ...m, role } : m));
      alert.success('Role updated');
    } catch {
      alert.error('Could not update role.');
    }
  };

  const handleRemoveUser = async (id) => {
    try {
      await usersApi.removeUser(id);
      setMembers(prev => prev.filter(m => m._id !== id));
      setConfirmRemove(null);
      alert.success('User removed');
    } catch {
      alert.error('Could not remove user.');
    }
  };

  const patchMemberNotify = useCallback(async (memberId, key, value) => {
    setSavingMemberNotifyId(memberId);
    try {
      const { data } = await usersApi.updateMemberNotificationPrefs(memberId, { [key]: value });
      setMembers(prev => prev.map(m => m._id === memberId ? { ...m, notificationPreferences: data } : m));
    } catch {
      alert.error('Could not update notification setting.');
    } finally {
      setSavingMemberNotifyId(null);
    }
  }, []);

  const handleSaveBranding = async () => {
    setBrandingLoading(true);
    try {
      const orgId = typeof user.organization === 'object' ? user.organization._id : user.organization;
      await organizationsApi.update(orgId, { branding, settings: { allowSignup } });
      await refreshBranding();
      alert.success('Branding saved');
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Could not save branding.';
      alert.error(msg);
    } finally {
      setBrandingLoading(false);
    }
  };

  const logoFileRef = useRef(null);
  const headerLogoFileRef = useRef(null);
  const faviconFileRef = useRef(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingHeaderLogo, setUploadingHeaderLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);

  const handleBrandingUpload = async (file, field) => {
    const isPngMime = file?.type === 'image/png';
    const isPngExt = /\.png$/i.test(file?.name || '');
    if (!isPngMime || !isPngExt) {
      alert.error('Only PNG files are allowed');
      return;
    }

    const setLoading = field === 'logoUrl' ? setUploadingLogo : field === 'headerLogoUrl' ? setUploadingHeaderLogo : setUploadingFavicon;
    setLoading(true);
    try {
      const orgId = typeof user.organization === 'object' ? user.organization._id : user.organization;
      const res = await organizationsApi.uploadBrandingFile(orgId, file, field);
      setBranding(b => ({ ...b, [field]: res.data.url }));
      await refreshBranding();
      alert.success('File uploaded');
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Upload failed';
      alert.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const initials = (name) => name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="page-section-header">
        <div className="page-section-header-main">
          <h2 className="page-section-title">Settings</h2>
          <p className="page-section-subtitle">Manage your team and preferences</p>
        </div>
      </div>

      <div className="filter-pills" style={{ marginBottom: 24 }}>
        {[...(isAdmin ? ['users'] : []), 'notifications', 'security', 'support', ...(isAdmin ? ['branding', 'automations'] : [])].map(tab => (
          <button
            key={tab}
            className={`filter-pill ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'support' ? 'Support' : tab === 'users' ? 'Users' : tab === 'automations' ? 'Automations' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'users' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          {/* Invite */}
          {isAdmin && (
            <CollapsibleCard title="Invite user" defaultOpen style={{ marginBottom: 20 }}>
              <form onSubmit={handleInvite} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 140 }}>
                  <label className="form-label">Name</label>
                  <input type="text" className="form-input" placeholder="Name" value={inviteName} onChange={e => setInviteName(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 180 }}>
                  <label className="form-label">Email</label>
                  <input type="email" className="form-input" placeholder="email@example.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Role</label>
                  <select className="form-input" value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <button type="submit" className="btn btn-primary">Invite</button>
              </form>
              {lastInvite && (
                <div style={{
                  marginTop: 14, padding: '12px 16px', background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)'
                }}>
                  <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                    Invite credentials (also sent via email)
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                    <div>Email: <strong style={{ color: 'var(--text-primary)' }}>{lastInvite.email}</strong></div>
                    <div>Password: <code style={{ background: 'var(--bg-hover)', padding: '2px 8px', borderRadius: 4, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.03em' }}>{lastInvite.password}</code></div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    style={{ marginTop: 8, fontSize: 11 }}
                    onClick={() => setLastInvite(null)}
                  >Dismiss</button>
                </div>
              )}
            </CollapsibleCard>
          )}

          {/* Users */}
          <CollapsibleCard title={`Team users (${members.length})`} defaultOpen>
            {/* Search */}
            <div style={{ marginBottom: 16, position: 'relative' }}>
              <input
                type="text"
                className="search-input"
                placeholder="Search users..."
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                style={{ width: '100%', maxWidth: 'none' }}
              />
              {userSearch && (
                <button
                  type="button"
                  onClick={() => setUserSearch('')}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4
                  }}
                >✕</button>
              )}
            </div>
            {members.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No team users yet.</p>
            ) : (() => {
              const sorted = [...members].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
              const filtered = userSearch.trim()
                ? sorted.filter(m => m.name?.toLowerCase().includes(userSearch.toLowerCase()) || m.email?.toLowerCase().includes(userSearch.toLowerCase()))
                : sorted.slice(0, 10);
              const showingAll = !userSearch.trim() && members.length > 10;
              return (
                <>
                  {filtered.map(m => {
                    const mp = normalizeNotificationPrefs(m.notificationPreferences);
                    const notifyBusy = savingMemberNotifyId === m._id;
                    return (
                      <div key={m._id} className="settings-member-row">
                        <div className="settings-member-info">
                          <div className="user-avatar" style={{ flexShrink: 0, width: 30, height: 30, fontSize: 11 }}>{initials(m.name)}</div>
                          <div className="settings-member-identity">
                            <button
                              type="button"
                              onClick={() => openEditUser(m)}
                              className="settings-member-name"
                            >{m.name}</button>
                            <span className="settings-member-email">{m.email}</span>
                          </div>
                        </div>
                        <div className="settings-member-actions">
                          <span className={`badge badge-${m.status === 'active' ? 'completed' : m.status === 'invited' ? 'pending' : 'cancelled'}`}>
                            {m.status}
                          </span>
                          {user?.role === 'admin' && m._id !== user._id ? (
                            <select className="form-input" style={{ width: 82, padding: '3px 6px', fontSize: 11, flexShrink: 0 }} value={m.role} onChange={e => handleRoleChange(m._id, e.target.value)}>
                              <option value="user">User</option>
                              <option value="admin">Admin</option>
                            </select>
                          ) : (
                            <span style={{ width: 82, fontSize: 11, fontWeight: 550, color: 'var(--text-secondary)', textTransform: 'capitalize', flexShrink: 0, textAlign: 'center', display: 'inline-block' }}>{m.role}</span>
                          )}
                          {isAdmin && (
                            <div className="settings-member-notify-toggles">
                              {['inApp', 'email', 'progressDigest'].map(key => (
                                <label key={key} className="settings-member-notify-label">
                                  <span>{key === 'progressDigest' ? 'Digest' : key === 'inApp' ? 'In-app' : 'Email'}</span>
                                  <input type="checkbox" className="notifications-admin-switch" checked={mp[key] !== false} disabled={notifyBusy} onChange={(e) => patchMemberNotify(m._id, key, e.target.checked)} />
                                </label>
                              ))}
                            </div>
                          )}
                          {user?.role === 'admin' && m._id !== user._id ? (
                            <button className="btn btn-ghost btn-xs" onClick={() => setConfirmRemove(m)} title="Remove" style={{ flexShrink: 0, width: 28 }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.8" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                            </button>
                          ) : (
                            <span style={{ width: 28, flexShrink: 0 }} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {showingAll && (
                    <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 10, textAlign: 'center' }}>
                      Showing 10 most recently added · <button type="button" onClick={() => setUserSearch(' ')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 12, padding: 0 }}>Search to find others</button>
                    </p>
                  )}
                </>
              );
            })()}
          </CollapsibleCard>
        </motion.div>
      )}

      {activeTab === 'notifications' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          <CollapsibleCard title="Notification preferences">
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
              Manage what you get notified about on the Notifications page.
            </p>
            <button className="btn btn-secondary" onClick={() => navigate('/notifications')}>
              Go to Notifications
            </button>
          </CollapsibleCard>
        </motion.div>
      )}

      {activeTab === 'security' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          <CollapsibleCard title="Account security">
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
              Password and profile settings have moved to your personal profile page.
            </p>
            <button className="btn btn-secondary" onClick={() => navigate('/profile')}>
              Go to My Profile
            </button>
          </CollapsibleCard>
        </motion.div>
      )}

      {confirmRemove && (
        <div className="modal-overlay">
          <motion.div
            className="modal"
            onClick={e => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            style={{ maxWidth: 400, padding: 24 }}
          >
            <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Remove User</h4>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 20 }}>
              Are you sure you want to remove <strong>{confirmRemove.name}</strong> ({confirmRemove.email}) from the team? They will lose access to all boards.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmRemove(null)}>Cancel</button>
              <button className="btn btn-danger btn-sm" onClick={() => handleRemoveUser(confirmRemove._id)}>Remove</button>
            </div>
          </motion.div>
        </div>
      )}

      {editUser && (
        <div className="modal-overlay" onClick={() => setEditUser(null)}>
          <motion.div
            className="modal"
            onClick={e => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 400 }}
            style={{ maxWidth: 480 }}
          >
            <div className="modal-header">
              <h3>Edit User</h3>
              <button className="modal-close" onClick={() => setEditUser(null)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="modal-body" style={{ padding: '16px 24px 24px', display: 'grid', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Name</label>
                <input type="text" className="form-input" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Full name" autoFocus />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Email</label>
                <input type="email" className="form-input" value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="email@example.com" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Phone <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(optional)</span></label>
                <input type="tel" className="form-input" value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="+1 555 000 0000" />
              </div>
              {isAdmin && editUser._id !== user._id && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Role</label>
                  <select className="form-input" value={editRole} onChange={e => setEditRole(e.target.value)}>
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditUser(null)}>Cancel</button>
                <button className="btn btn-primary btn-sm" disabled={!editName.trim() || !editEmail.trim() || savingEdit} onClick={handleSaveEditUser}>
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {activeTab === 'support' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          <CollapsibleCard title="Support" defaultOpen>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
              Need help with your account or password? Submit a support request and our administrators will assist you.
            </p>
            <button className="btn btn-secondary" onClick={() => { setSupportPasswordInput(''); setShowSupportPasswordPrompt(true); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
              Contact Support
            </button>
          </CollapsibleCard>
        </motion.div>
      )}

      {showSupportPasswordPrompt && (
        <div className="modal-overlay">
          <motion.div
            className="modal"
            onClick={e => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 400 }}
            style={{ maxWidth: 400 }}
          >
            <div className="modal-header">
              <h3>Verify Identity</h3>
              <button className="modal-close" onClick={() => setShowSupportPasswordPrompt(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="modal-body" style={{ padding: '16px 24px 24px' }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
                Enter your account password to access support.
              </p>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Your account password"
                  value={supportPasswordInput}
                  onChange={e => setSupportPasswordInput(e.target.value)}
                  autoFocus
                  onKeyDown={async e => {
                    if (e.key === 'Enter' && supportPasswordInput.trim() && !verifyingPassword) {
                      setVerifyingPassword(true);
                      try {
                        await usersApi.verifyPassword(supportPasswordInput);
                        setShowSupportPasswordPrompt(false);
                        setSupportPasswordInput('');
                        setShowPasswordSupport(true);
                      } catch (err) {
                        alert.error(err.response?.data?.error || 'Incorrect password');
                      } finally {
                        setVerifyingPassword(false);
                      }
                    }
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowSupportPasswordPrompt(false)}>Cancel</button>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={!supportPasswordInput.trim() || verifyingPassword}
                  onClick={async () => {
                    setVerifyingPassword(true);
                    try {
                      await usersApi.verifyPassword(supportPasswordInput);
                      setShowSupportPasswordPrompt(false);
                      setSupportPasswordInput('');
                      setShowPasswordSupport(true);
                    } catch (err) {
                      alert.error(err.response?.data?.error || 'Incorrect password');
                    } finally {
                      setVerifyingPassword(false);
                    }
                  }}
                >
                  {verifyingPassword ? 'Verifying...' : 'Continue'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {showPasswordSupport && (
        <div className="modal-overlay">
          <motion.div
            className="modal"
            onClick={e => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 400 }}
            style={{ maxWidth: 480 }}
          >
            <div className="modal-header">
              <h3>Support</h3>
              <button className="modal-close" onClick={() => { setShowPasswordSupport(false); setSupportSubject(''); setSupportDetails(''); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="modal-body" style={{ padding: '16px 24px 24px' }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
                Describe your issue and all administrators will be notified via email.
              </p>
              <div className="form-group">
                <label className="form-label">Subject</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Brief description of the issue"
                  value={supportSubject}
                  onChange={e => setSupportSubject(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Details</label>
                <textarea
                  className="form-input"
                  placeholder="Describe your issue in detail..."
                  value={supportDetails}
                  onChange={e => setSupportDetails(e.target.value)}
                  rows={4}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => { setShowPasswordSupport(false); setSupportSubject(''); setSupportDetails(''); }}>Cancel</button>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={!supportSubject.trim() || !supportDetails.trim() || sendingSupport}
                  onClick={async () => {
                    setSendingSupport(true);
                    try {
                      await usersApi.requestPasswordSupport({ subject: supportSubject.trim(), details: supportDetails.trim() });
                      alert.success('Support request sent to administrators');
                      setShowPasswordSupport(false);
                      setSupportSubject('');
                      setSupportDetails('');
                    } catch (err) {
                      alert.error(err.response?.data?.error || 'Failed to send support request');
                    } finally {
                      setSendingSupport(false);
                    }
                  }}
                >
                  {sendingSupport ? 'Sending...' : 'Send to Admins'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {activeTab === 'automations' && isAdmin && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <CollapsibleCard title="Scheduler Configuration" defaultOpen>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
                Configure how each automated job runs. <strong>Internal</strong> uses the built-in cron inside this
                app process. Switch to <strong>External</strong> when this app is white-labelled on a separate
                database — the internal scheduler will be bypassed for this org and you must call the trigger
                endpoint from your own cron service (e.g. cron-job.org, GitHub Actions, Render cron jobs).
              </p>

              {automations ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {[
                    {
                      key: 'deadlineReminder',
                      label: 'Deadline Reminders',
                      description: 'Checks for upcoming and overdue task deadlines and notifies assignees.',
                      cron: automations.deadlineReminder.cronExpression,
                      envVar: 'DEADLINE_REMINDER_CRON',
                      job: 'deadline-reminder'
                    },
                    {
                      key: 'progressDigest',
                      label: 'Progress Digest',
                      description: 'Sends each assignee a summary of their open tasks on boards with digest enabled.',
                      cron: automations.progressDigest.cronExpression,
                      envVar: 'PROGRESS_DIGEST_CRON',
                      job: 'progress-digest'
                    }
                  ].map(({ key, label, description, cron, envVar, job }) => {
                    const orgId = typeof user?.organization === 'object' ? user.organization._id : user?.organization;
                    const isExternal = automations[key].cronMode === 'external';
                    const apiBase = window.location.origin.replace(':5173', ':5000').replace(':3000', ':5000');
                    const triggerUrl = `${apiBase}/api/organizations/${orgId}/automations/trigger/${job}`;
                    const curlCmd = `curl -X POST "${triggerUrl}" \\\n  -H "Authorization: Bearer <your-admin-jwt>"`;
                    return (
                      <div key={key} style={{ padding: '16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', border: `1px solid ${isExternal ? 'var(--accent)' : 'var(--border)'}`, display: 'flex', flexDirection: 'column', gap: 14, transition: 'border-color 0.2s' }}>

                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
                              {isExternal && (
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'var(--accent-subtle)', color: 'var(--accent)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                                  External
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{description}</div>
                          </div>
                          <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, flexShrink: 0, marginTop: 2 }}>
                            <input
                              type="checkbox"
                              checked={automations[key].enabled}
                              onChange={e => setAutomations(a => ({ ...a, [key]: { ...a[key], enabled: e.target.checked } }))}
                              style={{ opacity: 0, width: 0, height: 0 }}
                            />
                            <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, borderRadius: 22, background: automations[key].enabled ? 'var(--accent)' : 'var(--border)', transition: 'background 0.2s' }}>
                              <span style={{ position: 'absolute', height: 16, width: 16, left: automations[key].enabled ? 20 : 3, bottom: 3, background: 'white', borderRadius: '50%', transition: 'left 0.2s' }} />
                            </span>
                          </label>
                        </div>

                        {/* Cron expression info */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <code style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'var(--bg-hover)', padding: '2px 8px', borderRadius: 4 }}>cron: {cron}</code>
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                            — override with <code style={{ background: 'var(--bg-hover)', padding: '1px 6px', borderRadius: 4 }}>{envVar}</code> env var
                          </span>
                        </div>

                        {/* Execution mode */}
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Execution Mode</div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            {[
                              { value: 'internal', label: '⚙️  Internal', hint: 'App runs this job automatically on the cron schedule above' },
                              { value: 'external', label: '🌐  External', hint: 'Internal scheduler is bypassed — your external cron must call the trigger endpoint' }
                            ].map(opt => (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => setAutomations(a => ({ ...a, [key]: { ...a[key], cronMode: opt.value } }))}
                                title={opt.hint}
                                style={{
                                  flex: 1, padding: '8px 12px', fontSize: 12, fontWeight: 550, cursor: 'pointer',
                                  borderRadius: 'var(--radius-sm)', transition: 'all 0.15s',
                                  border: automations[key].cronMode === opt.value ? '2px solid var(--accent)' : '1px solid var(--border)',
                                  background: automations[key].cronMode === opt.value ? 'var(--accent-subtle)' : 'var(--bg-primary)',
                                  color: automations[key].cronMode === opt.value ? 'var(--accent)' : 'var(--text-secondary)'
                                }}
                              >{opt.label}</button>
                            ))}
                          </div>
                          {isExternal && (
                            <p style={{ fontSize: 11, color: 'var(--accent)', marginTop: 8, lineHeight: 1.5, background: 'var(--accent-subtle)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--accent)' }}>
                              ℹ️ The built-in scheduler is <strong>bypassed</strong> for this organisation. Your external cron service must POST to the endpoint below on the schedule you choose.
                            </p>
                          )}
                        </div>

                        {/* Trigger endpoint / curl */}
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                            {isExternal ? '🔗 External Trigger Endpoint' : '🔧 Manual Trigger'}
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                            <pre style={{ flex: 1, margin: 0, fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.7, background: 'var(--bg-primary)', border: `1px solid ${isExternal ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)', padding: '10px 12px', color: isExternal ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                              {curlCmd}
                            </pre>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                              <button type="button" className="btn btn-secondary btn-sm" style={{ whiteSpace: 'nowrap' }} onClick={() => { navigator.clipboard.writeText(curlCmd); alert.success('Copied curl command'); }}>Copy curl</button>
                              <button type="button" className="btn btn-secondary btn-sm" style={{ whiteSpace: 'nowrap' }} onClick={() => { navigator.clipboard.writeText(triggerUrl); alert.success('Copied URL'); }}>Copy URL</button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                disabled={triggeringJob === job}
                                onClick={async () => {
                                  setTriggeringJob(job);
                                  try {
                                    await organizationsApi.triggerAutomation(orgId, job);
                                    alert.success(`${label} triggered`);
                                  } catch {
                                    alert.error('Trigger failed.');
                                  } finally {
                                    setTriggeringJob(null);
                                  }
                                }}
                              >{triggeringJob === job ? 'Running…' : 'Run now'}</button>
                            </div>
                          </div>
                        </div>

                        {/* Outbound webhook */}
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                            Outbound Webhook <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 11 }}>(optional — called by the server after each run)</span>
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <input
                              type="url"
                              className="form-input"
                              placeholder="https://your-service.com/hooks/smythe-done"
                              value={automations[key].webhookUrl || ''}
                              onChange={e => setAutomations(a => ({ ...a, [key]: { ...a[key], webhookUrl: e.target.value } }))}
                              style={{ flex: 1, minWidth: 200, fontSize: 12 }}
                            />
                            <input
                              type="text"
                              className="form-input"
                              placeholder="Signing secret (optional)"
                              value={automations[key].webhookSecret || ''}
                              onChange={e => setAutomations(a => ({ ...a, [key]: { ...a[key], webhookSecret: e.target.value } }))}
                              style={{ width: 160, fontSize: 12, flexShrink: 0 }}
                            />
                          </div>
                          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Leave blank to disable. The server will POST a JSON payload to this URL after each job run.</p>
                        </div>
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ alignSelf: 'flex-start' }}
                    disabled={savingAutomations}
                    onClick={async () => {
                      setSavingAutomations(true);
                      try {
                        const orgId = typeof user.organization === 'object' ? user.organization._id : user.organization;
                        await organizationsApi.updateAutomations(orgId, {
                          deadlineReminder: {
                            enabled:       automations.deadlineReminder.enabled,
                            cronMode:      automations.deadlineReminder.cronMode || 'internal',
                            webhookUrl:    automations.deadlineReminder.webhookUrl || '',
                            webhookSecret: automations.deadlineReminder.webhookSecret || ''
                          },
                          progressDigest: {
                            enabled:       automations.progressDigest.enabled,
                            cronMode:      automations.progressDigest.cronMode || 'internal',
                            webhookUrl:    automations.progressDigest.webhookUrl || '',
                            webhookSecret: automations.progressDigest.webhookSecret || ''
                          }
                        });
                        alert.success('Automation settings saved');
                      } catch {
                        alert.error('Could not save automation settings.');
                      } finally {
                        setSavingAutomations(false);
                      }
                    }}
                  >
                    {savingAutomations ? 'Saving...' : 'Save Automation Settings'}
                  </button>
                </div>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Loading…</p>
              )}
            </CollapsibleCard>

          </div>
        </motion.div>
      )}

      {activeTab === 'branding' && isAdmin && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* ── App Details ── */}
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>App Details</h3>
              <div style={{ display: 'grid', gap: 16 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">App Title</label>
                  <input type="text" className="form-input" value={branding.appTitle} onChange={e => setBranding(b => ({ ...b, appTitle: e.target.value }))} placeholder="Smythe" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Site Title <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(Browser Tab)</span></label>
                  <input type="text" className="form-input" value={branding.siteTitle} onChange={e => setBranding(b => ({ ...b, siteTitle: e.target.value }))} placeholder="Defaults to App Title" />
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Shown in the browser tab. Leave blank to use App Title.</p>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Tagline</label>
                  <input type="text" className="form-input" value={branding.tagline} onChange={e => setBranding(b => ({ ...b, tagline: e.target.value }))} placeholder="Organize work, effortlessly." />
                </div>
              </div>
            </div>

            {/* ── Colors & Theming ── */}
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>Colors & Theming</h3>
              <div style={{ display: 'grid', gap: 20 }}>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Pre-defined Theme Mixes</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                    {defaultColorMixes.map(mix => (
                      <button
                        key={mix.name}
                        type="button"
                        onClick={() => setBranding(b => ({ ...b, accentColor: mix.accent, sidebarColor: mix.sidebar }))}
                        style={{
                          padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          border: branding.accentColor === mix.accent && branding.sidebarColor === mix.sidebar ? '2px solid var(--accent)' : '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)', cursor: 'pointer', transition: 'all 0.15s'
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{mix.name}</span>
                        <div style={{ display: 'flex', gap: 2 }}>
                          <div style={{ width: 14, height: 14, borderRadius: '50%', background: mix.accent, border: '1px solid var(--border)', zIndex: 1 }} />
                          <div style={{ width: 14, height: 14, borderRadius: '50%', background: mix.sidebar, border: '1px solid var(--border)', marginLeft: -6 }} />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ height: 1, background: 'var(--border)' }} />

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Accent Color</label>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    {Object.keys(colorTones).map(tone => (
                      <button
                        key={tone}
                        type="button"
                        onClick={() => setActiveColorTone(tone)}
                        style={{
                          flex: 1, padding: '6px 8px', fontSize: 12, textTransform: 'capitalize', fontWeight: 550,
                          background: activeColorTone === tone ? 'var(--accent)' : 'var(--bg-tertiary)',
                          color: activeColorTone === tone ? '#fff' : 'var(--text-secondary)',
                          border: '1px solid', borderColor: activeColorTone === tone ? 'var(--accent)' : 'var(--border)',
                          borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'all 0.15s'
                        }}
                      >
                        {tone}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                    {colorTones[activeColorTone].map(preset => (
                      <button
                        key={preset.color}
                        type="button"
                        onClick={() => setBranding(b => ({ ...b, accentColor: preset.color }))}
                        title={preset.label}
                        style={{
                          width: 34, height: 34, borderRadius: 6, background: preset.color, cursor: 'pointer',
                          border: branding.accentColor === preset.color ? '2px solid var(--text-primary)' : '2px solid var(--border)',
                          outline: branding.accentColor === preset.color ? '2px solid var(--text-primary)' : 'none',
                          outlineOffset: 1, transition: 'all 0.15s'
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input
                      type="color"
                      value={branding.accentColor}
                      onChange={e => setBranding(b => ({ ...b, accentColor: e.target.value }))}
                      style={{ width: 40, height: 36, padding: 2, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: 'var(--bg-tertiary)' }}
                    />
                    <input
                      type="text"
                      className="form-input"
                      value={branding.accentColor}
                      onChange={e => setBranding(b => ({ ...b, accentColor: e.target.value }))}
                      style={{ flex: 1 }}
                      placeholder="#6366f1"
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Sidebar Color (Login Page)</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {[
                      { color: '#1a1a2e', label: 'Navy' },
                      { color: '#0f0f0f', label: 'Black' },
                      { color: '#1e293b', label: 'Slate' },
                      { color: '#1c1917', label: 'Stone' },
                      { color: '#172554', label: 'Blue' },
                      { color: '#14532d', label: 'Green' },
                      { color: '#3b0764', label: 'Purple' },
                      { color: '#450a0a', label: 'Red' },
                      { color: '#27272a', label: 'Zinc' },
                      { color: '#0c4a6e', label: 'Sky' },
                    ].map(preset => (
                      <button
                        key={preset.color}
                        type="button"
                        onClick={() => setBranding(b => ({ ...b, sidebarColor: preset.color }))}
                        title={preset.label}
                        style={{
                          width: 32, height: 32, borderRadius: 6, background: preset.color, cursor: 'pointer',
                          border: (branding.sidebarColor || '#1a1a2e') === preset.color ? '2px solid var(--accent)' : '2px solid var(--border)',
                          outline: (branding.sidebarColor || '#1a1a2e') === preset.color ? '2px solid var(--accent)' : 'none',
                          outlineOffset: 1, transition: 'all 0.15s'
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input
                      type="color"
                      value={branding.sidebarColor || '#1a1a2e'}
                      onChange={e => setBranding(b => ({ ...b, sidebarColor: e.target.value }))}
                      style={{ width: 40, height: 36, padding: 2, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: 'var(--bg-tertiary)' }}
                    />
                    <input
                      type="text"
                      className="form-input"
                      value={branding.sidebarColor || '#1a1a2e'}
                      onChange={e => setBranding(b => ({ ...b, sidebarColor: e.target.value }))}
                      style={{ flex: 1 }}
                      placeholder="#1a1a2e"
                    />
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                    Pick a preset or choose a custom color. Dark colors work best with white sidebar text.
                  </p>
                </div>
              </div>
            </div>

            {/* ── Logos & Media ── */}
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>Logos & Media</h3>
              <div style={{ display: 'grid', gap: 16 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Site Logo</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="url" className="form-input" value={branding.logoUrl} onChange={e => setBranding(b => ({ ...b, logoUrl: e.target.value }))} placeholder="https://example.com/icon.png or upload" style={{ flex: 1 }} />
                    <input ref={logoFileRef} type="file" accept=".png,image/png" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) handleBrandingUpload(e.target.files[0], 'logoUrl'); e.target.value = ''; }} />
                    {branding.logoUrl && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBranding(b => ({ ...b, logoUrl: '' }))} title="Remove logo" aria-label="Remove logo" style={{ padding: '6px 8px', color: 'var(--danger, #e5484d)' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a2 2 0 012-2h2a2 2 0 012 2v2" />
                        </svg>
                      </button>
                    )}
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => logoFileRef.current?.click()} disabled={uploadingLogo} style={{ whiteSpace: 'nowrap' }}>
                      {uploadingLogo ? 'Uploading...' : 'Upload'}
                    </button>
                    {branding.logoUrl && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowLogoPreview(!showLogoPreview)} style={{ whiteSpace: 'nowrap' }}>
                        {showLogoPreview ? 'Hide Preview' : 'Show Preview'}
                      </button>
                    )}
                  </div>
                  {!branding.logoUrl && (
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
                      No logo uploaded — the <strong>Site Title</strong> ("{branding.appTitle || 'App Title'}") will be shown as the default.
                    </p>
                  )}
                  {showLogoPreview && branding.logoUrl && (
                    <div style={{ marginTop: 8, padding: 20, border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-primary)', minHeight: Math.max(120, (branding.logoSize || 48) + 40) }}>
                      <img src={branding.logoUrl} alt="Logo preview" style={{ height: 'auto', width: 'auto', maxHeight: branding.logoSize || 48, maxWidth: '100%', objectFit: 'contain', display: 'block', borderRadius: branding.logoShape === 'circle' ? '50%' : branding.logoShape === 'square' ? 4 : 8 }} onError={e => { e.target.style.display = 'none'; }} />
                    </div>
                  )}
                </div>

                {branding.logoUrl && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Logo Size</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <input type="range" min={24} max={120} step={1} value={branding.logoSize || 48} onChange={e => setBranding(b => ({ ...b, logoSize: Number(e.target.value) }))} style={{ width: 200, maxWidth: '60%' }} />
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)', minWidth: 40 }}>{branding.logoSize || 48}px</span>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBranding(b => ({ ...b, logoSize: 48 }))} disabled={(branding.logoSize || 48) === 48}>Default</button>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>Controls the display height of your logo in the app header (aspect ratio preserved).</p>
                  </div>
                )}

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Site Icon Shape</label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {[
                      { value: 'circle', label: 'Circle', radius: '50%' },
                      { value: 'rounded', label: 'Rounded', radius: '10px' },
                      { value: 'square', label: 'Square', radius: '4px' }
                    ].map(shape => (
                      <button key={shape.value} type="button" onClick={() => setBranding(b => ({ ...b, logoShape: shape.value }))} style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, border: branding.logoShape === shape.value ? '2px solid var(--accent)' : '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: branding.logoShape === shape.value ? 'var(--accent-subtle)' : 'var(--bg-tertiary)', cursor: 'pointer', transition: 'all 0.15s' }}>
                        <div style={{ width: 32, height: 32, background: 'var(--accent)', borderRadius: shape.radius, opacity: 0.7 }} />
                        <span style={{ fontSize: 11, fontWeight: 550, color: branding.logoShape === shape.value ? 'var(--accent)' : 'var(--text-secondary)' }}>{shape.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Favicon</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="text" className="form-input" value={branding.faviconUrl} onChange={e => setBranding(b => ({ ...b, faviconUrl: e.target.value }))} placeholder="https://example.com/favicon.ico or upload" style={{ flex: 1 }} />
                    <input ref={faviconFileRef} type="file" accept=".png,image/png" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) handleBrandingUpload(e.target.files[0], 'faviconUrl'); e.target.value = ''; }} />
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => faviconFileRef.current?.click()} disabled={uploadingFavicon} style={{ whiteSpace: 'nowrap' }}>
                      {uploadingFavicon ? 'Uploading...' : 'Upload'}
                    </button>
                  </div>
                  {branding.faviconUrl && (
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <img src={branding.faviconUrl} alt="Favicon preview" style={{ width: 24, height: 24, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} />
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Favicon preview</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Settings ── */}
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>Settings</h3>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  Allow Public Sign-Up
                  <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, margin: 0 }}>
                    <input type="checkbox" checked={allowSignup} onChange={e => setAllowSignup(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                    <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, borderRadius: 22, background: allowSignup ? 'var(--accent)' : 'var(--border)', transition: 'background 0.2s' }}>
                      <span style={{ position: 'absolute', height: 16, width: 16, left: allowSignup ? 20 : 3, bottom: 3, background: 'white', borderRadius: '50%', transition: 'left 0.2s' }} />
                    </span>
                  </label>
                </label>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  When enabled, a "Sign Up" link appears on the login page allowing new users to create accounts.
                </p>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: 16, fontSize: 15, alignSelf: 'flex-start', minWidth: 200 }}
              onClick={handleSaveBranding}
              disabled={brandingLoading}
            >
              {brandingLoading ? 'Saving...' : 'Save Branding'}
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
