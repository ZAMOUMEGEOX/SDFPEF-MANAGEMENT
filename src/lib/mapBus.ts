// ════════════════════════════════════════════════════════════════════════════
// mapBus.ts — Bus d'événements TYPÉ (remplace les window.CustomEvent "stringly")
//
// Pourquoi : aujourd'hui la navigation inter-vues et les contrôles carte passent
// par des chaînes magiques ('anef:open-map', 'zoomIn', 'parcel:delivered'…),
// non typées, dispatchables par n'importe quel script. Ce bus :
//   • centralise les noms d'événements et leurs payloads (autocomplétion + types)
//   • RESTE compatible : il redispatche aussi le window.CustomEvent correspondant,
//     donc vos listeners actuels continuent de marcher pendant la migration.
//   • migration incrémentale : remplacez les addEventListener un par un par bus.on.
// ════════════════════════════════════════════════════════════════════════════

/** Carte des événements → type de payload. Étendre ici au lieu de chaînes libres. */
export interface MapEventMap {
  // navigation inter-vues (ancien anef:open-map / anef:return-from-map)
  'open-map': void;
  'return-from-map': void;
  // contrôles carte
  'zoom-in': void;
  'zoom-out': void;
  'locate-user': void;
  'center-extent': void;
  'fly-to-bounds': { bounds: [[number, number], [number, number]] };
  'map-search': { lat: string; lon: string; display_name?: string; boundingbox?: string[]; _bounds?: any };
  'map-search-string': { query: string };
  // sélection de parcelle pour un dossier contentieux
  'parcel:pick-requested': void;
  'parcel:pick-cancelled': void;
  'parcel:delivered': { geojson: any; centroidLat: number; centroidLng: number; [k: string]: any };
}

/** Correspondance vers les anciens noms window pour la rétro-compatibilité. */
const LEGACY_NAME: Partial<Record<keyof MapEventMap, string>> = {
  'open-map': 'anef:open-map',
  'return-from-map': 'anef:return-from-map',
  'zoom-in': 'zoomIn',
  'zoom-out': 'zoomOut',
  'locate-user': 'locateUser',
  'center-extent': 'mapCenterExtent',
  'fly-to-bounds': 'flyToBounds',
  'map-search': 'mapSearch',
  'map-search-string': 'mapSearchString',
  'parcel:pick-requested': 'parcel:pick-requested',
  'parcel:pick-cancelled': 'parcel:pick-cancelled',
  'parcel:delivered': 'parcel:delivered',
};

type Handler<K extends keyof MapEventMap> = (payload: MapEventMap[K]) => void;

class MapBus {
  private handlers = new Map<keyof MapEventMap, Set<Function>>();

  /** Abonnement typé. Retourne une fonction de désabonnement. */
  on<K extends keyof MapEventMap>(event: K, fn: Handler<K>): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(fn);
    // pont : écoute aussi l'ancien window event (payload dans e.detail)
    const legacy = LEGACY_NAME[event];
    let winFn: ((e: Event) => void) | null = null;
    if (legacy && typeof window !== 'undefined') {
      winFn = (e: Event) => fn((e as CustomEvent).detail as MapEventMap[K]);
      window.addEventListener(legacy, winFn);
    }
    return () => {
      this.handlers.get(event)?.delete(fn);
      if (legacy && winFn && typeof window !== 'undefined') window.removeEventListener(legacy, winFn);
    };
  }

  /** Émission typée. Redispatche aussi l'ancien window.CustomEvent (compat). */
  emit<K extends keyof MapEventMap>(event: K, payload?: MapEventMap[K]): void {
    this.handlers.get(event)?.forEach((fn) => {
      try { (fn as Handler<K>)(payload as MapEventMap[K]); } catch (e) { console.error('[mapBus]', event, e); }
    });
    const legacy = LEGACY_NAME[event];
    if (legacy && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(legacy, { detail: payload }));
    }
  }
}

export const mapBus = new MapBus();

// Exemple d'usage :
//   useEffect(() => mapBus.on('locate-user', () => map.locate()), [map]);
//   <button onClick={() => mapBus.emit('zoom-in')} />
//   mapBus.emit('parcel:delivered', { geojson, centroidLat, centroidLng });
