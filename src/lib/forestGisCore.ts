// ════════════════════════════════════════════════════════════════════════════
// forestGisCore.ts — Noyau GIS pour la gestion du Domaine Forestier
// Framework-agnostic (turf v7 + proj4 uniquement — déjà présents dans le projet)
//
// Sections :
//   1. Projections / CRS          (Lambert Maroc, UTM, WGS84, DMS, détection CRS)
//   2. Réparation de géométrie    (cleanCoords + rewind + unkink ≈ ST_MakeValid)
//   3. Géotraitement              (difference/erase, clip, split, symdiff, dissolve,
//                                  multi-ring buffer, convex, voronoi, centroïde…)
//   4. Spatial join & proximité   (jointure attributaire, distance au bord)
//   5. COGO / Traverse            (bornes Lambert → polygone, gisement+distance)
//   6. Chevauchement v2           (dissolve forêt + pré-filtre bbox + réparation)
//   7. Export                     (KML, GPX — utilisables dans QGIS / GPS)
//   8. Composeur d'impression     (géométrie → SVG à l'échelle + nord + barre)
//   9. Registre d'outils          (métadonnées pour câbler l'UI du Géotraitement)
// ════════════════════════════════════════════════════════════════════════════

import * as turf from '@turf/turf';
import proj4 from 'proj4';
import * as shpwrite from '@mapbox/shp-write';

// ─────────────────────────────────────────────────────────────────────────────
// 1. PROJECTIONS / CRS
// ─────────────────────────────────────────────────────────────────────────────

export const EPSG = {
  WGS84: 'EPSG:4326',
  LAMBERT_NORD: 'EPSG:26191', // Merchich / Nord Maroc
  LAMBERT_SUD: 'EPSG:26192',  // Merchich / Sud Maroc
  UTM_29N: 'EPSG:32629',
  UTM_30N: 'EPSG:32630',
} as const;

/**
 * Enregistre les CRS marocains dans proj4.
 *
 * ⚠️ NOTE LÉGALE IMPORTANTE — à lire avant tout usage cadastral officiel :
 * La définition ci-dessous est la définition EPSG STANDARD de 26191 (Merchich,
 * transformation Helmert 3 paramètres towgs84=31,146,47). C'est la définition
 * canonique et correcte au sens EPSG, MAIS la transformation Helmert à 3
 * paramètres a une incertitude inhérente (de l'ordre du mètre selon la zone).
 * Pour une bornage légalement opposable, récupérez auprès de l'ANCFCC la
 * transformation officielle (paramètres affinés ou grille NTv2) et remplacez
 * la chaîne towgs84 ci-dessous. NE PAS inventer de paramètres « plus précis ».
 */
export function registerProjections() {
  proj4.defs(
    EPSG.LAMBERT_NORD,
    '+proj=lcc +lat_1=33.3 +lat_0=33.3 +lon_0=-5.4 +k_0=0.999625769 ' +
      '+x_0=500000 +y_0=300000 +a=6378249.2 +b=6356515 ' +
      '+towgs84=31,146,47,0,0,0,0 +units=m +no_defs',
  );
  proj4.defs(
    EPSG.LAMBERT_SUD,
    '+proj=lcc +lat_1=29.7 +lat_0=29.7 +lon_0=-5.4 +k_0=0.999615596 ' +
      '+x_0=500000 +y_0=300000 +a=6378249.2 +b=6356515 ' +
      '+towgs84=31,146,47,0,0,0,0 +units=m +no_defs',
  );
  proj4.defs(EPSG.UTM_29N, '+proj=utm +zone=29 +datum=WGS84 +units=m +no_defs');
  proj4.defs(EPSG.UTM_30N, '+proj=utm +zone=30 +datum=WGS84 +units=m +no_defs');
}

export type XY = { x: number; y: number };

export const toLambertNord = (lat: number, lng: number): XY => {
  const [x, y] = proj4(EPSG.WGS84, EPSG.LAMBERT_NORD, [lng, lat]);
  return { x, y };
};
export const fromLambertNord = (x: number, y: number): { lat: number; lng: number } => {
  const [lng, lat] = proj4(EPSG.LAMBERT_NORD, EPSG.WGS84, [x, y]);
  return { lat, lng };
};
export const toUTM30N = (lat: number, lng: number): XY => {
  const [x, y] = proj4(EPSG.WGS84, EPSG.UTM_30N, [lng, lat]);
  return { x, y };
};

/** Décimal → Degrés Minutes Secondes (ex. 35.6248 → 35°37'29.3"N). */
export function toDMS(value: number, isLat: boolean): string {
  const hemi = isLat ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  const abs = Math.abs(value);
  const d = Math.floor(abs);
  const mFloat = (abs - d) * 60;
  const m = Math.floor(mFloat);
  const s = ((mFloat - m) * 60).toFixed(1);
  return `${d}°${m}'${s}"${hemi}`;
}

/** Chaîne multi-format pour un point WGS84 : DMS + Lambert + UTM. */
export function formatCoord(lat: number, lng: number): {
  wgs84: string; dms: string; lambert: string; utm: string;
} {
  const lam = toLambertNord(lat, lng);
  const utm = toUTM30N(lat, lng);
  return {
    wgs84: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
    dms: `${toDMS(lat, true)}  ${toDMS(lng, false)}`,
    lambert: `X ${lam.x.toFixed(2)}  Y ${lam.y.toFixed(2)}`,
    utm: `30N  E ${utm.x.toFixed(1)}  N ${utm.y.toFixed(1)}`,
  };
}

/**
 * Détecte si un GeoJSON est probablement en coordonnées PROJETÉES (Lambert/UTM)
 * au lieu de WGS84. Heuristique : une longitude/latitude valide est dans
 * [-180,180]/[-90,90]. Des valeurs hors de cette plage = projeté.
 * Indispensable à l'import (SHP arrive souvent en Lambert non reprojeté).
 */
export function looksProjected(geojson: any): boolean {
  let projected = false;
  try {
    turf.coordEach(geojson, (c) => {
      if (Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90) projected = true;
    });
  } catch {}
  return projected;
}

/** Reprojette un GeoJSON entier d'un CRS source vers un CRS cible (in place sur une copie). */
export function reprojectGeoJSON(geojson: any, fromEPSG: string, toEPSG: string): any {
  const out = structuredClone(geojson);
  turf.coordEach(out, (c) => {
    const [a, b] = proj4(fromEPSG, toEPSG, [c[0], c[1]]);
    c[0] = a; c[1] = b;
  });
  return out;
}

/**
 * À utiliser à l'import : si le fichier semble projeté, on tente Lambert Nord → WGS84.
 * Retourne { geojson, reprojected, assumedFrom }.
 */
export function normalizeToWGS84(geojson: any, assumeFrom: string = EPSG.LAMBERT_NORD): {
  geojson: any; reprojected: boolean; assumedFrom: string | null;
} {
  if (looksProjected(geojson)) {
    return { geojson: reprojectGeoJSON(geojson, assumeFrom, EPSG.WGS84), reprojected: true, assumedFrom: assumeFrom };
  }
  return { geojson, reprojected: false, assumedFrom: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. RÉPARATION DE GÉOMÉTRIE (≈ ST_MakeValid)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Nettoie et valide une géométrie avant toute opération booléenne.
 * - cleanCoords : retire les sommets dupliqués/colinéaires
 * - rewind      : ordre des anneaux conforme (extérieur antihoraire)
 * - unkinkPolygon : casse les auto-intersections en polygones valides
 * Retourne TOUJOURS un Feature ou FeatureCollection exploitable.
 */
export function repairGeometry(input: any): any {
  try {
    const feat = input.type === 'Feature' || input.type === 'FeatureCollection'
      ? input
      : turf.feature(input);
    const features = feat.type === 'FeatureCollection' ? feat.features : [feat];
    const repaired: any[] = [];
    for (const f of features) {
      if (!f?.geometry) continue;
      let g = f;
      try { g = turf.cleanCoords(g); } catch {}
      try { g = turf.rewind(g, { reverse: false }); } catch {}
      if (g.geometry.type === 'Polygon' || g.geometry.type === 'MultiPolygon') {
        try {
          const unk = turf.unkinkPolygon(g as any);
          for (const u of unk.features) repaired.push({ ...u, properties: f.properties || {} });
          continue;
        } catch {}
      }
      repaired.push(g);
    }
    return repaired.length === 1 ? repaired[0] : turf.featureCollection(repaired);
  } catch {
    return input;
  }
}

/** true si la géométrie présente des auto-intersections. */
export function hasSelfIntersection(geojson: any): boolean {
  try { return turf.kinks(geojson as any).features.length > 0; } catch { return false; }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. GÉOTRAITEMENT
// ─────────────────────────────────────────────────────────────────────────────

const asPolyFeature = (g: any): any => {
  const f = g.type === 'FeatureCollection'
    ? (g.features.length > 1 ? dissolveAll(g.features) : g.features[0])
    : g;
  return repairGeometry(f);
};

/** Fusionne (dissolve géométrique) une liste de features polygonales en un seul (Multi)Polygon. */
export function dissolveAll(features: any[]): any {
  const polys = features.filter(
    (f) => f?.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'),
  );
  if (polys.length === 0) return null;
  let acc = repairGeometry(polys[0]);
  if (acc.type === 'FeatureCollection') acc = acc.features[0];
  for (let i = 1; i < polys.length; i++) {
    try {
      let next = repairGeometry(polys[i]);
      if (next.type === 'FeatureCollection') next = next.features[0];
      const u = turf.union(turf.featureCollection([acc, next]));
      if (u) acc = u;
    } catch {}
  }
  return acc;
}

/** ERASE / Différence : partie de A qui n'est PAS dans B (ex. surface HORS domaine forestier). */
export function difference(a: any, b: any): any | null {
  try {
    return turf.difference(turf.featureCollection([asPolyFeature(a), asPolyFeature(b)]));
  } catch { return null; }
}

/** CLIP : partie de A à l'intérieur de B (intersection géométrique). */
export function clip(a: any, b: any): any | null {
  try {
    return turf.intersect(turf.featureCollection([asPolyFeature(a), asPolyFeature(b)]));
  } catch { return null; }
}

/** Différence symétrique : A∪B moins A∩B. */
export function symmetricDifference(a: any, b: any): any | null {
  try {
    const fa = asPolyFeature(a), fb = asPolyFeature(b);
    const u = turf.union(turf.featureCollection([fa, fb]));
    const i = turf.intersect(turf.featureCollection([fa, fb]));
    if (!u) return null;
    if (!i) return u;
    return turf.difference(turf.featureCollection([u, i]));
  } catch { return null; }
}

export function unionAll(a: any, b: any): any | null {
  try { return turf.union(turf.featureCollection([asPolyFeature(a), asPolyFeature(b)])); }
  catch { return null; }
}

/**
 * Découpe un polygone par une ligne. turf n'a pas de split surfacique natif :
 * approche pragmatique par tampon fin (epsilon) puis flatten des morceaux.
 * `epsilonM` = largeur de la coupe en mètres (défaut 0.5 m).
 */
export function splitPolygonByLine(polygon: any, line: any, epsilonM = 0.5): any | null {
  try {
    const poly = asPolyFeature(polygon);
    const cut = turf.buffer(line, epsilonM / 1000, { units: 'kilometers' });
    if (!cut) return null;
    const diff = turf.difference(turf.featureCollection([poly, cut]));
    if (!diff) return null;
    return turf.flatten(diff);
  } catch { return null; }
}

/** Tampon multi-anneaux : retourne une FC avec un anneau par distance (chaque anneau = la couronne). */
export function multiRingBuffer(geom: any, distancesM: number[]): any {
  const sorted = [...distancesM].sort((x, y) => x - y);
  const rings: any[] = [];
  let inner: any = null;
  for (const d of sorted) {
    const b = turf.buffer(geom, d / 1000, { units: 'kilometers' });
    if (!b) continue;
    let ring = b;
    if (inner) {
      const diff = turf.difference(turf.featureCollection([b, inner]));
      if (diff) ring = diff;
    }
    ring.properties = { ...(ring.properties || {}), ring_m: d };
    rings.push(ring);
    inner = b;
  }
  return turf.featureCollection(rings);
}

export const envelopeOf = (g: any) => turf.envelope(g);
export const convexHullOf = (g: any) => turf.convex(g.type === 'FeatureCollection' ? g : turf.featureCollection([g]));
export const centroidOf = (g: any) => turf.centroid(g);
export const pointOnSurfaceOf = (g: any) => turf.pointOnFeature(g);

/** Diagramme de Voronoï à partir d'une couche de points (utile pour zones d'influence). */
export function voronoiOf(pointsFC: any): any | null {
  try {
    const bbox = turf.bbox(pointsFC);
    return turf.voronoi(pointsFC, { bbox });
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SPATIAL JOIN & PROXIMITÉ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Jointure spatiale : pour la géométrie cible, trouve le polygone source qui la
 * contient (ou avec le plus grand recouvrement) et copie les attributs demandés.
 * Remplace le detectProvinceFromGeojson ad hoc par une fonction générique.
 */
export function spatialJoin(
  target: any, sourceFeatures: any[], propsToCopy: string[],
): Record<string, any> | null {
  try {
    const tFeat = target.type === 'FeatureCollection' ? target.features[0] : target;
    const c = turf.centroid(tFeat);
    // 1) test point-dans-polygone
    for (const s of sourceFeatures) {
      if (!s?.geometry) continue;
      if ((s.geometry.type === 'Polygon' || s.geometry.type === 'MultiPolygon')) {
        try { if (turf.booleanPointInPolygon(c, s)) return pick(s.properties, propsToCopy); } catch {}
      }
    }
    // 2) sinon, plus grand recouvrement
    let best: { props: any; area: number } | null = null;
    for (const s of sourceFeatures) {
      if (!s?.geometry) continue;
      try {
        const inter = turf.intersect(turf.featureCollection([asPolyFeature(tFeat), asPolyFeature(s)]));
        if (inter) {
          const a = turf.area(inter);
          if (!best || a > best.area) best = { props: s.properties, area: a };
        }
      } catch {}
    }
    return best ? pick(best.props, propsToCopy) : null;
  } catch { return null; }
}
const pick = (obj: any, keys: string[]) =>
  keys.reduce((o, k) => { if (obj && obj[k] != null) o[k] = obj[k]; return o; }, {} as Record<string, any>);

/** Distance la plus courte (mètres) entre un point et le bord d'un polygone. Négatif si à l'intérieur. */
export function distanceToBoundary(point: any, polygon: any): number {
  try {
    const pt = point.type === 'Feature' ? point : turf.feature(point);
    const lines = turf.polygonToLine(asPolyFeature(polygon));
    // polygonToLine peut renvoyer LineString ou MultiLineString → on aplatit
    const flat = turf.flatten(lines as any);
    let min = Infinity;
    for (const ln of flat.features) {
      const d = turf.pointToLineDistance(pt, ln as any, { units: 'meters' });
      if (d < min) min = d;
    }
    const inside = turf.booleanPointInPolygon(pt, asPolyFeature(polygon));
    return inside ? -min : min;
  } catch { return NaN; }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. COGO / TRAVERSE (bornage)
// ─────────────────────────────────────────────────────────────────────────────

/** Construit un polygone WGS84 à partir d'une liste de bornes en Lambert Nord (x,y). */
export function polygonFromLambertBornes(bornes: XY[]): any | null {
  if (bornes.length < 3) return null;
  const ring = bornes.map((b) => {
    const { lat, lng } = fromLambertNord(b.x, b.y);
    return [lng, lat];
  });
  ring.push([...ring[0]]); // fermeture
  try { return turf.polygon([ring]); } catch { return null; }
}

/**
 * Traverse par gisement+distance (cheminement) en Lambert.
 * start = première borne (Lambert) ; legs = suite de {bearingDeg, distM}.
 * bearingDeg = gisement (0 = Nord, sens horaire). Retourne polygone WGS84 + bornes.
 */
export function traverseBearingDistance(
  start: XY, legs: { bearingDeg: number; distM: number }[],
): { polygon: any | null; bornes: XY[] } {
  const bornes: XY[] = [{ ...start }];
  let cur = { ...start };
  for (const leg of legs) {
    const rad = (leg.bearingDeg * Math.PI) / 180;
    cur = { x: cur.x + leg.distM * Math.sin(rad), y: cur.y + leg.distM * Math.cos(rad) };
    bornes.push({ ...cur });
  }
  return { polygon: polygonFromLambertBornes(bornes), bornes };
}

/** Extrait le tableau des bornes (numérotées) en Lambert depuis un polygone WGS84. */
export function extractBornesLambert(geojson: any, max = 200): Array<{ num: number; x: string; y: string }> {
  const out: Array<{ num: number; x: string; y: string }> = [];
  try {
    const feat = geojson.type === 'FeatureCollection' ? geojson.features[0] : geojson;
    let coords: number[][] = [];
    const g = feat.geometry;
    if (g.type === 'Polygon') coords = g.coordinates[0];
    else if (g.type === 'MultiPolygon') coords = g.coordinates[0][0];
    else if (g.type === 'LineString') coords = g.coordinates;
    coords.slice(0, max).forEach(([lng, lat], i) => {
      const { x, y } = toLambertNord(lat, lng);
      out.push({ num: i + 1, x: x.toFixed(2), y: y.toFixed(2) });
    });
  } catch {}
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. CHEVAUCHEMENT v2 (dissolve forêt + pré-filtre bbox + réparation)
// ─────────────────────────────────────────────────────────────────────────────

export interface ChevHitV2 {
  foret: string; canton: string;
  intersectionArea: number; percentage: number;
  position: 'داخل' | 'جزئيا' | 'خارج';
  properties: Record<string, any>;
}
export interface ChevResultV2 {
  layerName: string;
  importedArea: number;
  insideArea: number;   // surface DANS le domaine
  outsideArea: number;  // surface HORS domaine (via difference) — neuf
  totalPercentage: number;
  globalPosition: 'داخل الملك الغابوي' | 'جزئيا داخل الملك الغابوي' | 'خارج الملك الغابوي';
  hits: ChevHitV2[];
  outsideGeoJSON: any | null;
  insideGeoJSON: any | null;
}

/** Intersection de bboxes — pré-filtre O(1) avant le coûteux turf.intersect. */
function bboxOverlap(a: number[], b: number[]): boolean {
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
}

/**
 * Analyse de chevauchement robuste :
 *  - répare la parcelle importée
 *  - DISSOUT les polygones forêt avant calcul du % global (anti double-comptage)
 *  - pré-filtre par bbox (perf sur gros jeux)
 *  - calcule surface intérieure ET extérieure (difference) au domaine
 */
export function runChevauchementV2(importedGeojson: any, forestGeojson: any, layerName: string): ChevResultV2 {
  const imported = asPolyFeature(importedGeojson);
  const importedArea = turf.area(imported);
  const impBbox = turf.bbox(imported);

  const forestFeats = (forestGeojson?.features || []).filter(
    (f: any) => f?.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'),
  );

  // hits par parcelle forestière (pré-filtre bbox)
  const hits: ChevHitV2[] = [];
  const candidates: any[] = [];
  for (const feat of forestFeats) {
    let fb: number[];
    try { fb = turf.bbox(feat); } catch { continue; }
    if (!bboxOverlap(impBbox, fb)) continue;
    candidates.push(feat);
    try {
      const inter = turf.intersect(turf.featureCollection([imported, repairGeometry(feat)]));
      if (!inter) continue;
      const ia = turf.area(inter);
      if (ia < 1) continue;
      const pct = (ia / importedArea) * 100;
      hits.push({
        foret: feat.properties?.FORET || feat.properties?.foret || '',
        canton: feat.properties?.CANTON || feat.properties?.canton || '',
        intersectionArea: ia,
        percentage: pct,
        position: pct >= 95 ? 'داخل' : pct >= 1 ? 'جزئيا' : 'خارج',
        properties: feat.properties || {},
      });
    } catch {}
  }
  hits.sort((a, b) => b.intersectionArea - a.intersectionArea);

  // % global SANS double-comptage : on dissout les candidats puis on intersecte une fois
  let insideArea = 0, insideGeoJSON: any = null, outsideGeoJSON: any = null;
  try {
    const forestDissolved = candidates.length ? dissolveAll(candidates) : null;
    if (forestDissolved) {
      insideGeoJSON = turf.intersect(turf.featureCollection([imported, forestDissolved]));
      insideArea = insideGeoJSON ? turf.area(insideGeoJSON) : 0;
      outsideGeoJSON = turf.difference(turf.featureCollection([imported, forestDissolved]));
    } else {
      outsideGeoJSON = imported;
    }
  } catch {}

  const outsideArea = Math.max(0, importedArea - insideArea);
  const totalPercentage = importedArea > 0 ? Math.min(100, (insideArea / importedArea) * 100) : 0;
  const globalPosition =
    totalPercentage >= 95 ? 'داخل الملك الغابوي'
      : totalPercentage >= 1 ? 'جزئيا داخل الملك الغابوي'
      : 'خارج الملك الغابوي';

  return {
    layerName, importedArea, insideArea, outsideArea, totalPercentage,
    globalPosition, hits, outsideGeoJSON, insideGeoJSON,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. EXPORT (KML, GPX) — lisibles par QGIS et appareils GPS, sans dépendance neuve
// ─────────────────────────────────────────────────────────────────────────────

const esc = (s: any) => String(s ?? '').replace(/[<>&'"]/g, (c) =>
  ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));

export function toKML(geojson: any, name = 'couche'): string {
  const feats = geojson.type === 'FeatureCollection' ? geojson.features : [geojson];
  const placemarks = feats.map((f: any) => {
    const g = f.geometry; if (!g) return '';
    const props = Object.entries(f.properties || {})
      .map(([k, v]) => `<Data name="${esc(k)}"><value>${esc(v)}</value></Data>`).join('');
    const ext = props ? `<ExtendedData>${props}</ExtendedData>` : '';
    let geom = '';
    if (g.type === 'Point') geom = `<Point><coordinates>${g.coordinates[0]},${g.coordinates[1]}</coordinates></Point>`;
    else if (g.type === 'LineString') geom = `<LineString><coordinates>${g.coordinates.map((c: number[]) => c.join(',')).join(' ')}</coordinates></LineString>`;
    else if (g.type === 'Polygon') geom = `<Polygon><outerBoundaryIs><LinearRing><coordinates>${g.coordinates[0].map((c: number[]) => c.join(',')).join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
    else if (g.type === 'MultiPolygon') geom = `<MultiGeometry>${g.coordinates.map((poly: number[][][]) => `<Polygon><outerBoundaryIs><LinearRing><coordinates>${poly[0].map((c) => c.join(',')).join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon>`).join('')}</MultiGeometry>`;
    return `<Placemark><name>${esc(f.properties?.name || name)}</name>${ext}${geom}</Placemark>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(name)}</name>${placemarks}</Document></kml>`;
}

/** GPX : exporte points en waypoints et lignes/polygones en tracks. */
export function toGPX(geojson: any, name = 'couche'): string {
  const feats = geojson.type === 'FeatureCollection' ? geojson.features : [geojson];
  const wpts: string[] = [], trks: string[] = [];
  for (const f of feats) {
    const g = f.geometry; if (!g) continue;
    if (g.type === 'Point') {
      wpts.push(`<wpt lat="${g.coordinates[1]}" lon="${g.coordinates[0]}"><name>${esc(f.properties?.name || 'pt')}</name></wpt>`);
    } else {
      const rings = g.type === 'Polygon' ? [g.coordinates[0]]
        : g.type === 'MultiPolygon' ? g.coordinates.map((p: number[][][]) => p[0])
        : g.type === 'LineString' ? [g.coordinates] : [];
      for (const ring of rings) {
        const pts = ring.map((c: number[]) => `<trkpt lat="${c[1]}" lon="${c[0]}"></trkpt>`).join('');
        trks.push(`<trk><name>${esc(name)}</name><trkseg>${pts}</trkseg></trk>`);
      }
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="ForestGIS" xmlns="http://www.topografix.com/GPX/1/1">${wpts.join('')}${trks.join('')}</gpx>`;
}

/** Helper navigateur : télécharge une chaîne en fichier. */
export function downloadText(content: string, filename: string, mime = 'application/octet-stream') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. COMPOSEUR D'IMPRESSION — géométrie → SVG À L'ÉCHELLE (1:N) + nord + barre
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanOptions {
  scaleDenominator: number;   // ex. 2000 pour 1:2000
  paperWidthMm?: number;      // défaut A4 paysage 297
  paperHeightMm?: number;     // défaut A4 paysage 210
  marginMm?: number;          // défaut 12
  dpi?: number;               // défaut 96
  title?: string;
  showBornes?: boolean;       // numéroter les sommets
  forestGeojson?: any;        // fond (domaine forestier) optionnel
}

/**
 * Produit un SVG d'un plan à échelle EXACTE en projetant la géométrie en Lambert
 * (mètres) puis en mappant mètres → millimètres papier selon scaleDenominator.
 * 1:2000 ⇒ 1 mm papier = 2000 mm terrain = 2 m. C'est ce qui rend un plan
 * légalement « à l'échelle » contrairement à un screenshot.
 */
export function buildScaledPlanSVG(parcelGeojson: any, opts: PlanOptions): string {
  const {
    scaleDenominator, paperWidthMm = 297, paperHeightMm = 210,
    marginMm = 12, dpi = 96, title = 'Plan parcellaire', showBornes = true, forestGeojson,
  } = opts;

  const mmToPx = (mm: number) => (mm * dpi) / 25.4;
  const Wpx = mmToPx(paperWidthMm), Hpx = mmToPx(paperHeightMm), Mpx = mmToPx(marginMm);

  // mètres terrain → mm papier : mm = mètres * 1000 / N
  const mToMmPaper = (meters: number) => (meters * 1000) / scaleDenominator;

  // projeter la parcelle en Lambert (mètres)
  const toLamRing = (ring: number[][]) => ring.map(([lng, lat]) => {
    const { x, y } = toLambertNord(lat, lng); return [x, y];
  });
  const parcel = parcelGeojson.type === 'FeatureCollection' ? parcelGeojson.features[0] : parcelGeojson;
  const g = parcel.geometry;
  let lamRings: number[][][] = [];
  if (g.type === 'Polygon') lamRings = g.coordinates.map(toLamRing);
  else if (g.type === 'MultiPolygon') lamRings = g.coordinates.flatMap((p: number[][][]) => p.map(toLamRing));
  if (lamRings.length === 0) return '<svg/>';

  const xs = lamRings.flat().map((c) => c[0]);
  const ys = lamRings.flat().map((c) => c[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;

  // centre de la zone de dessin (sous le titre)
  const drawTop = Mpx + mmToPx(14);
  const drawW = Wpx - 2 * Mpx, drawH = Hpx - drawTop - mmToPx(18);
  const originPx = { x: Mpx + drawW / 2, y: drawTop + drawH / 2 };

  // terrain (m, relatif au centre) → px papier
  const proj = (X: number, Y: number) => ({
    x: originPx.x + mmToPx(mToMmPaper(X - cx)),
    y: originPx.y - mmToPx(mToMmPaper(Y - cy)), // Y inversé (écran)
  });

  const ringToPath = (ring: number[][]) =>
    ring.map((c, i) => `${i === 0 ? 'M' : 'L'} ${proj(c[0], c[1]).x.toFixed(1)} ${proj(c[0], c[1]).y.toFixed(1)}`).join(' ') + ' Z';

  // fond forêt (clippé à la zone)
  let forestPaths = '';
  if (forestGeojson?.features) {
    for (const f of forestGeojson.features) {
      const fg = f.geometry; if (!fg) continue;
      const rings = fg.type === 'Polygon' ? fg.coordinates.map(toLamRing)
        : fg.type === 'MultiPolygon' ? fg.coordinates.flatMap((p: number[][][]) => p.map(toLamRing)) : [];
      for (const r of rings) forestPaths += `<path d="${ringToPath(r)}" fill="#16a34a22" stroke="#16a34a" stroke-width="1"/>`;
    }
  }

  const parcelPaths = lamRings.map((r) => `<path d="${ringToPath(r)}" fill="#eab30833" stroke="#b45309" stroke-width="2"/>`).join('');

  // bornes numérotées
  let borneMarks = '';
  if (showBornes) {
    const ring0 = lamRings[0];
    ring0.slice(0, ring0.length - 1).forEach((c, i) => {
      const p = proj(c[0], c[1]);
      borneMarks += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="#b45309"/>` +
        `<text x="${(p.x + 5).toFixed(1)}" y="${(p.y - 4).toFixed(1)}" font-size="9" fill="#7c2d12" font-family="sans-serif">B${i + 1}</text>`;
    });
  }

  // barre d'échelle : longueur ronde en mètres → px
  const targetMm = 50; // ~5 cm sur le papier
  const meterForBar = (targetMm * scaleDenominator) / 1000;
  const niceMeters = niceRound(meterForBar);
  const barPx = mmToPx(mToMmPaper(niceMeters));
  const barX = Mpx + mmToPx(4), barY = Hpx - Mpx - mmToPx(4);

  // flèche du nord (Lambert ≈ nord grille)
  const northX = Wpx - Mpx - mmToPx(10), northY = drawTop + mmToPx(4);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Wpx.toFixed(0)}" height="${Hpx.toFixed(0)}" viewBox="0 0 ${Wpx.toFixed(0)} ${Hpx.toFixed(0)}" style="background:#fff">
  <rect x="${(Mpx/2).toFixed(0)}" y="${(Mpx/2).toFixed(0)}" width="${(Wpx-Mpx).toFixed(0)}" height="${(Hpx-Mpx).toFixed(0)}" fill="none" stroke="#111" stroke-width="1.5"/>
  <text x="${(Wpx/2).toFixed(0)}" y="${(Mpx+mmToPx(6)).toFixed(0)}" text-anchor="middle" font-size="16" font-weight="bold" font-family="sans-serif">${esc(title)}</text>
  <text x="${(Wpx/2).toFixed(0)}" y="${(Mpx+mmToPx(11)).toFixed(0)}" text-anchor="middle" font-size="10" fill="#444" font-family="sans-serif">Échelle 1:${scaleDenominator}  ·  Projection Lambert Nord Maroc (EPSG:26191)</text>
  ${forestPaths}${parcelPaths}${borneMarks}
  <g transform="translate(${northX.toFixed(0)},${northY.toFixed(0)})">
    <polygon points="0,18 5,4 0,8 -5,4" fill="#111"/><text x="0" y="0" text-anchor="middle" font-size="11" font-weight="bold" font-family="sans-serif">N</text>
  </g>
  <g font-family="sans-serif">
    <line x1="${barX.toFixed(0)}" y1="${barY.toFixed(0)}" x2="${(barX+barPx).toFixed(0)}" y2="${barY.toFixed(0)}" stroke="#111" stroke-width="2"/>
    <line x1="${barX.toFixed(0)}" y1="${(barY-4).toFixed(0)}" x2="${barX.toFixed(0)}" y2="${(barY+4).toFixed(0)}" stroke="#111" stroke-width="2"/>
    <line x1="${(barX+barPx).toFixed(0)}" y1="${(barY-4).toFixed(0)}" x2="${(barX+barPx).toFixed(0)}" y2="${(barY+4).toFixed(0)}" stroke="#111" stroke-width="2"/>
    <text x="${(barX+barPx/2).toFixed(0)}" y="${(barY-7).toFixed(0)}" text-anchor="middle" font-size="9">${niceMeters} m</text>
  </g>
</svg>`;
}
function niceRound(v: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const nice = n >= 5 ? 5 : n >= 2 ? 2 : 1;
  return nice * pow;
}

/** Ouvre le plan SVG dans une fenêtre d'impression (→ PDF via « Imprimer » du navigateur). */
export function printPlan(svg: string, title = 'Plan') {
  const w = window.open('', '_blank', 'width=1100,height=800');
  if (!w) return;
  w.document.write(`<html><head><title>${esc(title)}</title><style>@page{size:A4 landscape;margin:0}body{margin:0}</style></head><body>${svg}</body></html>`);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 400);
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. REGISTRE D'OUTILS — pour câbler l'UI du Géotraitement sans dupliquer la logique
// ─────────────────────────────────────────────────────────────────────────────

export interface ToolDef {
  id: string; label: string; group: string;
  needsSecondLayer?: boolean; needsDistance?: boolean;
}
export const GEOPROCESSING_TOOLS: ToolDef[] = [
  { id: 'calculate_geometry', label: 'Calculer la géométrie', group: 'Attributs' },
  { id: 'export_kml',         label: 'Exporter KML (QGIS)',   group: 'Export' },
  { id: 'export_gpx',         label: 'Exporter GPX (GPS)',    group: 'Export' },
  { id: 'check_geometry',     label: 'Vérifier la géométrie', group: 'Attributs' },
  { id: 'repair',             label: 'Réparer la géométrie',  group: 'Attributs' },
  { id: 'buffer',             label: 'Zone tampon',           group: 'Topologie', needsDistance: true },
  { id: 'multibuffer',        label: 'Tampon multi-anneaux',  group: 'Topologie', needsDistance: true },
  { id: 'intersect',          label: 'Intersection (Clip)',   group: 'Topologie', needsSecondLayer: true },
  { id: 'union',              label: 'Union',                 group: 'Topologie', needsSecondLayer: true },
  { id: 'difference',         label: 'Différence (Erase)',    group: 'Topologie', needsSecondLayer: true },
  { id: 'symdiff',            label: 'Différence symétrique', group: 'Topologie', needsSecondLayer: true },
  { id: 'split',              label: 'Découper par ligne',    group: 'Topologie', needsSecondLayer: true },
  { id: 'dissolve',           label: 'Fusionner (Dissolve)',  group: 'Topologie' },
  { id: 'convex',             label: 'Enveloppe convexe',     group: 'Géométrie' },
  { id: 'envelope',           label: 'Boîte englobante',      group: 'Géométrie' },
  { id: 'centroid',           label: 'Centroïde',             group: 'Géométrie' },
  { id: 'voronoi',            label: 'Voronoï (points)',      group: 'Géométrie' },
  { id: 'distance_boundary',  label: 'Distance au bord forêt',group: 'Proximité', needsSecondLayer: true },
];

// ─────────────────────────────────────────────────────────────────────────────
// 10. EXPORT SHAPEFILE (.zip = .shp + .shx + .dbf + .prj)
//     Un shapefile ne contient qu'UN type de géométrie → shp-write sépare
//     automatiquement points/lignes/polygones en fichiers distincts dans le zip.
//     Les noms de champs DBF sont tronqués à 10 caractères (norme shapefile).
// ─────────────────────────────────────────────────────────────────────────────

const PRJ_WGS84 =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.0174532925199433]]';
const PRJ_LAMBERT_NORD =
  'PROJCS["Merchich_Nord_Maroc",GEOGCS["GCS_Merchich",DATUM["D_Merchich",SPHEROID["Clarke_1880_IGN",6378249.2,293.4660212936265]],PRIMEM["Greenwich",0],UNIT["Degree",0.0174532925199433]],PROJECTION["Lambert_Conformal_Conic_1SP"],PARAMETER["latitude_of_origin",33.3],PARAMETER["central_meridian",-5.4],PARAMETER["scale_factor",0.999625769],PARAMETER["false_easting",500000],PARAMETER["false_northing",300000],UNIT["Meter",1]]';

/** Télécharge un Blob (zip shapefile, etc.). */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Aplatit les propriétés (le DBF n'accepte que texte/nombre/booléen). */
function flattenForDbf(geojson: any): any {
  const feats = geojson.type === 'FeatureCollection' ? geojson.features
    : geojson.type === 'Feature' ? [geojson] : [turf.feature(geojson)];
  const clean = feats.filter((f: any) => f?.geometry).map((f: any) => {
    const props: Record<string, any> = {};
    for (const [k, v] of Object.entries(f.properties || {})) {
      props[k] = v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : v);
    }
    return { type: 'Feature', properties: props, geometry: f.geometry };
  });
  return { type: 'FeatureCollection', features: clean };
}

/**
 * Exporte un GeoJSON en archive Shapefile (.zip), utilisable directement dans
 * QGIS / ArcGIS. `lambert: true` reprojette en Lambert Nord Maroc (EPSG:26191)
 * avec le .prj correspondant (utile pour les échanges cadastraux ANCFCC).
 */
export async function exportShapefile(geojson: any, name = 'couche', opts: { lambert?: boolean } = {}) {
  let fc = flattenForDbf(geojson);
  if (opts.lambert) fc = reprojectGeoJSON(fc, EPSG.WGS84, EPSG.LAMBERT_NORD);
  const safe = (name || 'couche').replace(/[^\w\u0600-\u06FF-]+/g, '_');
  const blob = (await shpwrite.zip(fc as any, {
    outputType: 'blob',
    compression: 'DEFLATE',
    prj: opts.lambert ? PRJ_LAMBERT_NORD : PRJ_WGS84,
    types: { point: `${safe}_points`, polygon: `${safe}_polygones`, polyline: `${safe}_lignes` },
  } as any)) as Blob;
  downloadBlob(blob, `${safe}_shp${opts.lambert ? '_lambert' : ''}.zip`);
}
