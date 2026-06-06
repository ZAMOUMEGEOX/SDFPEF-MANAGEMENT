import React from 'react';
import { Search, MapPin, Calendar, Users, Map, SlidersHorizontal, ArrowRightLeft } from 'lucide-react';
import { useTheme } from '../../../contexts/ThemeContext';

export function DashboardFlightStyle() {
  const { transparency } = useTheme();

  return (
    <div className="flex flex-col lg:flex-row h-full overflow-hidden w-full bg-[var(--bg-main)]">
      {/* Main Content Area */}
      <div className="flex-1 p-4 md:p-8 flex flex-col no-scrollbar overflow-y-auto">
        
        {/* Top Filter Bar (like flight search) */}
        <div className="bg-[var(--bg-surface)] p-4 md:p-6 rounded-3xl shadow-sm border border-[var(--border-color)] mb-8">
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <div className="flex-1 flex items-center bg-[var(--bg-main)] rounded-full px-4 py-2 border border-[var(--border-color)]">
              <MapPin className="w-4 h-4 text-[var(--text-muted)] mr-2" />
              <input type="text" placeholder="Origine (SIEGE)" className="bg-transparent text-sm w-full focus:outline-none text-[var(--text-main)] font-semibold" value="TETOUAN (TTN)" readOnly />
              <button className="p-2 ml-2 rounded-full bg-[var(--brand)] text-white">
                <ArrowRightLeft className="w-3 h-3" />
              </button>
              <MapPin className="w-4 h-4 text-[var(--text-muted)] ml-4 mr-2" />
              <input type="text" placeholder="Destination" className="bg-transparent text-sm w-full focus:outline-none text-[var(--text-main)] font-semibold" value="AL HOCEIMA (AHU)" readOnly />
            </div>
            
            <div className="flex items-center bg-[var(--bg-main)] rounded-full px-4 py-2 border border-[var(--border-color)] w-full md:w-auto">
              <Calendar className="w-4 h-4 text-[var(--text-muted)] mr-2" />
              <span className="text-sm font-semibold text-[var(--text-main)]">29 JUILLET 2024</span>
            </div>
            
            <div className="flex items-center bg-[var(--bg-main)] rounded-full px-4 py-2 border border-[var(--border-color)] w-full md:w-auto">
              <Users className="w-4 h-4 text-[var(--text-muted)] mr-2" />
              <span className="text-sm font-semibold text-[var(--text-main)]">3 ÉQUIPES</span>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex bg-[var(--bg-main)] rounded-full p-1 border border-[var(--border-color)]">
              <button className="px-6 py-2 rounded-full bg-[var(--brand)] text-white text-xs font-bold shadow-md">URGENT</button>
              <button className="px-6 py-2 rounded-full text-[var(--text-muted)] text-xs font-bold hover:bg-[var(--bg-surface)]">PLANIFIÉ</button>
              <button className="px-6 py-2 rounded-full text-[var(--text-muted)] text-xs font-bold hover:bg-[var(--bg-surface)]">ROUTINE</button>
            </div>
            
            <button className="w-full md:w-auto px-8 py-3 rounded-full bg-amber-500 text-white font-bold tracking-widest text-sm shadow-[0_4px_15px_rgba(245,158,11,0.3)] hover:brightness-110">
              RECHERCHER
            </button>
          </div>
        </div>

        {/* Results List */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-[var(--text-muted)] font-bold tracking-widest text-xs uppercase">INTERVENTIONS (4)</h2>
            <div className="flex gap-2">
              <button className="px-4 py-1.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-main)] text-xs font-bold shadow-sm">FILTRER</button>
              <button className="px-4 py-1.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-main)] text-xs font-bold shadow-sm">NIVEAU D'ALERTE</button>
            </div>
          </div>

          <div className="space-y-4">
             {/* Ticket 1 */}
             <div className="bg-[var(--bg-surface)] rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-center justify-between border-dashed border-2 border-[var(--border-color)] relative">
                <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[var(--bg-main)] border-r-2 border-dashed border-[var(--border-color)]"></div>
                <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[var(--bg-main)] border-l-2 border-dashed border-[var(--border-color)]"></div>
                
                <div className="flex flex-col items-center">
                   <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-2">
                      <span className="text-red-500 font-bold text-xl">F</span>
                   </div>
                   <span className="text-[10px] text-[var(--text-muted)] font-bold">FEU DE FORÊT</span>
                </div>
                
                <div className="flex-1 flex justify-center items-center gap-8 mx-8 w-full py-4 md:py-0 text-center">
                   <div>
                     <p className="text-xl font-black text-[var(--text-main)] font-mono">TTN</p>
                     <p className="text-xs text-[var(--text-muted)]">13:00</p>
                   </div>
                   <div className="flex-1 max-w-[200px] border-b-2 border-dashed border-[var(--border-color)] relative flex items-center justify-center">
                     <span className="absolute -top-3 text-[10px] text-red-500 font-bold uppercase tracking-widest bg-[var(--bg-surface)] px-2">Alerte Rouge</span>
                     <span className="absolute -bottom-5 text-[10px] text-[var(--text-muted)]">Durée est. 5h 20m</span>
                   </div>
                   <div>
                     <p className="text-xl font-black text-[var(--text-main)] font-mono">AHU</p>
                     <p className="text-xs text-[var(--text-muted)]">18:20</p>
                   </div>
                </div>

                <div className="flex flex-col items-end min-w-[120px]">
                   <span className="text-xl font-black text-amber-500 mb-2">Critique</span>
                   <button className="w-full py-2.5 rounded-full bg-amber-500 text-white font-bold text-xs shadow-md shadow-amber-500/20 hover:brightness-110">
                     DÉPLOYER
                   </button>
                </div>
             </div>

             {/* Ticket 2 */}
             <div className="bg-[var(--bg-surface)] rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-center justify-between border-dashed border-2 border-[var(--border-color)] relative opacity-70">
                <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[var(--bg-main)] border-r-2 border-dashed border-[var(--border-color)]"></div>
                <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[var(--bg-main)] border-l-2 border-dashed border-[var(--border-color)]"></div>
                
                <div className="flex flex-col items-center">
                   <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-2">
                      <span className="text-emerald-600 font-bold text-xl">C</span>
                   </div>
                   <span className="text-[10px] text-[var(--text-muted)] font-bold text-center">COUPE<br/>ILLICITE</span>
                </div>
                
                <div className="flex-1 flex justify-center items-center gap-8 mx-8 w-full py-4 md:py-0 text-center">
                   <div>
                     <p className="text-xl font-black text-[var(--text-main)] font-mono">TTN</p>
                     <p className="text-xs text-[var(--text-muted)]">09:00</p>
                   </div>
                   <div className="flex-1 max-w-[200px] border-b-2 border-dashed border-[var(--border-color)] relative flex items-center justify-center">
                     <span className="absolute -top-3 text-[10px] text-emerald-600 font-bold uppercase tracking-widest bg-[var(--bg-surface)] px-2">Investigation</span>
                     <span className="absolute -bottom-5 text-[10px] text-[var(--text-muted)]">Durée est. 8h 00m</span>
                   </div>
                   <div>
                     <p className="text-xl font-black text-[var(--text-main)] font-mono">XCH</p>
                     <p className="text-xs text-[var(--text-muted)]">17:00</p>
                   </div>
                </div>

                <div className="flex flex-col items-end min-w-[120px]">
                   <span className="text-xl font-black text-[var(--text-main)] mb-2 font-mono">Normal</span>
                   <button className="w-full py-2.5 rounded-full bg-[var(--bg-main)] text-[var(--text-main)] font-bold text-xs shadow-sm hover:brightness-95 border border-[var(--border-color)]">
                     DÉTAILS
                   </button>
                </div>
             </div>
          </div>
        </div>

      </div>

      {/* Right Dark Panel */}
      <div 
         className="w-full lg:w-[380px] shrink-0 text-white p-6 md:p-8 flex flex-col justify-between"
         style={transparency > 0 ? { background: `color-mix(in srgb, var(--sidebar-bg, var(--brand)) ${100 - (transparency/2)}%, transparent)` } : { background: 'var(--sidebar-bg, var(--brand))' }}
      >
         <div>
            <div className="flex justify-between items-center mb-12">
               <div>
                  <p className="text-xs text-white/50 mb-1 tracking-widest uppercase">Départ</p>
                  <p className="text-3xl font-light">TTN</p>
               </div>
               <div className="text-white/30 font-bold text-xs">NON-STOP</div>
               <div className="text-right">
                  <p className="text-xs text-white/50 mb-1 tracking-widest uppercase">Secteur</p>
                  <p className="text-3xl font-light">AHU</p>
               </div>
            </div>

            {/* Arc Map Visualization */}
            <div className="relative w-full h-[180px] mb-12 flex justify-center">
               <div className="absolute inset-0 bg-[url('https://upload.wikimedia.org/wikipedia/commons/8/80/World_map_-_low_resolution.svg')] bg-no-repeat bg-center opacity-10 blur-[1px]"></div>
               <svg viewBox="0 0 200 100" className="w-full overflow-visible z-10">
                  <path d="M 20 80 Q 100 -20 180 80" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeDasharray="4 4" />
                  <path d="M 20 80 Q 100 -20 180 80" fill="none" stroke="#f59e0b" strokeWidth="2" />
                  <circle cx="20" cy="80" r="4" fill="#f59e0b" />
                  <circle cx="180" cy="80" r="4" fill="#f59e0b" />
                  {/* Plane / Helicopter Icon */}
                  <g transform="translate(100, 25) rotate(45)">
                     <path d="M-8,-4 L8,-4 L12,0 L8,4 L-8,4 L-4,0 Z" fill="#f59e0b" />
                  </g>
               </svg>
            </div>

            <div className="flex justify-between items-center bg-white/5 rounded-full p-2 mb-12">
               <button className="flex-1 py-3 rounded-full bg-amber-500 text-white font-bold text-xs text-center shadow-lg">DIRECT</button>
               <button className="flex-1 py-3 rounded-full text-white/50 font-bold text-xs text-center hover:text-white">EN RENFORT</button>
               <button className="flex-1 py-3 rounded-full text-white/50 font-bold text-xs text-center hover:text-white">PLUS</button>
            </div>
         </div>

         <div>
            <p className="text-xs text-white/50 mb-6 tracking-widest uppercase font-bold">NIVEAU DE DANGEROSITÉ</p>
            <div className="relative w-full h-2 bg-white/10 rounded-full mb-4">
               <div className="absolute left-[20%] right-[30%] h-full bg-amber-500 rounded-full"></div>
               <div className="absolute left-[20%] top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 border-amber-500"></div>
               <div className="absolute right-[30%] top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 border-amber-500"></div>
            </div>
            <div className="flex justify-between text-xs font-bold text-amber-500 mb-8 pt-2">
               <div className="bg-amber-500/20 px-3 py-1 rounded-md">Risque 3</div>
               <div className="bg-amber-500/20 px-3 py-1 rounded-md">Risque 5</div>
            </div>
         </div>
      </div>
    </div>
  );
}
