import React, { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { Monitor, Moon, Sun, Palette, LayoutTemplate, Layout, Settings as SettingsIcon, Activity, Eye, Shield, KeyRound, User as UserIcon, Bell, Sparkles, Layers, Box, CheckCircle, MapPin, Navigation, Download } from 'lucide-react';

export function Settings() {
  const { theme, color, mode, layout, transparency, setTheme, setColor, setMode, setLayout, setTransparency } = useTheme();
  const [activeTab, setActiveTab] = useState<'appearance' | 'security' | 'profile' | 'ux' | 'gps'>('appearance');

  const [gpsOffsetLat, setGpsOffsetLat] = useState<string>(localStorage.getItem('gps_offset_lat') || '0');
  const [gpsOffsetLng, setGpsOffsetLng] = useState<string>(localStorage.getItem('gps_offset_lng') || '0');
  const [gpsStatus, setGpsStatus] = useState<{type: 'success' | 'error', msg: string} | null>(null);

  const saveGpsOffsets = () => {
    localStorage.setItem('gps_offset_lat', gpsOffsetLat);
    localStorage.setItem('gps_offset_lng', gpsOffsetLng);
    
    try {
      const existingLogs = JSON.parse(localStorage.getItem('gps_calibration_logs') || '[]');
      existingLogs.push({
        date: new Date().toISOString(),
        offsetLat: gpsOffsetLat,
        offsetLng: gpsOffsetLng
      });
      localStorage.setItem('gps_calibration_logs', JSON.stringify(existingLogs));
    } catch(e) {
      console.error(e);
    }

    setGpsStatus({ type: 'success', msg: 'Calibration GPS enregistrée avec succès.' });
    setTimeout(() => setGpsStatus(null), 3000);
  };

  const exportGpsLogs = () => {
    try {
      const logs = JSON.parse(localStorage.getItem('gps_calibration_logs') || '[]');
      if (logs.length === 0) {
        setGpsStatus({ type: 'error', msg: 'Aucun journal de calibration disponible.' });
        setTimeout(() => setGpsStatus(null), 3000);
        return;
      }
      
      let csvContent = "Date,Offset Latitude,Offset Longitude\n";
      logs.forEach((log: any) => {
        csvContent += `${new Date(log.date).toLocaleString()},${log.offsetLat},${log.offsetLng}\n`;
      });
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "journal_calibration_gps.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Optional: show a message
      setGpsStatus({ type: 'success', msg: 'Journal exporté avec succès.' });
      setTimeout(() => setGpsStatus(null), 3000);
    } catch(e) {
      console.error(e);
      setGpsStatus({ type: 'error', msg: 'Erreur lors de l\'exportation.' });
      setTimeout(() => setGpsStatus(null), 3000);
    }
  };

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<{type: 'success' | 'error', msg: string} | null>(null);

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: 'error', msg: 'Les nouveaux mots de passe ne correspondent pas.' });
      return;
    }
    if (oldPassword === newPassword) {
      setPasswordStatus({ type: 'error', msg: 'Le nouveau mot de passe doit être différent de l\'ancien.' });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordStatus({ type: 'error', msg: 'Le mot de passe doit contenir au moins 8 caractères.' });
      return;
    }
    
    // Simulate API call
    setTimeout(() => {
      setPasswordStatus({ type: 'success', msg: 'Mot de passe modifié avec succès.' });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }, 800);
  };

  const sportColors = [
    { id: 'default', name: 'Par défaut (Lié au Template)', hex: '#888888', gradient: 'linear-gradient(90deg, #888 0%, #aaa 100%)' },
    { id: 'rog', name: 'ROG Strix (Rouge)', hex: '#e11d48', gradient: 'linear-gradient(90deg, #9f1239 0%, #e11d48 50%, #fb7185 100%)' },
    { id: 'tuf', name: 'TUF Gaming (Ambre)', hex: '#f59e0b', gradient: 'linear-gradient(90deg, #b45309 0%, #f59e0b 50%, #fcd34d 100%)' },
    { id: 'prime', name: 'Asus Prime (Cyan)', hex: '#06b6d4', gradient: 'linear-gradient(90deg, #0e7490 0%, #06b6d4 50%, #67e8f9 100%)' },
    { id: 'proart', name: 'ProArt (Bronze)', hex: '#b45309', gradient: 'linear-gradient(90deg, #78350f 0%, #b45309 50%, #fcd34d 100%)' },
  ];

  const ecoColors = [
    { id: 'default', name: 'Par défaut (Par défaut)', hex: '#888888', gradient: 'linear-gradient(90deg, #888 0%, #aaa 100%)' },
    { id: 'anef', name: 'Original ANEF', hex: '#153128', gradient: 'linear-gradient(90deg, #0f241d 0%, #153128 50%, #2a6150 100%)' },
    { id: 'ecopro', name: 'Eco Pro (Émeraude)', hex: '#059669', gradient: 'linear-gradient(90deg, #065f46 0%, #059669 50%, #34d399 100%)' },
    { id: 'biodiversite', name: 'Nature (Vert Vibrant)', hex: '#16a34a', gradient: 'linear-gradient(90deg, #166534 0%, #16a34a 50%, #4ade80 100%)' },
    { id: 'forest', name: 'Deep Forest', hex: '#1B4332', gradient: 'linear-gradient(90deg, #081c15 0%, #1b4332 30%, #2d6a4f 60%, #40916c 80%, #52b788 100%)' },
    { id: 'teal', name: 'Teal Clean', hex: '#0F766E', gradient: 'linear-gradient(90deg, #115e59 0%, #0f766e 50%, #5eead4 100%)' },
    { id: 'dark-slate', name: 'Dark Slate Green', hex: '#243A3A', gradient: 'linear-gradient(90deg, #182727 0%, #243a3a 50%, #5d8c8c 100%)' },
    { id: 'olive', name: 'Olive Green', hex: '#40513C', gradient: 'linear-gradient(90deg, #2b3828 0%, #40513c 30%, #587052 60%, #76936e 100%)' },
    { id: 'mint', name: 'Mint Fresh', hex: '#7AC59D', gradient: 'linear-gradient(90deg, #45b39d 0%, #7ac59d 30%, #a3e4d7 60%, #d1f2eb 100%)' },
    { id: 'pastel-green', name: 'Pastel Neumorphic', hex: '#A3D9C9', gradient: 'linear-gradient(90deg, #8bc3b1 0%, #a3d9c9 50%, #c4ebd9 100%)' },
  ];

  const neutralColors = [
    { id: 'default', name: 'Par défaut (Lié au Template)', hex: '#888888', gradient: 'linear-gradient(90deg, #888 0%, #aaa 100%)' },
    { id: 'admin', name: 'Admin (Gris Anthracite)', hex: '#334155', gradient: 'linear-gradient(90deg, #1e293b 0%, #334155 50%, #64748b 100%)' },
    { id: 'white', name: 'Minimal (Noir/Blanc)', hex: '#171717', gradient: 'linear-gradient(90deg, #000 0%, #171717 50%, #737373 100%)' },
    { id: 'soft-mint', name: 'Soft Gray Mint', hex: '#E5E7EB', gradient: 'linear-gradient(90deg, #d1d5db 0%, #e5e7eb 50%, #f3f4f6 100%)' },
    { id: 'mustard-gold', name: 'Mustard Gold', hex: '#B18F2D', gradient: 'linear-gradient(90deg, #8a6d1c 0%, #b18f2d 50%, #fcd34d 100%)' },
    { id: 'monochrome-silver', name: 'Silver Monochrome', hex: '#94A3B8', gradient: 'linear-gradient(90deg, #64748b 0%, #94a3b8 50%, #cbd5e1 100%)' },
  ];

  const activeColors = theme === 'sport' ? sportColors : 
                       (theme === 'anef' || theme === 'ecopro' || theme === 'biodiversite' || theme === 'default' || theme === 'eco-glass' || theme === 'nexus' || theme === 'corporate-green' || theme === 'translucent-glass' || theme === 'dashboard-light' || theme === 'shopland-minimal' || theme === 'teal-gradient') ? ecoColors : neutralColors;

  const fullTemplates = [
    { name: 'TalentSync HR', theme: 'dashboard-light', layout: 'topbar', desc: 'Header profond, cartes blanches propres (Flat UI)', icon: LayoutTemplate },
    { name: 'Eco-Green Glassmorphism', theme: 'translucent-glass', layout: 'floating', desc: 'Glassmorphism sur fond dégradé profond', icon: Palette },
    { name: 'SoftTech Corporate', theme: 'corporate-green', layout: 'sidebar', desc: 'Neumorphism léger, fond pastel', icon: Layout },
    { name: 'Pastel Neumorphism', theme: 'neumorphic-clean', layout: 'sidebar', desc: 'Style Neumorphism / Claymorphism doux', icon: Palette },
    { name: 'ShopLand Minimal', theme: 'shopland-minimal', layout: 'sidebar', desc: 'Design e-commerce, gris et vert sauge', icon: Layout },
    { name: 'Teal Gradient Data', theme: 'teal-gradient', layout: 'topbar', desc: 'Dégradé émeraude, riche en contrastes', icon: Monitor },
    { name: 'Slate & Gold Flight', theme: 'flight-minimal', layout: 'topbar', desc: 'Gris et or, minimaliste, arrondi', icon: Layout },
    { name: 'Monochromatic Admin', theme: 'monochromatic-admin', layout: 'floating', desc: 'Gris ultra-minimaliste, verre glacé', icon: Palette },
    { name: 'Haute Performance', theme: 'sport', layout: 'compact', desc: 'Style Armoury Crate, ultra-tech', icon: Activity },
    { name: 'Centre de Commandement', theme: 'command-center', layout: 'compact', desc: 'Néon, futuriste, idéal dashboard', icon: Monitor },
    { name: 'Nexus Analytics', theme: 'nexus', layout: 'sidebar', desc: 'Interface analytique claire', icon: Monitor },
    { name: 'Officiel ANEF', theme: 'anef', layout: 'sidebar', desc: 'Le thème institutionnel ANEF original', icon: LayoutTemplate },
    { name: 'Eco Pro (Standard)', theme: 'ecopro', layout: 'sidebar', desc: 'Interface de gestion émeraude', icon: LayoutTemplate },
    { name: 'Biodiversité', theme: 'biodiversite', layout: 'topbar', desc: 'Navigation rapide et nature dynamique', icon: Layout },
    { name: 'Assistant Minimal', theme: 'white', layout: 'floating', desc: 'Expérience épurée sans distraction', icon: SettingsIcon }
  ];

  const uxArchitectures = [
    { name: '1. GeoAI Glassmorphism', theme: 'ux-glass-float', layout: 'floating', desc: 'Menu flottant zجاجي (Glassmorphism), capsule blanche.', icon: Palette },
    { name: '2. Administration Centrale', theme: 'ux-framed-solid', layout: 'sidebar', desc: 'Conteneur massif encadré, menu inversé, ombres douces.', icon: Monitor },
    { name: '3. Intervention Terrain', theme: 'ux-field-agent', layout: 'sidebar', desc: 'Menu très fin, bouton circulaire débordant, vue détaillée.', icon: Layout },
    { name: '4. Analytique Intensive', theme: 'ux-high-density', layout: 'sidebar', desc: 'Fond dégradé teal, bordure fine pour sélection.', icon: Activity },
    { name: '5. Monitoring Sectoriel', theme: 'ux-split-panel-anchor', layout: 'sidebar', desc: 'Sélection Seamless (inversé), tons slate et gold.', icon: LayoutTemplate },
    { name: '6. Warm Neumorphic System', theme: 'ux-neumorphic-warm', layout: 'sidebar', desc: 'Beige canvas, deep teal accents, inset/outset shadows.', icon: Layers },
    { name: '7. Matte Claymorphism Kit', theme: 'ux-claymorphism-matte', layout: 'sidebar', desc: 'Cool grey, chunky pastel 3D elements, thick elevation.', icon: Box }
  ];

  const applyTemplate = (t: any) => {
    setTheme(t.theme);
    setLayout(t.layout);
    setColor('default'); // Reset custom color to let the template's native color show
  };

  const renderTemplateCard = (tpl: any, i: number) => {
    const Icon = tpl.icon;
    const isActive = theme === tpl.theme && layout === tpl.layout;
    const colorsForTheme = tpl.theme === 'sport' ? sportColors : 
                           (tpl.theme === 'anef' || tpl.theme === 'ecopro' || tpl.theme === 'biodiversite' || tpl.theme === 'nexus' || tpl.theme === 'eco-glass' || tpl.theme === 'default' || tpl.theme === 'dashboard-light' || tpl.theme === 'corporate-green' || tpl.theme === 'translucent-glass' || tpl.theme === 'shopland-minimal' || tpl.theme === 'teal-gradient') ? ecoColors : neutralColors;

    return (
      <div key={i} className={`flex flex-col rounded-2xl border-2 transition-all ${isActive ? 'border-[var(--brand)] shadow-lg bg-[var(--brand-light)]' : 'border-[var(--border-color)] surface-card hover:border-[var(--brand)]'}`}>
        <button
          onClick={() => applyTemplate(tpl)}
          className="flex items-center gap-4 p-5 text-left"
        >
          <div className={`p-3 rounded-xl ${isActive ? 'bg-[var(--brand)] text-white' : 'bg-black/5 dark:bg-white/5 text-[var(--text-main)]'}`}>
            <Icon className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold">{tpl.name}</h3>
            <p className="text-sm text-[var(--text-muted)] line-clamp-1">{tpl.desc}</p>
          </div>
          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isActive ? 'border-[var(--brand)]' : 'border-[var(--border-color)]'}`}>
            {isActive && <div className="w-2 h-2 rounded-full bg-[var(--brand)]" />}
          </div>
        </button>
        
        {isActive && (
          <div className="px-5 pb-5 pt-0 animate-in slide-in-from-top-2">
            <div className="h-px bg-gradient-to-r from-transparent via-[var(--border-color)] to-transparent w-full mb-4"></div>
            <p className="text-xs uppercase tracking-widest text-[var(--text-muted)] font-bold mb-3">Variantes de couleur</p>
            <div className="flex flex-wrap gap-2">
               {colorsForTheme.map(c => (
                  <button
                     key={c.id}
                     onClick={(e) => { e.stopPropagation(); setColor(c.id as any); }}
                     className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-transform hover:scale-110 ${color === c.id ? 'border-[var(--brand)] scale-110' : 'border-transparent shadow-sm'}`}
                     style={{ background: c.gradient || c.hex }}
                     title={c.name}
                  >
                     {color === c.id && <div className="w-2.5 h-2.5 rounded-full bg-white shadow-sm"></div>}
                  </button>
               ))}
            </div>
          </div>
        )}
      </div>
    );
  };


  return (
    <div className="h-full overflow-y-auto bg-[var(--bg-main)] custom-scrollbar">
      <div className="max-w-4xl mx-auto p-8 space-y-12">
        <div>
          <h1 className="text-3xl font-bold mb-2">Paramètres de l'application</h1>
          <p className="text-[var(--text-muted)]">Personnalisez l'apparence et le comportement de votre environnement de travail.</p>
        </div>

        {/* Tabs System */}
        <div className="flex space-x-1 border-b border-[var(--border-color)] mb-8 overflow-x-auto no-scrollbar">
          <button 
            onClick={() => setActiveTab('appearance')}
            className={`flex items-center gap-2 px-5 py-3 border-b-2 font-bold whitespace-nowrap transition-colors ${activeTab === 'appearance' ? 'border-[var(--brand)] text-[var(--brand)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
          >
            <Palette className="w-4 h-4" /> Apparence
          </button>
          <button 
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-2 px-5 py-3 border-b-2 font-bold whitespace-nowrap transition-colors ${activeTab === 'security' ? 'border-[var(--brand)] text-[var(--brand)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
          >
            <Shield className="w-4 h-4" /> Sécurité & Accès
          </button>
          <button 
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-2 px-5 py-3 border-b-2 font-bold whitespace-nowrap transition-colors ${activeTab === 'profile' ? 'border-[var(--brand)] text-[var(--brand)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
          >
            <UserIcon className="w-4 h-4" /> Profil Utilisateur
          </button>
          <button 
            onClick={() => setActiveTab('ux')}
            className={`flex items-center gap-2 px-5 py-3 border-b-2 font-bold whitespace-nowrap transition-colors ${activeTab === 'ux' ? 'border-[var(--brand)] text-[var(--brand)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
          >
            <Sparkles className="w-4 h-4" /> User Experience
          </button>
        </div>

        {/* Global Save Button */}
        <div className="flex justify-end mb-6">
          <button 
            onClick={() => {
               // In a real app we'd save to the backend for the multi-user system.
               // Here we just trigger a UI feedback.
               alert("Vos préférences d'interface ont été enregistrées avec succès dans votre profil utilisateur ! Elles seront appliquées lors de vos prochaines connexions.");
            }}
            className="flex items-center gap-2 bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white px-5 py-2.5 rounded-lg font-bold transition-all shadow-md transform hover:scale-105"
          >
            <CheckCircle className="w-5 h-5" /> Sauvegarder ma configuration
          </button>
        </div>

        {activeTab === 'ux' && (
          <div className="space-y-12 animate-in fade-in duration-300">
             <section className="space-y-6">
               <div className="flex items-center gap-3 border-b border-[var(--border-color)] pb-3">
                 <Sparkles className="w-6 h-6 text-[var(--brand)]" />
                 <h2 className="text-xl font-semibold">Architectures UX Expérimentales</h2>
               </div>
               <p className="text-sm text-[var(--text-muted)] mb-6">Explorez ces 8 nouvelles dispositions structurelles de tableaux de bord issues d'études ergonomiques avancées. Chaque template est une refonte radicale de l'interface.</p>
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {uxArchitectures.map((tpl, i) => renderTemplateCard(tpl, i))}
               </div>
             </section>
          </div>
        )}

        {activeTab === 'appearance' && (
          <div className="space-y-12 animate-in fade-in duration-300">
            <section className="space-y-6">
              <div className="flex items-center gap-3 border-b border-[var(--border-color)] pb-3">
               <LayoutTemplate className="w-6 h-6 text-[var(--brand)]" />
               <h2 className="text-xl font-semibold">Expériences Méta (Templates Complets)</h2>
              </div>
              <p className="text-sm text-[var(--text-muted)] mb-6">Changez complètement le design de l'application (Disposition, Menu et Couleurs d'un seul clic).</p>
          
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {fullTemplates.map((tpl, i) => renderTemplateCard(tpl, i))}
              </div>
            </section>

        <section className="space-y-6">
          <div className="flex items-center gap-3 border-b border-[var(--border-color)] pb-3">
            <Layout className="w-6 h-6 text-[var(--brand)]" />
            <h2 className="text-xl font-semibold">1. Disposition de la Navigation</h2>
          </div>
          
          <div className="flex flex-wrap gap-4">
             <button
                onClick={() => setLayout('sidebar')}
                className={`flex-1 min-w-[150px] flex flex-col items-center p-6 rounded-2xl border-2 transition-all ${layout === 'sidebar' ? 'border-[var(--brand)] bg-[var(--brand-light)]' : 'border-[var(--border-color)] surface-card hover:border-[var(--brand)]'}`}
              >
                <div className="w-full h-12 bg-black/5 dark:bg-white/5 rounded pl-2 flex mb-3 border border-transparent">
                  <div className="h-full w-4 bg-[var(--brand)] rounded-sm"></div>
                </div>
                <span className="font-semibold text-sm">Barre Latérale</span>
             </button>
             <button
                onClick={() => setLayout('topbar')}
                className={`flex-1 min-w-[150px] flex flex-col items-center p-6 rounded-2xl border-2 transition-all ${layout === 'topbar' ? 'border-[var(--brand)] bg-[var(--brand-light)]' : 'border-[var(--border-color)] surface-card hover:border-[var(--brand)]'}`}
              >
                <div className="w-full h-12 bg-black/5 dark:bg-white/5 rounded pt-1 flex flex-col mb-3">
                  <div className="h-3 w-full bg-[var(--brand)] rounded-sm"></div>
                </div>
                <span className="font-semibold text-sm">Barre Supérieure</span>
             </button>
             <button
                onClick={() => setLayout('compact')}
                className={`flex-1 min-w-[150px] flex flex-col items-center p-6 rounded-2xl border-2 transition-all ${layout === 'compact' ? 'border-[var(--brand)] bg-[var(--brand-light)]' : 'border-[var(--border-color)] surface-card hover:border-[var(--brand)]'}`}
              >
                <div className="w-full h-12 bg-black/5 dark:bg-white/5 rounded pl-1 flex mb-3 gap-1">
                  <div className="h-full w-2 bg-[var(--brand)] rounded-sm"></div>
                  <div className="h-full flex-1 flex flex-col gap-1 py-1 pr-1">
                    <div className="h-2 w-full bg-black/10 dark:bg-white/20 rounded-sm"></div>
                    <div className="h-2 w-full bg-[var(--brand)] opacity-50 rounded-sm"></div>
                  </div>
                </div>
                <span className="font-semibold text-sm">Compact (Nexus)</span>
             </button>
             <button
                onClick={() => setLayout('floating')}
                className={`flex-1 min-w-[150px] flex flex-col items-center p-6 rounded-2xl border-2 transition-all ${layout === 'floating' ? 'border-[var(--brand)] bg-[var(--brand-light)]' : 'border-[var(--border-color)] surface-card hover:border-[var(--brand)]'}`}
              >
                <div className="w-full h-12 bg-transparent rounded flex items-end justify-center mb-3">
                  <div className="h-4 w-3/4 bg-[var(--brand)] rounded-full shadow-lg"></div>
                </div>
                <span className="font-semibold text-sm">Dock Flottant</span>
             </button>
             <button
                onClick={() => setLayout('bottom')}
                className={`flex-1 min-w-[150px] flex flex-col items-center p-6 rounded-2xl border-2 transition-all ${layout === 'bottom' ? 'border-[var(--brand)] bg-[var(--brand-light)]' : 'border-[var(--border-color)] surface-card hover:border-[var(--brand)]'}`}
              >
                <div className="w-full h-12 bg-black/5 dark:bg-white/5 rounded pb-1 flex flex-col justify-end mb-3">
                  <div className="h-4 w-full bg-[var(--brand)] rounded-sm"></div>
                </div>
                <span className="font-semibold text-sm">Barre Inférieure</span>
             </button>
          </div>
        </section>
        
        <section className="space-y-6">
          <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
            <div className="flex items-center gap-3">
              <Eye className="w-6 h-6 text-[var(--brand)]" />
              <h2 className="text-xl font-semibold">2. Effets de Transparence</h2>
            </div>
            <span className="font-mono text-sm font-bold text-[var(--brand)]">{transparency}%</span>
          </div>
          <p className="text-sm text-[var(--text-muted)]">Ajustez le niveau de transparence (Glassmorphism) pour la barre latérale et les cartes.</p>
          
          <div className="pt-4">
            <input 
              type="range" 
              min="0" 
              max="50" 
              step="5"
              value={transparency} 
              onChange={(e) => setTransparency(parseInt(e.target.value))}
              className="w-full h-2 bg-stone-200 dark:bg-stone-800 rounded-lg appearance-none cursor-pointer accent-[var(--brand)]"
            />
            <div className="flex justify-between text-xs text-[var(--text-muted)] mt-2 font-medium">
              <span>0% (Opaque, Recommandé)</span>
              <span>50% (Semi-transparent)</span>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex items-center gap-3 border-b border-[var(--border-color)] pb-3">
            <Monitor className="w-6 h-6 text-[var(--brand)]" />
            <h2 className="text-xl font-semibold">3. Mode d'affichage</h2>
          </div>
          
          <div className="flex gap-4">
             <button
                onClick={() => setMode('light')}
                className={`flex-1 flex flex-col items-center p-6 rounded-2xl border-2 transition-all ${mode === 'light' ? 'border-[var(--brand)] bg-[var(--brand-light)]' : 'border-[var(--border-color)] surface-card hover:border-[var(--brand)]'}`}
              >
                <Sun className={`w-8 h-8 mb-3 ${mode === 'light' ? 'text-[var(--brand)]' : 'text-[var(--text-muted)]'}`} />
                <span className="font-semibold">Clair</span>
             </button>
             <button
                onClick={() => setMode('dark')}
                className={`flex-1 flex flex-col items-center p-6 rounded-2xl border-2 transition-all ${mode === 'dark' ? 'border-[var(--brand)] bg-[var(--brand-light)]' : 'border-[var(--border-color)] surface-card hover:border-[var(--brand)]'}`}
              >
                <Moon className={`w-8 h-8 mb-3 ${mode === 'dark' ? 'text-[var(--brand)]' : 'text-[var(--text-muted)]'}`} />
                <span className="font-semibold">Sombre</span>
             </button>
             <button
                onClick={() => setMode('system')}
                className={`flex-1 flex flex-col items-center p-6 rounded-2xl border-2 transition-all ${mode === 'system' ? 'border-[var(--brand)] bg-[var(--brand-light)]' : 'border-[var(--border-color)] surface-card hover:border-[var(--brand)]'}`}
              >
                <Monitor className={`w-8 h-8 mb-3 ${mode === 'system' ? 'text-[var(--brand)]' : 'text-[var(--text-muted)]'}`} />
                <span className="font-semibold">Système</span>
             </button>
          </div>
        </section>
          </div>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <div className="space-y-12 animate-in fade-in duration-300">
            <section className="space-y-6">
              <div className="flex items-center gap-3 border-b border-[var(--border-color)] pb-3">
                <KeyRound className="w-6 h-6 text-[var(--brand)]" />
                <h2 className="text-xl font-semibold">Changement de mot de passe</h2>
              </div>
              
              <form onSubmit={handlePasswordChange} className="max-w-md space-y-5">
                {passwordStatus && (
                  <div className={`p-4 rounded-xl border-l-4 text-sm font-medium ${passwordStatus.type === 'error' ? 'bg-red-500/10 border-red-500 text-red-600 dark:text-red-400' : 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400'}`}>
                    {passwordStatus.msg}
                  </div>
                )}
                
                <div className="space-y-2">
                  <label className="text-sm font-bold text-[var(--text-main)] block">Ancien mot de passe</label>
                  <input 
                    type="password" 
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    required
                    className="w-full bg-transparent border-2 border-[var(--border-color)] rounded-xl px-4 py-3 focus:outline-none focus:border-[var(--brand)] transition-colors"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-bold text-[var(--text-main)] block">Nouveau mot de passe</label>
                  <input 
                    type="password" 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    className="w-full bg-transparent border-2 border-[var(--border-color)] rounded-xl px-4 py-3 focus:outline-none focus:border-[var(--brand)] transition-colors"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-bold text-[var(--text-main)] block">Confirmer le nouveau mot de passe</label>
                  <input 
                    type="password" 
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="w-full bg-transparent border-2 border-[var(--border-color)] rounded-xl px-4 py-3 focus:outline-none focus:border-[var(--brand)] transition-colors"
                  />
                </div>
                
                <button type="submit" className="w-full px-6 py-3 rounded-xl bg-[var(--brand)] text-white font-bold hover:brightness-110 transition-colors shadow-lg mt-4">
                  Enregistrer le mot de passe
                </button>
              </form>
            </section>
          </div>
        )}

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="space-y-12 animate-in fade-in duration-300">
             <section className="space-y-6">
              <div className="flex items-center gap-3 border-b border-[var(--border-color)] pb-3">
                <UserIcon className="w-6 h-6 text-[var(--brand)]" />
                <h2 className="text-xl font-semibold">Informations du compte</h2>
              </div>
              <div className="surface-card border border-[var(--border-color)] rounded-2xl p-6 md:p-8 flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 rounded-full bg-[var(--brand-light)] border-2 border-[var(--brand)] flex items-center justify-center font-bold text-2xl text-[var(--brand)]">
                     ZA
                  </div>
                  <div>
                    <h3 className="font-bold text-xl">Admin Zamoume Ahmed</h3>
                    <p className="text-[var(--text-muted)] text-sm mt-1">zamoumeahmed6@gmail.com</p>
                    <p className="inline-block mt-2 px-2 py-1 rounded bg-[var(--brand-light)] text-[var(--brand)] text-[10px] font-bold uppercase tracking-widest border border-[var(--brand)]">
                      Administrateur Système
                    </p>
                  </div>
                </div>
                 <button className="px-5 py-2.5 rounded-xl border-2 border-[var(--border-color)] font-bold hover:border-[var(--brand)] hover:text-[var(--brand)] transition-colors">
                   Mettre à jour
                 </button>
              </div>
            </section>
            
             <section className="space-y-6">
              <div className="flex items-center gap-3 border-b border-[var(--border-color)] pb-3">
                <Bell className="w-6 h-6 text-[var(--brand)]" />
                <h2 className="text-xl font-semibold">Préférences de Notification</h2>
              </div>
              <div className="space-y-4">
                {[
                  { label: "Alertes Incendies Majeurs (Push)", active: true },
                  { label: "Rapports Hebdomadaires (Email)", active: false },
                  { label: "Nouvelle Infraction Enregistrée", active: true },
                  { label: "Mises à jour des modèles 3D (LiDAR)", active: true }
                ].map((notif, idx) => (
                   <label key={idx} className="flex items-center justify-between p-4 rounded-xl border border-[var(--border-color)] surface-card cursor-pointer hover:border-[var(--brand)] transition-colors">
                      <span className="font-medium text-sm">{notif.label}</span>
                      <div className={`w-11 h-6 rounded-full relative transition-colors ${notif.active ? 'bg-[var(--brand)]' : 'bg-black/20 dark:bg-white/20'}`}>
                         <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${notif.active ? 'translate-x-5' : 'translate-x-0'}`}></div>
                      </div>
                   </label>
                ))}
              </div>
            </section>
          </div>
        )}

      </div>
    </div>
  );
}
