import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { organizationsApi } from '../api/organizations';

const defaults = { appTitle: 'Smythe', tagline: '', logoUrl: '', logoShape: 'rounded', accentColor: '#0a84ff', logoSize: 48, faviconUrl: '', siteTitle: '', sidebarColor: '#1a1a2e', allowSignup: false };

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
}

function darkenHex(hex, amount = 20) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgb(${Math.max(0, rgb.r - amount)}, ${Math.max(0, rgb.g - amount)}, ${Math.max(0, rgb.b - amount)})`;
}
const BrandingContext = createContext(defaults);

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState(() => {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem('smythe:branding')) }; } catch { return defaults; }
  });

  const load = useCallback(async () => {
    try {
      const { data } = await organizationsApi.getPublicBranding();
      const merged = { ...defaults, ...data };
      setBranding(merged);
      localStorage.setItem('smythe:branding', JSON.stringify(merged));
    } catch { /* keep cached */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    document.title = branding.siteTitle || branding.appTitle || 'Smythe';
  }, [branding.appTitle, branding.siteTitle]);

  useEffect(() => {
    if (!branding.faviconUrl) return;
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = branding.faviconUrl;
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
