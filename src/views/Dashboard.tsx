import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { ArrowUpRight, Flame, ShieldAlert, Scale, Trees } from 'lucide-react';
import { DashboardMap } from '../components/DashboardMap';

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
  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif italic text-[var(--brand)]">Tableau de Bord</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">Aperçu général de la situation forestière nationale.</p>
        </div>
        <button className="px-4 py-2 bg-[var(--brand)] text-[var(--bg-main)] rounded-xl text-xs uppercase tracking-widest font-bold hover:brightness-110 transition-colors shadow-sm">
          Générer Rapport
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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

      <div className="surface-card border p-5 rounded-2xl shadow-sm">
        <h2 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-6">Cartographie Administrative - Région Tanger-Tétouan-Al Hoceïma</h2>
        <DashboardMap />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="surface-card border p-5 rounded-2xl shadow-sm">
          <h2 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-6">Évolution des Incendies (2025)</h2>
          <div className="h-[300px] w-full">
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
          <h2 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-6">Infractions Détectées (7 jours)</h2>
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
    <div className="surface-card border p-5 rounded-2xl shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className={`size-10 rounded-lg flex items-center justify-center ${colorStyles}`}>
          <Icon className="size-5" />
        </div>
        <span className={`text-[10px] font-medium ${trendUp ? 'text-red-500' : 'text-emerald-600'}`}>
          {trendUp ? '+' : '-'}{trend}
        </span>
      </div>
      <div>
        <p className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">{title}</p>
        <p className="text-3xl font-serif text-[var(--text-main)]">{value}</p>
      </div>
    </div>
  );
}
