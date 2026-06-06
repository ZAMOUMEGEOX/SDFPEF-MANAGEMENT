import React, { useState, useEffect, useRef } from 'react';
import { Search, Map as MapIcon, Scale, ShieldAlert, Leaf, Satellite, Gavel, X, AlertCircle, FileText, User } from 'lucide-react';
import Fuse from 'fuse.js';

export function GlobalSearchModal({ isOpen, onClose, onSelect }: { isOpen: boolean, onClose: () => void, onSelect: (route: string, item: any) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Aggregate Data
  const [searchIndex, setSearchIndex] = useState<any[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    const aggregated = [];

    // Navigation Routes
    aggregated.push(
      { type: 'route', route: 'dashboard', title: 'Tableau de Bord', icon: 'Dashboard', desc: 'Vue globale et métriques' },
      { type: 'route', route: 'domaine', title: 'Domaine Forestier', icon: 'MapIcon', desc: 'Cartographie et gestion du territoire' },
      { type: 'route', route: 'contentieux', title: 'Contentieux', icon: 'Scale', desc: 'Suivi des affaires juridiques, Mahakim' },
      { type: 'route', route: 'police', title: 'Police Forestière', icon: 'ShieldAlert', desc: 'Infractions, rondes et patrouilles' },
      { type: 'route', route: 'biodiversite', title: 'Biodiversité', icon: 'Leaf', desc: 'Faune, flore et zones protégées' },
      { type: 'route', route: 'teledetection', title: 'Télédétection', icon: 'Satellite', desc: 'Analyse satellitaire et IA' },
      { type: 'route', route: 'drone', title: 'Nouvelles Technologies', icon: 'Drone', desc: 'Drone 3D et IoT' }
    );

    // Cases (Contentieux)
    try {
      const savedCases = localStorage.getItem('anef_cases');
      if (savedCases) {
        const cases = JSON.parse(savedCases);
        cases.forEach((c: any) => {
          aggregated.push({
            type: 'case',
            route: 'contentieux',
            title: `Dossier: ${c.subject}`,
            id: c.id,
            mahakimId: c.mahakimId,
            desc: `Type: ${c.type} | Cour: ${c.court} | Statut: ${c.status}`,
            defendant: c.defendant,
            parties: c.parties?.map((p: any) => p.name).join(', ') || ''
          });
        });
      }
    } catch(e) {}

    // Mock Domain Data
    aggregated.push(
      { type: 'domain', route: 'domaine', title: 'Forêt de Maamora', desc: 'Secteur 4 - Rabat-Salé-Kénitra', id: 'DOM-001' },
      { type: 'domain', route: 'domaine', title: 'Parc National d\'Ifrane', desc: 'Cèdre de l\'Atlas - Moyen Atlas', id: 'DOM-002' },
      { type: 'police', route: 'police', title: 'Infraction #PF-2024-88', desc: 'Déboisement non autorisé constaté par Drone', id: 'PF-001' }
    );

    setSearchIndex(aggregated);
  }, [isOpen]);

  // Perform Fuzzy Search
  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }

    const fuse = new Fuse(searchIndex, {
      keys: ['title', 'desc', 'route', 'id', 'mahakimId', 'defendant', 'parties'],
      threshold: 0.4, // Typos tolerance
      includeScore: true,
    });

    const rs = fuse.search(query).map(r => r.item);
    setResults(rs);
  }, [query, searchIndex]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-20 px-4 bg-black/50 backdrop-blur-sm transition-all" onClick={onClose}>
      <div 
        className="w-full max-w-2xl bg-[var(--bg-surface)] rounded-2xl shadow-2xl overflow-hidden border border-[var(--border-color)] animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        <div className="p-4 border-b border-[var(--border-color)] flex items-center gap-3">
          <Search className="w-6 h-6 text-[var(--brand)]" />
          <input 
            ref={inputRef}
            type="text" 
            placeholder="ابحث عن ملف، اسم مدعى عليه، قسم، منطقة..." 
            className="flex-1 bg-transparent border-none outline-none text-lg text-[var(--text-main)] placeholder-[var(--text-muted)]"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <button onClick={onClose} className="p-2 bg-[var(--bg-main)] rounded-xl hover:bg-stone-200 text-[var(--text-muted)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto no-scrollbar">
          {query.length === 0 ? (
            <div className="p-12 text-center text-[var(--text-muted)]">
               <Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
               <p className="font-bold text-lg mb-1">ابحث في جميع أقسام المنصة</p>
               <p className="text-sm">يدعم البحث الأخطاء الإملائية والبحث المعمق في أسماء المتهمين والملفات</p>
            </div>
          ) : results.length === 0 ? (
            <div className="p-12 text-center text-[var(--text-muted)]">
               <AlertCircle className="w-12 h-12 mx-auto mb-4 text-orange-400 opacity-50" />
               <p className="font-bold text-lg mb-1">لم يتم العثور على نتائج</p>
               <p className="text-sm">جرب كلمات مفتاحية مختلفة</p>
            </div>
          ) : (
            <div className="p-2 space-y-2">
              {results.map((res, i) => (
                <button 
                  key={i}
                  onClick={() => {
                    onSelect(res.route, res);
                    setTimeout(() => {
                        window.dispatchEvent(new CustomEvent('searchItemSelected', { detail: res }));
                    }, 50);
                    onClose();
                  }}
                  className="w-full flex items-start gap-4 p-4 text-right rounded-xl hover:bg-[var(--brand-light)] transition-colors group"
                >
                  <div className="w-10 h-10 shrink-0 bg-[var(--bg-main)] rounded-full flex items-center justify-center text-[var(--brand)] group-hover:bg-[var(--brand)] group-hover:text-white transition-colors">
                    {res.type === 'route' && <MapIcon className="w-5 h-5" />}
                    {res.type === 'case' && <Scale className="w-5 h-5" />}
                    {res.type === 'domain' && <Leaf className="w-5 h-5" />}
                    {res.type === 'police' && <ShieldAlert className="w-5 h-5" />}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-[var(--text-main)] flex items-center gap-2">
                      {res.title}
                      {res.id && <span className="text-[10px] font-mono bg-[var(--bg-main)] px-2 py-0.5 rounded text-[var(--text-muted)]">{res.id}</span>}
                    </h4>
                    <p className="text-sm text-[var(--text-muted)] mt-1">{res.desc}</p>
                    {(res.defendant || res.parties) && (
                      <div className="flex items-center gap-2 mt-2 text-xs font-bold text-amber-600 bg-amber-50 self-start px-2 py-1 rounded inline-flex">
                        <User className="w-3 h-3" />
                        الأطراف: {res.defendant || res.parties}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
