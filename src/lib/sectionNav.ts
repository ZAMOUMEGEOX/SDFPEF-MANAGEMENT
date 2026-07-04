// src/lib/sectionNav.ts
// ════════════════════════════════════════════════════════════════════════════
// sectionNav.ts — Pont de navigation inter-sections indépendant du shell.
//   Le module « police forestiere » est désormais AUTONOME : il capte lui-même
//   'anef:open-police' (voir PoliceForestiere) et rouvre le PV. Ce fichier
//   n'est nécessaire QUE si le shell veut aussi basculer l'onglet actif visible.
//   Une seule ligne à ajouter dans le shell (facultatif) :
//     import { onOpenSection } from '@/lib/sectionNav'
//     useEffect(() => onOpenSection('police', () => setActiveSection('police')), [])
// ════════════════════════════════════════════════════════════════════════════

export type SectionKey = 'police' | 'contentieux' | 'domaine' | string

const EVENT_MAP: Record<string, string> = {
  police: 'anef:open-police',
  contentieux: 'anef:return-from-map',
  domaine: 'anef:open-map',
}

/** Émet la demande d'ouverture d'une section (utilisable partout). */
export function openSection(section: SectionKey): void {
  const evt = EVENT_MAP[section] || `anef:open-${section}`
  window.dispatchEvent(new CustomEvent(evt))
}

/** Abonne le shell à l'ouverture d'une section. Retourne un cleanup. */
export function onOpenSection(section: SectionKey, handler: () => void): () => void {
  const evt = EVENT_MAP[section] || `anef:open-${section}`
  const h = () => handler()
  window.addEventListener(evt, h)
  return () => window.removeEventListener(evt, h)
}
