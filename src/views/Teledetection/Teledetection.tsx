import { useState, useRef, useEffect, useMemo } from 'react';
import { cn } from '../../lib/utils';
import {
  Satellite, Play, Calendar, CloudRain, ShieldAlert, Layers,
  TreePine, Sliders, SplitSquareHorizontal, FileWarning, CheckCircle2,
  ChevronDown, Hexagon, Crosshair, Map as MapIcon, RotateCcw,
  MapPin, BarChart3, Download, FileSpreadsheet, DownloadCloud,
  PanelRightClose, PanelRightOpen, Anchor, Waves, TrendingUp, Globe,
  Flame, LayoutDashboard, X, Target, ShieldCheck, Activity
} from 'lucide-react';
import { MapContainer, TileLayer, LayersControl, FeatureGroup, useMap, GeoJSON, CircleMarker, Tooltip as LeafletTooltip } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import {
  checkGeeHealth,
  runAnalyzeAsync,
  fetchForestWatchLayer,
  fetchSentinel1Change,
  fetchS2Scenes,
  fetchS2SceneTile,
  saveAlerts,
  sendAlertVerdict,
  fetchAccuracy,
  fetchFireDetection,
  fetchSavedAlerts,
  fetchPhenology,
  fetchAnnualStats,
  fetchLayerImage,
  type AnnualStatsResult,
  exportPolygonsGeoJson,
  exportPolygonsKml,
  exportPolygonsShp,
  exportPolygonsCsv,
  exportAnnualCsv,
  type PolygonFeature,
  type AnalyzeParams,
  type AnomalyLabel,
  toFlaskZone,
} from '../../lib/gee-api';

const ANOMALY_CONFIG: Record<AnomalyLabel, { color: string; label: string; emoji: string }> = {
  severe_deficit:   { color: '#ef4444', label: 'Déficit sévère',  emoji: '🔴' },
  moderate_deficit: { color: '#f97316', label: 'Déficit modéré',  emoji: '🟠' },
  slight_deficit:   { color: '#eab308', label: 'Léger déficit',   emoji: '🟡' },
  normal:           { color: '#22c55e', label: 'Normal',           emoji: '🟢' },
  above_average:    { color: '#3b82f6', label: 'Au-dessus moy.',  emoji: '🔵' },
  unknown:          { color: '#71717a', label: 'Inconnu',          emoji: '⚪' },
};

// Couleurs de confiance — 4 niveaux (preuves indépendantes)
const CONF_COLOR: Record<string, string> = {
  highest: '#7f1d1d', high: '#ef4444', medium: '#f97316', low: '#eab308',
};

// v22 — libellés de statut (suivi des alertes) en arabe + français
const STATUS_AR: Record<string, string> = {
  nouveau: 'جديد / Nouveau',
  en_cours: 'قيد المعاينة / En cours',
  infraction: 'مخالفة مؤكَّدة / Infraction',
  faux_positif: 'إنذار كاذب / Faux',
  cloture: 'مُغلق / Clôturé',
};

// ── Analyse forêt-par-forêt (v15) ───────────────────────────────────────────
// Mappe la zone (centre/CPF) sélectionnée vers la valeur du champ CPF du GeoJSON.
const ZONE_TO_CPF: Record<string, string> = {
  mdiq: 'MDIQ_FNIDEQ', df_mdiq: 'MDIQ_FNIDEQ',
  tetouan_est: 'TETOUAN_EST', tetouan_ouest: 'TETOUAN_OUEST',
};
// Alias d'orthographe -> nom canonique (étendre librement selon les données).
const FOREST_ALIAS: Record<string, string> = { 'BENI IDER': 'BENI IDDER' };
const normTxt = (s: unknown): string =>
  String(s ?? '').trim().toUpperCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
const normForest = (s: unknown): string => { const n = normTxt(s); return FOREST_ALIAS[n] ?? n; };
const isJunkForest = (n: string): boolean => !n || n === 'NONE' || /^-+$/.test(n);

// Imagerie "actuelle" (côté droit du swipe) quand aucune image S2 "après" n'existe encore.
const ARCGIS_IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

// Index de l'image la PLUS PROCHE d'une date cible (pour ne pas se perdre entre les dates).
const nearestIdx = (list: { date: string }[], target: string): number => {
  if (!list.length) return -1;
  const t = new Date(target).getTime();
  let best = 0, bestD = Infinity;
  list.forEach((it, i) => {
    const d = Math.abs(new Date(it.date).getTime() - t);
    if (Number.isFinite(d) && d < bestD) { bestD = d; best = i; }
  });
  return best;
};

// Idée 5 — libellé + couleur de la cause probable
const CAUSE_INFO: Record<string, { label: string; emoji: string; color: string }> = {
  incendie:        { label: 'Incendie / brûlis', emoji: '\uD83D\uDD25', color: '#dc2626' },
  coupe:           { label: 'Coupe / défrichement', emoji: '\uD83E\uDE93', color: '#b45309' },
  stress_hydrique: { label: 'Stress hydrique / dépérissement', emoji: '\uD83D\uDCA7', color: '#0891b2' },
  degradation:     { label: 'Dégradation progressive', emoji: '\uD83C\uDF42', color: '#ca8a04' },
  indetermine:     { label: 'Indéterminé', emoji: '\u2753', color: '#6b7280' },
};
const causeInfo = (c?: string) => CAUSE_INFO[c || 'indetermine'] || CAUSE_INFO.indetermine;

// Options anti-flicker pour les tuiles GEE : garde l'ancien niveau visible
// pendant le chargement du nouveau, et ne recharge qu'à l'arrêt du zoom/pan.
// Tuiles GEE : garder quelques tuiles autour du cadre pour un pan fluide,
// et ne pas recharger pendant l'animation de zoom (évite le scintillement).
// On laisse le reste au comportement par défaut de Leaflet (chargement pendant le pan).
// maxNativeZoom = clé anti-disparition au zoom : GEE ne recalcule plus de tuiles
// au-delà de z15 ; Leaflet agrandit les tuiles déjà en cache (upsampling) au lieu
// de relancer un calcul serveur. keepBuffer élevé + updateWhenIdle = pan fluide,
// rechargement uniquement à l'arrêt (zéro scintillement).
const TILE_PERF = {
  keepBuffer: 8,
  updateWhenZooming: false,
  updateWhenIdle: true,
  maxNativeZoom: 15,   // GEE: dernier niveau réellement calculé
  maxZoom: 19,         // Leaflet: continue à zoomer (tuiles agrandies)
};

// ─────────────────────────────────────────────────────────────────────────────
// Sous-composants UI
// ─────────────────────────────────────────────────────────────────────────────
const ToggleCard = ({ checked, onChange, label, icon: Icon, activeColor = "var(--brand)" }: any) => (
  <button
    onClick={() => onChange(!checked)}
    className={cn(
      "flex flex-col items-start p-3 md:p-4 rounded-2xl border-2 transition-all text-left w-full hover:scale-[1.02] hover:shadow-lg",
      checked ? "bg-[var(--bg-main)]"
              : "bg-[var(--bg-main)]/50 border-transparent text-[var(--text-muted)] hover:border-[var(--brand)]/30 hover:bg-[var(--bg-main)] hover:text-[var(--text-main)]"
    )}
    style={checked ? { borderColor: activeColor, boxShadow: `0 8px 16px color-mix(in srgb, ${activeColor} 20%, transparent)` } : {}}
  >
    <div className="flex items-center justify-between w-full mb-3 md:mb-4">
      {Icon && <Icon className="w-5 h-5 md:w-6 md:h-6" style={{ color: checked ? activeColor : 'currentColor' }} />}
      <div className={cn("w-10 h-5 md:w-12 md:h-6 rounded-full relative transition-colors duration-300",
        checked ? "bg-opacity-100" : "bg-black/20 dark:bg-white/20")} style={checked ? { backgroundColor: activeColor } : {}}>
        <div className={cn("absolute top-1 left-1 w-3 h-3 md:w-4 md:h-4 rounded-full bg-white transition-transform duration-300 shadow-sm",
          checked ? "translate-x-5 md:translate-x-6" : "translate-x-0")} />
      </div>
    </div>
    <span className={cn("text-[11px] md:text-sm font-bold leading-tight", checked ? "text-[var(--text-main)]" : "")}>{label}</span>
  </button>
);

const RangeSlider = ({ label, value, min, max, step, onChange, unit = '', formatter }: any) => (
  <div className="space-y-3 group cursor-pointer" tabIndex={0}>
    <div className="flex justify-between items-end transition-transform group-hover:-translate-y-0.5">
      <label className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] group-hover:text-[var(--text-main)] transition-colors cursor-pointer">{label}</label>
      <div className="bg-[var(--bg-main)] px-2 py-1 rounded-md border border-[var(--border-color)] group-hover:border-[var(--brand)] transition-colors">
        <span className="text-xs md:text-sm font-mono text-[var(--brand)] font-bold">{formatter ? formatter(value) : value}{unit}</span>
      </div>
    </div>
    <div className="relative h-2 bg-[var(--bg-main)] rounded-full overflow-hidden border border-[var(--border-color)] group-hover:border-[var(--brand)]/30 transition-all group-hover:h-2.5">
      <div className="absolute top-0 left-0 h-full bg-[var(--brand)] transition-transform" style={{ width: `${((value - min) / (max - min)) * 100}%` }} />
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="absolute inset-0 w-full hover:opacity-10 opacity-0 cursor-pointer accent-[var(--brand)]" />
    </div>
  </div>
);

// Ligne d'opacité compacte (un simple curseur fin, sans prendre de place)
const OpacityRow = ({ label, color, value, onChange }: any) => (
  <div className="flex items-center gap-2">
    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
    <span className="text-[9px] font-mono text-[var(--text-muted)] w-12 shrink-0">{label}</span>
    <input type="range" min={0.1} max={1} step={0.05} value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="flex-1 h-1 cursor-pointer accent-[var(--brand)]" style={{ accentColor: color }} />
    <span className="text-[9px] font-mono text-[var(--text-main)] w-7 text-right shrink-0">{Math.round(value * 100)}%</span>
  </div>
);

const DateInput = ({ value, onChange }: any) => (
  <div className="flex-1">
    <div className="flex items-center gap-2 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl px-3 py-2 md:py-2.5 hover:border-[var(--brand)] hover:shadow-sm hover:bg-[var(--bg-surface)] transition-all focus-within:border-[var(--brand)] focus-within:ring-1 focus-within:ring-[var(--brand)] cursor-pointer">
      <Calendar className="w-3.5 h-3.5 md:w-4 md:h-4 text-[var(--text-muted)] shrink-0" />
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)}
        className="bg-transparent border-none text-xs md:text-sm text-[var(--text-main)] font-semibold w-full focus:outline-none placeholder-[var(--text-muted)] cursor-pointer" />
    </div>
  </div>
);

// ── Graphique pluriannuel : deux courbes (NDVI gauche, Haute conf. droite) ────
// SVG pur (zéro dépendance) -> léger, fiable, rendu net. Double axe Y :
// NDVI (0..1, vert) à gauche ; surface haute confiance (ha, rouge) à droite.
const AnnualChart = ({ series }: { series: { year: number; ndvi_mean: number | null; high_conf_ha: number | null }[] }) => {
  const W = 520, H = 240, PADL = 44, PADR = 48, PADT = 18, PADB = 30;
  const pts = series.filter(s => s.ndvi_mean != null || s.high_conf_ha != null);
  if (pts.length < 2) return <div className="text-xs text-[var(--text-muted)] py-6 text-center">Au moins 2 années sont nécessaires pour tracer une courbe.</div>;
  const years = pts.map(p => p.year);
  const xMin = Math.min(...years), xMax = Math.max(...years);
  const ndviVals = pts.map(p => p.ndvi_mean).filter((v): v is number => v != null);
  const haVals = pts.map(p => p.high_conf_ha).filter((v): v is number => v != null);
  const ndviMin = Math.min(0, ...ndviVals), ndviMax = Math.max(0.8, ...ndviVals);
  const haMax = Math.max(1, ...haVals);
  const X = (y: number) => PADL + (xMax === xMin ? 0.5 : (y - xMin) / (xMax - xMin)) * (W - PADL - PADR);
  const Yn = (v: number) => PADT + (1 - (v - ndviMin) / (ndviMax - ndviMin || 1)) * (H - PADT - PADB);
  const Yh = (v: number) => PADT + (1 - v / (haMax || 1)) * (H - PADT - PADB);
  const ndviPath = pts.filter(p => p.ndvi_mean != null).map((p, i) => `${i ? 'L' : 'M'}${X(p.year).toFixed(1)},${Yn(p.ndvi_mean as number).toFixed(1)}`).join(' ');
  const haPath = pts.filter(p => p.high_conf_ha != null).map((p, i) => `${i ? 'L' : 'M'}${X(p.year).toFixed(1)},${Yh(p.high_conf_ha as number).toFixed(1)}`).join(' ');
  const gridYs = [0, 0.25, 0.5, 0.75, 1].map(f => ndviMin + f * (ndviMax - ndviMin));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ maxHeight: 260 }}>
      {/* grille horizontale + labels NDVI (gauche) */}
      {gridYs.map((g, i) => (
        <g key={i}>
          <line x1={PADL} x2={W - PADR} y1={Yn(g)} y2={Yn(g)} stroke="currentColor" strokeOpacity="0.12" />
          <text x={PADL - 6} y={Yn(g) + 3} textAnchor="end" fontSize="9" fill="#16a34a">{g.toFixed(2)}</text>
        </g>
      ))}
      {/* labels axe droit (ha) */}
      {[0, 0.5, 1].map((f, i) => (
        <text key={i} x={W - PADR + 6} y={Yh(f * haMax) + 3} textAnchor="start" fontSize="9" fill="#dc2626">{(f * haMax).toFixed(1)}</text>
      ))}
      {/* axes X : années */}
      {pts.map(p => (
        <text key={p.year} x={X(p.year)} y={H - PADB + 14} textAnchor="middle" fontSize="9" fill="currentColor" fillOpacity="0.6">{p.year}</text>
      ))}
      {/* courbe haute confiance (rouge, axe droit) */}
      <path d={haPath} fill="none" stroke="#dc2626" strokeWidth="2.2" />
      {pts.filter(p => p.high_conf_ha != null).map(p => (
        <circle key={`h${p.year}`} cx={X(p.year)} cy={Yh(p.high_conf_ha as number)} r="3.2" fill="#dc2626" />
      ))}
      {/* courbe NDVI (vert, axe gauche) */}
      <path d={ndviPath} fill="none" stroke="#16a34a" strokeWidth="2.2" />
      {pts.filter(p => p.ndvi_mean != null).map(p => (
        <circle key={`n${p.year}`} cx={X(p.year)} cy={Yn(p.ndvi_mean as number)} r="3.2" fill="#16a34a" />
      ))}
    </svg>
  );
};

function MapResizer() {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => { map.invalidateSize(); }, 100);
    const container = map.getContainer();
    const ro = new ResizeObserver(() => { map.invalidateSize(); });
    ro.observe(container);
    return () => { ro.unobserve(container); ro.disconnect(); };
  }, [map]);
  return null;
}

// Expose la carte pour le zoom-vers-polygone
function MapRefSetter({ onReady }: { onReady: (m: L.Map) => void }) {
  const map = useMap();
  useEffect(() => { onReady(map); }, [map, onReady]);
  return null;
}

// Ordre d'affichage STRICT des couches via des panes dédiés (z-index croissant).
// Du bas vers le haut : S2 (fond) < NDVI/Hansen/SAR < Alertes (raster) < Polygones < Limites.
// Ainsi le Sentinel-2 ne recouvre JAMAIS les changements ni les polygones.
function LayerPanes() {
  const map = useMap();
  useEffect(() => {
    const defs: [string, number][] = [
      ['paneS2', 210],        // images Sentinel-2 (avant) — juste au-dessus du fond
      ['paneWaybackLeft', 215], // v16 — image historique (Wayback) clippee a GAUCHE du split
      ['paneIndices', 360],   // NDVI Δ / Hansen / SAR / Phéno — sous les alertes
      ['paneAlertes', 410],   // raster de confiance (changements)
      ['paneMultiscene', 415],
      ['panePolygons', 440],  // polygones vectoriels — au-dessus des alertes
      ['paneLimits', 480],    // limites ANEF / zone
    ];
    defs.forEach(([name, z]) => {
      let p = map.getPane(name);
      if (!p) p = map.createPane(name);
      p.style.zIndex = String(z);
      // les panes raster ne doivent pas capter les clics destinés aux polygones
      if (name !== 'panePolygons' && name !== 'paneLimits') p.style.pointerEvents = 'none';
    });
  }, [map]);
  return null;
}

// Pane droite (clip) = côté "actuel" du swipe : S2 APRÈS si dispo, sinon imagerie ArcGIS actuelle.
// Le côté gauche (Wayback historique) est une couche pleine en dessous (paneS2).
function MapControls({ splitPos, toggles, geeAfterUrl }: any) {
  const map = useMap();
  const [paneReady, setPaneReady] = useState(false);

  // Créer le pane une seule fois — z=250 (entre tilePane=200 et overlayPane=400)
  useEffect(() => {
    if (!map.getPane('splitPaneRight')) {
      const pane = map.createPane('splitPaneRight');
      pane.style.zIndex = '250';
    }
    setPaneReady(true);
  }, [map]);

  // Appliquer le clip rect avec les vraies coordonnées Leaflet (containerPoint → layerPoint)
  // Cela reste précis même après pan/zoom
  useEffect(() => {
    if (!paneReady) return;
    const pane = map.getPane('splitPaneRight');
    if (!pane) return;

    const applyClip = () => {
      const leftPane = map.getPane('paneWaybackLeft');
      if (!toggles.s2Split) {
        pane.style.display = 'none';
        if (leftPane) leftPane.style.clip = '';
        return;
      }
      pane.style.display = 'block';
      const nw = map.containerPointToLayerPoint([0, 0] as any);
      const se = map.containerPointToLayerPoint(map.getSize() as any);
      const clipX = nw.x + map.getSize().x * (splitPos / 100);
      // clip: rect(top, right, bottom, left) en coordonnées layer
      // droite (image actuelle / S2 apres) : du split au bord droit
      pane.style.clip = `rect(${nw.y}px, ${se.x}px, ${se.y}px, ${clipX}px)`;
      // gauche (image historique Wayback) : du bord gauche au split -> suit le swipe
      if (leftPane) leftPane.style.clip = `rect(${nw.y}px, ${clipX}px, ${se.y}px, ${nw.x}px)`;
    };

    applyClip();
    map.on('move', applyClip);
    map.on('zoomend', applyClip);
    return () => {
      map.off('move', applyClip);
      map.off('zoomend', applyClip);
    };
  }, [splitPos, toggles.s2Split, paneReady, map, geeAfterUrl]);

  if (!paneReady || !toggles.s2Split) return null;

  // Côté droit : S2 "après" (précis) si l'analyse a tourné, sinon imagerie ArcGIS actuelle
  // -> le swipe fonctionne IMMÉDIATEMENT (gauche=historique Wayback, droite=actuelle).
  const rightUrl = geeAfterUrl || ARCGIS_IMAGERY;
  const isS2 = !!geeAfterUrl;
  return (
    <TileLayer key={rightUrl} url={rightUrl} pane="splitPaneRight"
      keepBuffer={8} updateWhenZooming={false} updateWhenIdle={true}
      maxNativeZoom={isS2 ? 15 : 18} maxZoom={19}
      attribution={isS2 ? '© GEE / Copernicus S2 (après)' : '© Esri World Imagery (actuelle)'} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────────────────
export function Teledetection() {
  const [isAnalyzing, setIsAnalyzing]     = useState(false);
  // v19 — progression de l'analyse asynchrone (barre + annulation)
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [analyzeMessage, setAnalyzeMessage]   = useState('');
  const cancelRef = useRef<null | (() => Promise<void>)>(null);
  // v21 — Tableau de bord (modal à la demande) + détection incendies
  const [showDashboard, setShowDashboard] = useState(false);
  // Statistiques historiques annuelles (panneau indépendant : courbes de tendance)
  const [showAnnual, setShowAnnual]       = useState(false);
  const [annualLoading, setAnnualLoading] = useState(false);
  const [annualData, setAnnualData]       = useState<AnnualStatsResult | null>(null);
  const [annualYears, setAnnualYears]     = useState<number[]>([2018, 2020, 2022, 2024, 2026]);
  const [annualError, setAnnualError]     = useState<string | null>(null);
  const [accuracyRows, setAccuracyRows]   = useState<any[]>([]);
  const [dashLoading, setDashLoading]     = useState(false);
  const [fireData, setFireData]           = useState<any>(null);
  const [fireDnbrUrl, setFireDnbrUrl]     = useState<string | null>(null);
  const [fireThermalUrl, setFireThermalUrl] = useState<string | null>(null);
  const [fireLoading, setFireLoading]     = useState(false);
  const [showFire, setShowFire]           = useState(false);
  // Permet de masquer/réafficher la couche incendie SANS relancer la détection.
  // showFire = "une détection a tourné" ; fireVisible = "la couche est affichée".
  const [fireVisible, setFireVisible]     = useState(true);
  // v22 — alertes archivées (mémoire Supabase) affichées à l'ouverture d'une zone
  const [savedAlerts, setSavedAlerts]     = useState<any[]>([]);
  const [statusCounts, setStatusCounts]   = useState<Record<string, number>>({});
  const [savedToast, setSavedToast]       = useState<string>('');
  // v22 — verdicts terrain appliqués en session -> recoloration instantanée des polygones
  const [verdictMap, setVerdictMap]       = useState<Record<string, 'confirme' | 'faux'>>({});
  const [splitPos, setSplitPos]           = useState(50);
  const [cloudMax, setCloudMax]           = useState(30);
  const [ndviThreshold, setNdviThreshold] = useState(0.15);
  const [nbrThreshold, setNbrThreshold]   = useState(0.15);
  const [ndmiThreshold, setNdmiThreshold] = useState(0.12);
  const [minSurface, setMinSurface]       = useState(500);
  const [minConfidence, setMinConfidence] = useState(2);
  const [refStart, setRefStart]           = useState('2024-04-03');
  const [refEnd, setRefEnd]               = useState('2024-06-02');
  const [actStart, setActStart]           = useState('2026-04-03');
  const [actEnd, setActEnd]               = useState('2026-06-02');
  const [isLegendMinimized, setIsLegendMinimized]           = useState(false);
  const [isSensibilityExpanded, setIsSensibilityExpanded]   = useState(false);
  const [isPeriodsExpanded, setIsPeriodsExpanded]           = useState(false);
  const [isPanelCollapsed, setIsPanelCollapsed]             = useState(false);
  const [isAlgorithmExpanded, setIsAlgorithmExpanded]       = useState(false);
  const [isZoneExpanded, setIsZoneExpanded]                 = useState(true);
  const [isStatsExpanded, setIsStatsExpanded]               = useState(false);
  const [isExportExpanded, setIsExportExpanded]             = useState(false);
  const [isTopExpanded, setIsTopExpanded]                   = useState(false);
  const [selectedZone, setSelectedZone]   = useState('mdiq');
  // v15 — niveau d'analyse : 'cpf' (centre entier, comportement actuel) ou 'forest' (forêt seule)
  const [analysisLevel, setAnalysisLevel] = useState<'cpf'|'forest'>('cpf');
  const [selectedForest, setSelectedForest] = useState<string>('');
  // v16 — canton (section forestiere) optionnel pour affiner encore l'analyse
  const [selectedCanton, setSelectedCanton] = useState<string>('');

  const [toggles, setToggles] = useState({
    s2Split: true, disturbance: true, polygons: true,
    ndviDelta: false, nbrDelta: false, forestWatch: false, sentinel1: false, phenology: false,
    highOnly: false,
  });
  // Multi-scène (S2) — détection répétée sur plusieurs scènes réelles. OFF par défaut, indépendante.
  const [multiScene, setMultiScene] = useState(false);
  const [minScenes, setMinScenes]   = useState(2);
  // Couches affichables via boutons sur la carte (gestion de couches, pas de cases)
  const [showAnefLimit, setShowAnefLimit] = useState(true);
  // Triple confirmation : ON par défaut (essentiel à toute analyse rigoureuse)
  // Mode d'analyse — 3 niveaux. 'standard' par défaut (vitesse/fiabilité équilibrées).
  const [analysisMode, setAnalysisMode] = useState<'express' | 'standard' | 'rigorous'>('standard');
  // Filtre "Haute confiance" : rattaché à la couche Alertes (raster + polygones)
  // Filtre "Haute confiance" : désormais géré par la couche raster indépendante
  // (toggles.highOnly), plus par un filtrage de polygones. Voir highOnlyTileUrl.
  // Opacités réglables des couches raster (gain de place, pas de cartes séparées)
  const [opacity, setOpacity] = useState({ alertes: 0.78, ndvi: 0.72, nbr: 0.78, hansen: 0.80, s1: 0.70, pheno: 0.68, multiscene: 0.80, highOnly: 0.85 });
  const setLayerOpacity = (k: keyof typeof opacity, v: number) => setOpacity(o => ({ ...o, [k]: v }));

  const zones = [
    { id: 'mdiq',          label: 'DF Mdiq-Fnideq', icon: MapIcon  },
    { id: 'tetouan_est',   label: 'Tétouan Est',    icon: TreePine },
    { id: 'tetouan_ouest', label: 'Tétouan Ouest',  icon: TreePine },
  ];

  const [geeStatus, setGeeStatus]           = useState<'unknown'|'ready'|'error'>('unknown');
  const [beforeTileUrl, setBeforeTileUrl]   = useState<string|null>(null);
  const [afterTileUrl, setAfterTileUrl]     = useState<string|null>(null);
  const [distTileUrl, setDistTileUrl]       = useState<string|null>(null);
  const [ndviTileUrl, setNdviTileUrl]       = useState<string|null>(null);
  const [nbrTileUrl, setNbrTileUrl]         = useState<string|null>(null);
  const [highOnlyTileUrl, setHighOnlyTileUrl] = useState<string|null>(null);
  const [hansenTileUrl, setHansenTileUrl]   = useState<string|null>(null);
  const [distAlertTileUrl, setDistAlertTileUrl] = useState<string|null>(null);
  const [s1TileUrl, setS1TileUrl]           = useState<string|null>(null);
  const [phenologyTileUrl, setPhenologyTileUrl] = useState<string|null>(null);
  const [multisceneTileUrl, setMultisceneTileUrl] = useState<string|null>(null);
  // Couches FIGÉES (PNG statique) : { dist, high, ndvi, nbr, ms, hansen, distalert, s1, pheno }
  const [frozen, setFrozen] = useState<Record<string, string | null>>({});
  const [roiBounds, setRoiBounds] = useState<[[number, number], [number, number]] | null>(null);
  // Esri Wayback — imagerie historique datee pour le "avant" du swipe (legere)
  const [waybackUrl, setWaybackUrl]         = useState<string|null>(null);
  const [waybackDate, setWaybackDate]       = useState<string>('');
  // v15 — frise temporelle : toutes les versions disponibles + index sélectionné
  const [waybackList, setWaybackList]       = useState<{ date: string; url: string }[]>([]);
  const [waybackIdx, setWaybackIdx]         = useState<number>(-1);
  // v18 — date de PRISE DE VUE reelle (vs date de publication Wayback) + source active
  const [captureInfo, setCaptureInfo]       = useState<string>('');   // ex: "Maxar · 2022-08-14"
  const [beforeSource, setBeforeSource]     = useState<'wayback' | 's2'>('wayback');
  const [s2List, setS2List]                 = useState<{ date: string; url: string; cloud: number }[]>([]);
  const [s2Idx, setS2Idx]                   = useState<number>(-1);
  const [s2Loading, setS2Loading]           = useState(false);
  const [polygons, setPolygons]             = useState<PolygonFeature[]>([]);
  const [beforeLabel, setBeforeLabel]       = useState<string>('Sentinel-2 (avant)');
  const [afterLabel, setAfterLabel]         = useState<string>('Sentinel-2 (après)');
  const [polyError, setPolyError]           = useState<string|null>(null);
  const [topPolys, setTopPolys]             = useState<PolygonFeature[]>([]);
  const [selectedPolyId, setSelectedPolyId] = useState<number|null>(null);
  const [realStats, setRealStats]           = useState<any>(null);
  const [s1Data, setS1Data]                 = useState<any>(null);
  const [fwData, setFwData]                 = useState<any>(null);
  const [phenologyData, setPhenologyData]   = useState<any>(null);
  const [errorMsg, setErrorMsg]             = useState<string|null>(null);
  // Avertissement non-bloquant pour les couches optionnelles (FW/S1/Phéno).
  const [layerWarnMsg, setLayerWarnMsg]     = useState<string|null>(null);
  const setLayerWarn = (m: string) => { setLayerWarnMsg(m); setTimeout(() => setLayerWarnMsg(null), 5000); };
  const [forestBoundary, setForestBoundary] = useState<any>(null);
  const [zoneBoundary, setZoneBoundary]     = useState<any>(null);
  const [mapReady, setMapReady]             = useState(false);
  // Fix #4 — position GPS de l'utilisateur (bouton Localiser)
  const [userPos, setUserPos]               = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [locating, setLocating]             = useState(false);
  const [isPhenologyExpanded, setIsPhenologyExpanded] = useState(false);

  const mapRef = useRef<L.Map|null>(null);
  // Liste complète des releases Wayback (clé API) pour la détection par localisation
  const waybackAllRef = useRef<{ url: string; date: string; release: number }[]>([]);

  // Fix #6 — Persistance des préférences utilisateur (zone, couches, opacités,
  // source historique) entre les sessions via localStorage. Chargée une fois au
  // montage, puis sauvegardée à chaque changement (léger, sans backend).
  const PREFS_KEY = 'atlasforest.prefs.v1';
  const prefsLoaded = useRef(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p.selectedZone) setSelectedZone(p.selectedZone);
        if (p.toggles) setToggles(t => ({ ...t, ...p.toggles }));
        if (p.opacity) setOpacity(o => ({ ...o, ...p.opacity }));
        if (p.beforeSource) setBeforeSource(p.beforeSource);
        if (typeof p.cloudMax === 'number') setCloudMax(p.cloudMax);
      }
    } catch { /* préférences corrompues : on ignore */ }
    prefsLoaded.current = true;
  }, []);
  useEffect(() => {
    if (!prefsLoaded.current) return;   // n'écrase pas avant le 1er chargement
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        selectedZone, toggles, opacity, beforeSource, cloudMax,
      }));
    } catch { /* quota plein / mode privé : silencieux */ }
  }, [selectedZone, toggles, opacity, beforeSource, cloudMax]);

  // ───────────────────────────────────────────────────────────────────────────
  // Persistance des RÉSULTATS D'ANALYSE via sessionStorage.
  // Problème résolu : en quittant la section Rissad (Surveillance) pour une autre
  // section du site, React démonte ce composant et perd l'analyse affichée. Au
  // retour, tout était vide. On sauvegarde donc l'état des résultats (URLs de
  // tuiles, polygones, stats) et on le restaure au remontage, tant qu'on reste
  // dans le même onglet (sessionStorage survit à la navigation interne et à un
  // refresh accidentel ; il s'efface à la fermeture de l'onglet).
  // ───────────────────────────────────────────────────────────────────────────
  const RESULTS_KEY = 'atlasforest.results.v1';
  const resultsLoaded = useRef(false);
  // Restauration unique au montage
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(RESULTS_KEY);
      if (raw) {
        const r = JSON.parse(raw);
        if (r.beforeTileUrl) setBeforeTileUrl(r.beforeTileUrl);
        if (r.afterTileUrl) setAfterTileUrl(r.afterTileUrl);
        if (r.distTileUrl) setDistTileUrl(r.distTileUrl);
        if (r.ndviTileUrl) setNdviTileUrl(r.ndviTileUrl);
        if (r.nbrTileUrl) setNbrTileUrl(r.nbrTileUrl);
        if (r.highOnlyTileUrl) setHighOnlyTileUrl(r.highOnlyTileUrl);
        if (r.hansenTileUrl) setHansenTileUrl(r.hansenTileUrl);
        if (r.distAlertTileUrl) setDistAlertTileUrl(r.distAlertTileUrl);
        if (r.s1TileUrl) setS1TileUrl(r.s1TileUrl);
        if (r.phenologyTileUrl) setPhenologyTileUrl(r.phenologyTileUrl);
        if (r.multisceneTileUrl) setMultisceneTileUrl(r.multisceneTileUrl);
        if (r.frozen) setFrozen(r.frozen);
        if (r.roiBounds) setRoiBounds(r.roiBounds);
        if (Array.isArray(r.polygons)) setPolygons(r.polygons);
        if (Array.isArray(r.topPolys)) setTopPolys(r.topPolys);
        if (r.realStats) setRealStats(r.realStats);
        if (r.s1Data) setS1Data(r.s1Data);
        if (r.fwData) setFwData(r.fwData);
        if (r.phenologyData) setPhenologyData(r.phenologyData);
        if (r.beforeLabel) setBeforeLabel(r.beforeLabel);
        if (r.afterLabel) setAfterLabel(r.afterLabel);
        if (r.selectedForest) setSelectedForest(r.selectedForest);
        if (r.selectedCanton) setSelectedCanton(r.selectedCanton);
        if (r.analysisLevel) setAnalysisLevel(r.analysisLevel);
      }
    } catch { /* snapshot corrompu : on ignore */ }
    resultsLoaded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Sauvegarde à chaque changement de résultat (après la 1re restauration)
  useEffect(() => {
    if (!resultsLoaded.current) return;
    try {
      // Si aucune analyse n'est présente, on nettoie l'entrée (évite de
      // ressusciter un vieux résultat après un reset volontaire).
      if (!afterTileUrl && !distTileUrl && polygons.length === 0) {
        sessionStorage.removeItem(RESULTS_KEY);
        return;
      }
      sessionStorage.setItem(RESULTS_KEY, JSON.stringify({
        beforeTileUrl, afterTileUrl, distTileUrl, ndviTileUrl, nbrTileUrl,
        highOnlyTileUrl, hansenTileUrl, distAlertTileUrl, s1TileUrl,
        phenologyTileUrl, multisceneTileUrl, polygons, topPolys, realStats,
        s1Data, fwData, phenologyData, beforeLabel, afterLabel,
        selectedForest, selectedCanton, analysisLevel, frozen, roiBounds,
      }));
    } catch { /* quota plein : silencieux (les gros résultats peuvent dépasser) */ }
  }, [
    beforeTileUrl, afterTileUrl, distTileUrl, ndviTileUrl, nbrTileUrl,
    highOnlyTileUrl, hansenTileUrl, distAlertTileUrl, s1TileUrl,
    phenologyTileUrl, multisceneTileUrl, polygons, topPolys, realStats,
    s1Data, fwData, phenologyData, beforeLabel, afterLabel,
    selectedForest, selectedCanton, analysisLevel, frozen, roiBounds,
  ]);

  useEffect(() => {
    checkGeeHealth().then(d => setGeeStatus(d?.gee ? 'ready' : 'error')).catch(() => setGeeStatus('error'));
  }, []);

  useEffect(() => {
    fetch('/assets/data/forest_limits.json').then(r => r.json()).then(setForestBoundary).catch(() => {});
  }, []);

  // Esri Wayback : charge TOUTES les versions publiées (repli si la détection
  // par localisation échoue). On garde aussi le numéro de release (clé API).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json');
        if (!r.ok) return;
        const cfg = await r.json();
        if (cancelled || !cfg || typeof cfg !== 'object') return;
        const items: { url: string; date: string; release: number }[] = [];
        for (const k in cfg) {
          const v = (cfg as any)[k];
          const raw = v && typeof v.itemURL === 'string' ? v.itemURL : '';
          const m = String(v?.itemTitle || '').match(/\d{4}-\d{2}-\d{2}/);
          if (!raw || !m) continue;
          const tpl = raw.replace(/\{level\}/gi, '{z}').replace(/\{row\}/gi, '{y}').replace(/\{col\}/gi, '{x}');
          if (/\{[^}]+\}/.test(tpl.replace(/\{[zxysr]\}/gi, ''))) continue;
          items.push({ url: tpl, date: m[0], release: Number(k) });
        }
        if (cancelled || !items.length) return;
        items.sort((a, b) => a.date.localeCompare(b.date));
        waybackAllRef.current = items;
        setWaybackList(items);
        // défaut : image Wayback la plus proche de la date d'analyse (actEnd)
        setWaybackIdx(nearestIdx(items, actEnd));
      } catch { /* repli S2 conservé, jamais de crash */ }
    })();
    return () => { cancelled = true; };
  }, [refEnd, actEnd]);

  // Conversion lat/lng -> tuile XYZ (pour interroger les services Wayback par lieu)
  const lonLatToTile = (lng: number, lat: number, z: number) => {
    const n = 2 ** z;
    const x = Math.floor(((lng + 180) / 360) * n);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor(((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n);
    return { x, y };
  };

  // HAUTE DÉFINITION + DATES RÉELLES + ZÉRO DOUBLON : pour le centre de carte,
  // on demande à Esri quelles RELEASES Wayback ont réellement changé l'imagerie
  // ici (change-detection), puis pour chacune la DATE DE CAPTURE réelle de la
  // source (Maxar/Airbus...) via le service de métadonnées. Résultat : une frise
  // de vraies prises de vue distinctes, plus aucune version republiée identique.
  const refineWaybackForLocation = async (lat: number, lng: number) => {
    const all = waybackAllRef.current;
    if (!all.length) return;
    const z = 15;
    const { x, y } = lonLatToTile(lng, lat, z);
    try {
      // 1) Releases ayant changé à cet endroit (ordre récent -> ancien)
      const cdUrl = `https://wayback.maptiles.arcgis.com/arcgis/rest/services/world_imagery/wmts/1.0.0/default028mm/MapServer/tile/changeDetection/${z}/${y}/${x}`;
      const cd = await fetch(cdUrl);
      if (!cd.ok) return;
      const releases: number[] = await cd.json();
      if (!Array.isArray(releases) || !releases.length) return;
      const byRelease = new Map(all.map(i => [i.release, i]));
      // 2) Date de capture réelle par release (métadonnées), dédupliquée par date
      const seen = new Set<string>();
      const refined: { url: string; date: string; release: number; capture: string }[] = [];
      await Promise.all(releases.map(async (rel) => {
        const base = byRelease.get(rel);
        if (!base) return;
        let capture = base.date;
        try {
          const mdUrl = `https://wayback.maptiles.arcgis.com/arcgis/rest/services/world_imagery/wmts/1.0.0/default028mm/MapServer/tile/${rel}/${z}/${y}/${x}/metadata?f=json`;
          const md = await fetch(mdUrl);
          if (md.ok) {
            const j = await md.json();
            const d = j?.SRC_DATE || j?.features?.[0]?.attributes?.SRC_DATE;
            if (d) {
              let ds = String(d);
              if (/^\d{10,}$/.test(ds)) ds = new Date(Number(ds)).toISOString().slice(0, 10);
              else if (/^\d{4}$/.test(ds)) ds = `${ds}-01-01`;
              capture = ds;
            }
          }
        } catch { /* garde la date de publication en repli */ }
        refined.push({ ...base, capture });
      }));
      if (!refined.length) return;
      // déduplique par date de capture réelle (zéro mosaïque répétée)
      refined.sort((a, b) => a.capture.localeCompare(b.capture));
      const deduped = refined.filter(r => (seen.has(r.capture) ? false : (seen.add(r.capture), true)));
      // honnêteté : on garde la VRAIE date de capture ; on marque les dates de publication.
      const list = deduped.map(r => ({ url: r.url, date: r.capture, real: r.capture !== r.date }));
      setWaybackList(list as any);
      setWaybackIdx(nearestIdx(list, actEnd));   // défaut = plus proche de l'analyse
    } catch { /* repli : on garde la liste complète déjà affichée */ }
  };

  // Applique l'image Wayback correspondant à l'index choisi (frise temporelle)
  useEffect(() => {
    if (waybackIdx < 0 || !waybackList[waybackIdx]) { setWaybackUrl(null); return; }
    setWaybackUrl(waybackList[waybackIdx].url);
    setWaybackDate(waybackList[waybackIdx].date);
  }, [waybackIdx, waybackList]);

  // v18 — DATE DE PRISE DE VUE REELLE : Wayback affiche la date de PUBLICATION,
  // pas celle de la photo. Esri WorldImagery a une couche "Metadata" qui donne
  // SRC_DATE / SRC_DESC (Maxar, Airbus...) pour la tuile sous le centre de carte.
  useEffect(() => {
    if (beforeSource !== 'wayback' || !toggles.s2Split) { return; }
    const map = mapRef.current; if (!map) return;
    let cancelled = false;
    const fetchCapture = async () => {
      try {
        const c = map.getCenter();
        const url = 'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/identify'
          + `?geometry=${c.lng},${c.lat}&geometryType=esriGeometryPoint&sr=4326`
          + '&layers=all&tolerance=2&mapExtent=' + `${c.lng - 0.01},${c.lat - 0.01},${c.lng + 0.01},${c.lat + 0.01}`
          + '&imageDisplay=2,2,96&returnGeometry=false&f=json';
        const r = await fetch(url); if (!r.ok || cancelled) return;
        const j = await r.json();
        const at = j?.results?.find((x: any) => x?.attributes?.SRC_DATE2 || x?.attributes?.SRC_DATE)?.attributes;
        if (!at) { setCaptureInfo(''); return; }
        const src = at.SRC_DESC || at.NICE_DESC || '';
        const d = at.SRC_DATE2 || at.SRC_DATE || at.DATE || '';
        // SRC_DATE est souvent un timestamp epoch ms
        let dStr = String(d);
        if (/^\d{10,}$/.test(dStr)) dStr = new Date(Number(dStr)).toISOString().slice(0, 10);
        setCaptureInfo([src, dStr].filter(Boolean).join(' · '));
      } catch { if (!cancelled) setCaptureInfo(''); }
    };
    fetchCapture();
    map.on('moveend', fetchCapture);
    return () => { cancelled = true; map.off('moveend', fetchCapture); };
  }, [beforeSource, toggles.s2Split, waybackIdx]);

  // Affine la frise Wayback pour la zone visible (vraies prises de vue, dédupliquées).
  // Debounce léger : se déclenche quand la carte se stabilise.
  useEffect(() => {
    if (beforeSource !== 'wayback' || !toggles.s2Split || !mapReady) return;
    const map = mapRef.current; if (!map) return;
    let timer: any;
    const trigger = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const c = map.getCenter();
        refineWaybackForLocation(c.lat, c.lng);
      }, 600);
    };
    trigger();
    map.on('moveend', trigger);
    return () => { clearTimeout(timer); map.off('moveend', trigger); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beforeSource, toggles.s2Split, mapReady, selectedZone]);

  // v18 — SENTINEL-2 comme source historique "avant" : dates de capture REELLES
  // et garanties (tous les ~5 jours). Beaucoup plus de dates recentes precises.
  useEffect(() => {
    if (beforeSource !== 's2' || !toggles.s2Split) return;
    let cancelled = false;
    (async () => {
      setS2Loading(true);
      try {
        // Fenêtre MAXIMALE : depuis le début de l'archive Sentinel-2 (mi-2015)
        // jusqu'à AUJOURD'HUI -> on capte le plus grand nombre de dates de prise
        // de vue réelles possibles, des plus anciennes aux plus récentes.
        const today = new Date().toISOString().slice(0, 10);
        const end = today;
        const start = '2015-07-01';   // première imagerie Sentinel-2 disponible
        const list = await fetchS2Scenes(buildParams(), start, end);
        if (cancelled || !list?.length) { setS2List([]); setS2Idx(-1); return; }
        list.sort((a, b) => a.date.localeCompare(b.date));
        setS2List(list);
        setS2Idx(nearestIdx(list, actEnd));  // défaut : scène la plus proche de la date d'analyse
      } catch { if (!cancelled) { setS2List([]); setS2Idx(-1); } }
      finally { if (!cancelled) setS2Loading(false); }
    })();
    return () => { cancelled = true; };
  }, [beforeSource, toggles.s2Split, selectedZone, selectedForest, selectedCanton]);

  // Chargement PARESSEUX : si la scène S2 sélectionnée n'a pas encore d'URL de
  // tuiles (seules les plus récentes sont pré-calculées), on la résout à la volée.
  useEffect(() => {
    if (beforeSource !== 's2' || s2Idx < 0) return;
    const scene = s2List[s2Idx];
    if (!scene || scene.url || !scene.id) return;
    let cancelled = false;
    (async () => {
      const url = await fetchS2SceneTile(buildParams(), scene.id!);
      if (cancelled || !url) return;
      setS2List(prev => prev.map((s, i) => (i === s2Idx ? { ...s, url } : s)));
    })();
    return () => { cancelled = true; };
  }, [beforeSource, s2Idx, s2List]);

  // Resout l'URL + la date a afficher selon la source choisie
  const activeBeforeUrl = beforeSource === 's2'
    ? (s2Idx >= 0 ? s2List[s2Idx]?.url ?? null : null)
    : waybackUrl;
  const activeBeforeDate = beforeSource === 's2'
    ? (s2Idx >= 0 ? s2List[s2Idx]?.date ?? '' : '')
    : waybackDate;

  // Centrer la carte sur les limites du domaine forestier de la zone sélectionnée
  useEffect(() => {
    if (!mapReady) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/gee/zone-boundary?zone=${toFlaskZone(selectedZone)}`);
        const data = await res.json();
        if (cancelled || !data?.geojson) return;
        setZoneBoundary(data.geojson);
        const layer = L.geoJSON(data.geojson);
        const b = layer.getBounds();
        if (b.isValid()) mapRef.current?.fitBounds(b, { padding: [30, 30], maxZoom: 13 });
      } catch { /* garde la vue par défaut */ }
    })();
    return () => { cancelled = true; };
  }, [mapReady, selectedZone]);

  // Au CHANGEMENT de zone, on efface les résultats (ils sont propres à la zone).
  // Exception : on saute le tout premier passage (montage) pour laisser la
  // restauration sessionStorage réafficher l'analyse précédente intacte.
  const zoneCleanupSkip = useRef(true);
  useEffect(() => {
    if (zoneCleanupSkip.current) { zoneCleanupSkip.current = false; return; }
    setBeforeTileUrl(null); setAfterTileUrl(null); setDistTileUrl(null); setNdviTileUrl(null); setNbrTileUrl(null); setHighOnlyTileUrl(null);
    setHansenTileUrl(null); setDistAlertTileUrl(null); setS1TileUrl(null); setPhenologyTileUrl(null); setMultisceneTileUrl(null);
    setPolygons([]); setTopPolys([]); setSelectedPolyId(null); setPolyError(null);
    setRealStats(null); setS1Data(null); setFwData(null); setPhenologyData(null); setErrorMsg(null); setFrozen({}); setRoiBounds(null);
    setSelectedForest('');   // v15 — la liste des forêts dépend du centre
    setSelectedCanton('');   // v16 — reset canton
  }, [selectedZone]);

  useEffect(() => { if (phenologyData) setIsPhenologyExpanded(true); }, [phenologyData]);
  useEffect(() => { if (s1Data || realStats) setIsStatsExpanded(true); }, [s1Data, realStats]);
  useEffect(() => { if (topPolys.length) setIsTopExpanded(true); }, [topPolys]);

  // ── v15 — Index des forêts par centre (CPF), dérivé du GeoJSON déjà chargé ──
  const forestFeatures: any[] = (forestBoundary?.features ?? []);
  // Map normalisée CPF -> liste triée des forêts (noms canoniques, sans doublons/junk)
  const forestsByCpf = useMemo(() => {
    const idx: Record<string, Set<string>> = {};
    for (const f of forestFeatures) {
      const cpf = normTxt(f?.properties?.CPF);
      const name = normForest(f?.properties?.FORET);
      if (isJunkForest(name)) continue;
      (idx[cpf] ??= new Set()).add(name);
    }
    const out: Record<string, string[]> = {};
    for (const k of Object.keys(idx)) out[k] = Array.from(idx[k]).sort((a, b) => a.localeCompare(b));
    return out;
  }, [forestFeatures]);

  // Forêts du centre actuellement sélectionné
  const forestsForZone: string[] = forestsByCpf[ZONE_TO_CPF[selectedZone] ?? ''] ?? [];

  // v16 — Cantons (sections) de la forêt choisie, limités au CPF courant
  const cantonsForForest = useMemo(() => {
    if (!selectedForest) return [] as string[];
    const cpf = ZONE_TO_CPF[selectedZone] ?? '';
    const set = new Set<string>();
    for (const f of forestFeatures) {
      if (normForest(f?.properties?.FORET) !== selectedForest) continue;
      if (cpf && normTxt(f?.properties?.CPF) !== cpf) continue;
      const ct = normTxt(f?.properties?.CANTON);
      if (ct && !/^-+$/.test(ct)) set.add(ct);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [forestFeatures, selectedForest, selectedZone]);

  // FeatureCollection (parcelles) de la forêt sélectionnée -> envoyé comme roi_geojson
  // FIX v15 — GEE exige system:index string ; les id entiers (QGIS/SHP) causent l'erreur
  // "Value of property 'system:index' must be a string" → on les convertit ici.
  // FIX v16 — on filtre AUSSI par CPF (évite de capter une forêt homonyme d'un autre centre)
  // et par CANTON si sélectionné. Les forêts multi-polygones sont gérées (toutes les parcelles).
  const buildForestRoi = (forestName: string, cantonName?: string) => {
    const cpf = ZONE_TO_CPF[selectedZone] ?? '';
    const feats = forestFeatures
      .filter(f =>
        normForest(f?.properties?.FORET) === forestName &&
        (!cpf || normTxt(f?.properties?.CPF) === cpf) &&
        (!cantonName || normTxt(f?.properties?.CANTON) === cantonName)
      )
      .map(f => {
        if (typeof f?.id === 'number') {
          const { id, ...rest } = f;
          return { ...rest, id: String(id) };
        }
        return f;
      });
    return feats.length ? { type: 'FeatureCollection', features: feats } : null;
  };

  // Recentre la carte sur la forêt (ou le canton) choisi
  useEffect(() => {
    if (analysisLevel !== 'forest' || !selectedForest) return;
    const roi = buildForestRoi(selectedForest, selectedCanton || undefined);
    if (!roi) return;
    try {
      const b = L.geoJSON(roi as any).getBounds();
      if (b.isValid()) mapRef.current?.fitBounds(b, { padding: [25, 25], maxZoom: 15 });
    } catch { /* noop */ }
  }, [analysisLevel, selectedForest, selectedCanton]);

  // Calcule UNE couche figée à la demande quand on l'active après l'analyse.
  const onLayerEnabled = (key: keyof typeof toggles) => {
    const p = buildParams(false);
    if (key === 'forestWatch' && !hansenTileUrl) {
      fetchForestWatchLayer(p).then(fw => { if (fw) { setFwData(fw); setHansenTileUrl(fw.hansenTileUrl); setDistAlertTileUrl(fw.distAlertTileUrl); } else setLayerWarn('Couche Forest Watch indisponible.'); }).catch(() => setLayerWarn('Échec Forest Watch.'));
      return;
    }
    if (key === 'sentinel1' && !s1TileUrl) {
      fetchSentinel1Change(p).then(s1 => { if (s1?.tileUrl) { setS1Data(s1); setS1TileUrl(s1.tileUrl); } else setLayerWarn('Couche Sentinel-1 indisponible.'); }).catch(() => setLayerWarn('Échec Sentinel-1.'));
      return;
    }
    if (key === 'phenology' && !phenologyTileUrl) {
      fetchPhenology(selectedZone, actStart, actEnd, cloudMax).then(ph => { if (ph?.tileUrl) { setPhenologyData(ph); setPhenologyTileUrl(ph.tileUrl); } else setLayerWarn('Couche Phénologie indisponible.'); }).catch(() => setLayerWarn('Échec Phénologie.'));
      return;
    }
    // Couches issues de l'analyse (dist/ndvi/nbr/high) : si absente et analyse faite -> on la calcule seule.
    const setters: Record<string, (u: string) => void> = { dist: setDistTileUrl, ndvi: setNdviTileUrl, nbr: setNbrTileUrl, high: setHighOnlyTileUrl };
    const have: Record<string, string | null> = { dist: distTileUrl, ndvi: ndviTileUrl, nbr: nbrTileUrl, high: highOnlyTileUrl };
    const map: Record<string, string> = { disturbance: 'dist', ndviDelta: 'ndvi', nbrDelta: 'nbr', highOnly: 'high' };
    const ln = map[key as string];
    if (ln && !have[ln] && roiBounds) {
      fetchLayerImage(p, ln).then(r => { if (r?.url) setters[ln](r.url); }).catch(() => {});
    }
  };
  const handleToggle = (key: keyof typeof toggles) => {
    const turningOn = !toggles[key];
    setToggles(prev => ({ ...prev, [key]: !prev[key] }));
    if (turningOn) onLayerEnabled(key);
  };
  // Multi-scène activée après coup -> génère sa couche figée à la demande.
  useEffect(() => {
    if (multiScene && !multisceneTileUrl && roiBounds) {
      fetchLayerImage(buildParams(), 'ms').then(r => { if (r?.url) setMultisceneTileUrl(r.url); }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiScene]);

  const buildParams = (highOnly?: boolean): AnalyzeParams => {
    // v15 — mode forêt : on envoie la géométrie de la forêt comme roi_geojson.
    // `zone` devient le nom de la forêt (pas une clé de centre) -> le backend utilise le roi.
    const forestMode = analysisLevel === 'forest' && !!selectedForest;
    const roiGeojson = forestMode ? buildForestRoi(selectedForest, selectedCanton || undefined) : undefined;
    // On ne génère QUE les couches cochées (+ S2 avant/après pour le swipe).
    const layers: string[] = ['before', 'after'];
    if (toggles.disturbance) layers.push('dist');
    if (toggles.ndviDelta)   layers.push('ndvi');
    if (toggles.nbrDelta)    layers.push('nbr');
    if (highOnly || toggles.highOnly) layers.push('high');
    if (multiScene)          layers.push('ms');
    return {
    zone: forestMode ? (selectedCanton ? `${selectedForest}/${selectedCanton}` : selectedForest) : selectedZone,
    roiGeojson: roiGeojson ?? undefined,
    date1Start: refStart, date1End: refEnd,
    date2Start: actStart, date2End: actEnd,
    cloud: cloudMax, sensitivity: ndviThreshold, nbr: nbrThreshold, ndmi: ndmiThreshold,
    // Haute confiance -> on ne garde que score >= 3 (exports HC). Sinon minConfidence.
    minScore: highOnly ? 3 : minConfidence,
    minArea: minSurface,
    // Triple confirmation -> rigueur max (optique + radar + persistance + Hansen + saisonnier)
    // Preuves lourdes selon le mode : express=aucune | standard=+saisonnier | rigoureux=+radar+temporel
    useRadar:    analysisMode === 'rigorous' || toggles.sentinel1,
    useTemporal: analysisMode === 'rigorous',
    useSeasonal: analysisMode !== 'express',   // baseline 3 ans : tue jachère/sécheresse
    useExternal: true, // Hansen + DIST-ALERT global peu couteux -> toujours actif
    useForest: true,   // contexte vegetal (NDVI ref u couvert arbore) -> domaine boise
    useMultiscene: true, minScenes,  // persistance multi-scenes = colonne vertebrale
    layers,
    };
  };

  const resetParams = () => {
    setCloudMax(30); setNdviThreshold(0.15); setNbrThreshold(0.15);
    setNdmiThreshold(0.12); setMinSurface(500); setMinConfidence(2);
    setBeforeTileUrl(null); setAfterTileUrl(null); setDistTileUrl(null); setNdviTileUrl(null); setNbrTileUrl(null); setHighOnlyTileUrl(null);
    setHansenTileUrl(null); setDistAlertTileUrl(null); setS1TileUrl(null); setPhenologyTileUrl(null); setMultisceneTileUrl(null);
    setPolygons([]); setTopPolys([]); setSelectedPolyId(null); setPolyError(null);
    setRealStats(null); setS1Data(null); setFwData(null); setPhenologyData(null); setErrorMsg(null); setFrozen({}); setRoiBounds(null);
  };

  const resetMap = () => {
    if (zoneBoundary) {
      const b = L.geoJSON(zoneBoundary).getBounds();
      if (b.isValid()) { mapRef.current?.fitBounds(b, { padding: [30, 30], maxZoom: 13 }); return; }
    }
    mapRef.current?.setView([35.5785, -5.3684], 11); // Tétouan
  };

  // Fix #4 — Géolocalisation : centre la carte sur la position GPS de l'agent
  // (utile sur le terrain) et y dépose un marqueur. Aucune dépendance externe.
  const locateMe = () => {
    if (!('geolocation' in navigator)) { setErrorMsg('Géolocalisation non supportée par ce navigateur.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setUserPos({ lat: latitude, lng: longitude, acc: accuracy });
        mapRef.current?.flyTo([latitude, longitude], 16);
        setLocating(false);
      },
      (err) => {
        setErrorMsg(err.code === 1 ? 'Autorisation de localisation refusée.' : 'Position introuvable.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };

  // ── Analyse principale (v19 — asynchrone : barre de progression, sans timeout) ──
  const handleAnalyze = async (highOnlyOverride?: boolean) => {
    if (geeStatus === 'error') { setErrorMsg('GEE hors-ligne — vérifier PythonAnywhere'); return; }
    setIsAnalyzing(true); setErrorMsg(null);
    setAnalyzeProgress(0); setAnalyzeMessage('Initialisation…');
    const params = buildParams(highOnlyOverride);

    try {
      const result = await runAnalyzeAsync(
        params,
        (u) => { setAnalyzeProgress(u.progress); setAnalyzeMessage(u.message); },
        (h) => { cancelRef.current = h.cancel; },
      );
      setBeforeTileUrl(result.beforeTileUrl);   // ← swipe : S2 AVANT (tuiles)
      setAfterTileUrl(result.afterTileUrl);
      // Couches analytiques = TUILES LIVE (cache disque côté serveur -> rapides, ne disparaissent pas)
      setRoiBounds(result.roiBounds ?? null);   // signal "analyse faite" (pour le calcul à la demande)
      setDistTileUrl(result.distTileUrl);
      setNdviTileUrl(result.ndviTileUrl);
      setNbrTileUrl(result.nbrTileUrl ?? null);
      setHighOnlyTileUrl(result.highOnlyTileUrl ?? null);
      setRealStats(result.stats);
      setPolygons(result.polygons?.features ?? []);
      if (result.beforeLabel) setBeforeLabel(result.beforeLabel);
      if (result.afterLabel) setAfterLabel(result.afterLabel);
      setPolyError(result.poly_error ?? null);
      setMultisceneTileUrl(result.multisceneTileUrl ?? null);

      // Top-N : pris directement des polygones (déjà triés par aire) -> 0 requête en plus
      const allPolys = result.polygons?.features ?? [];
      setTopPolys(allPolys.slice(0, 20));

      // v20/22 — archive automatique des alertes haute-confiance (suivi + validation)
      const hc = allPolys.filter(f => ['high', 'highest'].includes(f.properties?.confidence));
      if (hc.length) {
        saveAlerts(hc, params.zone ?? selectedZone, 3, 'changement')
          .then(n => {
            if (n) {
              setSavedToast(`✓ ${n} إنذاراً محفوظاً للمتابعة`);
              setTimeout(() => setSavedToast(''), 4000);
              loadSavedAlerts();
            }
          })
          .catch(() => { /* Supabase non configuré : silencieux */ });
      }

      // Forest Watch (Hansen / DIST-ALERT) — couche optionnelle : un échec
      // n'interrompt pas l'analyse principale, mais on prévient l'utilisateur.
      if (toggles.forestWatch) {
        fetchForestWatchLayer(params).then(fw => {
          if (fw) { setFwData(fw); setHansenTileUrl(fw.hansenTileUrl); setDistAlertTileUrl(fw.distAlertTileUrl); }
          else setLayerWarn('Couche Forest Watch indisponible.');
        }).catch(e => { console.warn('[FW]', e); setLayerWarn('Échec du chargement Forest Watch.'); });
      }
      // Sentinel-1
      if (toggles.sentinel1) {
        fetchSentinel1Change(params).then(s1 => {
          if (s1?.tileUrl) { setS1Data(s1); setS1TileUrl(s1.tileUrl); }
          else setLayerWarn('Couche Sentinel-1 indisponible.');
        }).catch(e => { console.warn('[S1]', e); setLayerWarn('Échec du chargement Sentinel-1.'); });
      }
      // Phénologie
      if (toggles.phenology) {
        fetchPhenology(selectedZone, actStart, actEnd, cloudMax).then(ph => {
          if (ph?.tileUrl) { setPhenologyData(ph); setPhenologyTileUrl(ph.tileUrl); }
          else setLayerWarn('Couche Phénologie indisponible.');
        }).catch(e => { console.warn('[Phenology]', e); setLayerWarn('Échec du chargement Phénologie.'); });
      }
    } catch (err: any) {
      const msg = err.message || 'Erreur GEE';
      if (msg.includes('annulée')) { /* annulation volontaire : pas d'erreur affichée */ }
      else if (err.name === 'AbortError' || msg.includes('abort') || msg.includes('Délai')) setErrorMsg('Délai dépassé. Réduire la zone ou augmenter cloudMax.');
      else if (msg.includes('GEE non disponible')) setErrorMsg('GEE hors-ligne côté serveur.');
      else if (msg.includes('date')) setErrorMsg(`Dates invalides: ${msg}`);
      else setErrorMsg(msg);
    } finally {
      setIsAnalyzing(false);
      cancelRef.current = null;
      setAnalyzeProgress(0); setAnalyzeMessage('');
    }
  };

  // v19 — annulation de l'analyse en cours (libère le serveur, pas de timeout)
  const cancelAnalyze = async () => {
    try { await cancelRef.current?.(); } catch { /* noop */ }
    setIsAnalyzing(false); cancelRef.current = null;
    setAnalyzeProgress(0); setAnalyzeMessage('');
  };

  // v22 — charge la mémoire (alertes archivées) à l'ouverture/changement de zone
  const loadSavedAlerts = async () => {
    try {
      const zoneKey = (analysisLevel === 'forest' && selectedForest)
        ? (selectedCanton ? `${selectedForest}/${selectedCanton}` : selectedForest)
        : selectedZone;
      const { alerts, by_status } = await fetchSavedAlerts(zoneKey);
      setSavedAlerts(alerts); setStatusCounts(by_status);
    } catch { setSavedAlerts([]); setStatusCounts({}); }
  };
  useEffect(() => { loadSavedAlerts(); /* eslint-disable-next-line */ }, [selectedZone, selectedForest, selectedCanton, analysisLevel]);

  // v21 — ouvre le tableau de bord (charge la fiabilité réelle à la demande)
  const openDashboard = async () => {
    setShowDashboard(true); setDashLoading(true);
    try { setAccuracyRows(await fetchAccuracy()); }
    catch { setAccuracyRows([]); }
    finally { setDashLoading(false); }
  };

  // Statistiques historiques annuelles : lance le calcul pour les années choisies.
  const runAnnualStats = async (yrs?: number[]) => {
    const years = (yrs ?? annualYears).slice().sort((a, b) => a - b);
    if (geeStatus === 'error') { setAnnualError('GEE hors-ligne.'); return; }
    if (years.length < 2) { setAnnualError('Choisissez au moins 2 années pour tracer une tendance.'); return; }
    setAnnualLoading(true); setAnnualError(null);
    try {
      const data = await fetchAnnualStats(buildParams(), years);
      if (data) setAnnualData(data);
      else setAnnualError('Aucune donnée renvoyée.');
    } catch (e: any) {
      setAnnualError(e?.message || 'Échec du calcul annuel.');
    } finally { setAnnualLoading(false); }
  };

  const openAnnual = () => { setShowAnnual(true); if (!annualData) runAnnualStats(); };

  // Bascule une année dans/hors la sélection (2018..année courante)
  const toggleYear = (y: number) => {
    setAnnualYears(prev => prev.includes(y) ? prev.filter(x => x !== y) : [...prev, y].sort((a, b) => a - b));
  };

  // v21 — détection d'incendies (dNBR + thermique FIRMS) sur la zone/période
  const runFireDetection = async () => {
    // Déjà calculé -> simple bascule de visibilité (zéro recalcul GEE).
    if (fireData) { setShowFire(true); setFireVisible(v => !v); return; }
    if (geeStatus === 'error') { setErrorMsg('GEE hors-ligne'); return; }
    setFireLoading(true); setErrorMsg(null);
    try {
      const fire = await fetchFireDetection(buildParams());
      if (fire) {
        setFireData(fire);
        setFireDnbrUrl(fire.dnbrTileUrl);
        setFireThermalUrl(fire.thermalTileUrl);
        setShowFire(true);
        setFireVisible(true);
        // v22 — archive les incendies confirmés (points chauds) dans la même mémoire
        if (fire.fire_confirmed && (fire.firms_points?.length)) {
          const feats = fire.firms_points.map((pt: any, i: number) => ({
            type: 'Feature', geometry: { type: 'Point', coordinates: [pt.lng, pt.lat] },
            properties: { id: i, lat: pt.lat, lng: pt.lng, conf_score: 4, confidence: 'highest',
                          area_ha: 0, preuves: 'incendie+thermique', ndvi_change: 0, nbr_change: 0 },
          }));
          saveAlerts(feats as any, buildParams().zone ?? selectedZone, 3, 'incendie')
            .then(n => { if (n) { setSavedToast(`🔥 ${n} حريقاً محفوظاً`); setTimeout(() => setSavedToast(''), 4000); loadSavedAlerts(); } })
            .catch(() => {});
        }
      } else setErrorMsg('Échec de la détection incendie.');
    } catch (e: any) { setErrorMsg(e.message); }
    finally { setFireLoading(false); }
  };

  // ── Exports (vrais polygones, côté backend) ───────────────────────────────
  const guard = () => { if (!polygons.length) { setErrorMsg('Lancer une analyse d\'abord.'); return false; } return true; };
  // Exports — normaux (selon le filtre courant) ET "haute confiance uniquement"
  const handleExportGeoJson = async (highOnly = false) => { if (!guard()) return; try { await exportPolygonsGeoJson(buildParams(highOnly)); } catch (e: any) { setErrorMsg(e.message); } };
  const handleExportKml     = async (highOnly = false) => { if (!guard()) return; try { await exportPolygonsKml(buildParams(highOnly)); } catch (e: any) { setErrorMsg(e.message); } };
  const handleExportShp     = async (highOnly = false) => { if (!guard()) return; try { await exportPolygonsShp(buildParams(highOnly)); } catch (e: any) { setErrorMsg(e.message); } };
  const handleExportCsv     = (highOnly = false) => { if (!guard()) return;
    const feats = highOnly ? polygons.filter(f => ['high','highest'].includes(f.properties?.confidence)) : polygons;
    exportPolygonsCsv(feats, highOnly ? `${selectedZone}_HC` : selectedZone); };

  // Polygones affichés. (Le filtre "haute confiance" se fait désormais via la
  // couche raster indépendante toggles.highOnly, pas par filtrage des polygones.)
  const displayPolygons = polygons;
  const displayTop = topPolys;

  // ── Sélection de polygone SANS reconstruction de la couche (anti-flicker) ──
  const polyLayerRef = useRef<any>(null);          // référence vers la couche GeoJSON Leaflet
  const selectedLayerRef = useRef<any>(null);      // sous-couche actuellement sélectionnée
  // Renderer canvas (perf) : des centaines de polygones se dessinent sans plomber le DOM
  const canvasRenderer = useRef<any>(L.canvas({ padding: 0.5 })).current;

  const applySelection = (layer: any) => {
    // remet l'ancien à son style normal
    if (selectedLayerRef.current && selectedLayerRef.current !== layer) {
      const pf = selectedLayerRef.current.feature?.properties;
      const pc = CONF_COLOR[pf?.confidence] ?? '#eab308';
      selectedLayerRef.current.setStyle({ color: pc, weight: 1.8, fillColor: pc, fillOpacity: 0.25 });
    }
    if (layer) {
      const c = CONF_COLOR[layer.feature?.properties?.confidence] ?? '#eab308';
      layer.setStyle({ color: c, weight: 3.5, fillColor: c, fillOpacity: 0.5 });
      layer.bringToFront?.();
      selectedLayerRef.current = layer;
      setSelectedPolyId(layer.feature?.properties?.id ?? null);
    }
  };

  // ── Zoom vers un polygone (depuis la liste Top) ───────────────────────────
  const flyToPolygon = (f: PolygonFeature) => {
    try {
      const b = L.geoJSON(f as any).getBounds();
      mapRef.current?.fitBounds(b, { maxZoom: 16, padding: [40, 40] });
      // retrouve la sous-couche correspondante et la sélectionne sans rebuild
      let target: any = null;
      polyLayerRef.current?.eachLayer?.((lyr: any) => {
        if (lyr.feature?.properties?.id === f.properties.id) target = lyr;
      });
      if (target) applySelection(target);
      else setSelectedPolyId(f.properties.id);
    } catch { /* noop */ }
  };

  // ── Stats dérivées ────────────────────────────────────────────────────────
  const highCount  = polygons.filter(f => ['high', 'highest'].includes(f.properties?.confidence)).length;
  const totalCount = polygons.length;
  const meanNdviChange = totalCount > 0
    ? polygons.reduce((s, f) => s + (f.properties?.ndvi_change ?? 0), 0) / totalCount : null;
  const ndviBarPct = meanNdviChange != null ? Math.min(100, Math.abs(meanNdviChange) / 0.4 * 100) : 68;
  const ndviLabel  = meanNdviChange != null ? `${meanNdviChange.toFixed(3)} Δ` : '— —';
  const perturbees = realStats?.total_ha?.toFixed(1) ?? '—';
  const highHaDisp = realStats ? ((realStats.high_ha ?? 0) + (realStats.highest_ha ?? 0)).toFixed(1) : '—';

  const anomaly = phenologyData
    ? (ANOMALY_CONFIG[phenologyData.anomaly_label as AnomalyLabel] ?? ANOMALY_CONFIG.unknown) : null;

  // ─────────────────────────────────────────────────────────────────────────
  // v18 — Ouverture d'un point dans Google Earth PRO (Desktop) via KML telecharge.
  // Un .kml associe a Earth Pro sur l'OS s'ouvre au clic et "vole" vers le point.
  // Point seul (pas de polygone) => fichier minuscule, ouverture instantanee.
  // Expose en global pour etre appelable depuis le HTML du popup Leaflet.
  const openInEarthPro = (lat: number, lng: number, label: string, conf?: string) => {
    const esc = (s: string) => String(s).replace(/[<&>]/g, c => (({ '<': '&lt;', '&': '&amp;', '>': '&gt;' } as Record<string, string>)[c]));
    const name = esc(`Changement ${label}${conf ? ` (${conf})` : ''}`);
    const kml =
`<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${name}</name>
    <Style id="alert"><IconStyle><scale>1.3</scale>
      <Icon><href>http://maps.google.com/mapfiles/kml/paddle/red-circle.png</href></Icon>
    </IconStyle></Style>
    <Placemark>
      <name>${name}</name>
      <styleUrl>#alert</styleUrl>
      <description><![CDATA[Lat ${lat.toFixed(6)} , Lng ${lng.toFixed(6)} — AtlasForest GEE]]></description>
      <LookAt><longitude>${lng}</longitude><latitude>${lat}</latitude>
        <altitude>0</altitude><range>500</range><tilt>0</tilt><heading>0</heading>
        <altitudeMode>relativeToGround</altitudeMode></LookAt>
      <Point><coordinates>${lng},${lat},0</coordinates></Point>
    </Placemark>
  </Document>
</kml>`;
    const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `changement_${lat.toFixed(5)}_${lng.toFixed(5)}.kml`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  // Pont global pour les liens dans les popups Leaflet (HTML injecte)
  useEffect(() => {
    (window as any).__earthPro = openInEarthPro;
    // v22 — verdict terrain depuis le popup : confirmation, maj instantanée, rechargement
    (window as any).__verdict = async (lat: number, lng: number, verdict: 'confirme' | 'faux', sc?: number, btnId?: string) => {
      const label = verdict === 'confirme' ? 'INFRACTION confirmée' : 'FAUX positif';
      if (!window.confirm(`Confirmer ce verdict : ${label} ?\n(${lat.toFixed(5)}, ${lng.toFixed(5)})`)) return;
      const el = btnId ? document.getElementById(btnId) : null;
      if (el) el.innerHTML = '⏳ Enregistrement…';
      const ok = await sendAlertVerdict(lat, lng, verdict, sc);
      if (el) el.innerHTML = ok
        ? (verdict === 'confirme' ? '✅ Infraction enregistrée' : '🚫 Faux positif enregistré')
        : '⚠️ Échec (vérifier Supabase)';
      if (ok) {
        // maj instantanée de la couleur du polygone correspondant
        setVerdictMap(prev => ({ ...prev, [`${lat.toFixed(5)},${lng.toFixed(5)}`]: verdict }));
        loadSavedAlerts();   // rafraîchit la mémoire + compteurs
      }
    };
    return () => { try { delete (window as any).__earthPro; delete (window as any).__verdict; } catch { /* noop */ } };
  }, []);

  // Style de base (statique — la sélection se gère via setStyle, pas via re-render)
  const polyStyle = (f: any) => {
    const p = f.properties ?? {};
    // v22 — si un verdict terrain existe pour ce point, il prime sur la couleur de confiance
    const key = (p.lat != null && p.lng != null) ? `${Number(p.lat).toFixed(5)},${Number(p.lng).toFixed(5)}` : '';
    const v = key ? verdictMap[key] : undefined;
    if (v === 'confirme') return { color: '#16a34a', weight: 2.4, fillColor: '#16a34a', fillOpacity: 0.35 };
    if (v === 'faux')     return { color: '#9ca3af', weight: 1.2, fillColor: '#9ca3af', fillOpacity: 0.12, dashArray: '4 4' };
    const c = CONF_COLOR[p.confidence] ?? '#eab308';
    return { color: c, weight: 1.8, fillColor: c, fillOpacity: 0.25 };
  };
  const onEachPoly = (f: any, layer: any) => {
    const p = f.properties ?? {};
    layer.bindPopup(
      `<div style="font-size:11px;line-height:1.7;min-width:170px">
        <strong>#${p.id} — ${p.confidence}</strong> (classe ${Number(p.conf_score ?? 0).toFixed(0)}/4${p.score_w != null ? ` · pond. ${Number(p.score_w).toFixed(1)}` : ''})<br/>
        Aire: <strong>${Number(p.area_ha ?? 0).toFixed(3)} ha</strong> (${Math.round(p.area_m2 ?? 0)} m²)<br/>
        ${(() => { const ci = causeInfo((p as any).cause); return `Cause probable: <strong style="color:${ci.color}">${ci.emoji} ${ci.label}</strong><br/>`; })()}
        ${(p as any).parcelle_ref ? `Parcelle: <strong>${(p as any).parcelle_ref}</strong><br/>` : ''}
        ${p.preuves ? `Preuves: <strong>${p.preuves}</strong><br/>` : ''}
        NDVI Δ: ${Number(p.ndvi_change ?? 0).toFixed(3)}<br/>
        NBR Δ: ${Number(p.nbr_change ?? 0).toFixed(3)}<br/>
        ${p.n_scenes != null ? `Scènes confirmées: ${Math.round(p.n_scenes)}<br/>` : ''}
        ${p.hansen_year ? `Hansen: ${p.hansen_year}<br/>` : ''}
        ${(p.lat != null && p.lng != null) ? `<span style="color:#555">${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}</span><br/>
        <div style="display:flex;gap:6px;margin-top:5px;flex-wrap:wrap">
          <a href="https://earth.google.com/web/@${p.lat},${p.lng},500a,800d,35y,0h,0t,0r" target="_blank" rel="noopener" style="text-decoration:none;background:#2563eb;color:#fff;padding:4px 8px;border-radius:5px;font-weight:bold;font-size:10px">🌍 Earth Web</a>
          <a href="javascript:void(0)" onclick="window.__earthPro && window.__earthPro(${p.lat},${p.lng},'#${p.id}','${p.confidence}')" style="text-decoration:none;background:#15803d;color:#fff;padding:4px 8px;border-radius:5px;font-weight:bold;font-size:10px">📌 Earth Pro</a>
          <a href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}" target="_blank" rel="noopener" style="text-decoration:none;background:#ea4335;color:#fff;padding:4px 8px;border-radius:5px;font-weight:bold;font-size:10px">🗺️ Maps</a>
          <a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" target="_blank" rel="noopener" style="text-decoration:none;background:#1a73e8;color:#fff;padding:4px 8px;border-radius:5px;font-weight:bold;font-size:10px">🧭 Itinéraire</a>
        </div>
        <div style="border-top:1px solid #e5e7eb;margin-top:7px;padding-top:6px">
          <div style="font-size:9px;color:#888;margin-bottom:3px;font-weight:bold">VERDICT TERRAIN</div>
          <div style="display:flex;gap:6px">
            <button onclick="window.__verdict && window.__verdict(${p.lat},${p.lng},'confirme',${Number(p.conf_score ?? 0)},'vd_${p.id}')" style="cursor:pointer;border:none;background:#16a34a;color:#fff;padding:4px 8px;border-radius:5px;font-weight:bold;font-size:10px">✓ Infraction</button>
            <button onclick="window.__verdict && window.__verdict(${p.lat},${p.lng},'faux',${Number(p.conf_score ?? 0)},'vd_${p.id}')" style="cursor:pointer;border:none;background:#dc2626;color:#fff;padding:4px 8px;border-radius:5px;font-weight:bold;font-size:10px">✗ Faux</button>
          </div>
          <div id="vd_${p.id}" style="font-size:9px;color:#16a34a;margin-top:4px;font-weight:bold"></div>
        </div>` : ''}
      </div>`
    );
    layer.on('click', () => applySelection(layer));
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col md:flex-row h-full font-sans bg-[var(--bg-main)]">

      {/* ── CARTE ─────────────────────────────────────────────────────────── */}
      <div className="relative h-[35vh] md:h-full md:flex-1 bg-[#121214] border-b md:border-b-0 md:border-r border-[var(--border-color)] shrink-0 z-10 md:shrink overflow-hidden">

        <MapContainer center={[35.5785, -5.3684]} zoom={11} maxZoom={19}
          zoomControl={false} zoomAnimation={true}
          style={{ height: '100%', width: '100%' }}>

          <MapRefSetter onReady={(m) => { mapRef.current = m; setMapReady(true); }} />

          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="Hybride + Satellite">
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="OpenStreetMap">
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            </LayersControl.BaseLayer>
          </LayersControl>

          <LayerPanes />

          <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" keepBuffer={8} updateWhenZooming={false} updateWhenIdle={true} maxNativeZoom={18} maxZoom={19} />

          <FeatureGroup>
            <EditControl position="topleft" draw={{ rectangle: true, polygon: true, circle: false, circlemarker: false, marker: false, polyline: false }} />
          </FeatureGroup>

          {/* AVANT (gauche) — source historique (Wayback OU Sentinel-2), CLIPPE a gauche du split.
              Repli: S2 GEE avant. v18 — date de capture reelle, source commutable. */}
          {toggles.s2Split && activeBeforeUrl && (
            <TileLayer key={`hist-${beforeSource}-${activeBeforeUrl}`} url={activeBeforeUrl} pane="paneWaybackLeft"
              {...TILE_PERF} maxNativeZoom={beforeSource === 's2' ? 16 : 18}
              attribution={beforeSource === 's2' ? `Sentinel-2 ${activeBeforeDate}` : `Esri Wayback ${activeBeforeDate}`} />
          )}
          {toggles.s2Split && !activeBeforeUrl && beforeTileUrl && (
            <TileLayer key={`before-${beforeTileUrl}`} url={beforeTileUrl} pane="paneWaybackLeft" {...TILE_PERF} attribution="© GEE / Copernicus S2 (avant)" />
          )}

          {/* v21 — INCENDIES : dNBR (sévérité) + thermique FIRMS, au-dessus des alertes */}
          {showFire && fireVisible && fireDnbrUrl && (
            <TileLayer key={`dnbr-${fireDnbrUrl}`} url={fireDnbrUrl} pane="paneAlertes" opacity={0.75} {...TILE_PERF} attribution="dNBR — sévérité de brûlure" />
          )}
          {showFire && fireVisible && fireThermalUrl && (
            <TileLayer key={`thermal-${fireThermalUrl}`} url={fireThermalUrl} pane="panePolygons" opacity={0.9} {...TILE_PERF} attribution="MODIS/VIIRS FIRMS" />
          )}
          {showFire && fireVisible && (fireData?.firms_points ?? []).map((pt: any, i: number) => (
            <CircleMarker key={`firms-${i}`} center={[pt.lat, pt.lng]} radius={6} pane="panePolygons"
              pathOptions={{ color: '#fff', weight: 1.5, fillColor: '#ff3300', fillOpacity: 0.9 }}>
              <LeafletTooltip>🔥 Point chaud thermique<br/>{pt.lat.toFixed(4)}, {pt.lng.toFixed(4)}</LeafletTooltip>
            </CircleMarker>
          ))}

          {/* v22 — MÉMOIRE : alertes archivées (Supabase), affichées dès l'ouverture de la zone.
              Couleur selon le statut de suivi. N'apparaît que si aucune analyse fraîche n'est en cours. */}
          {displayPolygons.length === 0 && savedAlerts.map((a: any, i: number) => {
            const col = a.status === 'infraction' ? '#16a34a'
                      : a.status === 'faux_positif' ? '#9ca3af'
                      : a.status === 'en_cours' ? '#3b82f6'
                      : a.type === 'incendie' ? '#ea580c' : '#eab308';
            return (
              <CircleMarker key={`saved-${a.geohash}-${i}`} center={[a.lat, a.lng]} radius={7} pane="panePolygons"
                pathOptions={{ color: '#fff', weight: 1.5, fillColor: col, fillOpacity: 0.85 }}
                eventHandlers={{ click: () => mapRef.current?.flyTo([a.lat, a.lng], 16) }}>
                <LeafletTooltip>
                  {a.type === 'incendie' ? '🔥 Incendie' : '🌲 Changement'} — {STATUS_AR[a.status] ?? a.status}<br/>
                  classe {a.conf_score} · {a.area_ha} ha · vu {a.detections}×<br/>
                  {a.lat.toFixed(4)}, {a.lng.toFixed(4)}
                </LeafletTooltip>
              </CircleMarker>
            );
          })}

          {/* S2 APRÈS — pane droite clippée */}
          <MapControls splitPos={splitPos} toggles={toggles} geeAfterUrl={afterTileUrl} />

          {/* Indices (NDVI/NBR/Hansen/SAR/Phéno) — pane indices, SOUS les alertes.
              On garde chaque couche MONTÉE tant que son URL existe et on pilote la
              visibilité via l'opacité (0 = masquée). Ainsi un toggle OFF/ON ne
              démonte pas la couche : les tuiles restent en cache → réaffichage
              instantané, sans recalcul ni rechargement. */}
          {/* Couches analytiques = TUILES LIVE. Montées dès que leur URL existe ;
              la bascule ne change que l'opacité (ré-affichage instantané, pas de
              démontage). Le cache disque serveur (USE_TILE_PROXY) garde les tuiles
              -> elles ne disparaissent plus au zoom. On ne génère que les couches
              demandées (cases cochées) ou calculées à la demande après coup. */}
          {ndviTileUrl && (
            <TileLayer key={`ndvi-${ndviTileUrl}`} url={ndviTileUrl} pane="paneIndices"
              opacity={toggles.ndviDelta ? opacity.ndvi : 0} {...TILE_PERF} attribution="GEE NDVI Δ" />
          )}
          {nbrTileUrl && (
            <TileLayer key={`nbr-${nbrTileUrl}`} url={nbrTileUrl} pane="paneIndices"
              opacity={toggles.nbrDelta ? opacity.nbr : 0} {...TILE_PERF} attribution="GEE NBR Δ (dNBR)" />
          )}
          {hansenTileUrl && (
            <TileLayer key={`hansen-${hansenTileUrl}`} url={hansenTileUrl} pane="paneIndices"
              opacity={toggles.forestWatch ? opacity.hansen : 0} {...TILE_PERF} attribution="UMD Hansen GFC" />
          )}
          {distAlertTileUrl && (
            <TileLayer key={`distalert-${distAlertTileUrl}`} url={distAlertTileUrl} pane="paneIndices"
              opacity={toggles.forestWatch ? opacity.hansen : 0} {...TILE_PERF} attribution="GLAD DIST-ALERT" />
          )}
          {s1TileUrl && (
            <TileLayer key={`s1-${s1TileUrl}`} url={s1TileUrl} pane="paneIndices"
              opacity={toggles.sentinel1 ? opacity.s1 : 0} {...TILE_PERF} attribution="GEE Sentinel-1 SAR" />
          )}
          {phenologyTileUrl && (
            <TileLayer key={`pheno-${phenologyTileUrl}`} url={phenologyTileUrl} pane="paneIndices"
              opacity={toggles.phenology ? opacity.pheno : 0} {...TILE_PERF} attribution="GEE Phénologie" />
          )}

          {/* ALERTES (raster de confiance) — couche PRIMAIRE */}
          {distTileUrl && (
            <TileLayer key={`dist-${distTileUrl}`} url={distTileUrl} pane="paneAlertes"
              opacity={toggles.disturbance ? opacity.alertes : 0} {...TILE_PERF} attribution="GEE Confiance" />
          )}
          {/* HAUTE CONFIANCE (score ≥ 3) */}
          {highOnlyTileUrl && (
            <TileLayer key={`high-${highOnlyTileUrl}`} url={highOnlyTileUrl} pane="paneMultiscene"
              opacity={toggles.highOnly ? opacity.highOnly : 0} {...TILE_PERF} attribution="GEE Haute confiance (≥3)" />
          )}
          {multisceneTileUrl && (
            <TileLayer key={`ms-${multisceneTileUrl}`} url={multisceneTileUrl} pane="paneMultiscene"
              opacity={multiScene ? opacity.multiscene : 0} {...TILE_PERF} attribution="GEE Multi-scène S2" />
          )}

          {/* Limites — pane limits (au-dessus, cliquable) */}
          {showAnefLimit && forestBoundary && (
            <GeoJSON key="forest-boundary" pane="paneLimits" data={forestBoundary}
              style={() => ({ color: '#34d399', weight: 2, dashArray: '8 5', fill: false })} />
          )}
          {zoneBoundary && (
            <GeoJSON key={`zone-${selectedZone}`} pane="paneLimits" data={zoneBoundary}
              style={() => ({ color: '#fbbf24', weight: 2.5, fill: false })} />
          )}

          {/* POLYGONES de perturbation — pane polygons, AU-DESSUS des alertes (cliquables) */}
          {toggles.polygons && displayPolygons.length > 0 && (
            <GeoJSON
              pane="panePolygons"
              key={`polys-${selectedZone}-${displayPolygons.length}-${Object.keys(verdictMap).length}`}
              ref={(r: any) => { polyLayerRef.current = r; }}
              data={{ type: 'FeatureCollection', features: displayPolygons } as any}
              style={polyStyle}
              onEachFeature={onEachPoly}
              {...({ renderer: canvasRenderer } as any)}
            />
          )}

          {/* Fix #4 — marqueur de position GPS de l'utilisateur */}
          {userPos && (
            <CircleMarker center={[userPos.lat, userPos.lng]} radius={8} pane="paneLimits"
              pathOptions={{ color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 0.9 }}>
              <LeafletTooltip>📍 Ma position (±{Math.round(userPos.acc)} m)</LeafletTooltip>
            </CircleMarker>
          )}

          <MapResizer />
        </MapContainer>

        {/* Slider swipe */}
        {toggles.s2Split && (
          <div id="split-slider-container"
            className="absolute top-0 bottom-0 w-12 cursor-ew-resize z-[500] flex items-center justify-center group pointer-events-auto"
            style={{ left: `calc(${splitPos}% - 24px)` }}
            onMouseDown={(e) => {
              e.preventDefault();
              const slider = e.currentTarget;
              const container = slider.parentElement;
              if (!container) return;
              const rect = container.getBoundingClientRect();
              document.body.classList.add('select-none');
              document.body.style.cursor = 'ew-resize';
              let lastP = splitPos;

              const applyClipAt = (p: number) => {
                const mapInst = mapRef.current;
                if (!mapInst) return;
                const pane = mapInst.getPane('splitPaneRight');
                if (!pane) return;
                const nw = mapInst.containerPointToLayerPoint([0, 0] as any);
                const se = mapInst.containerPointToLayerPoint(mapInst.getSize() as any);
                const clipX = nw.x + mapInst.getSize().x * (p / 100);
                pane.style.clip = `rect(${nw.y}px, ${se.x}px, ${se.y}px, ${clipX}px)`;
                const leftPane = mapInst.getPane('paneWaybackLeft');
                if (leftPane) leftPane.style.clip = `rect(${nw.y}px, ${clipX}px, ${se.y}px, ${nw.x}px)`;
              };

              const onMove = (ev: MouseEvent) => {
                let p = ((ev.clientX - rect.left) / rect.width) * 100;
                p = Math.max(0, Math.min(p, 100));
                lastP = p;
                slider.style.left = `calc(${p}% - 24px)`;
                applyClipAt(p);
              };
              const onUp = () => {
                document.body.classList.remove('select-none');
                document.body.style.cursor = '';
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                setSplitPos(lastP);
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
            onTouchStart={() => document.body.classList.add('select-none')}
            onTouchMove={(e) => {
              const rect = e.currentTarget.parentElement?.getBoundingClientRect();
              if (!rect) return;
              let p = ((e.touches[0].clientX - rect.left) / rect.width) * 100;
              p = Math.max(0, Math.min(p, 100));
              e.currentTarget.style.left = `calc(${p}% - 24px)`;
              const mapInst = mapRef.current;
              if (mapInst) {
                const pane = mapInst.getPane('splitPaneRight');
                if (pane) {
                  const nw = mapInst.containerPointToLayerPoint([0, 0] as any);
                  const se = mapInst.containerPointToLayerPoint(mapInst.getSize() as any);
                  const clipX = nw.x + mapInst.getSize().x * (p / 100);
                  pane.style.clip = `rect(${nw.y}px, ${se.x}px, ${se.y}px, ${clipX}px)`;
                  const leftPane = mapInst.getPane('paneWaybackLeft');
                  if (leftPane) leftPane.style.clip = `rect(${nw.y}px, ${clipX}px, ${se.y}px, ${nw.x}px)`;
                }
              }
            }}
            onTouchEnd={(e) => {
              document.body.classList.remove('select-none');
              const rect = e.currentTarget.parentElement?.getBoundingClientRect();
              if (rect && e.changedTouches[0]) {
                let p = ((e.changedTouches[0].clientX - rect.left) / rect.width) * 100;
                setSplitPos(Math.max(0, Math.min(p, 100)));
              }
            }}
          >
            <div className="absolute top-0 bottom-0 left-1/2 -mt-px w-[3px] -ml-[1.5px] bg-white shadow-[0_0_10px_rgba(0,0,0,0.5)] group-hover:bg-[var(--brand)] transition-colors opacity-90" />
            <div className="w-10 h-10 md:w-12 md:h-12 bg-white rounded-full flex items-center justify-center shadow-[0_2px_15px_rgba(0,0,0,0.4)] pointer-events-none group-hover:scale-110 group-hover:bg-[var(--brand)] transition-transform border border-stone-200 z-10 relative">
              <div className="flex gap-0.5 text-stone-500 group-hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
              </div>
            </div>
          </div>
        )}

        {/* v18 — Frise historique "avant" : source commutable (Wayback / Sentinel-2),
            date de PRISE DE VUE reelle, nombre de scenes disponibles. */}
        {toggles.s2Split && (waybackList.length > 0 || beforeSource === 's2') && (
          <div className="absolute top-12 md:top-16 left-2 md:left-4 z-[500] pointer-events-auto bg-black/85 backdrop-blur-xl border border-white/10 rounded-xl px-3 py-2 shadow-2xl flex flex-col gap-1.5 w-[320px] max-w-[90vw]">
            <div className="flex items-center justify-between">
              <div className="flex bg-white/10 rounded-md p-0.5 text-[9px] font-bold">
                <button onClick={() => setBeforeSource('wayback')}
                  className={`px-2 py-0.5 rounded ${beforeSource === 'wayback' ? 'bg-[var(--brand)] text-black' : 'text-white/70'}`}>
                  Aérienne
                </button>
                <button onClick={() => setBeforeSource('s2')}
                  className={`px-2 py-0.5 rounded ${beforeSource === 's2' ? 'bg-[var(--brand)] text-black' : 'text-white/70'}`}>
                  Sentinel-2
                </button>
              </div>
              <div className="flex flex-col items-end leading-none">
                <span className="text-[7px] text-white/50 font-bold uppercase tracking-widest">Image avant</span>
                <span className="text-[13px] text-white font-mono font-bold">{activeBeforeDate || '—'}</span>
              </div>
            </div>

            {/* Frise temporelle type Google Earth Pro : ◀ ▶ + repères de scènes,
                pour naviguer sans se perdre entre les dates. Défaut = plus proche de l'analyse. */}
            {(() => {
              const isS2 = beforeSource === 's2';
              if (isS2 && s2Loading) {
                return <div className="text-[10px] text-white/60 py-1 text-center animate-pulse">Chargement des scènes Sentinel-2 (&lt; 20% nuages)…</div>;
              }
              const list: any[] = isS2 ? s2List : waybackList;
              const idx = isS2 ? s2Idx : waybackIdx;
              const setIdx = isS2 ? setS2Idx : setWaybackIdx;
              const n = list.length;
              if (!n) {
                return isS2
                  ? <div className="text-[10px] text-white/50 py-1 text-center">Aucune scène S2 (&lt; 20% nuages) sur la période.</div>
                  : <div className="text-[10px] text-white/50 py-1 text-center">Chargement de l'imagerie historique…</div>;
              }
              const i0 = Math.max(0, Math.min(n - 1, idx));
              const cur: any = list[i0];
              const go = (d: number) => setIdx(Math.max(0, Math.min(n - 1, i0 + d)));
              return (
                <>
                  <div className="flex items-center gap-2">
                    <button onClick={() => go(-1)} disabled={i0 <= 0}
                      className="w-7 h-7 shrink-0 rounded-md bg-white/10 hover:bg-[var(--brand)] hover:text-black disabled:opacity-30 text-white flex items-center justify-center font-bold text-lg leading-none">‹</button>
                    <div className="relative flex-1 h-7 flex items-center">
                      <div className="absolute inset-x-0 h-[3px] bg-white/15 rounded-full" />
                      <div className="absolute h-[3px] bg-[var(--brand)] rounded-full"
                           style={{ left: 0, width: `${n <= 1 ? 100 : (i0 / (n - 1)) * 100}%` }} />
                      {list.map((s: any, i: number) => (
                        <button key={i} onClick={() => setIdx(i)} title={s.date}
                          className="absolute -translate-x-1/2 inset-y-0 flex items-center group"
                          style={{ left: `${n <= 1 ? 50 : (i / (n - 1)) * 100}%` }}>
                          <span className={`block w-[2px] rounded-full transition-all ${i === i0 ? 'bg-[var(--brand)] h-4' : (s.real === false ? 'bg-amber-400/70 h-3' : 'bg-white/40 h-3')} group-hover:bg-white group-hover:h-4`} />
                        </button>
                      ))}
                      <input type="range" min={0} max={n - 1} step={1} value={i0}
                        onChange={e => setIdx(Number(e.target.value))}
                        className="absolute inset-0 w-full opacity-0 cursor-pointer" />
                    </div>
                    <button onClick={() => go(1)} disabled={i0 >= n - 1}
                      className="w-7 h-7 shrink-0 rounded-md bg-white/10 hover:bg-[var(--brand)] hover:text-black disabled:opacity-30 text-white flex items-center justify-center font-bold text-lg leading-none">›</button>
                  </div>
                  <div className="flex justify-between items-center text-[8px] text-white/40 font-mono mt-1 gap-1">
                    <span>{list[0]?.date}</span>
                    <span className="text-[var(--brand)] font-bold truncate">
                      {i0 + 1}/{n}
                      {isS2
                        ? (cur?.url === null ? ' · ⏳ chargement…' : ` · ☁ ${cur?.cloud ?? 0}%`)
                        : (cur?.real === false ? ' · 🕒 publié' : (captureInfo ? ` · 📷 ${captureInfo}` : ' · 📷 capture'))}
                    </span>
                    <span>{list[n - 1]?.date}</span>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Boutons carte */}
        {savedToast && (
          <div className="absolute top-2 md:top-4 left-1/2 -translate-x-1/2 z-[600] bg-emerald-600/95 text-white text-xs font-bold px-4 py-2 rounded-full shadow-2xl pointer-events-none animate-pulse">
            {savedToast}
          </div>
        )}
        <div className="absolute top-2 md:top-4 inset-x-2 md:inset-x-4 flex justify-between items-start z-[500] pointer-events-none">
          <div />
          <div className="flex flex-col gap-2 pointer-events-auto">
            <button onClick={resetMap} title="Recentrer sur la zone" className="w-8 h-8 md:w-10 md:h-10 bg-black/60 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center text-white hover:scale-110 hover:bg-white/20 transition-all shadow-lg">
              <MapIcon className="w-4 h-4 md:w-5 md:h-5" />
            </button>
            <button onClick={locateMe} title="Localiser ma position GPS" className="w-8 h-8 md:w-10 md:h-10 bg-black/60 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center text-white hover:scale-110 hover:bg-[var(--brand)] hover:border-transparent transition-all">
              <Crosshair className={cn("w-4 h-4 md:w-5 md:h-5", locating && "animate-pulse")} />
            </button>
            {/* v21 — Tableau de bord (à la demande) */}
            <button onClick={openDashboard} title="Tableau de bord" className="w-8 h-8 md:w-10 md:h-10 bg-black/60 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center text-white hover:scale-110 hover:bg-sky-500 hover:border-transparent transition-all shadow-lg">
              <LayoutDashboard className="w-4 h-4 md:w-5 md:h-5" />
            </button>
            {/* Statistiques historiques annuelles (courbes de tendance) */}
            <button onClick={openAnnual} title="Statistiques historiques (courbes annuelles)" className="w-8 h-8 md:w-10 md:h-10 bg-black/60 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center text-white hover:scale-110 hover:bg-emerald-600 hover:border-transparent transition-all shadow-lg">
              <Activity className="w-4 h-4 md:w-5 md:h-5" />
            </button>
            {/* v21 — Détection incendies. Premier clic = lance la détection.
                Une fois lancée, un 2e bouton (œil) masque/réaffiche la couche
                SANS relancer le calcul GEE. */}
            <button onClick={runFireDetection} disabled={fireLoading} title={showFire ? "Relancer la détection d'incendies" : "Détecter les incendies (dNBR + thermique)"}
              className={cn("w-8 h-8 md:w-10 md:h-10 backdrop-blur-md border rounded-full flex items-center justify-center text-white transition-all shadow-lg hover:scale-110",
                showFire ? "bg-orange-600 border-orange-400" : "bg-black/60 border-white/10 hover:bg-orange-600 hover:border-transparent")}>
              <Flame className={cn("w-4 h-4 md:w-5 md:h-5", fireLoading && "animate-pulse")} />
            </button>
            {showFire && (
              <button onClick={() => setFireVisible(v => !v)} title={fireVisible ? "Masquer la couche incendie" : "Afficher la couche incendie"}
                className={cn("w-8 h-8 md:w-10 md:h-10 backdrop-blur-md border rounded-full flex items-center justify-center transition-all shadow-lg hover:scale-110",
                  fireVisible ? "bg-orange-500/90 border-orange-300/50 text-white" : "bg-black/60 border-white/10 text-white/60 hover:bg-white/20")}>
                {fireVisible
                  ? <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1 1 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                  : <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.88 9.88"/></svg>}
              </button>
            )}
          </div>
        </div>

        {/* Gestion des couches — boutons compacts en bas à droite, à côté de la légende */}
        <div className="absolute bottom-10 right-2 md:bottom-14 md:right-4 z-[500] pointer-events-auto flex flex-col gap-1.5 items-end">
          {/* Haute confiance — couche INDÉPENDANTE (score ≥ 3, magenta). Simple
              bascule de visibilité : n'altère pas Alertes, ne relance aucun calcul. */}
          {highOnlyTileUrl && (
            <button onClick={() => handleToggle('highOnly')} title="Afficher/masquer la couche Haute confiance (≥ 3) — indépendante d'Alertes"
              className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold shadow-lg backdrop-blur-md border transition-all",
                toggles.highOnly ? "bg-[#a21caf] text-white border-fuchsia-300/40" : "bg-black/65 text-white/90 border-white/10 hover:bg-black/80")}>
              <ShieldCheck className="w-3.5 h-3.5" /> {toggles.highOnly ? 'Haute conf. ✓' : 'Haute conf.'}
            </button>
          )}
          {/* Limite domaine ANEF — afficher / masquer */}
          <button onClick={() => setShowAnefLimit(v => !v)} title="Limite du domaine forestier ANEF"
            className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold shadow-lg backdrop-blur-md border transition-all",
              showAnefLimit ? "bg-emerald-600/90 text-white border-emerald-300/40" : "bg-black/65 text-white/70 border-white/10 hover:bg-black/80")}>
            <TreePine className="w-3.5 h-3.5" /> Limite ANEF
          </button>
        </div>

        {/* Légende — 4 niveaux de confiance */}
        <div className="absolute bottom-2 md:bottom-4 left-2 md:left-4 z-[500] pointer-events-none flex flex-col gap-2">
          {toggles.polygons && (
            <div className="bg-black/80 backdrop-blur-xl border border-white/10 rounded-xl pointer-events-auto shadow-2xl overflow-hidden min-w-[180px]">
              <div className="p-2 md:p-2.5 bg-black/40 flex items-center justify-between cursor-pointer hover:bg-white/10 transition-colors" onClick={() => setIsLegendMinimized(!isLegendMinimized)}>
                <div className="flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-white/70" />
                  <h4 className="text-[9px] md:text-[10px] font-bold text-white/70 uppercase tracking-widest">Confiance (preuves)</h4>
                </div>
                <svg className={`w-3.5 h-3.5 text-white/50 transition-transform duration-300 ${isLegendMinimized ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              {!isLegendMinimized && (
                <div className="p-2.5 md:p-3 space-y-2">
                  {[['#7f1d1d','Très haute (corrob. forte)'],['#ef4444','Haute (2 preuves fortes)'],['#f97316','Moyenne (1 preuve forte)'],['#eab308','Faible (détecté)']].map(([c, label]) => (
                    <div key={label} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c as string, boxShadow: `0 0 8px ${c}88` }} />
                      <span className="text-[10px] md:text-[11px] text-white/90">{label}</span>
                    </div>
                  ))}
                  <div className="h-px bg-white/10 my-1.5 w-full" />
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm border border-emerald-400 border-dashed" />
                    <span className="text-[10px] md:text-[11px] text-white/90">Limite forêt ANEF</span>
                  </div>
                  {toggles.sentinel1 && s1TileUrl && (
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                      <span className="text-[10px] md:text-[11px] text-white/90">S1 perte SAR</span>
                    </div>
                  )}
                  {toggles.forestWatch && hansenTileUrl && (
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#ff00ff' }} />
                      <span className="text-[10px] md:text-[11px] text-white/90">Hansen / DIST-ALERT</span>
                    </div>
                  )}
                  {toggles.phenology && phenologyTileUrl && anomaly && (
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: anomaly.color }} />
                      <span className="text-[10px] md:text-[11px] text-white/90">{anomaly.emoji} {anomaly.label}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {toggles.s2Split && beforeTileUrl && (
          <>
            <div className="absolute top-2 md:top-4 left-2 md:left-4 bg-blue-600/90 backdrop-blur-md text-white px-2.5 py-1 md:px-3 md:py-1.5 rounded-lg text-[9px] md:text-[11px] font-bold shadow-lg z-[500] flex items-center gap-1.5 max-w-[45%]">
              <span className="text-blue-200">◀ AVANT</span>
              <span className="font-mono font-normal truncate opacity-90">{beforeLabel.replace('Sentinel-2 —', '').trim()}</span>
            </div>
            <div className="absolute top-2 md:top-4 right-[3.5rem] md:right-[4.5rem] bg-amber-500/95 backdrop-blur-md text-black px-2.5 py-1 md:px-3 md:py-1.5 rounded-lg text-[9px] md:text-[11px] font-bold shadow-lg z-[500] flex items-center gap-1.5 max-w-[45%]">
              <span className="font-mono font-normal truncate">{afterLabel.replace('Sentinel-2 —', '').trim()}</span>
              <span>APRÈS ▶</span>
            </div>
          </>
        )}
        {toggles.s2Split && !beforeTileUrl && (
          <div className="absolute top-2 md:top-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-md text-white/90 px-3 py-1.5 rounded-lg text-[9px] md:text-xs font-semibold shadow-lg z-[500] pointer-events-none">
            ↓ Lancez l'analyse pour comparer Sentinel-2 (avant / après)
          </div>
        )}

        {layerWarnMsg && !errorMsg && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-amber-600/95 backdrop-blur-md border border-amber-400/50 text-white text-[10px] md:text-xs px-3 py-2 rounded-lg z-[550] flex items-center gap-2 shadow-xl max-w-[90vw]">
            <span className="shrink-0">⚠</span>
            <span className="flex-1 leading-tight">{layerWarnMsg}</span>
            <button onClick={() => setLayerWarnMsg(null)} className="text-amber-200 hover:text-white shrink-0 font-bold">✕</button>
          </div>
        )}

        <div className="absolute bottom-2 right-2 md:bottom-4 md:right-4 z-[500] pointer-events-none">
          <div className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-bold tracking-wider ${
            geeStatus === 'ready' ? 'bg-emerald-900/80 text-emerald-300' :
            geeStatus === 'error' ? 'bg-red-900/80 text-red-300' : 'bg-zinc-900/70 text-zinc-500'}`}>
            GEE {geeStatus === 'ready' ? '● EN LIGNE' : geeStatus === 'error' ? '● HORS LIGNE' : '● ...'}
          </div>
        </div>

        {errorMsg && (
          <div className="absolute top-14 left-2 md:left-4 right-16 bg-red-900/90 backdrop-blur-md border border-red-700/50 text-white text-[10px] md:text-xs px-3 py-2 rounded-lg z-[500] flex items-center gap-2 shadow-xl">
            <span className="text-red-300 shrink-0">⚠</span>
            <span className="flex-1 leading-tight">{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-white shrink-0 font-bold">✕</button>
          </div>
        )}
        {polyError && !errorMsg && (
          <div className="absolute top-14 left-2 md:left-4 right-16 bg-amber-900/90 backdrop-blur-md border border-amber-700/50 text-white text-[10px] md:text-xs px-3 py-2 rounded-lg z-[500] flex items-center gap-2 shadow-xl">
            <span className="text-amber-300 shrink-0">⚠</span>
            <span className="flex-1 leading-tight">Raster affiché. Polygones non générés (zone trop grande / délai) — réessayez avec une zone plus petite ou « Haute conf. ».</span>
            <button onClick={() => setPolyError(null)} className="text-amber-400 hover:text-white shrink-0 font-bold">✕</button>
          </div>
        )}
      </div>
      <div className={cn(
          "flex-[0_0_auto] flex flex-col bg-[var(--bg-surface)] shadow-[-10px_0_30px_rgba(0,0,0,0.05)] z-[400] relative transition-all duration-300 border-l border-[var(--border-color)]",
          isPanelCollapsed ? "w-4 md:w-6 lg:w-8 cursor-pointer items-center justify-center group hover:bg-[var(--brand-light)]" : "w-full md:w-[360px] lg:w-[400px]")}
        onClick={() => isPanelCollapsed && setIsPanelCollapsed(false)}>
        {isPanelCollapsed && (
          <div className="flex flex-col items-center justify-center h-full w-full relative">
            <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[var(--brand)] shadow-[0_0_10px_var(--brand)]" />
            <PanelRightOpen className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--brand)] -rotate-90 md:rotate-0" />
            <span className="absolute top-[50%] -translate-y-[50%] -rotate-90 whitespace-nowrap text-[8px] font-bold tracking-[0.2em] uppercase text-[var(--text-muted)] opacity-50 mt-16 group-hover:text-[var(--brand)] group-hover:opacity-100 transition-all">Panneau de Contrôle</span>
          </div>
        )}

        {!isPanelCollapsed && (
          <>
            <div className="p-4 md:p-6 border-b border-[var(--border-color)] shrink-0 bg-[var(--bg-surface)] flex justify-between items-center sticky top-0 z-10">
              <div>
                <h2 className="font-black text-lg md:text-xl text-[var(--text-main)] flex items-center gap-2">
                  <Satellite className="w-5 h-5 text-[var(--brand)]" /> AtlasForest GEE
                </h2>
                <p className="text-[10px] md:text-xs text-[var(--text-muted)] font-mono mt-1">Surveillance GEE • v12.0</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={resetParams} className="w-8 h-8 rounded-full bg-[var(--bg-main)] border border-[var(--border-color)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--text-main)] hover:scale-110 hover:shadow-md transition-all" title="Réinitialiser">
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button onClick={() => setIsPanelCollapsed(true)} className="w-8 h-8 rounded-full bg-[var(--bg-main)] border border-[var(--border-color)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--text-main)] hover:scale-110 hover:shadow-md transition-all" title="Fermer">
                  <PanelRightClose className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar pb-24 md:pb-6">

              {/* Zone */}
              <section className="border-b border-stone-200/50 dark:border-stone-800/50 pb-3 mb-3">
                <button onClick={() => setIsZoneExpanded(!isZoneExpanded)} className="w-full text-xs font-bold text-[var(--brand)] uppercase tracking-wider mb-2 flex items-center justify-between group hover:text-[var(--brand-hover)] transition-colors">
                  <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-[var(--brand)] group-hover:scale-110 transition-transform" /> Zone d'analyse</div>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isZoneExpanded ? 'rotate-180' : ''}`} />
                </button>
                <div className={`transition-all duration-300 origin-top overflow-hidden ${isZoneExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="space-y-1 mt-1">
                    {zones.map(z => (
                      <button key={z.id} onClick={() => setSelectedZone(z.id)}
                        className={cn("w-full flex items-center gap-3 p-2 rounded border transition-all text-sm font-medium",
                          selectedZone === z.id ? "bg-[var(--brand-light)] border-[var(--brand)] text-[var(--brand)] shadow-sm" : "bg-transparent border-transparent text-[var(--text-muted)] hover:bg-[var(--bg-main)] hover:text-[var(--text-main)]")}>
                        <z.icon className="w-4 h-4" />{z.label}
                      </button>
                    ))}
                  </div>

                  {/* v15 — Niveau d'analyse : centre entier (CPF) ou forêt seule */}
                  <div className="mt-3 pt-3 border-t border-stone-200/40 dark:border-stone-800/40">
                    <div className="flex gap-1 mb-2">
                      <button onClick={() => setAnalysisLevel('cpf')}
                        className={cn("flex-1 py-1.5 rounded text-[11px] font-bold border transition-all",
                          analysisLevel === 'cpf' ? "bg-[var(--brand-light)] border-[var(--brand)] text-[var(--brand)]" : "bg-transparent border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)]")}>
                        Centre (CPF)
                      </button>
                      <button onClick={() => setAnalysisLevel('forest')}
                        className={cn("flex-1 py-1.5 rounded text-[11px] font-bold border transition-all",
                          analysisLevel === 'forest' ? "bg-[var(--brand-light)] border-[var(--brand)] text-[var(--brand)]" : "bg-transparent border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)]")}>
                        Forêt
                      </button>
                    </div>
                    {analysisLevel === 'forest' && (
                      <>
                        <select value={selectedForest} onChange={e => { setSelectedForest(e.target.value); setSelectedCanton(''); }}
                          className="w-full p-2 rounded border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)] text-sm">
                          <option value="">— Choisir une forêt —</option>
                          {forestsForZone.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                        {!forestsForZone.length && (
                          <p className="text-[10px] text-[var(--text-muted)] mt-1">Aucune forêt pour ce centre (vérifier le champ CPF du GeoJSON).</p>
                        )}
                        {selectedForest && cantonsForForest.length > 0 && (
                          <select value={selectedCanton} onChange={e => setSelectedCanton(e.target.value)}
                            className="w-full p-2 mt-2 rounded border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)] text-sm">
                            <option value="">— Tous les cantons ({cantonsForForest.length}) —</option>
                            {cantonsForForest.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        )}
                        {selectedForest && (
                          <p className="text-[10px] text-[var(--brand)] mt-1 font-semibold">
                            Analyse limitée à : {selectedForest}{selectedCanton ? ` / ${selectedCanton}` : ''}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </section>

              {/* Périodes */}
              <section className="border-b border-stone-200/50 dark:border-stone-800/50 pb-3 mb-3">
                <button onClick={() => setIsPeriodsExpanded(!isPeriodsExpanded)} className="w-full text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center justify-between group hover:text-[var(--text-main)] transition-colors">
                  <div className="flex items-center gap-2"><Calendar className="w-4 h-4 group-hover:text-[var(--brand)] transition-colors" /> Périodes d'Analyse</div>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isPeriodsExpanded ? 'rotate-180' : ''}`} />
                </button>
                <div className={`transition-all duration-300 origin-top overflow-hidden ${isPeriodsExpanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="space-y-3 mt-1">
                    <div className="bg-[var(--bg-main)] p-2.5 rounded-lg border border-[var(--border-color)]">
                      <label className="block text-[10px] font-bold text-[var(--brand)] uppercase tracking-wide mb-1.5 opacity-80">RÉFÉRENCE</label>
                      <div className="flex flex-col gap-2"><DateInput value={refStart} onChange={setRefStart} /><DateInput value={refEnd} onChange={setRefEnd} /></div>
                    </div>
                    <div className="bg-[var(--bg-main)] p-2.5 rounded-lg border border-[var(--border-color)]">
                      <label className="block text-[10px] font-bold text-amber-500 uppercase tracking-wide mb-1.5 opacity-80">ACTUELLE</label>
                      <div className="flex flex-col gap-2"><DateInput value={actStart} onChange={setActStart} /><DateInput value={actEnd} onChange={setActEnd} /></div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Algorithmes */}
              <section className="border-b border-stone-200/50 dark:border-stone-800/50 pb-3 mb-3">
                <button onClick={() => setIsAlgorithmExpanded(!isAlgorithmExpanded)} className="w-full text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center justify-between group hover:text-[var(--text-main)] transition-colors">
                  <div className="flex items-center gap-2"><Anchor className="w-4 h-4 group-hover:text-[var(--brand)] transition-colors" /> Algorithmes</div>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isAlgorithmExpanded ? 'rotate-180' : ''}`} />
                </button>
                <div className={`transition-all duration-300 origin-top overflow-hidden ${isAlgorithmExpanded ? 'max-h-[1400px] opacity-100' : 'max-h-0 opacity-0'}`}>
                  {/* Mode d'analyse — 3 niveaux (léger -> rigoureux). Défaut: Standard.
                      C'est le levier clé de vitesse : on ne paie la rigueur maximale
                      (radar + temporel + baseline) que quand on en a besoin. */}
                  <div className="mt-1 mb-2">
                    <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[var(--bg-main)] border-2 border-[var(--border-color)]">
                      {([
                        ['express',  'Aperçu',    'Rapide'],
                        ['standard', 'Standard',  'Équilibré'],
                        ['rigorous', 'Rigoureux', 'Max'],
                      ] as const).map(([m, label, sub]) => (
                        <button key={m} onClick={() => setAnalysisMode(m)}
                          className={cn("flex flex-col items-center py-1.5 rounded-lg transition-all",
                            analysisMode === m ? "bg-[var(--brand)] text-black shadow-sm" : "text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/5")}>
                          <span className="text-[11px] font-bold leading-tight">{label}</span>
                          <span className="text-[8px] font-mono opacity-80">{sub}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-[8px] text-[var(--text-muted)] mt-1 px-1 leading-snug">
                      {analysisMode === 'express'  && '⚡ Optique + persistance + Hansen. Idéal pour parcourir vite (peut inclure des variations saisonnières).'}
                      {analysisMode === 'standard' && '✓ + ligne de base saisonnière (élimine jachère / sécheresse). Bon équilibre vitesse / fiabilité.'}
                      {analysisMode === 'rigorous' && '🛡️ + radar Sentinel-1 + persistance temporelle. Rigueur maximale pour confirmer (plus lent).'}
                    </p>
                  </div>

                  {/* Multi-scène (S2) — preuve indépendante, ne tourne que si activée */}
                  <div className={cn("p-2.5 rounded-xl border-2 mb-2 transition-all",
                    multiScene ? "border-orange-500/70 bg-orange-500/10" : "border-[var(--border-color)] bg-[var(--bg-main)]")}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Layers className={cn("w-4 h-4 shrink-0", multiScene ? "text-orange-500" : "text-[var(--text-muted)]")} />
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-[var(--text-main)] leading-tight">Détection multi-scène</p>
                          <p className="text-[8px] text-[var(--text-muted)] font-mono truncate">changement répété sur ≥ N scènes S2 réelles</p>
                        </div>
                      </div>
                      <button onClick={() => setMultiScene(v => !v)}
                        className={cn("w-11 h-6 rounded-full relative transition-colors shrink-0", multiScene ? "bg-orange-500" : "bg-black/20 dark:bg-white/20")}>
                        <div className={cn("absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform shadow-sm", multiScene ? "translate-x-5" : "translate-x-0")} />
                      </button>
                    </div>
                    {multiScene && (
                      <div className="mt-2.5 pt-2.5 border-t border-orange-500/20 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Scènes min. confirmant</span>
                          <span className="text-xs font-mono font-bold text-orange-500">≥ {minScenes}</span>
                        </div>
                        <input type="range" min={2} max={5} step={1} value={minScenes}
                          onChange={e => setMinScenes(Number(e.target.value))}
                          className="w-full h-1.5 cursor-pointer" style={{ accentColor: '#f97316' }} />
                        <p className="text-[8px] text-orange-400 font-mono leading-relaxed">
                          🟠 Ajoute +1 au score de confiance là où le changement apparaît dans ≥{minScenes} scènes distinctes. Couche dédiée affichable.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <ToggleCard label="S2 Split"     icon={SplitSquareHorizontal} checked={toggles.s2Split}     onChange={() => handleToggle('s2Split')}     activeColor="#3b82f6" />
                    <ToggleCard label="Alertes"      icon={FileWarning}           checked={toggles.disturbance} onChange={() => handleToggle('disturbance')} activeColor="#eab308" />
                    <ToggleCard label="Polygones"    icon={ShieldAlert}           checked={toggles.polygons}    onChange={() => handleToggle('polygons')}    activeColor="#ef4444" />
                    <ToggleCard label="NDVI Δ"       icon={CloudRain}             checked={toggles.ndviDelta}   onChange={() => handleToggle('ndviDelta')}   activeColor="#10b981" />
                    <ToggleCard label="NBR Δ (feu/coupe)" icon={Flame}            checked={toggles.nbrDelta}    onChange={() => handleToggle('nbrDelta')}    activeColor="#ef4444" />
                    <ToggleCard label="Haute conf. (≥3)" icon={ShieldCheck}      checked={toggles.highOnly}    onChange={() => handleToggle('highOnly')}    activeColor="#a21caf" />
                    <ToggleCard label="Forest Watch" icon={Globe}                 checked={toggles.forestWatch} onChange={() => handleToggle('forestWatch')} activeColor="#d946ef" />
                    <ToggleCard label="Sentinel-1"   icon={Waves}                 checked={toggles.sentinel1}   onChange={() => handleToggle('sentinel1')}   activeColor="#8b5cf6" />
                    <ToggleCard label="Phénologie"   icon={TrendingUp}            checked={toggles.phenology}   onChange={() => handleToggle('phenology')}   activeColor="#f59e0b" />
                    <ToggleCard label="Incendies (FIRMS)" icon={Flame}            checked={showFire && fireVisible} onChange={() => { if (!fireData) runFireDetection(); else setFireVisible(v => !v); }} activeColor="#ea580c" />
                  </div>

                  {/* Opacités fines des couches actives (pas de cartes séparées) */}
                  {(toggles.disturbance || toggles.ndviDelta || toggles.nbrDelta || toggles.highOnly || toggles.forestWatch || toggles.sentinel1 || toggles.phenology || (multiScene && multisceneTileUrl)) && (
                    <div className="mt-2 bg-[var(--bg-main)] p-2.5 rounded-lg border border-[var(--border-color)] space-y-2">
                      <p className="text-[8px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Opacité des couches</p>
                      {toggles.disturbance && <OpacityRow label="Alertes" color="#eab308" value={opacity.alertes} onChange={(v:number)=>setLayerOpacity('alertes',v)} />}
                      {toggles.highOnly    && <OpacityRow label="Haute conf." color="#a21caf" value={opacity.highOnly} onChange={(v:number)=>setLayerOpacity('highOnly',v)} />}
                      {toggles.ndviDelta   && <OpacityRow label="NDVI Δ"  color="#10b981" value={opacity.ndvi}    onChange={(v:number)=>setLayerOpacity('ndvi',v)} />}
                      {toggles.nbrDelta    && <OpacityRow label="NBR Δ"   color="#ef4444" value={opacity.nbr}     onChange={(v:number)=>setLayerOpacity('nbr',v)} />}
                      {toggles.forestWatch && <OpacityRow label="Hansen"  color="#d946ef" value={opacity.hansen}  onChange={(v:number)=>setLayerOpacity('hansen',v)} />}
                      {toggles.sentinel1   && <OpacityRow label="SAR S1"  color="#8b5cf6" value={opacity.s1}      onChange={(v:number)=>setLayerOpacity('s1',v)} />}
                      {toggles.phenology   && <OpacityRow label="Phéno."  color="#f59e0b" value={opacity.pheno}   onChange={(v:number)=>setLayerOpacity('pheno',v)} />}
                      {multiScene && multisceneTileUrl && <OpacityRow label="Multi-sc." color="#ec7014" value={opacity.multiscene} onChange={(v:number)=>setLayerOpacity('multiscene',v)} />}
                    </div>
                  )}

                  {toggles.nbrDelta && (
                    <p className="mt-2 text-[9px] text-red-400 font-mono leading-relaxed px-1">
                      🔥 NBR Δ : chute forte (rouge) = sol brûlé ou coupe rase. Lecture rapide des incendies/coupes, indépendante de la détection FIRMS détaillée.
                    </p>
                  )}

                  {toggles.forestWatch && (
                    <p className="mt-2 text-[9px] text-fuchsia-400 font-mono leading-relaxed px-1">
                      🌍 Hansen GFC v1.13 (global). DIST-ALERT = GLAD HLSDIST quasi-global (couvre le nord du Maroc).
                    </p>
                  )}
                  {toggles.sentinel1 && (
                    <p className="mt-2 text-[9px] text-purple-400 font-mono leading-relaxed px-1">🔵 Bleu = perte SAR · fonctionne sous nuages</p>
                  )}
                  {toggles.phenology && (
                    <p className="mt-1 text-[9px] text-amber-400 font-mono leading-relaxed px-1">📊 NDVI actuel vs baseline 3 ans (même mois)</p>
                  )}
                </div>
              </section>

              {/* Répartition par niveau de confiance (le filtre High se fait sur la carte) */}
              {(toggles.disturbance || toggles.polygons) && realStats && (
                <section className="border-b border-stone-200/50 dark:border-stone-800/50 pb-3 mb-3">
                  <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-2"><FileWarning className="w-4 h-4 text-amber-500" /> Niveaux d'alerte</span>
                  </div>
                  <div className="bg-[var(--bg-main)] p-2.5 rounded-lg border border-[var(--border-color)]">
                    <div className="flex items-center gap-1 text-center">
                      {[['#eab308', realStats.low_ha, 'Faible'], ['#f97316', realStats.medium_ha, 'Moy.'], ['#ef4444', realStats.high_ha, 'Haute'], ['#7f1d1d', realStats.highest_ha, 'T.H.']].map(([c, v, l], i) => (
                        <div key={i} className="flex-1 rounded p-1 bg-[var(--bg-surface)] border border-[var(--border-color)]">
                          <div className="w-full h-1 rounded-full mb-1" style={{ backgroundColor: c as string }} />
                          <p className="text-[9px] font-bold text-[var(--text-main)]">{Number(v ?? 0).toFixed(1)}</p>
                          <p className="text-[7px] text-[var(--text-muted)]">{l as string}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-[8px] text-[var(--text-muted)] font-mono mt-2 leading-relaxed">
                      💡 Bouton « High only » sur la carte pour n'afficher que la haute confiance (score ≥ 3).
                    </p>
                  </div>
                </section>
              )}

              {/* Sensibilités */}
              <section className="border-b border-stone-200/50 dark:border-stone-800/50 pb-3 mb-3">
                <button onClick={() => setIsSensibilityExpanded(!isSensibilityExpanded)} className="w-full text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center justify-between group hover:text-[var(--text-main)] transition-colors">
                  <div className="flex items-center gap-2"><Sliders className="w-4 h-4 group-hover:text-[var(--brand)] transition-colors" /> Sensibilités</div>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isSensibilityExpanded ? 'rotate-180' : ''}`} />
                </button>
                <div className={`transition-all duration-300 origin-top overflow-hidden ${isSensibilityExpanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="bg-[var(--bg-main)] p-3 rounded-lg border border-[var(--border-color)] space-y-3 mt-1">
                    <RangeSlider label="Nuages max"    value={cloudMax}       min={0}   max={100} step={1}    onChange={setCloudMax}       unit="%" />
                    <div className="h-px bg-[var(--border-color)]" />
                    <RangeSlider label="NDVI Δ seuil"  value={ndviThreshold}  min={0}   max={0.5} step={0.01} onChange={setNdviThreshold}  formatter={(v: number) => v.toFixed(2)} />
                    <RangeSlider label="NBR Δ seuil"   value={nbrThreshold}   min={0}   max={0.5} step={0.01} onChange={setNbrThreshold}   formatter={(v: number) => v.toFixed(2)} />
                    <RangeSlider label="NDMI Δ seuil"  value={ndmiThreshold}  min={0}   max={0.5} step={0.01} onChange={setNdmiThreshold}  formatter={(v: number) => v.toFixed(2)} />
                    <div className="h-px bg-[var(--border-color)]" />
                    <RangeSlider label="Surface min"   value={minSurface}     min={100} max={5000} step={100} onChange={setMinSurface}     unit=" m²" />
                    <RangeSlider label="Confiance min (preuves)" value={minConfidence} min={1} max={4} step={1} onChange={setMinConfidence} />
                  </div>
                </div>
              </section>

              {/* Statistiques */}
              <section className="border-b border-stone-200/50 dark:border-stone-800/50 pb-3 mb-3">
                <button onClick={() => setIsStatsExpanded(!isStatsExpanded)} className="w-full text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center justify-between group hover:text-[var(--text-main)] transition-colors">
                  <div className="flex items-center gap-2"><BarChart3 className="w-4 h-4 group-hover:text-[var(--brand)] transition-colors" /> Statistiques</div>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isStatsExpanded ? 'rotate-180' : ''}`} />
                </button>
                <div className={`transition-all duration-300 origin-top overflow-hidden ${isStatsExpanded ? 'max-h-[900px] opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="bg-[var(--bg-main)] p-2.5 rounded-lg border border-[var(--border-color)] mt-1 space-y-2.5">
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="p-2 shadow-sm rounded border border-[var(--border-color)] bg-[var(--bg-surface)]">
                        <p className="text-[9px] text-[var(--text-muted)] font-mono uppercase tracking-wider mb-0.5">Perturbées</p>
                        <div className="flex items-baseline gap-1"><span className="text-sm font-bold text-red-500">{perturbees}</span><span className="text-[9px] text-[var(--text-muted)]">ha</span></div>
                      </div>
                      <div className="p-2 shadow-sm rounded border border-[var(--border-color)] bg-[var(--bg-surface)]">
                        <p className="text-[9px] text-[var(--text-muted)] font-mono uppercase tracking-wider mb-0.5">Sévères (H+)</p>
                        <div className="flex items-baseline gap-1"><span className="text-sm font-bold text-orange-500">{highHaDisp}</span><span className="text-[9px] text-[var(--text-muted)]">ha</span></div>
                      </div>
                      <div className="p-2 shadow-sm rounded border border-[var(--border-color)] bg-[var(--bg-surface)]">
                        <p className="text-[9px] text-[var(--text-muted)] font-mono uppercase tracking-wider mb-0.5">Polyg. High+</p>
                        <div className="flex items-baseline gap-1"><span className="text-sm font-bold text-red-500">{highCount > 0 ? highCount : '—'}</span><span className="text-[9px] text-[var(--text-muted)]">poly</span></div>
                      </div>
                      <div className="p-2 shadow-sm rounded border border-[var(--border-color)] bg-[var(--bg-surface)]">
                        <p className="text-[9px] text-[var(--text-muted)] font-mono uppercase tracking-wider mb-0.5">Total poly.</p>
                        <div className="flex items-baseline gap-1"><span className="text-sm font-bold text-[var(--brand)]">{totalCount > 0 ? totalCount : '—'}</span><span className="text-[9px] text-[var(--text-muted)]">poly</span></div>
                      </div>
                    </div>
                    <div>
                      <p className="text-[9px] text-[var(--text-muted)] font-mono uppercase tracking-wider mb-0.5 flex justify-between pr-1"><span>NDVI Δ moyen</span><span className="text-[var(--brand)] font-bold">{ndviLabel}</span></p>
                      <div className="h-1 w-full bg-[var(--border-color)] rounded-full overflow-hidden"><div className="h-full bg-[var(--brand)] rounded-full transition-all duration-500" style={{ width: `${ndviBarPct}%` }} /></div>
                    </div>
                    {realStats && (
                      <div className="grid grid-cols-4 gap-1 text-center">
                        {[['Faible', realStats.low_ha, '#eab308'], ['Moy.', realStats.medium_ha, '#f97316'], ['Haute', realStats.high_ha, '#ef4444'], ['T.H.', realStats.highest_ha, '#7f1d1d']].map(([l, v, c]) => (
                          <div key={l as string} className="p-1 rounded bg-[var(--bg-surface)] border border-[var(--border-color)]">
                            <p className="text-[8px] font-mono" style={{ color: c as string }}>{l}</p>
                            <p className="text-[10px] font-bold text-[var(--text-main)]">{Number(v ?? 0).toFixed(1)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {toggles.forestWatch && fwData && (
                      <p className="text-[9px] text-fuchsia-400 font-mono">Hansen perte récente: {fwData.hansen_ha} ha — {fwData.note}</p>
                    )}
                    {toggles.sentinel1 && s1Data && (
                      <>
                        <div className="h-px bg-[var(--border-color)]" />
                        <div>
                          <p className="text-[9px] text-[var(--text-muted)] font-mono uppercase tracking-wider mb-0.5 flex justify-between pr-1"><span className="text-purple-400">S1 dVV moyen</span><span className="text-purple-400 font-bold">{s1Data.dVV_stats?.mean?.toFixed(2)} dB</span></p>
                          <div className="h-1 w-full bg-[var(--border-color)] rounded-full overflow-hidden"><div className="h-full bg-purple-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Math.abs(s1Data.dVV_stats?.mean ?? 0) / 10 * 100)}%` }} /></div>
                          {s1Data.loss_ha > 0 && (<p className="text-[9px] text-purple-400 font-mono mt-1">{s1Data.loss_ha?.toFixed(1)} ha perte (dVV &lt; −3 dB)</p>)}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </section>

              {/* TOP — polygones les plus dangereux */}
              <section className="border-b border-stone-200/50 dark:border-stone-800/50 pb-3 mb-3">
                <button onClick={() => setIsTopExpanded(!isTopExpanded)} className="w-full text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center justify-between group hover:text-[var(--text-main)] transition-colors">
                  <div className="flex items-center gap-2"><ShieldAlert className="w-4 h-4 group-hover:text-red-500 transition-colors" /> Top alertes ({displayTop.length})</div>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isTopExpanded ? 'rotate-180' : ''}`} />
                </button>
                <div className={`transition-all duration-300 origin-top overflow-hidden ${isTopExpanded ? 'max-h-[420px] opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="bg-[var(--bg-main)] p-1.5 rounded-lg border border-[var(--border-color)] mt-1 space-y-1 max-h-[360px] overflow-y-auto no-scrollbar">
                    {displayTop.length === 0 && (<p className="text-[10px] text-[var(--text-muted)] text-center py-3">Lancer une analyse pour voir les alertes prioritaires.</p>)}
                    {displayTop.map((f) => {
                      const p = f.properties; const c = CONF_COLOR[p.confidence] ?? '#eab308';
                      return (
                        <button key={p.id} onClick={() => flyToPolygon(f)}
                          className={cn("w-full flex items-center justify-between gap-2 p-2 rounded border transition-all text-left",
                            selectedPolyId === p.id ? "border-[var(--brand)] bg-[var(--bg-surface)]" : "border-transparent bg-[var(--bg-surface)] hover:border-[var(--border-color)]")}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c }} />
                            <span className="text-[11px] font-bold text-[var(--text-main)]">#{p.id}</span>
                            <span className="text-[10px] text-[var(--text-muted)] truncate">{p.confidence} · {Number(p.area_ha).toFixed(2)} ha</span>
                          </div>
                          <MapPin className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* Phénologie */}
              {toggles.phenology && (
                <section className="border-b border-stone-200/50 dark:border-stone-800/50 pb-3 mb-3">
                  <button onClick={() => setIsPhenologyExpanded(!isPhenologyExpanded)} className="w-full text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center justify-between group hover:text-[var(--text-main)] transition-colors">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 group-hover:text-amber-400 transition-colors" />
                      <span>Phénologie</span>
                      {phenologyData?.anomaly_label && phenologyData.anomaly_label !== 'normal' && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: anomaly?.color + '25', color: anomaly?.color }}>{anomaly?.emoji}</span>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isPhenologyExpanded ? 'rotate-180' : ''}`} />
                  </button>
                  <div className={`transition-all duration-300 origin-top overflow-hidden ${isPhenologyExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
                    {phenologyData ? (
                      <div className="bg-[var(--bg-main)] p-2.5 rounded-lg border border-[var(--border-color)] mt-1 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] text-[var(--text-muted)] font-mono uppercase tracking-wider">Anomalie NDVI</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: anomaly?.color + '20', color: anomaly?.color }}>{anomaly?.emoji} {anomaly?.label}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <div className="p-2 rounded border border-[var(--border-color)] bg-[var(--bg-surface)]">
                            <p className="text-[9px] text-[var(--text-muted)] font-mono uppercase tracking-wider mb-0.5">Baseline 3 ans</p>
                            <span className="text-sm font-bold text-[var(--text-main)]">{phenologyData.baseline_ndvi?.toFixed(3) ?? '—'}</span>
                          </div>
                          <div className="p-2 rounded border border-[var(--border-color)] bg-[var(--bg-surface)]">
                            <p className="text-[9px] text-[var(--text-muted)] font-mono uppercase tracking-wider mb-0.5">Actuel</p>
                            <span className="text-sm font-bold" style={{ color: anomaly?.color }}>{phenologyData.current_ndvi?.toFixed(3) ?? '—'}</span>
                          </div>
                        </div>
                        {phenologyData.ndvi_anomaly != null && (
                          <div>
                            <p className="text-[9px] text-[var(--text-muted)] font-mono uppercase tracking-wider mb-0.5 flex justify-between pr-1">
                              <span>Déviation</span>
                              <span className="font-bold" style={{ color: anomaly?.color }}>{phenologyData.ndvi_anomaly > 0 ? '+' : ''}{phenologyData.ndvi_anomaly.toFixed(3)}</span>
                            </p>
                            <div className="h-1.5 w-full bg-[var(--border-color)] rounded-full overflow-hidden relative">
                              <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--text-muted)] opacity-40" />
                              <div className="absolute top-0 h-full rounded-full transition-all duration-500"
                                style={{ width: `${Math.min(50, Math.abs(phenologyData.ndvi_anomaly) / 0.4 * 50)}%`,
                                  left: phenologyData.ndvi_anomaly >= 0 ? '50%' : `${50 - Math.min(50, Math.abs(phenologyData.ndvi_anomaly) / 0.4 * 50)}%`,
                                  backgroundColor: anomaly?.color }} />
                            </div>
                          </div>
                        )}
                        <p className="text-[9px] text-[var(--text-muted)] font-mono">Ref: {phenologyData.baseline_years?.join(', ')} · {phenologyData.period_current}</p>
                      </div>
                    ) : (
                      <div className="bg-[var(--bg-main)] p-3 rounded-lg border border-[var(--border-color)] mt-1 text-center">
                        <p className="text-[10px] text-[var(--text-muted)]">{isAnalyzing ? '⏳ Calcul baseline...' : '↑ Lancer une analyse'}</p>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Export */}
              <section className="border-b border-stone-200/50 dark:border-stone-800/50 pb-3 mb-3 last:border-0 last:pb-0 last:mb-0">
                <button onClick={() => setIsExportExpanded(!isExportExpanded)} className="w-full text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center justify-between group hover:text-[var(--text-main)] transition-colors">
                  <div className="flex items-center gap-2"><DownloadCloud className="w-4 h-4 group-hover:text-[var(--brand)] transition-colors" /> Exporter (polygones)</div>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isExportExpanded ? 'rotate-180' : ''}`} />
                </button>
                <div className={`transition-all duration-300 origin-top overflow-hidden ${isExportExpanded ? 'max-h-[900px] opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="mt-1 space-y-2">
                    {/* Toutes les alertes */}
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-amber-500 mb-1 px-1">🟡 Toutes les alertes</p>
                      <div className="bg-[var(--bg-main)] p-1.5 rounded-lg border border-[var(--border-color)] space-y-1">
                        <button onClick={() => handleExportGeoJson(false)} className="w-full flex justify-between items-center bg-[var(--bg-surface)] border border-transparent p-2 rounded hover:border-[var(--brand)] hover:text-[var(--brand)] hover:shadow-sm transition-all group">
                          <div className="flex items-center gap-2 text-xs font-medium"><MapIcon className="w-3.5 h-3.5 text-blue-500" /> GeoJSON (.geojson)</div>
                          <Download className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                        <button onClick={() => handleExportKml(false)} className="w-full flex justify-between items-center bg-[var(--bg-surface)] border border-transparent p-2 rounded hover:border-[var(--brand)] hover:text-[var(--brand)] hover:shadow-sm transition-all group">
                          <div className="flex items-center gap-2 text-xs font-medium"><MapPin className="w-3.5 h-3.5 text-green-500" /> KML (.kml)</div>
                          <Download className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                        <button onClick={() => handleExportShp(false)} className="w-full flex justify-between items-center bg-[var(--bg-surface)] border border-transparent p-2 rounded hover:border-[var(--brand)] hover:text-[var(--brand)] hover:shadow-sm transition-all group">
                          <div className="flex items-center gap-2 text-xs font-medium"><Layers className="w-3.5 h-3.5 text-purple-500" /> Shapefile (.zip)</div>
                          <Download className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                        <button onClick={() => handleExportCsv(false)} className="w-full flex justify-between items-center bg-[var(--bg-surface)] border border-transparent p-2 rounded hover:border-[var(--brand)] hover:text-[var(--brand)] hover:shadow-sm transition-all group">
                          <div className="flex items-center gap-2 text-xs font-medium"><FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" /> CSV (.csv)</div>
                          <Download className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      </div>
                    </div>
                    {/* Haute confiance uniquement */}
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-red-500 mb-1 px-1 flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> Haute confiance uniquement</p>
                      <div className="bg-red-950/20 p-1.5 rounded-lg border border-red-900/40 space-y-1">
                        <button onClick={() => handleExportGeoJson(true)} className="w-full flex justify-between items-center bg-[var(--bg-surface)] border border-transparent p-2 rounded hover:border-red-500 hover:text-red-400 hover:shadow-sm transition-all group">
                          <div className="flex items-center gap-2 text-xs font-medium"><MapIcon className="w-3.5 h-3.5 text-red-500" /> GeoJSON — HC</div>
                          <Download className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                        <button onClick={() => handleExportShp(true)} className="w-full flex justify-between items-center bg-[var(--bg-surface)] border border-transparent p-2 rounded hover:border-red-500 hover:text-red-400 hover:shadow-sm transition-all group">
                          <div className="flex items-center gap-2 text-xs font-medium"><Layers className="w-3.5 h-3.5 text-red-500" /> Shapefile — HC</div>
                          <Download className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                        <button onClick={() => handleExportCsv(true)} className="w-full flex justify-between items-center bg-[var(--bg-surface)] border border-transparent p-2 rounded hover:border-red-500 hover:text-red-400 hover:shadow-sm transition-all group">
                          <div className="flex items-center gap-2 text-xs font-medium"><FileSpreadsheet className="w-3.5 h-3.5 text-red-500" /> CSV — HC</div>
                          <Download className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

            </div>

            <div className="p-3 md:p-6 border-t border-[var(--border-color)] bg-[var(--bg-surface)] shrink-0 sticky bottom-0 z-10 pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:pb-6">
              {/* v19 — barre de progression de l'analyse asynchrone */}
              {isAnalyzing && (
                <div className="mb-2">
                  <div className="flex justify-between items-center text-[10px] text-[var(--text-muted)] mb-1">
                    <span className="truncate pr-2">{analyzeMessage || 'Traitement…'}</span>
                    <span className="font-mono font-bold text-[var(--brand)]">{analyzeProgress}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-[var(--bg-main)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--brand)] rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${Math.max(3, analyzeProgress)}%` }} />
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => handleAnalyze()} disabled={isAnalyzing}
                  className={cn("flex-1 py-3 md:py-4 rounded-xl flex items-center justify-center gap-2 text-sm md:text-base font-bold transition-all",
                    isAnalyzing ? "bg-[var(--bg-main)] text-[var(--brand)] border-2 border-[var(--brand)] shadow-none"
                                : "bg-[var(--brand)] text-[var(--bg-main)] shadow-[0_4px_15px_rgba(var(--brand-rgb),0.3)] hover:brightness-110 active:scale-[0.98]")}>
                  {isAnalyzing ? <><Hexagon className="w-4 h-4 md:w-5 md:h-5 animate-spin" /> Analyse… {analyzeProgress}%</>
                              : <><Play className="w-4 h-4 md:w-5 md:h-5 fill-current" /> Lancer l'analyse</>}
                </button>
                {isAnalyzing && (
                  <button onClick={cancelAnalyze}
                    className="px-4 py-3 md:py-4 rounded-xl font-bold text-sm bg-red-500/10 text-red-400 border-2 border-red-500/40 hover:bg-red-500/20 transition-all">
                    Annuler
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ═══ STATISTIQUES HISTORIQUES ANNUELLES (modal indépendant) ═══ */}
      {showAnnual && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowAnnual(false)}>
          <div className="bg-[var(--bg-surface)] rounded-2xl shadow-2xl border border-[var(--border-color)] w-full max-w-2xl max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--border-color)] sticky top-0 bg-[var(--bg-surface)] z-10">
              <h3 className="flex items-center gap-2 font-bold text-[var(--text-main)]">
                <Activity className="w-5 h-5 text-emerald-500" /> Statistiques historiques
              </h3>
              <button onClick={() => setShowAnnual(false)} className="text-[var(--text-muted)] hover:text-[var(--text-main)]"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4">
              {/* Sélection des années (l'utilisateur choisit librement) */}
              <div>
                <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">
                  Années à comparer (même fenêtre saisonnière : juin–juillet)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: (new Date().getFullYear()) - 2018 + 1 }, (_, i) => 2018 + i).map(y => (
                    <button key={y} onClick={() => toggleYear(y)}
                      className={cn("px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all",
                        annualYears.includes(y) ? "bg-emerald-600 text-white border-emerald-400" : "bg-[var(--bg-main)] text-[var(--text-muted)] border-[var(--border-color)] hover:border-emerald-500")}>
                      {y}
                    </button>
                  ))}
                </div>
                <button onClick={() => runAnnualStats()} disabled={annualLoading}
                  className={cn("mt-3 w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all",
                    annualLoading ? "bg-[var(--bg-main)] text-emerald-500 border-2 border-emerald-500" : "bg-emerald-600 text-white hover:brightness-110 active:scale-[0.98]")}>
                  {annualLoading ? <><Hexagon className="w-4 h-4 animate-spin" /> Calcul en cours…</> : <><Play className="w-4 h-4 fill-current" /> Calculer la tendance</>}
                </button>
                <p className="text-[10px] text-[var(--text-muted)] mt-1.5">
                  Le calcul porte sur la sélection actuelle ({analysisLevel === 'forest' && selectedForest ? `forêt ${selectedForest}` : 'centre entier'}).
                </p>
              </div>

              {annualError && (
                <div className="bg-red-900/20 border border-red-700/40 text-red-400 text-xs px-3 py-2 rounded-lg flex items-center gap-2">
                  <span>⚠</span><span>{annualError}</span>
                </div>
              )}

              {annualLoading && !annualData && (
                <div className="text-sm text-[var(--text-muted)] animate-pulse py-8 text-center">Analyse pluriannuelle sur Google Earth Engine… (peut prendre 1–2 min selon le nombre d'années)</div>
              )}

              {annualData && (
                <>
                  {/* Bandeau tendance */}
                  <div className={cn("flex items-center justify-between p-3 rounded-xl border-2",
                    annualData.trend === 'dégradation' ? "border-red-500/60 bg-red-500/10"
                    : annualData.trend === 'amélioration' ? "border-emerald-500/60 bg-emerald-500/10"
                    : "border-[var(--border-color)] bg-[var(--bg-main)]")}>
                    <div className="flex items-center gap-2">
                      <TrendingUp className={cn("w-5 h-5", annualData.trend === 'dégradation' ? "text-red-500 rotate-180" : annualData.trend === 'amélioration' ? "text-emerald-500" : "text-[var(--text-muted)]")} />
                      <div>
                        <p className="text-sm font-bold text-[var(--text-main)] capitalize">{annualData.trend}</p>
                        <p className="text-[10px] text-[var(--text-muted)] font-mono">pente NDVI : {annualData.ndvi_slope_per_year != null ? `${annualData.ndvi_slope_per_year > 0 ? '+' : ''}${annualData.ndvi_slope_per_year}/an` : '—'}</p>
                        {annualData.phase && (
                          <p className={cn("text-[10px] font-bold font-mono mt-0.5",
                            annualData.phase === 'accélération' ? "text-red-500"
                            : annualData.phase === 'récupération' ? "text-emerald-500" : "text-[var(--text-muted)]")}>
                            {annualData.phase === 'accélération' ? '\u26A0\uFE0F dégradation qui s\u2019accélère'
                              : annualData.phase === 'récupération' ? '\u2197\uFE0F en récupération' : '\u2192 rythme constant'}
                            {annualData.recent_slope != null && annualData.early_slope != null
                              ? ` (${annualData.early_slope} \u2192 ${annualData.recent_slope}/an)` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-red-500">{annualData.total_high_conf_ha} ha</p>
                      <p className="text-[10px] text-[var(--text-muted)]">cumul haute conf.</p>
                    </div>
                  </div>

                  {/* Légende des deux courbes */}
                  <div className="flex items-center justify-center gap-5 text-[11px]">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-1 rounded bg-emerald-600 inline-block" /> NDVI moyen forestier</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-1 rounded bg-red-600 inline-block" /> Haute confiance (ha)</span>
                  </div>

                  {/* Graphique */}
                  <div className="bg-[var(--bg-main)] rounded-xl border border-[var(--border-color)] p-3 text-[var(--text-main)]">
                    <AnnualChart series={annualData.series} />
                  </div>

                  {/* Tableau détaillé par année */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="text-[var(--text-muted)] uppercase tracking-wider text-[9px]">
                          <th className="text-left py-1.5 px-2">Année</th>
                          <th className="text-right py-1.5 px-2">NDVI moy.</th>
                          <th className="text-right py-1.5 px-2">Haute conf. (ha)</th>
                          <th className="text-right py-1.5 px-2">Détecté total (ha)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {annualData.series.map(r => (
                          <tr key={r.year} className="border-t border-[var(--border-color)]">
                            <td className="py-1.5 px-2 font-bold text-[var(--text-main)]">{r.year}{r.year === annualData.ref_year ? ' (réf.)' : ''}</td>
                            <td className="py-1.5 px-2 text-right font-mono text-emerald-600">{r.ndvi_mean != null ? r.ndvi_mean.toFixed(3) : '—'}</td>
                            <td className="py-1.5 px-2 text-right font-mono text-red-500 font-bold">{r.high_conf_ha != null ? r.high_conf_ha.toFixed(2) : '—'}</td>
                            <td className="py-1.5 px-2 text-right font-mono text-[var(--text-muted)]">{r.degraded_ha != null ? r.degraded_ha.toFixed(2) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-stretch gap-2">
                    <button onClick={() => annualData && exportAnnualCsv(annualData)}
                      className="flex items-center gap-1.5 px-3 rounded-lg text-xs font-bold bg-[var(--brand)] text-[var(--bg-main)] hover:brightness-110 transition-all shrink-0">
                      <Download className="w-3.5 h-3.5" /> Rapport CSV
                    </button>
                    <p className="flex-1 text-[10px] text-[var(--text-muted)] leading-relaxed bg-[var(--bg-main)] p-2.5 rounded-lg border border-[var(--border-color)]">
                      🛡️ {annualData.note}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ v21 — TABLEAU DE BORD (modal à la demande, n'occupe aucun espace permanent) ═══ */}
      {showDashboard && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowDashboard(false)}>
          <div className="bg-[var(--bg-surface)] rounded-2xl shadow-2xl border border-[var(--border-color)] w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--border-color)] sticky top-0 bg-[var(--bg-surface)]">
              <h3 className="flex items-center gap-2 font-bold text-[var(--text-main)]"><LayoutDashboard className="w-5 h-5 text-sky-500" /> Tableau de bord</h3>
              <button onClick={() => setShowDashboard(false)} className="text-[var(--text-muted)] hover:text-[var(--text-main)]"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-5">
              {/* Fiabilité réelle par classe (validation terrain) */}
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" /> Fiabilité réelle par classe
                </div>
                {dashLoading ? (
                  <div className="text-sm text-[var(--text-muted)] animate-pulse py-3 text-center">Chargement…</div>
                ) : accuracyRows.length ? (
                  <div className="space-y-1.5">
                    {accuracyRows.map((r: any) => (
                      <div key={r.conf_score} className="flex items-center gap-2">
                        <span className="text-xs font-mono w-14 text-[var(--text-main)]">classe {r.conf_score}</span>
                        <div className="flex-1 h-4 bg-[var(--bg-main)] rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${r.accuracy_pct ?? 0}%`, background: (r.accuracy_pct ?? 0) >= 70 ? '#16a34a' : (r.accuracy_pct ?? 0) >= 50 ? '#f59e0b' : '#dc2626' }} />
                        </div>
                        <span className="text-xs font-bold w-20 text-right text-[var(--text-main)]">
                          {r.accuracy_pct != null ? `${r.accuracy_pct}%` : '—'} <span className="text-[var(--text-muted)] font-normal">({r.total})</span>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-[var(--text-muted)] py-2">Aucun verdict terrain encore. Utilisez les boutons ✓/✗ dans les pop-ups des polygones.</div>
                )}
              </div>

              {/* Progression vers le Machine Learning */}
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">
                  <Target className="w-4 h-4 text-purple-500" /> Vers l'apprentissage automatique
                </div>
                {(() => {
                  const total = accuracyRows.reduce((s: number, r: any) => s + (r.total || 0), 0);
                  const goal = 150;
                  const pct = Math.min(100, Math.round(100 * total / goal));
                  return (
                    <>
                      <div className="h-3 w-full bg-[var(--bg-main)] rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-purple-500 to-fuchsia-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
                        <strong className="text-[var(--text-main)]">{total} / {goal}</strong> verdicts collectés.
                        {total >= goal ? ' ✅ Données suffisantes pour entraîner un modèle Random Forest.' : ` Encore ${goal - total} pour activer le modèle auto-apprenant.`}
                      </p>
                    </>
                  );
                })()}
              </div>

              {/* v22 — Liste de travail : alertes ouvertes (clic = vol vers le point) */}
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">
                  <Target className="w-4 h-4 text-red-500" /> Alertes à traiter ({savedAlerts.filter(a => a.status !== 'infraction' && a.status !== 'faux_positif' && a.status !== 'cloture').length})
                </div>
                {/* compteurs par statut */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {Object.entries(statusCounts).map(([s, n]) => (
                    <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-main)] text-[var(--text-main)] font-semibold">
                      {(STATUS_AR[s] ?? s).split(' / ')[1] ?? s}: {n}
                    </span>
                  ))}
                </div>
                {savedAlerts.length ? (
                  <div className="space-y-1 max-h-52 overflow-y-auto">
                    {savedAlerts.filter(a => a.status !== 'cloture').slice(0, 50).map((a: any) => (
                      <button key={a.geohash}
                        onClick={() => { mapRef.current?.flyTo([a.lat, a.lng], 16); setShowDashboard(false); }}
                        className="w-full flex items-center gap-2 text-left p-2 rounded-lg hover:bg-[var(--bg-main)] transition-colors">
                        <span className="text-base shrink-0">{a.type === 'incendie' ? '🔥' : '🌲'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-[var(--text-main)] truncate">
                            classe {a.conf_score} · {a.area_ha} ha
                            <span className="text-[var(--text-muted)] font-normal"> · vu {a.detections}×</span>
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)] font-mono">{a.lat.toFixed(4)}, {a.lng.toFixed(4)}</div>
                        </div>
                        <span className="text-[9px] px-1.5 py-0.5 rounded shrink-0 font-bold"
                          style={{ background: a.status === 'infraction' ? '#16a34a33' : a.status === 'faux_positif' ? '#9ca3af33' : a.status === 'en_cours' ? '#3b82f633' : '#eab30833',
                                   color: a.status === 'infraction' ? '#16a34a' : a.status === 'faux_positif' ? '#6b7280' : a.status === 'en_cours' ? '#3b82f6' : '#a16207' }}>
                          {(STATUS_AR[a.status] ?? a.status).split(' / ')[0]}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-[var(--text-muted)] py-2">Aucune alerte archivée pour cette zone. Lancez une analyse.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ v21 — Carte résultat INCENDIE (apparaît quand une détection est lancée) ═══ */}
      {showFire && fireVisible && fireData && (
        <div className="absolute bottom-20 md:bottom-6 left-2 md:left-4 z-[600] w-[290px] max-w-[88vw] bg-black/85 backdrop-blur-xl border border-orange-500/40 rounded-xl p-3 shadow-2xl text-white pointer-events-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-1.5 font-bold text-sm text-orange-400"><Flame className="w-4 h-4" /> Incendies de forêt</span>
            <button onClick={() => setFireVisible(false)} title="Masquer la couche incendie" className="text-white/50 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          <div className={cn("text-[11px] font-semibold mb-2 px-2 py-1 rounded",
            fireData.fire_confirmed ? "bg-red-500/20 text-red-300" : (fireData.burned_ha > 0 ? "bg-amber-500/20 text-amber-300" : "bg-white/10 text-white/60"))}>
            {fireData.fire_confirmed ? '🔥 ' : ''}{fireData.verdict}
          </div>
          <div className="space-y-1 text-[11px] text-white/80">
            <div className="flex justify-between"><span>Surface brûlée</span><strong>{fireData.burned_ha != null ? `${fireData.burned_ha} ha` : '—'}</strong></div>
            <div className="flex justify-between"><span>Points chauds (FIRMS)</span><strong>{fireData.firms_count}</strong></div>
            <div className="flex justify-between"><span>Période</span><span className="font-mono text-[10px]">{fireData.period}</span></div>
          </div>
          <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-2 text-[9px] text-white/60">
            <span className="px-1.5 py-0.5 rounded" style={{ background: '#fecc5c', color: '#000' }}>faible</span>
            <span className="px-1.5 py-0.5 rounded" style={{ background: '#fd8d3c', color: '#000' }}>modérée</span>
            <span className="px-1.5 py-0.5 rounded" style={{ background: '#e31a1c' }}>élevée</span>
            <span className="px-1.5 py-0.5 rounded" style={{ background: '#800026' }}>sévère</span>
          </div>
        </div>
      )}
    </div>
  );
}