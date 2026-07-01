// src/lib/pvParcelBridge.ts
// ════════════════════════════════════════════════════════════════════════════
// pvParcelBridge.ts — Pont spatial entre Police Forestière et le module Domaine
// Forestier (carte). Il PARLE EXACTEMENT le même protocole que le contentieux :
//   • sessionStorage 'anef_parcel_target'  = cible du rattachement { kind, id, ref }
//   • sessionStorage 'anef_parcel_pending' = parcelle livrée (secours si démonté)
//   • sessionStorage 'anef_show_parcel'    = demande d'affichage d'une parcelle
//   • events: 'parcel:pick-requested' / 'parcel:delivered' / 'anef:open-map'
//
// La géométrie est capturée à la volée (parcel:delivered fournit toujours le
// payload) ; l'écriture dans domaine.parcels est DIFFÉRÉE jusqu'à ce que le PV
// possède un id réel (savePVParcel), pour éviter un enregistrement sous un id
// brouillon. C'est pourquoi requestParcelPickForPV pose un target SANS id
// (id vide) : DomaineForestier saute alors sa propre écriture (garde `if target?.id`).
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

/** Demande à la carte d'entrer en mode « sélection de parcelle » pour un PV.
 *  ref = libellé affiché sur la carte (ex. n° PV). id volontairement vide :
 *  l'écriture domaine.parcels se fera plus tard, une fois le PV enregistré. */
export function requestParcelPickForPV(ref: string): void {
  const target = { kind: 'pv' as const, id: '', ref }
  try {
    sessionStorage.setItem('anef_parcel_target', JSON.stringify(target))
    ;(window as any).__anefParcelPicking = true
  } catch {}
  window.dispatchEvent(new CustomEvent('parcel:pick-requested'))
  window.dispatchEvent(new CustomEvent('anef:open-map'))
}

/** Annule une sélection en cours. */
export function cancelParcelPick(): void {
  try {
    ;(window as any).__anefParcelPicking = false
    sessionStorage.removeItem('anef_parcel_target')
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

/** Affiche une parcelle déjà enregistrée sur la carte (rouge) — ex. depuis un PV sauvegardé. */
export function showPVParcelOnMap(geojson: any, ref: string): void {
  try {
    sessionStorage.setItem('anef_show_parcel', JSON.stringify({ geojson, ref, openFiche: false }))
  } catch {}
  window.dispatchEvent(new CustomEvent('anef:open-map'))
}

/** Persiste la parcelle capturée dans domaine.parcels, liée au PV enregistré (kind='pv'). */
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

/** Convertit l'anneau extérieur du polygone (WGS84) en table de points Lambert numérotés. */
export function extractCoordPoints(geojson: any): Array<{ num: number; x: string; y: string }> {
  try {
    const f = geojson?.type === 'FeatureCollection' ? geojson.features?.[0] : geojson
    const geom = f?.type === 'Feature' ? f.geometry : f
    let ring: number[][] | null = null
    if (geom?.type === 'Polygon') ring = geom.coordinates?.[0] || null
    else if (geom?.type === 'MultiPolygon') ring = geom.coordinates?.[0]?.[0] || null
    if (!ring || ring.length < 3) return []

    const pts = ring.slice()
    // retire le sommet de fermeture dupliqué s'il existe
    if (pts.length > 1) {
      const a = pts[0]
      const b = pts[pts.length - 1]
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

/** Décompose une surface en m² vers hectares / ares / centiares (chaînes). */
export function areaToHaAreCa(areaM2: number): { ha: string; are: string; ca: string } {
  const a = Math.max(0, areaM2 || 0)
  const ha = Math.floor(a / 10000)
  const are = Math.floor((a % 10000) / 100)
  const ca = Math.round(a % 100)
  return { ha: String(ha), are: String(are).padStart(2, '0'), ca: String(ca).padStart(2, '0') }
}
