// src/lib/gee-api.ts
// ─────────────────────────────────────────────────────────────────────────────
// Client GEE v12 — polygones reels, swipe before/after, exports backend (GeoJSON/KML/SHP)
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = "/api/gee";

// Clé API partagée Front<->Back (durcissement production). Injectée via la
// variable d'environnement de build VITE_API_KEY. Si vide -> aucun en-tête
// (mode dev où le backend n'exige pas de clé). N'expose JAMAIS de secret
// sensible ici : cette clé ne fait qu'autoriser l'appel à NOTRE backend, qui
// garde lui les vrais secrets (Service Account GEE, clé Supabase).
const API_KEY: string =
  (typeof import.meta !== "undefined" && (import.meta as any)?.env?.VITE_API_KEY) || "";

// En-têtes communs (Content-Type + clé API si présente)
function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json", ...(extra ?? {}) };
  if (API_KEY) h["X-API-Key"] = API_KEY;
  return h;
}

// Message d'erreur lisible selon le code HTTP (pour l'afficher à l'utilisateur)
function httpErrorMessage(status: number, fallback?: string): string {
  if (status === 401) return "Accès refusé : clé API manquante ou invalide.";
  if (status === 403) return "Accès interdit.";
  if (status === 413) return "Zone trop volumineuse ou trop complexe. Réduisez la sélection.";
  if (status === 429) return "Trop de requêtes. Patientez avant de relancer.";
  if (status === 503) return "Service GEE momentanément indisponible. Réessayez.";
  return fallback || `Erreur serveur (${status}).`;
}

const ZONE_MAP: Record<string, string> = {
  mdiq: "df_mdiq",
  tetouan_est: "tetouan_est",
  tetouan_ouest: "tetouan_ouest",
};
export const toFlaskZone = (z: string): string => ZONE_MAP[z] ?? z;

// ── Types ────────────────────────────────────────────────────────────────────
export interface GeeHealthStatus {
  gee: boolean; version: string; status: "ok" | "degraded"; gee_error?: string | null;
}

export interface AnalyzeParams {
  zone: string;
  date1Start: string; date1End: string;
  date2Start: string; date2End: string;
  cloud?: number;
  sensitivity?: number; nbr?: number; ndmi?: number; vv?: number;
  minScore?: number;     // 1..5
  minArea?: number;      // m²
  useRadar?: boolean; useTemporal?: boolean; useSeasonal?: boolean; useExternal?: boolean;
  useForest?: boolean;
  useMultiscene?: boolean; minScenes?: number;
  // v15 — analyse foret-par-foret : geometrie GeoJSON de la foret selectionnee
  roiGeojson?: unknown;
}

export interface AnalyzeStats {
  low_ha: number; medium_ha: number; high_ha: number; highest_ha: number;
  total_ha: number; alert_level: "CRITIQUE" | "ELEVE" | "MOYEN" | "FAIBLE";
}

export interface PolygonProps {
  id: number; poly_id: number;
  area_m2: number; area_ha: number;
  conf_score: number; confidence: "low" | "medium" | "high" | "highest";
  ndvi_change: number; nbr_change: number; ndmi_change: number;
  hansen_year: number | null;
  lng?: number; lat?: number; n_scenes?: number | null;
  // v16 — detail des preuves par polygone (pour le terrain)
  preuves?: string;
  ev_optic?: number; ev_persist?: number; ev_radar?: number;
  ev_external?: number; ev_seasonal?: number; ev_temporal?: number;
  score_w?: number;   // v17 — score pondere brut (0..9)
}
export interface PolygonFeature {
  type: "Feature";
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: any };
  properties: PolygonProps;
}
export interface PolygonFC { type: "FeatureCollection"; features: PolygonFeature[]; }

export interface AnalyzeResult {
  success: boolean; zone: string;
  beforeTileUrl: string | null; afterTileUrl: string | null;
  distTileUrl: string | null; ndviTileUrl: string | null;
  nbrTileUrl?: string | null; highOnlyTileUrl?: string | null;
  multisceneTileUrl?: string | null; max_score?: number;
  beforeLabel: string; afterLabel: string;
  period1: string; period2: string;
  polygons: PolygonFC; count: number; stats: AnalyzeStats;
  algorithm: string; evidence_used?: string[]; poly_error?: string | null; error?: string;
}

export interface Sentinel1Result {
  success: boolean; tileUrl: string | null; zone: string;
  loss_ha: number; period1: string; period2: string;
  dVV_stats: { mean: number; stdDev: number; min: number; max: number };
}

export type AnomalyLabel =
  | "severe_deficit" | "moderate_deficit" | "slight_deficit"
  | "normal" | "above_average" | "unknown";

export interface PhenologyResult {
  success: boolean; period_current: string; baseline_years: number[];
  baseline_ndvi: number | null; current_ndvi: number;
  ndvi_anomaly: number | null; anomaly_label: AnomalyLabel;
  tileUrl: string | null; zone: string;
}

export interface ForestWatchResult {
  success: boolean; zone: string;
  hansenTileUrl: string | null; distAlertTileUrl: string | null;
  hansen_ha: number; note: string;
}

// ── Helpers HTTP ─────────────────────────────────────────────────────────────
function buildBody(p: AnalyzeParams): Record<string, unknown> {
  const body: Record<string, unknown> = {
    zone: toFlaskZone(p.zone),
    date1Start: p.date1Start, date1End: p.date1End,
    date2Start: p.date2Start, date2End: p.date2End,
    cloud: p.cloud ?? 30,
    sensitivity: p.sensitivity ?? 0.15,
    nbr: p.nbr ?? 0.15, ndmi: p.ndmi ?? 0.12, vv: p.vv ?? 2.0,
    minScore: p.minScore ?? 2, minArea: p.minArea ?? 500,
    // v14 — persistance multi-scenes + saisonnier = colonne vertebrale anti-faux-positifs (ON par defaut)
    useRadar: p.useRadar ?? false, useTemporal: p.useTemporal ?? false,
    useSeasonal: p.useSeasonal ?? true, useExternal: p.useExternal ?? true,
    useForest: p.useForest ?? true,
    useMultiscene: p.useMultiscene ?? true, minScenes: p.minScenes ?? 2,
  };
  // v15 — si une foret est selectionnee, on envoie sa geometrie : le backend (get_roi)
  // l'utilise des lors que `zone` n'est pas une cle de centre connue.
  if (p.roiGeojson) body.roi_geojson = p.roiGeojson;
  return body;
}

async function geePost<T>(path: string, body: Record<string, unknown>, timeoutMs = 290_000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify(body), signal: ctrl.signal,
    });
    let data: any = null;
    try { data = await res.json(); } catch { /* réponse non-JSON */ }
    if (!res.ok || data?.success === false) {
      throw new Error(data?.error ?? httpErrorMessage(res.status));
    }
    return data as T;
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error("Délai dépassé. Réduisez la zone ou réessayez.");
    throw e;
  } finally { clearTimeout(t); }
}

async function geeGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const qs = params ? "?" + Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&") : "";
  const res = await fetch(`${API_BASE}${path}${qs}`, { headers: authHeaders() });
  let data: any = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) throw new Error(data?.error ?? httpErrorMessage(res.status));
  return data as T;
}

// Telecharge un fichier produit par un endpoint POST (geojson/kml/shp)
async function downloadFile(path: string, body: Record<string, unknown>, filename: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST", headers: authHeaders(), body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = httpErrorMessage(res.status);
    try { const j = await res.json(); msg = j.error ?? msg; } catch { /* binary */ }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

// ── API publique ─────────────────────────────────────────────────────────────
export async function checkGeeHealth(): Promise<GeeHealthStatus | null> {
  try { return await geeGet<GeeHealthStatus>("/health"); } catch { return null; }
}

export async function runAnalyze(p: AnalyzeParams): Promise<AnalyzeResult> {
  return geePost<AnalyzeResult>("/gee/analyze", buildBody(p));
}

// v19 — Analyse ASYNCHRONE : lance une tâche, interroge l'état (barre de
// progression), aucun timeout sur grandes forêts, annulation possible.
export interface AnalyzeProgress { progress: number; message: string; status: string }
export interface AnalyzeHandle { taskId: string; cancel: () => Promise<void> }

export async function runAnalyzeAsync(
  p: AnalyzeParams,
  onProgress?: (u: AnalyzeProgress) => void,
  onHandle?: (h: AnalyzeHandle) => void,
): Promise<AnalyzeResult> {
  // 1) Lancement -> task_id immédiat
  const start = await geePost<{ task_id: string; cached?: boolean }>("/gee/analyze-async", buildBody(p));
  const taskId = start.task_id;
  let cancelled = false;

  const cancel = async () => {
    cancelled = true;
    try { await fetch(`${API_BASE}/gee/analyze-cancel/${taskId}`, { method: "POST", headers: authHeaders() }); } catch { /* noop */ }
  };
  onHandle?.({ taskId, cancel });

  // 2) Polling de l'état toutes les 1.5 s (léger)
  const POLL_MS = 1500;
  const MAX_MS = 15 * 60_000;   // garde-fou : 15 min max
  const t0 = Date.now();

  while (true) {
    if (cancelled) throw new Error("Analyse annulée");
    await new Promise(r => setTimeout(r, POLL_MS));
    if (Date.now() - t0 > MAX_MS) throw new Error("Délai maximal dépassé");

    let st: any;
    try {
      const res = await fetch(`${API_BASE}/gee/analyze-status/${taskId}`, { headers: authHeaders() });
      st = await res.json();
      if (!res.ok) throw new Error(st?.error ?? `HTTP ${res.status}`);
    } catch (e) {
      // erreur réseau transitoire -> on retente au prochain tour
      continue;
    }

    onProgress?.({ progress: st.progress ?? 0, message: st.message ?? "", status: st.status });

    if (st.status === "done") return st.result as AnalyzeResult;
    if (st.status === "error") throw new Error(st.error ?? "Erreur GEE");
    if (st.status === "cancelled") throw new Error("Analyse annulée");
  }
}
// NB : le Top-N est dérivé directement de runAnalyze().polygons (déjà triés par aire),
// donc aucune requête séparée n'est nécessaire (perf).

export async function fetchForestWatchLayer(p: AnalyzeParams): Promise<ForestWatchResult | null> {
  try { return await geePost<ForestWatchResult>("/gee/forest-watch-layer", buildBody(p)); }
  catch (e) { console.warn("[ForestWatch]", e); return null; }
}

export async function fetchSentinel1Change(p: AnalyzeParams): Promise<Sentinel1Result | null> {
  try { return await geePost<Sentinel1Result>("/gee/sentinel1-change", buildBody(p)); }
  catch (e) { console.warn("[Sentinel-1]", e); return null; }
}

// v18 — Scenes Sentinel-2 historiques avec dates de capture REELLES (frise "avant")
export interface S2Scene { date: string; url: string | null; cloud: number; id?: string }
export async function fetchS2Scenes(p: AnalyzeParams, start: string, end: string): Promise<S2Scene[]> {
  try {
    // limit élevé : on veut le maximum de dates de capture réelles sur toute la période.
    const body = { ...buildBody(p), start, end, cloud: 45, limit: 300 };
    const r = await geePost<{ scenes: S2Scene[] }>("/gee/s2-scenes", body);
    return r.scenes ?? [];
  } catch (e) { console.warn("[S2-scenes]", e); return []; }
}

// Charge à la demande l'URL de tuiles d'une scène S2 (frise temporelle paresseuse)
export async function fetchS2SceneTile(p: AnalyzeParams, sceneId: string): Promise<string | null> {
  try {
    const r = await geePost<{ url: string }>("/gee/s2-scene-tile", { ...buildBody(p), id: sceneId });
    return r.url ?? null;
  } catch (e) { console.warn("[S2-scene-tile]", e); return null; }
}

// ───────────────────────────────────────────────────────────────────────────
// v20 — Suivi des alertes + retour terrain (Supabase, via le backend Flask)
// ───────────────────────────────────────────────────────────────────────────
export type Verdict = "confirme" | "faux" | "en_cours" | "cloture";
export interface AccuracyRow { conf_score: number; confirme: number; faux: number; total: number; accuracy_pct: number | null }

// Enregistre les alertes haute-confiance de la dernière analyse (idempotent par geohash)
export async function saveAlerts(features: PolygonFeature[], zone: string, minScore = 3, type: "changement" | "incendie" = "changement"): Promise<number> {
  try {
    const r = await geePost<{ saved: number }>("/gee/alerts/save", { features, zone, min_score: minScore, type });
    return r.saved ?? 0;
  } catch (e) { console.warn("[alerts/save]", e); return 0; }
}

// v22 — Lecture des alertes archivées (pour les afficher à l'ouverture d'une zone)
export interface SavedAlert {
  geohash: string; zone: string; type: string;
  lat: number; lng: number; conf_score: number; confidence: string;
  area_ha: number; preuves: string; status: string;
  detections: number; first_seen: string; last_seen: string;
}
export async function fetchSavedAlerts(zone: string, includeClosed = false): Promise<{ alerts: SavedAlert[]; by_status: Record<string, number> }> {
  try {
    const qs = `?zone=${encodeURIComponent(zone)}${includeClosed ? "&all=true" : ""}`;
    const r = await fetch(`${API_BASE}/gee/alerts/list${qs}`, { headers: authHeaders() });
    const j = await r.json();
    return { alerts: j?.alerts ?? [], by_status: j?.by_status ?? {} };
  } catch (e) { console.warn("[alerts/list]", e); return { alerts: [], by_status: {} }; }
}

// Verdict terrain sur une alerte (par coordonnées -> le backend calcule le geohash)
export async function sendAlertVerdict(lat: number, lng: number, verdict: Verdict, confScore?: number, note?: string): Promise<boolean> {
  try {
    await geePost("/gee/alerts/feedback", { lat, lng, verdict, conf_score: confScore, note });
    return true;
  } catch (e) { console.warn("[alerts/feedback]", e); return false; }
}

// Taux de fiabilité réel par classe (validation scientifique)
export async function fetchAccuracy(): Promise<AccuracyRow[]> {
  try {
    const r = await fetch(`${API_BASE}/gee/alerts/accuracy`, { headers: authHeaders() });
    const j = await r.json();
    return j?.by_class ?? [];
  } catch (e) { console.warn("[accuracy]", e); return []; }
}

// v21 — Détection des incendies de forêt (dNBR + thermique MODIS/VIIRS FIRMS)
export interface FireResult {
  dnbrTileUrl: string | null;
  thermalTileUrl: string | null;
  firms_points: { lat: number; lng: number }[];
  firms_count: number;
  burned_ha: number | null;
  fire_confirmed: boolean;
  verdict: string;
  period: string;
}
export async function fetchFireDetection(p: AnalyzeParams): Promise<FireResult | null> {
  try { return await geePost<FireResult>("/gee/fire-detection", buildBody(p)); }
  catch (e) { console.warn("[fire]", e); return null; }
}

export async function fetchPhenology(zone: string, dateStart: string, dateEnd: string, cloud = 30): Promise<PhenologyResult | null> {
  try {
    return await geePost<PhenologyResult>("/gee/phenology-baseline", {
      zone: toFlaskZone(zone), dateStart, dateEnd, cloud });
  } catch (e) { console.warn("[Phenology]", e); return null; }
}

// ── Statistiques annuelles (courbe de dégradation pluriannuelle) ──────────────
export interface AnnualStatRow {
  year: number; period: string;
  ndvi_mean: number | null;
  high_conf_ha: number | null;
  degraded_ha: number | null;
}
export interface AnnualStatsResult {
  success: boolean; zone: string; season_window: string;
  ref_year: number; years: number[]; series: AnnualStatRow[];
  ndvi_slope_per_year: number | null; trend: string;
  total_high_conf_ha: number; note: string;
}
export async function fetchAnnualStats(
  p: AnalyzeParams, years: number[],
  opts?: { monthStart?: number; monthEnd?: number; refYear?: number; cloud?: number },
): Promise<AnnualStatsResult | null> {
  try {
    const body = {
      ...buildBody(p),
      years: years.join(","),
      monthStart: opts?.monthStart ?? 6,
      monthEnd: opts?.monthEnd ?? 7,
      refYear: opts?.refYear ?? 2018,
      cloud: opts?.cloud ?? 35,
    };
    return await geePost<AnnualStatsResult>("/gee/annual-stats", body);
  } catch (e) { console.warn("[AnnualStats]", e); throw e; }
}

// ── Exports reels (polygones, cote backend) ──────────────────────────────────
const stamp = () => new Date().toISOString().split("T")[0];

export function exportPolygonsGeoJson(p: AnalyzeParams): Promise<void> {
  return downloadFile("/gee/export-geojson", buildBody(p), `disturbances_${p.zone}_${stamp()}.geojson`);
}
export function exportPolygonsKml(p: AnalyzeParams): Promise<void> {
  return downloadFile("/gee/export-kml", buildBody(p), `disturbances_${p.zone}_${stamp()}.kml`);
}
export function exportPolygonsShp(p: AnalyzeParams): Promise<void> {
  return downloadFile("/gee/export-shp", buildBody(p), `disturbances_${p.zone}_${stamp()}.zip`);
}

// CSV genere cote client a partir des polygones deja charges
export function exportPolygonsCsv(features: PolygonFeature[], zone: string): void {
  const BOM = "\uFEFF";
  const header = "ID,Confiance,Score,Aire_ha,Aire_m2,Lng_X,Lat_Y,NDVI_Delta,NBR_Delta,N_Scenes,Hansen_Annee,Preuves\n";
  const centroid = (f: PolygonFeature): [number, number] => {
    if (f.properties.lng != null && f.properties.lat != null) return [f.properties.lng, f.properties.lat];
    // fallback : moyenne des sommets
    try {
      const g: any = f.geometry;
      const ring = g.type === "MultiPolygon" ? g.coordinates[0][0] : g.coordinates[0];
      let sx = 0, sy = 0;
      ring.forEach((c: number[]) => { sx += c[0]; sy += c[1]; });
      return [sx / ring.length, sy / ring.length];
    } catch { return [0, 0]; }
  };
  const rows = features.map((f) => {
    const p = f.properties;
    const [lng, lat] = centroid(f);
    return [p.id, p.confidence, (p.conf_score ?? 0).toFixed(1),
      (p.area_ha ?? 0).toFixed(4), Math.round(p.area_m2 ?? 0),
      lng.toFixed(6), lat.toFixed(6),
      (p.ndvi_change ?? 0).toFixed(4), (p.nbr_change ?? 0).toFixed(4),
      p.n_scenes ?? "", p.hansen_year ?? "",
      `"${(p.preuves ?? "").replace(/"/g, "'")}"`].join(",");
  });
  const blob = new Blob([BOM + header + rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url, download: `disturbances_${zone}_${stamp()}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

// Export GeoTIFF (raster confiance + indices) vers Google Drive du compte de service.
// Disponible côté API ; à brancher sur un bouton si besoin d'un raster pour SIG.
export const exportGeoTiff = (p: AnalyzeParams) =>
  geePost<{ message: string }>("/gee/export-geotiff", buildBody(p));