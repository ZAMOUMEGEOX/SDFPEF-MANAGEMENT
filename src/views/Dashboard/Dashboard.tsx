import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { ArrowUpRight, Flame, ShieldAlert, Scale, Trees, Activity } from 'lucide-react';
import { DashboardMap } from './components/DashboardMap';
import { useTheme } from '../../contexts/ThemeContext';
import { DashboardFlightStyle } from './components/DashboardFlightStyle';
import { DashboardFramedStyle } from './components/DashboardFramedStyle';
import { DashboardNeumorphicWarm } from './components/DashboardNeumorphicWarm';
import { DashboardClaymorphism } from './components/DashboardClaymorphism';
import { supabase } from '../../lib/supabase';

// ── Données de fallback (affichées pendant le chargement ou si Supabase vide) ─
const FALLBACK_FIRES = [
  { name: 'Jan', value: 0 }, { name: 'Fév', value: 0 }, { name: 'Mar', value: 0 },
  { name: 'Avr', value: 0 }, { name: 'Mai', value: 0 }, { name: 'Juin', value: 0 },
  { name: 'Juil', value: 0 }, { name: 'Aoû', value: 0 }, { name: 'Sep', value: 0 },
];
const FALLBACK_INFRACTIONS = [
  { name: 'Lun', value: 0 }, { name: 'Mar', value: 0 }, { name: 'Mer', value: 0 },
  { name: 'Jeu', value: 0 }, { name: 'Ven', value: 0 }, { name: 'Sam', value: 0 },
  { name: 'Dim', value: 0 },
];
const DAY_LABELS    = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTH_LABELS  = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

export function Dashboard() {
  const { theme, layout } = useTheme();

  // ── State données réelles ─────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [infractionsWeek, setInfractionsWeek]     = useState('—');
  const [infractionsWeekTrend, setInfractionsWeekTrend] = useState('0%');
  const [infractionsWeekUp, setInfractionsWeekUp] = useState(false);
  const [contentieuxTotal, setContentieuxTotal]   = useState('—');
  const [feuActifs, setFeuActifs]                 = useState('—');
  const [dataFires, setDataFires]                 = useState(FALLBACK_FIRES);
  const [dataInfractions, setDataInfractions]     = useState(FALLBACK_INFRACTIONS);

  // ── Chargement données Supabase ───────────────────────────────────────────
  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const now       = new Date();
      const weekAgo   = new Date(now); weekAgo.setDate(now.getDate() - 7);
      const twoWkAgo  = new Date(now); twoWkAgo.setDate(now.getDate() - 14);
      const yearAgo   = new Date(now); yearAgo.setFullYear(now.getFullYear() - 1);

      // ── 1. Infractions cette semaine ──────────────────────────────────────
      const { count: wk } = await supabase
        .from('infractions')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', weekAgo.toISOString());

      // ── 2. Infractions semaine précédente (pour trend %) ──────────────────
      const { count: pwk } = await supabase
        .from('infractions')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', twoWkAgo.toISOString())
        .lt('created_at', weekAgo.toISOString());

      const weekCount = wk ?? 0;
      const prevCount = pwk ?? 0;
      const trendPct  = prevCount > 0
        ? Math.round(((weekCount - prevCount) / prevCount) * 100)
        : weekCount > 0 ? 100 : 0;

      setInfractionsWeek(weekCount.toString());
      setInfractionsWeekTrend(`${Math.abs(trendPct)}%`);
      setInfractionsWeekUp(trendPct >= 0);

      // ── 3. Total dossiers contentieux ─────────────────────────────────────
      const { count: cTotal } = await supabase
        .from('contentieux_cases')
        .select('*', { count: 'exact', head: true });
      setContentieuxTotal((cTotal ?? 0).toLocaleString('fr-FR'));

      // ── 4. Infractions type feu (30 derniers jours) ───────────────────────
      const monthAgo = new Date(now); monthAgo.setDate(now.getDate() - 30);
      const { data: allRecent } = await supabase
        .from('infractions')
        .select('infraction_types, created_at')
        .gte('created_at', monthAgo.toISOString());

      const fireCodes = ['incendie', 'feu', 'brûlis', 'brulage', 'carbonisation'];
      const feuCount = (allRecent ?? []).filter(row =>
        (row.infraction_types ?? []).some((t: string) =>
          fireCodes.some(code => t.toLowerCase().includes(code))
        )
      ).length;
      setFeuActifs(feuCount.toString());

      // ── 5. Graphique — infractions par jour (7 derniers jours) ───────────
      const { data: weekRows } = await supabase
        .from('infractions')
        .select('created_at')
        .gte('created_at', weekAgo.toISOString())
        .order('created_at');

      if (weekRows && weekRows.length > 0) {
        const countByDay: Record<string, number> = {};
        weekRows.forEach(r => {
          const label = DAY_LABELS[new Date(r.created_at).getDay()];
          countByDay[label] = (countByDay[label] || 0) + 1;
        });
        // 7 derniers jours dans l'ordre chronologique
        const chartDays = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(now);
          d.setDate(now.getDate() - (6 - i));
          const label = DAY_LABELS[d.getDay()];
          return { name: label, value: countByDay[label] || 0 };
        });
        setDataInfractions(chartDays);
      }

      // ── 6. Graphique — infractions par mois (12 derniers mois) ───────────
      const { data: yearRows } = await supabase
        .from('infractions')
        .select('created_at')
        .gte('created_at', yearAgo.toISOString())
        .order('created_at');

      if (yearRows && yearRows.length > 0) {
        const countByMonth: Record<number, number> = {};
        yearRows.forEach(r => {
          const m = new Date(r.created_at).getMonth();
          countByMonth[m] = (countByMonth[m] || 0) + 1;
        });
        const chartMonths = Array.from({ length: 12 }, (_, i) => {
          const monthIdx = (now.getMonth() - 11 + i + 12) % 12;
          return { name: MONTH_LABELS[monthIdx], value: countByMonth[monthIdx] || 0 };
        });
        setDataFires(chartMonths);
      }

    } catch (err) {
      console.error('[Dashboard] Erreur chargement:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Routing thèmes (INCHANGÉ) ─────────────────────────────────────────────
  if (theme === 'ux-split-panel-anchor' || theme === 'flight-minimal') return <DashboardFlightStyle />;
  if (theme === 'ux-framed-solid')      return <DashboardFramedStyle />;
  if (theme === 'ux-neumorphic-warm')   return <DashboardNeumorphicWarm />;
  if (theme === 'ux-claymorphism-matte') return <DashboardClaymorphism />;

  const isCommandCenter = theme === 'command-center';
  const isSportMode     = theme === 'sport';

  // ── JSX INCHANGÉ — seules les valeurs dynamiques remplacent les statiques ─
  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between mb-4 md:mb-8">
        <div>
          {isSportMode ? (
            <h1 className="text-xl md:text-3xl font-bold armoury-header text-[var(--brand)]">Accueil</h1>
          ) : isCommandCenter ? (
            <h1 className="text-xl md:text-3xl font-bold text-[var(--brand)] flex items-center gap-2 md:gap-3 tracking-tighter">
              <Activity className="size-6 md:size-8" /> SYSTEM OVERVIEW
            </h1>
          ) : (
            <h1 className="text-xl md:text-2xl font-serif italic text-[var(--brand)]">Tableau de Bord</h1>
          )}
          <p className="text-xs md:text-sm text-[var(--text-muted)] mt-1">
            {isSportMode ? "Utilisation du système forestier" : "Aperçu général de la situation forestière nationale."}
          </p>
        </div>
        <button className={`hidden sm:block px-4 py-2 ${isCommandCenter || isSportMode ? 'bg-[var(--bg-surface)] border border-[var(--brand)] text-[var(--brand)] shadow-[0_0_10px_rgba(var(--brand-rgb),0.2)]' : 'bg-[var(--brand)] text-[var(--bg-main)] hover:brightness-110'} text-[10px] md:text-xs uppercase tracking-widest font-bold transition-colors shadow-sm`}>
          Générer Rapport
        </button>
      </div>

      {/* StatCards — valeurs réelles depuis Supabase */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
        <StatCard
          title="Infractions (Cette semaine)"
          value={loading ? '…' : infractionsWeek}
          trend={loading ? '…' : infractionsWeekTrend}
          trendUp={infractionsWeekUp}
          icon={ShieldAlert}
          color="rose"
        />
        <StatCard
          title="Dossiers Contentieux"
          value={loading ? '…' : contentieuxTotal}
          trend={loading ? '…' : '0%'}
          trendUp={false}
          icon={Scale}
          color="amber"
        />
        <StatCard
          title="Alertes Feu (30j)"
          value={loading ? '…' : feuActifs}
          trend="Risque Élevé"
          trendUp={true}
          icon={Flame}
          color="orange"
        />
        <StatCard
          title="Surface Reboisée (Ha)"
          value="45,000"
          trend="5,000"
          trendUp={true}
          icon={Trees}
          color="emerald"
        />
      </div>

      <div className="surface-card border p-3 md:p-5 rounded-xl md:rounded-2xl shadow-sm">
        <h2 className={`text-[10px] md:text-[11px] font-bold text-[var(--text-muted)] uppercase md:tracking-widest mb-4 md:mb-6 ${isSportMode ? 'armoury-header text-[var(--text-main)] text-xs md:text-sm' : ''}`}>
          Cartographie Administrative - TT Al Hoceïma
        </h2>
        <DashboardMap />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Graphique activité mensuelle — données réelles */}
        <div className="surface-card border p-3 md:p-5 rounded-xl md:rounded-2xl shadow-sm">
          <h2 className={`text-[10px] md:text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-4 md:mb-6 ${isSportMode ? 'armoury-header text-[var(--text-main)] text-sm' : ''}`}>
            Évolution des Infractions (12 mois)
          </h2>
          <div className="h-[250px] md:h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dataFires}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                <Tooltip
                  cursor={{ fill: 'var(--brand-light)' }}
                  contentStyle={{ borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="value" fill="var(--accent)" radius={[4, 4, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Graphique infractions par jour — données réelles */}
        <div className="surface-card border p-5 rounded-2xl shadow-sm">
          <h2 className={`text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-6 ${isSportMode ? 'armoury-header text-[var(--text-main)] text-sm' : ''}`}>
            Infractions Détectées (7 jours)
          </h2>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dataInfractions}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Line type="monotone" dataKey="value" stroke="var(--brand)" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── StatCard (INCHANGÉ) ────────────────────────────────────────────────────────
function StatCard({ title, value, trend, trendUp, icon: Icon, color }: any) {
  const colorStyles = {
    emerald: 'bg-emerald-100 text-emerald-800',
    rose:    'bg-red-100 text-red-600',
    amber:   'bg-orange-100 text-orange-600',
    orange:  'bg-orange-100 text-orange-600',
  }[color as string];

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