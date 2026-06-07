import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'default' | 'ecopro' | 'admin' | 'white' | 'biodiversite' | 'anef' | 'eco-glass' | 'nexus' | 'command-center' | 'sport' | 'dashboard-light' | 'flight-minimal' | 'corporate-green' | 'translucent-glass' | 'neumorphic-clean' | 'shopland-minimal' | 'teal-gradient' | 'monochromatic-admin' | 'ux-top-heavy' | 'ux-glass-float' | 'ux-fragmented' | 'ux-framed-solid' | 'ux-neumorphic-kit' | 'ux-high-density' | 'ux-ghost' | 'ux-field-agent' | 'ux-split-panel-anchor' | 'ux-neumorphic-warm' | 'ux-claymorphism-matte';
type ThemeColor = 'default' | 'rog' | 'tuf' | 'prime' | 'proart' | 'anef' | 'ecopro' | 'biodiversite' | 'admin' | 'white' | 'mint' | 'olive' | 'forest' | 'teal' | 'pastel-green' | 'dark-slate' | 'soft-mint' | 'mustard-gold' | 'monochrome-silver';
type Mode = 'light' | 'dark' | 'system';
type Layout = 'sidebar' | 'topbar' | 'compact' | 'floating' | 'bottom';

interface ThemeContextType {
  theme: Theme;
  color: ThemeColor;
  mode: Mode;
  layout: Layout;
  transparency: number;
  setTheme: (theme: Theme) => void;
  setColor: (color: ThemeColor) => void;
  setMode: (mode: Mode) => void;
  setLayout: (layout: Layout) => void;
  setTransparency: (trans: number) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {

  // ✅ إجبار كل المستخدمين على الثيم الجديد (يعمل مرة واحدة فقط)
  const THEME_VERSION = 'v2';
  if (localStorage.getItem('theme-version') !== THEME_VERSION) {
    localStorage.removeItem('app-theme');
    localStorage.removeItem('app-color');
    localStorage.setItem('theme-version', THEME_VERSION);
  }

  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('app-theme') as Theme;
    return saved || 'ecopro'; // ✅ الثيم الافتراضي: Eco Pro
  });
  
  const [color, setColor] = useState<ThemeColor>(() => {
    const saved = localStorage.getItem('app-color') as ThemeColor;
    return saved || 'teal'; // ✅ اللون الافتراضي: Teal Clean
  });

  const [mode, setMode] = useState<Mode>(() => {
    const saved = localStorage.getItem('app-mode') as Mode;
    return saved || 'system';
  });

  const [layout, setLayout] = useState<Layout>(() => {
    const saved = localStorage.getItem('app-layout') as Layout;
    return saved || 'sidebar';
  });

  const [transparency, setTransparency] = useState<number>(() => {
    const saved = localStorage.getItem('app-transparency');
    if (saved) {
      const val = parseInt(saved, 10);
      if (!isNaN(val)) return val;
    }
    const legacy = localStorage.getItem('app-transparent');
    if (legacy === 'true') return 20;
    return 0;
  });

  useEffect(() => {
    localStorage.setItem('app-theme', theme);
    localStorage.setItem('app-color', color);
    localStorage.setItem('app-mode', mode);
    localStorage.setItem('app-layout', layout);
    localStorage.setItem('app-transparency', transparency.toString());

    const root = window.document.documentElement;
    
    // Remove old classes
    const allThemes = ['theme-default', 'theme-ecopro', 'theme-biodiversite', 'theme-admin', 'theme-white', 'theme-anef', 'theme-eco-glass', 'theme-nexus', 'theme-command-center', 'theme-sport', 'theme-dashboard-light', 'theme-flight-minimal', 'theme-corporate-green', 'theme-translucent-glass', 'theme-neumorphic-clean', 'theme-shopland-minimal', 'theme-teal-gradient', 'theme-monochromatic-admin', 'theme-ux-top-heavy', 'theme-ux-glass-float', 'theme-ux-fragmented', 'theme-ux-framed-solid', 'theme-ux-neumorphic-kit', 'theme-ux-high-density', 'theme-ux-ghost', 'theme-ux-field-agent', 'theme-ux-split-panel-anchor', 'theme-ux-neumorphic-warm', 'theme-ux-claymorphism-matte'];
    root.classList.remove(...allThemes, 'dark', 'layout-sidebar', 'layout-topbar', 'layout-compact', 'layout-floating', 'layout-bottom');
    
    const colorsToRemove = ['color-default', 'color-rog', 'color-tuf', 'color-prime', 'color-proart', 'color-anef', 'color-ecopro', 'color-biodiversite', 'color-admin', 'color-white', 'color-mint', 'color-olive', 'color-forest', 'color-teal', 'color-pastel-green', 'color-dark-slate', 'color-soft-mint', 'color-mustard-gold', 'color-monochrome-silver'];
    colorsToRemove.forEach(c => root.classList.remove(c));
    root.classList.remove('is-transparent');

    // Add current classes
    root.classList.add(`theme-${theme}`);
    root.classList.add(`color-${color}`);
    root.classList.add(`layout-${layout}`);
    
    if (transparency > 0) {
      root.classList.add('is-transparent');
    } else {
      root.classList.remove('is-transparent');
    }
    root.style.setProperty('--glass-mix-percent', `${100 - transparency}%`);

    // Handle dark mode logic
    if (mode === 'dark') {
      root.classList.add('dark');
    } else if (mode === 'system') {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (systemDark) {
        root.classList.add('dark');
      }
    }
  }, [theme, mode, layout, color, transparency]);

  // Listen for system theme changes if set to system
  useEffect(() => {
    if (mode !== 'system') return;
    
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      const root = window.document.documentElement;
      if (e.matches) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [mode]);

  return (
    <ThemeContext.Provider value={{ theme, color, mode, layout, transparency, setTheme, setColor, setMode, setLayout, setTransparency }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}