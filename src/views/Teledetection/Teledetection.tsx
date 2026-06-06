import { useState, useRef, useEffect } from 'react';
import { cn } from '../../lib/utils';
import {
  Satellite, Play, Calendar, CloudRain, ShieldAlert, Layers,
  TreePine, Sliders, SplitSquareHorizontal, FileWarning, CheckCircle2,
  ChevronDown, Hexagon, Crosshair, Map as MapIcon, RotateCcw,
  MapPin, BarChart3, Download, FileSpreadsheet, DownloadCloud,
  PanelRightClose, PanelRightOpen, Anchor, Waves, TrendingUp
} from 'lucide-react';
import { MapContainer, TileLayer, LayersControl, FeatureGroup, useMap, GeoJSON, CircleMarker, Popup } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import {
  checkGeeHealth,
  runAnalyze,
  runTripleAnalyze,
  fetchGladAlerts,
  fetchSentinel1Change,
  fetchPhenology,
  exportDisturbanceGeoJson,
  exportAlertsKml,
  exportAlertsCsv,
  type AlertFeature,
  type AnalyzeParams,
  type AnomalyLabel,
} from '../../lib/gee-api';

// ─────────────────────────────────────────────────────────────────────────────
// Config phénologie — couleurs + labels
// ─────────────────────────────────────────────────────────────────────────────
const ANOMALY_CONFIG: Record<AnomalyLabel, { color: string; label: string; emoji: string }> = {
  severe_deficit:   { color: '#ef4444', label: 'Déficit sévère',  emoji: '🔴' },
  moderate_deficit: { color: '#f97316', label: 'Déficit modéré',  emoji: '🟠' },
  slight_deficit:   { color: '#eab308', label: 'Léger déficit',   emoji: '🟡' },
  normal:           { color: '#22c55e', label: 'Normal',           emoji: '🟢' },
  above_average:    { color: '#3b82f6', label: 'Au-dessus moy.',  emoji: '🔵' },
  unknown:          { color: '#71717a', label: 'Inconnu',          emoji: '⚪' },
};

// ─────────────────────────────────────────────────────────────────────────────
// UI Sub-components (INCHANGÉS)
// ─────────────────────────────────────────────────────────────────────────────
const ToggleCard = ({ checked, onChange, label, icon: Icon, activeColor = "var(--brand)" }: any) => (
  <button
    onClick={() => onChange(!checked)}
    className={cn(
      "flex flex-col items-start p-3 md:p-4 rounded-2xl border-2 transition-all text-left w-full hover:scale-[1.02] hover:shadow-lg",
      checked
        ? "bg-[var(--bg-main)]"
        : "bg-[var(--bg-main)]/50 border-transparent text-[var(--text-muted)] hover:border-[var(--brand)]/30 hover:bg-[var(--bg-main)] hover:text-[var(--text-main)]"
    )}
    style={checked ? { borderColor: activeColor, boxShadow: `0 8px 16px color-mix(in srgb, ${activeColor} 20%, transparent)` } : {}}
  >
    <div className="flex items-center justify-between w-full mb-3 md:mb-4">
      {Icon && <Icon className="w-5 h-5 md:w-6 md:h-6" style={{ color: checked ? activeColor : 'currentColor' }} />}
      <div className={cn(
        "w-10 h-5 md:w-12 md:h-6 rounded-full relative transition-colors duration-300",
        checked ? "bg-opacity-100" : "bg-black/20 dark:bg-white/20"
      )} style={checked ? { backgroundColor: activeColor } : {}}>
        <div className={cn(
          "absolute top-1 left-1 w-3 h-3 md:w-4 md:h-4 rounded-full bg-white transition-transform duration-300 shadow-sm",
          checked ? "translate-x-5 md:translate-x-6" : "translate-x-0"
        )} />
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
        <span className="text-xs md:text-sm font-mono text-[var(--brand)] font-bold">
          {formatter ? formatter(value) : value}{unit}
        </span>
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

function MapControls({ splitPos, toggles, geeAfterUrl }: any) {
  const map = useMap();
  const [paneCreated, setPaneCreated] = useState(false);

  useEffect(() => {
    if (!map.getPane('splitPaneRight')) {
      const pane = map.createPane('splitPaneRight');
      pane.style.zIndex = '450';
    }
    setPaneCreated(true);
  }, [map]);

  useEffect(() => {
    const pane = map.getPane('splitPaneRight');
    if (pane) {
      if (toggles.s2Split) {
        pane.style.clipPath = `polygon(${splitPos}% 0, 100% 0, 100% 100%, ${splitPos}% 100%)`;
        pane.style.display = 'block';
      } else {
        pane.style.display = 'none';
      }
    }
  }, [splitPos, toggles.s2Split, map]);

  if (!paneCreated || !toggles.s2Split) return null;

  return geeAfterUrl ? (
    <TileLayer key={geeAfterUrl} url={geeAfterUrl} pane="splitPaneRight" attribution="© GEE / Copernicus S2" />
  ) : (
    <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}" pane="splitPaneRight" className="sepia-[.3] contrast-125" />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant Principal
// ─────────────────────────────────────────────────────────────────────────────
export function Teledetection() {

  // ── State UI (INCHANGÉ) ───────────────────────────────────────────────────
  const [isAnalyzing, setIsAnalyzing]     = useState(false);
  const [splitPos, setSplitPos]           = useState(50);
  const [cloudMax, setCloudMax]           = useState(30);
  const [ndviThreshold, setNdviThreshold] = useState(0.15);
  const [nbrThreshold, setNbrThreshold]   = useState(0.15);
  const [ndmiThreshold, setNdmiThreshold] = useState(0.12);
  const [minSurface, setMinSurface]       = useState(500);
  const [minConfidence, setMinConfidence] = useState(1);
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
  const [selectedZone, setSelectedZone]   = useState('tetouan_ouest');

  // ── Toggles — incluant Sentinel-1 et Phénologie ──────────────────────────
  const [toggles, setToggles] = useState({
    s2Split: true, disturbance: true, alertes: true, foretApef: true,
    ndviDelta: false, tripleConf: false, glad: false,
    sentinel1: false,   // ← NOUVEAU
    phenology: false,   // ← NOUVEAU
  });

  const zones = [
    { id: 'mdiq',          label: 'DF Mdiq-Fnideq', icon: MapIcon  },
    { id: 'tetouan_est',   label: 'Tétouan Est',    icon: TreePine },
    { id: 'tetouan_ouest', label: 'Tétouan Ouest',  icon: TreePine },
  ];

  // ── State GEE ─────────────────────────────────────────────────────────────
  const [geeStatus, setGeeStatus]           = useState<'unknown'|'ready'|'error'>('unknown');
  const [afterTileUrl, setAfterTileUrl]     = useState<string|null>(null);
  const [distTileUrl, setDistTileUrl]       = useState<string|null>(null);
  const [ndviTileUrl, setNdviTileUrl]       = useState<string|null>(null);
  const [gladTileUrl, setGladTileUrl]       = useState<string|null>(null);
  const [s1TileUrl, setS1TileUrl]           = useState<string|null>(null);   // Sentinel-1
  const [phenologyTileUrl, setPhenologyTileUrl] = useState<string|null>(null); // Phénologie
  const [alertFeatures, setAlertFeatures]   = useState<AlertFeature[]>([]);
  const [realStats, setRealStats]           = useState<any>(null);
  const [s1Data, setS1Data]                 = useState<any>(null);   // stats S1
  const [phenologyData, setPhenologyData]   = useState<any>(null);   // résultats phéno
  const [errorMsg, setErrorMsg]             = useState<string|null>(null);
  const [forestBoundary, setForestBoundary] = useState<any>(null);
  const [isPhenologyExpanded, setIsPhenologyExpanded] = useState(false);

  const mapRef = useRef<L.Map>(null);

  // ── useEffects ────────────────────────────────────────────────────────────
  useEffect(() => {
    checkGeeHealth()
      .then(d => setGeeStatus(d?.gee ? 'ready' : 'error'))
      .catch(() => setGeeStatus('error'));
  }, []);

  useEffect(() => {
    fetch('/assets/data/forest_limits.json')
      .then(r => r.json())
      .then(setForestBoundary)
      .catch(() => {});
  }, []);

  // Effacer tous les résultats GEE au changement de zone
  useEffect(() => {
    setAfterTileUrl(null); setDistTileUrl(null); setNdviTileUrl(null);
    setGladTileUrl(null);  setS1TileUrl(null);   setPhenologyTileUrl(null);
    setAlertFeatures([]); setRealStats(null);
    setS1Data(null);      setPhenologyData(null);
    setErrorMsg(null);
  }, [selectedZone]);

  // Auto-ouvrir section phénologie quand les données arrivent
  useEffect(() => {
    if (phenologyData) setIsPhenologyExpanded(true);
  }, [phenologyData]);

  // Auto-ouvrir stats quand S1 ou résultats arrivent
  useEffect(() => {
    if (s1Data || realStats) setIsStatsExpanded(true);
  }, [s1Data, realStats]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleToggle = (key: keyof typeof toggles) =>
    setToggles(prev => ({ ...prev, [key]: !prev[key] }));

  const resetParams = () => {
    setCloudMax(30); setNdviThreshold(0.15); setNbrThreshold(0.15);
    setNdmiThreshold(0.12); setMinSurface(500); setMinConfidence(1);
    setAfterTileUrl(null); setDistTileUrl(null); setNdviTileUrl(null);
    setGladTileUrl(null);  setS1TileUrl(null);   setPhenologyTileUrl(null);
    setAlertFeatures([]); setRealStats(null);
    setS1Data(null); setPhenologyData(null); setErrorMsg(null);
  };

  const resetMap = () => mapRef.current?.setView([35.7595, -5.8340], 12);

  // ── Analyse principale ────────────────────────────────────────────────────
  const handleAnalyze = async () => {
    if (geeStatus === 'error') { setErrorMsg('GEE hors-ligne — vérifier PythonAnywhere'); return; }
    setIsAnalyzing(true);
    setErrorMsg(null);

    const params: AnalyzeParams = {
      zone: selectedZone, date1Start: refStart, date1End: refEnd,
      date2Start: actStart, date2End: actEnd,
      cloud: cloudMax, sensitivity: ndviThreshold, nbr: nbrThreshold,
      ndmi: ndmiThreshold, minScore: minConfidence,
    };

    try {
      // ── 1. Analyse principale (S2 disturbance + alerts) ────────────────
      const result = await runAnalyze(params);
      setAfterTileUrl(result.afterTileUrl);
      setDistTileUrl(result.distTileUrl);
      setNdviTileUrl(result.ndviTileUrl);
      setRealStats(result.stats);
      const minAreaHa = minSurface / 10_000;
      setAlertFeatures(
        (result.features ?? []).filter(f => (f.properties.area_ha ?? 0) >= minAreaHa)
      );

      // ── 2. Analyses secondaires (en arrière-plan) ─────────────────────

      // Triple confirmation
      if (toggles.tripleConf) {
        runTripleAnalyze(params).then(({ features: tf }) => {
          if (tf.length > 0) {
            setAlertFeatures(prev => {
              const existing = new Set(prev.map(f => f.geometry.coordinates.join(',')));
              return [...prev, ...tf.filter(f => !existing.has(f.geometry.coordinates.join(',')))];
            });
          }
        }).catch(e => console.warn('[Triple]', e));
      }

      // GLAD alerts
      if (toggles.glad) {
        fetchGladAlerts(selectedZone)
          .then(g => { if (g.tileUrl) setGladTileUrl(g.tileUrl); })
          .catch(e => console.warn('[GLAD]', e));
      }

      // Sentinel-1 SAR
      if (toggles.sentinel1) {
        fetchSentinel1Change(params).then(s1 => {
          if (s1?.tileUrl) setS1TileUrl(s1.tileUrl);
          if (s1) setS1Data(s1);
        }).catch(e => console.warn('[S1]', e));
      }

      // Phénologie baseline
      if (toggles.phenology) {
        fetchPhenology(selectedZone, actStart, actEnd, cloudMax).then(ph => {
          if (ph?.tileUrl) setPhenologyTileUrl(ph.tileUrl);
          if (ph) setPhenologyData(ph);
        }).catch(e => console.warn('[Phenology]', e));
      }

    } catch (err: any) {
      const msg = err.message || 'Erreur GEE';
      if (err.name === 'AbortError' || msg.includes('abort'))
        setErrorMsg('Délai dépassé (2.5 min). Réduire la zone ou augmenter cloudMax.');
      else if (msg.includes('GEE non disponible'))
        setErrorMsg('GEE hors-ligne côté serveur — relancer PythonAnywhere.');
      else if (msg.includes('date'))
        setErrorMsg(`Dates invalides: ${msg}`);
      else
        setErrorMsg(msg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ── Exports ───────────────────────────────────────────────────────────────
  const handleExportGeoJson = async () => {
    if (!realStats) { setErrorMsg('Lancer une analyse d\'abord.'); return; }
    try {
      await exportDisturbanceGeoJson({
        zone: selectedZone, date1Start: refStart, date1End: refEnd,
        date2Start: actStart, date2End: actEnd,
        cloud: cloudMax, sensitivity: ndviThreshold, nbr: nbrThreshold,
        ndmi: ndmiThreshold, minScore: minConfidence,
      });
    } catch (e: any) { setErrorMsg(e.message); }
  };

  const handleExportKml = () => {
    if (!alertFeatures.length) { setErrorMsg('Lancer une analyse d\'abord.'); return; }
    exportAlertsKml(alertFeatures, selectedZone);
  };

  const handleExportExcel = () => {
    if (!alertFeatures.length) { setErrorMsg('Lancer une analyse d\'abord.'); return; }
    exportAlertsCsv(alertFeatures, selectedZone);
  };

  // ── Valeurs stats calculées ───────────────────────────────────────────────
  const highCount      = alertFeatures.filter(f => f.properties?.confidence === 'high').length;
  const totalCount     = alertFeatures.length;
  const meanNdviChange = totalCount > 0
    ? alertFeatures.reduce((s, f) => s + (f.properties?.ndvi_change ?? 0), 0) / totalCount
    : null;
  const ndviBarPct     = meanNdviChange != null ? Math.min(100, Math.abs(meanNdviChange) / 0.4 * 100) : 68;
  const ndviLabel      = meanNdviChange != null ? `${meanNdviChange.toFixed(3)} Δ` : '— —';
  const perturbees     = realStats?.total_ha?.toFixed(1) ?? '—';
  const highHaDisp     = realStats?.high_ha?.toFixed(1) ?? '—';

  const alertColor = (conf: string) =>
    conf === 'high' ? '#ef4444' : conf === 'medium' ? '#f97316' : '#eab308';

  const anomaly = phenologyData
    ? (ANOMALY_CONFIG[phenologyData.anomaly_label as AnomalyLabel] ?? ANOMALY_CONFIG.unknown)
    : null;

  // ─────────────────────────────────────────────────────────────────────────
  // JSX
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col md:flex-row h-full font-sans bg-[var(--bg-main)]">

      {/* ── MAP VIEWPORT ─────────────────────────────────────────────────── */}
      <div className="relative h-[35vh] md:h-full md:flex-1 bg-[#121214] border-b md:border-b-0 md:border-r border-[var(--border-color)] shrink-0 z-10 md:shrink overflow-hidden">

        <MapContainer center={[35.7595, -5.8340]} zoom={12}
          style={{ height: '100%', width: '100%' }} zoomControl={false} ref={mapRef}>

          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="Hybride + Satellite">
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="OpenStreetMap">
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            </LayersControl.BaseLayer>
          </LayersControl>

          <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />

          <FeatureGroup>
            <EditControl position="topleft" draw={{ rectangle: true, polygon: true, circle: false, circlemarker: false, marker: false, polyline: false }} />
          </FeatureGroup>

          {/* Split pane droite */}
          <MapControls splitPos={splitPos} toggles={toggles} geeAfterUrl={afterTileUrl} />

          {/* ── Couches GEE ───────────────────────────────────────────── */}
          {toggles.disturbance && distTileUrl && (
            <TileLayer key={distTileUrl} url={distTileUrl} opacity={0.75} attribution="GEE Disturbance" />
          )}
          {toggles.ndviDelta && ndviTileUrl && (
            <TileLayer key={ndviTileUrl} url={ndviTileUrl} opacity={0.72} attribution="GEE NDVI Δ" />
          )}
          {toggles.glad && gladTileUrl && (
            <TileLayer key={gladTileUrl} url={gladTileUrl} opacity={0.80} attribution="GLAD UMD" />
          )}
          {/* Sentinel-1 dVV (bleu=perte, rouge=gain) */}
          {toggles.sentinel1 && s1TileUrl && (
            <TileLayer key={s1TileUrl} url={s1TileUrl} opacity={0.70} attribution="GEE Sentinel-1 SAR" />
          )}
          {/* Phénologie anomalie NDVI */}
          {toggles.phenology && phenologyTileUrl && (
            <TileLayer key={phenologyTileUrl} url={phenologyTileUrl} opacity={0.68} attribution="GEE Phénologie" />
          )}
          {/* Limite forêt ANEF */}
          {toggles.foretApef && forestBoundary && (
            <GeoJSON key="forest-boundary" data={forestBoundary}
              style={() => ({ color: '#34d399', weight: 2, dashArray: '8 5', fillColor: '#34d399', fillOpacity: 0.05 })} />
          )}
          {/* Points alertes */}
          {toggles.alertes && alertFeatures.map((feat, i) => {
            const coords = feat.geometry?.coordinates;
            if (!coords || coords.length < 2) return null;
            const [lng, lat] = coords;
            const conf  = feat.properties?.confidence ?? 'low';
            const color = alertColor(conf);
            const r     = Math.max(4, (feat.properties?.radius_m ?? 30) / 8);
            return (
              <CircleMarker key={`a-${i}`} center={[lat, lng]} radius={r}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.65, weight: 1.5 }}>
                <Popup>
                  <div style={{ fontSize: 11, lineHeight: 1.7, minWidth: 160 }}>
                    <strong>Alerte #{feat.properties?.id}</strong><br />
                    <span style={{ color }}>
                      {conf === 'high' ? '🔴 Haute' : conf === 'medium' ? '🟠 Moyenne' : '🟡 Faible'}
                    </span> — Score: {feat.properties?.conf_score?.toFixed(1)}<br />
                    NDVI Δ: <strong>{feat.properties?.ndvi_change?.toFixed(3)}</strong><br />
                    NBR Δ: {feat.properties?.nbr_change?.toFixed(3)}<br />
                    NDMI Δ: {feat.properties?.ndmi_change?.toFixed(3)}<br />
                    Surface est.: {(feat.properties?.area_ha ?? 0).toFixed(2)} ha<br />
                    {feat.properties?.hansen_year != null && (
                      <><span style={{ color: '#f97316' }}>Hansen: {feat.properties.hansen_year}</span><br /></>
                    )}
                    {feat.properties?.triple_confirmed && (
                      <><em style={{ color: '#22d3ee' }}>✅ Triple confirmée</em><br /></>
                    )}
                    <em style={{ color: '#888', fontSize: 10 }}>{feat.properties?.period2}</em>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

          <MapResizer />
        </MapContainer>

        {/* Split Slider */}
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
              const onMove = (ev: MouseEvent) => {
                let p = ((ev.clientX - rect.left) / rect.width) * 100;
                p = Math.max(0, Math.min(p, 100));
                slider.style.left = `calc(${p}% - 24px)`;
                const pane = document.querySelector('.leaflet-splitPaneRight-pane') as HTMLElement;
                if (pane) pane.style.clipPath = `polygon(${p}% 0, 100% 0, 100% 100%, ${p}% 100%)`;
              };
              const onUp = (ev: MouseEvent) => {
                document.body.classList.remove('select-none');
                document.body.style.cursor = '';
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                let p = ((ev.clientX - rect.left) / rect.width) * 100;
                setSplitPos(Math.max(0, Math.min(p, 100)));
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
              const pane = document.querySelector('.leaflet-splitPaneRight-pane') as HTMLElement;
              if (pane) pane.style.clipPath = `polygon(${p}% 0, 100% 0, 100% 100%, ${p}% 100%)`;
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

        {/* Top UI */}
        <div className="absolute top-2 md:top-4 inset-x-2 md:inset-x-4 flex justify-between items-start z-[500] pointer-events-none">
          <div />
          <div className="flex flex-col gap-2 pointer-events-auto">
            <button onClick={resetMap} className="w-8 h-8 md:w-10 md:h-10 bg-black/60 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center text-white hover:scale-110 hover:bg-white/20 transition-all shadow-lg">
              <MapIcon className="w-4 h-4 md:w-5 md:h-5" />
            </button>
            <button className="w-8 h-8 md:w-10 md:h-10 bg-black/60 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center text-white hover:scale-110 hover:bg-[var(--brand)] hover:border-transparent transition-all">
              <Crosshair className="w-4 h-4 md:w-5 md:h-5" />
            </button>
          </div>
        </div>

        {/* Légende */}
        <div className="absolute bottom-2 md:bottom-4 left-2 md:left-4 z-[500] pointer-events-none flex flex-col gap-2">
          {toggles.alertes && (
            <div className="bg-black/80 backdrop-blur-xl border border-white/10 rounded-xl pointer-events-auto shadow-2xl overflow-hidden min-w-[160px]">
              <div className="p-2 md:p-2.5 bg-black/40 flex items-center justify-between cursor-pointer hover:bg-white/10 transition-colors" onClick={() => setIsLegendMinimized(!isLegendMinimized)}>
                <div className="flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-white/70" />
                  <h4 className="text-[9px] md:text-[10px] font-bold text-white/70 uppercase tracking-widest">Confiance Alerte</h4>
                </div>
                <svg className={`w-3.5 h-3.5 text-white/50 transition-transform duration-300 ${isLegendMinimized ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              {!isLegendMinimized && (
                <div className="p-2.5 md:p-3 space-y-2">
                  {[['bg-red-500','rgba(239,68,68,0.6)','Haute (3 indices)'],['bg-orange-500','rgba(249,115,22,0.6)','Moyenne (2 indices)'],['bg-yellow-500','rgba(234,179,8,0.6)','Faible (1 indice)']].map(([bg, shadow, label]) => (
                    <div key={label} className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${bg}`} style={{ boxShadow: `0 0 8px ${shadow}` }} />
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

        {/* Badge S2 / statut */}
        {toggles.s2Split && (
          <div className="absolute top-2 md:top-4 right-[3.5rem] md:right-[4.5rem] bg-amber-500 text-black px-2 py-1 md:px-3 md:py-1.5 rounded-lg text-[9px] md:text-xs font-bold shadow-lg z-[500]">
            {afterTileUrl ? 'S2 APRÈS' : 'S2 APRÈS (TOPO)'}
          </div>
        )}

        {/* GEE status dot */}
        <div className="absolute bottom-2 right-2 md:bottom-4 md:right-4 z-[500] pointer-events-none">
          <div className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-bold tracking-wider ${
            geeStatus === 'ready' ? 'bg-emerald-900/80 text-emerald-300' :
            geeStatus === 'error' ? 'bg-red-900/80 text-red-300' :
            'bg-zinc-900/70 text-zinc-500'
          }`}>
            GEE {geeStatus === 'ready' ? '● EN LIGNE' : geeStatus === 'error' ? '● HORS LIGNE' : '● ...'}
          </div>
        </div>

        {/* Error overlay */}
        {errorMsg && (
          <div className="absolute top-14 left-2 md:left-4 right-16 bg-red-900/90 backdrop-blur-md border border-red-700/50 text-white text-[10px] md:text-xs px-3 py-2 rounded-lg z-[500] flex items-center gap-2 shadow-xl">
            <span className="text-red-300 shrink-0">⚠</span>
            <span className="flex-1 leading-tight">{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-white shrink-0 font-bold">✕</button>
          </div>
        )}
      </div>

      {/* ── PANNEAU PARAMÈTRES ────────────────────────────────────────────── */}
      <div
        className={cn(
          "flex-[0_0_auto] flex flex-col bg-[var(--bg-surface)] shadow-[-10px_0_30px_rgba(0,0,0,0.05)] z-[400] relative transition-all duration-300 border-l border-[var(--border-color)]",
          isPanelCollapsed ? "w-4 md:w-6 lg:w-8 cursor-pointer items-center justify-center group hover:bg-[var(--brand-light)]" : "w-full md:w-[360px] lg:w-[400px]"
        )}
        onClick={() => isPanelCollapsed && setIsPanelCollapsed(false)}
      >
        {isPanelCollapsed && (
          <div className="flex flex-col items-center justify-center h-full w-full relative">
            <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[var(--brand)] shadow-[0_0_10px_var(--brand)]" />
            <PanelRightOpen className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--brand)] -rotate-90 md:rotate-0" />
            <span className="absolute top-[50%] -translate-y-[50%] -rotate-90 whitespace-nowrap text-[8px] font-bold tracking-[0.2em] uppercase text-[var(--text-muted)] opacity-50 mt-16 group-hover:text-[var(--brand)] group-hover:opacity-100 transition-all">Panneau de Contrôle</span>
          </div>
        )}

        {!isPanelCollapsed && (
          <>
            {/* Header */}
            <div className="p-4 md:p-6 border-b border-[var(--border-color)] shrink-0 bg-[var(--bg-surface)] flex justify-between items-center sticky top-0 z-10">
              <div>
                <h2 className="font-black text-lg md:text-xl text-[var(--text-main)] flex items-center gap-2">
                  <Satellite className="w-5 h-5 text-[var(--brand)]" /> AtlasForest GEE
                </h2>
                <p className="text-[10px] md:text-xs text-[var(--text-muted)] font-mono mt-1">Surveillance GEE • v11.0</p>
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
                      <div className="flex flex-col gap-2">
                        <DateInput value={refStart} onChange={setRefStart} />
                        <DateInput value={refEnd} onChange={setRefEnd} />
                      </div>
                    </div>
                    <div className="bg-[var(--bg-main)] p-2.5 rounded-lg border border-[var(--border-color)]">
                      <label className="block text-[10px] font-bold text-amber-500 uppercase tracking-wide mb-1.5 opacity-80">ACTUELLE</label>
                      <div className="flex flex-col gap-2">
                        <DateInput value={actStart} onChange={setActStart} />
                        <DateInput value={actEnd} onChange={setActEnd} />
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Algorithmes — grille 2×5 avec S1 + Phénologie */}
              <section className="border-b border-stone-200/50 dark:border-stone-800/50 pb-3 mb-3">
                <button onClick={() => setIsAlgorithmExpanded(!isAlgorithmExpanded)} className="w-full text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center justify-between group hover:text-[var(--text-main)] transition-colors">
                  <div className="flex items-center gap-2"><Anchor className="w-4 h-4 group-hover:text-[var(--brand)] transition-colors" /> Algorithmes</div>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isAlgorithmExpanded ? 'rotate-180' : ''}`} />
                </button>
                <div className={`transition-all duration-300 origin-top overflow-hidden ${isAlgorithmExpanded ? 'max-h-[900px] opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="grid grid-cols-2 gap-1.5 mt-1">
                    <ToggleCard label="S2 Split"     icon={SplitSquareHorizontal} checked={toggles.s2Split}     onChange={() => handleToggle('s2Split')}     activeColor="#3b82f6" />
                    <ToggleCard label="Disturbance"  icon={FileWarning}           checked={toggles.disturbance} onChange={() => handleToggle('disturbance')} activeColor="#eab308" />
                    <ToggleCard label="NDVI Δ"       icon={CloudRain}             checked={toggles.ndviDelta}   onChange={() => handleToggle('ndviDelta')}   activeColor="#10b981" />
                    <ToggleCard label="Alertes"      icon={ShieldAlert}           checked={toggles.alertes}     onChange={() => handleToggle('alertes')}     activeColor="#ef4444" />
                    <ToggleCard label="Forêt ANEF"   icon={TreePine}              checked={toggles.foretApef}   onChange={() => handleToggle('foretApef')}   activeColor="#14b8a6" />
                    <ToggleCard label="Triple conf." icon={CheckCircle2}          checked={toggles.tripleConf}  onChange={() => handleToggle('tripleConf')}  activeColor="#0ea5e9" />
                    {/* NOUVEAU — Sentinel-1 SAR */}
                    <ToggleCard label="Sentinel-1"   icon={Waves}                 checked={toggles.sentinel1}   onChange={() => handleToggle('sentinel1')}   activeColor="#8b5cf6" />
                    {/* NOUVEAU — Phénologie baseline */}
                    <ToggleCard label="Phénologie"   icon={TrendingUp}            checked={toggles.phenology}   onChange={() => handleToggle('phenology')}   activeColor="#f59e0b" />
                  </div>
                  {/* Info tooltips */}
                  {toggles.sentinel1 && (
                    <p className="mt-2 text-[9px] text-purple-400 font-mono leading-relaxed px-1">
                      🔵 Bleu = perte rétrodiffusion SAR (perturbation) · Fonctionne sous nuages
                    </p>
                  )}
                  {toggles.phenology && (
                    <p className="mt-1 text-[9px] text-amber-400 font-mono leading-relaxed px-1">
                      📊 Compare NDVI actuel vs baseline 3 ans (même mois)
                    </p>
                  )}
                </div>
              </section>

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
                    <RangeSlider label="Score min conf." value={minConfidence} min={1}   max={3}   step={1}   onChange={setMinConfidence} />
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
                    {/* S2 stats */}
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="p-2 shadow-sm rounded border border-[var(--border-color)] bg-[var(--bg-surface)]">
                        <p className="text-[9px] text-[var(--text-muted)] font-mono uppercase tracking-wider mb-0.5">Perturbées</p>
                        <div className="flex items-baseline gap-1"><span className="text-sm font-bold text-red-500">{perturbees}</span><span className="text-[9px] text-[var(--text-muted)]">ha</span></div>
                      </div>
                      <div className="p-2 shadow-sm rounded border border-[var(--border-color)] bg-[var(--bg-surface)]">
                        <p className="text-[9px] text-[var(--text-muted)] font-mono uppercase tracking-wider mb-0.5">Sévères</p>
                        <div className="flex items-baseline gap-1"><span className="text-sm font-bold text-orange-500">{highHaDisp}</span><span className="text-[9px] text-[var(--text-muted)]">ha</span></div>
                      </div>
                      <div className="p-2 shadow-sm rounded border border-[var(--border-color)] bg-[var(--bg-surface)]">
                        <p className="text-[9px] text-[var(--text-muted)] font-mono uppercase tracking-wider mb-0.5">High</p>
                        <div className="flex items-baseline gap-1"><span className="text-sm font-bold text-red-500">{highCount > 0 ? highCount : '—'}</span><span className="text-[9px] text-[var(--text-muted)]">rés.</span></div>
                      </div>
                      <div className="p-2 shadow-sm rounded border border-[var(--border-color)] bg-[var(--bg-surface)]">
                        <p className="text-[9px] text-[var(--text-muted)] font-mono uppercase tracking-wider mb-0.5">Total</p>
                        <div className="flex items-baseline gap-1"><span className="text-sm font-bold text-[var(--brand)]">{totalCount > 0 ? totalCount : '—'}</span><span className="text-[9px] text-[var(--text-muted)]">rés.</span></div>
                      </div>
                    </div>
                    {/* NDVI bar */}
                    <div>
                      <p className="text-[9px] text-[var(--text-muted)] font-mono uppercase tracking-wider mb-0.5 flex justify-between pr-1">
                        <span>NDVI Δ</span>
                        <span className="text-[var(--brand)] font-bold">{ndviLabel}</span>
                      </p>
                      <div className="h-1 w-full bg-[var(--border-color)] rounded-full overflow-hidden">
                        <div className="h-full bg-[var(--brand)] rounded-full transition-all duration-500" style={{ width: `${ndviBarPct}%` }} />
                      </div>
                    </div>
                    {/* Sentinel-1 stats (si disponible) */}
                    {toggles.sentinel1 && s1Data && (
                      <>
                        <div className="h-px bg-[var(--border-color)]" />
                        <div>
                          <p className="text-[9px] text-[var(--text-muted)] font-mono uppercase tracking-wider mb-0.5 flex justify-between pr-1">
                            <span className="text-purple-400">S1 dVV moyen</span>
                            <span className="text-purple-400 font-bold">{s1Data.dVV_stats?.mean?.toFixed(2)} dB</span>
                          </p>
                          <div className="h-1 w-full bg-[var(--border-color)] rounded-full overflow-hidden">
                            <div className="h-full bg-purple-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Math.abs(s1Data.dVV_stats?.mean ?? 0) / 10 * 100)}%` }} />
                          </div>
                          {s1Data.loss_ha > 0 && (
                            <p className="text-[9px] text-purple-400 font-mono mt-1">
                              {s1Data.loss_ha?.toFixed(1)} ha perte (dVV &lt; −3 dB)
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </section>

              {/* ── PHÉNOLOGIE — section nouvelle ─────────────────────────── */}
              {toggles.phenology && (
                <section className="border-b border-stone-200/50 dark:border-stone-800/50 pb-3 mb-3">
                  <button onClick={() => setIsPhenologyExpanded(!isPhenologyExpanded)} className="w-full text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center justify-between group hover:text-[var(--text-main)] transition-colors">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 group-hover:text-amber-400 transition-colors" />
                      <span>Phénologie</span>
                      {phenologyData?.anomaly_label && phenologyData.anomaly_label !== 'normal' && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: anomaly?.color + '25', color: anomaly?.color }}>
                          {anomaly?.emoji}
                        </span>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isPhenologyExpanded ? 'rotate-180' : ''}`} />
                  </button>
                  <div className={`transition-all duration-300 origin-top overflow-hidden ${isPhenologyExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
                    {phenologyData ? (
                      <div className="bg-[var(--bg-main)] p-2.5 rounded-lg border border-[var(--border-color)] mt-1 space-y-2.5">
                        {/* Badge anomalie */}
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] text-[var(--text-muted)] font-mono uppercase tracking-wider">Anomalie NDVI</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: anomaly?.color + '20', color: anomaly?.color }}>
                            {anomaly?.emoji} {anomaly?.label}
                          </span>
                        </div>
                        {/* Baseline vs Actuel */}
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
                        {/* Barre déviation centrée */}
                        {phenologyData.ndvi_anomaly != null && (
                          <div>
                            <p className="text-[9px] text-[var(--text-muted)] font-mono uppercase tracking-wider mb-0.5 flex justify-between pr-1">
                              <span>Déviation</span>
                              <span className="font-bold" style={{ color: anomaly?.color }}>
                                {phenologyData.ndvi_anomaly > 0 ? '+' : ''}{phenologyData.ndvi_anomaly.toFixed(3)}
                              </span>
                            </p>
                            <div className="h-1.5 w-full bg-[var(--border-color)] rounded-full overflow-hidden relative">
                              {/* Ligne centrale */}
                              <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--text-muted)] opacity-40" />
                              {/* Barre depuis le centre */}
                              <div className="absolute top-0 h-full rounded-full transition-all duration-500"
                                style={{
                                  width:  `${Math.min(50, Math.abs(phenologyData.ndvi_anomaly) / 0.4 * 50)}%`,
                                  left:   phenologyData.ndvi_anomaly >= 0 ? '50%' : `${50 - Math.min(50, Math.abs(phenologyData.ndvi_anomaly) / 0.4 * 50)}%`,
                                  backgroundColor: anomaly?.color,
                                }}
                              />
                            </div>
                          </div>
                        )}
                        {/* Années baseline */}
                        <p className="text-[9px] text-[var(--text-muted)] font-mono">
                          Ref: {phenologyData.baseline_years?.join(', ')} · {phenologyData.period_current}
                        </p>
                      </div>
                    ) : (
                      <div className="bg-[var(--bg-main)] p-3 rounded-lg border border-[var(--border-color)] mt-1 text-center">
                        <p className="text-[10px] text-[var(--text-muted)]">
                          {isAnalyzing ? '⏳ Calcul baseline en cours...' : '↑ Lancer une analyse pour voir les données phénologiques'}
                        </p>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Export */}
              <section className="border-b border-stone-200/50 dark:border-stone-800/50 pb-3 mb-3 last:border-0 last:pb-0 last:mb-0">
                <button onClick={() => setIsExportExpanded(!isExportExpanded)} className="w-full text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center justify-between group hover:text-[var(--text-main)] transition-colors">
                  <div className="flex items-center gap-2"><DownloadCloud className="w-4 h-4 group-hover:text-[var(--brand)] transition-colors" /> Exporter</div>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isExportExpanded ? 'rotate-180' : ''}`} />
                </button>
                <div className={`transition-all duration-300 origin-top overflow-hidden ${isExportExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="mt-1">
                    <div className="bg-[var(--bg-main)] p-1.5 rounded-lg border border-[var(--border-color)] space-y-1">
                      <button onClick={handleExportGeoJson} className="w-full flex justify-between items-center bg-[var(--bg-surface)] border border-transparent p-2 rounded hover:border-[var(--brand)] hover:text-[var(--brand)] hover:shadow-sm transition-all group">
                        <div className="flex items-center gap-2 text-xs font-medium"><MapIcon className="w-3.5 h-3.5 text-blue-500" /> GeoJSON (.geojson)</div>
                        <Download className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                      <button onClick={handleExportKml} className="w-full flex justify-between items-center bg-[var(--bg-surface)] border border-transparent p-2 rounded hover:border-[var(--brand)] hover:text-[var(--brand)] hover:shadow-sm transition-all group">
                        <div className="flex items-center gap-2 text-xs font-medium"><MapPin className="w-3.5 h-3.5 text-green-500" /> KML (.kml)</div>
                        <Download className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                      <button disabled className="w-full flex justify-between items-center bg-[var(--bg-surface)] border border-transparent p-2 rounded opacity-40 cursor-not-allowed" title="Utiliser QGIS pour convertir depuis GeoJSON">
                        <div className="flex items-center gap-2 text-xs font-medium"><Layers className="w-3.5 h-3.5 text-purple-500" /> Shapefile (.shp)</div>
                        <span className="text-[8px] text-[var(--text-muted)]">→ QGIS</span>
                      </button>
                      <button onClick={handleExportExcel} className="w-full flex justify-between items-center bg-[var(--bg-surface)] border border-transparent p-2 rounded hover:border-[var(--brand)] hover:text-[var(--brand)] hover:shadow-sm transition-all group">
                        <div className="flex items-center gap-2 text-xs font-medium"><FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" /> Excel (.csv)</div>
                        <Download className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    </div>
                  </div>
                </div>
              </section>

            </div>

            {/* Bouton Analyser */}
            <div className="p-3 md:p-6 border-t border-[var(--border-color)] bg-[var(--bg-surface)] shrink-0 sticky bottom-0 z-10 pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:pb-6">
              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className={cn(
                  "w-full py-3 md:py-4 rounded-xl flex items-center justify-center gap-2 text-sm md:text-base font-bold transition-all",
                  isAnalyzing
                    ? "bg-[var(--bg-main)] text-[var(--brand)] border-2 border-[var(--brand)] shadow-none"
                    : "bg-[var(--brand)] text-[var(--bg-main)] shadow-[0_4px_15px_rgba(var(--brand-rgb),0.3)] hover:brightness-110 active:scale-[0.98]"
                )}
              >
                {isAnalyzing
                  ? <><Hexagon className="w-4 h-4 md:w-5 md:h-5 animate-spin" /> Traitement GEE en cours...</>
                  : <><Play className="w-4 h-4 md:w-5 md:h-5 fill-current" /> Lancer l'analyse</>
                }
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}