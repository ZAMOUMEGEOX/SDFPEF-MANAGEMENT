import React from 'react';
import { useTheme } from '../../../contexts/ThemeContext';
import { Search, User, Bell, Paperclip, MousePointerClick, ToggleRight, Bookmark, Image as ImageIcon, Map, Hexagon, Command } from 'lucide-react';

export function DashboardClaymorphism() {
  const { theme } = useTheme();

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar p-6 lg:p-12 min-h-screen" style={{ backgroundColor: 'var(--bg-main)' }}>
      
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-12">
        
        {/* Left Sidebar Menu Simulation */}
        <div className="w-full md:w-64 shrink-0 flex flex-col gap-6">
           <div className="p-4 rounded-3xl bg-[var(--bg-surface)] shadow-[var(--clay-card)] flex flex-col gap-3">
              <button className="flex items-center gap-3 p-3 rounded-2xl bg-[#E8ECF6] shadow-[inset_1px_2px_4px_rgba(255,255,255,0.8),inset_-1px_-2px_4px_rgba(0,0,0,0.05)] text-[var(--brand)] font-bold">
                 <div className="w-8 h-8 rounded-xl bg-[var(--brand)] shadow-[var(--clay-btn)] text-white flex items-center justify-center"><Command className="w-4 h-4" /></div>
                 Default
              </button>
              <button className="flex items-center justify-between p-3 rounded-2xl text-[var(--text-muted)] font-medium hover:bg-white/50 transition-colors">
                 <div className="flex items-center gap-3"><Paperclip className="w-5 h-5 opacity-70" /> Relations</div>
              </button>
              <button className="flex items-center justify-between p-3 rounded-2xl text-[var(--text-muted)] font-medium hover:bg-white/50 transition-colors">
                 <div className="flex items-center gap-3"><User className="w-5 h-5 opacity-70" /> Users</div>
              </button>
              <button className="flex items-center justify-between p-3 rounded-2xl text-[var(--text-muted)] font-medium hover:bg-white/50 transition-colors">
                 <div className="flex items-center gap-3"><Map className="w-5 h-5 opacity-70" /> Locations</div>
              </button>
              <button className="flex items-center justify-between p-3 rounded-2xl text-[var(--text-muted)] font-medium hover:bg-white/50 transition-colors">
                 <div className="flex items-center gap-3"><Hexagon className="w-5 h-5 opacity-70" /> Components</div>
              </button>
              <div className="mt-4 p-4 rounded-2xl bg-[var(--brand)] text-white shadow-[var(--clay-btn)] text-center font-bold">
                 Select
              </div>
           </div>

           <div className="p-6 rounded-3xl bg-[var(--bg-surface)] shadow-[var(--clay-card)] flex flex-col items-center text-center">
              <div className="w-20 h-20 mb-4 bg-[#E8ECF6] rounded-full shadow-[inset_2px_4px_8px_rgba(255,255,255,0.8)] border border-white flex items-center justify-center text-[var(--text-muted)]">
                 <ImageIcon className="w-8 h-8 opacity-50" />
              </div>
              <h3 className="font-bold text-[var(--text-main)] mb-1">Empty State</h3>
              <p className="text-xs text-[var(--text-muted)] font-medium">Soft matte plastic rendering style with chunky forms.</p>
           </div>
        </div>

        {/* Main Content Showcase */}
        <div className="flex-1 space-y-10">
           
           {/* Top Big Buttons */}
           <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <button className="p-6 rounded-3xl bg-[var(--brand)] text-white shadow-[var(--clay-btn)] flex flex-col gap-2 relative overflow-hidden group">
                 <div className="absolute top-0 left-0 w-full h-full bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                 <div className="flex justify-between items-center w-full">
                    <MousePointerClick className="w-6 h-6" />
                    <span className="text-2xl font-bold opacity-50">01</span>
                 </div>
                 <span className="font-bold text-left text-lg mt-4">Action<br/>Button</span>
              </button>
              <button className="p-6 rounded-3xl bg-[var(--accent)] text-white shadow-[var(--clay-btn)] flex flex-col gap-2 relative overflow-hidden group">
                 <div className="absolute top-0 left-0 w-full h-full bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                 <div className="flex justify-between items-center w-full">
                    <Bell className="w-6 h-6" />
                    <span className="text-2xl font-bold opacity-50">02</span>
                 </div>
                 <span className="font-bold text-left text-lg mt-4">Notification<br/>Panel</span>
              </button>
              <button className="p-6 rounded-3xl bg-[#7C8B9F] text-white shadow-[var(--clay-btn)] flex flex-col gap-2 relative overflow-hidden group">
                 <div className="absolute top-0 left-0 w-full h-full bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                 <div className="flex justify-between items-center w-full">
                    <Search className="w-6 h-6" />
                    <span className="text-2xl font-bold opacity-50">03</span>
                 </div>
                 <span className="font-bold text-left text-lg mt-4">Search<br/>Module</span>
              </button>
           </div>

           {/* Controls & Inputs */}
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
              
              {/* States & Pills */}
              <div className="space-y-6">
                 <div className="flex gap-4 flex-wrap">
                    <button className="px-6 py-3 rounded-full bg-[var(--accent)] text-white font-bold shadow-[var(--clay-btn)] flex items-center gap-2">
                       + Hover
                    </button>
                    <button className="px-6 py-3 rounded-full bg-[var(--bg-surface)] text-[var(--accent)] font-bold shadow-[var(--clay-btn)] flex items-center gap-2">
                       Hover
                    </button>
                    <button className="px-6 py-3 rounded-full bg-[#7C8B9F] text-white font-bold shadow-[var(--clay-btn)] flex items-center gap-2 opacity-80 backdrop-saturate-50">
                       Pressed
                    </button>
                 </div>

                 <div className="p-6 rounded-3xl bg-[#E8ECF6] shadow-[inset_2px_4px_10px_rgba(0,0,0,0.05),inset_-2px_-4px_10px_rgba(255,255,255,0.7)] flex flex-col gap-4">
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-white shadow-[var(--clay-btn)] cursor-pointer">
                       <span className="font-bold text-[var(--text-main)] flex items-center gap-2"><Bookmark className="w-4 h-4 text-[var(--brand)]" /> Default</span>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-white shadow-[0_0_0_3px_var(--accent),var(--clay-btn)] cursor-pointer">
                       <span className="font-bold text-[var(--text-main)] flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[var(--accent)]"></div> Focused</span>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-white shadow-[0_0_0_1px_rgba(255,0,0,0.2),var(--clay-btn)] cursor-pointer">
                       <span className="font-bold text-rose-500">× Error</span>
                    </div>
                 </div>
              </div>

              {/* Toggles, Sliders & Mini Controls */}
              <div className="space-y-6">
                 <div className="flex gap-6 items-center">
                    <div className="w-20 h-10 rounded-full bg-[var(--accent)] shadow-[inset_1px_2px_5px_rgba(0,0,0,0.1)] p-1 flex items-center">
                       <div className="w-8 h-8 rounded-full bg-white shadow-[var(--clay-btn)] ml-10"></div>
                    </div>
                    <div className="w-20 h-10 rounded-full bg-[#E8ECF6] shadow-[inset_1px_2px_5px_rgba(0,0,0,0.1)] p-1 flex items-center">
                       <div className="w-8 h-8 rounded-full bg-white shadow-[var(--clay-btn)]"></div>
                    </div>
                 </div>

                 <button className="w-full p-4 rounded-[2rem] bg-[var(--accent)] text-white shadow-[var(--clay-btn)] flex items-center justify-between">
                    <span className="font-bold ml-2">Explorations</span>
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">→</div>
                 </button>

                 <div className="p-6 rounded-[2.5rem] bg-[var(--bg-surface)] shadow-[var(--clay-card)]">
                    <div className="relative h-12 flex items-center justify-center border-x-4 border-[var(--bg-surface)]">
                       <div className="absolute w-full h-8 bg-[#E8ECF6] rounded-full shadow-[inset_1px_2px_4px_rgba(0,0,0,0.1)] flex justify-between px-4 items-center">
                          {[1,2,3,4,5,6,7].map(i => <div key={i} className="w-0.5 h-3 bg-[var(--text-muted)] opacity-20"></div>)}
                       </div>
                       <div className="w-12 h-14 bg-white shadow-[var(--clay-btn)] rounded-2xl absolute left-1/3 border-2 border-[var(--bg-surface)]"></div>
                    </div>
                 </div>

                 <div className="flex bg-[#E8ECF6] p-2 rounded-2xl shadow-[inset_1px_2px_5px_rgba(0,0,0,0.05)] w-max">
                    <button className="px-6 py-2 rounded-xl text-[var(--text-muted)] font-bold">Unselected</button>
                    <button className="px-6 py-2 rounded-xl bg-white shadow-[var(--clay-btn)] text-[var(--brand)] font-bold">Selected Element</button>
                 </div>
              </div>
           </div>

        </div>

      </div>
    </div>
  );
}
