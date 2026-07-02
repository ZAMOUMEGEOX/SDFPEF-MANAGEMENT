// src/lib/pvParcelBridge.ts
// ════════════════════════════════════════════════════════════════════════════
// pvParcelBridge.ts — Pont spatial entre Police Forestière et le module Domaine
// Forestier (carte). Même protocole que le contentieux :
//   • sessionStorage 'anef_parcel_target'  = cible { kind, id, ref }
//   • sessionStorage 'anef_parcel_pending' = parcelle livrée (secours si démonté)
//   • sessionStorage 'anef_show_parcel'    = demande d'affichage d'une parcelle
//   • events: 'parcel:pick-requested' / 'parcel:delivered' / 'anef:open-map'
//
// Capture MULTI-ENTITÉS + drapeau de RETOUR :
//   'anef_pv_feature_target' → à quelle entité est destinée la livraison
//   'anef_return_to_pv'      → posé au départ vers la carte ; consommé par
//     PoliceForestiere au montage pour ROUVRIR automatiquement le brouillon.
//   ⚠ La navigation automatique carte→Police après « إرفاق » se règle dans
//     DomaineForestier.tsx (condition target.kind === 'pv') — fichier à fournir.
// ════════════════════════════════════════════════════════════════════════════
import proj4 from 'proj4'
import { saveParcelForTarget } from '@/lib/forestRepo'

// EPSG:26191 — Merchich / Nord Maroc (Lambert). Enregistrement idempotent.
if (typeof (proj4 as any).defs === 'function' && !(proj4 as any).defs('EPSG:26191')) {
  ;(proj4 as any).defs(
    'EPSG:26191',
    '+proj=lcc +lat_1=33.3 +lat_0=33.3 +lon_0=-5.4 +k_0=0.999625769 +x_0=500000 +y_0=300000 +a=6378249.2 +b=6356515 +towgs84=31,146,47,0,0,0,0 +units=m +no_defs'
  )
}

// ── Type du payload livré par la carte (identique à DomaineForestier) ─────────
export interface DeliveredParcel {
  geojson: any
  centroidLat: number
  centroidLng: number
  lambertX: number
  lambertY: number
  areaM2: number
  perimeterKm: number
  province?: string | null
  overlap?: {
    globalPosition: string
    totalPercentage: number
    totalIntersectionArea: number
    hits: Array<{
      foret: string
      foretAr: string
      canton: string
      intersectionArea: number
      percentage: number
      position: string
    }>
  } | null
  parcelId?: string
  capturedAt?: string
}

const FEATURE_TARGET_KEY = 'anef_pv_feature_target'
const RETURN_KEY = 'anef_return_to_pv'

/** WGS84 → Lambert Nord Maroc (pour le clic manuel sur la mini-carte). */
export function wgs84ToLambert(lat: number, lng: number): { x: number; y: number } {
  const [x, y] = proj4('EPSG:4326', 'EPSG:26191', [lng, lat]) as [number, number]
  return { x, y }
}

/** Demande à la carte le dessin de la PARCELLE GLOBALE du PV.
 *  id volontairement vide : l'écriture domaine.parcels se fera après save. */
export function requestParcelPickForPV(ref: string): void {
  try {
    sessionStorage.removeItem(FEATURE_TARGET_KEY) // livraison destinée à la parcelle globale
    sessionStorage.setItem(RETURN_KEY, '1')       // au retour → rouvrir le brouillon PV
    sessionStorage.setItem('anef_parcel_target', JSON.stringify({ kind: 'pv' as const, id: '', ref }))
    ;(window as any).__anefParcelPicking = true
  } catch {}
  window.dispatchEvent(new CustomEvent('parcel:pick-requested'))
  window.dispatchEvent(new CustomEvent('anef:open-map'))
}

/** Demande à la carte le dessin de la géométrie d'UNE ENTITÉ (infraction). */
export function requestParcelPickForFeature(ref: string, featureId: string, featureLabel: string): void {
  try {
    sessionStorage.setItem(FEATURE_TARGET_KEY, featureId)
    sessionStorage.setItem(RETURN_KEY, '1')
    sessionStorage.setItem('anef_parcel_target', JSON.stringify({ kind: 'pv' as const, id: '', ref: `${ref} — ${featureLabel}` }))
    ;(window as any).__anefParcelPicking = true
  } catch {}
  window.dispatchEvent(new CustomEvent('parcel:pick-requested'))
  window.dispatchEvent(new CustomEvent('anef:open-map'))
}

/** Consomme le drapeau « retour vers le PV » (posé au départ vers la carte). */
export function consumeReturnToPV(): boolean {
  try {
    const v = sessionStorage.getItem(RETURN_KEY)
    if (v) sessionStorage.removeItem(RETURN_KEY)
    return !!v
  } catch { return false }
}

/** Une livraison de parcelle attend-elle d'être consommée ? (sans consommer) */
export function hasPendingParcel(): boolean {
  try { return sessionStorage.getItem('anef_parcel_pending') != null } catch { return false }
}

/** À qui est destinée la livraison en attente ? null = parcelle globale. */
export function peekFeatureTarget(): string | null {
  try { return sessionStorage.getItem(FEATURE_TARGET_KEY) } catch { return null }
}

/** Consomme la cible d'entité après livraison. */
export function consumeFeatureTarget(): string | null {
  try {
    const v = sessionStorage.getItem(FEATURE_TARGET_KEY)
    sessionStorage.removeItem(FEATURE_TARGET_KEY)
    return v
  } catch { return null }
}

/** Annule une sélection en cours. */
export function cancelParcelPick(): void {
  try {
    ;(window as any).__anefParcelPicking = false
    sessionStorage.removeItem('anef_parcel_target')
    sessionStorage.removeItem(FEATURE_TARGET_KEY)
    sessionStorage.removeItem(RETURN_KEY)
  } catch {}
  window.dispatchEvent(new CustomEvent('parcel:pick-cancelled'))
}

/** Abonnement à la livraison d'une parcelle. Retourne une fonction de nettoyage. */
export function onParcelDelivered(cb: (loc: DeliveredParcel) => void): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail as DeliveredParcel
    if (detail && detail.geojson) cb(detail)
  }
  window.addEventListener('parcel:delivered', handler)
  return () => window.removeEventListener('parcel:delivered', handler)
}

/** Récupère une parcelle laissée en attente (livraison survenue hors montage). */
export function consumePendingParcel(): DeliveredParcel | null {
  try {
    const raw = sessionStorage.getItem('anef_parcel_pending')
    if (!raw) return null
    sessionStorage.removeItem('anef_parcel_pending')
    return JSON.parse(raw) as DeliveredParcel
  } catch {
    return null
  }
}

/** Affiche une parcelle déjà enregistrée sur la carte (rouge). */
export function showPVParcelOnMap(geojson: any, ref: string): void {
  try {
    sessionStorage.setItem('anef_show_parcel', JSON.stringify({ geojson, ref, openFiche: false }))
  } catch {}
  window.dispatchEvent(new CustomEvent('anef:open-map'))
}

/** Persiste la parcelle capturée dans domaine.parcels, liée au PV (kind='pv'). */
export async function savePVParcel(pvId: string, ref: string, loc: DeliveredParcel): Promise<string | null> {
  if (!pvId || !loc?.geojson) return null
  try {
    const parcelId = await saveParcelForTarget({
      target: { kind: 'pv', id: pvId, ref },
      name: `قطعة المحضر ${ref}`,
      source: 'drawn',
      geojson: loc.geojson,
      province: loc.province || null,
      overlap: loc.overlap || null,
      area_m2: loc.areaM2 || 0,
    })
    return parcelId || null
  } catch (e) {
    console.warn('[pvParcelBridge] savePVParcel', e)
    return null
  }
}

/** Anneau extérieur (WGS84) → table de points Lambert numérotés. */
export function extractCoordPoints(geojson: any): Array<{ num: number; x: string; y: string }> {
  try {
    const f = geojson?.type === 'FeatureCollection' ? geojson.features?.[0] : geojson
    const geom = f?.type === 'Feature' ? f.geometry : f
    let ring: number[][] | null = null
    if (geom?.type === 'Polygon') ring = geom.coordinates?.[0] || null
    else if (geom?.type === 'MultiPolygon') ring = geom.coordinates?.[0]?.[0] || null
    else if (geom?.type === 'Point') {
      const [x, y] = proj4('EPSG:4326', 'EPSG:26191', [geom.coordinates[0], geom.coordinates[1]]) as [number, number]
      return [{ num: 1, x: x.toFixed(1), y: y.toFixed(1) }]
    }
    if (!ring || ring.length < 3) return []

    const pts = ring.slice()
    if (pts.length > 1) {
      const a = pts[0], b = pts[pts.length - 1]
      if (a[0] === b[0] && a[1] === b[1]) pts.pop()
    }
    return pts.map((c, i) => {
      const [x, y] = proj4('EPSG:4326', 'EPSG:26191', [c[0], c[1]]) as [number, number]
      return { num: i + 1, x: x.toFixed(1), y: y.toFixed(1) }
    })
  } catch {
    return []
  }
}

/** m² → hectares / ares / centiares (chaînes). */
export function areaToHaAreCa(areaM2: number): { ha: string; are: string; ca: string } {
  const a = Math.max(0, areaM2 || 0)
  const ha = Math.floor(a / 10000)
  const are = Math.floor((a % 10000) / 100)
  const ca = Math.round(a % 100)
  return { ha: String(ha), are: String(are).padStart(2, '0'), ca: String(ca).padStart(2, '0') }
}