import { 
  LayoutDashboard, 
  Scale, 
  ShieldAlert, 
  Leaf, 
  Satellite,
  LogOut,
  Settings,
  Map,
  Aperture
} from 'lucide-react';
import { ViewState } from '../types';
import { cn } from '../lib/utils';

interface SidebarProps {
  currentView: ViewState;
  setCurrentView: (view: ViewState) => void;
}

export function Sidebar({ currentView, setCurrentView }: SidebarProps) {
  const navItems = [
    { id: 'dashboard' as ViewState, label: 'Tableau de Bord', icon: LayoutDashboard },
    { id: 'domaine' as ViewState, label: 'Domaine Forestier', icon: Map },
    { id: 'contentieux' as ViewState, label: 'Contentieux', icon: Scale },
    { id: 'police' as ViewState, label: 'Police Forestière', icon: ShieldAlert },
    { id: 'biodiversite' as ViewState, label: 'Biodiversité', icon: Leaf },
    { id: 'teledetection' as ViewState, label: 'Télédétection', icon: Satellite },
    { id: 'drone' as ViewState, label: 'Nouvelles Technologies', icon: Aperture },
  ];

  return (
    <aside className="w-64 bg-[var(--brand)] text-white h-full flex flex-col shrink-0 transition-colors">
      <div className="p-6 flex items-center gap-3 border-b border-white/10">
        <div className="h-12 w-auto bg-white/10 rounded-xl flex items-center justify-center relative overflow-hidden backdrop-blur-sm px-3 py-1 flex-1">
           <img 
             src="/logo.png" 
             alt="ANEF Logo" 
             className="h-full w-auto object-contain drop-shadow"
             onError={(e) => {
               e.currentTarget.style.display = 'none';
               e.currentTarget.nextElementSibling?.classList.remove('hidden');
             }} 
           />
           <div className="hidden w-full h-full flex items-center justify-center gap-2">
             <Leaf className="w-6 h-6 text-white" />
             <div className="text-left">
               <h1 className="text-sm font-black leading-tight tracking-[0.1em] text-white/90">ANEF</h1>
               <p className="text-[10px] opacity-70 tracking-widest uppercase mt-0.5 font-medium">Eaux et Forêts</p>
             </div>
           </div>
        </div>
      </div>

      <nav className="flex-1 py-6 px-4 space-y-1">
        <div className="px-4 mb-2 text-[10px] font-bold text-white/50 uppercase tracking-widest">
          Menu Principal
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors",
                isActive 
                  ? "bg-white/10 font-medium opacity-100" 
                  : "hover:bg-white/5 opacity-80"
              )}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="text-left leading-tight drop-shadow-sm">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-6 mt-auto border-t border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-200/20"></div>
          <div className="text-xs text-left">
            <p className="font-semibold uppercase tracking-wide">ZAMOUME AHMED</p>
            <p className="opacity-60">ADMIN</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
