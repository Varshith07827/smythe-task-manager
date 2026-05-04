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

export default function Settings() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const { refresh: refreshBranding } = useBranding();
  const [members, setMembers] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('user');
  const [activeTab, setActiveTab] = useState('users');
  const [savingMemberNotifyId, setSavingMemberNotifyId] = useState(null);
  const [branding, setBranding] = useState({ appTitle: 'Smythe', tagline: '', logoUrl: '', logoShape: 'rounded', accentColor: '#0a84ff', logoSize: 48, faviconUrl: '', siteTitle: '', sidebarColor: '#1a1a2e' });
  const [allowSignup, setAllowSignup] = useState(false);
  const [brandingLoading, setBrandingLoading] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [showSupportPasswordPrompt, setShowSupportPasswordPrompt] = useState(false);
  const [supportPasswordInput, setSupportPasswordInput] = useState('');
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [showPasswordSupport, setShowPasswordSupport] = useState(false);
  const [supportSubject, setSupportSubject] = useState('');
  const [supportDetails, setSupportDetails] = useState('');
  const [sendingSupport, setSendingSupport] = useState(false);

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
      }).catch(() => {});
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
  const faviconFileRef = useRef(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);

  const handleBrandingUpload = async (file, field) => {
    const setLoading = field === 'logoUrl' ? setUploadingLogo : setUploadingFavicon;
    setLoading(true);
    try {
      const orgId = typeof user.organization === 'object' ? user.organization._id : user.organization;
      const res = await organizationsApi.uploadBrandingFile(orgId, file, field);
      setBranding(b => ({ ...b, [field]: res.data.url }));
      await refreshBranding();
      alert.success('File uploaded');
    } catch {
      alert.error('Upload failed');
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
        {['users', 'notifications', 'security', 'support', ...(isAdmin ? ['branding'] : [])].map(tab => (
          <button
            key={tab}
            className={`filter-pill ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'support' ? 'Support & Help' : tab === 'users' ? 'Users' : tab.charAt(0).toUpperCase() + tab.slice(1)}
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
            {members.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No team users yet.</p>
            ) : (
              members.map(m => {
                const mp = normalizeNotificationPrefs(m.notificationPreferences);
                const notifyBusy = savingMemberNotifyId === m._id;
                return (
                  <div key={m._id} className="settings-member-row">
                    <div className="settings-member-info" style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 200 }}>
                      <div className="user-avatar" style={{ flexShrink: 0 }}>{initials(m.name)}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</div>
                      </div>
                    </div>
                    <span className={`badge badge-${m.status === 'active' ? 'completed' : m.status === 'invited' ? 'pending' : 'cancelled'}`}>
                      {m.status}
                    </span>
                    {user?.role === 'admin' && m._id !== user._id ? (
                      <select className="form-input" style={{ width: 90, padding: '4px 8px', fontSize: 12, flexShrink: 0 }} value={m.role} onChange={e => handleRoleChange(m._id, e.target.value)}>
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      <span style={{ width: 90, fontSize: 12, fontWeight: 550, color: 'var(--text-secondary)', textTransform: 'capitalize', flexShrink: 0, textAlign: 'center' }}>{m.role}</span>
                    )}
                    <div className="settings-member-actions">
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
                        <button className="btn btn-ghost btn-xs" onClick={() => setConfirmRemove(m)} title="Remove" style={{ flexShrink: 0 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.8" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                        </button>
                      ) : (
                        <span aria-hidden="true" style={{ width: 28, height: 28, flexShrink: 0 }} />
                      )}
                    </div>
                  </div>
                );
              })
            )}
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

      {activeTab === 'support' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          <CollapsibleCard title="Support & Help" defaultOpen>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
              Need help with your account or password? Submit a support request and our administrators will assist you.
            </p>
            <button className="btn btn-secondary" onClick={() => { setSupportPasswordInput(''); setShowSupportPasswordPrompt(true); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
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
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
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
              <h3>Support & Help</h3>
              <button className="modal-close" onClick={() => { setShowPasswordSupport(false); setSupportSubject(''); setSupportDetails(''); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
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

      {activeTab === 'branding' && isAdmin && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          <CollapsibleCard title="App branding" defaultOpen>
            <div style={{ display: 'grid', gap: 16 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">App Title</label>
                <input
                  type="text"
                  className="form-input"
                  value={branding.appTitle}
                  onChange={e => setBranding(b => ({ ...b, appTitle: e.target.value }))}
                  placeholder="Smythe"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Tagline</label>
                <input
                  type="text"
                  className="form-input"
                  value={branding.tagline}
                  onChange={e => setBranding(b => ({ ...b, tagline: e.target.value }))}
                  placeholder="Organize work, effortlessly."
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Logo</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="url"
                    className="form-input"
                    value={branding.logoUrl}
                    onChange={e => setBranding(b => ({ ...b, logoUrl: e.target.value }))}
                    placeholder="https://example.com/logo.png or upload"
                    style={{ flex: 1 }}
                  />
                  <input ref={logoFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) handleBrandingUpload(e.target.files[0], 'logoUrl'); e.target.value = ''; }} />
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => logoFileRef.current?.click()} disabled={uploadingLogo} style={{ whiteSpace: 'nowrap' }}>
                    {uploadingLogo ? 'Uploading...' : 'Upload'}
                  </button>
                </div>
                {branding.logoUrl && (
                  <div style={{ marginTop: 8, padding: 12, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                    <img src={branding.logoUrl} alt="Logo preview" style={{
                      height: 48, width: 48, objectFit: 'cover',
                      borderRadius: branding.logoShape === 'circle' ? '50%' : branding.logoShape === 'square' ? 4 : 10
                    }} onError={e => { e.target.style.display = 'none'; }} />
                  </div>
                )}
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Logo Shape</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {[
                    { value: 'circle', label: 'Circle', radius: '50%' },
                    { value: 'rounded', label: 'Rounded', radius: '10px' },
                    { value: 'square', label: 'Square', radius: '4px' }
                  ].map(shape => (
                    <button
                      key={shape.value}
                      type="button"
                      onClick={() => setBranding(b => ({ ...b, logoShape: shape.value }))}
                      style={{
                        flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                        border: branding.logoShape === shape.value ? '2px solid var(--accent)' : '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)', background: branding.logoShape === shape.value ? 'var(--accent-subtle)' : 'var(--bg-tertiary)',
                        cursor: 'pointer', transition: 'all 0.15s'
                      }}
                    >
                      <div style={{ width: 32, height: 32, background: 'var(--accent)', borderRadius: shape.radius, opacity: 0.7 }} />
                      <span style={{ fontSize: 11, fontWeight: 550, color: branding.logoShape === shape.value ? 'var(--accent)' : 'var(--text-secondary)' }}>{shape.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Logo Size (Login Screen)</label>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <input
                    type="range"
                    min="24"
                    max="120"
                    value={branding.logoSize || 48}
                    onChange={e => setBranding(b => ({ ...b, logoSize: Number(e.target.value) }))}
                    style={{ flex: 1, accentColor: 'var(--accent)' }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600, minWidth: 40, textAlign: 'right' }}>{branding.logoSize || 48}px</span>
                </div>
                {branding.logoUrl && (
                  <div style={{ marginTop: 8, padding: 12, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                    <img src={branding.logoUrl} alt="Size preview" style={{
                      height: branding.logoSize || 48, width: branding.logoSize || 48, objectFit: 'cover',
                      borderRadius: branding.logoShape === 'circle' ? '50%' : branding.logoShape === 'square' ? 4 : 10
                    }} onError={e => { e.target.style.display = 'none'; }} />
                  </div>
                )}
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Accent Color</label>
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
                    placeholder="#0a84ff"
                  />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Site Title</label>
                <input
                  type="text"
                  className="form-input"
                  value={branding.siteTitle}
                  onChange={e => setBranding(b => ({ ...b, siteTitle: e.target.value }))}
                  placeholder="Custom browser tab title (defaults to App Title)"
                />
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  Shown in the browser tab. Leave blank to use App Title.
                </p>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Favicon</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="url"
                    className="form-input"
                    value={branding.faviconUrl}
                    onChange={e => setBranding(b => ({ ...b, faviconUrl: e.target.value }))}
                    placeholder="https://example.com/favicon.ico or upload"
                    style={{ flex: 1 }}
                  />
                  <input ref={faviconFileRef} type="file" accept="image/*,.ico" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) handleBrandingUpload(e.target.files[0], 'faviconUrl'); e.target.value = ''; }} />
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
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  Allow Public Sign-Up
                  <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={allowSignup}
                      onChange={e => setAllowSignup(e.target.checked)}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: 'absolute', cursor: 'pointer', inset: 0, borderRadius: 22,
                      background: allowSignup ? 'var(--accent)' : 'var(--border)',
                      transition: 'background 0.2s'
                    }}>
                      <span style={{
                        position: 'absolute', height: 16, width: 16, left: allowSignup ? 20 : 3, bottom: 3,
                        background: 'white', borderRadius: '50%', transition: 'left 0.2s'
                      }} />
                    </span>
                  </label>
                </label>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  When enabled, a "Sign Up" link appears on the login page allowing new users to create accounts.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: 4 }}
                onClick={handleSaveBranding}
                disabled={brandingLoading}
              >
                {brandingLoading ? 'Saving...' : 'Save branding'}
              </button>
            </div>
          </CollapsibleCard>
        </motion.div>
      )}
    </motion.div>
  );
}
