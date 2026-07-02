// src/lib/pvModel.ts
// ════════════════════════════════════════════════════════════════════════════
// pvModel.ts — Modèle de données + composition narrative ARABE du PV forestier
// (تقرير الجنحة). Source unique de vérité : toute la logique de rédaction est
// ICI (dates en toutes lettres, paragraphes conditionnels, clôture حرر/حرر وختم).
// pvDocx.ts ne fait QUE la mise en page (docx + html) à partir de ce module.
// ════════════════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────
// 1) TYPES — variables réelles observées dans les 5 modèles officiels
// ──────────────────────────────────────────────────────

/** Style de symbole d'une entité sur le plan (page 2). */
export interface PVSymbol {
  kind: 'solid' | 'hatch' | 'crosshatch' | 'dots' | 'veg' | 'outline'
  color: string // hex
}

export interface PVCoordPoint { num: number; x: string; y: string }

/** Une « entité » = une infraction matérialisée sur le terrain (بناية، صهريج، تعشيب…).
 *  Une même parcelle peut porter PLUSIEURS entités, chacune avec sa géométrie,
 *  son symbole sur le plan et sa liste de coordonnées. */
export interface PVFeature {
  id: string
  label: string                 // ex: منزل / صهريج 1 / تعشيب وقطع العود الحي
  details: string               // phrase complète du tiret dans le corps du PV
  symbol: PVSymbol
  geojson: any | null           // Polygon/MultiPolygon WGS84 (dessiné sur la carte)
  coordPoints: PVCoordPoint[]   // Lambert 26191 (dérivés ou saisis à la main)
  areaM2: number                // 0 si inconnu
  showOnPlan: boolean           // apparaît sur le plan + légende
  showCoordsTable: boolean      // sa table de coordonnées apparaît en page 2
}

export type InvestigationStepType =
  | 'transfert_domicile'    // انتقال إلى محل السكن بعد إخبارية
  | 'rencontre_declaration' // التقاء بشخص + تصريحه
  | 'presentation_spontanee'// تقدم المعني من تلقاء نفسه بعين المكان
  | 'coordination_surete'   // التنسيق مع مصالح الأمن للهوية الكاملة
  | 'avertissement'         // إخباره بأن ما قام به مخالف للقوانين الغابوية
  | 'source_information'    // مصدرنا الإخباري أفاد بأن...
  | 'libre'                 // فقرة حرة

export interface InvestigationStep {
  id: string
  type: InvestigationStepType
  date?: string        // ISO
  name?: string        // اسم الشخص الملتقى به / المصدر
  agents?: string      // من انتقل (أسماء)
  text?: string        // التصريح أو النص الحر
}

export interface PVSeizureItem { label: string; qty: string }
export interface PVSeizure {
  items: PVSeizureItem[]
  depotText: string       // مكان الإيداع
  certificateNum: string  // رقم شهادة إثبات الإيداع
  registreNum: string     // رقم محضر الحجز إن وجد
}

export type IdentityMode = 'complete' | 'partial' | 'unknown'
export type ConstatContextType = 'ratissage' | 'patrouille' | 'information' | 'libre'
export type DelimStatus = 'en_cours' | 'definitif' | 'provisoire' | 'libre'

export interface PVAgent { nom: string; grade: string; residence: string }

/** Entrée unique de composition — remplie par le formulaire OU par un
 *  enregistrement sauvegardé. */
export interface PVComposeInput {
  pvNum: string
  indicatif: string
  serie: string
  tribunal: string            // من اختصاص المحكمة ...
  direction: string           // المديرية الإقليمية ... لـ

  dateConstat: string         // ISO — يوم المعاينة (يُكتب بالحروف)
  heureText: string           // « الثالثة زوالا »
  dateRedaction: string       // ISO — يوم التحرير (قد يختلف)
  redactionLieu: string       // حرر (وختم) بـ...

  agents: PVAgent[]
  agentsGradeGroup: string    // « تقنيون للمياه والغابات » (صيغة الجمع في النص)

  foret: string
  canton: string
  delimStatus: DelimStatus
  delimCustom: string
  decreeNum: string
  decreeDate: string          // affichée telle quelle (format modèle 1984/10/09)
  placeName: string
  commune: string
  province: string
  coordX: string              // Lambert — مركز القطعة
  coordY: string

  accompaniment: string       // « رئيس مركز حماية الغابات للمضيق الفنيدق » أو فارغ
  context: { type: ConstatContextType; num?: string; date?: string; text?: string }

  areaM2: number
  ha: string; are: string; ca: string
  areaOverride: string        // نص حر يعوّض صياغة المساحة إن مُلئ

  features: PVFeature[]       // تيرات الترامي
  degats: Array<{ type: string; quantite: string; equivalent: string }>

  investigationSteps: InvestigationStep[]
  seizure: PVSeizure | null

  identityMode: IdentityMode
  identity: {
    prenom: string; nom: string; filiation: string; mere: string
    dob: string; birthPlace: string; cin: string; profession: string
    maritalStatus: string; address: string; outsideMaroc: boolean
    enfants: string           // « متزوج وله ابناء حسب تصريحه »
  }

  legalDescription: string
  overlap: {
    globalPosition: string
    totalPercentage: number
    hits: Array<{ foret: string; foretAr: string; canton: string; percentage: number; intersectionArea: number }>
  } | null
  includeOverlapLine: boolean // سطر التداخل معلومة داخلية — اختياري في المحضر الرسمي
}

// ──────────────────────────────────────────────────────
// 2) DATES & NOMBRES EN TOUTES LETTRES (fidèle aux modèles)
//    « في سنة ألفين وخمسة وعشرين ، في التاسع عشر من شهر ماي »
// ──────────────────────────────────────────────────────
export const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'ماي', 'يونيو', 'يوليوز', 'غشت', 'شتنبر', 'أكتوبر', 'نونبر', 'دجنبر']

const ONES_GEN = ['', 'واحد', 'اثنين', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة']
const TENS_GEN = ['', 'عشرة', 'عشرين', 'ثلاثين', 'أربعين', 'خمسين', 'ستين', 'سبعين', 'ثمانين', 'تسعين']
const TEENS_GEN = ['عشرة', 'أحد عشر', 'اثني عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر']

/** 0–99 en lettres (forme génitive utilisée dans les actes : خمسة وعشرين). */
function twoDigitsWords(n: number): string {
  if (n <= 0) return ''
  if (n < 10) return ONES_GEN[n]
  if (n < 20) return TEENS_GEN[n - 10]
  const t = Math.floor(n / 10), o = n % 10
  return o ? `${ONES_GEN[o]} و${TENS_GEN[t]}` : TENS_GEN[t]
}

/** Année 2000–2099 → « ألفين وخمسة وعشرين ». Hors plage → chiffres. */
export function arYearWords(year: number): string {
  if (year < 2000 || year > 2099) return String(year)
  const rest = year - 2000
  return rest === 0 ? 'ألفين' : `ألفين و${twoDigitsWords(rest)}`
}

const DAY_ORDINALS = [
  '', 'الفاتح', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر',
  'الحادي عشر', 'الثاني عشر', 'الثالث عشر', 'الرابع عشر', 'الخامس عشر', 'السادس عشر', 'السابع عشر',
  'الثامن عشر', 'التاسع عشر', 'العشرين', 'الحادي والعشرين', 'الثاني والعشرين', 'الثالث والعشرين',
  'الرابع والعشرين', 'الخامس والعشرين', 'السادس والعشرين', 'السابع والعشرين', 'الثامن والعشرين',
  'التاسع والعشرين', 'الثلاثين', 'الحادي والثلاثين',
]

/** ISO → phrase d'ouverture « في سنة … ، في … من شهر … ». */
export function arDateSentence(iso: string): string {
  const [y, m, d] = (iso || '').split('-').map(Number)
  if (!y || !m || !d) return 'في سنة ............ ، في ............ من شهر ............'
  return `في سنة ${arYearWords(y)} ، في ${DAY_ORDINALS[d] || d} من شهر ${AR_MONTHS[m - 1] || m}`
}

/** ISO → « 19 ماي 2025 » (usage courant dans le corps). */
export function arDateShort(iso: string): string {
  const [y, m, d] = (iso || '').split('-').map(Number)
  if (!y || !m || !d) return iso || '............'
  return `${d} ${AR_MONTHS[m - 1] || ''} ${y}`
}

/** ISO → « 2025-05-19 » pour la ligne حرر (format des modèles). */
export function isoDashed(iso: string): string {
  return iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : (iso || '............')
}

// ──────────────────────────────────────────────────────
// 3) SURFACE — les modèles alternent hectares (05 هكتار 64 آر 90 سنتيار)
//    et mètres carrés (4448 متر مربع). Auto selon la magnitude, override libre.
// ──────────────────────────────────────────────────────
export function areaSentence(inp: Pick<PVComposeInput, 'areaM2' | 'ha' | 'are' | 'ca' | 'areaOverride'>): string {
  if (inp.areaOverride.trim()) return inp.areaOverride.trim()
  const ha = parseInt(inp.ha || '0', 10) || 0
  const are = parseInt(inp.are || '0', 10) || 0
  const ca = parseInt(inp.ca || '0', 10) || 0
  const m2 = inp.areaM2 || ha * 10000 + are * 100 + ca
  if (m2 > 0 && m2 < 10000 && ha === 0) return `${Math.round(m2)} متر مربع`
  if (ha === 0 && are > 0) return `${String(are).padStart(2, '0')} آر ${String(ca).padStart(2, '0')} سنتيار`
  return `${String(ha).padStart(2, '0')} هكتار ${String(are).padStart(2, '0')} آر ${String(ca).padStart(2, '0')} سنتيار`
}

export function featureAreaText(f: PVFeature): string {
  if (!f.areaM2) return ''
  return f.areaM2 >= 10000
    ? `${(f.areaM2 / 10000).toFixed(2)} هكتار`
    : `${Math.round(f.areaM2)} متر مربع`
}

// ──────────────────────────────────────────────────────
// 4) BIBLIOTHÈQUES DE CHOIX (UI) — dérivées des modèles réels
// ──────────────────────────────────────────────────────
export const HEURE_SUGGESTIONS = [
  'الثامنة صباحا', 'العاشرة صباحا', 'الحادية عشرة صباحا', 'الثانية عشرة زوالا',
  'الواحدة زوالا', 'الثانية زوالا', 'الثالثة زوالا', 'الرابعة مساء', 'الخامسة مساء',
]

export const DELIM_OPTIONS: Array<{ v: DelimStatus; label: string }> = [
  { v: 'en_cours', label: 'في طور التحديد النهائي' },
  { v: 'definitif', label: 'المحددة نهائيا' },
  { v: 'provisoire', label: 'المحددة مؤقتا' },
  { v: 'libre', label: 'صيغة أخرى (نص حر)' },
]

export const FEATURE_PRESETS: Array<{ label: string; symbol: PVSymbol; details: string }> = [
  { label: 'التسييج', symbol: { kind: 'outline', color: '#dc2626' }, details: 'التسييج بأعمدة حديدية و أسلاك و مواد قابلة للاشتعال على نفس المساحة' },
  { label: 'منزل', symbol: { kind: 'hatch', color: '#6b7280' }, details: 'بناية للسكن بمواد صلبة على مساحة حوالي ... متر مربع' },
  { label: 'بناية', symbol: { kind: 'solid', color: '#93c5fd' }, details: 'تشييد بناية بمواد صلبة على مساحة حوالي ... متر مربع' },
  { label: 'صهريج', symbol: { kind: 'crosshatch', color: '#475569' }, details: 'حفر، استخراج الأتربة و إعداد صهريج مائي اصطناعي على مساحة حوالي ... متر مربع' },
  { label: 'بئر', symbol: { kind: 'dots', color: '#16a34a' }, details: 'إعداد بئر بالإحداثيات X: ... Y: ...' },
  { label: 'الغرس', symbol: { kind: 'veg', color: '#16a34a' }, details: 'غرس أشجار مثمرة (زيتون..) على مساحة حوالي ...' },
  { label: 'تعشيب وقطع العود الحي', symbol: { kind: 'solid', color: '#a3e635' }, details: 'التعشيب و قطع و حمل العود الحي من نوع البلوط الفليني على مساحة حوالي ... متر مربع' },
  { label: 'الحرث', symbol: { kind: 'hatch', color: '#b45309' }, details: 'الحرث على مساحة حوالي ...' },
  { label: 'براكة', symbol: { kind: 'dots', color: '#f97316' }, details: 'وضع براكة بمواد قابلة للاشتعال على مساحة حوالي ... متر مربع' },
  { label: 'حظيرة للدجاج', symbol: { kind: 'solid', color: '#f9a8d4' }, details: 'بناية للدجاج مساحتها الإجمالية حوالي ... متر مربع' },
  { label: 'بناية للماشية', symbol: { kind: 'crosshatch', color: '#334155' }, details: 'بناية للماشية بمواد قابلة للاشتعال على مساحة حوالي ... متر مربع' },
  { label: 'أعمدة حديدية غير مسقفة', symbol: { kind: 'solid', color: '#fdba74' }, details: 'تشييد بناية حديدية غير مسقفة على مساحة حوالي ... متر مربع' },
  { label: 'سور اسمنتي', symbol: { kind: 'outline', color: '#7c3aed' }, details: 'بناء سور اسمنتي على طول حوالي ... متر طولي، و كذا باب رئيسي من حديد' },
  { label: 'أخرى', symbol: { kind: 'solid', color: '#0ea5e9' }, details: '' },
]

export const LEGAL_SUGGESTIONS = [
  'الترامي على الملك الغابوي باستخراج الأتربة ، الغرس ، التسييج والبناء',
  'الترامي على الملك الغابوي باستخراج الأتربة ، التعشيب ، قطع وحمل العود الحي ، الغرس والبناء',
  'الترامي على الملك الغابوي باستخراج الأتربة ، التعشيب ، الغرس والبناء بمواد قابلة للاشتعال',
  'الترامي على الملك الغابوي باستخراج الأتربة والبناء',
  'الترامي على الملك الغابوي للدولة بالحرث',
  'قطع وحمل العود الحي داخل الملك الغابوي',
  'صيد وحيازة طيور محمية بواسطة أدوات وآلات ممنوعة داخل محمية وحيازتها والاتجار فيها',
]

/** Génère automatiquement une proposition de وصف الجنحة à partir des entités. */
export function suggestLegalDescription(features: PVFeature[]): string {
  const labels = features.map(f => f.label)
  const parts: string[] = []
  const has = (s: string) => labels.some(l => l.includes(s))
  if (has('صهريج') || has('بئر')) parts.push('استخراج الأتربة')
  if (has('تعشيب')) parts.push('التعشيب')
  if (has('قطع')) parts.push('قطع وحمل العود الحي')
  if (has('الغرس') || has('غرس')) parts.push('الغرس')
  if (has('التسييج') || has('سور')) parts.push('التسييج')
  if (has('حرث')) parts.push('الحرث')
  if (has('منزل') || has('بناية') || has('براكة') || has('حظيرة') || has('أعمدة')) parts.push('البناء')
  if (!parts.length) return ''
  return `الترامي على الملك الغابوي بـ${parts.join(' ، ')}`
}

// ──────────────────────────────────────────────────────
// 5) COMPOSITION DES PARAGRAPHES (le cœur du modèle officiel)
// ──────────────────────────────────────────────────────
const DOTS = '............'
const nz = (s: string | undefined | null, fallback = DOTS) => (s && s.trim() ? s.trim() : fallback)

function delimPhrase(inp: PVComposeInput): string {
  const map: Record<DelimStatus, string> = {
    en_cours: 'في طور التحديد النهائي',
    definitif: 'المحددة نهائيا',
    provisoire: 'المحددة مؤقتا',
    libre: nz(inp.delimCustom, 'في طور التحديد النهائي'),
  }
  return map[inp.delimStatus]
}

function contextPhrase(inp: PVComposeInput): string {
  const c = inp.context
  switch (c.type) {
    case 'ratissage':
      return `في إطار قرار عملية تمشيط للمنطقة الغابوية التابعة لنفوذ قيادة ${nz(inp.commune)}` +
        (c.num ? ` ( عدد ${c.num}${c.date ? ` بتاريخ ${arDateShort(c.date)}` : ''} )` : '')
    case 'patrouille':
      return 'أثناء قيامنا بمهام المراقبة والحراسة'
    case 'information':
      return 'على إثر التوصل بإخبارية في الموضوع'
    case 'libre':
      return nz(c.text, '')
  }
}

/** Rend UNE étape d'enquête en phrase(s) — templates extraits des 5 modèles. */
export function renderInvestigationStep(s: InvestigationStep): string {
  const d = s.date ? arDateShort(s.date) : DOTS
  switch (s.type) {
    case 'transfert_domicile':
      return `فتحنا بحثا من أجل التوصل لهوية المخالف ، بتاريخ ${d} انتقل ${nz(s.agents, 'الأعوان الموقعون أسفله')} إلى محل سكنى المخالف بعد التوصل بإخبارية تفيد ذلك.`
    case 'rencontre_declaration':
      return `حيث التقينا بالمسمى "${nz(s.name)}" ، وعند استفساره حول الجنح السالفة الذكر ${nz(s.text, 'أجاب أنه هو المسؤول عن تلك القطعة وما بداخلها ، دون أن يدلي بهويته الكاملة')}.`
    case 'presentation_spontanee':
      return `تقدم إلينا بعين المكان شخص قدم نفسه على أنه المسؤول عن هذا الترامي ${s.text ? '، حيث ' + s.text : ''} ، فأخبرناه أن ما قام به يعد مخالفا للقوانين الغابوية الجاري بها العمل ، وأنه ستتم متابعته وتحرير تقرير جنحة في حقه ، ثم طلبنا منه الإدلاء بهويته الكاملة.`
    case 'coordination_surete':
      return `بتاريخ ${d} ، وبالتنسيق مع مصالح ولاية أمن تطوان ، تم تزويدنا بالهوية الكاملة للمخالف.`
    case 'avertissement':
      return 'فأخبرناه أن ما قام به يعد مخالفا للقوانين الغابوية الجاري بها العمل وأنه سيتم اتخاذ الإجراءات القانونية اللازمة في حقه ، وأمرناه بالتخلي عن القطعة وإيقاف الأشغال بها.'
    case 'source_information':
      return `قادتنا الأبحاث إلى أن المسؤول عن هذا الترامي هو المدعو "${nz(s.name)}" ${s.text ? '، حيث ' + s.text : ''}.`
    case 'libre':
      return nz(s.text, '')
  }
}

export const INVESTIGATION_STEP_LABELS: Record<InvestigationStepType, string> = {
  transfert_domicile: 'انتقال إلى محل سكنى المخالف (بعد إخبارية)',
  rencontre_declaration: 'الالتقاء بشخص وتصريحه',
  presentation_spontanee: 'تقدم المعني بالأمر من تلقاء نفسه بعين المكان',
  coordination_surete: 'التنسيق مع مصالح الأمن (الهوية الكاملة)',
  avertissement: 'إخباره بالمخالفة وأمره بإيقاف الأشغال',
  source_information: 'مصدر إخباري حدد المسؤول',
  libre: 'فقرة حرة',
}

/** Paragraphe d'identité selon le mode. */
function identityParagraph(inp: PVComposeInput): { text: string; bold: boolean } | null {
  if (inp.identityMode === 'unknown') {
    return {
      text: 'لم يتم التوصل لهوية المخالف رغم الأبحاث المنجزة ، وسنوافيكم بها فور التوصل إليها في تقرير لاحق.',
      bold: false,
    }
  }
  const id = inp.identity
  const fullName = [id.prenom, id.nom].filter(Boolean).join(' ')
  const segs: string[] = []
  segs.push(`هويته الكاملة كالآتي : ${nz(fullName)}`)
  if (id.filiation) segs.push(`من والديه ${id.filiation}`)
  if (id.mere) segs.push(`أمه ${id.mere}`)
  if (id.dob || id.birthPlace) segs.push(`مزداد بتاريخ ${id.dob ? isoDashed(id.dob) : DOTS}${id.birthPlace ? ' بـ' + id.birthPlace : ''}`)
  if (id.maritalStatus) segs.push(id.maritalStatus + (id.enfants ? ` ${id.enfants}` : ''))
  if (id.profession) segs.push(`مهنته ${id.profession}`)
  if (id.cin) segs.push(`بطاقة تعريفه الوطنية عدد ${id.cin}`)
  if (id.address) segs.push(`عنوانه ${id.address}`)
  if (id.outsideMaroc) segs.push('(مقيم خارج التراب الوطني)')
  return { text: segs.join(' ، ') + '.', bold: true }
}

function seizureParagraph(inp: PVComposeInput): string | null {
  const s = inp.seizure
  if (!s || !s.items.some(i => i.label.trim())) return null
  const items = s.items
    .filter(i => i.label.trim())
    .map(i => (i.qty ? `${i.qty} ${i.label}` : i.label))
    .join(' ، ')
  let out = `كما تم حجز ${items}`
  if (s.depotText) out += ` ، وتم إيداعها ${s.depotText}`
  if (s.certificateNum) out += ` مقابل شهادة إثبات الإيداع عدد ${s.certificateNum}`
  if (s.registreNum) out += ` ، وتم تدوينه في محضر الحجز عدد ${s.registreNum}`
  return out + '.'
}

// ── Structure composée finale ──
export interface ComposedPV {
  pvNum: string
  indicatif: string
  serie: string
  title: string
  ministry: string[]
  numBoxL1: string
  numBoxL2: string
  descTitle: string
  legalDescription: string
  midFootnote: string
  bodyParas: Array<{ text: string; bold?: boolean }>
  infractionBullets: string[]
  damagesIntro: string
  damages: string[]
  investigationParas: string[]
  seizurePara: string | null
  identityPara: { text: string; bold: boolean } | null
  closingLine: string           // حرر (وختم) بـ... في ...
  sealed: boolean
  overlapLine: { text: string; color: string } | null
  summonsTitle: string
  summonsLines: string[]
  summonsFootnote: string
  attestation: string
  // Page 2
  planTitle: string
  areaSummaryLines: string[]    // encadré des surfaces (comme modèle 17.02)
  features: PVFeature[]
  parcelCoordPoints: PVCoordPoint[]
  areaText: string
}

const GREEN = '166534', RED = 'DC2626', ORANGE = 'EA580C'
const overlapColor = (pos: string) =>
  pos === 'داخل الملك الغابوي' ? RED : pos === 'جزئيا داخل الملك الغابوي' ? ORANGE : GREEN

export function composePV(inp: PVComposeInput, parcelCoordPoints: PVCoordPoint[]): ComposedPV {
  const agentsNames = inp.agents.filter(a => a.nom).map(a => a.nom).join(' ، ') || DOTS
  const residence = nz(inp.agents[0]?.residence || inp.redactionLieu)
  const areaText = areaSentence(inp)

  // — Paragraphe 1 : ouverture (date en lettres + agents) —
  const intro =
    `${arDateSentence(inp.dateConstat)} ، نحن الموقعون أسفله ${agentsNames} ` +
    `${nz(inp.agentsGradeGroup, 'تقنيون للمياه والغابات')} بمحل اقامتنا بـ${residence} ، المحلفون والحاملون لشعار مهنتنا :`

  // — Paragraphe 2 : témoignage (heure, forêt, canton, délimitation, lieu) —
  const witness =
    `نشهد انه حوالي الساعة ${nz(inp.heureText)} ، بالغابة ${nz(inp.foret)} ، قسم ${nz(inp.canton)} ` +
    `${delimPhrase(inp)} بموجب المرسوم الوزاري عدد ${nz(inp.decreeNum)} المؤرخ في ${nz(inp.decreeDate)} ، ` +
    `بالضبط بالمكان المسمى "${nz(inp.placeName)}" التابع ترابيا لجماعة وقيادة ${nz(inp.commune)} ، ${nz(inp.province)}.`

  // — Paragraphe 3 : constat (accompagnement optionnel + contexte + coords + surface) —
  const ctx = contextPhrase(inp)
  const constat =
    `عاينا${inp.accompaniment ? ' و برفقتنا ' + inp.accompaniment : ''}` +
    `${ctx ? ' ' + ctx : ''} بالمكان ذي الاحداثيات X=${nz(inp.coordX)} Y=${nz(inp.coordY)} ، ` +
    `قطعة غابوية مساحتها الإجمالية حوالي ${areaText} ( انظر التصميم البياني أسفله ) ، تم الترامي عليها بـ :`

  // — Tirets des infractions (les entités portent le texte exact) —
  const bullets = inp.features.filter(f => f.details.trim()).map(f => f.details.trim())

  // — Dégâts —
  const damages = inp.degats
    .filter(g => g.type || g.quantite || g.equivalent)
    .map(g => [g.quantite, g.type && `من ${g.type}`, g.equivalent && `أي ما يعادل حوالي ${g.equivalent}`].filter(Boolean).join(' '))

  // — Enquête —
  const investigationParas = inp.investigationSteps
    .map(renderInvestigationStep)
    .filter(t => t.trim())

  // — Clôture : حرر / حرر وختم selon complétude de l'identité —
  const sealed = inp.identityMode === 'complete'
  const closingLine = `${sealed ? 'حرر وختم' : 'حرر'} بـ${nz(inp.redactionLieu, residence)} في ${isoDashed(inp.dateRedaction)}`

  const overlapLine = inp.includeOverlapLine && inp.overlap
    ? {
        text: `موقع القطعة بالنسبة للملك الغابوي : ${inp.overlap.globalPosition} (نسبة التداخل ${inp.overlap.totalPercentage.toFixed(1)}%)`,
        color: overlapColor(inp.overlap.globalPosition),
      }
    : null

  // — Colonne إعلام واستدعاء (formulaire pré-imprimé du modèle) —
  const summonsLines = [
    'في سنة ألفين و ............ في ............',
    'من شهر ............',
    'بطلب من إدارة المياه و الغابات',
    'و بإقامة دعوى من طرف ............',
    'للمياه و الغابات بمحل إقامته بـ ............',
    'التي اختار محل سكناه بـ ............',
    'أشهد أنا الموقع أسفله ............',
    '............ للمياه و الغابات',
    'الساكن بـ ............ المحلف و الحامل لشعار',
    'مهنتي أني بلغت التقرير من جهة إلى ............ (1)',
    'الساكن بـ ............ و تكلمت في ذلك مع ............',
    '(2) الساكن بـ ............ و تكلمت في ذلك مع ............',
    '(3) الساكن بـ ............ و تكلمت في ذلك مع ............',
    '(4) الساكن بـ ............ و تكلمت في ذلك مع ............',
    '(5) الساكن بـ ............ و تكلمت في ذلك مع ............',
    '(6) الساكن بـ ............ و تكلمت في ذلك مع ............',
    'بورقة استدعاء للحضور بتاريخ ............',
    'على الساعة ............ و الأيام الموالية إن اقتضى الحال أمام المحكمة',
    'في جلسة جنحية بـ ............ للحكم عليه بالعقوبات',
    'التي ينص عليها القانون ، و لكي يكون على علم بذلك فإنني تركت له كما ذكرت أعلاه نسخة من التقرير و من صك هذه المرافعة.',
  ]

  // — Encadré des surfaces (page 2, comme le modèle 17.02.2025) —
  const areaSummaryLines: string[] = [`مساحة القطعة الاجمالية حوالي ${areaText}`]
  inp.features.forEach(f => {
    const a = featureAreaText(f)
    if (a && f.showOnPlan) areaSummaryLines.push(`مساحة ${f.label} حوالي ${a}`)
  })

  return {
    pvNum: inp.pvNum,
    indicatif: nz(inp.indicatif, '8 58'),
    serie: nz(inp.serie, 'السلسلة 8 رقم 2'),
    title: 'تقرير الجنحة',
    ministry: [
      'المملكة المغربية',
      'الوكالة الوطنية للمياه والغابات',
      nz(inp.direction, 'المديرية الإقليمية للوكالة الوطنية للمياه و الغابات لتطوان'),
      `من اختصاص المحكمة ${nz(inp.tribunal, 'تطوان')}`,
    ],
    numBoxL1: 'رقم سجل التقارير',
    numBoxL2: 'صحيفة دفتر تقييد الجنحة',
    descTitle: 'وصف الجنحة المثبتة',
    legalDescription: nz(inp.legalDescription),
    midFootnote:
      '(1)- يبين مكان تحقيق الجنحة بكيفية واضحة. و إذا وقعت مباشرته داخل الغابة فيبين اسمها و اسم الفرع و سن الغابة ' +
      'وكذلك الناحية الإدارية التي وقع فيها التحقيق (الجماعة القروية، القيادة، الدائرة...).',
    bodyParas: [{ text: intro }, { text: witness }, { text: constat }],
    infractionBullets: bullets.length ? bullets : [DOTS],
    damagesIntro: damages.length ? 'و قد قدرنا الأضرار الناجمة عن هذا الترامي بحوالي :' : '',
    damages,
    investigationParas,
    seizurePara: seizureParagraph(inp),
    identityPara: identityParagraph(inp),
    closingLine,
    sealed,
    overlapLine,
    summonsTitle: 'إعـلام و اسـتـدعـاء',
    summonsLines,
    summonsFootnote: '(1)- يبين المكان الذي وقع فيه إعلام : بالمنزل أو ب',
    attestation: 'و بـه الإشهـاد',
    planTitle: `رسم بياني للقطعة المترامى عليها موضوع المحضر عدد ${inp.pvNum}`,
    areaSummaryLines,
    features: inp.features,
    parcelCoordPoints,
    areaText,
  }
}
