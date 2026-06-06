import React from 'react';
import { Search, Bell } from 'lucide-react';

export function Header({ onOpenSearch, onOpenNotif }: { onOpenSearch?: () => void, onOpenNotif?: () => void }) {
  return (
    <header className="hidden md:flex h-20 px-4 md:px-8 items-center justify-between border-b border-stone-200/50 bg-[var(--bg-main)]/80 backdrop-blur-md shrink-0 transition-colors z-30 relative">
      <div className="flex items-center gap-4 flex-1">
        <div className="relative max-w-md w-full hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-stone-400" />
          <input 
            type="text" 
            placeholder="Rechercher (dossier, infraction, espèce...)" 
            className="w-full pl-10 pr-4 py-2 bg-white/50 dark:bg-black/20 border border-stone-200 dark:border-stone-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30 focus:border-[var(--brand)] transition-all text-[var(--text-main)] cursor-pointer"
            onClick={onOpenSearch}
            readOnly
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={onOpenNotif} className="relative p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-full border border-transparent hover:border-stone-200 transition-colors">
          <Bell className="size-5" />
          <span className="absolute top-1.5 right-1.5 size-2 bg-orange-500 rounded-full ring-2 ring-white"></span>
        </button>
      </div>
    </header>
  );
}
