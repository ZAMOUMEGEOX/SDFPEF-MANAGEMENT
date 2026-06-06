import React, { useState } from 'react';
import { 
  Trees, Bird, MapPin, 
  Search, ShieldCheck, Download, ExternalLink,
  Anchor, Mountain, FileText, X, Info
} from 'lucide-react';
import { fauneData, floreData, airesData } from './data';

type Tab = 'faune' | 'flore' | 'aires' | 'lois';

export function Biodiversite() {
  const [activeTab, setActiveTab] = useState<Tab>('faune');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  return (
    <div className="p-3 md:p-8 space-y-4 md:space-y-8 bg-[#f5f8f6] min-h-full">
      {/* Header & Official Links */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-4 bg-white p-4 md:p-6 rounded-xl md:rounded-2xl border border-emerald-100 shadow-sm">
        <div>
          <h1 className="text-2xl md:text-3xl font-serif text-emerald-950 font-bold mb-2">
            Biodiversité - Tanger-Tétouan-Al Hoceïma
          </h1>
          <p className="text-sm text-emerald-700/80 font-medium max-w-2xl">
            Gestion du patrimoine naturel régional, suivi des aires protégées (Parcs Nationaux, SIBE, RAMSAR), et protection de la faune et flore endémique du Rif selon les classifications UICN et la loi 29-05 (CITES).
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto shrink-0">
          <a href="https://www.eauxetforets.gov.ma" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-700 rounded-xl hover:bg-emerald-100 transition-colors font-bold text-xs border border-emerald-200">
            <ExternalLink className="size-4" /> ANEF Officiel
          </a>
          <a href="https://www.ramsar.org" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition-colors font-bold text-xs border border-blue-200">
            <Anchor className="size-4" /> RAMSAR
          </a>
        </div>
      </div>

      <div className="flex w-full overflow-x-auto no-scrollbar gap-2 pb-2">
        <TabButton active={activeTab === 'faune'} onClick={() => setActiveTab('faune')} icon={Bird} label="Faune du Rif & de la Côte" />
        <TabButton active={activeTab === 'flore'} onClick={() => setActiveTab('flore')} icon={Trees} label="Flore & Écosystèmes Forestiers" />
        <TabButton active={activeTab === 'aires'} onClick={() => setActiveTab('aires')} icon={Mountain} label="Aires Protégées (RBIM, SIBE, Parcs)" />
        <TabButton active={activeTab === 'lois'} onClick={() => setActiveTab('lois')} icon={ShieldCheck} label="Cadre Légal & Téléchargements" />
      </div>

      {/* Search Bar - Global for faune/flore/aires */}
      {activeTab !== 'lois' && (
        <div className="relative">
          <input 
            type="text" 
            placeholder="Rechercher une espèce, un parc, une ville..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-emerald-100 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none shadow-sm transition-shadow"
          />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-emerald-400" />
        </div>
      )}

      {/* TABS CONTENT */}
      {activeTab === 'faune' && <FauneTab searchQuery={searchQuery} onSelect={setSelectedItem} />}
      {activeTab === 'flore' && <FloreTab searchQuery={searchQuery} onSelect={setSelectedItem} />}
      {activeTab === 'aires' && <AiresTab searchQuery={searchQuery} onSelect={setSelectedItem} />}
      {activeTab === 'lois' && <LoisTab />}

      {/* MODAL */}
      {selectedItem && (
        <ItemModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------
// TAB BUTTON COMPONENT
// ---------------------------------------------------------------------------------
function TabButton({ active, onClick, icon: Icon, label }: any) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-1.5 md:gap-2 whitespace-nowrap px-3 py-2 md:px-5 md:py-3 rounded-lg md:rounded-xl font-bold text-xs md:text-sm transition-all duration-200 border
        ${active 
          ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20' 
          : 'bg-white text-emerald-900 border-emerald-100 hover:bg-emerald-50'}`}
    >
      <Icon className="size-3.5 md:size-4" /> {label}
    </button>
  );
}

// ---------------------------------------------------------------------------------
// FAUNE TAB
// ---------------------------------------------------------------------------------
function FauneTab({ searchQuery, onSelect }: { searchQuery: string, onSelect: (item: any) => void }) {
  const filtered = fauneData.filter(item => 
    (item.nom + item.sci + item.darija + item.arabe).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-emerald-900 flex items-center gap-2">
          <Bird className="size-5 text-emerald-500" /> Faune du Nord (Rif, Littoral)
        </h2>
        <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-1 rounded-full font-bold">{filtered.length} Résultat(s)</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {filtered.map((item, idx) => (
          <SpeciesCard key={idx} data={item} color="sky" onClick={() => onSelect(item)} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------
// FLORE TAB
// ---------------------------------------------------------------------------------
function FloreTab({ searchQuery, onSelect }: { searchQuery: string, onSelect: (item: any) => void }) {
  const filtered = floreData.filter(item => 
    (item.nom + item.sci + item.darija + item.arabe).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-emerald-900 flex items-center gap-2">
          <Trees className="size-5 text-emerald-500" /> Flore & Peuplements Forestiers (TTA)
        </h2>
        <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-1 rounded-full font-bold">{filtered.length} Résultat(s)</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {filtered.map((item, idx) => (
          <SpeciesCard key={idx} data={item} color="emerald" onClick={() => onSelect(item)} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------
// SPECIES CARD REUSABLE
// ---------------------------------------------------------------------------------
const SpeciesCard: React.FC<{ data: any, color: 'sky' | 'emerald', onClick: () => void }> = ({ data, color, onClick }) => {
  const getUicnColor = (status: string) => {
    if (status.includes('CR')) return 'bg-rose-100 text-rose-700 border-rose-200';
    if (status.includes('EN')) return 'bg-orange-100 text-orange-700 border-orange-200';
    if (status.includes('VU')) return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = e.currentTarget;
    if (data.fallbackImg && target.src !== data.fallbackImg) {
      target.src = data.fallbackImg;
    } else if (target.src !== 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=600&q=80') {
      target.src = 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=600&q=80';
    }
  };

  return (
    <div onClick={onClick} className="bg-white rounded-2xl border border-emerald-100 overflow-hidden shadow-sm hover:shadow-xl hover:border-emerald-300 transition-all duration-300 group cursor-pointer flex flex-col">
      <div className="relative h-48 overflow-hidden bg-slate-100 flex items-center justify-center shrink-0">
        <img 
          src={data.img} 
          alt={data.nom} 
          onError={handleImageError}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
        />
        <div className={`absolute top-3 right-3 text-[10px] font-bold px-2 py-1 rounded-lg border backdrop-blur-md shadow-sm ${getUicnColor(data.uicn)}`}>
          UICN: {data.uicn}
        </div>
        <div className={`absolute bottom-3 left-3 bg-black/60 backdrop-blur-md text-white text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wider`}>
          {data.type}
        </div>
      </div>
      <div className="p-5 flex flex-col flex-1">
        <div className="flex-1">
          <h3 className="font-bold text-lg text-emerald-950 leading-tight mb-1">{data.nom}</h3>
          <p className="text-xs text-emerald-600/80 font-mono italic">{data.sci}</p>
        </div>
        
        <div className="flex items-center justify-between pt-4 mt-2 border-t border-emerald-50">
          <div className="text-right">
            <span className="block text-[10px] text-stone-400 uppercase tracking-widest font-bold">العربية</span>
            <span className="text-sm font-bold text-stone-800" dir="rtl">{data.arabe}</span>
          </div>
          <div className="text-left w-px h-6 bg-emerald-50"></div>
          <div className="text-left">
            <span className="block text-[10px] text-stone-400 uppercase tracking-widest font-bold">الدارجة</span>
            <span className="text-sm font-bold text-stone-800" dir="rtl">{data.darija}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------
// AIRES TAB (SIBE & RAMSAR & PARCS)
// ---------------------------------------------------------------------------------
function AiresTab({ searchQuery, onSelect }: { searchQuery: string, onSelect: (item: any) => void }) {
  const filtered = airesData.filter(item => 
    (item.nom + item.type + item.loc + item.desc).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-emerald-900 flex items-center gap-2">
          <Mountain className="size-5 text-emerald-500" /> Aires Protégées, SIBE & Zones Humides
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((item, idx) => (
          <div key={idx} onClick={() => onSelect(item)} className="bg-white rounded-2xl border border-emerald-100 overflow-hidden shadow-sm group hover:-translate-y-1 hover:shadow-xl hover:border-emerald-300 transition-all duration-300 cursor-pointer flex flex-col">
            <div className="h-48 overflow-hidden relative shrink-0">
              <img 
                 src={item.img} 
                 alt={item.nom} 
                 referrerPolicy="no-referrer"
                 className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                 onError={(e) => {
                    const target = e.currentTarget as HTMLImageElement;
                    if(target.src !== item.fallbackImg) {
                      target.src = item.fallbackImg;
                    }
                 }}
              />
              <div className="absolute top-3 left-3 bg-emerald-600/90 backdrop-blur text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-md uppercase tracking-wider">
                {item.type}
              </div>
            </div>
            <div className="p-6 flex flex-col flex-1">
              <h3 className="text-xl font-bold text-emerald-950 mb-2 leading-tight">{item.nom}</h3>
              <p className="text-xs text-emerald-600 font-bold mb-4 flex items-center gap-1.5">
                <MapPin className="size-3.5" /> {item.loc}
              </p>
              <p className="text-sm text-stone-600 leading-relaxed font-medium line-clamp-3">
                {item.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------
// LOIS TAB (DOWNLOAD PDFS VIEW)
// ---------------------------------------------------------------------------------
function LoisTab() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl">
       <div className="bg-white border border-emerald-100 rounded-3xl p-6 md:p-10 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
             <ShieldCheck className="w-64 h-64 text-emerald-900 pointer-events-none" />
          </div>
          
          <div className="relative z-10">
            <h2 className="text-2xl font-serif text-emerald-950 font-bold mb-4">Cadre Légal & Réglementaire National et International</h2>
            <p className="text-emerald-700/80 mb-8 max-w-3xl leading-relaxed text-sm font-medium">
              La gestion de la Faune et de la Flore s'appuie sur la loi n° 29-05 relative à la protection des espèces de flore et de faune sauvages et au contrôle de leur commerce (CITES). Téléchargez les documents officiels directement depuis les sources institutionnelles.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Loi 29-05 Card */}
              <div className="bg-emerald-50/50 border border-emerald-100 p-6 rounded-2xl hover:border-emerald-300 hover:bg-emerald-50 transition-all duration-300 group">
                <div className="size-12 bg-white rounded-xl flex items-center justify-center shadow-sm mb-4 border border-emerald-100 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <FileText className="size-6" />
                </div>
                <h3 className="font-bold text-emerald-950 text-lg mb-2">Bulletin Officiel - Loi n° 29-05</h3>
                <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-4">Lien Officiel SGG • PDF</p>
                <p className="text-sm text-emerald-700/70 mb-6 flex-1 min-h-[60px]">
                  Le texte intégral du Dahir portant promulgation de la loi n° 29-05 relative à la protection des espèces et au contrôle de leur commerce.
                </p>
                <a 
                  href="http://www.sgg.gov.ma/Portals/0/lois/Loi_29-05_Fr.pdf"
                  target="_blank" rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-emerald-200 text-emerald-700 rounded-xl font-bold text-sm hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all shadow-sm group-hover:shadow"
                >
                  <Download className="size-4" /> Télécharger le PDF (SGG)
                </a>
              </div>

              {/* CITES Annexes Card */}
              <div className="bg-amber-50/30 border border-amber-100 p-6 rounded-2xl hover:border-amber-200 hover:bg-amber-50/50 transition-all duration-300 group">
                <div className="size-12 bg-white rounded-xl flex items-center justify-center shadow-sm mb-4 border border-amber-100 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                  <FileText className="size-6" />
                </div>
                <h3 className="font-bold text-amber-950 text-lg mb-2">Annexes I, II et III (CITES)</h3>
                <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-4">Lien Officiel CITES • PDF</p>
                <p className="text-sm text-amber-700/70 mb-6 flex-1 min-h-[60px]">
                  Listes officielles et exhaustives des espèces de flore et de faune sauvages menacées d'extinction valables selon la convention de Washington.
                </p>
                <a 
                  href="https://cites.org/sites/default/files/fra/app/2022/E-Appendices-2022-06-22.pdf"
                  target="_blank" rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-amber-200 text-amber-700 rounded-xl font-bold text-sm hover:bg-amber-600 hover:text-white hover:border-amber-600 transition-all shadow-sm group-hover:shadow"
                >
                  <Download className="size-4" /> Télécharger le PDF (CITES)
                </a>
              </div>
            </div>

            <div className="mt-8 flex items-start gap-4 bg-blue-50/60 border border-blue-100 p-5 rounded-2xl text-blue-900 text-sm shadow-sm">
              <div className="p-2 bg-blue-100 rounded-lg shrink-0 text-blue-700">
                <Info className="size-5" />
              </div>
              <div className="leading-relaxed font-medium">
                <strong>Obligation Légale et Souveraineté :</strong> Tout prélèvement de la Faune ou de la Flore classées dans les annexes CITES nécessite une autorisation préalable rigoureuse (Permis CITES) délivrée exclusivement par l'Agence Nationale des Eaux et Forêts, conformément à la loi 29-05 pour préserver le patrimoine naturel marocain.
              </div>
            </div>

          </div>
       </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------
// ITEM MODAL COMPONENT (Detail View)
// ---------------------------------------------------------------------------------
function ItemModal({ item, onClose }: { item: any, onClose: () => void }) {
  if (!item) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-emerald-950/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="bg-white rounded-[2rem] w-full max-w-4xl max-h-[90dvh] overflow-hidden flex flex-col md:flex-row shadow-2xl relative animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <button 
           onClick={onClose} 
           className="absolute top-4 right-4 z-50 p-2.5 bg-black/20 hover:bg-black/40 backdrop-blur-md rounded-full text-white transition-colors border border-white/10"
        >
          <X className="size-5" />
        </button>

        {/* IMAGE SIDE */}
        <div className="md:w-[45%] h-64 md:h-auto relative bg-stone-100 shrink-0">
           <img 
             src={item.img} 
             alt={item.nom} 
             className="w-full h-full object-cover" 
             onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=600&q=80' }} 
           />
           <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent"></div>
           
           <div className="absolute bottom-6 left-6 right-6">
              <div className="inline-block bg-white/20 backdrop-blur-md border border-white/30 text-white px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-widest shadow-sm mb-3">
                 {item.type}
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-white leading-tight mb-1">{item.nom}</h2>
              {item.sci && <p className="text-emerald-100 font-mono italic opacity-90">{item.sci}</p>}
           </div>
        </div>

        {/* CONTENT SIDE */}
        <div className="md:w-[55%] p-6 md:p-8 overflow-y-auto bg-white flex flex-col">
           <div className="flex flex-wrap gap-2.5 mb-8">
             {item.uicn && (
                <span className="px-3.5 py-1.5 bg-rose-50 text-rose-700 rounded-xl text-xs font-bold border border-rose-100 shadow-sm flex items-center gap-1.5">
                   <ShieldCheck className="size-3.5" /> UICN: {item.uicn}
                </span>
             )}
             {item.loc && (
                <span className="px-3.5 py-1.5 bg-sky-50 text-sky-700 rounded-xl text-xs font-bold border border-sky-100 shadow-sm flex items-center gap-1.5">
                   <MapPin className="size-3.5" /> {item.loc}
                </span>
             )}
           </div>

           {(item.arabe || item.darija) && (
             <div className="bg-emerald-50/50 rounded-2xl p-5 mb-8 grid grid-cols-2 gap-4 border border-emerald-100/60 relative">
                {item.arabe && (
                 <div className="text-right">
                   <p className="text-[10px] text-emerald-600/70 font-bold uppercase tracking-widest mb-1.5">Nom en Arabe</p>
                   <p className="font-bold text-emerald-950 text-xl" dir="rtl">{item.arabe}</p>
                 </div>
                )}
                {item.darija && (
                 <div className="text-left border-l border-emerald-100 pl-4">
                   <p className="text-[10px] text-emerald-600/70 font-bold uppercase tracking-widest mb-1.5">Nom Vernaculaire</p>
                   <p className="font-bold text-emerald-950 text-lg" dir="rtl">{item.darija}</p>
                 </div>
                )}
             </div>
           )}

           <div className="prose prose-sm text-stone-600 leading-relaxed font-medium">
             <h3 className="text-emerald-950 font-bold text-lg mb-3">Description & Écologie</h3>
             <p className="mb-4">
               {item.desc || "Aucune description détaillée n'est disponible pour le moment. L'inventaire de la biodiversité régionale est en cours de mise à jour continue."}
             </p>
             <p className="bg-stone-50 p-4 rounded-xl text-xs font-bold border border-stone-100 italic">
               Note: Fiche issue de la base de données ANEF - Direction Régionale TTA. Les statuts de protection sont sujets à évolution réglementaire.
             </p>
           </div>
           
           <div className="mt-8 pt-6 border-t border-stone-100 flex gap-3 mt-auto">
             <button onClick={onClose} className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold py-3.5 rounded-xl transition-all text-center flex items-center justify-center gap-2">
                Fermer la fiche
             </button>
             <button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-sm hover:shadow text-center flex items-center justify-center gap-2">
                <FileText className="size-4" /> Rapport lié
             </button>
           </div>
        </div>
      </div>
    </div>
  );
}
