import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { authApi } from '../api/auth';
import { alert } from '../components/AlertSystem';
import PasswordInput from '../components/PasswordInput';
import { motion } from 'framer-motion';

export default function Register() {
  const [step, setStep] = useState('form'); // 'form' | 'confirm'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const { register } = useAuth();
  const branding = useBranding();
  const navigate = useNavigate();
  const appName = branding.appTitle || 'Smythe';

  const handleRequestCode = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.registerRequest({ name, email, phone, password, organizationName: orgName });
      alert.success('Confirmation code sent to your email');
      setStep('confirm');
    } catch (err) {
      const msg = err.response?.data?.error;
      if (msg?.includes('duplicate') || msg?.includes('exists') || msg?.includes('registered')) {
        alert.error('An account with this email already exists.');
      } else {
        alert.error(msg || 'Could not send confirmation code. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register({ email, code });
      alert.success('Account created! Welcome aboard.');
      navigate('/');
    } catch (err) {
      const msg = err.response?.data?.error;
      alert.error(msg || 'Invalid or expired code. Please try again.');
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
          <Link to="/login" className="login-sidebar-link">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
            </svg>
            <span>Login</span>
          </Link>
        </nav>

        <div className="login-sidebar-footer">
          <span>v1.0</span>
        </div>
      </aside>

      {/* Main area */}
      <main className="login-main">
        <header className="login-header" />

        <div className="login-center">
          <motion.div
            className="auth-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          >
            {!branding.allowSignup ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <h2 style={{ marginBottom: 12 }}>Registration Disabled</h2>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
                  Public sign-up is currently disabled for this organization. Please contact an administrator to be invited.
                </p>
                <Link to="/login" className="btn btn-primary" style={{ display: 'inline-block', width: '100%' }}>Back to Login</Link>
              </div>
            ) : step === 'form' ? (
              <>
                <h2 style={{ textAlign: 'center', marginBottom: 6 }}>Create Account</h2>
                <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 20 }}>
                  We'll send a confirmation code to your email.
                </p>

                <form onSubmit={handleRequestCode}>
                  <div className="form-group">
                    <label className="form-label">Full Name</label>
                    <input type="text" className="form-input" placeholder="John Doe" value={name} onChange={e => setName(e.target.value)} required autoFocus />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input type="email" className="form-input" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(optional)</span></label>
                    <input type="tel" className="form-input" placeholder="+1 555 000 0000" value={phone} onChange={e => setPhone(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Password</label>
                    <PasswordInput placeholder="Min. 6 characters" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Organization Name <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(optional)</span></label>
                    <input type="text" className="form-input" placeholder="Your Company" value={orgName} onChange={e => setOrgName(e.target.value)} />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={loading}>
                    {loading ? 'Sending code...' : 'Continue'}
                  </button>
                </form>
              </>
            ) : (
              <>
                <h2 style={{ textAlign: 'center', marginBottom: 6 }}>Check Your Email</h2>
                <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 20, lineHeight: 1.5 }}>
                  We sent a 6-digit confirmation code to <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>
                </p>

                <form onSubmit={handleConfirm}>
                  <div className="form-group">
                    <label className="form-label">Confirmation Code</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Enter 6-digit code"
                      value={code}
                      onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      required
                      autoFocus
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      style={{ letterSpacing: '0.3em', fontSize: 18, textAlign: 'center' }}
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={loading || code.length < 6}>
                    {loading ? 'Creating account...' : 'Confirm & Create Account'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ marginTop: 8, width: '100%' }}
                    onClick={() => { setStep('form'); setCode(''); }}
                  >
                    Back
                  </button>
                </form>

                <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)', marginTop: 16, lineHeight: 1.5 }}>
                  Didn't receive it?{' '}
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 12, padding: 0 }}
                    onClick={async () => {
                      setLoading(true);
                      try {
                        await authApi.registerRequest({ name, email, phone, password, organizationName: orgName });
                        alert.success('New code sent');
                      } catch { alert.error('Could not resend code'); }
                      finally { setLoading(false); }
                    }}
                    disabled={loading}
                  >
                    Resend code
                  </button>
                </p>
              </>
            )}

            <div className="auth-footer">
              Already have an account? <Link to="/login">Sign in</Link>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
