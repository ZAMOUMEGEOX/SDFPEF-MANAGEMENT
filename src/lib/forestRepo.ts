// ════════════════════════════════════════════════════════════════════════════
// forestRepo.ts — Accès données Domaine Forestier via Supabase (schéma `domaine`)
//
// S'appuie sur les RPC de 0001_forest_gis_postgis.sql.
// ⚠️ Aligner l'import ci-dessous sur VOTRE export réel dans src/lib/supabase.ts
//    (souvent `export const supabase = createClient(...)`).
//
// NOUVEAU (v2 — ربط حقيقي مع قسم المنازعات):
//   • saveParcelForTarget(): يسجّل القطعة ويربطها بملف/محضر قضائي عبر props.
//   • parcelsByCase()/parcelsByPV(): جلب القطع المرتبطة بملف/محضر.
//   • أعلام الربط تُخزَّن داخل props: linked_case_id / linked_pv_id / case_ref.
//     لا يتطلب تغيير المخطّط (props jsonb موجود أصلاً).
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from './supabase';

export interface ParcelRecord {
  id: string;
  name: string;
  source: 'drawn' | 'imported' | 'cogo' | 'search' | string;
  province: string | null;
  props: Record<string, any>;
  geojson: any;            // géométrie GeoJSON (depuis ST_AsGeoJSON)
  updated_at: string;
}

export interface OverlapServerResult {
  total_area: number;      // m²
  inside_area: number;     // m² (dédupliqué)
  outside_area: number;    // m²
  total_percentage: number;
  hits: Array<{ foret: string; canton: string; intersection_area: number; percentage: number }>;
}

/** Extrait la géométrie d'un Feature/FeatureCollection/Geometry pour l'envoyer au serveur. */
function toGeometry(geojson: any): any {
  if (!geojson) return null;
  if (geojson.type === 'FeatureCollection') {
    const f = geojson.features.find((x: any) => x?.geometry) || geojson.features[0];
    return f?.geometry ?? null;
  }
  if (geojson.type === 'Feature') return geojson.geometry;
  return geojson; // déjà une geometry
}

/**
 * Analyse de chevauchement CÔTÉ SERVEUR (PostGIS indexé).
 * Remplace runChevauchementAnalysis/turf pour les gros jeux : O(log n) via GIST.
 */
export async function analyzeOverlapServer(geojson: any): Promise<OverlapServerResult | null> {
  const geom = toGeometry(geojson);
  if (!geom) return null;
  const { data, error } = await supabase
    .schema('domaine')
    .rpc('analyze_overlap', { geom_geojson: geom });
  if (error) { console.error('[forestRepo] analyze_overlap', error); return null; }
  return data as OverlapServerResult;
}

/** Enregistre (insert/update) une parcelle. Retourne son id. Le versionnage est automatique (trigger). */
export async function saveParcel(input: {
  id?: string | null; name: string; source?: string;
  props?: Record<string, any>; geojson: any; province?: string | null;
}): Promise<string | null> {
  const geom = toGeometry(input.geojson);
  if (!geom) return null;
  const { data, error } = await supabase.schema('domaine').rpc('upsert_parcel', {
    p_id: input.id ?? null,
    p_name: input.name,
    p_source: input.source ?? 'drawn',
    p_props: input.props ?? {},
    p_geom: geom,
    p_province: input.province ?? null,
  });
  if (error) { console.error('[forestRepo] upsert_parcel', error); return null; }
  return data as string;
}

/** Liste toutes les parcelles de l'utilisateur (RLS) en GeoJSON. */
export async function listParcels(): Promise<ParcelRecord[]> {
  const { data, error } = await supabase.schema('domaine').rpc('list_parcels');
  if (error) { console.error('[forestRepo] list_parcels', error); return []; }
  return (data ?? []) as ParcelRecord[];
}

/** Supprime une parcelle (l'audit conserve une version DELETE). */
export async function deleteParcel(id: string): Promise<boolean> {
  const { error } = await supabase.schema('domaine').from('parcels').delete().eq('id', id);
  if (error) { console.error('[forestRepo] delete', error); return false; }
  return true;
}

/**
 * Charge le domaine forestier en FeatureCollection, optionnellement clippé à la
 * bbox visible [minLng, minLat, maxLng, maxLat] → ne transfère que l'écran courant.
 */
export async function loadForest(bbox?: [number, number, number, number]): Promise<any> {
  const { data, error } = await supabase
    .schema('domaine')
    .rpc('list_forest', { bbox: bbox ?? null });
  if (error) { console.error('[forestRepo] list_forest', error); return { type: 'FeatureCollection', features: [] }; }
  return data;
}

/** Historique des versions d'une parcelle (défense juridique : qui a changé quoi, quand). */
export async function parcelHistory(parcelId: string): Promise<Array<{
  version: number; op: string; changed_at: string; changed_by: string | null;
}>> {
  const { data, error } = await supabase
    .schema('domaine')
    .from('parcel_versions')
    .select('version, op, changed_at, changed_by')
    .eq('parcel_id', parcelId)
    .order('version', { ascending: false });
  if (error) { console.error('[forestRepo] history', error); return []; }
  return (data ?? []) as any;
}

/** Met en cache un résultat de chevauchement (optionnel). */
export async function cacheOverlap(parcelId: string, r: OverlapServerResult): Promise<void> {
  await supabase.schema('domaine').from('overlap_analyses').insert({
    parcel_id: parcelId,
    total_area: r.total_area, inside_area: r.inside_area, outside_area: r.outside_area,
    total_percentage: r.total_percentage, hits: r.hits,
  });
}

// ════════════════════════════════════════════════════════════════════════════
// ── RÉEL : liaison parcelle ⇄ dossier/PV contentieux ────────────────────────
//   On stocke les clés de liaison dans props (jsonb) sans toucher au schéma.
//   id déterministe : "CTX-CASE-<caseId>" / "CTX-PV-<pvId>" ⇒ upsert idempotent
//   (re-dessiner la même parcelle d'un dossier MET À JOUR au lieu de dupliquer).
// ════════════════════════════════════════════════════════════════════════════

export interface ParcelLinkTarget {
  kind: 'case' | 'pv';
  id: string;            // id du dossier (contentieux_cases) ou du PV (pv_records)
  ref?: string;          // mahakimId / linkedFileNumber / pvCourtRef (affichage)
}

/**
 * Enregistre la parcelle ET la lie à un dossier/PV contentieux.
 * Retourne l'id de la parcelle (déterministe) pour traçabilité.
 */
export async function saveParcelForTarget(input: {
  target: ParcelLinkTarget;
  name?: string;
  source?: string;
  geojson: any;
  province?: string | null;
  overlap?: any;          // résultat de chevauchement (calculé côté carte ou serveur)
  area_m2?: number;
  extraProps?: Record<string, any>;
}): Promise<string | null> {
  const { target } = input;
  const parcelId = target.kind === 'case' ? `CTX-CASE-${target.id}` : `CTX-PV-${target.id}`;
  const props: Record<string, any> = {
    ...(input.extraProps || {}),
    linked_case_id: target.kind === 'case' ? target.id : undefined,
    linked_pv_id:   target.kind === 'pv'   ? target.id : undefined,
    case_ref: target.ref || undefined,
    overlap: input.overlap ?? undefined,
    area_m2: input.area_m2 ?? undefined,
    linked_at: new Date().toISOString(),
  };
  return saveParcel({
    id: parcelId,
    name: input.name || `قطعة الملف ${target.ref || target.id}`,
    source: input.source || 'drawn',
    props,
    geojson: input.geojson,
    province: input.province ?? null,
  });
}

/** Récupère la (les) parcelle(s) liée(s) à un dossier contentieux. */
export async function parcelsByCase(caseId: string): Promise<ParcelRecord[]> {
  const all = await listParcels();
  return all.filter(p => p?.props?.linked_case_id === caseId || p.id === `CTX-CASE-${caseId}`);
}

/** Récupère la (les) parcelle(s) liée(s) à un PV. */
export async function parcelsByPV(pvId: string): Promise<ParcelRecord[]> {
  const all = await listParcels();
  return all.filter(p => p?.props?.linked_pv_id === pvId || p.id === `CTX-PV-${pvId}`);
}

/** Toutes les parcelles RATTACHÉES à un dossier/PV (pour affichage en couche dédiée). */
export async function listLinkedParcels(): Promise<ParcelRecord[]> {
  const all = await listParcels();
  return all.filter(p => p?.props?.linked_case_id || p?.props?.linked_pv_id);
}