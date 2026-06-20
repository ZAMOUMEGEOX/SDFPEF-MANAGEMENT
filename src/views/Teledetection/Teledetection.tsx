import { useState, useRef, useEffect } from 'react';
import { cn } from '../../lib/utils';
import {
  Satellite, Play, Calendar, CloudRain, ShieldAlert, Layers,
  TreePine, Sliders, SplitSquareHorizontal, FileWarning, CheckCircle2,
  ChevronDown, Hexagon, Crosshair, Map as MapIcon, RotateCcw,
  MapPin, BarChart3, Download, FileSpreadsheet, DownloadCloud,
  PanelRightClose, PanelRightOpen, Anchor, Waves, TrendingUp, Globe
} from 'lucide-react';
import { MapContainer, TileLayer, LayersControl, FeatureGroup, useMap, GeoJSON } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import {
  checkGeeHealth,
  runAnalyze,
  fetchForestWatchLayer,
  fetchSentinel1Change,
  fetchPhenology,
  exportPolygonsGeoJson,
  exportPolygonsKml,
  exportPolygonsShp,
  exportPolygonsCsv,
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

// Options anti-flicker pour les tuiles GEE : garde l'ancien niveau visible
// pendant le chargement du nouveau, et ne recharge qu'à l'arrêt du zoom/pan.
const TILE_PERF = {
  keepBuffer: 6,
  updateWhenZooming: false,
  updateWhenIdle: true,
  crossOrigin: true as const,
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

// Pane droite (clip) = S2 APRÈS ; le S2 AVANT est une couche pleine en dessous
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
      if (!toggles.s2Split) {
        pane.style.display = 'none';
        return;
      }
      pane.style.display = 'block';
      const nw = map.containerPointToLayerPoint([0, 0] as any);
      const se = map.containerPointToLayerPoint(map.getSize() as any);
      const clipX = nw.x + map.getSize().x * (splitPos / 100);
      // clip: rect(top, right, bottom, left) en coordonnées layer
      pane.style.clip = `rect(${nw.y}px, ${se.x}px, ${se.y}px, ${clipX}px)`;
    };

    applyClip();
    map.on('move', applyClip);
    map.on('zoomend', applyClip);
    return () => {
      map.off('move', applyClip);
      map.off('zoomend', applyClip);
    };
  }, [splitPos, toggles.s2Split, paneReady, map, geeAfterUrl]);

  // Pas de couche droite tant que l'analyse n'a pas renvoyé l'image S2 APRÈS (aucun fallback topo)
  if (!paneReady || !toggles.s2Split || !geeAfterUrl) return null;

  return (
    <TileLayer key={geeAfterUrl} url={geeAfterUrl} pane="splitPaneRight" keepBuffer={6} updateWhenZooming={false} updateWhenIdle={true} attribution="© GEE / Copernicus S2 (après)" />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────────────────
export function Teledetection() {
  const [isAnalyzing, setIsAnalyzing]     = useState(false);
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

  const [toggles, setToggles] = useState({
    s2Split: true, disturbance: true, polygons: true,
    ndviDelta: false, forestWatch: false, sentinel1: false, phenology: false,
  });
  // Multi-scène (S2) — détection répétée sur plusieurs scènes réelles. OFF par défaut, indépendante.
  const [multiScene, setMultiScene] = useState(false);
  const [minScenes, setMinScenes]   = useState(2);
  // Couches affichables via boutons sur la carte (gestion de couches, pas de cases)
  const [showAnefLimit, setShowAnefLimit] = useState(true);
  // Triple confirmation : ON par défaut (essentiel à toute analyse rigoureuse)
  const [tripleConf, setTripleConf] = useState(true);
  // Filtre "Haute confiance" : rattaché à la couche Alertes (raster + polygones)
  const [highConfOnly, setHighConfOnly] = useState(false);
  // Opacités réglables des couches raster (gain de place, pas de cartes séparées)
  const [opacity, setOpacity] = useState({ alertes: 0.78, ndvi: 0.72, hansen: 0.80, s1: 0.70, pheno: 0.68, multiscene: 0.80 });
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
  const [hansenTileUrl, setHansenTileUrl]   = useState<string|null>(null);
  const [distAlertTileUrl, setDistAlertTileUrl] = useState<string|null>(null);
  const [s1TileUrl, setS1TileUrl]           = useState<string|null>(null);
  const [phenologyTileUrl, setPhenologyTileUrl] = useState<string|null>(null);
  const [multisceneTileUrl, setMultisceneTileUrl] = useState<string|null>(null);
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
  const [forestBoundary, setForestBoundary] = useState<any>(null);
  const [zoneBoundary, setZoneBoundary]     = useState<any>(null);
  const [mapReady, setMapReady]             = useState(false);
  const [isPhenologyExpanded, setIsPhenologyExpanded] = useState(false);

  const mapRef = useRef<L.Map|null>(null);

  useEffect(() => {
    checkGeeHealth().then(d => setGeeStatus(d?.gee ? 'ready' : 'error')).catch(() => setGeeStatus('error'));
  }, []);

  useEffect(() => {
    fetch('/assets/data/forest_limits.json').then(r => r.json()).then(setForestBoundary).catch(() => {});
  }, []);

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

  useEffect(() => {
    setBeforeTileUrl(null); setAfterTileUrl(null); setDistTileUrl(null); setNdviTileUrl(null);
    setHansenTileUrl(null); setDistAlertTileUrl(null); setS1TileUrl(null); setPhenologyTileUrl(null); setMultisceneTileUrl(null);
    setPolygons([]); setTopPolys([]); setSelectedPolyId(null); setPolyError(null);
    setRealStats(null); setS1Data(null); setFwData(null); setPhenologyData(null); setErrorMsg(null);
  }, [selectedZone]);

  useEffect(() => { if (phenologyData) setIsPhenologyExpanded(true); }, [phenologyData]);
  useEffect(() => { if (s1Data || realStats) setIsStatsExpanded(true); }, [s1Data, realStats]);
  useEffect(() => { if (topPolys.length) setIsTopExpanded(true); }, [topPolys]);

  const handleToggle = (key: keyof typeof toggles) => setToggles(prev => ({ ...prev, [key]: !prev[key] }));

  const buildParams = (highOnly?: boolean): AnalyzeParams => ({
    zone: selectedZone, date1Start: refStart, date1End: refEnd,
    date2Start: actStart, date2End: actEnd,
    cloud: cloudMax, sensitivity: ndviThreshold, nbr: nbrThreshold, ndmi: ndmiThreshold,
    // Haute confiance -> on ne garde que score >= 3 (high + highest)
    minScore: (highOnly ?? highConfOnly) ? 3 : minConfidence,
    minArea: minSurface,
    // Triple confirmation -> rigueur max (optique + radar + persistance + Hansen + saisonnier)
    useRadar:    tripleConf || toggles.sentinel1,
    useTemporal: tripleConf,
    useSeasonal: tripleConf || toggles.phenology,
    useExternal: true, // Hansen peu coûteux -> toujours actif
    useMultiscene: multiScene, minScenes,
  });

  const resetParams = () => {
    setCloudMax(30); setNdviThreshold(0.15); setNbrThreshold(0.15);
    setNdmiThreshold(0.12); setMinSurface(500); setMinConfidence(2);
    setBeforeTileUrl(null); setAfterTileUrl(null); setDistTileUrl(null); setNdviTileUrl(null);
    setHansenTileUrl(null); setDistAlertTileUrl(null); setS1TileUrl(null); setPhenologyTileUrl(null); setMultisceneTileUrl(null);
    setPolygons([]); setTopPolys([]); setSelectedPolyId(null); setPolyError(null);
    setRealStats(null); setS1Data(null); setFwData(null); setPhenologyData(null); setErrorMsg(null);
  };

  const resetMap = () => {
    if (zoneBoundary) {
      const b = L.geoJSON(zoneBoundary).getBounds();
      if (b.isValid()) { mapRef.current?.fitBounds(b, { padding: [30, 30], maxZoom: 13 }); return; }
    }
    mapRef.current?.setView([35.5785, -5.3684], 11); // Tétouan
  };

  // ── Analyse principale ────────────────────────────────────────────────────
  const handleAnalyze = async () => {
    if (geeStatus === 'error') { setErrorMsg('GEE hors-ligne — vérifier PythonAnywhere'); return; }
    setIsAnalyzing(true); setErrorMsg(null);
    const params = buildParams();

    try {
      const result = await runAnalyze(params);
      setBeforeTileUrl(result.beforeTileUrl);   // ← FIX swipe : couche S2 AVANT
      setAfterTileUrl(result.afterTileUrl);
      setDistTileUrl(result.distTileUrl);
      setNdviTileUrl(result.ndviTileUrl);
      setRealStats(result.stats);
      setPolygons(result.polygons?.features ?? []);
      if (result.beforeLabel) setBeforeLabel(result.beforeLabel);
      if (result.afterLabel) setAfterLabel(result.afterLabel);
      setPolyError(result.poly_error ?? null);
      setMultisceneTileUrl(result.multisceneTileUrl ?? null);

      // Top-N : pris directement des polygones (déjà triés par aire) -> 0 requête en plus
      const allPolys = result.polygons?.features ?? [];
      setTopPolys(allPolys.slice(0, 20));

      // Forest Watch (Hansen / DIST-ALERT)
      if (toggles.forestWatch) {
        fetchForestWatchLayer(params).then(fw => {
          if (fw) { setFwData(fw); setHansenTileUrl(fw.hansenTileUrl); setDistAlertTileUrl(fw.distAlertTileUrl); }
        }).catch(e => console.warn('[FW]', e));
      }
      // Sentinel-1
      if (toggles.sentinel1) {
        fetchSentinel1Change(params).then(s1 => {
          if (s1?.tileUrl) setS1TileUrl(s1.tileUrl);
          if (s1) setS1Data(s1);
        }).catch(e => console.warn('[S1]', e));
      }
      // Phénologie
      if (toggles.phenology) {
        fetchPhenology(selectedZone, actStart, actEnd, cloudMax).then(ph => {
          if (ph?.tileUrl) setPhenologyTileUrl(ph.tileUrl);
          if (ph) setPhenologyData(ph);
        }).catch(e => console.warn('[Phenology]', e));
      }
    } catch (err: any) {
      const msg = err.message || 'Erreur GEE';
      if (err.name === 'AbortError' || msg.includes('abort')) setErrorMsg('Délai dépassé (3 min). Réduire la zone ou augmenter cloudMax.');
      else if (msg.includes('GEE non disponible')) setErrorMsg('GEE hors-ligne côté serveur.');
      else if (msg.includes('date')) setErrorMsg(`Dates invalides: ${msg}`);
      else setErrorMsg(msg);
    } finally {
      setIsAnalyzing(false);
    }
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

  // Polygones réellement affichés (respecte "Haute confiance")
  const displayPolygons = highConfOnly
    ? polygons.filter(f => ['high', 'highest'].includes(f.properties?.confidence)) : polygons;
  const displayTop = highConfOnly
    ? topPolys.filter(f => ['high', 'highest'].includes(f.properties?.confidence)) : topPolys;

  // ── Sélection de polygone SANS reconstruction de la couche (anti-flicker) ──
  const polyLayerRef = useRef<any>(null);          // référence vers la couche GeoJSON Leaflet
  const selectedLayerRef = useRef<any>(null);      // sous-couche actuellement sélectionnée

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

  // Style de base (statique — la sélection se gère via setStyle, pas via re-render)
  const polyStyle = (f: any) => {
    const c = CONF_COLOR[f.properties?.confidence] ?? '#eab308';
    return { color: c, weight: 1.8, fillColor: c, fillOpacity: 0.25 };
  };
  const onEachPoly = (f: any, layer: any) => {
    const p = f.properties ?? {};
    layer.bindPopup(
      `<div style="font-size:11px;line-height:1.7;min-width:170px">
        <strong>#${p.id} — ${p.confidence}</strong> (score ${Number(p.conf_score ?? 0).toFixed(1)}/${p.n_scenes != null ? 5 : 4})<br/>
        Aire: <strong>${Number(p.area_ha ?? 0).toFixed(3)} ha</strong> (${Math.round(p.area_m2 ?? 0)} m²)<br/>
        NDVI Δ: ${Number(p.ndvi_change ?? 0).toFixed(3)}<br/>
        NBR Δ: ${Number(p.nbr_change ?? 0).toFixed(3)}<br/>
        ${p.n_scenes != null ? `Scènes confirmées: ${Math.round(p.n_scenes)}<br/>` : ''}
        ${p.hansen_year ? `Hansen: ${p.hansen_year}<br/>` : ''}
      </div>`
    );
    layer.on('click', () => applySelection(layer));
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col md:flex-row h-full font-sans bg-[var(--bg-main)]">

      {/* ── CARTE ─────────────────────────────────────────────────────────── */}
      <div className="relative h-[35vh] md:h-full md:flex-1 bg-[#121214] border-b md:border-b-0 md:border-r border-[var(--border-color)] shrink-0 z-10 md:shrink overflow-hidden">

        <MapContainer center={[35.5785, -5.3684]} zoom={11}
          preferCanvas={true} zoomControl={false} zoomAnimation={true}
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

          <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" keepBuffer={6} updateWhenZooming={false} updateWhenIdle={true} />

          <FeatureGroup>
            <EditControl position="topleft" draw={{ rectangle: true, polygon: true, circle: false, circlemarker: false, marker: false, polyline: false }} />
          </FeatureGroup>

          {/* S2 AVANT — couche pleine (côté gauche du slider) — FIX swipe */}
          {toggles.s2Split && beforeTileUrl && (
            <TileLayer key={`before-${beforeTileUrl}`} url={beforeTileUrl} {...TILE_PERF} attribution="© GEE / Copernicus S2 (avant)" />
          )}

          {/* S2 APRÈS — pane droite clippée */}
          <MapControls splitPos={splitPos} toggles={toggles} geeAfterUrl={afterTileUrl} />

          {/* Couches raster */}
          {toggles.disturbance && distTileUrl && (
            <TileLayer key={distTileUrl} url={distTileUrl} opacity={opacity.alertes} {...TILE_PERF} attribution="GEE Confiance" />
          )}
          {toggles.ndviDelta && ndviTileUrl && (
            <TileLayer key={ndviTileUrl} url={ndviTileUrl} opacity={opacity.ndvi} {...TILE_PERF} attribution="GEE NDVI Δ" />
          )}
          {toggles.forestWatch && hansenTileUrl && (
            <TileLayer key={hansenTileUrl} url={hansenTileUrl} opacity={opacity.hansen} {...TILE_PERF} attribution="UMD Hansen GFC" />
          )}
          {toggles.forestWatch && distAlertTileUrl && (
            <TileLayer key={distAlertTileUrl} url={distAlertTileUrl} opacity={opacity.hansen} {...TILE_PERF} attribution="OPERA DIST-ALERT" />
          )}
          {toggles.sentinel1 && s1TileUrl && (
            <TileLayer key={s1TileUrl} url={s1TileUrl} opacity={opacity.s1} {...TILE_PERF} attribution="GEE Sentinel-1 SAR" />
          )}
          {toggles.phenology && phenologyTileUrl && (
            <TileLayer key={phenologyTileUrl} url={phenologyTileUrl} opacity={opacity.pheno} {...TILE_PERF} attribution="GEE Phénologie" />
          )}
          {multiScene && multisceneTileUrl && (
            <TileLayer key={multisceneTileUrl} url={multisceneTileUrl} opacity={opacity.multiscene} {...TILE_PERF} attribution="GEE Multi-scène S2" />
          )}
          {showAnefLimit && forestBoundary && (
            <GeoJSON key="forest-boundary" data={forestBoundary}
              style={() => ({ color: '#34d399', weight: 2, dashArray: '8 5', fillColor: '#34d399', fillOpacity: 0.05 })} />
          )}

          {/* Limite du domaine de la zone sélectionnée — toujours visible */}
          {zoneBoundary && (
            <GeoJSON key={`zone-${selectedZone}`} data={zoneBoundary}
              style={() => ({ color: '#fbbf24', weight: 2.5, fillColor: '#fbbf24', fillOpacity: 0.04 })} />
          )}

          {/* POLYGONES de perturbation (vecteurs réels) — rendu canvas, pas de rebuild à la sélection */}
          {toggles.polygons && displayPolygons.length > 0 && (
            <GeoJSON
              key={`polys-${selectedZone}-${displayPolygons.length}-${highConfOnly}`}
              ref={(r: any) => { polyLayerRef.current = r; }}
              data={{ type: 'FeatureCollection', features: displayPolygons } as any}
              style={polyStyle}
              onEachFeature={onEachPoly}
            />
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

        {/* Boutons carte */}
        <div className="absolute top-2 md:top-4 inset-x-2 md:inset-x-4 flex justify-between items-start z-[500] pointer-events-none">
          <div />
          <div className="flex flex-col gap-2 pointer-events-auto">
            <button onClick={resetMap} title="Recentrer sur la zone" className="w-8 h-8 md:w-10 md:h-10 bg-black/60 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center text-white hover:scale-110 hover:bg-white/20 transition-all shadow-lg">
              <MapIcon className="w-4 h-4 md:w-5 md:h-5" />
            </button>
            <button title="Localiser" className="w-8 h-8 md:w-10 md:h-10 bg-black/60 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center text-white hover:scale-110 hover:bg-[var(--brand)] hover:border-transparent transition-all">
              <Crosshair className="w-4 h-4 md:w-5 md:h-5" />
            </button>
          </div>
        </div>

        {/* Gestion des couches — boutons compacts en bas à droite, à côté de la légende */}
        <div className="absolute bottom-10 right-2 md:bottom-14 md:right-4 z-[500] pointer-events-auto flex flex-col gap-1.5 items-end">
          {/* High confidence only — bascule la couche Alertes vers score >= 3 uniquement */}
          {(toggles.disturbance || toggles.polygons) && polygons.length > 0 && (
            <button onClick={() => setHighConfOnly(v => !v)} title="Afficher uniquement la haute confiance"
              className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold shadow-lg backdrop-blur-md border transition-all",
                highConfOnly ? "bg-[#7f1d1d] text-white border-red-400/40" : "bg-black/65 text-white/90 border-white/10 hover:bg-black/80")}>
              <ShieldAlert className="w-3.5 h-3.5" /> {highConfOnly ? 'Haute conf. ✓' : 'High only'}
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
                  {[['#7f1d1d','Très haute (4 preuves)'],['#ef4444','Haute (3)'],['#f97316','Moyenne (2)'],['#eab308','Faible (1)']].map(([c, label]) => (
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
                  {/* Barre Triple confirmation — compacte, activée par défaut */}
                  <div className={cn("flex items-center justify-between gap-2 p-2.5 rounded-xl border-2 mt-1 mb-2 transition-all",
                    tripleConf ? "border-green-500/70 bg-green-500/10" : "border-[var(--border-color)] bg-[var(--bg-main)]")}>
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className={cn("w-4 h-4 shrink-0", tripleConf ? "text-green-500" : "text-[var(--text-muted)]")} />
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-[var(--text-main)] leading-tight">Triple confirmation</p>
                        <p className="text-[8px] text-[var(--text-muted)] font-mono truncate">optique + radar + persistance + Hansen</p>
                      </div>
                    </div>
                    <button onClick={() => setTripleConf(v => !v)}
                      className={cn("w-11 h-6 rounded-full relative transition-colors shrink-0", tripleConf ? "bg-green-500" : "bg-black/20 dark:bg-white/20")}>
                      <div className={cn("absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform shadow-sm", tripleConf ? "translate-x-5" : "translate-x-0")} />
                    </button>
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
                    <ToggleCard label="Forest Watch" icon={Globe}                 checked={toggles.forestWatch} onChange={() => handleToggle('forestWatch')} activeColor="#d946ef" />
                    <ToggleCard label="Sentinel-1"   icon={Waves}                 checked={toggles.sentinel1}   onChange={() => handleToggle('sentinel1')}   activeColor="#8b5cf6" />
                    <ToggleCard label="Phénologie"   icon={TrendingUp}            checked={toggles.phenology}   onChange={() => handleToggle('phenology')}   activeColor="#f59e0b" />
                  </div>

                  {/* Opacités fines des couches actives (pas de cartes séparées) */}
                  {(toggles.disturbance || toggles.ndviDelta || toggles.forestWatch || toggles.sentinel1 || toggles.phenology || (multiScene && multisceneTileUrl)) && (
                    <div className="mt-2 bg-[var(--bg-main)] p-2.5 rounded-lg border border-[var(--border-color)] space-y-2">
                      <p className="text-[8px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Opacité des couches</p>
                      {toggles.disturbance && <OpacityRow label="Alertes" color="#eab308" value={opacity.alertes} onChange={(v:number)=>setLayerOpacity('alertes',v)} />}
                      {toggles.ndviDelta   && <OpacityRow label="NDVI Δ"  color="#10b981" value={opacity.ndvi}    onChange={(v:number)=>setLayerOpacity('ndvi',v)} />}
                      {toggles.forestWatch && <OpacityRow label="Hansen"  color="#d946ef" value={opacity.hansen}  onChange={(v:number)=>setLayerOpacity('hansen',v)} />}
                      {toggles.sentinel1   && <OpacityRow label="SAR S1"  color="#8b5cf6" value={opacity.s1}      onChange={(v:number)=>setLayerOpacity('s1',v)} />}
                      {toggles.phenology   && <OpacityRow label="Phéno."  color="#f59e0b" value={opacity.pheno}   onChange={(v:number)=>setLayerOpacity('pheno',v)} />}
                      {multiScene && multisceneTileUrl && <OpacityRow label="Multi-sc." color="#ec7014" value={opacity.multiscene} onChange={(v:number)=>setLayerOpacity('multiscene',v)} />}
                    </div>
                  )}

                  {toggles.forestWatch && (
                    <p className="mt-2 text-[9px] text-fuchsia-400 font-mono leading-relaxed px-1">
                      🌍 Hansen GFC v1.13 (global, couvre Tétouan). DIST-ALERT = via asset configuré côté serveur.
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
                    {highConfOnly && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-[#7f1d1d] text-white font-bold">HC seul</span>}
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
              <button onClick={handleAnalyze} disabled={isAnalyzing}
                className={cn("w-full py-3 md:py-4 rounded-xl flex items-center justify-center gap-2 text-sm md:text-base font-bold transition-all",
                  isAnalyzing ? "bg-[var(--bg-main)] text-[var(--brand)] border-2 border-[var(--brand)] shadow-none"
                              : "bg-[var(--brand)] text-[var(--bg-main)] shadow-[0_4px_15px_rgba(var(--brand-rgb),0.3)] hover:brightness-110 active:scale-[0.98]")}>
                {isAnalyzing ? <><Hexagon className="w-4 h-4 md:w-5 md:h-5 animate-spin" /> Traitement GEE en cours...</>
                            : <><Play className="w-4 h-4 md:w-5 md:h-5 fill-current" /> Lancer l'analyse</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}