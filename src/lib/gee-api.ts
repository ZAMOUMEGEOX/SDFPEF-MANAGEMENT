// src/lib/gee-api.ts
// ─────────────────────────────────────────────────────────────────────────────
// Client GEE v12 — polygones reels, swipe before/after, exports backend (GeoJSON/KML/SHP)
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = "/api/gee";

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
  minScore?: number;     // 1..4
  minArea?: number;      // m²
  useRadar?: boolean; useTemporal?: boolean; useSeasonal?: boolean; useExternal?: boolean;
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
  return {
    zone: toFlaskZone(p.zone),
    date1Start: p.date1Start, date1End: p.date1End,
    date2Start: p.date2Start, date2End: p.date2End,
    cloud: p.cloud ?? 30,
    sensitivity: p.sensitivity ?? 0.15,
    nbr: p.nbr ?? 0.15, ndmi: p.ndmi ?? 0.12, vv: p.vv ?? 2.0,
    minScore: p.minScore ?? 2, minArea: p.minArea ?? 500,
    // Defaut LEGER (rapide) — les preuves lourdes ne tournent que si activees via les toggles
    useRadar: p.useRadar ?? false, useTemporal: p.useTemporal ?? false,
    useSeasonal: p.useSeasonal ?? false, useExternal: p.useExternal ?? false,
  };
}

async function geePost<T>(path: string, body: Record<string, unknown>, timeoutMs = 290_000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: ctrl.signal,
    });
    const data = await res.json();
    if (!res.ok || data.success === false) throw new Error(data.error ?? `HTTP ${res.status}`);
    return data as T;
  } finally { clearTimeout(t); }
}

async function geeGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const qs = params ? "?" + Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&") : "";
  const res = await fetch(`${API_BASE}${path}${qs}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

// Telecharge un fichier produit par un endpoint POST (geojson/kml/shp)
async function downloadFile(path: string, body: Record<string, unknown>, filename: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
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

export async function fetchTopPolygons(p: AnalyzeParams, topN = 20): Promise<PolygonFC> {
  const data = await geePost<{ features: PolygonFeature[] }>(
    "/gee/top-polygons", { ...buildBody(p), topN });
  return { type: "FeatureCollection", features: data.features ?? [] };
}

export async function fetchForestWatchLayer(p: AnalyzeParams): Promise<ForestWatchResult | null> {
  try { return await geePost<ForestWatchResult>("/gee/forest-watch-layer", buildBody(p)); }
  catch (e) { console.warn("[ForestWatch]", e); return null; }
}

export async function fetchSentinel1Change(p: AnalyzeParams): Promise<Sentinel1Result | null> {
  try { return await geePost<Sentinel1Result>("/gee/sentinel1-change", buildBody(p)); }
  catch (e) { console.warn("[Sentinel-1]", e); return null; }
}

export async function fetchPhenology(zone: string, dateStart: string, dateEnd: string, cloud = 30): Promise<PhenologyResult | null> {
  try {
    return await geePost<PhenologyResult>("/gee/phenology-baseline", {
      zone: toFlaskZone(zone), dateStart, dateEnd, cloud });
  } catch (e) { console.warn("[Phenology]", e); return null; }
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
  const header = "ID,Confiance,Score,Aire_ha,Aire_m2,NDVI_Delta,NBR_Delta,NDMI_Delta,Hansen_Annee\n";
  const rows = features.map((f) => {
    const p = f.properties;
    return [p.id, p.confidence, (p.conf_score ?? 0).toFixed(1),
      (p.area_ha ?? 0).toFixed(4), Math.round(p.area_m2 ?? 0),
      (p.ndvi_change ?? 0).toFixed(4), (p.nbr_change ?? 0).toFixed(4),
      (p.ndmi_change ?? 0).toFixed(4), p.hansen_year ?? ""].join(",");
  });
  const blob = new Blob([BOM + header + rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url, download: `disturbances_${zone}_${stamp()}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

export const exportGeoTiff = (p: AnalyzeParams) =>
  geePost<{ message: string }>("/gee/export-geotiff", buildBody(p));