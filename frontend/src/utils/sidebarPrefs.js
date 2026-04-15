/**
 * Plain session preference for sidebar (no React). Collapsed by default when unset.
 */
const KEY = 'scards_sidebar_expanded';

export function getSidebarExpanded() {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setSidebarExpanded(value) {
  try {
    if (value) sessionStorage.setItem(KEY, '1');
    else sessionStorage.removeItem(KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Collapse sidebar on Escape (desktop). Returns unsubscribe for useEffect cleanup. */
export function subscribeSidebarEscape(onEscape) {
  const handler = (e) => {
    if (e.key === 'Escape') onEscape();
  };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}
