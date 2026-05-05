import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useBranding } from '../context/BrandingContext';
import { authApi } from '../api/auth';
import { alert } from '../components/AlertSystem';
import AuthLayout from '../components/AuthLayout';
import { motion } from 'framer-motion';

export default function Register() {
  const [step, setStep] = useState('form'); // 'form' | 'confirm'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  // Support modal state
  const [showSupport, setShowSupport] = useState(false);
  const [supportEmail, setSupportEmail] = useState('');
  const [supportSubject, setSupportSubject] = useState('');
  const [supportDetails, setSupportDetails] = useState('');
  const [supportLoading, setSupportLoading] = useState(false);

  const openSupport = () => {
    setSupportEmail(email);
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

  const branding = useBranding();
  const navigate = useNavigate();
  const appName = branding.appTitle || 'Smythe';

  const handleRequestCode = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.registerRequest({ name, email, phone });
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
      await authApi.registerConfirm({ email, code });
      alert.success('Account created! Check your email for login credentials.');
      navigate('/login');
    } catch (err) {
      const msg = err.response?.data?.error;
      alert.error(msg || 'Invalid or expired code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const navLinks = [
    {
      onClick: openSupport,
      label: 'Support',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      )
    },
    {
      to: '/login',
      label: 'Login',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" />
        </svg>
      )
    }
  ];

  const supportModal = showSupport && (
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
          <button className="modal-close" onClick={() => setShowSupport(false)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <form className="modal-body" style={{ padding: '16px 24px 24px' }} onSubmit={handleSupportSubmit}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
            Describe your issue and an administrator will be notified via email.
          </p>
          <div className="form-group">
            <label className="form-label">Your Email</label>
            <input type="email" className="form-input" placeholder="you@example.com" value={supportEmail} onChange={e => setSupportEmail(e.target.value)} required autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Subject</label>
            <input type="text" className="form-input" placeholder="Brief description of the issue" value={supportSubject} onChange={e => setSupportSubject(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Details</label>
            <textarea className="form-input" placeholder="Describe your issue in detail..." value={supportDetails} onChange={e => setSupportDetails(e.target.value)} rows={4} required />
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
  );

  if (!branding.allowSignup) {
    return (
      <AuthLayout navLinks={navLinks} onSupport={openSupport}>
        <div className="login-center">
          <motion.div
            className="auth-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          >
            <div style={{ textAlign: 'center', padding: '12px 4px' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--accent-subtle)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              </div>
              <h2 style={{ marginBottom: 8 }}>Registration Closed</h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
                Sorry, public sign-ups are not allowed at the moment. Please contact your administrator for an invitation, or sign in if you already have an account.
              </p>
              <Link to="/login" className="btn btn-primary" style={{ display: 'inline-block', textDecoration: 'none' }}>
                Go to Login
              </Link>
            </div>
          </motion.div>
        </div>
        {supportModal}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout navLinks={navLinks} onSupport={openSupport}>
      <div className="login-center">
        <motion.div
          className="auth-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        >
            {step === 'form' ? (
              <>
                <h2 style={{ textAlign: 'center', marginBottom: 6 }}>Sign Up</h2>

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
                        await authApi.registerRequest({ name, email, phone });
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
      {supportModal}
    </AuthLayout>
  );
}
