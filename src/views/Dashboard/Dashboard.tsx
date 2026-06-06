import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { ArrowUpRight, Flame, ShieldAlert, Scale, Trees, Activity } from 'lucide-react';
import { DashboardMap } from './components/DashboardMap';
import { useTheme } from '../../contexts/ThemeContext';
import { DashboardFlightStyle } from './components/DashboardFlightStyle';
import { DashboardFramedStyle } from './components/DashboardFramedStyle';
import { DashboardNeumorphicWarm } from './components/DashboardNeumorphicWarm';
import { DashboardClaymorphism } from './components/DashboardClaymorphism';

const dataFires = [
  { name: 'Jan', value: 12 },
  { name: 'Fév', value: 19 },
  { name: 'Mar', value: 15 },
  { name: 'Avr', value: 25 },
  { name: 'Mai', value: 42 },
  { name: 'Juin', value: 85 },
  { name: 'Juil', value: 120 },
  { name: 'Aoû', value: 140 },
  { name: 'Sep', value: 90 },
];

const dataInfractions = [
  { name: 'Lun', value: 12 },
  { name: 'Mar', value: 8 },
  { name: 'Mer', value: 15 },
  { name: 'Jeu', value: 10 },
  { name: 'Ven', value: 20 },
  { name: 'Sam', value: 45 },
  { name: 'Dim', value: 38 },
];

export function Dashboard() {
  const { theme, layout } = useTheme();

  if (theme === 'ux-split-panel-anchor' || theme === 'flight-minimal') {
    return <DashboardFlightStyle />;
  }

  if (theme === 'ux-framed-solid') {
    return <DashboardFramedStyle />;
  }

  if (theme === 'ux-neumorphic-warm') {
    return <DashboardNeumorphicWarm />;
  }

  if (theme === 'ux-claymorphism-matte') {
    return <DashboardClaymorphism />;
  }

  const isCommandCenter = theme === 'command-center';
  const isSportMode = theme === 'sport';

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between mb-4 md:mb-8">
        <div>
          {isSportMode ? (
            <h1 className="text-xl md:text-3xl font-bold armoury-header text-[var(--brand)]">
              Accueil
            </h1>
          ) : isCommandCenter ? (
            <h1 className="text-xl md:text-3xl font-bold text-[var(--brand)] flex items-center gap-2 md:gap-3 tracking-tighter">
              <Activity className="size-6 md:size-8" />
              SYSTEM OVERVIEW
            </h1>
          ) : (
            <h1 className="text-xl md:text-2xl font-serif italic text-[var(--brand)]">Tableau de Bord</h1>
          )}
          <p className="text-xs md:text-sm text-[var(--text-muted)] mt-1">{isSportMode ? "Utilisation du système forestier" : "Aperçu général de la situation forestière nationale."}</p>
        </div>
        <button className={`hidden sm:block px-4 py-2 ${isCommandCenter || isSportMode ? 'bg-[var(--bg-surface)] border border-[var(--brand)] text-[var(--brand)] shadow-[0_0_10px_rgba(var(--brand-rgb),0.2)]' : 'bg-[var(--brand)] text-[var(--bg-main)] hover:brightness-110'} text-[10px] md:text-xs uppercase tracking-widest font-bold transition-colors shadow-sm`}>
          Générer Rapport
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
        <StatCard 
          title="Infractions (Cette semaine)" 
          value="148" 
          trend="+12%" 
          trendUp={true}
          icon={ShieldAlert}
          color="rose"
        />
        <StatCard 
          title="Dossiers Contentieux" 
          value="1,240" 
          trend="-2%" 
          trendUp={false}
          icon={Scale}
          color="amber"
        />
        <StatCard 
          title="Alertes Feu Actives" 
          value="3" 
          trend="Risque Élevé" 
          trendUp={true}
          icon={Flame}
          color="orange"
        />
        <StatCard 
          title="Surface Reboisée (Ha)" 
          value="45,000" 
          trend="+5,000" 
          trendUp={true}
          icon={Trees}
          color="emerald"
        />
      </div>

      <div className="surface-card border p-3 md:p-5 rounded-xl md:rounded-2xl shadow-sm">
        <h2 className={`text-[10px] md:text-[11px] font-bold text-[var(--text-muted)] uppercase md:tracking-widest mb-4 md:mb-6 ${isSportMode ? 'armoury-header text-[var(--text-main)] text-xs md:text-sm' : ''}`}>Cartographie Administrative - TT Al Hoceïma</h2>
        <DashboardMap />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <div className="surface-card border p-3 md:p-5 rounded-xl md:rounded-2xl shadow-sm">
          <h2 className={`text-[10px] md:text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-4 md:mb-6 ${isSportMode ? 'armoury-header text-[var(--text-main)] text-sm' : ''}`}>Évolution des Incendies (2025)</h2>
          <div className="h-[250px] md:h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dataFires}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'var(--text-muted)', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: 'var(--text-muted)', fontSize: 12}} />
                <Tooltip 
                  cursor={{fill: 'var(--brand-light)'}}
                  contentStyle={{borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                />
                <Bar dataKey="value" fill="var(--accent)" radius={[4, 4, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface-card border p-5 rounded-2xl shadow-sm">
          <h2 className={`text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-6 ${isSportMode ? 'armoury-header text-[var(--text-main)] text-sm' : ''}`}>Infractions Détectées (7 jours)</h2>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dataInfractions}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'var(--text-muted)', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: 'var(--text-muted)', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                />
                <Line type="monotone" dataKey="value" stroke="var(--brand)" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} activeDot={{r: 6}} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, trend, trendUp, icon: Icon, color }: any) {
  const colorStyles = {
    emerald: 'bg-emerald-100 text-emerald-800',
    rose: 'bg-red-100 text-red-600',
    amber: 'bg-orange-100 text-orange-600',
    orange: 'bg-orange-100 text-orange-600',
  }[color];

  return (
    <div className="surface-card border p-3 md:p-5 rounded-xl md:rounded-2xl shadow-sm">
      <div className="flex items-center justify-between mb-2 md:mb-4">
        <div className={`size-8 md:size-10 rounded-lg flex items-center justify-center ${colorStyles}`}>
          <Icon className="size-4 md:size-5" />
        </div>
        <span className={`text-[9px] md:text-[10px] font-bold ${trendUp ? 'text-red-500' : 'text-emerald-600'}`}>
          {trendUp ? '+' : '-'}{trend}
        </span>
      </div>
      <div>
        <p className="text-[9px] md:text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-0.5 md:mb-1">{title}</p>
        <p className="text-xl md:text-3xl font-serif text-[var(--text-main)]">{value}</p>
      </div>
    </div>
  );
}
