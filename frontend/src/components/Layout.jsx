import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { roleLabel } from '../utils/roleLabels';
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { boardsApi } from '../api/boards';
import NotificationBell from './NotificationBell';
import { onPinChange, emitPinChange } from '../utils/pinEvents';

const MAX_PINNED = 5;

export default function Layout() {
  const { user, logout } = useAuth();
  const branding = useBranding();
  const navigate = useNavigate();
  const appName = branding.appTitle || 'TaskIT';
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [boards, setBoards] = useState([]);
  const pinKey = `smythe:pinnedBoards:${user?._id || 'default'}`;
  const [pinnedBoardIds, setPinnedBoardIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem(pinKey)) || []; } catch { return []; }
  });
  const profileRef = useRef(null);
  const profileDropdownRef = useRef(null);

  const sidebarHoverTimeout = useRef(null);
  const handleSidebarEnter = useCallback(() => {
    clearTimeout(sidebarHoverTimeout.current);
    setSidebarOpen(true);
  }, []);
  const handleSidebarLeave = useCallback(() => {
    sidebarHoverTimeout.current = setTimeout(() => setSidebarOpen(false), 200);
  }, []);
  useEffect(() => {
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target) &&
          (!profileDropdownRef.current || !profileDropdownRef.current.contains(e.target))) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    boardsApi.getAll().then(res => setBoards(res.data)).catch(() => {});
  }, []);

  // Sync pins when changed from dashboard
  useEffect(() => {
    return onPinChange(() => {
      try { setPinnedBoardIds(JSON.parse(localStorage.getItem(pinKey)) || []); } catch {}
    });
  }, [pinKey]);

  const togglePinnedBoard = (e, boardId) => {
    e.stopPropagation();
    e.preventDefault();
    setPinnedBoardIds(prev => {
      if (prev.includes(boardId)) {
        const next = prev.filter(id => id !== boardId);
        localStorage.setItem(pinKey, JSON.stringify(next));
        setTimeout(emitPinChange, 0);
        return next;
      }
      if (prev.length >= MAX_PINNED) return prev; // enforce max
      const next = [...prev, boardId];
      localStorage.setItem(pinKey, JSON.stringify(next));
      setTimeout(emitPinChange, 0);
      return next;
    });
  };

  // Only pinned boards show in sidebar — preserve pinnedBoardIds order
  const pinnedBoards = useMemo(() => {
    const boardMap = new Map(boards.map(b => [b._id, b]));
    return pinnedBoardIds.map(id => boardMap.get(id)).filter(Boolean);
  }, [boards, pinnedBoardIds]);

  // Search results for pinning/unpinning
  const searchResults = useMemo(() => {
    if (!sidebarSearch.trim()) return [];
    const q = sidebarSearch.toLowerCase();
    return boards.filter(b => b.title.toLowerCase().includes(q));
  }, [boards, sidebarSearch]);

  // Drag to reorder pinned boards
  const pinDragItem = useRef(null);
  const pinDragOver = useRef(null);
  const [pinDragFromIdx, setPinDragFromIdx] = useState(null);
  const [pinDragOverIdx, setPinDragOverIdx] = useState(null);
  const handlePinDragStart = (i) => { pinDragItem.current = i; setPinDragFromIdx(i); };
  const handlePinDragEnter = (i) => { pinDragOver.current = i; setPinDragOverIdx(i); };
  const handlePinDragEnd = () => {
    if (pinDragItem.current === null || pinDragOver.current === null || pinDragItem.current === pinDragOver.current) {
      pinDragItem.current = null; pinDragOver.current = null;
      setPinDragFromIdx(null); setPinDragOverIdx(null);
      return;
    }
    const reordered = [...pinnedBoardIds];
    const [removed] = reordered.splice(pinDragItem.current, 1);
    reordered.splice(pinDragOver.current, 0, removed);
    setPinnedBoardIds(reordered);
    localStorage.setItem(pinKey, JSON.stringify(reordered));
    setTimeout(emitPinChange, 0);
    pinDragItem.current = null;
    pinDragOver.current = null;
    setPinDragFromIdx(null); setPinDragOverIdx(null);
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';
  const avatarUrl = user?.avatar?.startsWith('/api/') ? user.avatar : null;
  const navClass = ({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`;
  const mobileLinkClass = ({ isActive }) => `main-toolbar-mobile-link ${isActive ? 'active' : ''}`;

  const headerPngUrl = useMemo(() => {
    const primaryLogo = branding.logoUrl || '';
    return /\.png(?:$|[?#])/i.test(primaryLogo) ? primaryLogo : '';
  }, [branding.logoUrl]);

  const headerLogoHeightPx = useMemo(() => {
    // Prefer the unified logoSize slider; fall back to legacy headerLogoHeight.
    const raw = Number(branding.logoSize ?? branding.headerLogoHeight);
    const safeHeight = Number.isFinite(raw) ? raw : 36;
    return Math.min(120, Math.max(16, safeHeight));
  }, [branding.logoSize, branding.headerLogoHeight]);

  const headerLogoScaleFactor = useMemo(() => {
    const rawScale = Number(branding.headerLogoScale);
    const safeScale = Number.isFinite(rawScale) ? rawScale : 1;
    return Math.min(2, Math.max(0.5, safeScale));
  }, [branding.headerLogoScale]);

  const desktopHeaderLogoHeight = Math.round(headerLogoHeightPx * headerLogoScaleFactor);
  const mobileHeaderLogoHeight = Math.round(Math.max(16, headerLogoHeightPx * headerLogoScaleFactor * 0.78));

  const effectiveOpen = sidebarOpen;

  return (
    <div className="app-layout">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <aside id="app-sidebar" className={`sidebar${effectiveOpen ? ' sidebar--open' : ''}`} aria-label="Main navigation" onMouseEnter={handleSidebarEnter} onMouseLeave={handleSidebarLeave}>

        <nav className="sidebar-nav">
          <div className="sidebar-group">
            <NavLink to="/" end className={navClass} title="Dashboard">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="9" rx="1"/>
                <rect x="14" y="3" width="7" height="5" rx="1"/>
                <rect x="14" y="12" width="7" height="9" rx="1"/>
                <rect x="3" y="16" width="7" height="5" rx="1"/>
              </svg>
              <span className="sidebar-link-label">Dashboard</span>
            </NavLink>
            <NavLink to="/settings" className={navClass} title="Settings">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
              </svg>
              <span className="sidebar-link-label">Settings</span>
            </NavLink>
            <NavLink to="/support" className={navClass} title="Support">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span className="sidebar-link-label">Support</span>
            </NavLink>
            {user?.role === 'admin' && (
              <NavLink to="/archived" className={navClass} title="Archived">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5" rx="1"/><line x1="10" y1="12" x2="14" y2="12"/>
                </svg>
                <span className="sidebar-link-label">Archived</span>
              </NavLink>
            )}
            {user?.role === 'admin' && (
              <NavLink to="/logs" className={navClass} title="Logs">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
                <span className="sidebar-link-label">Logs</span>
              </NavLink>
            )}
          </div>

          {/* Sidebar Search — for finding boards to pin */}
          {effectiveOpen && (
            <div className="sidebar-search-wrap">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                className="sidebar-search"
                placeholder="Search projects..."
                value={sidebarSearch}
                onChange={e => setSidebarSearch(e.target.value)}
              />
            </div>
          )}

          {/* Pinned boards (max 5) — expanded view */}
          {effectiveOpen && pinnedBoards.length > 0 && (
            <div className="sidebar-group" style={{ marginTop: 8 }}>
              <div className="sidebar-label">Pinned</div>
              <div className="sidebar-boards">
                {pinnedBoards.map((b, i) => {
                  const isDragging = pinDragFromIdx === i;
                  const isDropTarget = pinDragFromIdx !== null && pinDragOverIdx === i && pinDragFromIdx !== i;
                  const dropSide = isDropTarget ? (pinDragFromIdx < i ? 'bottom' : 'top') : null;
                  return (
                  <NavLink
                    key={b._id}
                    to={`/boards/${b._id}`}
                    className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}${isDragging ? ' drag-source' : ''}${dropSide === 'top' ? ' drop-indicator-top' : ''}${dropSide === 'bottom' ? ' drop-indicator-bottom' : ''}`}
                    title={b.title}
                    draggable
                    onDragStart={() => handlePinDragStart(i)}
                    onDragEnter={() => handlePinDragEnter(i)}
                    onDragEnd={handlePinDragEnd}
                    onDragOver={(e) => e.preventDefault()}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>
                    </svg>
                    <span className="sidebar-link-label sidebar-board-title">{b.title}</span>
                    <button className="sidebar-board-unpin" onClick={(e) => togglePinnedBoard(e, b._id)} title="Unpin">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </NavLink>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pinned boards — collapsed view (letter icons) */}
          {!effectiveOpen && pinnedBoards.length > 0 && (
            <div className="sidebar-group sidebar-pinned-collapsed" style={{ marginTop: 8 }}>
              {pinnedBoards.map(b => (
                <NavLink
                  key={b._id}
                  to={`/boards/${b._id}`}
                  className={({ isActive }) => `sidebar-pin-icon${isActive ? ' active' : ''}`}
                  title={b.title}
                >
                  <span className="sidebar-pin-letter">{b.title.charAt(0).toUpperCase()}</span>
                </NavLink>
              ))}
            </div>
          )}

          {/* Search results — for pinning boards */}
          {effectiveOpen && sidebarSearch.trim() && (
            <div className="sidebar-group" style={{ marginTop: 8 }}>
              <div className="sidebar-label">Search Results</div>
              <div className="sidebar-boards">
                {searchResults.length === 0 ? (
                  <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--sidebar-text)', opacity: 0.5 }}>No projects found</div>
                ) : searchResults.map(b => {
                  const isPinned = pinnedBoardIds.includes(b._id);
                  const atLimit = pinnedBoardIds.length >= MAX_PINNED;
                  return (
                    <NavLink key={b._id} to={`/boards/${b._id}`} className={navClass} title={b.title}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>
                      </svg>
                      <span className="sidebar-link-label sidebar-board-title">{b.title}</span>
                      <button
                        className={`sidebar-board-pin-btn${isPinned ? ' active' : ''}`}
                        onClick={(e) => togglePinnedBoard(e, b._id)}
                        title={isPinned ? 'Unpin' : atLimit ? `Max ${MAX_PINNED} pinned` : 'Pin to sidebar'}
                        disabled={!isPinned && atLimit}
                        style={!isPinned && atLimit ? { opacity: 0.3, cursor: 'not-allowed' } : {}}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24z"/>
                        </svg>
                      </button>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-version" style={{ padding: '8px 16px', fontSize: 10, color: 'var(--sidebar-text)', opacity: 0.4 }}>
            v1.0
          </div>
        </div>
      </aside>

      <main id="main-content" className="main-content">
        <header className="main-toolbar">
          <div className="desktop-header-brand">
            {headerPngUrl ? (
              <img
                src={headerPngUrl}
                alt={appName}
                className="header-logo"
                style={{
                  height: desktopHeaderLogoHeight,
                  width: 'auto',
                  objectFit: 'contain'
                }}
              />
            ) : (
              <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>
                {appName}
              </span>
            )}
          </div>
          <div className="main-toolbar-mobile-cluster">
            {headerPngUrl ? (
              <div className="mobile-header-brand">
                <img
                  src={headerPngUrl}
                  alt={appName}
                  style={{ height: mobileHeaderLogoHeight, width: 'auto', objectFit: 'contain', flexShrink: 0 }}
                />
              </div>
            ) : (
              <div className="mobile-header-brand">
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>
                  {appName}
                </span>
              </div>
            )}
            <div className="mobile-header-actions">
              <NotificationBell />
            </div>
          </div>
          <div className="main-toolbar-spacer" />
          <div className="desktop-only-bell"><NotificationBell /></div>
          <div className="header-profile" ref={profileRef}>
            <button
              className="header-profile-btn"
              onClick={() => setProfileOpen(v => !v)}
              title={user?.name}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={user?.name} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <div className="user-avatar" style={{ width: 32, height: 32, fontSize: 12 }}>{initials}</div>
              )}
            </button>
            {profileOpen && createPortal(
              <div className="header-profile-dropdown" ref={profileDropdownRef} style={(() => {
                const rect = profileRef.current?.getBoundingClientRect();
                if (!rect) return {};
                return { position: 'fixed', top: rect.bottom + 8, right: window.innerWidth - rect.right };
              })()}>
                <div className="header-profile-info">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={user?.name} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div className="user-avatar" style={{ width: 36, height: 36, fontSize: 13 }}>{initials}</div>
                  )}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{user?.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{roleLabel(user?.role)}</div>
                  </div>
                </div>
                <div className="dropdown-divider" />
                <button className="dropdown-item" onClick={() => { navigate('/profile'); setProfileOpen(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                  My Profile
                </button>
                <button className="dropdown-item" onClick={() => { navigate('/settings'); setProfileOpen(false); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
                  Settings
                </button>
                <button className="dropdown-item danger" onClick={handleLogout}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  Log out
                </button>
              </div>,
              document.body
            )}
          </div>
        </header>
        <div className="page-body">
          <Outlet />
        </div>
      </main>
      {createPortal(
        <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
          <NavLink to="/" end className={mobileLinkClass}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>
            </svg>
            <span>Home</span>
          </NavLink>
          <NavLink to="/notifications" className={mobileLinkClass}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
            </svg>
            <span>Alerts</span>
          </NavLink>
          <NavLink to="/settings" className={mobileLinkClass}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
            <span>Settings</span>
          </NavLink>
          <NavLink to="/support" className={mobileLinkClass}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span>Support</span>
          </NavLink>
          <NavLink to="/profile" className={mobileLinkClass}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            <span>Profile</span>
          </NavLink>
        </nav>,
        document.body
      )}

    </div>
  );
}
