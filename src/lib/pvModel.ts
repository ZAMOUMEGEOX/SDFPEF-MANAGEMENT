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
  // — métadonnées légales (catalogue Dahir 10/10/1917 + circulaire 4787) —
  article?: string              // « 34 » / « 46-47-55 »
  transaction?: string          // « 60% بعد إخلاء المكان » / « غير قابلة للتصالح »
  catalogId?: string
}

export type InvestigationStepType =
  | 'transfert_domicile'    // انتقال إلى محل السكن بعد إخبارية
  | 'rencontre_declaration' // التقاء بالمخالف + تصريحه
  | 'presentation_spontanee'// تقدم المعني من تلقاء نفسه بعين المكان
  | 'coordination_surete'   // التنسيق مع مصالح الأمن للهوية الكاملة
  | 'coordination_autorite' // التنسيق مع السلطة المحلية (قائد/شيخ/مقدم)
  | 'avertissement'         // التصريح للمخالف بالمخالفة وإنذاره
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

/** ضرر واحد = جملة نهائية تُطبع كما هي (تُولَّد من الحقول المهيكلة في الواجهة). */
export interface PVDamage { text: string }

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
  degats: PVDamage[]          // كل ضرر جملة نهائية جاهزة (انظر مولّدات الجمل أدناه)

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
  { label: 'الرعي', symbol: { kind: 'dots', color: '#a16207' }, details: 'الرعي غير المرخص داخل الملك الغابوي' },
  { label: 'إيقاد النار', symbol: { kind: 'solid', color: '#ef4444' }, details: 'إيقاد النار داخل الملك الغابوي' },
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


// ──────────────────────────────────────────────────────
// 4-ter) CATALOGUE DES INFRACTIONS — ظهير 10/10/1917 + الدورية 4787
//   كل عنصر يحمل: الفصل، الوصف، الغرامة، الحبس، عقوبات أخرى، ومعيار التصالح.
//   يُستعمل في خطوة «المخالفات» لإضافة مخالفة موثقة قانونيا بنقرة واحدة.
// ──────────────────────────────────────────────────────
export interface InfractionCatalogItem {
  id: string
  article: string
  category: string
  label: string
  fine: string
  prison: string
  extra: string
  transaction: string        // « 40% » / « 60% بعد إخلاء المكان » / « غير قابلة للتصالح »
  transactionable: boolean
  details: string            // نص السطر المقترح في المحضر
  symbol: PVSymbol
}

const CAT_EXPLOIT = 'الاستغلال الغابوي'
const CAT_TRAMI = 'النقل والجني والترامي'
const CAT_COUPE = 'قطع الأشجار وإتلافها'
const CAT_LIEGE = 'الفلين والرعي والمطارق'
const CAT_FEU = 'النار والحريق'

export const INFRACTION_CATALOG: InfractionCatalogItem[] = [
  // ── 1) الاستغلال الغابوي (الفصول 11–15) — كلها غير قابلة للتصالح ──
  { id: 'a11', article: '11', category: CAT_EXPLOIT, label: 'تغيير في وضع حصة الاستغلال (زيادة أشجار أو مواد أو محصولات)', fine: 'تساوي الغرامة العادية + تعويض ضعف قيمة المواد', prison: '3 إلى 15 يوما', extra: 'حجز المحصولات لأداء الغرامة والتعويضات', transaction: 'غير قابلة للتصالح', transactionable: false, details: 'تغيير في وضع حصة الاستغلال بزيادة أشجار/مواد غير مشمولة بالصفقة', symbol: { kind: 'hatch', color: '#7c3aed' } },
  { id: 'a12', article: '12', category: CAT_EXPLOIT, label: 'الشروع في الاستغلال بدون ترخيص', fine: 'تفوق الغرامة العادية + تعويض ضعفي قيمة الشجرة حسب ثمن السمسرة', prison: '3 إلى 15 يوما', extra: 'فسخ العقدة مع مصادرة الضمانة', transaction: 'غير قابلة للتصالح', transactionable: false, details: 'الشروع في الاستغلال الغابوي بدون ترخيص', symbol: { kind: 'hatch', color: '#7c3aed' } },
  { id: 'a13', article: '13', category: CAT_EXPLOIT, label: 'استغلال المدخرات أو الأشجار المحتفظ بها', fine: 'حتى 4800 درهم/شجرة (لا تقل عن ضعف قيمة الشجرة حسب ثمن البيع)', prison: '15 يوما إلى 3 أشهر', extra: 'إرجاع الأشجار أو قيمتها ؛ فسخ العقدة مع مصادرة الضمانة', transaction: 'غير قابلة للتصالح', transactionable: false, details: 'استغلال المدخرات أو الأشجار المحتفظ بها', symbol: { kind: 'hatch', color: '#7c3aed' } },
  { id: 'a14', article: '14', category: CAT_EXPLOIT, label: 'عدم احترام بنود دفتر التحملات أو عقد البيع بالتراضي', fine: '400 - 4800 درهم', prison: '—', extra: '—', transaction: 'غير قابلة للتصالح', transactionable: false, details: 'عدم احترام بنود دفتر التحملات العامة والخاصة أو عقد البيع بالتراضي', symbol: { kind: 'hatch', color: '#7c3aed' } },
  { id: 'a15', article: '15', category: CAT_EXPLOIT, label: 'استخراج المنتجات أو التفحيم قبل التعداد أو أداء الثمن', fine: '400 - 4800 درهم + عقوبات الفصلين 32 و36', prison: '—', extra: '—', transaction: 'غير قابلة للتصالح', transactionable: false, details: 'استخراج المنتجات أو التفحيم قبل التعداد أو أداء الثمن خرقا لدفتر التحملات', symbol: { kind: 'hatch', color: '#7c3aed' } },
  // ── 2) النقل والجني والترامي ──
  { id: 'a32', article: '32', category: CAT_TRAMI, label: 'استخراج ونقل مواد غابوية بدون إذن', fine: '10-24 د/حمولة رجل ؛ 20-60 د/بهيمة ؛ 40-120 د/عربة مجرورة ؛ 300-2400 د/سيارة', prison: '5 إلى 8 أيام عند العود', extra: 'مصادرة الوسائل المستعملة ؛ التعويض ضعفين/ثلاثة عند التشديد (عود، ليل، محمية)', transaction: '40%', transactionable: true, details: 'استخراج ونقل مواد غابوية بدون إذن بواسطة ...', symbol: { kind: 'crosshatch', color: '#475569' } },
  { id: 'a33bois', article: '33', category: CAT_TRAMI, label: 'نقل الحطب اليابس لغير ذوي حقوق الانتفاع', fine: '10-240 د/حمولة رجل ؛ 20-360 د/دابة ؛ 40-600 د/عربة مجرورة ؛ 300-4800 د/سيارة', prison: '—', extra: 'إرجاع المواد أو قيمتها + قيمة الخسائر ؛ مصادرة المحصول والوسائل المستعملة', transaction: '70%', transactionable: true, details: 'نقل الحطب اليابس دون صفة الانتفاع بواسطة ...', symbol: { kind: 'crosshatch', color: '#78716c' } },
  { id: 'a33', article: '34', category: CAT_TRAMI, label: 'جني ونقل وبيع وتصدير غلة البلوط بدون ترخيص', fine: 'تطبيق عقوبات الفصول من 32 إلى 36', prison: '5 إلى 8 أيام مع التشديد', extra: 'إرجاع المواد أو قيمتها + قيمة الخسائر ؛ مصادرة المحصول', transaction: '40%', transactionable: true, details: 'جني ونقل غلة البلوط بدون ترخيص خرقا للقرار الوزيري 04/09/1918', symbol: { kind: 'dots', color: '#a16207' } },
  { id: 'a33b', article: '33 مكرر', category: CAT_TRAMI, label: 'جني البلوط من قطعة في طور التخليف', fine: 'نفس عقوبات الفصل 33', prison: '8 أيام إلى شهرين', extra: 'مصادرة المحصول', transaction: '70%', transactionable: true, details: 'جني غلة البلوط من قطعة في طور التخليف', symbol: { kind: 'dots', color: '#a16207' } },
  { id: 'a34l', article: '34', category: CAT_TRAMI, label: 'حرث أو زرع أو غرس داخل الملك الغابوي', fine: '400 - 2400 درهم/هكتار (العود: 1000 - 4800)', prison: '8 أيام إلى شهرين', extra: 'مصادرة الأدوات ؛ إرفاق المحضر بتصميم للقطعة ؛ العود: غير قابلة للتصالح', transaction: '60% بعد إخلاء المكان', transactionable: true, details: 'الحرث/الزرع/الغرس داخل الملك الغابوي على مساحة حوالي ...', symbol: { kind: 'veg', color: '#16a34a' } },
  { id: 'a34t', article: '34', category: CAT_TRAMI, label: 'تعشيب', fine: '1000 - 4800 درهم/هكتار', prison: '8 أيام إلى شهرين', extra: 'مصادرة المحصول والأدوات ؛ العود: غير قابلة للتصالح', transaction: '60% بعد إخلاء المكان', transactionable: true, details: 'التعشيب على مساحة حوالي ... متر مربع', symbol: { kind: 'solid', color: '#a3e635' } },
  { id: 'a34tc', article: '34', category: CAT_TRAMI, label: 'تعشيب متبوع مباشرة بحرث أو زرع أو غرس', fine: '400 - 2400 درهم/هكتار (العود: 1000 - 4800)', prison: '8 أيام إلى شهرين', extra: 'مصادرة الأدوات ؛ العود: غير قابلة للتصالح', transaction: '70% بعد إخلاء المكان', transactionable: true, details: 'التعشيب المتبوع مباشرة بالحرث/الزرع/الغرس على مساحة حوالي ...', symbol: { kind: 'veg', color: '#65a30d' } },
  // ── 3) التواجد المشبوه وقطع الأشجار ──
  { id: 'a35n', article: '35', category: CAT_COUPE, label: 'التواجد ليلا داخل الغابة بآلات قطع الفرشي أو الدباغ', fine: '24 - 240 درهم', prison: '—', extra: 'مصادرة الأدوات', transaction: '30%', transactionable: true, details: 'التواجد ليلا داخل الغابة في غير المسالك المعتادة حاملا آلات قطع', symbol: { kind: 'outline', color: '#0ea5e9' } },
  { id: 'a35r', article: '35', category: CAT_COUPE, label: 'التواجد ليلا أو نهارا بغير المسالك في قطع إعادة التشجير', fine: '24 - 240 درهم', prison: '—', extra: 'مصادرة الأدوات ؛ تعويض المغروسات الضائعة أو مصاريف التثبيت', transaction: '60%', transactionable: true, details: 'التواجد بغير المسالك المعتادة داخل قطع أشغال إعادة التشجير/تثبيت الكثبان', symbol: { kind: 'outline', color: '#0ea5e9' } },
  { id: 'a36c', article: '36', category: CAT_COUPE, label: 'قطع أو قلع أشجار (محيطها فوق 2 دسم)', fine: '12 - 1200 درهم/شجرة (قابلة للرفع لقيمة الشجرة)', prison: '—', extra: 'إرجاع المواد أو قيمتها ؛ التعويض ضعفين/ثلاثة عند التشديد', transaction: '60%', transactionable: true, details: 'قطع/قلع ... شجرة من نوع ...', symbol: { kind: 'crosshatch', color: '#166534' } },
  { id: 'a36b', article: '36', category: CAT_COUPE, label: 'أخذ خشب معد أو منشور أو فحم', fine: '120 - 1200 درهم/ستير أو م³ أو قنطار فحم', prison: '—', extra: 'زيادة على عقوبات الفصل 14 إن اقتضى الحال', transaction: '50%', transactionable: true, details: 'أخذ خشب معد/منشور أو مواد مستخرجة منه بكمية ...', symbol: { kind: 'crosshatch', color: '#166534' } },
  { id: 'a37j', article: '37', category: CAT_COUPE, label: 'قطع أشجار مغروسة عمرها 10 سنوات فأقل', fine: '12 - 1200 درهم/شجرة', prison: '6 أيام إلى شهرين', extra: 'إرجاع المواد أو قيمتها', transaction: '40%', transactionable: true, details: 'قطع ... شجرة مغروسة عمرها أقل من 10 سنوات', symbol: { kind: 'veg', color: '#15803d' } },
  { id: 'a37n', article: '37', category: CAT_COUPE, label: 'قطع أشجار وشتائل طبيعية', fine: '12 - 120 درهم/شجرة', prison: '6 أيام إلى شهرين', extra: 'إرجاع المواد أو قيمتها', transaction: '50%', transactionable: true, details: 'قطع وحمل العود الحي من نوع ... على مساحة حوالي ...', symbol: { kind: 'solid', color: '#a3e635' } },
  { id: 'a37d', article: '37', category: CAT_COUPE, label: 'أضرار بليغة، تقشير، قطع أغصان غليظة', fine: 'نفس عقوبة قطع الأشجار', prison: '6 أيام إلى شهرين', extra: 'إرجاع المواد أو قيمتها', transaction: '50%', transactionable: true, details: 'إلحاق أضرار بليغة بالأشجار (تقشير/قطع أغصان غليظة)', symbol: { kind: 'crosshatch', color: '#166534' } },
  // ── 4) الفلين والرعي والمطارق ──
  { id: 'a38m', article: '38', category: CAT_LIEGE, label: 'استخراج الفلين النمسي والدباغ أو نقلهما أو حيازتهما', fine: '360 - 1200 درهم/قنطار', prison: '8 أيام إلى شهرين عند التشديد', extra: 'حجز المواد والوسائل ؛ العود: أقصى المبالغ', transaction: '50%', transactionable: true, details: 'استخراج/نقل/حيازة الفلين النمسي والدباغ بكمية ...', symbol: { kind: 'dots', color: '#92400e' } },
  { id: 'a38h', article: '38', category: CAT_LIEGE, label: 'استخراج الفلين الحلوفي / كمية أقل من قنطار', fine: '12 - 120 درهم/قنطار (+ الفصل 37 عند إضرار الأشجار)', prison: 'ممكن 8 أيام إلى شهرين', extra: 'حجز المواد والوسائل', transaction: '30%', transactionable: true, details: 'استخراج الفلين الحلوفي بكمية ...', symbol: { kind: 'dots', color: '#92400e' } },
  { id: 'a39', article: '39', category: CAT_LIEGE, label: 'أخذ الفلين الملقى على الأرض', fine: '2.4 - 360 درهم', prison: 'ممكن 8 أيام إلى شهرين', extra: 'حجز المواد والوسائل', transaction: '40%', transactionable: true, details: 'أخذ الفلين الملقى على الأرض بكمية ...', symbol: { kind: 'dots', color: '#92400e' } },
  { id: 'a41a', article: '41', category: CAT_LIEGE, label: 'الرعي نهارا من طرف المنتفعين', fine: '2-9.6 د (غنم/عجل/خنزير) ؛ 4-24 د (بقرة/ماعز/فرس/بغل) ؛ 20-72 د (جمل)', prison: 'عند الاقتضاء 3 إلى 15 يوما للراعي', extra: 'التعويض عن الخسائر', transaction: '40%', transactionable: true, details: 'الرعي غير المرخص بقطيع مكون من ... رأسا', symbol: { kind: 'dots', color: '#a16207' } },
  { id: 'a41b', article: '41', category: CAT_LIEGE, label: 'الرعي من غير المنتفعين أو فوق العدد المسموح', fine: 'ضعف عقوبات الرعي العادية', prison: 'عند الاقتضاء', extra: 'التكرار: غير قابلة للتصالح', transaction: '60%', transactionable: true, details: 'الرعي من طرف غير المنتفعين بقطيع مكون من ... رأسا', symbol: { kind: 'dots', color: '#a16207' } },
  { id: 'a41n', article: '41', category: CAT_LIEGE, label: 'الرعي ليلا أو في مناطق الأشجار الصغيرة', fine: 'أقصى العقوبات مرتين', prison: 'عند الاقتضاء', extra: 'اجتماع ظرفين: أقصى العقوبات 3 مرات (تصالح 70%)', transaction: '50%', transactionable: true, details: 'الرعي ليلا/بمنطقة أشجار صغيرة بقطيع مكون من ... رأسا', symbol: { kind: 'dots', color: '#a16207' } },
  { id: 'a42', article: '42', category: CAT_LIEGE, label: 'رعي زائد من المشتري بالسمسرة أو خارج القسم المحدد', fine: 'عقوبات الفصل 41 (الفقرة الثانية فما يليها)', prison: 'عند الاقتضاء', extra: '—', transaction: '50%', transactionable: true, details: 'رعي عدد زائد من المواشي/خارج القسم الغابوي المحدد', symbol: { kind: 'dots', color: '#a16207' } },
  { id: 'a42m', article: '42', category: CAT_LIEGE, label: 'وضع علامة خاصة للماشية دون إخبار الإدارة', fine: 'عقوبات الفصل 41', prison: '—', extra: '—', transaction: '50%', transactionable: true, details: 'وضع علامة خاصة لماشيته دون إخبار الإدارة', symbol: { kind: 'dots', color: '#a16207' } },
  { id: 'a43c', article: '43', category: CAT_LIEGE, label: 'تقليد المطارق الغابوية أو استعمالها زورا', fine: '—', prison: '6 أشهر إلى سنتين', extra: 'التعويض عن الخسائر', transaction: 'غير قابلة للتصالح', transactionable: false, details: 'تقليد مطارق الإدارة أو استعمال مطارق مقلدة', symbol: { kind: 'outline', color: '#dc2626' } },
  { id: 'a43d', article: '43', category: CAT_LIEGE, label: 'إتلاف علامات المطارق', fine: '—', prison: '3 أشهر إلى سنة', extra: 'التعويض عن الخسائر — ضمن الاستثناءات العامة للتصالح', transaction: 'غير قابلة للتصالح', transactionable: false, details: 'إتلاف علامات المطارق الغابوية', symbol: { kind: 'outline', color: '#dc2626' } },
  // ── 5) النار والحريق ──
  { id: 'a4655', article: '46-47-55', category: CAT_FEU, label: 'استعمال النار خلال فترة المنع (1 يوليوز - 31 أكتوبر)', fine: '240 - 4800 درهم', prison: '6 أيام إلى 3 أشهر (عند نشوب حريق: 3 أشهر إلى عامين)', extra: 'تعويض الخسائر عند الحريق', transaction: 'غير قابلة للتصالح', transactionable: false, details: 'استعمال النار داخل الغابة أو على مسافة تقل عن 200 متر خلال فترة المنع', symbol: { kind: 'solid', color: '#ef4444' } },
  { id: 'a4849', article: '48-49', category: CAT_FEU, label: 'الامتناع عن المشاركة في إخماد حريق رغم التعبئة', fine: '240 - 2400 درهم', prison: '5 أيام إلى 3 أشهر', extra: '—', transaction: 'غير قابلة للتصالح', transactionable: false, details: 'الامتناع دون عذر مقبول عن المشاركة في إخماد حريق الغابة', symbol: { kind: 'solid', color: '#ef4444' } },
  { id: 'a50', article: '50', category: CAT_FEU, label: 'الرعي في مساحة محروقة قبل مرور 6 سنوات', fine: 'عقوبات الفصل 41', prison: '—', extra: '—', transaction: 'غير قابلة للتصالح', transactionable: false, details: 'مزاولة الرعي داخل مساحة أتت عليها النار قبل مرور 6 سنوات', symbol: { kind: 'dots', color: '#ef4444' } },
  { id: 'a52', article: '52', category: CAT_FEU, label: 'معمل نار أو تخزين مواد ملتهبة دون 500 متر', fine: '1200 - 7200 درهم', prison: '—', extra: 'هدم البناء خلال 3 أشهر من صدور الحكم', transaction: 'غير قابلة للتصالح', transactionable: false, details: 'إحداث معمل تستعمل فيه النار/تخزين مواد ملتهبة على مسافة تقل عن 500 متر', symbol: { kind: 'solid', color: '#f97316' } },
  { id: 'a53', article: '53', category: CAT_FEU, label: 'خيمة أو بناء بمواد ملتهبة دون 100 متر', fine: '120 - 1200 درهم', prison: '—', extra: 'هدم ما بني خلال الشهر الموالي للحكم', transaction: '30%', transactionable: true, details: 'نصب خيمة/تشييد بناء بمواد قابلة للاشتعال داخل الغابة أو دون 100 متر', symbol: { kind: 'dots', color: '#f97316' } },
  { id: 'a56', article: '56', category: CAT_FEU, label: 'إيقاد النار عمدا أو محاولة إيقادها', fine: '—', prison: 'الأشغال الشاقة لمدة محدودة', extra: 'أخطر عقوبة — إخبار رئيس المركز فورا', transaction: 'غير قابلة للتصالح', transactionable: false, details: 'إيقاد النار عمدا داخل الغابة', symbol: { kind: 'solid', color: '#b91c1c' } },
]

export const CATALOG_CATEGORIES = [CAT_EXPLOIT, CAT_TRAMI, CAT_COUPE, CAT_LIEGE, CAT_FEU]

/** استثناءات التصالح العامة + الشرط الخاص بالترامي (نص الدورية 4787). */
export const TRANSACTION_RULES_NOTE =
  'لا تصالح في: جرائم العصابات المنظمة ، تقليد/إتلاف المطارق الغابوية ، جنح إيقاد النار ، ومخالفات الاستغلال (الفصول 11-15). ' +
  'الترامي على الملك الغابوي: لا تصالح إلا بعد إفراغ المكان وإدلاء المترامي بتعهد مكتوب مصادق على إمضائه يقر فيه بحق الدولة ويلتزم بالكف عن الاستغلال.'

// ──────────────────────────────────────────────────────
// 4-bis) TYPOLOGIE LÉGALE (Dahir 10/10/1917) → génération du وصف الجنحة
//   Ordre canonique conforme aux modèles officiels et à la typologie du Dahir :
//   استخراج الأتربة → التعشيب → قطع وحمل العود الحي → الغرس → التسييج → الحرث
//   → الرعي → إيقاد النار → البناء
// ──────────────────────────────────────────────────────
interface CanonPart { keys: string[]; part: string; article: string }
const CANON_PARTS: CanonPart[] = [
  { keys: ['صهريج', 'بئر', 'أتربة', 'حفر', 'استخراج'], part: 'استخراج الأتربة', article: 'الفصل 32' },
  { keys: ['تعشيب'], part: 'التعشيب', article: 'الفصل 32' },
  { keys: ['قطع', 'عود'], part: 'قطع وحمل العود الحي', article: 'الفصلان 36 و37' },
  { keys: ['غرس', 'الغرس', 'زيتون', 'أشجار مثمرة'], part: 'الغرس', article: 'الفصل 34' },
  { keys: ['تسييج', 'سور', 'أسلاك'], part: 'التسييج', article: 'الفصل 34' },
  { keys: ['حرث'], part: 'الحرث', article: 'الفصل 34' },
  { keys: ['رعي'], part: 'الرعي', article: 'الفصلان 41 و42' },
  { keys: ['نار', 'حريق', 'إيقاد'], part: 'إيقاد النار', article: 'الفصول 46 إلى 56' },
  { keys: ['منزل', 'بناية', 'براكة', 'حظيرة', 'أعمدة', 'سكن', 'بناء', 'خيمة'], part: 'البناء', article: 'الفصلان 52 و53' },
]

function matchedCanonParts(features: PVFeature[]): CanonPart[] {
  const hay = features.map(f => `${f.label} ${f.details}`).join(' | ')
  return CANON_PARTS.filter(c => c.keys.some(k => hay.includes(k)))
}

/** Génère le وصف الجنحة exactement au format des modèles officiels :
 *  « الترامي على الملك الغابوي باستخراج الأتربة ، الغرس ، التسييج والبناء » */
export function suggestLegalDescription(features: PVFeature[]): string {
  const parts = matchedCanonParts(features).map(c => c.part)
  if (!parts.length) return ''
  if (parts.length === 1) return `الترامي على الملك الغابوي ب${parts[0]}`
  const head = parts.slice(0, -1).join(' ، ')
  const last = parts[parts.length - 1]
  return `الترامي على الملك الغابوي ب${head} و${last}`
}

/** Référence légale ESTIMATIVE (aide interne à l'écran, NE PAS insérer dans le
 *  PV : les modèles officiels ne citent pas les articles dans وصف الجنحة). */
export function suggestLegalArticles(features: PVFeature[]): string {
  const arts: string[] = []
  matchedCanonParts(features).forEach(c => { if (!arts.includes(c.article)) arts.push(c.article) })
  if (!arts.length) return ''
  return `مرجع استرشادي: ${arts.join(' ، ')} من ظهير 10 أكتوبر 1917 (يُتحقق منه قبل الإحالة)`
}


// ──────────────────────────────────────────────────────
// 4-quater) الأضرار المهيكلة — قوالب الجمل الرسمية حسب نوع الضرر
//   (استخراج الأتربة بالشاحنات ، الأعشاب بالحمولات ، حطب التدفئة بالستير ،
//    قطع العود الحي بعدد الأشجار ونوعها ومحيط دائرتها ومعادلات الصناعة/التدفئة)
// ──────────────────────────────────────────────────────
export type DamageKind = 'atterb' | 'herbe' | 'bois' | 'coupe' | 'libre'

export interface DamageDraft {
  id: string
  kind: DamageKind
  // استخراج الأتربة
  m3?: string; trucks?: string
  // الأعشاب الثانوية
  loads?: string; loadUnit?: string     // حمولة دابة / حمولة عربة مجرورة / حمولة إنسان
  // حطب التدفئة
  steres?: string
  // قطع العود الحي
  nbTrees?: string; species?: string; girth?: 'sup' | 'inf'
  m3Industrie?: string; steresChauffe?: string
  // نص حر
  text?: string
}

export const LOAD_UNITS = ['حمولة دابة', 'حمولة عربة مجرورة', 'حمولة إنسان']
export const SPECIES_SUGGESTIONS = ['الصنوبر', 'البلوط الفليني', 'البلوط الأخضر', 'الكاليتوس', 'الأركاسيا', 'العرعار', 'الزيتون البري']
export const TRUCK_M3 = 30 // متر مكعب لكل حمولة شاحنة (قلابة معيارية)

/** حساب آلي لعدد حمولات الشاحنة من الحجم بالمتر المكعب. */
export function trucksFromM3(m3: string | number): string {
  const v = typeof m3 === 'number' ? m3 : parseFloat(String(m3).replace(',', '.'))
  if (!Number.isFinite(v) || v <= 0) return ''
  return String(Math.max(1, Math.round(v / TRUCK_M3)))
}

/** يولّد الجملة الرسمية النهائية لضرر مهيكل. */
export function renderDamage(d: DamageDraft): string {
  const dots = '...'
  switch (d.kind) {
    case 'atterb':
      return `${d.m3 || dots} متر مكعب من الأتربة المستخرجة أي ما يعادل حوالي ${d.trucks || trucksFromM3(d.m3 || '') || dots} حمولة شاحنة`
    case 'herbe':
      return `${d.loads || dots} ${d.loadUnit || 'حمولة دابة'} من الأعشاب الثانوية`
    case 'bois':
      return `${d.steres || dots} ستير من حطب التدفئة (أغصان)`
    case 'coupe': {
      const girth = d.girth === 'inf'
        ? 'لا يتجاوز ديسمترين (2 دسم)'
        : 'يفوق ديسمترين (2 دسم)'
      const eqParts: string[] = []
      if (d.m3Industrie) eqParts.push(`${d.m3Industrie} متر مكعب من عود الصناعة`)
      if (d.steresChauffe) eqParts.push(`${d.steresChauffe} ستير من عود التدفئة`)
      const eq = eqParts.length ? ` ، أي ما يعادل حوالي ${eqParts.join(' و ')}` : ''
      return `قطع وحمل ${d.nbTrees || dots} شجرة من نوع ${d.species || dots} ، محيط دائرتها على علو متر واحد من سطح الأرض ${girth}${eq}`
    }
    case 'libre':
      return (d.text || '').trim()
  }
}

export const DAMAGE_KIND_LABELS: Record<DamageKind, string> = {
  atterb: 'أتربة مستخرجة (م³ → حمولات شاحنة)',
  herbe: 'أعشاب ثانوية (حمولات)',
  bois: 'حطب التدفئة (ستير)',
  coupe: 'قطع العود الحي (عدد ، نوع ، محيط ، معادلات)',
  libre: 'نص حر',
}

// ──────────────────────────────────────────────────────
// 4-quinquies) الجنح الأكثر تكرارا بالشمال — إضافة سريعة بأولوية أولى
//   (التعشيب ، الحرث ، قطع العود الحي ، استخراج الأتربة ، البناء بمواد قابلة
//    للاشتعال ، البناء بمواد صلبة ، التسييج)
// ──────────────────────────────────────────────────────
export interface QuickInfraction {
  label: string; details: string; symbol: PVSymbol
  article?: string; transaction?: string; catalogId?: string
}
export const TOP_INFRACTIONS_NORD: QuickInfraction[] = [
  { label: 'التعشيب', details: 'التعشيب على مساحة حوالي ... متر مربع', symbol: { kind: 'solid', color: '#a3e635' }, article: '34', transaction: '60% بعد إخلاء المكان', catalogId: 'a34t' },
  { label: 'الحرث', details: 'الحرث داخل الملك الغابوي على مساحة حوالي ...', symbol: { kind: 'hatch', color: '#b45309' }, article: '34', transaction: '60% بعد إخلاء المكان', catalogId: 'a34l' },
  { label: 'قطع العود الحي', details: 'قطع و حمل العود الحي من نوع ... على مساحة حوالي ... متر مربع', symbol: { kind: 'crosshatch', color: '#166534' }, article: '37', transaction: '50%', catalogId: 'a37n' },
  { label: 'استخراج الأتربة', details: 'حفر و استخراج الأتربة على مساحة حوالي ... متر مربع', symbol: { kind: 'crosshatch', color: '#475569' }, article: '32', transaction: '40%', catalogId: 'a32' },
  { label: 'البناء بمواد قابلة للاشتعال', details: 'تشييد بناء بمواد قابلة للاشتعال على مساحة حوالي ... متر مربع', symbol: { kind: 'dots', color: '#f97316' }, article: '53', transaction: '30%', catalogId: 'a53' },
  { label: 'البناء بمواد صلبة', details: 'تشييد بناية بمواد صلبة و إعداد الأساس بالحفر و استخراج الأتربة على مساحة حوالي ... متر مربع', symbol: { kind: 'solid', color: '#93c5fd' }, article: '32', transaction: '40%' },
  { label: 'التسييج', details: 'التسييج بأعمدة حديدية و أسلاك على نفس المساحة', symbol: { kind: 'outline', color: '#dc2626' }, article: '34', transaction: '60% بعد إخلاء المكان' },
]

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
    case 'coordination_autorite':
      return `وبتنسيق مع السلطة المحلية${s.name ? ' ممثلة في ' + s.name : ''}${s.date ? ' بتاريخ ' + arDateShort(s.date) : ''} ، ${nz(s.text, 'تم ربط الاتصال بالمخالف وإشعاره بضرورة الامتثال')}.`
    case 'avertissement':
      return `${s.text && s.text.trim() ? 'وقد صرحنا للمخالف بموضوع الجنح المنسوبة إليه ، حيث ' + s.text.trim() + ' ، و' : 'ف'}أخبرناه أن ما قام به يعد مخالفا للقوانين الغابوية الجاري بها العمل وأنه سيتم اتخاذ الإجراءات القانونية اللازمة في حقه ، وأمرناه بالتخلي عن القطعة وإيقاف الأشغال بها.`
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
  coordination_autorite: 'التنسيق مع السلطة المحلية',
  avertissement: 'التصريح للمخالف بالمخالفة وإنذاره',
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
    `نشهد انه حوالي الساعة ${nz(inp.heureText)} ، بـ${nz(inp.foret)} ، قسم ${nz(inp.canton)} ` +
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

  // — Dégâts — (جمل نهائية؛ توافق خلفي مع السجلات القديمة {type,quantite,equivalent})
  const damages = inp.degats
    .map((g: any) => g?.text?.trim()
      ? g.text.trim()
      : [g?.quantite, g?.type && `من ${g.type}`, g?.equivalent && `أي ما يعادل حوالي ${g.equivalent}`].filter(Boolean).join(' '))
    .filter((t: string) => t)

  // — Enquête —
  const investigationParas = inp.investigationSteps
    .map(renderInvestigationStep)
    .filter(t => t.trim())

  // — Clôture : حرر / حرر وختم selon complétude de l'identité —
  const sealed = inp.identityMode === 'complete'
  const closingLine = `${sealed ? 'حرر وختم' : 'حرر'} بـ${nz(inp.redactionLieu, 'المضيق')} في ${isoDashed(inp.dateRedaction)}`

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