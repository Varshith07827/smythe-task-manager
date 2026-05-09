import { useState, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { useBranding } from '../context/BrandingContext';

/**
 * Shared layout for unauthenticated pages (Login, Register, etc).
 * Uses the same sidebar classes as the main app for design consistency.
 * Default collapsed with arrow toggle, matching the secured-pages sidebar.
 */
export default function AuthLayout({ navLinks = [], onSupport, children }) {
  const branding = useBranding();
  const appName = branding.appTitle || 'TaskIT';
  const [open, setOpen] = useState(false); // default collapsed

  const brandMark = useMemo(() => {
    if (!appName) return 'S';
    const words = appName.trim().split(/\s+/);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return appName.charAt(0).toUpperCase();
  }, [appName]);

  const logoRadius = branding.logoShape === 'circle' ? '50%'
    : branding.logoShape === 'square' ? '4px' : '10px';

  return (
    <div className="app-layout">
      <aside
        id="auth-sidebar"
        className={`sidebar${open ? ' sidebar--open' : ''}`}
        aria-label="Auth navigation"
        style={branding.sidebarColor ? { background: branding.sidebarColor } : undefined}
      >
        <div className="sidebar-brand">
          <div className="sidebar-brand-left">
            {branding.faviconUrl ? (
              <img
                src={branding.faviconUrl}
                alt={appName}
                className="sidebar-brand-logo"
                style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: logoRadius }}
                onError={e => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <span className="sidebar-brand-mark">{brandMark}</span>
            )}
            <div className="sidebar-brand-text">
              <span className="sidebar-brand-name">{appName}</span>
              <span className="sidebar-brand-tagline">{branding.tagline || 'Task Management'}</span>
            </div>
          </div>
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={() => setOpen(v => !v)}
            aria-expanded={open}
            aria-controls="auth-sidebar"
            aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
            title={open ? 'Collapse' : 'Expand'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {open ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
            </svg>
          </button>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-group">
            {navLinks.map((link, idx) => {
              if (link.onClick) {
                return (
                  <button
                    key={idx}
                    type="button"
                    className="sidebar-link"
                    onClick={link.onClick}
                    title={link.label}
                  >
                    {link.icon}
                    <span className="sidebar-link-label">{link.label}</span>
                  </button>
                );
              }
              return (
                <NavLink
                  key={idx}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  title={link.label}
                >
                  {link.icon}
                  <span className="sidebar-link-label">{link.label}</span>
                </NavLink>
              );
            })}
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-version" style={{ padding: '8px 16px', fontSize: 10, color: 'var(--sidebar-text)', opacity: 0.4 }}>
            v1.0
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="main-toolbar">
          <div className="auth-header-brand">
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={appName}
                className="auth-header-logo"
                style={{ maxHeight: branding.logoSize || 48 }}
                onError={e => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <span style={{ fontSize: Math.round((branding.logoSize || 48) * 0.45), fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>
                {appName}
              </span>
            )}
          </div>
          <div className="main-toolbar-spacer" />
          {onSupport && (
            <button
              type="button"
              className="auth-header-support"
              onClick={onSupport}
            >
              Support
            </button>
          )}
        </header>

        <div className="page-body auth-page-body">
          {children}
        </div>
      </main>
    </div>
  );
}
