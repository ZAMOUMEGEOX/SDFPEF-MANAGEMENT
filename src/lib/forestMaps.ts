// ════════════════════════════════════════════════════════════════════════════
// forestMaps.ts — Fonds de carte + imagerie historique (Esri Wayback)
//
// • La carte satellite ACTUELLE (Google) reste la plus récente → on la garde.
// • Esri World Imagery = fond satellite alternatif (légal, sans clé).
// • Esri WAYBACK = archive d'imagerie satellite DATÉE (≈ depuis 2014), idéale
//   pour la détection de changement visuel (équivalent légal du "time-series").
//   Pas d'API tuiles historiques Google publique → Wayback est la bonne réponse.
// ════════════════════════════════════════════════════════════════════════════

export interface Basemap { id: string; name: string; url: string; attribution: string; maxZoom?: number; }

export const ESRI_WORLD_IMAGERY =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

export const BASEMAPS: Basemap[] = [
  { id: 'google_hybrid', name: 'Hybride (Google) — actuel', url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', attribution: 'Google', maxZoom: 21 },
  { id: 'google_sat',    name: 'Satellite (Google) — actuel', url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', attribution: 'Google', maxZoom: 21 },
  { id: 'esri',          name: 'Satellite (Esri World Imagery)', url: ESRI_WORLD_IMAGERY, attribution: 'Esri, Maxar, Earthstar', maxZoom: 21 },
  { id: 'osm',           name: 'OpenStreetMap', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap', maxZoom: 19 },
  { id: 'topo',          name: 'Topographique', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attribution: '© OpenTopoMap', maxZoom: 17 },
];

export interface WaybackRelease { rel: number; date: string; url: string; }

// Config publique listant toutes les versions datées de Wayback.
const WAYBACK_CONFIG_URL =
  'https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json';

/**
 * Récupère la liste des versions Wayback (datées), triées du plus récent au plus
 * ancien, avec une URL de tuiles compatible Leaflet ({z}/{y}/{x}).
 * S'exécute dans le navigateur de l'app (qui a accès internet).
 */
export async function fetchWaybackReleases(): Promise<WaybackRelease[]> {
  try {
    const res = await fetch(WAYBACK_CONFIG_URL);
    const cfg = await res.json();
    const out: WaybackRelease[] = [];
    for (const key of Object.keys(cfg)) {
      const item = cfg[key];
      const tpl = (item.itemURL || '')
        .replace('{level}', '{z}').replace('{row}', '{y}').replace('{col}', '{x}');
      // itemTitle ex. "World Imagery (Wayback 2023-09-20)"
      const m = String(item.itemTitle || '').match(/(\d{4}-\d{2}-\d{2})/);
      out.push({ rel: Number(key), date: m ? m[1] : String(item.itemTitle || key), url: tpl });
    }
    out.sort((a, b) => (a.date < b.date ? 1 : -1));
    return out;
  } catch {
    return [];
  }
}
