import { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { usersApi } from '../api/users';
import { motion } from 'framer-motion';
import { alert } from '../components/AlertSystem';
import PasswordInput from '../components/PasswordInput';
import CollapsibleCard from '../components/CollapsibleCard';

export default function Profile() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarRef = useRef(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const initials = (n) => n?.split(' ').map(c => c[0]).join('').toUpperCase() || '?';
  const avatarUrl = user?.avatar?.startsWith('/api/') ? user.avatar : null;

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!name.trim()) return alert.error('Name cannot be empty');
    setSavingProfile(true);
    try {
      const res = await usersApi.updateProfile({ name: name.trim(), email: email.trim(), phone: phone.trim() });
      setUser(u => {
        const next = { ...u, name: res.data.name, email: res.data.email, phone: res.data.phone };
        localStorage.setItem('user', JSON.stringify(next));
        return next;
      });
      alert.success('Profile updated');
    } catch (err) {
      alert.error(err.response?.data?.error || 'Could not update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const res = await usersApi.uploadAvatar(file);
      setUser(u => {
        const next = { ...u, avatar: res.data.url };
        localStorage.setItem('user', JSON.stringify(next));
        return next;
      });
      alert.success('Avatar updated');
    } catch {
      alert.error('Could not upload avatar');
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) return alert.error('Password must be at least 8 characters');
    if (newPassword !== confirmPassword) return alert.error('Passwords do not match');
    setPasswordLoading(true);
    try {
      await usersApi.changePassword({ currentPassword, newPassword });
      alert.success('Password updated');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) {
      alert.error(err.response?.data?.error || 'Could not change password');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="page-section-header">
        <div className="page-section-header-main">
          <h2 className="page-section-title">My Profile</h2>
          <p className="page-section-subtitle">Manage your personal details and security</p>
        </div>
      </div>

      {/* Avatar + name card */}
      <CollapsibleCard title="Profile information" defaultOpen style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
          {/* Avatar */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt={user?.name} style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)' }} />
            ) : (
              <div className="user-avatar" style={{ width: 72, height: 72, fontSize: 24 }}>{initials(user?.name)}</div>
            )}
            <button
              type="button"
              onClick={() => avatarRef.current?.click()}
              disabled={uploadingAvatar}
              style={{ position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              title="Change avatar"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
            </button>
            <input ref={avatarRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 650, marginBottom: 4 }}>{user?.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{user?.email}</div>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} style={{ display: 'grid', gap: 14, maxWidth: 400 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Display Name</label>
            <input type="text" className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" required />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Email</label>
            <input type="email" className="form-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="Your email address" required />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Phone <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(optional)</span></label>
            <input type="tel" className="form-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Your phone number" />
          </div>
          <button type="submit" className="btn btn-primary" disabled={savingProfile} style={{ justifySelf: 'start' }}>
            {savingProfile ? 'Saving...' : 'Save changes'}
          </button>
        </form>
      </CollapsibleCard>

      {/* Password */}
      <CollapsibleCard title="Change password">
        <form onSubmit={handleChangePassword} style={{ display: 'grid', gap: 14, maxWidth: 400 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Current password</label>
            <PasswordInput value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Enter current password" autoComplete="current-password" />
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Leave blank if you log in with email code and never set a password.</p>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">New password</label>
            <PasswordInput value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} required autoComplete="new-password" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Confirm new password</label>
            <PasswordInput value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter new password" required autoComplete="new-password" />
          </div>
          <button type="submit" className="btn btn-primary" disabled={passwordLoading} style={{ justifySelf: 'start' }}>
            {passwordLoading ? 'Updating...' : 'Update password'}
          </button>
        </form>
      </CollapsibleCard>
    </motion.div>
  );
}
