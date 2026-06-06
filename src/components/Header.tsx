import React, { useState, useRef, useEffect } from 'react';
import { Search, Bell, User, Settings, Moon, Sun, Monitor, Palette } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export function Header() {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const { theme, mode, setTheme, setMode } = useTheme();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="h-20 px-4 md:px-8 flex items-center justify-between border-b border-stone-200/50 bg-[var(--bg-main)]/80 backdrop-blur-md shrink-0 transition-colors z-30 relative">
      <div className="flex items-center gap-4 flex-1">
        <div className="relative max-w-md w-full hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-stone-400" />
          <input 
            type="text" 
            placeholder="Rechercher (dossier, infraction, espèce...)" 
            className="w-full pl-10 pr-4 py-2 bg-white/50 dark:bg-black/20 border border-stone-200 dark:border-stone-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30 focus:border-[var(--brand)] transition-all text-[var(--text-main)]"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="relative p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-full border border-transparent hover:border-stone-200 transition-colors">
          <Bell className="size-5" />
          <span className="absolute top-1.5 right-1.5 size-2 bg-orange-500 rounded-full ring-2 ring-white"></span>
        </button>
        
        <div className="h-8 w-px bg-stone-200 dark:bg-stone-800 mx-1 md:mx-2"></div>
        
        <div className="relative" ref={profileRef}>
          <button 
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-3 hover:bg-stone-100 dark:hover:bg-stone-800/50 p-1.5 rounded-lg transition-colors border border-transparent hover:border-stone-200 dark:hover:border-stone-800"
          >
            <div className="size-8 rounded-full bg-[var(--brand)]/10 flex items-center justify-center text-[var(--brand)]">
              <User className="size-4" />
            </div>
            <div className="hidden lg:block text-left">
              <p className="text-sm font-bold text-[var(--text-main)]">A. Admin</p>
              <p className="text-xs text-stone-500">Direction Générale</p>
            </div>
          </button>

          {isProfileOpen && (
             <div className="absolute top-full right-0 mt-2 w-72 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-xl overflow-hidden flex flex-col z-50 animate-in fade-in slide-in-from-top-2">
                <div className="p-4 border-b border-stone-100 dark:border-stone-800">
                  <p className="font-bold text-[var(--text-main)] text-sm">Paramètres d'Apparence</p>
                  <p className="text-xs text-stone-500 mt-0.5">Personnalisez votre expérience</p>
                </div>
                
                <div className="p-4 space-y-4">
                  {/* Mode (Light/Dark/System) */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider flex items-center gap-2">
                      <Settings className="size-3" /> Mode
                    </label>
                    <div className="flex bg-stone-100 dark:bg-stone-800 rounded-lg p-1">
                       <button onClick={() => setMode('light')} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-all ${mode === 'light' ? 'bg-white dark:bg-stone-700 shadow-sm text-stone-900 dark:text-white' : 'text-stone-500 hover:text-stone-700'}`}>
                         <Sun className="size-3" /> Clair
                       </button>
                       <button onClick={() => setMode('dark')} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-all ${mode === 'dark' ? 'bg-white dark:bg-stone-700 shadow-sm text-stone-900 dark:text-white' : 'text-stone-500 hover:text-stone-700'}`}>
                         <Moon className="size-3" /> Sombre
                       </button>
                       <button onClick={() => setMode('system')} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-all ${mode === 'system' ? 'bg-white dark:bg-stone-700 shadow-sm text-stone-900 dark:text-white' : 'text-stone-500 hover:text-stone-700'}`}>
                         <Monitor className="size-3" /> Auto
                       </button>
                    </div>
                  </div>

                  {/* Themes */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider flex items-center gap-2">
                      <Palette className="size-3" /> Thème
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[ 
                         { id: 'default', name: 'Forest Classic', color: '#2D4A22' },
                         { id: 'anef', name: 'Officiel ANEF', color: '#153128' },
                         { id: 'ecopro', name: 'Eco Pro', color: '#059669' },
                         { id: 'biodiversite', name: 'Biodiversité', color: '#16a34a' },
                         { id: 'admin', name: 'Admin', color: '#1e293b' },
                         { id: 'white', name: 'Minimal', color: '#000000' }
                      ].map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setTheme(t.id as any)}
                          className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all ${theme === t.id ? 'border-[var(--brand)] bg-[var(--brand)]/5 ring-1 ring-[var(--brand)]' : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800'}`}
                        >
                          <span className="size-3 rounded-full shrink-0" style={{ backgroundColor: t.color }}></span>
                          <span className="text-xs font-medium text-[var(--text-main)] truncate">{t.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

             </div>
          )}
        </div>
      </div>
    </header>
  );
}
