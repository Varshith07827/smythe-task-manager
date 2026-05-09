import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { organizationsApi } from '../api/organizations';

const APP_STORAGE_KEY = 'app:branding';
const defaults = { appTitle: 'TaskIT', tagline: 'Smart Task Management', logoUrl: '', logoShape: 'rounded', accentColor: '#0a84ff', logoSize: 48, headerLogoUrl: '', headerLogoHeight: 36, headerLogoScale: 1, faviconUrl: '', siteTitle: '', sidebarColor: '#1a1a2e', allowSignup: false, showLogoInHeader: true, showLogoInSidebar: true, showFaviconInSidebar: true, showNameInHeader: true, useSameLogo: true };

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
}

function darkenHex(hex, amount = 20) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgb(${Math.max(0, rgb.r - amount)}, ${Math.max(0, rgb.g - amount)}, ${Math.max(0, rgb.b - amount)})`;
}

function updateMeta(selector, attr, value) {
  let el = document.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    const [key, val] = selector.match(/\[(.+?)="(.+?)"\]/)?.slice(1) || [];
    if (key && val) el.setAttribute(key, val);
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

const BrandingContext = createContext(defaults);

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState(() => {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(APP_STORAGE_KEY)) }; } catch { return defaults; }
  });

  const load = useCallback(async () => {
    try {
      const { data } = await organizationsApi.getPublicBranding();
      const merged = { ...defaults, ...data };
      setBranding(merged);
      localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(merged));
    } catch { /* keep cached */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Update document title + all meta tags whenever branding changes
  useEffect(() => {
    const title = branding.siteTitle || branding.appTitle || defaults.appTitle;
    const tagline = branding.tagline || defaults.tagline;
    document.title = title;

    // OpenGraph
    updateMeta('meta[property="og:title"]', 'content', title);
    updateMeta('meta[property="og:description"]', 'content', tagline);
    updateMeta('meta[property="og:site_name"]', 'content', title);

    // Twitter
    updateMeta('meta[name="twitter:title"]', 'content', title);
    updateMeta('meta[name="twitter:description"]', 'content', tagline);

    // App metadata
    updateMeta('meta[name="description"]', 'content', tagline);
    updateMeta('meta[name="application-name"]', 'content', title);
    updateMeta('meta[name="apple-mobile-web-app-title"]', 'content', title);
  }, [branding.appTitle, branding.siteTitle, branding.tagline]);

  useEffect(() => {
    if (!branding.faviconUrl) return;
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = branding.faviconUrl;

    // OG image (favicon as fallback)
    updateMeta('meta[property="og:image"]', 'content', branding.faviconUrl);
  }, [branding.faviconUrl]);

  // Apply accent color as CSS custom properties globally
  useEffect(() => {
    const color = branding.accentColor;
    if (!color) return;
    const root = document.documentElement;
    const rgb = hexToRgb(color);
    root.style.setProperty('--accent', color);
    root.style.setProperty('--accent-hover', darkenHex(color, 25));
    if (rgb) {
      root.style.setProperty('--accent-subtle', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`);
      root.style.setProperty('--accent-light', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`);
    }
  }, [branding.accentColor]);

  // Apply sidebar color globally
  useEffect(() => {
    if (branding.sidebarColor) {
      document.documentElement.style.setProperty('--sidebar-bg', branding.sidebarColor);
    }
  }, [branding.sidebarColor]);

  const refresh = load;

  return (
    <BrandingContext.Provider value={{ ...branding, refresh }}>
      {children}
    </BrandingContext.Provider>
  );
}

export const useBranding = () => useContext(BrandingContext);
