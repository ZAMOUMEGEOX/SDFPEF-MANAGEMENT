import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Shield, Search, FilePlus2, ChevronLeft, Check, FileCode2, Map, Scale, FileText, Gavel, MapPin, Crosshair, Layers, Pencil, Trash2, Download, SlidersHorizontal, X, ArrowUpDown, CheckSquare, Square, Printer, Eye, Plus, Wand2, Stamp, UserX, ListPlus } from 'lucide-react';
import { MapContainer, TileLayer, Marker, GeoJSON, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { loadInfractions, updateInfractionStatut, updateInfraction, deleteInfraction, formatPVNumber, toNum, type InfractionRecord, type InfractionKPIs, type PVNarrativeJson } from '@/lib/pv';
import {
  FEATURE_PRESETS, LEGAL_SUGGESTIONS, DELIM_OPTIONS, INVESTIGATION_STEP_LABELS,
  HOUR_WORDS, HOUR_FRACTIONS, HOUR_PERIODS, AUTORITE_ROLES, ACCES_OPTIONS,
  LIEU_DIT_SUGGESTIONS, SEIZURE_SUGGESTIONS,
  INFRACTION_CATALOG, CATALOG_CATEGORIES, TRANSACTION_RULES_NOTE,
  TOP_INFRACTIONS_NORD, DAMAGE_KIND_LABELS, LOAD_UNITS, SPECIES_SUGGESTIONS,
  renderDamage, trucksFromM3,
  type QuickInfraction, type DamageDraft, type DamageKind,
  renderInvestigationStep, suggestLegalDescription, suggestLegalArticles, featureAreaText,
  type PVFeature, type PVSymbol, type InvestigationStep, type InvestigationStepType,
  type PVSeizure, type IdentityMode, type ConstatContextType, type DelimStatus, type PVComposeInput,
  type InfractionCatalogItem,
} from '@/lib/pvModel';
import { generatePVDocx, generatePVPdf, previewPVHtml, type PVRenderData } from '@/lib/pvDocx';
import { exportChevauchementDocx } from '@/lib/forestDocx';
import {
  requestParcelPickForPV, requestParcelPickForFeature, onParcelDelivered, consumePendingParcel,
  consumeFeatureTarget, consumeReturnToPV, hasPendingParcel, savePVParcel, extractCoordPoints,
  areaToHaAreCa, showPVParcelOnMap, wgs84ToLambert, lambertToWgs84,
  type DeliveredParcel, type PVContextFeature,
} from '@/lib/pvParcelBridge';

const customIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

// ══════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════
const AGENTS_LIST = [
  { nom: 'الزاموم أحمد',   grade: 'تقني متخصص للمياه والغابات', residence: 'بريستنكا' },
  { nom: 'تجريبات موسى',  grade: 'تقني للمياه والغابات',         residence: 'كدية الطيفور' },
  { nom: 'طوال محمد',     grade: 'تقني للمياه والغابات',         residence: 'المضيق' },
  { nom: 'مجاهيد مهدي',  grade: 'تقني للمياه والغابات',         residence: 'المضيق' },
  { nom: 'المعتمد يوسف', grade: 'تقني للمياه والغابات',         residence: 'الفنيدق' },
]

const COMMUNES_LIST = [
  'ملاليين','عليين','المضيق','الفنيدق','مرتيل',
  'دار بن قريش','أزلا','أولاد ميمون','أنجرة',
  'بني يدر','الزيتونة','تغرامت','القصر الصغير',
]

const FORETS_LIST = [
  'الغابة المخزنية الحوز',
  'غابة جبل درسة',
  'الغابة المخزنية الحلوفا',
  'غابة بابا علي',
  'الغابة المخزنية بليونش',
]

const IMAALA_LIST = ['عمالة المضيق-الفنيدق', 'إقليم تطوان', 'عمالة تطوان']

const SYMBOL_KINDS: Array<{ v: PVSymbol['kind']; l: string }> = [
  { v: 'solid', l: 'تعبئة ملونة' },
  { v: 'hatch', l: 'تظليل مائل' },
  { v: 'crosshatch', l: 'تظليل متقاطع' },
  { v: 'dots', l: 'نقاط' },
  { v: 'veg', l: 'غطاء نباتي' },
  { v: 'outline', l: 'حدود فقط' },
]

const uid = () =>
  (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
    ? (crypto as any).randomUUID()
    : `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`


// ══════════════════════════════════════════════════════
// FORÊTS & CANTONS depuis la couche forest_limits (public/assets/data)
// حقل foret بالفرنسية → ترجمة حرفية بالعربية (قاموس + ترجمة صوتية احتياطية)
// ══════════════════════════════════════════════════════
const FOREST_LIMITS_URLS = ['/assets/data/forest_limits.geojson', '/assets/data/forest_limits.json']

const FORET_AR_DICT: Record<string, string> = {
  'haouz': 'الحوز', 'el haouz': 'الحوز', 'azfa': 'عزفة', 'azla': 'أزلا',
  'mellalyen': 'الملاليين', 'melaliyen': 'الملاليين', 'mellaliyen': 'الملاليين', 'mellalien': 'الملاليين',
  'jbel dersa': 'جبل درسة', 'jbeldersa': 'جبل درسة', 'dersa': 'درسة',
  'belyounech': 'بليونش', 'beliounech': 'بليونش', 'bellyounech': 'بليونش', 'beliyounech': 'بليونش',
  'haloufa': 'الحلوفا', 'el haloufa': 'الحلوفا', 'halloufa': 'الحلوفا',
  'koudia taifour': 'كدية الطيفور', 'koudiat taifour': 'كدية الطيفور', 'koudiet taifour': 'كدية الطيفور',
  'beni hassan': 'بني حسان', 'beni idder': 'بني يدر', 'beni yder': 'بني يدر',
  'anjra': 'أنجرة', 'anjera': 'أنجرة', 'oued laou': 'واد لاو', 'oued lihoud': 'واد ليهود',
  'zinat': 'زينات', 'zaitoune': 'الزيتون', 'zaytoune': 'الزيتون', 'kalaa': 'القلعة',
  'ain lahsen': 'عين لحصن', 'ain lahcen': 'عين لحصن', 'souk lqolla': 'سوق القلة',
  'boujdad': 'بوجداد', 'khemis anjra': 'خميس أنجرة', 'taghramt': 'تغرامت', 'fahs': 'الفحص',
  'bab taza': 'باب تازة', 'talembote': 'تالمبوط', 'bouhachem': 'بوهاشم', 'tazia': 'التازية',
}

// ترجمة صوتية احتياطية لأي اسم غير موجود في القاموس (رقمنات أولا ثم أحرف)
const TRANSLIT_DIGRAPHS: Array<[RegExp, string]> = [
  [/ch/g, 'ش'], [/kh/g, 'خ'], [/gh/g, 'غ'], [/sh/g, 'ش'], [/th/g, 'ث'], [/dh/g, 'ذ'], [/ou/g, 'و'], [/aa/g, 'ا'], [/ee/g, 'ي'], [/oo/g, 'و'],
]
const TRANSLIT_CHARS: Record<string, string> = {
  a: 'ا', b: 'ب', c: 'ك', d: 'د', e: '', f: 'ف', g: 'گ', h: 'ه', i: 'ي', j: 'ج', k: 'ك', l: 'ل',
  m: 'م', n: 'ن', o: 'و', p: 'ب', q: 'ق', r: 'ر', s: 'س', t: 'ت', u: 'و', v: 'ف', w: 'و', x: 'كس', y: 'ي', z: 'ز',
}
function transliterate(fr: string): string {
  const key = (fr || '').trim().toLowerCase()
  if (!key) return ''
  if (FORET_AR_DICT[key]) return FORET_AR_DICT[key]
  return key.split(/\s+/).map(word => {
    if (FORET_AR_DICT[word]) return FORET_AR_DICT[word]
    let w = word
    TRANSLIT_DIGRAPHS.forEach(([re, ar]) => { w = w.replace(re, ar) })
    return w.split('').map(ch => TRANSLIT_CHARS[ch] ?? ch).join('')
  }).join(' ')
}

/** الاسم الرسمي داخل نص المحضر: « الغابة المخزنية X » أو « غابة جبل … ». */
function foretOfficialAr(ar: string): string {
  const core = ar.trim()
  if (!core) return ''
  return core.startsWith('جبل') ? `غابة ${core}` : `الغابة المخزنية ${core}`
}

interface ForestEntry { fr: string; ar: string; official: string; cantons: Array<{ fr: string; ar: string }> }
let FOREST_CACHE: ForestEntry[] | null = null

let FOREST_GJ_CACHE: any | null = null
export function getForestGeojson(): any | null { return FOREST_GJ_CACHE }

async function loadForestIndex(): Promise<ForestEntry[]> {
  if (FOREST_CACHE) return FOREST_CACHE
  for (const url of FOREST_LIMITS_URLS) {
    try {
      const res = await fetch(url, { cache: 'force-cache' })
      if (!res.ok) continue
      const gj = await res.json()
      const feats: any[] = gj?.features || []
      if (!feats.length) continue
      // كشف ضبابي لأسماء الحقول (foret/Foret/FORET/forest/nom_foret… وcanton بأي حالة أحرف)
      const sample = feats.find(f => f?.properties && Object.keys(f.properties).length)?.properties || {}
      const keys = Object.keys(sample)
      const fKey = keys.find(k => /for(e|ê)?t|forest/i.test(k)) || keys.find(k => /^nom/i.test(k)) || 'foret'
      const cKey = keys.find(k => /canton|secteur|section/i.test(k)) || 'canton'
      const map = new Map<string, Set<string>>()
      for (const f of feats) {
        const props = f?.properties || {}
        const foret = String(props[fKey] ?? props.foret ?? props.Foret ?? props.FORET ?? '').trim()
        const canton = String(props[cKey] ?? props.canton ?? props.Canton ?? props.CANTON ?? '').trim()
        if (!foret) continue
        if (!map.has(foret)) map.set(foret, new Set())
        if (canton) map.get(foret)!.add(canton)
      }
      if (!map.size) continue
      FOREST_GJ_CACHE = gj
      FOREST_CACHE = [...map.entries()]
        .map(([fr, cs]) => {
          const ar = transliterate(fr)
          return {
            fr, ar, official: foretOfficialAr(ar),
            cantons: [...cs].sort().map(cfr => ({ fr: cfr, ar: transliterate(cfr) })),
          }
        })
        .sort((a, b) => a.fr.localeCompare(b.fr))
      return FOREST_CACHE
    } catch { /* essayer l'URL suivante */ }
  }
  FOREST_CACHE = []
  return FOREST_CACHE
}

// ══════════════════════════════════════════════════════
// TYPES DU FORMULAIRE
// ══════════════════════════════════════════════════════
interface AgentData { nom: string; grade: string; residence: string }

interface PVFormData {
  // Étape 1 — n° + dates (constat ≠ rédaction)
  pvNum: string; pvYear: string; brigade: string
  indicatif: string; serie: string
  dateConstat: string; heureText: string
  dateRedaction: string; redactionLieu: string
  // Étape 2 — agents
  nbAgents: number; activeAgent: number
  agent1: AgentData; agent2: AgentData; agent3: AgentData
  agentsGradeGroup: string
  // Étape 3 — localisation
  foret: string; canton: string
  delimStatus: DelimStatus; delimCustom: string
  decreeNum: string; decreeDate: string
  placeName: string; commune: string; province: string
  coordX: string; coordY: string
  // Étape 4 — circonstances du constat
  accompanimentEnabled: boolean; accompaniment: string
  contextType: ConstatContextType; contextNum: string; contextDate: string; contextText: string
  // Étape 5 — entités / infractions + surface globale
  ha: string; are: string; ca: string; areaOverride: string
  features: PVFeature[]
  // Étape 6 — dégâts
  degats: DamageDraft[]
  // Étape 7 — enquête + saisie + identité
  investigationSteps: InvestigationStep[]
  seizureEnabled: boolean
  seizure: PVSeizure
  identityMode: IdentityMode
  firstName: string; lastName: string; filiation: string; motherName: string
  birthPlace: string; cin: string; dob: string; profession: string
  maritalStatus: string; address: string; outsideMaroc: boolean; enfants: string
  // Étape 8 — finalisation
  legalDescription: string
  tribunal: string; direction: string
  includeOverlapLine: boolean
  // Parcelle globale (carte Domaine Forestier)
  parcelGeojson: any | null
  parcelAreaM2: number
  parcelCoordPoints: Array<{ num: number; x: string; y: string }>
  parcelOverlap: DeliveredParcel['overlap'] | null
  parcelProvince: string | null
}

const EMPTY_SEIZURE: PVSeizure = { items: [{ label: '', qty: '' }], depotText: '', certificateNum: '', registreNum: '' }

const EMPTY_FORM: PVFormData = {
  pvNum: '', pvYear: '', brigade: 'BM',
  indicatif: '8 58', serie: 'السلسلة 8 رقم 2',
  dateConstat: new Date().toISOString().split('T')[0], heureText: '',
  dateRedaction: new Date().toISOString().split('T')[0], redactionLieu: 'المضيق',
  nbAgents: 1, activeAgent: 1,
  agent1: { nom: '', grade: 'تقني متخصص للمياه والغابات', residence: '' },
  agent2: { nom: '', grade: 'تقني للمياه والغابات', residence: '' },
  agent3: { nom: '', grade: 'تقني للمياه والغابات', residence: '' },
  agentsGradeGroup: 'تقنيون للمياه والغابات',
  foret: '', canton: '',
  delimStatus: 'en_cours', delimCustom: '',
  decreeNum: '02.84.321', decreeDate: '1984-10-09',
  placeName: '', commune: '', province: 'عمالة المضيق-الفنيدق',
  coordX: '', coordY: '',
  accompanimentEnabled: false, accompaniment: 'رئيس مركز حماية الغابات للمضيق الفنيدق',
  contextType: 'ratissage', contextNum: '', contextDate: '', contextText: '',
  ha: '0', are: '0', ca: '0', areaOverride: '',
  features: [],
  degats: [],
  investigationSteps: [],
  seizureEnabled: false,
  seizure: EMPTY_SEIZURE,
  identityMode: 'complete',
  firstName: '', lastName: '', filiation: '', motherName: '',
  birthPlace: '', cin: '', dob: '', profession: '',
  maritalStatus: 'متزوج', address: '', outsideMaroc: false, enfants: '',
  legalDescription: '',
  tribunal: 'تطوان', direction: 'المديرية الإقليمية للوكالة الوطنية للمياه و الغابات لتطوان',
  includeOverlapLine: false,
  parcelGeojson: null, parcelAreaM2: 0, parcelCoordPoints: [], parcelOverlap: null, parcelProvince: null,
}

// ── Restauration intégrale d'un enregistrement (plus AUCUNE perte à l'édition) ──
function recordToForm(rec: InfractionRecord): PVFormData {
  const nb = Math.max(1, [rec.agent_1_nom, rec.agent_2_nom, rec.agent_3_nom].filter(Boolean).length);
  const n: PVNarrativeJson | null = rec.narrative || null;
  return {
    pvNum: rec.numero_pv_ordre != null ? String(rec.numero_pv_ordre) : '',
    pvYear: rec.numero_carnet || '',
    brigade: rec.brigade_code || 'BM',
    indicatif: n?.indicatif || '8 58',
    serie: n?.serie || 'السلسلة 8 رقم 2',
    dateConstat: rec.date_constat || rec.date_redaction || new Date().toISOString().split('T')[0],
    heureText: n?.heureText || rec.heure_constat || '',
    dateRedaction: rec.date_redaction || new Date().toISOString().split('T')[0],
    redactionLieu: rec.redaction_lieu || n?.redactionLieu || '',
    nbAgents: nb, activeAgent: 1,
    agent1: { nom: rec.agent_1_nom || '', grade: rec.agent_1_grade || 'تقني متخصص للمياه والغابات', residence: rec.agent_1_residence || '' },
    agent2: { nom: rec.agent_2_nom || '', grade: rec.agent_2_grade || 'تقني للمياه والغابات', residence: rec.agent_2_residence || '' },
    agent3: { nom: rec.agent_3_nom || '', grade: rec.agent_3_grade || 'تقني للمياه والغابات', residence: rec.agent_3_residence || '' },
    agentsGradeGroup: n?.agentsGradeGroup || 'تقنيون للمياه والغابات',
    foret: rec.foret_nom || '', canton: rec.foret_section || '',
    delimStatus: n?.delimStatus || 'en_cours', delimCustom: n?.delimCustom || '',
    decreeNum: rec.decret_num || '', decreeDate: rec.decret_date || '',
    placeName: rec.lieu_dit || '', commune: rec.commune || '', province: rec.imaala || rec.province || 'إقليم تطوان',
    coordX: rec.coord_x != null ? String(rec.coord_x) : '', coordY: rec.coord_y != null ? String(rec.coord_y) : '',
    accompanimentEnabled: !!n?.accompaniment, accompaniment: n?.accompaniment || 'رئيس مركز حماية الغابات للمضيق الفنيدق',
    contextType: n?.context?.type || 'ratissage',
    contextNum: n?.context?.num || '', contextDate: n?.context?.date || '', contextText: n?.context?.text || '',
    ha: String(toNum(rec.surface_hectares)), are: String(toNum(rec.surface_ares)), ca: String(toNum(rec.surface_centiares)),
    areaOverride: n?.areaOverride || '',
    features: rec.features || [],
    // السجلات القديمة {type,quantite,equivalent} → نص حر جاهز؛ الجديدة {text} كما هي
    degats: (rec.degats || []).map((g: any, i: number) => ({
      id: `dg_${i}`, kind: 'libre' as DamageKind,
      text: g?.text?.trim()
        ? g.text.trim()
        : [g?.quantite, g?.type && `من ${g.type}`, g?.equivalent && `أي ما يعادل حوالي ${g.equivalent}`].filter(Boolean).join(' '),
    })).filter(d => d.text),
    investigationSteps: n?.investigationSteps || [],
    seizureEnabled: !!(n?.seizure && n.seizure.items?.some(i => i.label)),
    seizure: n?.seizure || EMPTY_SEIZURE,
    identityMode: rec.identity_mode || n?.identityMode || 'complete',
    firstName: rec.contrevenant_prenom || '', lastName: rec.contrevenant_nom || '',
    filiation: rec.contrevenant_nasab || '', motherName: rec.contrevenant_mere || '',
    birthPlace: rec.contrevenant_lieu_naiss || '', cin: rec.contrevenant_cin || '',
    dob: rec.contrevenant_ddn || '', profession: rec.contrevenant_profession || '',
    maritalStatus: rec.contrevenant_situation || 'متزوج', address: rec.contrevenant_adresse || '',
    outsideMaroc: !!rec.contrevenant_hors_maroc, enfants: n?.identityEnfants || '',
    legalDescription: rec.description_juridique || '',
    tribunal: n?.tribunal || 'تطوان',
    direction: n?.direction || 'المديرية الإقليمية للوكالة الوطنية للمياه و الغابات لتطوان',
    includeOverlapLine: !!n?.includeOverlapLine,
    parcelGeojson: rec.parcel_geojson || null,
    parcelAreaM2: toNum(rec.parcel_area_m2),
    parcelCoordPoints: rec.parcel_geojson ? extractCoordPoints(rec.parcel_geojson) : [],
    parcelOverlap: rec.parcel_overlap || null,
    parcelProvince: null,
  };
}

// ══════════════════════════════════════════════════════
// BROUILLON PERSISTANT — survit à la navigation vers la carte du Domaine
// Forestier. Chaque frappe est sauvegardée ; au retour (drapeau posé par
// pvParcelBridge), le PV est ROUVERT automatiquement à la même étape.
// ══════════════════════════════════════════════════════
const PV_DRAFT_KEY = 'anef_pv_draft'
interface PVDraft { form: PVFormData; step: number; editId: string | null; statut: string | null }
function saveDraft(d: PVDraft) { try { sessionStorage.setItem(PV_DRAFT_KEY, JSON.stringify(d)) } catch {} }
function loadDraft(): PVDraft | null { try { const r = sessionStorage.getItem(PV_DRAFT_KEY); return r ? JSON.parse(r) as PVDraft : null } catch { return null } }
function clearDraft() { try { sessionStorage.removeItem(PV_DRAFT_KEY) } catch {} }
function hasDraft(): boolean { try { return sessionStorage.getItem(PV_DRAFT_KEY) != null } catch { return false } }

// ══════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════
export function PoliceForestiere() {
  const [showForm, setShowForm] = useState(false);
  const [resumeDraft, setResumeDraft] = useState(false);
  const [editRecord, setEditRecord] = useState<InfractionRecord | null>(null);
  const [draftAvailable, setDraftAvailable] = useState(false);
  const [pvData, setPvData] = useState<InfractionRecord[]>([]);
  const [kpis, setKpis] = useState<InfractionKPIs>({ total: 0, surface: 0, parquet: 0, mois: 0 });
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    setIsLoading(true);
    const { data, kpis: k } = await loadInfractions({ limit: 500 });
    setPvData(data);
    setKpis(k);
    setIsLoading(false);
  };

  // يفتح مسودة المحضر إن وُجد سبب للعودة (علم العودة / تسليم قطعة معلّق).
  const resumeIfNeeded = () => {
    if ((consumeReturnToPV() || hasPendingParcel()) && hasDraft()) {
      setEditRecord(null);
      setResumeDraft(true);
      setShowForm(true);
      return true;
    }
    return false;
  };

  useEffect(() => {
    fetchData();
    setDraftAvailable(hasDraft());
    // عند التركيب: عودة مباشرة من الخريطة.
    resumeIfNeeded();

    // مستمع حيّ: قسم الملك الغابوي يبثّ 'anef:open-police' بعد «إرفاق بالمحضر».
    // نلتقطه هنا داخل الوحدة نفسها فنفتح المحضر مباشرة عند المخالفة التالية،
    // دون الاعتماد على مستمع في ملف الهيكل (استقلال تام للوحدة).
    const onOpenPolice = () => { setTimeout(resumeIfNeeded, 0); };
    window.addEventListener('anef:open-police', onOpenPolice);
    // احتياط: إن رُكّب القسم بعد وصول الحدث، نلتقط العودة عند استعادة التبويب.
    const onVisible = () => { if (document.visibilityState === 'visible') resumeIfNeeded(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('anef:open-police', onOpenPolice);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openNew = () => { clearDraft(); setDraftAvailable(false); setEditRecord(null); setResumeDraft(false); setShowForm(true); };
  const openEdit = (rec: InfractionRecord) => { clearDraft(); setDraftAvailable(false); setEditRecord(rec); setResumeDraft(false); setShowForm(true); };
  const openDraft = () => { setEditRecord(null); setResumeDraft(true); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditRecord(null); setResumeDraft(false); setDraftAvailable(hasDraft()); };

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-serif italic text-emerald-900">Police Forestière & Répression</h1>
          <p className="text-xs md:text-sm text-stone-500 mt-1">Gestion des patrouilles, centres de conservation et saisie des procès-verbaux.</p>
        </div>
        {!showForm ? (
          <button onClick={openNew} className="flex items-center justify-center gap-2 px-4 py-3 md:py-2 w-full sm:w-auto bg-emerald-800 text-white rounded-xl text-xs uppercase tracking-widest font-bold hover:bg-emerald-900 transition-colors shadow-sm">
            <FilePlus2 className="size-4" />
            Nouveau Procès-Verbal
          </button>
        ) : (
          <button onClick={closeForm} className="flex items-center justify-center gap-2 px-4 py-3 md:py-2 w-full sm:w-auto bg-white border border-stone-200 text-stone-700 rounded-xl text-xs uppercase tracking-widest font-bold hover:bg-stone-50 transition-colors shadow-sm">
            <ChevronLeft className="size-4" />
            Retour au suivi
          </button>
        )}
      </div>

      {!showForm && draftAvailable && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl" dir="rtl">
          <span className="text-sm text-amber-800 font-bold">لديك مسودة محضر غير مكتملة محفوظة تلقائيا.</span>
          <div className="flex gap-2">
            <button onClick={openDraft} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 transition-colors">متابعة المسودة</button>
            <button onClick={() => { clearDraft(); setDraftAvailable(false); }} className="px-4 py-2 bg-white border border-amber-200 text-amber-700 rounded-lg text-xs font-bold hover:bg-amber-100 transition-colors">حذفها</button>
          </div>
        </div>
      )}

      {showForm
        ? <PVForm onClose={closeForm} onSaved={fetchData} initial={editRecord} resume={resumeDraft} />
        : <PVManagement pvData={pvData} kpis={kpis} isLoading={isLoading} onRefresh={fetchData} onEdit={openEdit} />
      }
    </div>
  );
}

// ══════════════════════════════════════════════════════
// PV MANAGEMENT (LIST)
// ══════════════════════════════════════════════════════
function PVManagement({ pvData, kpis, isLoading, onRefresh, onEdit }: {
  pvData: InfractionRecord[];
  kpis: InfractionKPIs;
  isLoading: boolean;
  onRefresh: () => void;
  onEdit: (rec: InfractionRecord) => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [fStatut, setFStatut] = useState('all');
  const [fForet, setFForet] = useState('all');
  const [fCommune, setFCommune] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'pv' | 'surface'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.type === 'police' && detail?.id) setSearchQuery(detail.id);
    };
    window.addEventListener('searchItemSelected', handler);
    return () => window.removeEventListener('searchItemSelected', handler);
  }, []);

  const foretOptions = useMemo(
    () => [...new Set(pvData.map(p => p.foret_nom).filter(Boolean) as string[])].sort(),
    [pvData]
  );
  const communeOptions = useMemo(
    () => [...new Set(pvData.map(p => p.commune).filter(Boolean) as string[])].sort(),
    [pvData]
  );

  const surfaceHa = (p: InfractionRecord) =>
    toNum(p.surface_hectares) + toNum(p.surface_ares) / 100 + toNum(p.surface_centiares) / 10000;

  const dateOf = (p: InfractionRecord) => p.date_constat || p.date_redaction || '';

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    let rows = pvData.filter(pv => {
      const matchSearch =
        !q ||
        formatPVNumber(pv).toLowerCase().includes(q) ||
        (pv.contrevenant_nom || '').toLowerCase().includes(q) ||
        (pv.contrevenant_prenom || '').toLowerCase().includes(q) ||
        (pv.foret_nom || '').toLowerCase().includes(q) ||
        (pv.commune || '').toLowerCase().includes(q) ||
        (pv.contrevenant_cin || '').toLowerCase().includes(q) ||
        (pv.lieu_dit || '').toLowerCase().includes(q);
      const matchStatut = fStatut === 'all' || (pv.statut || 'nouveau') === fStatut;
      const matchForet = fForet === 'all' || pv.foret_nom === fForet;
      const matchCommune = fCommune === 'all' || pv.commune === fCommune;
      const d = dateOf(pv);
      const matchFrom = !dateFrom || d >= dateFrom;
      const matchTo = !dateTo || d <= dateTo;
      return matchSearch && matchStatut && matchForet && matchCommune && matchFrom && matchTo;
    });
    rows = rows.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'date') cmp = (dateOf(a) || a.created_at).localeCompare(dateOf(b) || b.created_at);
      else if (sortBy === 'pv') cmp = formatPVNumber(a).localeCompare(formatPVNumber(b), undefined, { numeric: true });
      else cmp = surfaceHa(a) - surfaceHa(b);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pvData, searchQuery, fStatut, fForet, fCommune, dateFrom, dateTo, sortBy, sortDir]);

  const activeFilterCount =
    (fStatut !== 'all' ? 1 : 0) + (fForet !== 'all' ? 1 : 0) + (fCommune !== 'all' ? 1 : 0) +
    (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

  const resetFilters = () => {
    setFStatut('all'); setFForet('all'); setFCommune('all'); setDateFrom(''); setDateTo(''); setSearchQuery('');
  };

  const allVisibleSelected = filtered.length > 0 && filtered.every(p => selected.has(p.id));
  const toggleAll = () =>
    setSelected(prev => {
      if (allVisibleSelected) return new Set();
      return new Set(filtered.map(p => p.id));
    });
  const toggleOne = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const clearSelection = () => setSelected(new Set());
  const selectedRecords = filtered.filter(p => selected.has(p.id));

  const bulkTransmit = async () => {
    setBusy(true);
    for (const id of selected) await updateInfractionStatut(id, 'transmis_parquet');
    clearSelection(); setBusy(false); onRefresh();
  };
  const bulkDelete = async () => {
    if (!window.confirm(`حذف ${selected.size} محضراً نهائياً؟ لا يمكن التراجع.`)) return;
    setBusy(true);
    for (const id of selected) await deleteInfraction(id);
    clearSelection(); setBusy(false); onRefresh();
  };
  const bulkExport = async () => {
    setBusy(true);
    for (const pv of selectedRecords) { await generateDocxFromRecord(pv); await new Promise(r => setTimeout(r, 250)); }
    setBusy(false);
  };
  const exportCsv = () => exportListCSV(filtered);

  const removeOne = async (pv: InfractionRecord) => {
    if (!window.confirm(`حذف المحضر ${formatPVNumber(pv)} نهائياً؟`)) return;
    setBusy(true);
    await deleteInfraction(pv.id);
    setBusy(false); onRefresh();
  };

  const statusLabel = (s: string | null) => {
    switch(s) {
      case 'transmis_parquet': return { label: 'Transmis', cls: 'bg-emerald-100 text-emerald-800 border border-emerald-200' }
      case 'en_cours':         return { label: 'Enquête', cls: 'bg-orange-100 text-orange-800 border border-orange-200' }
      case 'cloture':          return { label: 'Clôturé', cls: 'bg-stone-100 text-stone-800 border border-stone-200' }
      default:                 return { label: 'Nouveau', cls: 'bg-blue-100 text-blue-800 border border-blue-200' }
    }
  }

  const STATUT_OPTIONS = [
    { v: 'all', l: 'كل الحالات' },
    { v: 'nouveau', l: 'جديد' },
    { v: 'en_cours', l: 'قيد البحث' },
    { v: 'transmis_parquet', l: 'محال على النيابة' },
    { v: 'cloture', l: 'مُغلق' },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      {/* KPI Section */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
        <KPICard title="PV Rédigés (Total)" value={String(kpis.total)} trend={`${kpis.mois} ce mois`} type="emerald" icon={FileText} />
        <KPICard title="Surface (Ha)" value={kpis.surface.toFixed(2)} trend="Total infractions" type="orange" icon={Map} />
        <KPICard title="Transmis Parquet" value={String(kpis.parquet)} trend="Dossiers" type="red" icon={Scale} />
        <KPICard title="Ce Mois" value={String(kpis.mois)} trend="Nouveaux PV" type="stone" icon={Shield} />
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="p-4 md:p-5 border-b border-stone-100 flex flex-col lg:flex-row gap-3 justify-between items-stretch lg:items-center bg-white text-stone-600">
          <div className="relative w-full lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Rechercher : N° PV, contrevenant, CIN, forêt, lieu-dit…"
              className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-stone-800"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowFilters(v => !v)}
              className={`flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors border ${
                showFilters || activeFilterCount ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
              }`}>
              <SlidersHorizontal className="size-4" /> Filtres
              {activeFilterCount > 0 && <span className="ml-1 inline-flex items-center justify-center size-5 rounded-full bg-emerald-600 text-white text-[10px]">{activeFilterCount}</span>}
            </button>
            <button onClick={exportCsv} title="Exporter la liste filtrée (CSV)"
              className="flex justify-center items-center gap-2 px-4 py-2.5 bg-white border border-stone-200 text-stone-700 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-stone-50 transition-colors">
              <Download className="size-4" /> CSV
            </button>
            <button onClick={onRefresh}
              className="flex justify-center items-center gap-2 px-4 py-2.5 bg-white border border-stone-200 text-stone-700 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-stone-50 transition-colors">
              ↻ Actualiser
            </button>
          </div>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="p-4 md:p-5 border-b border-stone-100 bg-stone-50/60 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" dir="rtl">
            <FilterSelect label="الحالة" value={fStatut} onChange={setFStatut} options={STATUT_OPTIONS.map(o => ({ v: o.v, l: o.l }))} />
            <FilterSelect label="الغابة" value={fForet} onChange={setFForet} options={[{ v: 'all', l: 'كل الغابات' }, ...foretOptions.map(f => ({ v: f, l: f }))]} />
            <FilterSelect label="الجماعة" value={fCommune} onChange={setFCommune} options={[{ v: 'all', l: 'كل الجماعات' }, ...communeOptions.map(c => ({ v: c, l: c }))]} />
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-stone-600">من تاريخ</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full bg-white border border-stone-200 rounded-lg px-2 py-2 text-xs font-mono outline-none focus:border-emerald-500" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-stone-600">إلى تاريخ</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full bg-white border border-stone-200 rounded-lg px-2 py-2 text-xs font-mono outline-none focus:border-emerald-500" />
              </div>
            </div>
            <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap items-end justify-between gap-3">
              <div className="flex items-end gap-2">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-stone-600">الترتيب حسب</label>
                  <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="bg-white border border-stone-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-emerald-500">
                    <option value="date">التاريخ</option>
                    <option value="pv">رقم المحضر</option>
                    <option value="surface">المساحة</option>
                  </select>
                </div>
                <button onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                  className="flex items-center gap-1 px-3 py-2 bg-white border border-stone-200 rounded-lg text-xs font-bold text-stone-700 hover:bg-stone-50">
                  <ArrowUpDown className="size-3.5" /> {sortDir === 'asc' ? 'تصاعدي' : 'تنازلي'}
                </button>
              </div>
              <button onClick={resetFilters} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-stone-500 hover:text-red-600 transition-colors">
                <X className="size-3.5" /> إعادة تعيين الفلاتر
              </button>
            </div>
          </div>
        )}

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="px-4 md:px-5 py-3 border-b border-emerald-100 bg-emerald-50/70 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-bold text-emerald-800">{selected.size} محضراً محدداً</span>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} onClick={bulkTransmit} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-emerald-200 text-emerald-700 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-colors disabled:opacity-50">
                <Gavel className="size-3.5" /> إحالة على النيابة
              </button>
              <button disabled={busy} onClick={bulkExport} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-50 transition-colors disabled:opacity-50">
                <FileCode2 className="size-3.5" /> تصدير DOCX
              </button>
              <button disabled={busy} onClick={bulkDelete} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 text-red-700 rounded-lg text-xs font-bold hover:bg-red-50 transition-colors disabled:opacity-50">
                <Trash2 className="size-3.5" /> حذف
              </button>
              <button onClick={clearSelection} className="flex items-center gap-1.5 px-3 py-1.5 text-stone-500 rounded-lg text-xs font-bold hover:text-stone-800 transition-colors">
                <X className="size-3.5" /> إلغاء التحديد
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-stone-400">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mr-3" />
              Chargement...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-stone-400 text-sm">
              {searchQuery || activeFilterCount ? 'Aucun résultat pour ces critères' : 'Aucun PV enregistré'}
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-[10px] text-stone-500 font-bold uppercase tracking-widest bg-stone-50/50 border-b border-stone-200">
                <tr>
                  <th className="px-4 py-4 w-10">
                    <button onClick={toggleAll} className="text-stone-400 hover:text-emerald-700 transition-colors" title="تحديد الكل">
                      {allVisibleSelected ? <CheckSquare className="size-4 text-emerald-600" /> : <Square className="size-4" />}
                    </button>
                  </th>
                  <th className="px-4 py-4">Référence PV</th>
                  <th className="px-4 py-4">Date & Forêt</th>
                  <th className="px-4 py-4">Nature Infraction</th>
                  <th className="px-4 py-4">Contrevenant</th>
                  <th className="px-4 py-4">Surface</th>
                  <th className="px-4 py-4">Statut</th>
                  <th className="px-4 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filtered.map((pv) => {
                  const s = statusLabel(pv.statut)
                  const isSel = selected.has(pv.id)
                  return (
                    <tr key={pv.id} className={`transition-colors ${isSel ? 'bg-emerald-50/40' : 'hover:bg-stone-50/50'}`}>
                      <td className="px-4 py-4">
                        <button onClick={() => toggleOne(pv.id)} className="text-stone-400 hover:text-emerald-700 transition-colors">
                          {isSel ? <CheckSquare className="size-4 text-emerald-600" /> : <Square className="size-4" />}
                        </button>
                      </td>
                      <td className="px-4 py-4 font-bold text-stone-900 text-xs font-mono">{formatPVNumber(pv)}</td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col">
                          <span className="text-stone-800 font-medium">{pv.date_constat || pv.date_redaction || '—'}</span>
                          <span className="text-[10px] text-stone-500 uppercase tracking-widest">{pv.foret_nom || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-stone-800 italic text-xs max-w-[200px] truncate" dir="rtl">
                        {(pv.infraction_types || []).join('، ') || pv.description_juridique || '—'}
                      </td>
                      <td className="px-4 py-4 text-stone-600 font-medium" dir="rtl">
                        {pv.identity_mode === 'unknown'
                          ? <span className="text-stone-400 italic">مجهول الهوية</span>
                          : ([pv.contrevenant_prenom, pv.contrevenant_nom].filter(Boolean).join(' ') || '—')}
                      </td>
                      <td className="px-4 py-4 text-stone-600 font-mono text-xs whitespace-nowrap">{surfaceHa(pv).toFixed(3)} هـ</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-widest ${s.cls}`}>
                          {s.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button title="تعديل" onClick={() => onEdit(pv)}
                            className="p-2 text-stone-400 hover:text-amber-700 hover:bg-amber-50 rounded-lg border border-stone-200 transition-colors">
                            <Pencil className="size-4" />
                          </button>
                          <button title="Transmettre au Parquet" onClick={() => updateInfractionStatut(pv.id, 'transmis_parquet').then(onRefresh)}
                            className="p-2 text-stone-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg border border-stone-200 transition-colors">
                            <Gavel className="size-4" />
                          </button>
                          <button title="Générer DOCX" onClick={() => generateDocxFromRecord(pv)}
                            className="p-2 text-stone-400 hover:text-blue-700 hover:bg-blue-50 rounded-lg border border-stone-200 transition-colors">
                            <FileCode2 className="size-4" />
                          </button>
                          <button title="معاينة / تحميل PDF" onClick={() => generatePdfFromRecord(pv)}
                            className="p-2 text-stone-400 hover:text-red-700 hover:bg-red-50 rounded-lg border border-stone-200 transition-colors">
                            <Printer className="size-4" />
                          </button>
                          <button title="حذف" onClick={() => removeOne(pv)}
                            className="p-2 text-stone-400 hover:text-red-700 hover:bg-red-50 rounded-lg border border-stone-200 transition-colors">
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer count */}
        {!isLoading && filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-stone-100 bg-stone-50/50 text-xs text-stone-500 flex justify-between">
            <span>{filtered.length} محضراً معروضاً{activeFilterCount ? ` (مُفلتَر من ${pvData.length})` : ''}</span>
            <span>{selected.size > 0 ? `${selected.size} محدد` : ''}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Sélecteur de filtre réutilisable
function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: Array<{ v: string; l: string }>;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold text-stone-600">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all">
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}

// Export CSV (BOM UTF-8 pour Excel arabe)
function exportListCSV(rows: InfractionRecord[]) {
  const headers = ['N° PV', 'Date constat', 'Date rédaction', 'Forêt', 'Canton', 'Commune', 'Lieu-dit', 'Infractions', 'Surface (ha)', 'Contrevenant', 'CIN', 'Statut'];
  const esc = (v: any) => {
    const s = String(v ?? '').replace(/"/g, '""');
    return /[",;\n]/.test(s) ? `"${s}"` : s;
  };
  const surfaceHa = (p: InfractionRecord) =>
    (toNum(p.surface_hectares) + toNum(p.surface_ares) / 100 + toNum(p.surface_centiares) / 10000).toFixed(3);
  const lines = rows.map(p => [
    formatPVNumber(p), p.date_constat || '', p.date_redaction || '', p.foret_nom || '', p.foret_section || '',
    p.commune || '', p.lieu_dit || '', (p.infraction_types || []).join(' / '), surfaceHa(p),
    p.identity_mode === 'unknown' ? 'مجهول' : [p.contrevenant_prenom, p.contrevenant_nom].filter(Boolean).join(' '),
    p.contrevenant_cin || '', p.statut || 'nouveau',
  ].map(esc).join(';'));
  const csv = '\ufeff' + [headers.join(';'), ...lines].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `PV_export_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ══════════════════════════════════════════════════════
// RECORD → DONNÉES DE RENDU (docx/pdf depuis la liste, ZÉRO perte)
// ══════════════════════════════════════════════════════
function recordToRenderData(pv: InfractionRecord): PVRenderData {
  const form = recordToForm(pv);
  return buildRenderDataFromForm(form, formatPVNumber(pv));
}

async function generateDocxFromRecord(pv: InfractionRecord) {
  await generatePVDocx(recordToRenderData(pv))
}

function generatePdfFromRecord(pv: InfractionRecord) {
  generatePVPdf(recordToRenderData(pv))
}

// ── Constructeur unique : formulaire → PVRenderData (utilisé par le wizard ET la liste) ──
function buildRenderDataFromForm(form: PVFormData, pvNum: string): PVRenderData {
  const input: PVComposeInput = {
    pvNum,
    indicatif: form.indicatif,
    serie: form.serie,
    tribunal: form.tribunal,
    direction: form.direction,
    dateConstat: form.dateConstat,
    heureText: form.heureText,
    dateRedaction: form.dateRedaction,
    redactionLieu: form.redactionLieu || form.agent1.residence,
    agents: [form.agent1, form.agent2, form.agent3].slice(0, form.nbAgents).filter(a => a.nom),
    agentsGradeGroup: form.agentsGradeGroup,
    foret: form.foret,
    canton: form.canton,
    delimStatus: form.delimStatus,
    delimCustom: form.delimCustom,
    decreeNum: form.decreeNum,
    decreeDate: form.decreeDate ? form.decreeDate.replace(/-/g, '/') : '',
    placeName: form.placeName,
    commune: form.commune,
    province: form.province,
    coordX: form.coordX,
    coordY: form.coordY,
    accompaniment: form.accompanimentEnabled ? form.accompaniment : '',
    context: { type: form.contextType, num: form.contextNum, date: form.contextDate, text: form.contextText },
    areaM2: form.parcelAreaM2,
    ha: form.ha, are: form.are, ca: form.ca,
    areaOverride: form.areaOverride,
    features: form.features,
    degats: form.degats.map(d => ({ text: renderDamage(d) })).filter(d => d.text && !d.text.includes('...')),
    investigationSteps: form.investigationSteps,
    seizure: form.seizureEnabled ? form.seizure : null,
    identityMode: form.identityMode,
    identity: {
      prenom: form.firstName, nom: form.lastName, filiation: form.filiation, mere: form.motherName,
      dob: form.dob, birthPlace: form.birthPlace, cin: form.cin, profession: form.profession,
      maritalStatus: form.maritalStatus, address: form.address, outsideMaroc: form.outsideMaroc,
      enfants: form.enfants,
    },
    legalDescription: form.legalDescription,
    overlap: form.parcelOverlap
      ? {
          globalPosition: form.parcelOverlap.globalPosition,
          totalPercentage: form.parcelOverlap.totalPercentage,
          hits: form.parcelOverlap.hits.map(h => ({
            foret: h.foret, foretAr: h.foretAr, canton: h.canton,
            percentage: h.percentage, intersectionArea: h.intersectionArea,
          })),
        }
      : null,
    includeOverlapLine: form.includeOverlapLine,
  };
  return { input, parcelCoordPoints: form.parcelCoordPoints, parcelGeojson: form.parcelGeojson };
}

// ══════════════════════════════════════════════════════
// PV FORM (8 STEPS)
// ══════════════════════════════════════════════════════
function PVForm({ onClose, onSaved, initial, resume }: { onClose: () => void; onSaved: () => void; initial?: InfractionRecord | null; resume?: boolean }) {
  // — Reprise de brouillon (retour de la carte / bandeau « متابعة المسودة ») —
  const draftRef = useRef<PVDraft | null>(resume ? loadDraft() : null);
  const editId = draftRef.current?.editId ?? initial?.id ?? null;
  const baseStatut = draftRef.current?.statut ?? initial?.statut ?? null;
  const isEdit = !!editId;
  const [currentStep, setCurrentStep] = useState(draftRef.current?.step ?? 1);
  const [form, setForm] = useState<PVFormData>(() =>
    draftRef.current?.form ?? (initial ? recordToForm(initial) : EMPTY_FORM)
  );
  const [mapCoords, setMapCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [forests, setForests] = useState<ForestEntry[]>([]);

  const [forestGj, setForestGj] = useState<any | null>(null);
  useEffect(() => {
    loadForestIndex().then(en => { setForests(en); setForestGj(getForestGeojson()); }).catch(() => {});
  }, []);

  // مركز التحليق نحو موقع المخالفة على خريطة الملك الغابوي:
  // النقطة المختارة يدويا ، وإلا تحويل عكسي لإحداثيات Lambert المدخلة.
  // هندسات المخالفات الأخرى المرسومة سلفا (طبقات مرجعية رمادية للـ snapping) +
  // القطعة الإجمالية إن وُجدت. تُستثنى المخالفة المستهدفة نفسها.
  const contextFor = (excludeId?: string): PVContextFeature[] => {
    const ctx: PVContextFeature[] = [];
    if (form.parcelGeojson) ctx.push({ label: 'القطعة الإجمالية', geojson: form.parcelGeojson, color: '#000000' });
    form.features.forEach(ft => {
      if (ft.id !== excludeId && ft.geojson) ctx.push({ label: ft.label || 'مخالفة', geojson: ft.geojson, color: ft.symbol.color });
    });
    return ctx;
  };

  const centerForPick = (): { lat: number; lng: number } | undefined => {
    if (mapCoords) return mapCoords;
    const x = toNum(form.coordX), y = toNum(form.coordY);
    if (x > 0 && y > 0) { try { return lambertToWgs84(x, y); } catch {} }
    return undefined;
  };

  const totalSteps = 8;
  const steps = [
    { id: 1, label: 'رقم وتواريخ' },
    { id: 2, label: 'المحررون' },
    { id: 3, label: 'الموقع' },
    { id: 4, label: 'ظروف المعاينة' },
    { id: 5, label: 'المخالفات' },
    { id: 6, label: 'الأضرار' },
    { id: 7, label: 'البحث والهوية' },
    { id: 8, label: 'الإنهاء' },
  ];

  const set = <K extends keyof PVFormData>(key: K, val: PVFormData[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  const setAgent = (n: 1 | 2 | 3, field: keyof AgentData, val: string) =>
    setForm(f => ({ ...f, [`agent${n}`]: { ...f[`agent${n}`], [field]: val } }));

  const pvNum = `${form.pvNum}/${form.pvYear}/${form.brigade}`;

  // ── Brouillon persistant : CHAQUE modification est sauvegardée immédiatement.
  //    Naviguer vers la carte du Domaine Forestier ne perd plus RIEN.
  useEffect(() => {
    saveDraft({ form, step: currentStep, editId, statut: baseStatut });
  }, [form, currentStep, editId, baseStatut]);

  // ── وصف الجنحة : تعبئة تلقائية بالترتيب القانوني عند بلوغ خطوة الإنهاء إن كان فارغا
  useEffect(() => {
    if (currentStep === 8 && !form.legalDescription.trim() && form.features.length) {
      const s = suggestLegalDescription(form.features);
      if (s) setForm(f => ({ ...f, legalDescription: s }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  // ── Réception d'une géométrie depuis la carte Domaine Forestier ──
  //    Routage : entité ciblée (featureTarget) sinon parcelle globale.
  const applyDeliveredParcel = (loc: DeliveredParcel) => {
    const featureId = consumeFeatureTarget();
    const pts = extractCoordPoints(loc.geojson);
    if (featureId) {
      setForm(f => ({
        ...f,
        features: f.features.map(ft => ft.id === featureId
          ? {
              ...ft, geojson: loc.geojson, coordPoints: pts,
              geomType: (loc as any).geomType || ft.geomType || 'polygon',
              areaM2: (loc as any).geomType === 'polygon' ? (loc.areaM2 || ft.areaM2) : ft.areaM2,
              lengthM: (loc as any).geomType === 'line' ? ((loc as any).lengthM || ft.lengthM) : ft.lengthM,
            }
          : ft),
      }));
      return;
    }
    const { ha, are, ca } = areaToHaAreCa(loc.areaM2);
    setMapCoords({ lat: loc.centroidLat, lng: loc.centroidLng });
    setForm(f => ({
      ...f,
      parcelGeojson: loc.geojson,
      parcelAreaM2: loc.areaM2,
      parcelCoordPoints: pts,
      parcelOverlap: loc.overlap || null,
      parcelProvince: loc.province || null,
      coordX: loc.lambertX ? String(loc.lambertX.toFixed(2)) : f.coordX,
      coordY: loc.lambertY ? String(loc.lambertY.toFixed(2)) : f.coordY,
      ha: (f.ha === '0' || f.ha === '') ? ha : f.ha,
      are: (f.are === '0' || f.are === '') ? are : f.are,
      ca: (f.ca === '0' || f.ca === '') ? ca : f.ca,
    }));
  };

  useEffect(() => {
    const pending = consumePendingParcel();
    if (pending) applyDeliveredParcel(pending);
    return onParcelDelivered(applyDeliveredParcel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNext = () => setCurrentStep(p => Math.min(p + 1, totalSteps));
  const handlePrev = () => setCurrentStep(p => Math.max(p - 1, 1));

  const handleAgentQuickSelect = (agentN: 1 | 2 | 3, nom: string) => {
    const found = AGENTS_LIST.find(a => a.nom === nom);
    if (found) setForm(f => ({ ...f, [`agent${agentN}`]: found }));
  };

  // ── Entités (infractions) ──
  const addFeature = (preset: typeof FEATURE_PRESETS[number]) =>
    setForm(f => ({
      ...f,
      features: [...f.features, {
        id: uid(),
        label: preset.label === 'أخرى' ? '' : preset.label,
        details: preset.details,
        symbol: { ...preset.symbol },
        geojson: null, coordPoints: [], areaM2: 0,
        showOnPlan: true, showCoordsTable: true,
      }],
    }));

  const setFeature = (id: string, patch: Partial<PVFeature>) =>
    setForm(f => ({ ...f, features: f.features.map(ft => ft.id === id ? { ...ft, ...patch } : ft) }));

  const removeFeature = (id: string) =>
    setForm(f => ({ ...f, features: f.features.filter(ft => ft.id !== id) }));

  // إضافة سريعة من قائمة الجنح الأكثر تكرارا بالشمال
  const addQuick = (q: QuickInfraction) =>
    setForm(f => ({
      ...f,
      features: [...f.features, {
        id: uid(), label: q.label, details: q.details, symbol: { ...q.symbol },
        geojson: null, coordPoints: [], areaM2: 0, showOnPlan: true, showCoordsTable: true,
        article: q.article, transaction: q.transaction, catalogId: q.catalogId, noArea: q.noArea, geomType: q.geomType || 'polygon',
      }],
    }));

  // إضافة مخالفة من الكتالوج القانوني (ظهير 1917 + الدورية 4787)
  const addFromCatalog = (it: InfractionCatalogItem) =>
    setForm(f => ({
      ...f,
      features: [...f.features, {
        id: uid(), label: it.label, details: it.details, symbol: { ...it.symbol },
        geojson: null, coordPoints: [], areaM2: 0, showOnPlan: true, showCoordsTable: true,
        article: it.article, transaction: it.transaction, catalogId: it.id,
      }],
    }));

  // insère la surface calculée dans le texte du tiret (remplace « ... »)
  const injectAreaInDetails = (ft: PVFeature) => {
    const a = featureAreaText(ft);
    if (!a) return;
    const details = ft.details.includes('...') ? ft.details.replace('...', a) : `${ft.details} (حوالي ${a})`;
    setFeature(ft.id, { details });
  };

  // ── Dégâts (مهيكلة حسب النوع) ──
  const addDamage = (kind: DamageKind) => setForm(f => ({
    ...f, degats: [...f.degats, { id: uid(), kind, girth: 'sup', loadUnit: LOAD_UNITS[0], text: '' } as DamageDraft],
  }));
  const setDamage = (id: string, patch: Partial<DamageDraft>) => setForm(f => ({
    ...f, degats: f.degats.map(d => d.id === id ? { ...d, ...patch } : d),
  }));
  const removeDamage = (id: string) => setForm(f => ({ ...f, degats: f.degats.filter(d => d.id !== id) }));

  // ── Étapes d'enquête ──
  const addStep = (type: InvestigationStepType) =>
    setForm(f => ({ ...f, investigationSteps: [...f.investigationSteps, { id: uid(), type, date: '', name: '', agents: '', text: '' }] }));
  const setStep = (id: string, patch: Partial<InvestigationStep>) =>
    setForm(f => ({ ...f, investigationSteps: f.investigationSteps.map(s => s.id === id ? { ...s, ...patch } : s) }));
  const removeStep = (id: string) =>
    setForm(f => ({ ...f, investigationSteps: f.investigationSteps.filter(s => s.id !== id) }));

  // ── مسار البحث القياسي: تعريف الأسئلة وترتيبها الرسمي داخل المحضر ──
  const QUICK_DEFS: Array<{ id: string; type: InvestigationStepType; q: string; group: number }> = [
    { id: 'q_ouverture', type: 'ouverture_enquete', q: 'هل فُتح بحث في الموضوع رفقة باقي المتدخلين؟', group: 1 },
    { id: 'q_autorite', type: 'coordination_autorite', q: 'هل تم التنسيق مع السلطة المحلية؟', group: 1 },
    { id: 'q_gendarme', type: 'coordination_gendarmerie', q: 'هل تم التنسيق مع الدرك الملكي؟', group: 1 },
    { id: 'q_dgsn', type: 'coordination_surete', q: 'هل تم التنسيق مع الأمن الوطني (الهوية الكاملة)؟', group: 1 },
    { id: 'q_rencontre', type: 'rencontre_declaration', q: 'هل تم الالتقاء بالمخالف واستفساره عمّا نُسب إليه؟', group: 2 },
    { id: 'q_decl', type: 'avertissement', q: 'هل صُرِّح له بالمخالفة وأُنذر؟', group: 3 },
  ];
  const QUICK_GROUPS = [
    { n: 1, title: 'فتح البحث والتنسيق مع الأجهزة' },
    { n: 2, title: 'الوصول إلى المخالف والالتقاء به' },
    { n: 3, title: 'التصريح والإنذار' },
  ];
  const Q_ORDER = QUICK_DEFS.map(q => q.id);
  const toggleQuick = (id: string, type: InvestigationStepType) =>
    setForm(f => {
      const exists = f.investigationSteps.some(x => x.id === id);
      const steps = exists
        ? f.investigationSteps.filter(x => x.id !== id)
        : [...f.investigationSteps, { id, type, date: '', name: '', agents: type === 'avertissement' ? '1' : '', text: '' }];
      const qs = steps.filter(x => Q_ORDER.includes(x.id)).sort((a, b) => Q_ORDER.indexOf(a.id) - Q_ORDER.indexOf(b.id));
      const rest = steps.filter(x => !Q_ORDER.includes(x.id));
      return { ...f, investigationSteps: [...qs, ...rest] };
    });

  // ── Saisie (حجز) ──
  const setSeizure = (patch: Partial<PVSeizure>) => setForm(f => ({ ...f, seizure: { ...f.seizure, ...patch } }));
  const setSeizureItem = (idx: number, field: 'label' | 'qty', val: string) =>
    setSeizure({ items: form.seizure.items.map((it, i) => i === idx ? { ...it, [field]: val } : it) });

  const buildRenderData = (): PVRenderData => buildRenderDataFromForm(form, pvNum);

  const buildPayload = () => ({
    numero_pv_ordre: form.pvNum ? Number(form.pvNum) : null,
    numero_carnet: form.pvYear, // conservé INTÉGRALEMENT (« 02/2025 »)
    brigade_code: form.brigade,
    date_constat: form.dateConstat,
    date_redaction: form.dateRedaction,
    redaction_lieu: form.redactionLieu || form.agent1.residence,
    heure_constat: form.heureText,
    nb_agents: form.nbAgents,
    agent_1_nom: form.agent1.nom,
    agent_1_grade: form.agent1.grade,
    agent_1_residence: form.agent1.residence,
    agent_2_nom: form.agent2.nom,
    agent_2_grade: form.agent2.grade,
    agent_2_residence: form.agent2.residence,
    agent_3_nom: form.agent3.nom,
    agent_3_grade: form.agent3.grade,
    agent_3_residence: form.agent3.residence,
    foret_nom: form.foret,
    foret_nom_ar: form.foret,
    foret_section: form.canton,
    decret_num: form.decreeNum,
    decret_date: form.decreeDate || null,
    lieu_dit: form.placeName,
    commune: form.commune,
    qiada: form.commune,
    imaala: form.province,
    coord_x: form.coordX ? toNum(form.coordX) : null,
    coord_y: form.coordY ? toNum(form.coordY) : null,
    infraction_types: form.features.map(f => f.label).filter(Boolean),
    infraction_details: {},
    surface_hectares: toNum(form.ha),
    surface_ares: toNum(form.are),
    surface_centiares: toNum(form.ca),
    degats: form.degats.map(d => ({ text: renderDamage(d) })).filter(d => d.text),
    contrevenant_prenom: form.firstName,
    contrevenant_nom: form.lastName,
    contrevenant_nasab: form.filiation,
    contrevenant_mere: form.motherName,
    contrevenant_ddn: form.dob || null,
    contrevenant_lieu_naiss: form.birthPlace,
    contrevenant_situation: form.maritalStatus,
    contrevenant_profession: form.profession,
    contrevenant_cin: form.cin,
    contrevenant_adresse: form.address,
    contrevenant_hors_maroc: form.outsideMaroc,
    identity_mode: form.identityMode,
    description_juridique: form.legalDescription,
    statut: baseStatut || 'nouveau',
    // ── persistance intégrale (jsonb) ──
    narrative: {
      heureText: form.heureText,
      delimStatus: form.delimStatus,
      delimCustom: form.delimCustom,
      accompaniment: form.accompanimentEnabled ? form.accompaniment : '',
      context: { type: form.contextType, num: form.contextNum, date: form.contextDate, text: form.contextText },
      investigationSteps: form.investigationSteps,
      seizure: form.seizureEnabled ? form.seizure : null,
      identityMode: form.identityMode,
      identityEnfants: form.enfants,
      areaOverride: form.areaOverride,
      includeOverlapLine: form.includeOverlapLine,
      indicatif: form.indicatif,
      serie: form.serie,
      tribunal: form.tribunal,
      direction: form.direction,
      agentsGradeGroup: form.agentsGradeGroup,
      redactionLieu: form.redactionLieu,
    } satisfies PVNarrativeJson,
    features: form.features,
    parcel_geojson: form.parcelGeojson,
    parcel_area_m2: form.parcelAreaM2 || null,
    parcel_overlap: form.parcelOverlap,
  });

  const savePV = async (): Promise<string | null> => {
    setSaving(true); setSaveError('');
    const payload = buildPayload();
    try {
      let pvId: string | null = null;
      if (isEdit && editId) {
        const { success, error } = await updateInfraction(editId, payload);
        if (!success) { setSaveError(error || 'Erreur lors de la mise à jour'); return null; }
        pvId = editId;
      } else {
        const res = await fetch('/api/save-pv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          setSaveError(data.error || 'Erreur lors de la sauvegarde');
          return null;
        }
        pvId = data.id ?? data.record?.id ?? data.pv?.id ?? null;
      }
      if (pvId && form.parcelGeojson) {
        await savePVParcel(pvId, pvNum, {
          geojson: form.parcelGeojson,
          centroidLat: mapCoords?.lat ?? 0,
          centroidLng: mapCoords?.lng ?? 0,
          lambertX: toNum(form.coordX),
          lambertY: toNum(form.coordY),
          areaM2: form.parcelAreaM2,
          perimeterKm: 0,
          province: form.parcelProvince,
          overlap: form.parcelOverlap,
        });
      }
      clearDraft(); // succès → le brouillon n'a plus lieu d'être
      return pvId ?? 'ok';
    } catch (e) {
      setSaveError('Erreur de connexion');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOnly = async () => {
    const ok = await savePV();
    if (ok) { onSaved(); onClose(); }
  };

  // ✔ ORDRE CORRIGÉ : sauvegarde D'ABORD, export ENSUITE (jamais de docx orphelin)
  const handleSaveAndGenerate = async () => {
    const ok = await savePV();
    if (!ok) return;
    await generatePVDocx(buildRenderData());
    onSaved(); onClose();
  };

  const handlePreviewPdf = () => generatePVPdf(buildRenderData());
  const handlePreviewHtml = () => previewPVHtml(buildRenderData());

  // ✔ CLIC MANUEL : conversion WGS84 → Lambert (fin du mélange de CRS)
  const LocationPicker = () => {
    useMapEvents({
      click(e: any) {
        setMapCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
        const { x, y } = wgs84ToLambert(e.latlng.lat, e.latlng.lng);
        set('coordX', x.toFixed(2));
        set('coordY', y.toFixed(2));
      }
    });
    return mapCoords ? <Marker position={[mapCoords.lat, mapCoords.lng]} icon={customIcon} /> : null;
  };

  const currentAgentData = form[`agent${form.activeAgent}` as 'agent1' | 'agent2' | 'agent3'];
  const sealed = form.identityMode === 'complete';

  return (
    <div className="bg-white text-stone-800 rounded-2xl border border-stone-200 shadow-sm flex flex-col w-full" dir="rtl">
      {/* Stepper */}
      <div className="px-8 py-5 border-b border-stone-100 bg-stone-50/50 overflow-x-auto hide-scrollbar rounded-t-2xl">
        <div className="flex items-center gap-3 min-w-max">
          {steps.map((step, index) => {
            const isActive = currentStep === step.id;
            const isPast = currentStep > step.id;
            return (
              <div key={step.id} className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCurrentStep(step.id)}
                  className={`flex items-center gap-2 pl-4 pr-1 py-1.5 rounded-full border bg-white cursor-pointer hover:bg-stone-50 transition-colors ${
                    isActive ? 'border-emerald-500 shadow-sm' :
                    isPast ? 'border-stone-200 opacity-60' :
                    'border-stone-200 opacity-40'
                  }`}
                >
                  <span className={`text-xs font-bold tracking-wide pl-2 ${isActive ? 'text-emerald-700' : 'text-stone-500'}`}>{step.label}</span>
                  <div className={`size-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isActive ? 'bg-emerald-100 text-emerald-700' :
                    isPast ? 'bg-stone-100 text-stone-500' :
                    'bg-stone-50 text-stone-400'
                  }`}>
                    {isPast ? <Check className="size-3" /> : step.id}
                  </div>
                </button>
                {index < steps.length - 1 && <div className={`w-6 h-px ${isPast ? 'bg-emerald-500/30' : 'bg-stone-200'}`}></div>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-4 md:p-8 min-h-[400px]">

        {/* ══ STEP 1 — رقم المحضر (ورقة/دفتر/سنة) + تاريخا المعاينة والتحرير ══ */}
        {currentStep === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {isEdit && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                <Pencil className="size-4" /> وضع التعديل: أنت تُحرّر محضراً موجوداً ({initial ? formatPVNumber(initial) : pvNum}).
              </div>
            )}
            <h3 className="text-lg font-serif italic text-emerald-900 mb-6">رقم المحضر والتواريخ</h3>

            <div className="p-6 bg-white border border-stone-200 rounded-xl shadow-sm space-y-4">
              <h4 className="text-xs font-bold text-stone-500">كل دفتر يضم 50 ورقة ، والدفاتر تُرقَّم حسب الاستهلاك داخل السنة (1/2025 ، 2/2025 ...)</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <SelectLight label="رقم الورقة (1-50)" value={form.pvNum} onChange={v => set('pvNum', v)}
                  options={Array.from({ length: 50 }, (_, i) => String(i + 1))} placeholder="الورقة" />
                <SelectLight label="رقم الدفتر" value={(form.pvYear.split('/')[0] || '')} placeholder="الدفتر"
                  options={Array.from({ length: 30 }, (_, i) => String(i + 1))}
                  onChange={v => set('pvYear', `${v}/${form.pvYear.split('/')[1] || new Date().getFullYear()}`)} />
                <SelectLight label="سنة الدفتر" value={(form.pvYear.split('/')[1] || '')} placeholder="السنة"
                  options={Array.from({ length: new Date().getFullYear() - 2018 }, (_, i) => String(new Date().getFullYear() - i))}
                  onChange={v => set('pvYear', `${form.pvYear.split('/')[0] || '1'}/${v}`)} />
                <FormInputLight label="البريغاد" type="text" placeholder="BM" value={form.brigade} onChange={(e: any) => set('brigade', e.target.value)} />
              </div>
              {form.pvNum && form.pvYear.includes('/') && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-mono">
                  رقم المحضر: <strong dir="ltr">{pvNum}</strong>
                </div>
              )}
            </div>

            <div className="p-6 bg-white border border-stone-200 rounded-xl shadow-sm space-y-6">
              <h4 className="text-xs font-bold text-stone-500">تاريخ المعاينة (يُكتب بالحروف في المحضر) وساعتها</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormInputLight label="تاريخ المعاينة" type="date" value={form.dateConstat} onChange={(e: any) => set('dateConstat', e.target.value)} />
                <HeureComposer value={form.heureText} onChange={v => set('heureText', v)} />
              </div>
            </div>

            <div className="p-6 bg-stone-50 border border-stone-200 rounded-xl space-y-6">
              <h4 className="text-xs font-bold text-stone-500">التحرير — قد يتأخر عن المعاينة (مثال: معاينة 19 ماي 2025 وتحرير 30-06-2026)</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormInputLight label="تاريخ التحرير (حرر في)" type="date" value={form.dateRedaction} onChange={(e: any) => set('dateRedaction', e.target.value)} />
                <FormInputLight label="مكان التحرير (حرر بـ)" type="text" placeholder="المضيق" value={form.redactionLieu} onChange={(e: any) => set('redactionLieu', e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* ══ STEP 2 — المحررون ══ */}
        {currentStep === 2 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-lg font-serif italic text-emerald-900 mb-6">المحررون</h3>
            <div className="flex gap-4 mb-6 border-b border-stone-200 pb-4">
              {[1, 2, 3].map(n => (
                <button key={n} type="button"
                  onClick={() => { set('activeAgent', n as 1|2|3); if (n > form.nbAgents) set('nbAgents', n as 1|2|3); }}
                  className={`flex-1 py-3 border-b-2 font-bold text-sm rounded-t-lg transition-colors ${
                    form.activeAgent === n
                      ? 'border-emerald-600 text-emerald-700 bg-emerald-50'
                      : 'border-transparent text-stone-500 hover:text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  محرر {n}
                </button>
              ))}
            </div>
            <div className="p-6 border border-stone-200 rounded-xl space-y-6 bg-stone-50/50">
              <div className="space-y-2 text-right w-full">
                <label className="text-xs font-bold text-stone-600">اختيار سريع</label>
                <select
                  dir="rtl"
                  className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-stone-800 outline-none appearance-none shadow-sm"
                  value={currentAgentData.nom}
                  onChange={e => handleAgentQuickSelect(form.activeAgent as 1|2|3, e.target.value)}
                >
                  <option value="" disabled>— اختر ليتم ملء الخانات تلقائياً —</option>
                  {AGENTS_LIST.map(a => <option key={a.nom} value={a.nom}>{a.nom}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormInputLight label="الاسم الكامل" type="text" placeholder="الاسم الكامل" value={currentAgentData.nom} onChange={(e: any) => setAgent(form.activeAgent as 1|2|3, 'nom', e.target.value)} />
                <FormInputLight label="الصفة / الدرجة" type="text" placeholder="تقني متخصص..." value={currentAgentData.grade} onChange={(e: any) => setAgent(form.activeAgent as 1|2|3, 'grade', e.target.value)} />
              </div>
              <FormInputLight label="محل الإقامة" type="text" placeholder="مدينة / جماعة" value={currentAgentData.residence} onChange={(e: any) => setAgent(form.activeAgent as 1|2|3, 'residence', e.target.value)} />
            </div>
            <FormInputLight label="صيغة الصفة الجماعية في نص المحضر" type="text" placeholder="تقنيون للمياه والغابات" value={form.agentsGradeGroup} onChange={(e: any) => set('agentsGradeGroup', e.target.value)} />
          </div>
        )}

        {/* ══ STEP 3 — الموقع والملك الغابوي ══ */}
        {currentStep === 3 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-lg font-serif italic text-emerald-900 mb-6">الموقع والغابة</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2 text-right">
                <label className="text-xs font-bold text-stone-600">الغابة (من طبقة forest_limits — ترجمة حرفية)</label>
                <select dir="rtl"
                  value={forests.find(f => form.foret === f.official)?.fr ?? (FORETS_LIST.includes(form.foret) ? form.foret : '')}
                  onChange={e => {
                    const v = e.target.value;
                    const entry = forests.find(f => f.fr === v);
                    if (entry) { set('foret', entry.official); set('canton', ''); }
                    else if (v) { set('foret', v); set('canton', ''); }
                  }}
                  className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-stone-800 outline-none appearance-none shadow-sm">
                  <option value="">— اختر الغابة —</option>
                  {forests.map(f => <option key={f.fr} value={f.fr}>{f.ar} — {f.fr}</option>)}
                  {forests.length === 0 && FORETS_LIST.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <p className={`text-[10px] font-bold ${forests.length ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {forests.length
                    ? `✓ حُمِّلت ${forests.length} غابة و ${forests.reduce((n, f) => n + f.cantons.length, 0)} قسما من طبقة forest_limits`
                    : '⚠ تعذر تحميل طبقة forest_limits من public/assets/data — تُستعمل القائمة الاحتياطية'}
                </p>
                <input type="text" dir="rtl" value={form.foret} onChange={e => set('foret', e.target.value)}
                  placeholder="كما ستُكتب في المحضر (قابلة للتعديل)"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-500" />
              </div>
              <div className="space-y-2 text-right">
                <label className="text-xs font-bold text-stone-600">القسم (Canton)</label>
                <select dir="rtl"
                  value={(forests.find(f => form.foret === f.official)?.cantons || []).find(c => form.canton === c.ar)?.fr ?? ''}
                  onChange={e => {
                    const entry = forests.find(f => form.foret === f.official);
                    const c = entry?.cantons.find(x => x.fr === e.target.value);
                    if (c) set('canton', c.ar);
                  }}
                  className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-stone-800 outline-none appearance-none shadow-sm">
                  <option value="">— اختر القسم —</option>
                  {(forests.find(f => form.foret === f.official)?.cantons || []).map(c => (
                    <option key={c.fr} value={c.fr}>{c.ar} — {c.fr}</option>
                  ))}
                </select>
                <input type="text" dir="rtl" value={form.canton} onChange={e => set('canton', e.target.value)}
                  placeholder="كما سيُكتب في المحضر (قابل للتعديل)"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-500" />
              </div>
            </div>

            <div className="p-6 border border-stone-200 rounded-xl space-y-6 bg-white shadow-sm">
              <h4 className="text-xs font-bold text-stone-500 mb-2">وضعية التحديد والمرسوم الوزاري</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 text-right">
                  <label className="text-xs font-bold text-stone-600">وضعية التحديد</label>
                  <select dir="rtl" value={form.delimStatus} onChange={e => set('delimStatus', e.target.value as DelimStatus)}
                    className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none appearance-none shadow-sm">
                    {DELIM_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                  </select>
                </div>
                {form.delimStatus === 'libre' && (
                  <FormInputLight label="الصيغة الحرة" type="text" placeholder="اكتب صيغة وضعية التحديد" value={form.delimCustom} onChange={(e: any) => set('delimCustom', e.target.value)} />
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormInputLight label="رقم المرسوم" type="text" placeholder="مثال: 02.84.321" value={form.decreeNum} onChange={(e: any) => set('decreeNum', e.target.value)} />
                <FormInputLight label="تاريخ المرسوم" type="date" value={form.decreeDate} onChange={(e: any) => set('decreeDate', e.target.value)} />
              </div>
            </div>

            <div className="space-y-2 text-right">
              <FormInputLight label="المكان المسمى" type="text" placeholder="مثال: بئر الشيخ" value={form.placeName} onChange={(e: any) => set('placeName', e.target.value)} />
              <div className="flex flex-wrap gap-1.5">
                {LIEU_DIT_SUGGESTIONS.map(ld => (
                  <button key={ld} type="button" onClick={() => set('placeName', ld)}
                    className="px-2.5 py-1 bg-stone-100 border border-stone-200 text-stone-600 text-[11px] rounded-lg hover:bg-emerald-50 hover:text-emerald-700 transition-colors">{ld}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2 text-right">
                <label className="text-xs font-bold text-stone-600">الجماعة / القيادة</label>
                <select dir="rtl" value={form.commune} onChange={e => set('commune', e.target.value)} className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-stone-800 outline-none appearance-none shadow-sm">
                  <option value="">— اختر الجماعة —</option>
                  {COMMUNES_LIST.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-2 text-right">
                <label className="text-xs font-bold text-stone-600">العمالة / الإقليم</label>
                <select dir="rtl" value={form.province} onChange={e => set('province', e.target.value)} className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-stone-800 outline-none appearance-none shadow-sm">
                  {IMAALA_LIST.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
            </div>

            {/* ── القطعة الإجمالية على خريطة الملك الغابوي ── */}
            <div className="p-6 border rounded-xl space-y-4 bg-gradient-to-br from-emerald-50/60 to-white border-emerald-200 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700 border border-emerald-200"><Layers className="size-5" /></div>
                  <div>
                    <h4 className="text-sm font-bold text-emerald-900">القطعة الإجمالية المترامى عليها (خريطة الملك الغابوي)</h4>
                    <p className="text-xs text-stone-500 mt-1">ارسم حدود القطعة الإجمالية ليُحسب المركز والمساحة والتداخل تلقائياً. هندسة كل مخالفة تُرسم لاحقاً في خطوة «المخالفات».</p>
                  </div>
                </div>
                <button type="button" onClick={() => requestParcelPickForPV(pvNum, centerForPick(), contextFor())}
                  className="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-700 text-white rounded-xl text-xs uppercase tracking-widest font-bold hover:bg-emerald-800 transition-colors shadow-md shadow-emerald-900/10 whitespace-nowrap">
                  <Crosshair className="size-4" /> رسم القطعة الإجمالية
                </button>
              </div>
              <p className="text-[11px] text-emerald-700">✓ تُحفظ مسودة المحضر تلقائيا — لن يضيع أي معطى عند الانتقال إلى الخريطة والعودة.</p>

              {form.parcelGeojson && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                  <ParcelStat label="المساحة" value={`${(form.parcelAreaM2 / 10000).toFixed(3)} هـ`} />
                  <ParcelStat label="عدد النقاط" value={String(form.parcelCoordPoints.length)} />
                  <ParcelStat label="X مركز" value={form.coordX || '—'} />
                  <ParcelStat label="Y مركز" value={form.coordY || '—'} />
                  {form.parcelOverlap && (
                    <div className="col-span-2 md:col-span-4">
                      <div className={`flex items-center justify-between px-4 py-2 rounded-lg text-xs font-bold border ${
                        form.parcelOverlap.globalPosition === 'داخل الملك الغابوي' ? 'bg-red-50 text-red-700 border-red-200' :
                        form.parcelOverlap.globalPosition === 'جزئيا داخل الملك الغابوي' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                        'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                        <span>{form.parcelOverlap.globalPosition}</span>
                        <span>نسبة التداخل {form.parcelOverlap.totalPercentage.toFixed(1)}%</span>
                      </div>
                    </div>
                  )}
                  <div className="col-span-2 md:col-span-4 flex gap-2">
                    <button type="button" onClick={() => showPVParcelOnMap(form.parcelGeojson, pvNum)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-white border border-stone-200 text-stone-700 rounded-lg text-xs font-bold hover:bg-stone-50 transition-colors">
                      <MapPin className="size-4" /> إعادة عرض القطعة على الخريطة
                    </button>
                    {form.parcelOverlap && (
                      <button type="button" onClick={() => exportOverlapReport(form, pvNum)}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-white border border-stone-200 text-stone-700 rounded-lg text-xs font-bold hover:bg-blue-50 hover:text-blue-700 transition-colors">
                        <FileCode2 className="size-4" /> تقرير التداخل (DOCX)
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 rounded-xl overflow-hidden h-[300px] border border-stone-200 relative">
              <div className="absolute inset-0 z-10 p-2 flex flex-col items-start justify-between pointer-events-none">
                <span className="text-xs bg-white text-stone-700 px-3 py-1.5 rounded-lg shadow-md font-medium border border-stone-100 mt-2 ml-2 self-end">انقر لتحديد مركز المخالفة (قمر اصطناعي + مراجع) — يُحوَّل إلى Lambert وتتمركز عليه خريطة الملك الغابوي عند الرسم</span>
                {mapCoords && (
                  <div className="bg-white/90 backdrop-blur border border-stone-200 p-3 rounded-xl shadow-lg mb-2 mr-2 text-xs flex gap-4 pointer-events-auto">
                    <div><span className="text-stone-500 block mb-1">X (Lambert)</span><span className="font-mono text-stone-800">{form.coordX}</span></div>
                    <div><span className="text-stone-500 block mb-1">Y (Lambert)</span><span className="font-mono text-stone-800">{form.coordY}</span></div>
                  </div>
                )}
              </div>
              <MapContainer center={[35.5785, -5.3684]} zoom={13} className="h-full w-full z-0 cursor-crosshair">
                <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="Esri &mdash; World Imagery" maxZoom={19} />
                <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" attribution="Esri &mdash; References" maxZoom={19} />
                {forestGj && (
                  <GeoJSON key="forest-limits" data={forestGj}
                    style={() => ({ color: '#166534', weight: 2, fillColor: '#22c55e', fillOpacity: 0.08 })} />
                )}
                <LocationPicker />
              </MapContainer>
            </div>
          </div>
        )}

        {/* ══ STEP 4 — ظروف المعاينة (المرافقة + إطار العملية) ══ */}
        {currentStep === 4 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-lg font-serif italic text-emerald-900 mb-6">ظروف المعاينة</h3>

            <div className="p-6 bg-white border border-stone-200 rounded-xl shadow-sm space-y-4">
              <label className="flex items-center gap-3 cursor-pointer" onClick={() => set('accompanimentEnabled', !form.accompanimentEnabled)}>
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${form.accompanimentEnabled ? 'bg-emerald-600 border-emerald-600' : 'border-stone-300'}`}>
                  {form.accompanimentEnabled && <Check className="size-3 text-white" />}
                </div>
                <span className="text-sm font-bold text-stone-700">هل كان معكم مرافق في المعاينة؟</span>
              </label>
              {form.accompanimentEnabled && (
                <>
                  <FormInputLight label="صفة/اسم المرافق كما سيُكتب في المحضر" type="text"
                    placeholder="رئيس مركز حماية الغابات للمضيق الفنيدق"
                    value={form.accompaniment} onChange={(e: any) => set('accompaniment', e.target.value)} />
                  <div className="flex flex-wrap gap-1.5">
                    {['رئيس مركز حماية الغابات للمضيق الفنيدق', 'رئيس مركز التنمية الغابوية', 'أعوان القوة المساعدة', 'ممثل السلطة المحلية', 'أعوان الدرك الملكي'].map(a => (
                      <button key={a} type="button" onClick={() => set('accompaniment', a)}
                        className="px-2 py-1 bg-stone-100 border border-stone-200 text-stone-600 text-[11px] rounded-lg hover:bg-emerald-50 hover:text-emerald-700 transition-colors">{a}</button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="p-6 bg-stone-50 border border-stone-200 rounded-xl space-y-4">
              <h4 className="text-sm font-bold text-stone-700">إطار المعاينة</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {([
                  { v: 'ratissage', l: 'قرار عملية تمشيط' },
                  { v: 'patrouille', l: 'مهام المراقبة والحراسة' },
                  { v: 'information', l: 'على إثر إخبارية' },
                  { v: 'libre', l: 'صيغة حرة' },
                ] as Array<{ v: ConstatContextType; l: string }>).map(o => (
                  <button key={o.v} type="button" onClick={() => set('contextType', o.v)}
                    className={`px-3 py-3 rounded-xl border text-xs font-bold transition-colors ${
                      form.contextType === o.v ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                    }`}>
                    {o.l}
                  </button>
                ))}
              </div>
              {form.contextType === 'ratissage' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormInputLight label="رقم قرار التمشيط" type="text" placeholder="مثال: 100" value={form.contextNum} onChange={(e: any) => set('contextNum', e.target.value)} />
                  <FormInputLight label="تاريخ القرار" type="date" value={form.contextDate} onChange={(e: any) => set('contextDate', e.target.value)} />
                </div>
              )}
              {form.contextType === 'libre' && (
                <FormInputLight label="الصيغة الحرة" type="text" placeholder="اكتب إطار المعاينة كما سيظهر في المحضر" value={form.contextText} onChange={(e: any) => set('contextText', e.target.value)} />
              )}
            </div>
          </div>
        )}

        {/* ══ STEP 5 — المخالفات (باني الكيانات + المساحة الإجمالية) ══ */}
        {currentStep === 5 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-lg font-serif italic text-emerald-900 mb-2">المخالفات المعاينة على القطعة</h3>
            <p className="text-xs text-stone-500">كل مخالفة = كيان مستقل بنصّه في المحضر، ورمزه على التصميم، وهندسته، ولائحة إحداثياته الخاصة. القطعة الواحدة قد تحمل عدة مخالفات.</p>

            <div className="p-6 bg-stone-50 border border-stone-200 rounded-xl">
              <h4 className="text-xs font-bold text-stone-500 mb-4">المساحة الإجمالية للقطعة</h4>
              <div className="grid grid-cols-3 gap-6">
                <FormInputLight label="هكتار" type="number" placeholder="0" value={form.ha} onChange={(e: any) => set('ha', e.target.value)} />
                <FormInputLight label="آر" type="number" placeholder="0" value={form.are} onChange={(e: any) => set('are', e.target.value)} />
                <FormInputLight label="سنتيار" type="number" placeholder="0" value={form.ca} onChange={(e: any) => set('ca', e.target.value)} />
              </div>
              <div className="mt-4">
                <FormInputLight label="صيغة المساحة في النص (اختياري — يعوّض التوليد الآلي)" type="text" placeholder="مثال: 05 هكتار 64 آر 90 سنتيار / 4448 متر مربع" value={form.areaOverride} onChange={(e: any) => set('areaOverride', e.target.value)} />
              </div>
            </div>

            {/* ⚡ الأكثر تكرارا بالشمال — إضافة بنقرة واحدة */}
            <div className="p-4 bg-emerald-700 rounded-xl shadow-sm">
              <h4 className="text-xs font-bold text-emerald-100 mb-3">⚡ الأكثر تكرارا بالشمال — إضافة بنقرة واحدة</h4>
              <div className="flex flex-wrap gap-2">
                {TOP_INFRACTIONS_NORD.map(q => (
                  <button key={q.label} type="button" onClick={() => addQuick(q)}
                    className="px-3.5 py-2 bg-white text-emerald-900 text-xs font-bold rounded-lg hover:bg-emerald-50 transition-colors shadow-sm">
                    + {q.label}
                  </button>
                ))}
              </div>
            </div>

            {/* الكتالوج القانوني: ظهير 10/10/1917 + الدورية 4787 */}
            <CatalogPanel onAdd={addFromCatalog} />

            {/* إضافة من القوالب السريعة (صيغ النماذج الرسمية) */}
            <div className="p-4 bg-white border border-stone-200 rounded-xl shadow-sm">
              <h4 className="text-xs font-bold text-stone-500 mb-3 flex items-center gap-2"><ListPlus className="size-4" /> قوالب سريعة (صيغ جاهزة من المحاضر النموذجية)</h4>
              <div className="flex flex-wrap gap-2">
                {FEATURE_PRESETS.map(p => (
                  <button key={p.label} type="button" onClick={() => addFeature(p)}
                    className="px-3 py-1.5 bg-stone-100 border border-stone-200 text-stone-700 text-xs rounded-lg hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition-colors">
                    + {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* بطاقات الكيانات */}
            {form.features.length === 0 && (
              <div className="text-center py-10 text-stone-400 text-sm border-2 border-dashed border-stone-200 rounded-xl">لم تُضف أي مخالفة بعد — اختر من القوالب أعلاه</div>
            )}
            {form.features.map((ft, idx) => (
              <div key={ft.id}
                className="p-5 bg-white border border-stone-200 rounded-xl shadow-sm space-y-4 border-r-[6px]"
                style={{ borderRightColor: ft.symbol.color }}>
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-stone-100">
                  <div className="flex items-center gap-2">
                    <span className="size-6 rounded-full text-white text-xs font-bold flex items-center justify-center shadow-sm"
                      style={{ backgroundColor: ft.symbol.color }}>{idx + 1}</span>
                    <input type="text" dir="rtl" value={ft.label} onChange={e => setFeature(ft.id, { label: e.target.value })}
                      placeholder="تسمية المخالفة (تظهر في المفتاح ولوائح الإحداثيات)"
                      className="bg-transparent border-b border-stone-200 focus:border-emerald-500 outline-none text-sm font-bold text-stone-800 px-1 py-1 min-w-[220px]" />
                  </div>
                  <div className="flex items-center gap-2">
                    {ft.article && <span className="px-2 py-0.5 bg-stone-100 border border-stone-200 text-stone-600 text-[10px] font-bold rounded-full whitespace-nowrap">الفصل {ft.article}</span>}
                    {ft.transaction && (
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full whitespace-nowrap border ${ft.transaction.includes('%') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                        {ft.transaction.includes('%') ? `تصالح ${ft.transaction}` : ft.transaction}
                      </span>
                    )}
                    <button type="button" onClick={() => removeFeature(ft.id)} className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="size-4" /></button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-stone-600">نص المخالفة في المحضر (السطر بعد «تم الترامي عليها بـ»)</label>
                    {!ft.noArea && (
                      <button type="button" onClick={() => injectAreaInDetails(ft)} disabled={!ft.areaM2}
                        className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-40">
                        <Wand2 className="size-3" /> إدراج المساحة المحسوبة مكان «...»
                      </button>
                    )}
                  </div>
                  <textarea rows={2} dir="rtl" value={ft.details} onChange={e => setFeature(ft.id, { details: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none resize-none" />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5 text-right">
                    <label className="text-[11px] font-bold text-stone-600">الرمز على التصميم</label>
                    <select dir="rtl" value={ft.symbol.kind} onChange={e => setFeature(ft.id, { symbol: { ...ft.symbol, kind: e.target.value as PVSymbol['kind'] } })}
                      className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2.5 text-xs outline-none focus:border-emerald-500">
                      {SYMBOL_KINDS.map(k => <option key={k.v} value={k.v}>{k.l}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5 text-right">
                    <label className="text-[11px] font-bold text-stone-600">اللون</label>
                    <input type="color" value={ft.symbol.color} onChange={e => setFeature(ft.id, { symbol: { ...ft.symbol, color: e.target.value } })}
                      className="w-full h-[38px] bg-white border border-stone-200 rounded-lg p-1 cursor-pointer" />
                  </div>
                  {!ft.noArea ? (
                    <div className="space-y-1.5 text-right">
                      <label className="text-[11px] font-bold text-stone-600">المساحة (م²)</label>
                      <input type="number" dir="ltr" value={ft.areaM2 || ''} onChange={e => setFeature(ft.id, { areaM2: toNum(e.target.value) })}
                        placeholder="تلقائي عند الرسم"
                        className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2.5 text-xs font-mono outline-none focus:border-emerald-500" />
                    </div>
                  ) : (
                    <div className="flex items-end">
                      <span className="w-full text-center px-2 py-2.5 bg-stone-50 border border-dashed border-stone-300 rounded-lg text-[10px] text-stone-500 font-bold leading-tight">بدون مساحة — مرتبطة بمخالفات أخرى</span>
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <button type="button" onClick={() => requestParcelPickForFeature(pvNum, ft.id, ft.label || `مخالفة ${idx + 1}`, centerForPick(), contextFor(ft.id))}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-emerald-700 text-white rounded-lg text-xs font-bold hover:bg-emerald-800 transition-colors">
                      <Crosshair className="size-3.5" /> رسم على الخريطة
                    </button>
                    {ft.geojson && (
                      <button type="button" title="عرض على الخريطة" onClick={() => showPVParcelOnMap(ft.geojson, `${pvNum} — ${ft.label}`)}
                        className="p-2.5 bg-white border border-stone-200 text-stone-600 rounded-lg hover:bg-stone-50 transition-colors">
                        <MapPin className="size-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <ToggleChip checked={ft.showOnPlan} onClick={() => setFeature(ft.id, { showOnPlan: !ft.showOnPlan })} label="يظهر على التصميم والمفتاح" />
                  <ToggleChip checked={ft.showCoordsTable} onClick={() => setFeature(ft.id, { showCoordsTable: !ft.showCoordsTable })} label="لائحة إحداثياته في الصفحة 2" />
                  <ToggleChip checked={!!ft.noArea} onClick={() => setFeature(ft.id, { noArea: !ft.noArea })} label="بدون مساحة" />
                  {!ft.noArea && ft.areaM2 > 0 && <span className="text-[11px] text-stone-500 font-mono">≈ {featureAreaText(ft)}</span>}
                </div>

                {/* محرر الإحداثيات اليدوي */}
                <CoordEditor
                  points={ft.coordPoints}
                  onChange={pts => setFeature(ft.id, { coordPoints: pts })}
                  note={ft.geojson ? 'مُلئت تلقائياً من الرسم — يمكن تعديلها' : 'يمكن إدخال الإحداثيات يدوياً (Lambert)'}
                />
              </div>
            ))}
          </div>
        )}

        {/* ══ STEP 6 — الأضرار (مهيكلة حسب النوع بقوالب الجمل الرسمية) ══ */}
        {currentStep === 6 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-lg font-serif italic text-emerald-900 mb-2">تقدير الأضرار</h3>
            <p className="text-xs text-stone-500">اختر نوع الضرر فتظهر خاناته الدقيقة، وتُولَّد الجملة الرسمية تلقائيا مع معاينتها.</p>

            <div className="p-4 bg-white border border-stone-200 rounded-xl shadow-sm">
              <h4 className="text-xs font-bold text-stone-500 mb-3">إضافة ضرر حسب نوعه</h4>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(DAMAGE_KIND_LABELS) as DamageKind[]).map(k => (
                  <button key={k} type="button" onClick={() => addDamage(k)}
                    className="px-3 py-1.5 bg-stone-100 border border-stone-200 text-stone-700 text-xs font-bold rounded-lg hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition-colors">
                    + {DAMAGE_KIND_LABELS[k]}
                  </button>
                ))}
              </div>
            </div>

            {form.degats.length === 0 && (
              <div className="text-center py-8 text-stone-400 text-sm border-2 border-dashed border-stone-200 rounded-xl">لم يُضف أي ضرر بعد</div>
            )}

            {form.degats.map((d, idx) => (
              <div key={d.id} className="p-5 bg-white border border-stone-200 rounded-xl space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-emerald-900">{idx + 1}. {DAMAGE_KIND_LABELS[d.kind]}</h4>
                  <button type="button" onClick={() => removeDamage(d.id)} className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="size-4" /></button>
                </div>

                {d.kind === 'atterb' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <FormInputLight label="الحجم (متر مكعب)" type="number" placeholder="2000" value={d.m3 || ''} onChange={(e: any) => setDamage(d.id, { m3: e.target.value })} />
                    <FormInputLight label="حمولات الشاحنة" type="number" placeholder="67" value={d.trucks || ''} onChange={(e: any) => setDamage(d.id, { trucks: e.target.value })} />
                    <button type="button" onClick={() => setDamage(d.id, { trucks: trucksFromM3(d.m3 || '') })} disabled={!d.m3}
                      className="flex items-center justify-center gap-1.5 px-3 py-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-xl hover:bg-emerald-100 transition-colors disabled:opacity-40">
                      <Wand2 className="size-3.5" /> حساب آلي (÷ 30 م³/شاحنة)
                    </button>
                  </div>
                )}

                {d.kind === 'herbe' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormInputLight label="عدد الحمولات" type="number" placeholder="05" value={d.loads || ''} onChange={(e: any) => setDamage(d.id, { loads: e.target.value })} />
                    <div className="space-y-2 text-right">
                      <label className="text-xs font-bold text-stone-600">نوع الحمولة</label>
                      <select dir="rtl" value={d.loadUnit || LOAD_UNITS[0]} onChange={e => setDamage(d.id, { loadUnit: e.target.value })}
                        className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500 appearance-none shadow-sm">
                        {LOAD_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {d.kind === 'bois' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormInputLight label="الكمية (ستير)" type="number" placeholder="02" value={d.steres || ''} onChange={(e: any) => setDamage(d.id, { steres: e.target.value })} />
                  </div>
                )}

                {d.kind === 'coupe' && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormInputLight label="عدد الأشجار" type="number" placeholder="10" value={d.nbTrees || ''} onChange={(e: any) => setDamage(d.id, { nbTrees: e.target.value })} />
                      <div className="space-y-2 text-right">
                        <label className="text-xs font-bold text-stone-600">النوع</label>
                        <input type="text" dir="rtl" list={`species-${d.id}`} value={d.species || ''} onChange={e => setDamage(d.id, { species: e.target.value })}
                          placeholder="الصنوبر" className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500 shadow-sm" />
                        <datalist id={`species-${d.id}`}>{SPECIES_SUGGESTIONS.map(sp => <option key={sp} value={sp} />)}</datalist>
                      </div>
                      <div className="space-y-2 text-right">
                        <label className="text-xs font-bold text-stone-600">محيط الدائرة على علو متر من سطح الأرض</label>
                        <div className="grid grid-cols-2 gap-2">
                          {([['sup', 'يفوق 2 دسم'], ['inf', 'لا يتجاوز 2 دسم']] as Array<['sup' | 'inf', string]>).map(([v, l]) => (
                            <button key={v} type="button" onClick={() => setDamage(d.id, { girth: v })}
                              className={`px-2 py-3 rounded-xl border text-xs font-bold transition-colors ${d.girth === v ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-white border-stone-200 text-stone-600'}`}>
                              {l}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormInputLight label="معادل عود الصناعة (م³)" type="number" placeholder="30" value={d.m3Industrie || ''} onChange={(e: any) => setDamage(d.id, { m3Industrie: e.target.value })} />
                      <FormInputLight label="معادل عود التدفئة (ستير)" type="number" placeholder="10" value={d.steresChauffe || ''} onChange={(e: any) => setDamage(d.id, { steresChauffe: e.target.value })} />
                    </div>
                  </>
                )}

                {d.kind === 'libre' && (
                  <textarea rows={2} dir="rtl" value={d.text || ''} onChange={e => setDamage(d.id, { text: e.target.value })}
                    placeholder="اكتب جملة الضرر كما ستظهر في المحضر"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl p-3 text-sm outline-none focus:border-emerald-500 resize-none" />
                )}

                <div className="flex items-start justify-between gap-3">
                  <p className="flex-1 text-[11px] text-stone-600 leading-relaxed border-r-2 border-emerald-300 pr-2">
                    <span className="font-bold">معاينة الجملة: </span>{renderDamage(d) || '—'}
                  </p>
                  {d.kind !== 'libre' && (
                    <button type="button" onClick={() => setDamage(d.id, { kind: 'libre', text: renderDamage(d) })}
                      className="flex-shrink-0 px-2.5 py-1.5 bg-stone-100 border border-stone-200 text-stone-600 text-[10px] font-bold rounded-lg hover:bg-stone-200 transition-colors">
                      تحويل لنص حر للتعديل
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ══ STEP 7 — البحث + الحجز + الهوية ══ */}
        {currentStep === 7 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-lg font-serif italic text-emerald-900 mb-6">إجراءات البحث والهوية</h3>

            {/* مسار البحث الاحترافي — ثلاث مراحل مرتبة (تُدرج الفقرات بالترتيب الرسمي) */}
            <div className="p-5 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-5">
              <h4 className="text-sm font-bold text-emerald-900">مسار البحث — فعّل ما تم إنجازه وتُدرج الفقرات في المحضر بترتيبها الرسمي تلقائيا</h4>
              {QUICK_GROUPS.map(gr => (
                <div key={gr.n} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="size-5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">{gr.n}</span>
                    <span className="text-xs font-bold text-emerald-800">{gr.title}</span>
                    <div className="flex-1 h-px bg-emerald-200" />
                  </div>
                  {QUICK_DEFS.filter(q => q.group === gr.n).map(qq => {
                    const st = form.investigationSteps.find(x => x.id === qq.id);
                    return (
                      <div key={qq.id} className="p-3 bg-white border border-stone-200 rounded-xl space-y-3">
                        <label className="flex items-center gap-3 cursor-pointer" onClick={() => toggleQuick(qq.id, qq.type)}>
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${st ? 'bg-emerald-600 border-emerald-600' : 'border-stone-300'}`}>
                            {st && <Check className="size-3 text-white" />}
                          </div>
                          <span className="text-sm font-bold text-stone-700">{qq.q}</span>
                        </label>
                        {st && (
                          <>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              {qq.id === 'q_ouverture' && (
                                <div className="md:col-span-3">
                                  <FormInputLight label="رفقة (اختياري)" type="text" placeholder="أعوان القوة المساعدة والسلطة المحلية"
                                    value={st.text || ''} onChange={(e: any) => setStep(qq.id, { text: e.target.value })} />
                                </div>
                              )}
                              {qq.id === 'q_autorite' && (
                                <>
                                  <div className="space-y-2 text-right">
                                    <label className="text-xs font-bold text-stone-600">الصفة</label>
                                    <select dir="rtl" value={st.agents || ''} onChange={e => setStep(qq.id, { agents: e.target.value })}
                                      className="w-full bg-white border border-stone-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-emerald-500 appearance-none shadow-sm">
                                      <option value="">— الصفة —</option>
                                      {AUTORITE_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                  </div>
                                  <FormInputLight label="الاسم (اختياري)" type="text" placeholder="فلان الفلاني" value={st.name || ''} onChange={(e: any) => setStep(qq.id, { name: e.target.value })} />
                                  <FormInputLight label="التاريخ (اختياري)" type="date" value={st.date || ''} onChange={(e: any) => setStep(qq.id, { date: e.target.value })} />
                                  <div className="md:col-span-3">
                                    <FormInputLight label="التفصيل (اختياري)" type="text" placeholder="تم ربط الاتصال بالمخالف بحضوره" value={st.text || ''} onChange={(e: any) => setStep(qq.id, { text: e.target.value })} />
                                  </div>
                                </>
                              )}
                              {qq.id === 'q_gendarme' && (
                                <>
                                  <FormInputLight label="مركز الدرك (اختياري)" type="text" placeholder="المضيق" value={st.name || ''} onChange={(e: any) => setStep(qq.id, { name: e.target.value })} />
                                  <FormInputLight label="التاريخ (اختياري)" type="date" value={st.date || ''} onChange={(e: any) => setStep(qq.id, { date: e.target.value })} />
                                  <FormInputLight label="التفصيل (اختياري)" type="text" placeholder="تم تعميق الأبحاث في الموضوع" value={st.text || ''} onChange={(e: any) => setStep(qq.id, { text: e.target.value })} />
                                </>
                              )}
                              {qq.id === 'q_dgsn' && (
                                <FormInputLight label="التاريخ" type="date" value={st.date || ''} onChange={(e: any) => setStep(qq.id, { date: e.target.value })} />
                              )}
                              {qq.id === 'q_rencontre' && (
                                <>
                                  <div className="space-y-2 text-right">
                                    <label className="text-xs font-bold text-stone-600">كيف تم التوصل إليه</label>
                                    <select dir="rtl" value={st.agents || ''} onChange={e => setStep(qq.id, { agents: e.target.value })}
                                      className="w-full bg-white border border-stone-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-emerald-500 appearance-none shadow-sm">
                                      <option value="">— اختر —</option>
                                      {ACCES_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                                    </select>
                                  </div>
                                  <FormInputLight label="اسم المخالف / المسمى" type="text" placeholder='"فلان الفلاني"' value={st.name || ''} onChange={(e: any) => setStep(qq.id, { name: e.target.value })} />
                                  <FormInputLight label="جوابه عند الاستفسار" type="text" placeholder="أجاب أنه هو المسؤول عنها" value={st.text || ''} onChange={(e: any) => setStep(qq.id, { text: e.target.value })} />
                                </>
                              )}
                              {qq.id === 'q_decl' && (
                                <>
                                  <div className="flex items-end pb-1">
                                    <ToggleChip checked={st.agents === '1'} onClick={() => setStep(qq.id, { agents: st.agents === '1' ? '' : '1' })} label="إنذاره بالتخلي عن القطعة وإيقاف الأشغال" />
                                  </div>
                                  <div className="md:col-span-2">
                                    <FormInputLight label="تفصيل إضافي (اختياري)" type="text" placeholder="وطلبنا منه الإدلاء بهويته الكاملة" value={st.text || ''} onChange={(e: any) => setStep(qq.id, { text: e.target.value })} />
                                  </div>
                                </>
                              )}
                            </div>
                            <p className="text-[11px] text-stone-500 leading-relaxed border-r-2 border-emerald-300 pr-2">
                              <span className="font-bold text-stone-600">معاينة: </span>{renderInvestigationStep(st)}
                            </p>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* باني خطوات البحث */}
            <div className="p-5 bg-white border border-stone-200 rounded-xl shadow-sm space-y-4">
              <h4 className="text-sm font-bold text-stone-700">خطوات إضافية للبحث — بترتيب وقوعها (كل محضر له ظروفه)</h4>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(INVESTIGATION_STEP_LABELS) as InvestigationStepType[]).map(t => (
                  <button key={t} type="button" onClick={() => addStep(t)}
                    className="px-3 py-1.5 bg-stone-100 border border-stone-200 text-stone-700 text-xs rounded-lg hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition-colors">
                    + {INVESTIGATION_STEP_LABELS[t]}
                  </button>
                ))}
              </div>

              {form.investigationSteps.filter(x => !x.id.startsWith('q_')).map((s, idx) => (
                <div key={s.id} className="p-4 bg-stone-50 border border-stone-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-800">{idx + 1}. {INVESTIGATION_STEP_LABELS[s.type]}</span>
                    <button type="button" onClick={() => removeStep(s.id)} className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="size-3.5" /></button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {['transfert_domicile', 'coordination_surete'].includes(s.type) && (
                      <FormInputLight label="التاريخ" type="date" value={s.date || ''} onChange={(e: any) => setStep(s.id, { date: e.target.value })} />
                    )}
                    {s.type === 'transfert_domicile' && (
                      <div className="md:col-span-2">
                        <FormInputLight label="من انتقل (أسماء الأعوان)" type="text" placeholder="السيدان المعتمد يوسف و طوال محمد" value={s.agents || ''} onChange={(e: any) => setStep(s.id, { agents: e.target.value })} />
                      </div>
                    )}
                    {['rencontre_declaration', 'source_information'].includes(s.type) && (
                      <FormInputLight label="الاسم / المسمى" type="text" placeholder='"أناس المروني"' value={s.name || ''} onChange={(e: any) => setStep(s.id, { name: e.target.value })} />
                    )}
                    {['rencontre_declaration', 'presentation_spontanee', 'source_information', 'libre'].includes(s.type) && (
                      <div className={s.type === 'libre' ? 'md:col-span-3' : 'md:col-span-2'}>
                        <FormInputLight label={s.type === 'libre' ? 'النص الحر' : 'التصريح / التفصيل'} type="text"
                          placeholder={s.type === 'rencontre_declaration' ? 'أجاب أنه هو المسؤول عن تلك القطعة وما بداخلها...' : 'اكتب النص'}
                          value={s.text || ''} onChange={(e: any) => setStep(s.id, { text: e.target.value })} />
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-stone-500 leading-relaxed border-r-2 border-emerald-300 pr-2">
                    <span className="font-bold text-stone-600">معاينة: </span>{renderInvestigationStep(s)}
                  </p>
                </div>
              ))}
              {form.investigationSteps.filter(x => !x.id.startsWith('q_')).length === 0 && (
                <p className="text-xs text-stone-400 text-center py-3">لا خطوات إضافية — تُستعمل أجوبة الأسئلة السريعة أعلاه</p>
              )}
            </div>

            {/* الحجز */}
            <div className="p-5 bg-white border border-stone-200 rounded-xl shadow-sm space-y-4">
              <label className="flex items-center gap-3 cursor-pointer" onClick={() => set('seizureEnabled', !form.seizureEnabled)}>
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${form.seizureEnabled ? 'bg-emerald-600 border-emerald-600' : 'border-stone-300'}`}>
                  {form.seizureEnabled && <Check className="size-3 text-white" />}
                </div>
                <span className="text-sm font-bold text-stone-700">هل تم حجز محجوزات؟ (طيور، آلات، أكياس اسمنت، دراجة...)</span>
              </label>
              {form.seizureEnabled && (
                <div className="space-y-3">
                  {form.seizure.items.map((it, i) => (
                    <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <FormInputLight label="الكمية" type="text" placeholder="06" value={it.qty} onChange={(e: any) => setSeizureItem(i, 'qty', e.target.value)} />
                      <div className="md:col-span-2">
                        <FormInputLight label="المحجوز" type="text" placeholder="طيور من نوع الحسون الذهبي / كيس اسمنت وزنه 45 كلغ" value={it.label} onChange={(e: any) => setSeizureItem(i, 'label', e.target.value)} />
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={() => setSeizure({ items: [...form.seizure.items, { label: '', qty: '' }] })}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-900">+ إضافة محجوز</button>
                  <div className="flex flex-wrap gap-1.5">
                    {SEIZURE_SUGGESTIONS.map(sz => (
                      <button key={sz} type="button" onClick={() => {
                        const items = [...form.seizure.items];
                        const empty = items.findIndex(it => !it.label.trim());
                        if (empty >= 0) items[empty] = { ...items[empty], label: sz };
                        else items.push({ label: sz, qty: '' });
                        setSeizure({ items });
                      }}
                        className="px-2 py-1 bg-stone-100 border border-stone-200 text-stone-600 text-[11px] rounded-lg hover:bg-emerald-50 hover:text-emerald-700 transition-colors">+ {sz}</button>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                    <FormInputLight label="مكان الإيداع" type="text" placeholder="بالمركز الغابوي بريستنكا / بالمحجز الجماعي" value={form.seizure.depotText} onChange={(e: any) => setSeizure({ depotText: e.target.value })} />
                    <FormInputLight label="رقم شهادة الإيداع" type="text" placeholder="0000510" value={form.seizure.certificateNum} onChange={(e: any) => setSeizure({ certificateNum: e.target.value })} />
                    <FormInputLight label="رقم محضر الحجز" type="text" placeholder="عدد 28/2025" value={form.seizure.registreNum} onChange={(e: any) => setSeizure({ registreNum: e.target.value })} />
                  </div>
                </div>
              )}
            </div>

            {/* وضعية الهوية */}
            <div className="p-5 bg-stone-50 border border-stone-200 rounded-xl space-y-4">
              <h4 className="text-sm font-bold text-stone-700">وضعية هوية المخالف — تتحكم في الختم</h4>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { v: 'complete', l: 'هوية كاملة', d: 'حرر وختم بـ...' },
                  { v: 'partial', l: 'هوية جزئية', d: 'حرر بـ... (دون ختم)' },
                  { v: 'unknown', l: 'مجهول الهوية', d: 'حرر بـ... (دون ختم)' },
                ] as Array<{ v: IdentityMode; l: string; d: string }>).map(o => (
                  <button key={o.v} type="button" onClick={() => set('identityMode', o.v)}
                    className={`px-3 py-3 rounded-xl border text-center transition-colors ${
                      form.identityMode === o.v ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-stone-200 hover:bg-stone-50'
                    }`}>
                    <span className={`block text-xs font-bold ${form.identityMode === o.v ? 'text-emerald-800' : 'text-stone-700'}`}>
                      {o.v === 'unknown' ? <UserX className="size-4 inline ml-1" /> : <Stamp className="size-4 inline ml-1" />}{o.l}
                    </span>
                    <span className="block text-[10px] text-stone-400 mt-1 font-mono">{o.d}</span>
                  </button>
                ))}
              </div>
              <div className={`px-4 py-2 rounded-lg text-xs font-bold border ${sealed ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                خاتمة المحضر ستكون: «{sealed ? 'حرر وختم' : 'حرر'} بـ{form.redactionLieu || form.agent1.residence || '............'} في {form.dateRedaction}»
              </div>
            </div>

            {form.identityMode !== 'unknown' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-6 border border-stone-200 rounded-xl shadow-sm">
                  <FormInputLight label="الاسم الشخصي" type="text" placeholder="الاسم الشخصي" value={form.firstName} onChange={(e: any) => set('firstName', e.target.value)} />
                  <FormInputLight label="اسم العائلة" type="text" placeholder="حسب البطاقة الوطنية" value={form.lastName} onChange={(e: any) => set('lastName', e.target.value)} />
                  <div className="md:col-span-2">
                    <FormInputLight label="النسب (من والديه...)" type="text" placeholder="مصطفى بن محمد و عالية بنت محمد" value={form.filiation} onChange={(e: any) => set('filiation', e.target.value)} />
                  </div>
                  <FormInputLight label="اسم الأم" type="text" placeholder="اسم الأم الكامل" value={form.motherName} onChange={(e: any) => set('motherName', e.target.value)} />
                  <FormInputLight label="مكان الازدياد" type="text" placeholder="بتطوان / في هولندا أمستردام" value={form.birthPlace} onChange={(e: any) => set('birthPlace', e.target.value)} />
                  <FormInputLight label="رقم بطاقة التعريف" type="text" placeholder="L489342" value={form.cin} onChange={(e: any) => set('cin', e.target.value)} />
                  <DateSelect label="تاريخ الازدياد" value={form.dob} onChange={iso => set('dob', iso)} />
                  <div className="space-y-2 text-right w-full">
                    <FormInputLight label="المهنة" type="text" placeholder="فلاح / مسير شركة" value={form.profession} onChange={(e: any) => set('profession', e.target.value)} />
                    <div className="flex flex-wrap gap-1.5">
                      {['فلاح', 'بناء', 'تاجر', 'عامل', 'مسير شركة', 'بدون مهنة', 'متقاعد'].map(pr => (
                        <button key={pr} type="button" onClick={() => set('profession', pr)}
                          className="px-2 py-1 bg-stone-100 border border-stone-200 text-stone-600 text-[11px] rounded-lg hover:bg-emerald-50 hover:text-emerald-700 transition-colors">{pr}</button>
                      ))}
                    </div>
                  </div>
                  <FormInputLight label="الأبناء (اختياري)" type="text" placeholder="وله ابناء حسب تصريحه" value={form.enfants} onChange={(e: any) => set('enfants', e.target.value)} />
                </div>
                <div className="p-6 bg-stone-50 border border-stone-200 rounded-xl space-y-6">
                  <div className="space-y-2 text-right">
                    <label className="text-xs font-bold text-stone-600">الحالة العائلية</label>
                    <select dir="rtl" value={form.maritalStatus} onChange={e => set('maritalStatus', e.target.value)} className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-stone-800 outline-none appearance-none shadow-sm">
                      {['أعزب','متزوج','متزوجة','مطلق','مطلقة','أرمل','أرملة'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <FormInputLight label="العنوان الكامل" type="text" placeholder="تجزئة الكولف شارع واجهة البحر ممر 2 رقم 3 ، مرتيل" value={form.address} onChange={(e: any) => set('address', e.target.value)} />
                  <label className="flex items-center gap-3 cursor-pointer p-4 bg-white border border-stone-200 rounded-xl hover:bg-emerald-50 hover:border-emerald-200 transition-colors"
                    onClick={() => set('outsideMaroc', !form.outsideMaroc)}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${form.outsideMaroc ? 'bg-emerald-600 border-emerald-600' : 'border-stone-300'}`}>
                      {form.outsideMaroc && <Check className="size-3 text-white" />}
                    </div>
                    <span className="text-sm font-medium text-stone-700">مقيم خارج التراب الوطني (تطبق إجراءات خاصة)</span>
                  </label>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══ STEP 8 — الإنهاء ══ */}
        {currentStep === 8 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-lg font-serif italic text-emerald-900 mb-6">الوصف القانوني والإنهاء</h3>
            <div className="space-y-3 bg-white p-6 border border-stone-200 rounded-xl shadow-sm">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-stone-700">وصف الجنحة المثبتة (الصياغة القانونية الرسمية)</label>
                <button type="button" onClick={() => set('legalDescription', suggestLegalDescription(form.features) || form.legalDescription)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors">
                  <Wand2 className="size-3.5" /> توليد آلي من المخالفات
                </button>
              </div>
              <textarea rows={4} dir="rtl" value={form.legalDescription} onChange={e => set('legalDescription', e.target.value)}
                placeholder="الرجاء إدخال الوصف..."
                className="w-full bg-stone-50 border border-stone-200 rounded-xl p-4 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-stone-800 outline-none resize-none placeholder:text-stone-400"
              />
              <div className="flex flex-wrap gap-2 mt-3">
                {LEGAL_SUGGESTIONS.map((s, i) => (
                  <button key={i} type="button"
                    onClick={() => set('legalDescription', s)}
                    className="px-3 py-1.5 bg-stone-100 border border-stone-200 text-stone-600 text-xs rounded-lg hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 cursor-pointer transition-colors shadow-sm"
                  >
                    {s.length > 50 ? s.slice(0, 50) + '...' : s}
                  </button>
                ))}
              </div>
              {form.features.length > 0 && suggestLegalArticles(form.features) && (
                <p className="text-[11px] text-stone-500 border-r-2 border-stone-300 pr-2 mt-2">
                  {suggestLegalArticles(form.features)} — للاستئناس داخل الواجهة فقط، لا يُدرج في المحضر.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-6 border border-stone-200 rounded-xl shadow-sm">
              <FormInputLight label="المحكمة المختصة" type="text" placeholder="تطوان" value={form.tribunal} onChange={(e: any) => set('tribunal', e.target.value)} />
              <FormInputLight label="المديرية الإقليمية" type="text" value={form.direction} onChange={(e: any) => set('direction', e.target.value)} />
            </div>

            {form.parcelOverlap && (
              <label className="flex items-center gap-3 cursor-pointer p-4 bg-stone-50 border border-stone-200 rounded-xl" onClick={() => set('includeOverlapLine', !form.includeOverlapLine)}>
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${form.includeOverlapLine ? 'bg-emerald-600 border-emerald-600' : 'border-stone-300'}`}>
                  {form.includeOverlapLine && <Check className="size-3 text-white" />}
                </div>
                <span className="text-sm font-medium text-stone-700">إدراج سطر نسبة التداخل مع الملك الغابوي داخل نص المحضر (معلومة داخلية — اختياري)</span>
              </label>
            )}

            {/* Recap */}
            <div className="p-6 bg-stone-50 border border-stone-200 rounded-xl">
              <h4 className="text-sm font-bold text-stone-700 mb-4">ملخص المحضر</h4>
              <div className="space-y-2 text-sm">
                <SummaryRow label="رقم المحضر" value={pvNum} />
                <SummaryRow label="تاريخ المعاينة" value={form.dateConstat} />
                <SummaryRow label="تاريخ التحرير" value={form.dateRedaction} />
                <SummaryRow label="الغابة / القسم" value={`${form.foret} / ${form.canton}`} />
                <SummaryRow label="المحرر الأول" value={form.agent1.nom} />
                <SummaryRow label="المخالف" value={form.identityMode === 'unknown' ? 'مجهول الهوية' : `${form.firstName} ${form.lastName}`} />
                <SummaryRow label="عدد المخالفات" value={`${form.features.length}`} />
                <SummaryRow label="خطوات البحث" value={`${form.investigationSteps.length}`} />
                <SummaryRow label="الخاتمة" value={sealed ? 'حرر وختم' : 'حرر (دون ختم)'} />
              </div>
            </div>

            {saveError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{saveError}</div>
            )}

            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <button type="button" onClick={handleSaveOnly} disabled={saving}
                className="flex-1 py-4 bg-white text-emerald-700 border border-emerald-200 shadow-sm rounded-xl font-bold hover:bg-emerald-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Check className="size-5" /> {saving ? 'جاري الحفظ...' : (isEdit ? 'حفظ التعديلات' : 'حفظ في النظام')}
              </button>
              <button type="button" onClick={handlePreviewHtml} disabled={saving}
                className="flex-1 py-4 bg-white text-stone-700 border border-stone-200 shadow-sm rounded-xl font-bold hover:bg-stone-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Eye className="size-5" /> معاينة HTML
              </button>
              <button type="button" onClick={handlePreviewPdf} disabled={saving}
                className="flex-1 py-4 bg-white text-red-700 border border-red-200 shadow-sm rounded-xl font-bold hover:bg-red-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Printer className="size-5" /> معاينة / تحميل PDF
              </button>
              <button type="button" onClick={handleSaveAndGenerate} disabled={saving}
                className="flex-1 py-4 bg-emerald-800 text-white rounded-xl font-bold shadow-md shadow-emerald-900/10 hover:bg-emerald-900 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <FileCode2 className="size-5" /> {saving ? 'جاري...' : 'حفظ + تصدير DOCX'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer Navigation */}
      <div className="p-6 border-t border-stone-100 bg-stone-50/50 flex flex-wrap items-center justify-between gap-4 rounded-b-2xl">
        <button type="button" onClick={handlePrev} disabled={currentStep === 1}
          className="px-6 py-2.5 border border-stone-200 bg-white text-stone-600 rounded-xl font-bold flex items-center gap-2 hover:bg-stone-50 transition-colors disabled:opacity-50 disabled:pointer-events-none text-sm shadow-sm"
        >
          السابق <ChevronLeft className="size-4" />
        </button>
        <span className="text-stone-500 font-mono font-bold text-sm bg-white px-4 py-1.5 rounded-lg border border-stone-200 shadow-sm">
          {currentStep} / {totalSteps}
        </span>
        {currentStep < totalSteps ? (
          <button type="button" onClick={handleNext}
            className="px-8 py-2.5 bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-800 transition-colors shadow-md shadow-emerald-900/10 text-sm"
          >
            التالي <ChevronLeft className="size-4 rotate-180" />
          </button>
        ) : (
          <div className="hidden sm:block w-[110px]"></div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════

/** لوحة كتالوج الجنح الغابوية: بحث + تصنيف + إضافة بنقرة، مع بيان التصالح. */
function CatalogPanel({ onAdd }: { onAdd: (it: InfractionCatalogItem) => void }) {
  const [open, setOpen] = useState(true);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const items = useMemo(() => INFRACTION_CATALOG.filter(it =>
    (cat === 'all' || it.category === cat) &&
    (!q.trim() || `${it.label} ${it.article} ${it.details}`.includes(q.trim()))
  ), [q, cat]);
  return (
    <div className="bg-white border border-emerald-200 rounded-xl shadow-sm overflow-hidden">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-emerald-50/70 hover:bg-emerald-50 transition-colors">
        <span className="text-sm font-bold text-emerald-900 flex items-center gap-2"><Scale className="size-4" /> كتالوج الجنح الغابوية — ظهير 10/10/1917 والدورية 4787</span>
        <ChevronLeft className={`size-4 text-emerald-700 transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
      </button>
      {open && (
        <div className="p-4 space-y-3">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 leading-relaxed">{TRANSACTION_RULES_NOTE}</div>
          <div className="flex flex-col md:flex-row gap-2">
            <input type="text" dir="rtl" value={q} onChange={e => setQ(e.target.value)} placeholder="ابحث: تعشيب، رعي، فلين، 34 ..."
              className="flex-1 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500" />
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setCat('all')}
                className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg border transition-colors ${cat === 'all' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'}`}>الكل</button>
              {CATALOG_CATEGORIES.map(c => (
                <button key={c} type="button" onClick={() => setCat(c)}
                  className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg border transition-colors ${cat === c ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'}`}>{c}</button>
              ))}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-stone-100 border border-stone-100 rounded-lg">
            {items.map(it => (
              <div key={it.id} className="flex items-start justify-between gap-3 p-3 hover:bg-stone-50/70 transition-colors">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-stone-800">{it.label}</span>
                    <span className="px-2 py-0.5 bg-stone-100 border border-stone-200 text-stone-600 text-[10px] font-bold rounded-full">الفصل {it.article}</span>
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${it.transactionable ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                      {it.transactionable ? `تصالح ${it.transaction}` : 'غير قابلة للتصالح'}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-500 mt-1">الغرامة: {it.fine}{it.prison !== '—' ? ` ؛ الحبس: ${it.prison}` : ''}{it.extra !== '—' ? ` ؛ ${it.extra}` : ''}</p>
                </div>
                <button type="button" onClick={() => onAdd(it)}
                  className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 bg-emerald-700 text-white text-xs font-bold rounded-lg hover:bg-emerald-800 transition-colors">
                  <Plus className="size-3.5" /> إضافة
                </button>
              </div>
            ))}
            {items.length === 0 && <p className="text-center text-xs text-stone-400 py-6">لا نتائج مطابقة</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleChip({ checked, onClick, label }: { checked: boolean; onClick: () => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer" onClick={onClick}>
      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${checked ? 'bg-emerald-600 border-emerald-600' : 'border-stone-300'}`}>
        {checked && <Check className="size-2.5 text-white" />}
      </div>
      <span className="text-[11px] font-bold text-stone-600">{label}</span>
    </label>
  );
}

/** Éditeur de coordonnées Lambert (par entité) : lignes num/X/Y éditables. */
function CoordEditor({ points, onChange, note }: {
  points: Array<{ num: number; x: string; y: string }>;
  onChange: (pts: Array<{ num: number; x: string; y: string }>) => void;
  note: string;
}) {
  const [open, setOpen] = useState(false);
  const setPt = (i: number, field: 'x' | 'y', val: string) =>
    onChange(points.map((p, j) => j === i ? { ...p, [field]: val } : p));
  const addPt = () => onChange([...points, { num: points.length + 1, x: '', y: '' }]);
  const removePt = (i: number) => onChange(points.filter((_, j) => j !== i).map((p, j) => ({ ...p, num: j + 1 })));

  return (
    <div className="border border-stone-200 rounded-xl overflow-hidden">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-stone-50 text-xs font-bold text-stone-600 hover:bg-stone-100 transition-colors">
        <span>لائحة الإحداثيات ({points.length} نقطة) — {note}</span>
        <ChevronLeft className={`size-4 transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
      </button>
      {open && (
        <div className="p-3 space-y-2 bg-white max-h-64 overflow-y-auto">
          {points.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-8 text-center text-[11px] font-mono font-bold text-stone-500">{p.num}</span>
              <input type="text" dir="ltr" value={p.x} onChange={e => setPt(i, 'x', e.target.value)} placeholder="X"
                className="flex-1 bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-xs font-mono outline-none focus:border-emerald-500" />
              <input type="text" dir="ltr" value={p.y} onChange={e => setPt(i, 'y', e.target.value)} placeholder="Y"
                className="flex-1 bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-xs font-mono outline-none focus:border-emerald-500" />
              <button type="button" onClick={() => removePt(i)} className="p-1.5 text-stone-300 hover:text-red-600 transition-colors"><X className="size-3.5" /></button>
            </div>
          ))}
          <button type="button" onClick={addPt} className="flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-900 pt-1">
            <Plus className="size-3.5" /> إضافة نقطة
          </button>
        </div>
      )}
    </div>
  );
}

function ParcelStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-stone-200 rounded-lg px-3 py-2 text-center shadow-sm">
      <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mb-0.5">{label}</p>
      <p className="text-sm font-mono font-bold text-stone-800">{value}</p>
    </div>
  );
}

// Rapport de chevauchement (DOCX) depuis la parcelle capturée.
function exportOverlapReport(form: PVFormData, pvNum: string) {
  if (!form.parcelOverlap || !form.parcelGeojson) return;
  const ov = form.parcelOverlap;
  const importedArea = form.parcelAreaM2 || 0;
  const insideArea = ov.totalIntersectionArea || 0;
  exportChevauchementDocx({
    layerName: `قطعة المحضر ${pvNum}`.replace(/\/+$/, ''),
    globalPosition: ov.globalPosition,
    totalPercentage: ov.totalPercentage,
    importedArea,
    insideArea,
    outsideArea: Math.max(0, importedArea - insideArea),
    totalIntersectionArea: insideArea,
    hits: ov.hits,
  });
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-stone-100 last:border-0">
      <span className="text-stone-500 font-medium">{label}</span>
      <span className="text-stone-800 font-mono font-medium">{value || '—'}</span>
    </div>
  );
}



/** قائمة منسدلة موحدة الشكل (نفس مظهر FormInputLight). */
function SelectLight({ label, value, onChange, options, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  options: string[]; placeholder?: string;
}) {
  return (
    <div className="space-y-2 text-right w-full">
      <label className="text-xs font-bold text-stone-600">{label}</label>
      <select dir="rtl" value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-white border border-stone-200 rounded-xl px-3 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-stone-800 outline-none appearance-none shadow-sm text-center font-mono">
        <option value="">{placeholder || '—'}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

/** مركّب الساعة الرسمي: [الساعة] ثم [الكسر] ثم [الفترة] → « الثالثة والنصف زوالا »
 *  مع خانة حرة متزامنة للتدقيق اليدوي. */
function HeureComposer({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [h, setH] = useState('');
  const [f, setF] = useState('');
  const [pr, setPr] = useState('زوالا');
  const emit = (hh: string, ff: string, pp: string) => {
    if (hh && pp) onChange(`${hh}${ff ? ' ' + ff : ''} ${pp}`);
  };
  const cls = 'w-full bg-white border border-stone-200 rounded-xl px-2 py-3 text-sm outline-none focus:border-emerald-500 appearance-none shadow-sm text-center';
  return (
    <div className="space-y-2 text-right w-full">
      <label className="text-xs font-bold text-stone-600">الساعة (تُكتب نصا في المحضر)</label>
      <div className="grid grid-cols-3 gap-2" dir="rtl">
        <select dir="rtl" className={cls} value={h} onChange={e => { setH(e.target.value); emit(e.target.value, f, pr); }}>
          <option value="">الساعة</option>
          {HOUR_WORDS.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        <select dir="rtl" className={cls} value={f} onChange={e => { setF(e.target.value); emit(h, e.target.value, pr); }}>
          {HOUR_FRACTIONS.map(fr => <option key={fr || 'exact'} value={fr}>{fr || 'تماما'}</option>)}
        </select>
        <select dir="rtl" className={cls} value={pr} onChange={e => { setPr(e.target.value); emit(h, f, e.target.value); }}>
          {HOUR_PERIODS.map(pp => <option key={pp} value={pp}>{pp}</option>)}
        </select>
      </div>
      <input type="text" dir="rtl" value={value} onChange={e => onChange(e.target.value)}
        placeholder="الثالثة زوالا"
        className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-500" />
    </div>
  );
}

/** منتقي تاريخ ثلاثي (سنة تنازلية من الحاضر إلى 1930 ، ثم الشهر ، ثم اليوم) —
 *  أسرع بكثير من input type=date لمواليد الأربعينات والخمسينات.
 *  يقرأ/يكتب ISO yyyy-mm-dd ويضبط اليوم تلقائيا على حدود الشهر المختار. */
function DateSelect({ label, value, onChange, fromYear = 1930 }: {
  label: string; value: string; onChange: (iso: string) => void; fromYear?: number;
}) {
  const parse = (v: string) => {
    const [a, b, c] = (v || '').split('-').map(n => parseInt(n, 10));
    return { y: a || 0, m: b || 0, d: c || 0 };
  };
  const [st, setSt] = useState(parse(value));
  useEffect(() => { setSt(parse(value)); }, [value]);

  const nowY = new Date().getFullYear();
  const years: number[] = []; for (let yy = nowY; yy >= fromYear; yy--) years.push(yy);
  const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'ماي', 'يونيو', 'يوليوز', 'غشت', 'شتنبر', 'أكتوبر', 'نونبر', 'دجنبر'];
  const maxDay = st.y && st.m ? new Date(st.y, st.m, 0).getDate() : 31;

  const upd = (patch: Partial<{ y: number; m: number; d: number }>) => {
    const n = { ...st, ...patch };
    if (n.y && n.m) { const mx = new Date(n.y, n.m, 0).getDate(); if (n.d > mx) n.d = mx; }
    setSt(n);
    if (n.y && n.m && n.d) onChange(`${n.y}-${String(n.m).padStart(2, '0')}-${String(n.d).padStart(2, '0')}`);
  };

  const cls = 'w-full bg-white border border-stone-200 rounded-xl px-2 py-3 text-sm outline-none focus:border-emerald-500 appearance-none shadow-sm text-center';
  return (
    <div className="space-y-2 text-right w-full">
      <label className="text-xs font-bold text-stone-600">{label}</label>
      <div className="grid grid-cols-3 gap-2" dir="rtl">
        <select dir="rtl" className={cls} value={st.y || ''} onChange={e => upd({ y: parseInt(e.target.value, 10) || 0 })}>
          <option value="">السنة</option>
          {years.map(yy => <option key={yy} value={yy}>{yy}</option>)}
        </select>
        <select dir="rtl" className={cls} value={st.m || ''} onChange={e => upd({ m: parseInt(e.target.value, 10) || 0 })}>
          <option value="">الشهر</option>
          {months.map((mn, i) => <option key={mn} value={i + 1}>{mn}</option>)}
        </select>
        <select dir="rtl" className={cls} value={st.d || ''} onChange={e => upd({ d: parseInt(e.target.value, 10) || 0 })}>
          <option value="">اليوم</option>
          {Array.from({ length: maxDay }, (_, i) => i + 1).map(dd => <option key={dd} value={dd}>{dd}</option>)}
        </select>
      </div>
    </div>
  );
}

function FormInputLight({ label, type, placeholder, disabled, value, onChange }: any) {
  return (
    <div className="space-y-2 text-right w-full">
      <label className="text-xs font-bold text-stone-600">{label}</label>
      <input
        type={type}
        dir="rtl"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-stone-800 outline-none shadow-sm placeholder:text-stone-300 ${type === 'date' || type === 'time' ? 'font-mono text-left block' : ''}`}
      />
    </div>
  );
}

function KPICard({ title, value, trend, type, icon: Icon }: any) {
  const styles: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    orange: 'bg-orange-50 text-orange-700 border-orange-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    stone: 'bg-stone-50 text-stone-700 border-stone-200',
  };
  const s = styles[type] || styles.stone;
  return (
    <div className="bg-white border border-stone-200 p-3 md:p-5 rounded-xl md:rounded-2xl shadow-sm relative overflow-hidden group">
      <div className={`absolute -right-4 -top-4 size-12 md:size-16 rounded-full opacity-20 transition-all group-hover:scale-150 ${s.split(' ')[0]}`}></div>
      <div className="flex items-center justify-between mb-2 md:mb-4 relative z-10">
        <div className={`p-1.5 md:p-2 rounded-lg border ${s}`}><Icon className="size-4 md:size-5" /></div>
        <span className="text-[9px] md:text-[10px] font-bold text-stone-400 uppercase tracking-widest">{trend}</span>
      </div>
      <div className="relative z-10">
        <p className="text-[9px] md:text-[11px] font-bold text-stone-400 uppercase md:tracking-widest mb-0 md:mb-1">{title}</p>
        <p className="text-xl md:text-3xl font-serif text-emerald-900">{value}</p>
      </div>
    </div>
  );
}