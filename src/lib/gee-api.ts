// ─────────────────────────────────────────────────────────────────────────────
// Client GEE v21 — Lazy Tiles, Pagination, FIRMS Controlled, Wayback Fix
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = "/api/gee";

const API_KEY: string =
  (typeof import.meta !== "undefined" && (import.meta as any)?.env?.VITE_API_KEY) || "";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json", ...(extra ?? {}) };
  if (API_KEY) h["X-API-Key"] = API_KEY;
  return h;
}

function httpErrorMessage(status: number, fallback?: string): string {
  if (status === 401) return "Accès refusé : clé API manquante ou invalide.";
  if (status === 403) return "Accès interdit.";
  if (status === 413) return "Zone trop volumineuse ou trop complexe.";
  if (status === 429) return "Trop de requêtes. Patientez avant de relancer.";
  if (status === 503) return "Service GEE momentanément indisponible.";
  return fallback || `Erreur serveur (${status}).`;
}

const ZONE_MAP: Record<string, string> = {
  mdiq: "df_mdiq", tetouan_est: "tetouan_est", tetouan_ouest: "tetouan_ouest",
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
  cloud?: number; sensitivity?: number; nbr?: number; ndmi?: number; vv?: number;
  minScore?: number; minArea?: number;
  useRadar?: boolean; useTemporal?: boolean; useSeasonal?: boolean; useExternal?: boolean;
  useForest?: boolean; useMultiscene?: boolean; minScenes?: number;
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
  hansen_year: number | null; lng?: number; lat?: number; n_scenes?: number | null;
  preuves?: string; cause?: string; // v21: ajout de la cause probable
  ev_optic?: number; ev_persist?: number; ev_radar?: number;
  ev_external?: number; ev_seasonal?: number; ev_temporal?: number;
  score_w?: number;
}
export interface PolygonFeature {
  type: "Feature";
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: any };
  properties: PolygonProps;
}
export interface PolygonFC { type: "FeatureCollection"; features: PolygonFeature[] }

export interface AnalyzeResult {
  success: boolean; zone: string; taskId: string; // Indispensable pour le lazy loading
  beforeTileUrl: string | null; afterTileUrl: string | null;
  distTileUrl: string | null;
  // Les tuiles ci-dessous sont SUPPRIMÉES du retour initial pour gagner en vitesse
  // Elles seront chargées via fetchLazyTile()
  beforeLabel: string; afterLabel: string;
  period1: string; period2: string;
  count: number; stats: AnalyzeStats;
  algorithm: string; evidence_used?: string[]; error?: string;
}

// Types pour la pagination (Pour éviter de faire planter le UI avec des JSON de 2Mo)
export interface PaginatedPolygons {
  total: number; page: number; per_page: number;
  features: PolygonFeature[]; has_more: boolean;
}

export interface AnalyzeProgress { progress: number; message: string; status: string }
export interface AnalyzeHandle { taskId: string; cancel: () => Promise<void> }

// ── Helpers HTTP ─────────────────────────────────────────────────────────────
function buildBody(p: AnalyzeParams): Record<string, unknown> {
  const body: Record<string, unknown> = {
    zone: toFlaskZone(p.zone),
    date1Start: p.date1Start, date1End: p.date1End,
    date2Start: p.date2Start, date2End: p.date2End,
    cloud: p.cloud ?? 30, sensitivity: p.sensitivity ?? 0.15,
    nbr: p.nbr ?? 0.15, ndmi: p.ndmi ?? 0.12, vv: p.vv ?? 2.0,
    minScore: p.minScore ?? 2, minArea: p.minArea ?? 500,
    useRadar: p.useRadar ?? false, useTemporal: p.useTemporal ?? false,
    useSeasonal: p.useSeasonal ?? true, useExternal: p.useExternal ?? true,
    useForest: p.useForest ?? true,
    useMultiscene: p.useMultiscene ?? true, minScenes: p.minScenes ?? 2,
  };
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
    if (!res.ok || data?.success === false) throw new Error(data?.error ?? httpErrorMessage(res.status));
    return data as T;
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error("Délai dépassé.");
    throw e;
  } finally { clearTimeout(t); }
}

async function geeGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const qs = params ? "?" + Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&") : "";
  const res = await fetch(`${API_BASE}${path}${qs}`, { headers: authHeaders() });
  let data: any = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) throw new Error(data?.error ?? httpErrorMessage(res.status));
  return data as T;
}

// ── API PUBLIQUE ─────────────────────────────────────────────────────────────
export async function checkGeeHealth(): Promise<GeeHealthStatus | null> {
  try { return await geeGet<GeeHealthStatus>("/health"); } catch { return null; }
}

export async function runAnalyzeAsync(
  p: AnalyzeParams,
  onProgress?: (u: AnalyzeProgress) => void,
  onHandle?: (h: AnalyzeHandle) => void,
): Promise<AnalyzeResult> {
  const start = await geePost<{ task_id: string }("/gee/analyze-async", buildBody(p));
  const taskId = start.task_id;
  let cancelled = false;

  const cancel = async () => {
    cancelled = true;
    try { await fetch(`${API_BASE}/gee/analyze-cancel/${taskId}`, { method: "POST", headers: authHeaders() }); } catch { /* noop */ }
  };
  onHandle?.({ taskId, cancel });

  const POLL_MS = 1500; const MAX_MS = 15 * 60_000; const t0 = Date.now();
  while (true) {
    if (cancelled) throw new Error("Analyse annulée");
    await new Promise(r => setTimeout(r, POLL_MS));
    if (Date.now() - t0 > MAX_MS) throw new Error("Délai maximal dépassé");
    let st: any;
    try {
      const res = await fetch(`${API_BASE}/gee/analyze-status/${taskId}`, { headers: authHeaders() });
      st = await res.json();
      if (!res.ok) throw new Error(st?.error ?? `HTTP ${res.status}`);
    } catch (e) { continue; }
    onProgress?.({ progress: st.progress ?? 0, message: st.message ?? "", status: st.status });
    if (st.status === "done") return st.result as AnalyzeResult;
    if (st.status === "error") throw new Error(st.error ?? "Erreur GEE");
    if (st.status === "cancelled") throw new Error("Analyse annulée");
  }
}

// v21 — Lazy Tiles : Charge une couche lourde uniquement quand l'utilisateur l'active
export async function fetchLazyTile(taskId: string, layerType: 'nbr' | 'ndvi' | 'multiscene' | 'high_only'): Promise<string | null> {
  try {
    const r = await geeGet<{ url: string }>(`/gee/lazy-tile/${taskId}/${layerType}`);
    return r.url ?? null;
  } catch (e) { console.warn(`[lazy-tile:${layerType}]`, e); return null; }
}

// v21 — Pagination des polygones (Évite les JSON de 2Mo qui gelent l'UI)
export async function fetchPaginatedPolygons(
  taskId: string, page = 1, perPage = 50, minScore = 2
): Promise<PaginatedPolygons> {
  return geeGet<PaginatedPolygons>(`/gee/polygons/${taskId}`, {
    page: String(page), per_page: String(perPage), min_score: String(minScore)
  });
}

// v21 — FIRMS avec contrôle total
export interface FirmsCluster {
  id: number; bbox: [number, number, number, number];
  center: [number, number]; point_count: number;
  date_range: [string, string] | null; max_frp: number;
  estimated_area_ha: number; mean_dnbr?: number; fire_confirmed?: boolean;
}
export interface FirmsControlledResult {
  success: boolean;
  firms_points: Array<{latitude: number; longitude: number; confidence: number; acq_date: string}>;
  clusters: FirmsCluster[]; firms_count: number; confirmed_count: number;
}
export async function fetchFirmsControlled(
  p: AnalyzeParams,
  opts: { confidence?: 'n' | 'l' | 'm' | 'h'; source?: string; linkDnbr?: boolean } = {}
): Promise<FirmsControlledResult | null> {
  try {
    return await geePost<FirmsControlledResult>("/gee/firms-controlled", {
      ...buildBody(p),
      firms_confidence: opts.confidence ?? 'n',
      firms_source: opts.source ?? 'VIIRS_SNPP_NRT',
      link_dnbr: opts.linkDnbr ?? true,
    });
  } catch (e) { console.warn("[FIRMS]", e); return null; }
}

// ── ESRI WAYBACK FIX (Client-Side) ──────────────────────────────────────────
export interface WaybackImage {
  id: string; displayDate: string; acquisitionDate: string;
  sourceItemId: string; url: string;
}

export function fixWaybackDates(images: WaybackImage[]): WaybackImage[] {
  const now = new Date();
  return images
    .filter(img => new Date(img.acquisitionDate) <= new Date(now.getTime() + 30 * 86400000))
    .sort((a, b) => new Date(b.acquisitionDate).getTime() - new Date(a.acquisitionDate).getTime())
    .filter((img, i, arr) => i === arr.findIndex(o => o.sourceItemId === img.sourceItemId))
    .map(img => ({ ...img, displayDate: img.acquisitionDate }));
}

export function prioritizeWaybackByS2(wayback: WaybackImage[], s2Dates: string[]): WaybackImage[] {
  if (!s2Dates.length) return wayback;
  const maxDiff = 7 * 86400000;
  return wayback.map(img => {
    const wTime = new Date(img.acquisitionDate).getTime();
    const minDiff = Math.min(...s2Dates.map(d => Math.abs(wTime - new Date(d).getTime())));
    return { ...img, _proximity: minDiff };
  }).sort((a, b) => {
    const aM = a._proximity < maxDiff ? 0 : 1;
    const bM = b._proximity < maxDiff ? 0 : 1;
    return aM - bM || a._proximity - b._proximity;
  });
}

// ── Exports & Autres (Inchangés mais optimisés) ─────────────────────────────
export async function saveAlerts(features: PolygonFeature[], zone: string, minScore = 3, type: "changement" | "incendie" = "changement"): Promise<number> {
  try { const r = await geePost<{ saved: number }>("/gee/alerts/save", { features, zone, min_score: minScore, type }); return r.saved ?? 0; }
  catch (e) { console.warn("[alerts/save]", e); return 0; }
}

const stamp = () => new Date().toISOString().split("T")[0];
export function exportPolygonsCsv(features: PolygonFeature[], zone: string): void {
  const BOM = "\uFEFF";
  const header = "ID,Confiance,Score,Cause,Aire_ha,Lng_X,Lat_Y,NBR_Delta,Preuves\n";
  const rows = features.map(f => {
    const p = f.properties;
    return [p.id, p.confidence, p.conf_score, p.cause ?? "", p.area_ha.toFixed(4),
      p.lng?.toFixed(6) ?? 0, p.lat?.toFixed(6) ?? 0, p.nbr_change?.toFixed(4) ?? 0,
      `"${(p.preuves ?? "").replace(/"/g, "'")}"`].join(",");
  });
  const blob = new Blob([BOM + header + rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: `alerts_${zone}_${stamp()}.csv` });
  a.click(); URL.revokeObjectURL(url);
}