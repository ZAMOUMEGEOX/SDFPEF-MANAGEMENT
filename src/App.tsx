import { useState, useEffect } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { Dashboard } from './views/Dashboard/Dashboard';
import { Contentieux } from './views/Contentieux/Contentieux';
import { PoliceForestiere } from './views/PoliceForestiere/PoliceForestiere';
import { Biodiversite } from './views/Biodiversite/Biodiversite';
import { Teledetection } from './views/Teledetection/Teledetection';
import { DomaineForestier } from './views/DomaineForestier/DomaineForestier';
import { Login } from './views/Auth/Login';
import { useAuth } from './contexts/AuthContext';
import { ViewState } from './types';
import { 
  LayoutDashboard, 
  Scale, 
  ShieldAlert, 
  Leaf, 
  Satellite,
  Map as MapIcon,
  Settings as SettingsIcon,
  Search, Bell, User, Menu, Sun, Moon, Aperture
} from 'lucide-react';
import { cn } from './lib/utils';
import { useTheme } from './contexts/ThemeContext';

import { AIAssistant } from './components/shared/AIAssistant';
import { GlobalSearchModal } from './components/shared/GlobalSearchModal';
import { NotificationPanel } from './components/shared/NotificationPanel';

import { Settings as SettingsView } from './views/Settings/Settings';
import { Drone3D } from './views/Drone3D/Drone3D';

export default function App() {
const { isAuthenticated, isLoading, login, user, logout } = useAuth();
  const [currentView, setCurrentView] = useState<ViewState>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const { layout, mode, setMode, transparency } = useTheme();

  // الربط المكاني (قسم المنازعات ⇄ خريطة الملك الغابوي): تبديل العرض تلقائياً
  useEffect(() => {
    const toMap = () => setCurrentView('domaine');
    const toBack = () => setCurrentView('contentieux');
    window.addEventListener('anef:open-map', toMap);
    window.addEventListener('anef:return-from-map', toBack);
    return () => {
      window.removeEventListener('anef:open-map', toMap);
      window.removeEventListener('anef:return-from-map', toBack);
    };
  }, []);
  if (isLoading) return (
  <div className="min-h-screen bg-black flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

  const navItems = [
    { id: 'dashboard' as ViewState, label: 'Tableau de Bord', icon: LayoutDashboard },
    { id: 'domaine' as ViewState, label: 'Domaine Forestier', icon: MapIcon },
    { id: 'contentieux' as ViewState, label: 'Contentieux', icon: Scale },
    { id: 'police' as ViewState, label: 'Police Forestière', icon: ShieldAlert },
    { id: 'biodiversite' as ViewState, label: 'Biodiversité', icon: Leaf },
    { id: 'teledetection' as ViewState, label: 'Télédétection', icon: Satellite },
    { id: 'drone' as ViewState, label: 'Nouvelles Technologies', icon: Aperture },
  ];

  if (!isAuthenticated) {
return <Login onLogin={login} />;
  }

  const renderTopNav = () => (
    <header 
      className={cn(
        "topbar-header hidden md:flex font-[var(--font-sans)] text-white w-full h-16 items-center px-6 shrink-0 z-40 shadow-md transition-all",
        transparency > 0 ? "backdrop-blur-xl border-b border-white/10" : ""
      )}
      style={transparency > 0 ? { background: `color-mix(in srgb, var(--brand) ${100 - transparency}%, transparent)` } : { background: 'var(--brand)' }}
    >
      <div className="flex items-center gap-2 mr-8">
        <button className="flex items-center gap-2 text-left hover:scale-105 transition-transform" onClick={() => setCurrentView('dashboard')}>
          <Leaf className="w-6 h-6 text-white" />
          <div className="text-left">
            <h1 className="text-sm font-black leading-tight tracking-[0.1em] text-white/90">ANEF</h1>
          </div>
        </button>
      </div>
      <nav className="flex-1 flex gap-2">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors",
                isActive ? "bg-white/20 font-semibold" : "hover:bg-white/10 opacity-80 hover:opacity-100"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="text-left whitespace-nowrap">{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="flex items-center gap-4 border-l border-white/20 pl-4">
        <button onClick={() => setCurrentView('settings')} className="p-2 hover:bg-white/10 rounded-full transition-colors relative group">
          <SettingsIcon className="w-5 h-5 opacity-80 group-hover:opacity-100" />
        </button>
        <div className="flex items-center gap-2">
  <span className="text-xs text-white/70">{user?.prenom} {user?.nom}</span>
  <button
    onClick={logout}
    className="text-xs text-white/60 hover:text-white border border-white/20 hover:border-white/40 px-3 py-1.5 rounded-lg transition-colors"
  >
    Déconnexion
  </button>
</div>
      </div>
    </header>
  );

  return (
    <div className={cn("flex h-[100dvh] bg-[var(--bg-main)] text-[var(--text-main)] overflow-hidden font-sans transition-colors flex-col", layout === 'bottom' ? 'md:pb-16' : '')}>
      {layout === 'topbar' && renderTopNav()}
      
      <div className="flex flex-1 min-h-0 relative">
        {/* Render Sidebar based on layout */}
        {layout !== 'topbar' && layout !== 'bottom' && (
          <div className={cn(
            "hidden md:flex h-full shrink-0 z-40",
            layout === 'floating' ? "py-4 pl-4 bg-transparent" : "",
            layout === 'compact' ? "w-[72px]" : ""
          )}>
             <Sidebar currentView={currentView} setCurrentView={setCurrentView} layout={layout} />
          </div>
        )}
        
        <div className={cn("flex flex-col flex-1 min-w-0 h-full relative", (currentView !== 'domaine' && currentView !== 'teledetection') ? "pb-16 md:pb-0" : "")}>
          <div className={cn(
            "flex flex-col flex-1 h-full w-full",
            layout === 'floating' && (currentView !== 'domaine' && currentView !== 'teledetection') ? "md:py-4 md:pr-4" : ""
          )}>
            <div className={cn(
              "flex flex-col flex-1 h-full w-full overflow-hidden",
              layout === 'floating' && (currentView !== 'domaine' && currentView !== 'teledetection') ? "md:rounded-2xl md:border md:border-[var(--border-color)] bg-[var(--bg-surface)] md:shadow-[0_8px_30px_rgb(0,0,0,0.12)]" : ""
            )}>
              {currentView !== 'domaine' && currentView !== 'teledetection' && layout !== 'topbar' && <Header onOpenSearch={() => setIsSearchOpen(true)} onOpenNotif={() => setIsNotifOpen(true)} />}
              {currentView !== 'domaine' && currentView !== 'teledetection' && layout === 'topbar' && (
                <header className="h-14 bg-[var(--bg-surface)] border-b border-[var(--border-color)] flex items-center justify-between px-6 shrink-0 z-30 shadow-sm">
                    <h2 className="text-lg font-bold capitalize text-[var(--text-main)]">{currentView.replace('-', ' ')}</h2>
                    <div className="flex items-center gap-4">
                      <div className="relative max-w-sm w-64">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                        <input 
                          type="text" 
                          placeholder="Rechercher..." 
                          className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-full pl-9 pr-4 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)] text-[var(--text-main)] cursor-pointer"
                          onClick={() => setIsSearchOpen(true)}
                          readOnly
                        />
                      </div>
                      <button onClick={() => setIsNotifOpen(true)} className="relative p-2 text-[var(--text-muted)] hover:text-[var(--brand)] transition-colors rounded-full hover:bg-[var(--bg-main)]">
                        <Bell className="w-5 h-5" />
                        <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-[var(--bg-surface)]"></span>
                      </button>
                    </div>
                </header>
              )}
              
              <main className="flex-1 overflow-y-auto w-full h-full relative">
                {currentView === 'dashboard' && <Dashboard />}
                {currentView === 'contentieux' && <Contentieux />}
                {currentView === 'police' && <PoliceForestiere />}
                {currentView === 'biodiversite' && <Biodiversite />}
                {currentView === 'teledetection' && <Teledetection />}
                {currentView === 'domaine' && <DomaineForestier setCurrentView={setCurrentView} />}
                {currentView === 'settings' && <SettingsView />}
                {currentView === 'drone' && <Drone3D />}
              </main>
            </div>
          </div>

          {/* Mobile Navigation & Bottom Layout Navigation */}
          {(layout === 'bottom' || window.innerWidth < 768) ? (
            <nav className={cn(
              "fixed bottom-0 left-0 right-0 z-50 border-t shadow-[0_-4px_20px_rgba(0,0,0,0.05)] transition-colors",
              layout === 'bottom' 
                ? "md:flex bg-[var(--brand)] text-white border-white/10 pb-0 hidden" 
                : "flex bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border-color)] pb-[env(safe-area-inset-bottom)] md:hidden"
            )}>
              <div className="flex w-full overflow-x-auto no-scrollbar items-center h-[60px] md:h-16 max-w-7xl mx-auto px-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setCurrentView(item.id)}
                    className={cn(
                      "flex-1 min-w-[64px] md:min-w-[70px] max-w-[120px] flex flex-col items-center justify-center gap-1 transition-all px-1 py-1.5 mx-0.5 rounded-xl",
                      layout === 'bottom' 
                        ? (isActive ? "text-white bg-white/10" : "text-white/60 hover:text-white hover:bg-white/5")
                        : (isActive ? "text-[var(--brand)]" : "hover:text-[var(--text-main)] hover:bg-[var(--bg-main)]")
                    )}
                  >
                    <div className={cn("relative p-1 rounded-full transition-all", layout !== 'bottom' && isActive ? "bg-[var(--brand)]/10" : "")}>
                      <Icon className={cn("size-4 md:size-5 transition-transform", isActive ? "scale-110" : "")} />
                    </div>
                    <span className={cn("text-[8px] md:text-[10px] text-center font-medium leading-tight truncate w-full", isActive ? "font-bold" : "")}>
                       {item.label}
                    </span>
                  </button>
                );
              })}
              
              {layout === 'bottom' && (
                <>
                  <div className="w-px h-8 bg-white/10 mx-2 hidden md:block"></div>
                  
                  <button
                    onClick={() => setCurrentView('settings')}
                    className={cn(
                      "flex-1 min-w-[70px] max-w-[80px] hidden md:flex flex-col items-center justify-center gap-1 transition-colors px-2 py-1 mx-1 rounded-xl",
                      currentView === 'settings' 
                        ? "text-white bg-white/10" 
                        : "text-white/60 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <SettingsIcon className={cn("size-5", currentView === 'settings' ? "scale-110 mb-0.5" : "")} />
                    <span className={cn("text-[10px] text-center font-medium leading-tight truncate w-full", currentView === 'settings' ? "opacity-100" : "opacity-80")}>
                       Paramètres
                    </span>
                  </button>

                  <div className="hidden md:flex items-center gap-2">
                    <button 
                      onClick={() => setMode('light')}
                      className={cn("p-2 rounded-full", mode === 'light' ? "bg-white text-[var(--brand)]" : "text-white/60 hover:text-white")}
                    >
                      <Sun className="size-4" />
                    </button>
                    <button 
                      onClick={() => setMode('dark')}
                      className={cn("p-2 rounded-full", mode === 'dark' ? "bg-[#1e293b] text-white" : "text-white/60 hover:text-white")}
                    >
                      <Moon className="size-4" />
                    </button>
                    <div className="w-8 h-8 rounded-full bg-emerald-200/20 shrink-0 ml-2 flex items-center justify-center text-white/80 font-bold text-xs">
                      ZA
                    </div>
                  </div>
                </>
              )}
            </div>
          </nav>
          ) : (
            <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[var(--bg-surface)] text-[var(--text-muted)] flex z-50 border-t border-[var(--border-color)] shadow-[0_-4px_20px_rgba(0,0,0,0.05)] pb-[env(safe-area-inset-bottom)] transition-colors">
              <div className="flex w-full overflow-x-auto no-scrollbar items-center h-[60px] px-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setCurrentView(item.id)}
                    className={cn(
                      "flex-1 min-w-[64px] flex flex-col items-center justify-center gap-1 transition-all px-1 py-1.5 rounded-xl",
                      isActive 
                        ? "text-[var(--brand)]" 
                        : "hover:text-[var(--text-main)] hover:bg-[var(--bg-main)]"
                    )}
                  >
                    <div className={cn("relative p-1 rounded-full transition-all", isActive ? "bg-[var(--brand)]/10" : "")}>
                       <Icon className={cn("size-4 transition-transform", isActive ? "scale-110" : "")} />
                    </div>
                    <span className={cn("text-[8px] text-center font-medium leading-tight truncate w-full", isActive ? "font-bold" : "")}>
                       {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>
          )}
        </div>
      </div>
      
      <AIAssistant currentView={currentView} setCurrentView={setCurrentView} />

      <GlobalSearchModal 
        isOpen={isSearchOpen} 
        onClose={() => setIsSearchOpen(false)} 
        onSelect={(route, item) => {
           setCurrentView(route as ViewState);
        }} 
      />

      <NotificationPanel 
        isOpen={isNotifOpen}
        onClose={() => setIsNotifOpen(false)}
        onNavigate={(route) => setCurrentView(route as ViewState)}
      />
    </div>
  );
}