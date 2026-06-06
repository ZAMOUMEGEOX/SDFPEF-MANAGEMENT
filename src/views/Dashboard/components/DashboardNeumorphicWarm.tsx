import React from 'react';
import { useTheme } from '../../../contexts/ThemeContext';
import { Settings, Search, User, Bell, Box, CheckCircle, Circle, CircleDashed, ChevronDown, AlignLeft, Info, ToggleRight, ToggleLeft } from 'lucide-react';

export function DashboardNeumorphicWarm() {
  const { theme } = useTheme();

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar p-6 lg:p-12 min-h-screen" style={{ backgroundColor: 'var(--bg-main)' }}>
      
      <div className="max-w-7xl mx-auto space-y-12">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[var(--text-main)] mb-2">Warm Neumorphic System</h1>
            <p className="text-sm font-medium text-[var(--text-muted)] tracking-wider uppercase">UI Components Library</p>
          </div>
          <div className="flex gap-4">
             <button className="w-12 h-12 flex items-center justify-center rounded-2xl text-[var(--text-muted)] shadow-[var(--neo-out)] hover:shadow-[var(--neo-in)] transition-all">
                <Search className="w-5 h-5" />
             </button>
             <button className="w-12 h-12 flex items-center justify-center rounded-2xl text-[var(--text-muted)] shadow-[var(--neo-out)] hover:shadow-[var(--neo-in)] transition-all">
                <Bell className="w-5 h-5" />
             </button>
             <div className="w-12 h-12 flex items-center justify-center rounded-2xl rounded-full text-white bg-[var(--brand)] shadow-[var(--neo-out)]">
                <User className="w-5 h-5" />
             </div>
          </div>
        </header>

        {/* Foundations Section */}
        <section>
          <div className="flex items-center gap-4 mb-6">
            <h2 className="text-sm font-bold text-[var(--text-main)] uppercase tracking-widest">Foundations</h2>
            <div className="h-px bg-[var(--border-color)] flex-1 opacity-50 shadow-[var(--neo-in)]"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
             <div className="flex flex-col items-center">
                <div className="w-24 h-24 rounded-2xl shadow-[var(--neo-out)] mb-4"></div>
                <span className="text-[10px] font-bold text-[var(--text-muted)] tracking-widest">RAISED LAYER</span>
             </div>
             <div className="flex flex-col items-center">
                <div className="w-24 h-24 rounded-2xl shadow-[var(--neo-in)] mb-4"></div>
                <span className="text-[10px] font-bold text-[var(--text-muted)] tracking-widest">INSET LAYER</span>
             </div>
             <div className="flex flex-col items-center">
                <div className="w-24 h-24 rounded-full shadow-[var(--neo-out)] mb-4 flex items-center justify-center">
                   <div className="w-12 h-12 rounded-full shadow-[var(--neo-in)]"></div>
                </div>
                <span className="text-[10px] font-bold text-[var(--text-muted)] tracking-widest">RADIAL PRESS</span>
             </div>
             <div className="flex flex-col items-center justify-center gap-6">
                <div className="flex gap-4 items-end">
                   <div className="w-4 h-4 rounded shadow-[var(--neo-out)]"></div>
                   <div className="w-8 h-8 rounded-lg shadow-[var(--neo-out)]"></div>
                   <div className="w-12 h-12 rounded-xl shadow-[var(--neo-out)]"></div>
                   <div className="w-16 h-16 rounded-2xl shadow-[var(--neo-out)]"></div>
                </div>
                <span className="text-[10px] font-bold text-[var(--text-muted)] tracking-widest">RADIUS SCALE</span>
             </div>
          </div>
        </section>

        {/* Controls Section */}
        <section>
          <div className="flex items-center gap-4 mb-6">
            <h2 className="text-sm font-bold text-[var(--text-main)] uppercase tracking-widest">Controls</h2>
            <div className="h-px bg-[var(--border-color)] flex-1 opacity-50 shadow-[var(--neo-in)]"></div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
             <div className="space-y-6">
                <div>
                   <p className="text-[10px] font-bold text-[var(--text-muted)] mb-3 tracking-widest">PRIMARY BUTTON</p>
                   <button className="w-full py-3.5 rounded-full bg-[var(--brand)] text-white font-bold text-sm shadow-[var(--neo-out)] hover:shadow-[var(--neo-in)] hover:text-white/80 transition-all">Submit Now</button>
                </div>
                <div>
                   <p className="text-[10px] font-bold text-[var(--text-muted)] mb-3 tracking-widest">DISABLED STATE</p>
                   <button className="w-full py-3.5 rounded-full text-[var(--text-muted)] font-bold text-sm shadow-[var(--neo-in)] opacity-70 cursor-not-allowed">Not Available</button>
                </div>
                <div>
                   <p className="text-[10px] font-bold text-[var(--text-muted)] mb-3 tracking-widest">TEXT FIELD</p>
                   <div className="w-full rounded-2xl shadow-[var(--neo-in)] p-4 flex items-center">
                      <input type="text" placeholder="Email Address" className="bg-transparent w-full focus:outline-none text-[var(--text-main)] font-medium" />
                   </div>
                   <p className="text-[10px] text-[var(--text-muted)] mt-2 italic">Helper: Enter a valid email</p>
                </div>
             </div>

             <div className="space-y-8">
                <div>
                   <p className="text-[10px] font-bold text-[var(--text-muted)] mb-4 tracking-widest">CHECKBOX & RADIO</p>
                   <div className="space-y-3">
                      <div className="flex items-center gap-3">
                         <div className="w-6 h-6 rounded shadow-[var(--neo-in)] flex items-center justify-center text-[var(--brand)]"><CheckCircle className="w-4 h-4" /></div>
                         <span className="font-medium text-sm text-[var(--text-main)]">Option 1 Selected</span>
                      </div>
                      <div className="flex items-center gap-3">
                         <div className="w-6 h-6 rounded shadow-[var(--neo-out)]"></div>
                         <span className="font-medium text-sm text-[var(--text-muted)]">Option 2 Default</span>
                      </div>
                   </div>
                </div>
                <div>
                   <div className="space-y-3">
                      <div className="flex items-center gap-3">
                         <div className="w-6 h-6 rounded-full shadow-[var(--neo-in)] flex items-center justify-center"><div className="w-3 h-3 rounded-full bg-[var(--brand)]"></div></div>
                         <span className="font-medium text-sm text-[var(--text-main)]">Radio 1</span>
                      </div>
                      <div className="flex items-center gap-3">
                         <div className="w-6 h-6 rounded-full shadow-[var(--neo-out)]"></div>
                         <span className="font-medium text-sm text-[var(--text-muted)]">Radio 2</span>
                      </div>
                   </div>
                </div>
             </div>

             <div className="space-y-8">
                <div>
                   <p className="text-[10px] font-bold text-[var(--text-muted)] mb-4 tracking-widest">SWITCH / TOGGLE</p>
                   <div className="flex items-center gap-6">
                      <div className="w-16 h-8 rounded-full shadow-[var(--neo-in)] relative flex items-center px-1">
                         <div className="w-6 h-6 rounded-full shadow-[var(--neo-out)] absolute right-1 bg-[var(--brand)]"></div>
                      </div>
                      <span className="font-bold text-sm text-[var(--brand)]">ON</span>
                   </div>
                   <div className="flex items-center gap-6 mt-4">
                      <div className="w-16 h-8 rounded-full shadow-[var(--neo-in)] relative flex items-center px-1">
                         <div className="w-6 h-6 rounded-full shadow-[var(--neo-out)] absolute left-1 bg-[var(--bg-main)]"></div>
                      </div>
                      <span className="font-bold text-sm text-[var(--text-muted)]">OFF</span>
                   </div>
                </div>

                <div>
                   <p className="text-[10px] font-bold text-[var(--text-muted)] mb-4 tracking-widest">SLIDER</p>
                   <div className="relative pt-6">
                      <div className="absolute top-0 right-4 bg-white/50 px-2 py-1 rounded shadow-[var(--neo-out)] text-[10px] font-bold text-[var(--text-main)]">75%</div>
                      <div className="h-2 w-full rounded-full shadow-[var(--neo-in)] overflow-hidden flex">
                         <div className="h-full bg-[var(--brand)] w-[75%]"></div>
                      </div>
                      <div className="absolute top-4 left-[75%] -translate-x-1/2 w-6 h-6 rounded-full bg-[var(--bg-main)] shadow-[var(--neo-out)] flex justify-center items-center">
                         <div className="w-2 h-2 rounded-full bg-[var(--brand)] shadow-[var(--neo-in)]"></div>
                      </div>
                      <div className="flex justify-between mt-3 px-1 text-[10px] font-bold text-[var(--text-muted)]">
                         <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
                      </div>
                   </div>
                </div>
             </div>
          </div>
        </section>

        {/* Data Display */}
        <section>
          <div className="flex items-center gap-4 mb-6">
            <h2 className="text-sm font-bold text-[var(--text-main)] uppercase tracking-widest">Data Display</h2>
            <div className="h-px bg-[var(--border-color)] flex-1 opacity-50 shadow-[var(--neo-in)]"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
             <div className="p-6 rounded-3xl shadow-[var(--neo-out)]">
                <div className="w-12 h-12 rounded-xl shadow-[var(--neo-in)] mb-6 flex items-center justify-center">
                   <Box className="w-5 h-5 text-[var(--brand)]" />
                </div>
                <h3 className="font-bold text-lg text-[var(--text-main)] mb-2">Product Information</h3>
                <p className="text-sm text-[var(--text-muted)] font-medium mb-6">Short description of the product and its features placed here.</p>
                <button className="px-6 py-2 rounded-full bg-[var(--brand)] text-white text-xs font-bold shadow-[var(--neo-btn)]">View More</button>
             </div>

             <div className="p-6 rounded-3xl shadow-[var(--neo-out)] space-y-4">
                {[1, 2, 3].map((i) => (
                   <div key={i} className="flex items-center gap-4 p-3 rounded-2xl shadow-[var(--neo-in)]">
                      <div className="w-10 h-10 rounded-full shadow-[var(--neo-out)] overflow-hidden border-2 border-[var(--bg-main)]">
                         <img src={`https://i.pravatar.cc/150?img=${i + 10}`} alt="avatar" className="w-full h-full object-cover" />
                      </div>
                      <div>
                         <p className="text-sm font-bold text-[var(--text-main)]">User Name {i}</p>
                         <p className="text-[10px] text-[var(--text-muted)] font-medium">Short description here</p>
                      </div>
                   </div>
                ))}
             </div>

             <div className="space-y-6">
                <div className="p-6 rounded-3xl shadow-[var(--neo-in)]">
                   <div className="flex justify-between items-center mb-6">
                      <p className="text-[10px] font-bold text-[var(--text-muted)] tracking-widest">BADGES</p>
                      <div className="flex gap-2">
                         <span className="px-3 py-1 rounded-full bg-[var(--brand)] text-white text-[10px] font-bold shadow-[var(--neo-out)]">New</span>
                         <span className="px-3 py-1 rounded-full shadow-[var(--neo-out)] text-[var(--brand)] text-[10px] font-bold">Beta</span>
                         <span className="w-6 h-6 rounded-full bg-[var(--brand)] text-white text-[10px] font-bold shadow-[var(--neo-out)] flex items-center justify-center">24</span>
                      </div>
                   </div>
                   
                   <p className="text-[10px] font-bold text-[var(--text-muted)] mb-3 tracking-widest">TOOLTIP</p>
                   <div className="inline-block px-4 py-2 rounded-xl bg-gray-700 text-white text-xs font-medium shadow-lg relative">
                      More Info
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-700 rotate-45"></div>
                   </div>
                </div>

                <div className="p-2 rounded-2xl shadow-[var(--neo-out)] flex justify-between">
                   <button className="px-6 py-2 rounded-xl shadow-[var(--neo-in)] text-[var(--text-main)] font-bold text-xs">Overview</button>
                   <button className="px-6 py-2 rounded-xl text-[var(--text-muted)] hover:shadow-[var(--neo-out)] font-medium text-xs transition-shadow">Details</button>
                   <button className="px-6 py-2 rounded-xl text-[var(--text-muted)] hover:shadow-[var(--neo-out)] font-medium text-xs transition-shadow">Settings</button>
                </div>
             </div>
          </div>
        </section>

      </div>
    </div>
  );
}
