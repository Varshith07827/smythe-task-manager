import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { authApi } from '../api/auth';
import { alert } from '../components/AlertSystem';
import PasswordInput from '../components/PasswordInput';
import { motion } from 'framer-motion';

const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || 'SmytheDemo123!';

const DEMO_ACCOUNTS = [
  { label: 'Creator', email: 'creator@smythe.local' },
  { label: 'Manager', email: 'morgan@smythe.local' },
  { label: 'User', email: 'uma@smythe.local' }
];

const friendlyError = (err) => {
  const status = err.response?.status;
  const body = err.response?.data?.error;
  if (status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (err.code === 'ERR_NETWORK') return 'Unable to connect to the server. Please check your connection.';
  if (body === 'Invalid credentials') return 'The email or password you entered is incorrect.';
  if (body === 'Invalid code') return 'The code you entered is incorrect.';
  if (body === 'Code expired') return 'Your code has expired. Please request a new one.';
  return body || 'Something went wrong. Please try again.';
};

export default function Login() {
  const [tab, setTab] = useState('otp'); // 'otp' | 'password'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);

  // Support modal state
  const [showSupport, setShowSupport] = useState(false);
  const [supportEmail, setSupportEmail] = useState('');
  const [supportSubject, setSupportSubject] = useState('');
  const [supportDetails, setSupportDetails] = useState('');
  const [supportLoading, setSupportLoading] = useState(false);

  const openSupport = () => {
    setSupportEmail(email); // pre-fill if they already typed their email
    setSupportSubject('');
    setSupportDetails('');
    setShowSupport(true);
  };

  const handleSupportSubmit = async (e) => {
    e.preventDefault();
    setSupportLoading(true);
    try {
      await authApi.submitSupport({
        email: supportEmail,
        subject: supportSubject.trim(),
        details: supportDetails.trim()
      });
      alert.success('Support request sent to administrators');
      setShowSupport(false);
    } catch (err) {
      alert.error(err.response?.data?.error || 'Failed to send support request');
    } finally {
      setSupportLoading(false);
    }
  };
  const { login, loginWithToken } = useAuth();
  const branding = useBranding();
  const navigate = useNavigate();
  const appName = branding.appTitle || 'Smythe';

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      alert.error(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      await authApi.requestOtp(email);
      setOtpSent(true);
      alert.success('Login code sent to your email');
    } catch (err) {
      alert.error(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await authApi.verifyOtp(email, otpCode);
      loginWithToken(data.token, data.user);
      navigate('/');
    } catch (err) {
      alert.error(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (demoEmail) => {
    setLoading(true);
    try {
      await login(demoEmail, DEMO_PASSWORD);
      navigate('/');
    } catch (err) {
      alert.error(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-layout">
      {/* Sidebar */}
      <aside className="login-sidebar" style={branding.sidebarColor ? { background: branding.sidebarColor } : undefined}>
        <div className="login-sidebar-brand">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt={appName} style={{
              height: 36, width: 36, objectFit: 'cover',
              borderRadius: branding.logoShape === 'circle' ? '50%' : branding.logoShape === 'square' ? 4 : 8
            }} />
          ) : (
            <div className="login-sidebar-icon">{appName[0]}</div>
          )}
          <span className="login-sidebar-title">{appName}</span>
        </div>

        <nav className="login-sidebar-nav">
          <button type="button" className="login-sidebar-link" style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }} onClick={openSupport}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span>Support</span>
          </button>
          {branding.allowSignup && (
            <Link to="/register" className="login-sidebar-link">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
              </svg>
              <span>Sign Up</span>
            </Link>
          )}
        </nav>

        <div className="login-sidebar-footer">
          <span>v1.0</span>
        </div>
      </aside>

      {/* Main area */}
      <main className="login-main">
        <header className="login-header">
          <button type="button" className="login-header-link" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={openSupport}>Support</button>
        </header>

        <div className="login-center">
          <motion.div
            className="auth-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          >
            <h2 style={{ textAlign: 'center', marginBottom: 20 }}>User Login</h2>

            <div className="auth-tabs">
              <button
                type="button"
                className={`auth-tab ${tab === 'otp' ? 'active' : ''}`}
                onClick={() => { setTab('otp'); setOtpSent(false); setOtpCode(''); }}
              >
                Login with Code
              </button>
              <button
                type="button"
                className={`auth-tab ${tab === 'password' ? 'active' : ''}`}
                onClick={() => setTab('password')}
              >
                Use Password
              </button>
            </div>

            {tab === 'otp' && !otpSent && (
              <form onSubmit={handleRequestOtp}>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Sending...' : 'Send Login Code'}
                </button>
              </form>
            )}

            {tab === 'otp' && otpSent && (
              <form onSubmit={handleVerifyOtp}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                  We sent a 6-digit code to <strong>{email}</strong>
                </p>
                <div className="form-group">
                  <label className="form-label">Login Code</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Enter 6-digit code"
                    value={otpCode}
                    onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                    autoFocus
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    style={{ letterSpacing: '0.3em', fontSize: 18, textAlign: 'center' }}
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={loading || otpCode.length < 6}>
                  {loading ? 'Verifying...' : 'Verify & Sign In'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ marginTop: 8, width: '100%' }}
                  onClick={() => { setOtpSent(false); setOtpCode(''); }}
                >
                  Back
                </button>
              </form>
            )}

            {tab === 'password' && (
              <form onSubmit={handlePasswordLogin}>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Password</label>
                  <PasswordInput
                    placeholder="Enter your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>
            )}

            {import.meta.env.DEV && (
              <div className="auth-quick-login">
                <p className="auth-quick-login-label">Quick login (dev only)</p>
                <div className="auth-quick-login-buttons">
                  {DEMO_ACCOUNTS.map(({ label, email: demoEmail }) => (
                    <button
                      key={demoEmail}
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={loading}
                      onClick={() => handleDemoLogin(demoEmail)}
                    >
                      Login as {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="auth-footer">
              <button type="button" onClick={openSupport} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 13, padding: 0 }}>Help with Login?</button>
            </div>
          </motion.div>
        </div>
      </main>

      {showSupport && (
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
              <button className="modal-close" onClick={() => setShowSupport(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <form className="modal-body" style={{ padding: '16px 24px 24px' }} onSubmit={handleSupportSubmit}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
                Describe your issue and an administrator will be notified via email.
              </p>
              <div className="form-group">
                <label className="form-label">Your Email</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="you@example.com"
                  value={supportEmail}
                  onChange={e => setSupportEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Subject</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Brief description of the issue"
                  value={supportSubject}
                  onChange={e => setSupportSubject(e.target.value)}
                  required
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
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowSupport(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={!supportEmail || !supportSubject.trim() || !supportDetails.trim() || supportLoading}>
                  {supportLoading ? 'Sending...' : 'Send to Admins'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
