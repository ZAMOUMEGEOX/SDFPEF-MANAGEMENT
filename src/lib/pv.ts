// src/lib/pv.ts
import { supabase } from '@/lib/supabase'

export interface InfractionRecord {
  id: string
  created_at: string
  numero_pv: string
  numero_pv_ordre: number | null
  numero_carnet: string | null
  brigade_code: string | null
  date_redaction: string | null
  heure_constat: string | null
  agent_1_nom: string | null
  agent_1_grade: string | null
  agent_1_residence: string | null
  agent_2_nom: string | null
  agent_2_grade: string | null
  agent_2_residence: string | null
  agent_3_nom: string | null
  agent_3_grade: string | null
  agent_3_residence: string | null
  foret_nom: string | null
  foret_nom_ar: string | null
  foret_section: string | null
  decret_num: string | null
  decret_date: string | null
  lieu_dit: string | null
  commune: string | null
  qiada: string | null
  imaala: string | null
  province: string | null
  coordonnees_lat: number | null
  coordonnees_lng: number | null
  coord_x: number | null
  coord_y: number | null
  infraction_types: string[]
  infraction_details: string | Record<string, string> | null
  infraction_free: string | null
  surface_hectares: number | null
  surface_ares: number | null
  surface_centiares: number | null
  degats: Array<{ type: string; quantite: string; equivalent: string }> | null
  contrevenant_nom: string | null
  contrevenant_prenom: string | null
  contrevenant_nasab: string | null
  contrevenant_mere: string | null
  contrevenant_ddn: string | null
  contrevenant_lieu_naiss: string | null
  contrevenant_situation: string | null
  contrevenant_profession: string | null
  contrevenant_cin: string | null
  contrevenant_adresse: string | null
  contrevenant_hors_maroc: boolean | null
  description_juridique: string | null
  statut: string | null
  transmis_parquet: boolean | null
  date_transmission_parquet: string | null
  photos_urls: string[] | null
}

export interface InfractionFilters {
  statut?: string
  foret_nom?: string
  commune?: string
  date_from?: string
  date_to?: string
  limit?: number
}

export interface InfractionKPIs {
  total: number
  mois: number
  parquet: number
  surface: number
}

export async function loadInfractions(
  filters: InfractionFilters = {}
): Promise<{ data: InfractionRecord[]; error: string | null; kpis: InfractionKPIs }> {
  try {
    let q = supabase
      .from('infractions')
      .select('*')
      .order('created_at', { ascending: false })

    if (filters.statut && filters.statut !== 'all') q = q.eq('statut', filters.statut)
    if (filters.foret_nom) q = q.eq('foret_nom', filters.foret_nom)
    if (filters.commune) q = q.eq('commune', filters.commune)
    if (filters.date_from) q = q.gte('date_redaction', filters.date_from)
    if (filters.date_to) q = q.lte('date_redaction', filters.date_to)
    if (filters.limit) q = q.limit(filters.limit)

    const { data, error } = await q
    if (error) return { data: [], error: error.message, kpis: emptyKPIs() }

    const rows = (data || []) as InfractionRecord[]
    return { data: rows, error: null, kpis: computeKPIs(rows) }
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : String(e), kpis: emptyKPIs() }
  }
}

export async function getInfraction(id: string): Promise<{ data: InfractionRecord | null; error: string | null }> {
  try {
    const { data, error } = await supabase.from('infractions').select('*').eq('id', id).single()
    if (error) return { data: null, error: error.message }
    return { data: data as InfractionRecord, error: null }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function updateInfractionStatut(
  id: string,
  statut: 'nouveau' | 'en_cours' | 'transmis_parquet' | 'cloture'
): Promise<{ success: boolean; error: string | null }> {
  try {
    const payload: Record<string, unknown> = { statut }
    if (statut === 'transmis_parquet') {
      payload.transmis_parquet = true
      payload.date_transmission_parquet = new Date().toISOString().split('T')[0]
    }
    const { error } = await supabase.from('infractions').update(payload).eq('id', id)
    if (error) return { success: false, error: error.message }
    return { success: true, error: null }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function deleteInfraction(id: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase.from('infractions').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
    return { success: true, error: null }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export function formatPVNumber(inf: Pick<InfractionRecord, 'numero_pv' | 'numero_pv_ordre' | 'numero_carnet' | 'brigade_code'>): string {
  if (inf.numero_pv) return inf.numero_pv
  if (inf.numero_pv_ordre != null && inf.numero_carnet) {
    return `${inf.numero_pv_ordre}/${inf.numero_carnet}/${inf.brigade_code || 'BM'}`
  }
  return '—'
}

/** Convertit une valeur (string|number|null) en nombre sûr, 0 par défaut. */
export function toNum(v: unknown): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export function computeKPIs(data: InfractionRecord[]): InfractionKPIs {
  const now = new Date()
  return {
    total: data.length,
    surface: data.reduce(
      (s, r) => s + toNum(r.surface_hectares) + toNum(r.surface_ares) / 100 + toNum(r.surface_centiares) / 10000,
      0
    ),
    parquet: data.filter(r => r.transmis_parquet || r.statut === 'transmis_parquet').length,
    mois: data.filter(r => {
      const d = new Date(r.date_redaction || r.created_at)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    }).length,
  }
}

function emptyKPIs(): InfractionKPIs {
  return { total: 0, surface: 0, parquet: 0, mois: 0 }
}