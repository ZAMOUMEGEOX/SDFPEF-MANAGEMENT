// src/lib/gee-api.ts
// ─────────────────────────────────────────────────────────────────────────────
// Client library — tous les appels passent par server.ts proxy
// Route: /api/gee/* → https://ZAMOUMEGEO.pythonanywhere.com/*
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = "/api/gee";

// ── Zone ID Normalisation ─────────────────────────────────────────────────────
// UI utilise 'mdiq', Flask attend 'df_mdiq'
const ZONE_MAP: Record<string, string> = {
  mdiq: "df_mdiq",
  tetouan_est: "tetouan_est",
  tetouan_ouest: "tetouan_ouest",
};

export const toFlaskZone = (zone: string): string =>
  ZONE_MAP[zone] ?? zone;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GeeHealthStatus {
  gee: boolean;
  version: string;
  status: "ok" | "degraded";
  gee_error?: string | null;
}

export interface AnalyzeParams {
  zone: string;          // ID zone UI ('mdiq' | 'tetouan_est' | 'tetouan_ouest')
  date1Start: string;    // Référence début (YYYY-MM-DD)
  date1End: string;      // Référence fin
  date2Start: string;    // Actuelle début
  date2End: string;      // Actuelle fin
  cloud?: number;        // Max cloud % (default 30)
  sensitivity?: number;  // NDVI threshold (default 0.15)
  nbr?: number;          // NBR threshold  (default 0.15)
  ndmi?: number;         // NDMI threshold (default 0.12)
  minScore?: number;     // Confidence min 1-3 (default 1)
}

export interface AnalyzeStats {
  high_ha: number;
  medium_ha: number;
  low_ha: number;
  total_ha: number;
  alert_level: "CRITIQUE" | "ELEVE" | "MOYEN" | "FAIBLE";
}

export interface AlertFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    id: number;
    area_ha: number;
    confidence: "high" | "medium" | "low";
    conf_score: number;
    ndvi_change: number;
    nbr_change: number;
    ndmi_change: number;
    hansen_year: number | null;
    period1: string;
    period2: string;
    radius_m: number;
    triple_confirmed?: boolean;
    alert_type?: string;
  };
}

export interface AnalyzeResult {
  success: boolean;
  zone: string;
  beforeTileUrl: string | null;
  afterTileUrl: string | null;
  distTileUrl: string | null;
  ndviTileUrl: string | null;
  beforeLabel: string;
  afterLabel: string;
  period1: string;
  period2: string;
  features: AlertFeature[];
  count: number;
  stats: AnalyzeStats;
  sample_warn: string | null;
  algorithm: string;
  error?: string;
}

export interface GladResult {
  success: boolean;
  tileUrl: string | null;
  area_ha: number;
  zone: string;
  error?: string;
}

export interface NdviData {
  date_start: string;
  date_end: string;
  ndvi_mean: number;
  ndvi_min: number;
  ndvi_max: number;
  health_status: "good" | "warning" | "critical";
  zone: string;
}

export interface DomainStats {
  nombre_parcelles: number;
  superficie_totale_ha: number;
  nombre_forets: number;
  forets: string[];
  cantons: string[];
  region: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper interne — POST avec timeout (GEE peut être lent)
// ─────────────────────────────────────────────────────────────────────────────
async function geePost<T>(
  path: string,
  body: Record<string, unknown>,
  timeoutMs = 150_000
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = await res.json();

    if (!res.ok || data.success === false) {
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

async function geeGet<T>(
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const qs = params
    ? "?" +
      Object.entries(params)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join("&")
    : "";

  const res = await fetch(`${API_BASE}${path}${qs}`);
  const data = await res.json();

  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// API Publique
// ─────────────────────────────────────────────────────────────────────────────

/** Vérifie si GEE est en ligne */
export async function checkGeeHealth(): Promise<GeeHealthStatus | null> {
  try {
    return await geeGet<GeeHealthStatus>("/health");
  } catch {
    return null;
  }
}

/**
 * Analyse complète : disturbance + alerts + tile URLs
 * Retourne beforeTileUrl, afterTileUrl, distTileUrl, ndviTileUrl + features + stats
 */
export async function runAnalyze(params: AnalyzeParams): Promise<AnalyzeResult> {
  return geePost<AnalyzeResult>("/gee/analyze", {
    zone:        toFlaskZone(params.zone),
    date1Start:  params.date1Start,
    date1End:    params.date1End,
    date2Start:  params.date2Start,
    date2End:    params.date2End,
    cloud:       params.cloud       ?? 30,
    sensitivity: params.sensitivity ?? 0.15,
    nbr:         params.nbr         ?? 0.15,
    ndmi:        params.ndmi        ?? 0.12,
    minScore:    params.minScore    ?? 1,
  });
}

/**
 * Triple confirmation (P1 → P2 → P3)
 * Auto-dérive P1 = période de référence décalée -1 an
 */
export async function runTripleAnalyze(
  params: AnalyzeParams
): Promise<{ features: AlertFeature[]; triple_ha: number; error?: string }> {
  const shiftYear = (d: string, delta: number): string => {
    const dt = new Date(d);
    dt.setFullYear(dt.getFullYear() + delta);
    return dt.toISOString().split("T")[0];
  };

  try {
    const data = await geePost<any>("/gee/alerts-triple", {
      zone:       toFlaskZone(params.zone),
      date1Start: shiftYear(params.date1Start, -1),
      date1End:   shiftYear(params.date1End,   -1),
      date2Start: params.date1Start,
      date2End:   params.date1End,
      date3Start: params.date2Start,
      date3End:   params.date2End,
      cloud:       params.cloud       ?? 30,
      sensitivity: params.sensitivity ?? 0.15,
      nbr:         params.nbr         ?? 0.15,
      ndmi:        params.ndmi        ?? 0.12,
    });

    return {
      features:  (data.features ?? []) as AlertFeature[],
      triple_ha: data.triple_ha ?? 0,
    };
  } catch (e: any) {
    return { features: [], triple_ha: 0, error: String(e.message) };
  }
}

/** GLAD / RADD deforestation alerts */
export async function fetchGladAlerts(zone: string): Promise<GladResult> {
  try {
    return await geePost<GladResult>("/gee/glad-alerts", {
      zone: toFlaskZone(zone),
    });
  } catch (e: any) {
    return { success: false, tileUrl: null, area_ha: 0, zone, error: e.message };
  }
}

/** Stats NDVI de la période actuelle */
export async function fetchNdvi(
  zone: string,
  dateStart?: string,
  dateEnd?: string,
  cloud = 30
): Promise<NdviData | null> {
  try {
    return await geePost<NdviData>("/ndvi/latest", {
      zone:      toFlaskZone(zone),
      dateStart: dateStart ?? "",
      dateEnd:   dateEnd   ?? "",
      cloud,
    });
  } catch {
    return null;
  }
}

/** Stats domaine forestier (superficie totale, parcelles, forêts...) */
export async function fetchDomainStats(): Promise<DomainStats | null> {
  try {
    return await geeGet<DomainStats>("/domaine/stats");
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Export Utilitaires (côté client — pas d'appel API)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Télécharge les perturbations détectées comme GeoJSON depuis Flask
 * (résolution 200m — réduction de la taille)
 */
export async function exportDisturbanceGeoJson(params: AnalyzeParams): Promise<void> {
  const body = {
    zone:        toFlaskZone(params.zone),
    date1Start:  params.date1Start,
    date1End:    params.date1End,
    date2Start:  params.date2Start,
    date2End:    params.date2End,
    cloud:       params.cloud       ?? 30,
    sensitivity: params.sensitivity ?? 0.15,
    nbr:         params.nbr         ?? 0.15,
    ndmi:        params.ndmi        ?? 0.12,
    minScore:    params.minScore    ?? 2,
    scale:       200,
  };

  const res = await fetch(`${API_BASE}/gee/export-disturbance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error("Export GeoJSON échoué");

  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), {
    href:     url,
    download: `perturbations_${params.zone}_${params.date2Start}.geojson`,
  });
  a.click();
  URL.revokeObjectURL(url);
}

/** Génère un fichier KML depuis les features d'alertes */
export function exportAlertsKml(features: AlertFeature[], zone: string): void {
  const colorMap: Record<string, string> = {
    high:   "ff0000ff",
    medium: "ff0088ff",
    low:    "ff00ddff",
  };

  const placemarks = features
    .map((f) => {
      const [lng, lat] = f.geometry.coordinates;
      const p          = f.properties;
      return `  <Placemark>
    <name>Alerte #${p.id} — ${p.confidence}</name>
    <description><![CDATA[
      Confiance: ${p.confidence} (score: ${p.conf_score?.toFixed(1)})<br/>
      NDVI Δ: ${p.ndvi_change?.toFixed(3)}<br/>
      NBR Δ: ${p.nbr_change?.toFixed(3)}<br/>
      NDMI Δ: ${p.ndmi_change?.toFixed(3)}<br/>
      Surface estimée: ${p.area_ha?.toFixed(2)} ha<br/>
      ${p.hansen_year ? `Hansen: ${p.hansen_year}<br/>` : ""}
      ${p.triple_confirmed ? "✅ Triple confirmée<br/>" : ""}
      Période: ${p.period2}
    ]]></description>
    <Style>
      <IconStyle>
        <color>${colorMap[p.confidence] ?? "ffff0000"}</color>
        <scale>0.9</scale>
      </IconStyle>
    </Style>
    <Point><coordinates>${lng},${lat},0</coordinates></Point>
  </Placemark>`;
    })
    .join("\n");

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>AtlasForest — Perturbations ${zone}</name>
    <description>Généré le ${new Date().toISOString().split("T")[0]}</description>
${placemarks}
  </Document>
</kml>`;

  const blob = new Blob([kml], {
    type: "application/vnd.google-earth.kml+xml",
  });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), {
    href:     url,
    download: `alertes_${zone}_${new Date().toISOString().split("T")[0]}.kml`,
  });
  a.click();
  URL.revokeObjectURL(url);
}

/** Génère un CSV Excel-compatible depuis les features d'alertes */
export function exportAlertsCsv(features: AlertFeature[], zone: string): void {
  const BOM    = "\uFEFF"; // UTF-8 BOM pour Excel
  const header = "ID,Latitude,Longitude,Confiance,Score,NDVI_Delta,NBR_Delta,NDMI_Delta,Surface_ha,Hansen_Annee,Triple_Confirmee,Periode1,Periode2\n";

  const rows = features.map((f) => {
    const [lng, lat] = f.geometry.coordinates;
    const p          = f.properties;
    return [
      p.id, lat.toFixed(6), lng.toFixed(6),
      p.confidence, p.conf_score?.toFixed(2),
      p.ndvi_change?.toFixed(4), p.nbr_change?.toFixed(4), p.ndmi_change?.toFixed(4),
      p.area_ha?.toFixed(4), p.hansen_year ?? "",
      p.triple_confirmed ? "OUI" : "NON",
      p.period1, p.period2,
    ].join(",");
  });

  const blob = new Blob([BOM + header + rows.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), {
    href:     url,
    download: `alertes_${zone}_${new Date().toISOString().split("T")[0]}.csv`,
  });
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sentinel-1 SAR
// ─────────────────────────────────────────────────────────────────────────────

export interface Sentinel1Result {
  success: boolean;
  tileUrl: string | null;
  period1: string;
  period2: string;
  band: string;
  orbitPass: string;
  palette: string;
  loss_ha: number;
  zone: string;
  note: string;
  dVV_stats: {
    mean: number;
    stdDev: number;
    min: number;
    max: number;
  };
}

/**
 * Détection de changement Sentinel-1 (dVV SAR)
 * Bleu = perte rétrodiffusion = perturbation
 * Rouge = gain rétrodiffusion
 * dVV < -3 dB → perte confirmée
 */
export async function fetchSentinel1Change(
  params: AnalyzeParams
): Promise<Sentinel1Result | null> {
  try {
    return await geePost<Sentinel1Result>("/gee/sentinel1-change", {
      zone:       toFlaskZone(params.zone),
      date1Start: params.date1Start,
      date1End:   params.date1End,
      date2Start: params.date2Start,
      date2End:   params.date2End,
    });
  } catch (e) {
    console.warn("[Sentinel-1]", e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phénologie — comparaison NDVI vs baseline 3 ans
// ─────────────────────────────────────────────────────────────────────────────

export type AnomalyLabel =
  | "severe_deficit"
  | "moderate_deficit"
  | "slight_deficit"
  | "normal"
  | "above_average"
  | "unknown";

export interface PhenologyResult {
  success: boolean;
  period_current: string;
  baseline_years: number[];
  baseline_ndvi: number | null;
  current_ndvi: number;
  current_std: number;
  ndvi_anomaly: number | null;
  anomaly_score: number | null;
  anomaly_label: AnomalyLabel;
  tileUrl: string | null;
  algorithm: string;
  zone: string;
}

/**
 * Baseline phénologique — compare la période actuelle
 * aux 3 années précédentes (même mois)
 * Détecte les anomalies NDVI (déficits = stress végétal)
 */
export async function fetchPhenology(
  zone: string,
  dateStart: string,
  dateEnd: string,
  cloud = 30
): Promise<PhenologyResult | null> {
  try {
    return await geePost<PhenologyResult>("/gee/phenology-baseline", {
      zone:      toFlaskZone(zone),
      dateStart,
      dateEnd,
      cloud,
    });
  } catch (e) {
    console.warn("[Phenology]", e);
    return null;
  }
}