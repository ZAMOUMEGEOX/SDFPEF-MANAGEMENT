import { useState } from 'react';
import { 
  LayoutDashboard, 
  Scale, 
  ShieldAlert, 
  Leaf, 
  Satellite,
  LogOut,
  Settings,
  Map,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Aperture
} from 'lucide-react';
import { ViewState } from '../../types';
import { cn } from '../../lib/utils';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';

interface SidebarProps {
  currentView: ViewState;
  setCurrentView: (view: ViewState) => void;
  layout?: 'sidebar' | 'topbar' | 'compact' | 'floating';
}

export function Sidebar({ currentView, setCurrentView, layout = 'sidebar' }: SidebarProps) {
  const [isCollapsedState, setIsCollapsedState] = useState(false);
  const { theme, transparency, mode, setMode } = useTheme();
  const { user, logout } = useAuth();
  
  const isCollapsed = layout === 'compact' || currentView === 'teledetection' || currentView === 'domaine' ? true : isCollapsedState;

  const navItems = [
    { id: 'dashboard' as ViewState, label: 'Tableau de Bord', icon: LayoutDashboard },
    { id: 'domaine' as ViewState, label: 'Domaine Forestier', icon: Map },
    { id: 'contentieux' as ViewState, label: 'Contentieux', icon: Scale },
    { id: 'police' as ViewState, label: 'Police Forestière', icon: ShieldAlert },
    { id: 'biodiversite' as ViewState, label: 'Biodiversité', icon: Leaf },
    { id: 'teledetection' as ViewState, label: 'Télédétection', icon: Satellite },
    { id: 'drone' as ViewState, label: 'Nouvelles Technologies', icon: Aperture },
  ];

  // Initiales de l'utilisateur
  const initials = user
    ? `${user.prenom?.[0] ?? ''}${user.nom?.[0] ?? ''}`.toUpperCase()
    : 'ZA';

  const fullName = user ? `${user.prenom} ${user.nom}` : 'Administrateur';
  const grade = user?.grade ?? '';

  return (
    <aside 
      className={cn(
        "text-white h-full flex flex-col shrink-0 transition-all duration-300 relative",
        layout === 'floating' 
          ? "rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.2)] border border-white/10" 
          : "",
        transparency > 0
          ? "backdrop-blur-xl border-r border-white/10" 
          : "",
        isCollapsed ? "w-[72px]" : "w-64"
      )}
      style={transparency > 0 ? { background: `color-mix(in srgb, var(--sidebar-bg, var(--brand)) ${100 - transparency}%, transparent)` } : { background: 'var(--sidebar-bg, var(--brand))' }}
    >
      <button 
        onClick={() => setIsCollapsedState(!isCollapsedState)}
        className={cn(
          "absolute -right-3 top-8 bg-[var(--brand)] text-white rounded-full p-1 shadow-lg z-[100] hover:scale-110 transition-all border border-white/20",
          layout === 'compact' ? "hidden" : ""
        )}
      >
        {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
      </button>

      {/* Logo */}
      <div className={cn("flex items-center justify-center border-b border-white/10 transition-all", isCollapsed ? "p-3" : "p-5")}>
        <button 
          onClick={() => setCurrentView('dashboard')}
          className={cn(
            "bg-white rounded-2xl flex items-center justify-center hover:bg-white/95 hover:scale-[1.02] transition-all shadow-lg",
            isCollapsed ? "size-12 p-1.5" : "w-full h-20 p-3"
          )}
        >
           <img 
             src="/images/logo-anef2.png" 
             alt="ANEF Logo" 
             className="h-full w-full object-contain"
           />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto overflow-x-hidden no-scrollbar">
        {!isCollapsed && (
          <div className="px-3 mb-2 text-[10px] font-bold text-white/50 uppercase tracking-widest">
            Menu Principal
          </div>
        )}
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          
          let activeStyles = "bg-white/10 font-medium opacity-100 text-white";
          if (isActive) {
            if (theme === 'flight-minimal' || theme === 'ux-split-panel-anchor') {
               activeStyles = isCollapsed ? "inverted-border-compact font-bold" : "inverted-border-active font-bold font-black";
            } else if (theme === 'shopland-minimal' || theme === 'neumorphic-clean' || theme === 'corporate-green' || theme === 'dashboard-light' || theme === 'ux-framed-solid') {
               activeStyles = "bg-white font-bold opacity-100 shadow-md text-[var(--brand)] rounded-full";
            } else if (theme === 'translucent-glass' || theme === 'eco-glass' || theme === 'ux-glass-float') {
               activeStyles = "bg-white font-bold text-[var(--brand)] rounded-full shadow-[0_0_20px_rgba(255,255,255,0.4)]";
            } else if (theme === 'monochromatic-admin' || theme === 'ux-neumorphic-kit' || theme === 'ux-ghost' || theme === 'ux-top-heavy' || theme === 'ux-fragmented') {
               activeStyles = "bg-[var(--text-main)] font-bold text-[var(--bg-surface)] shadow-md";
            } else if (theme === 'ux-neumorphic-warm') {
               activeStyles = "bg-[var(--bg-main)] font-bold text-[var(--brand)] shadow-[var(--neo-in)] rounded-full";
            } else if (theme === 'ux-claymorphism-matte') {
               activeStyles = "bg-[#BABCDE] font-bold text-[var(--brand-hover)] shadow-[inset_2px_4px_6px_rgba(0,0,0,0.1)] rounded-full";
            } else if (theme === 'ux-field-agent') {
               activeStyles = "bg-white text-[var(--brand)] rounded-full font-bold scale-110 translate-x-3 shadow-[0_0_15px_rgba(0,0,0,0.2)] z-10";
            } else if (theme === 'ux-high-density') {
               activeStyles = "bg-transparent border border-white text-white font-bold rounded-full scale-110";
            }
          } else {
             const isLightText = theme === 'corporate-green' || theme === 'shopland-minimal' || theme === 'monochromatic-admin' || theme === 'ux-framed-solid' || theme === 'ux-fragmented' || theme === 'ux-ghost';
             const isDarkText = theme === 'ux-neumorphic-warm' || theme === 'ux-claymorphism-matte' || theme === 'monochromatic-admin';
             activeStyles = `hover:bg-black/5 opacity-70 hover:opacity-100 ${isDarkText ? 'text-[var(--text-main)]' : (isLightText ? 'text-white/80' : 'text-white')}`;
          }

          return (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              className={cn(
                "w-full flex items-center rounded-xl text-sm transition-all relative group",
                isCollapsed ? "justify-center p-3" : "py-3 px-4 gap-3",
                activeStyles
              )}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className="size-5 shrink-0" />
              {!isCollapsed && <span className="text-left leading-tight drop-shadow-sm">{item.label}</span>}
              {isCollapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-white text-[var(--brand)] text-xs font-semibold rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 shadow-lg">
                  {item.label}
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className={cn("mt-auto border-t border-white/10 flex flex-col gap-2", isCollapsed ? "p-3" : "p-4")}>
        
        {/* Settings */}
        <button 
          onClick={() => setCurrentView('settings')}
          className={cn(
            "w-full flex items-center rounded-xl text-sm transition-colors relative group",
            isCollapsed ? "justify-center p-3" : "px-4 py-2 gap-3",
            currentView === 'settings' ? "bg-white/10 font-medium opacity-100" : "hover:bg-white/5 opacity-80 hover:opacity-100"
          )}
        >
          <Settings className="size-5 shrink-0" />
          {!isCollapsed && <span>Paramètres</span>}
          {isCollapsed && (
            <div className="absolute left-full ml-2 px-2 py-1 bg-white text-[var(--brand)] text-xs font-semibold rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 shadow-lg">
              Paramètres
            </div>
          )}
        </button>

        {/* Theme + Profile + Logout */}
        <div className={cn(
          "flex flex-col gap-3 pt-3 border-t border-white/10"
        )}>
          {/* Theme Toggle */}
          <div className={cn(
            "bg-white/10 rounded-full p-1 border border-white/5 flex",
            isCollapsed ? "flex-col w-10 mx-auto" : "flex-row w-full max-w-[120px] mx-auto"
          )}>
            <button 
              onClick={() => setMode('light')}
              className={cn(
                "flex-1 p-2 rounded-full flex items-center justify-center transition-colors",
                mode === 'light' ? "bg-white text-[var(--brand)] shadow-sm" : "text-white/60 hover:text-white"
              )}
            >
              <Sun className="size-4" />
            </button>
            <button 
              onClick={() => setMode('dark')}
              className={cn(
                "flex-1 p-2 rounded-full flex items-center justify-center transition-colors",
                mode === 'dark' ? "bg-[#1e293b] text-white shadow-sm" : "text-white/60 hover:text-white"
              )}
            >
              <Moon className="size-4" />
            </button>
          </div>

          {/* Profile Row */}
          {isCollapsed ? (
            // Mode réduit — avatar + logout empilés
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-emerald-200/20 flex items-center justify-center text-white/80 font-bold text-xs">
                {initials}
              </div>
              <button
                onClick={logout}
                title="Déconnexion"
                className="w-8 h-8 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-red-500/20 transition-colors group relative"
              >
                <LogOut className="size-4" />
                <div className="absolute left-full ml-2 px-2 py-1 bg-white text-red-500 text-xs font-semibold rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 shadow-lg">
                  Déconnexion
                </div>
              </button>
            </div>
          ) : (
            // Mode étendu — carte profil complète
            <div className="bg-white/5 rounded-xl p-3 border border-white/10 flex items-center gap-3">
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full bg-emerald-400/20 border border-emerald-400/30 shrink-0 flex items-center justify-center text-white font-bold text-sm">
                {initials}
              </div>
              {/* Infos */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate capitalize">{fullName}</p>
                <p className="text-[10px] text-white/50 truncate">{grade}</p>
              </div>
              {/* Bouton logout */}
              <button
                onClick={logout}
                title="Déconnexion"
                className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-red-500/20 transition-all group relative"
              >
                <LogOut className="size-4" />
                <div className="absolute bottom-full mb-2 right-0 px-2 py-1 bg-red-500 text-white text-xs font-semibold rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 shadow-lg">
                  Déconnexion
                </div>
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}