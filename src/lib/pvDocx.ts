// src/lib/pvDocx.ts
// توليد محضر ضبط الجنح الغابوية كملف DOCX حقيقي (مطابق للنموذج الرسمي للوكالة الوطنية للمياه والغابات)
// يُنتج ثلاث صفحات: 1) متن المعاينة والهوية  2) إعلام واستدعاء  3) جدول الملتمسات/العقوبات
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  PageBreak,
  VerticalAlign,
} from 'docx'

// ──────────────────────────────────────────────────────
// نموذج البيانات الموحّد للمحضر
// ──────────────────────────────────────────────────────
export interface PVCoordPoint { num: number; x: string; y: string }

export interface PVOverlap {
  globalPosition: string
  totalPercentage: number
  hits: Array<{ foret: string; foretAr: string; canton: string; percentage: number; intersectionArea: number }>
}

export interface PVDocxData {
  pvNum: string
  date: string
  heure: string
  agents: Array<{ nom: string; grade: string; residence: string }>
  foret: string
  canton: string
  decreeNum: string
  decreeDate: string
  placeName: string
  commune: string
  province: string
  coordX: string
  coordY: string
  infractions: string[]
  ha: string
  are: string
  ca: string
  degats: Array<{ type: string; quantite: string; equivalent: string }>
  contrevenantPrenom: string
  contrevenantNom: string
  filiation: string
  motherName: string
  birthPlace: string
  dob: string
  profession: string
  maritalStatus: string
  address: string
  cin: string
  outsideMaroc: boolean
  legalDescription: string
  // ── Ajouts liaison carte (facultatifs) ──
  coordPoints?: PVCoordPoint[]
  overlap?: PVOverlap | null
}

// ──────────────────────────────────────────────────────
// ثوابت التنسيق
// ──────────────────────────────────────────────────────
const FONT = 'Traditional Arabic'
const BASE = 26 // نصف-نقطة => 13pt
const DOT_LINE = '.'.repeat(60)
const GREEN = '166534'
const RED = 'DC2626'
const ORANGE = 'EA580C'

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const
const THIN = { style: BorderStyle.SINGLE, size: 4, color: '000000' } as const
const CELL_BORDERS = { top: THIN, bottom: THIN, left: THIN, right: THIN }

// ──────────────────────────────────────────────────────
// مساعدات النصوص (كلها RTL)
// ──────────────────────────────────────────────────────
const r = (text: string, opts: Partial<{ bold: boolean; size: number; underline: boolean; color: string }> = {}) =>
  new TextRun({
    text: text ?? '',
    rightToLeft: true,
    font: FONT,
    size: opts.size ?? BASE,
    bold: opts.bold ?? false,
    color: opts.color,
    underline: opts.underline ? {} : undefined,
  })

const p = (
  children: TextRun[],
  opts: Partial<{ align: (typeof AlignmentType)[keyof typeof AlignmentType]; spacingAfter: number; spacingBefore: number }> = {}
) =>
  new Paragraph({
    bidirectional: true,
    alignment: opts.align ?? AlignmentType.RIGHT,
    spacing: { after: opts.spacingAfter ?? 120, before: opts.spacingBefore ?? 0, line: 360 },
    children,
  })

const spacer = () => new Paragraph({ children: [r('')], spacing: { after: 80 } })

// خانة معنونة: "التسمية: القيمة ......"
const field = (label: string, value: string, fillDots = true) =>
  p([
    r(label + ' : ', { bold: true }),
    r(value || '', { bold: false }),
    ...(fillDots && !value ? [r(' ' + DOT_LINE)] : []),
  ])

// خلية جدول
const cell = (
  text: string,
  opts: Partial<{ bold: boolean; width: number; shade: boolean; color: string; align: (typeof AlignmentType)[keyof typeof AlignmentType] }> = {}
) =>
  new TableCell({
    width: { size: opts.width ?? 2000, type: WidthType.DXA },
    borders: CELL_BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    shading: opts.shade ? { type: ShadingType.CLEAR, fill: 'E8E8E8', color: 'auto' } : undefined,
    children: [
      new Paragraph({
        bidirectional: true,
        alignment: opts.align ?? AlignmentType.CENTER,
        spacing: { after: 40, before: 40, line: 300 },
        children: [r(text, { bold: opts.bold, color: opts.color })],
      }),
    ],
  })

const overlapColor = (pos: string) =>
  pos === 'داخل الملك الغابوي' ? RED : pos === 'جزئيا داخل الملك الغابوي' ? ORANGE : GREEN

// ──────────────────────────────────────────────────────
// الترويسة الرسمية
// ──────────────────────────────────────────────────────
function header(): Paragraph[] {
  return [
    p([r('المملكة المغربية', { bold: true, size: 24 })], { align: AlignmentType.CENTER, spacingAfter: 40 }),
    p([r('وزارة الفلاحة والصيد البحري والتنمية القروية والمياه والغابات', { size: 22 })], {
      align: AlignmentType.CENTER,
      spacingAfter: 40,
    }),
    p([r('الوكالة الوطنية للمياه والغابات', { bold: true, size: 26 })], {
      align: AlignmentType.CENTER,
      spacingAfter: 40,
    }),
    p([r('المديرية الإقليمية بتطوان', { size: 22 })], { align: AlignmentType.CENTER, spacingAfter: 200 }),
  ]
}

// ──────────────────────────────────────────────────────
// الصفحة 1: متن المحضر
// ──────────────────────────────────────────────────────
function pageBody(d: PVDocxData): (Paragraph | Table)[] {
  const surface = `${d.ha || '0'} هكتار ${d.are || '0'} آر ${d.ca || '0'} سنتيار`
  const contrevenant = [d.contrevenantPrenom, d.contrevenantNom].filter(Boolean).join(' ') || 'مجهول'

  const out: (Paragraph | Table)[] = [
    ...header(),
    p([r('مـحـضـر ضـبـط الـجـنـح الـغـابـويـة', { bold: true, size: 34, underline: true })], {
      align: AlignmentType.CENTER,
      spacingAfter: 120,
    }),
    p([r('رقم : ', { bold: true }), r(d.pvNum, { bold: true, size: 28 })], {
      align: AlignmentType.CENTER,
      spacingAfter: 240,
    }),
  ]

  // فقرة المحررين
  d.agents
    .filter(a => a.nom)
    .forEach((a, i) => {
      out.push(
        p([
          r(i === 0 ? 'نحن ' : 'و نحن '),
          r(a.nom, { bold: true }),
          r('، بصفتنا '),
          r(a.grade, { bold: true }),
          r('، المقيم بـ '),
          r(a.residence, { bold: true }),
          r('، المحلَّف والحامل لشعار مهنتنا،'),
        ])
      )
    })

  out.push(
    p([
      r('بتاريخ '),
      r(d.date, { bold: true }),
      r(' على الساعة '),
      r(d.heure || '............', { bold: true }),
      r('، أثناء قيامنا بمهام المراقبة والحراسة بالملك الغابوي،'),
    ]),
    p([
      r('عاينّا بغابة '),
      r(d.foret, { bold: true }),
      r('، القسم '),
      r(d.canton, { bold: true }),
      r('، المُحدَثة بموجب المرسوم عدد '),
      r(d.decreeNum || '............', { bold: true }),
      r(' بتاريخ '),
      r(d.decreeDate || '............', { bold: true }),
      r('،'),
    ]),
    p([
      r('بالموقع المسمى '),
      r(d.placeName, { bold: true }),
      r('، جماعة '),
      r(d.commune, { bold: true }),
      r('، '),
      r(d.province, { bold: true }),
      r('،'),
    ])
  )

  if (d.coordX || d.coordY) {
    out.push(
      p([
        r('إحداثيات مركز القطعة (Lambert) : ', { bold: true }),
        r(`X = ${d.coordX || '—'}   Y = ${d.coordY || '—'}`),
      ])
    )
  }

  // موقع القطعة بالنسبة للملك الغابوي (من تحليل التداخل)
  if (d.overlap) {
    out.push(
      p([
        r('موقع القطعة بالنسبة للملك الغابوي : ', { bold: true }),
        r(d.overlap.globalPosition, { bold: true, color: overlapColor(d.overlap.globalPosition) }),
        r(`  (نسبة التداخل ${d.overlap.totalPercentage.toFixed(1)}%)`),
      ])
    )
  }

  // الجرائم المعاينة
  out.push(spacer(), p([r('الجرائم المعاينة :', { bold: true, underline: true })]))
  if (d.infractions.length) {
    d.infractions.forEach(inf => out.push(p([r('•  '), r(inf)], { spacingAfter: 60 })))
  } else {
    out.push(p([r(DOT_LINE)]))
  }

  out.push(field('المساحة الإجمالية للقطعة المتضررة', surface, false))

  // جدول الأضرار
  const hasDegats = d.degats.some(g => g.type || g.quantite || g.equivalent)
  if (hasDegats) {
    out.push(spacer(), p([r('تقدير الأضرار :', { bold: true, underline: true })]))
    out.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: [3200, 2900, 2900],
        borders: {
          top: THIN, bottom: THIN, left: THIN, right: THIN,
          insideHorizontal: THIN, insideVertical: THIN,
        },
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              cell('المعادل', { bold: true, width: 3200, shade: true }),
              cell('الكمية', { bold: true, width: 2900, shade: true }),
              cell('نوع الضرر', { bold: true, width: 2900, shade: true }),
            ],
          }),
          ...d.degats
            .filter(g => g.type || g.quantite || g.equivalent)
            .map(g =>
              new TableRow({
                children: [
                  cell(g.equivalent, { width: 3200 }),
                  cell(g.quantite, { width: 2900 }),
                  cell(g.type, { width: 2900 }),
                ],
              })
            ),
        ],
      })
    )
  }

  // هوية المخالف
  out.push(spacer(), p([r('هوية المخالف :', { bold: true, underline: true })]))
  out.push(
    field('السيد(ة)', contrevenant, false),
    field('النسب', d.filiation),
    field('اسم الأم', d.motherName),
    field('مكان وتاريخ الازدياد', [d.birthPlace, d.dob].filter(Boolean).join(' - ')),
    field('المهنة', d.profession),
    field('الحالة العائلية', d.maritalStatus, false),
    field('رقم بطاقة التعريف الوطنية', d.cin),
    field('العنوان', d.address)
  )
  if (d.outsideMaroc) {
    out.push(p([r('◾ المخالف مقيم خارج التراب الوطني (تطبَّق في حقه الإجراءات الخاصة).', { bold: true })]))
  }

  // الوصف القانوني
  out.push(spacer(), p([r('الوصف القانوني للجنحة :', { bold: true, underline: true })]))
  out.push(p([r(d.legalDescription || DOT_LINE)]))

  // التوقيعات
  out.push(
    spacer(),
    spacer(),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: [4500, 4500],
      borders: {
        top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER,
        insideHorizontal: NO_BORDER, insideVertical: NO_BORDER,
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 4500, type: WidthType.DXA },
              borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
              children: [p([r('توقيع المخالف', { bold: true })], { align: AlignmentType.CENTER })],
            }),
            new TableCell({
              width: { size: 4500, type: WidthType.DXA },
              borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
              children: [p([r('توقيع محرر المحضر', { bold: true })], { align: AlignmentType.CENTER })],
            }),
          ],
        }),
      ],
    })
  )

  return out
}

// ──────────────────────────────────────────────────────
// الصفحة 2: إعلام واستدعاء
// ──────────────────────────────────────────────────────
function pageSummons(d: PVDocxData): Paragraph[] {
  const out: Paragraph[] = [
    new Paragraph({ children: [new PageBreak()] }),
    p([r('إعـلام واسـتـدعـاء', { bold: true, size: 32, underline: true })], {
      align: AlignmentType.CENTER,
      spacingAfter: 240,
    }),
    p([
      r('في سنة ألفين و '),
      r('............', { bold: true }),
      r(' من شهر '),
      r('............', { bold: true }),
      r('، بطلب من إدارة المياه والغابات وبإقامة دعوى من طرف المندوبية السامية للمياه والغابات بمحل إقامته بـ '),
      r(d.foret || '............', { bold: true }),
      r('،'),
    ]),
    p([
      r('أشهد أنا الموقع أسفله '),
      r(d.agents[0]?.nom || '............', { bold: true }),
      r('، بصفتي عوناً محلَّفاً وحاملاً لشعار مهنتي، أني بلّغت الاستدعاء إلى :'),
    ]),
    spacer(),
    p([
      r('السيد(ة) : ', { bold: true }),
      r([d.contrevenantPrenom, d.contrevenantNom].filter(Boolean).join(' ') || '............', { bold: true }),
    ]),
    field('الساكن بـ', d.address),
    p([
      r('و ذلك للحضور أمام المحكمة الابتدائية بـ '),
      r('............', { bold: true }),
      r(' بتاريخ '),
      r('............', { bold: true }),
      r(' على الساعة '),
      r('............', { bold: true }),
      r('، في جلسة جنحية للحكم عليه بالعقوبات التي ينص عليها القانون.'),
    ]),
    spacer(),
    p([
      r('و لكي يكون على علم بذلك، تركتُ له نسخة من هذا المحضر ومن صك هذه المرافعة.'),
    ]),
    p([r('و بـه الإشـهـاد', { bold: true })], { align: AlignmentType.CENTER, spacingBefore: 240 }),
  ]
  return out
}

// ──────────────────────────────────────────────────────
// الصفحة 3: جدول الملتمسات / العقوبات
// ──────────────────────────────────────────────────────
function pageSanctions(): (Paragraph | Table)[] {
  const cols = ['سجن المديون لقسره على دفع دينه', 'المصادرة', 'التعويضات', 'الإرجاع', 'الذعيرة', 'السجن']
  const w = 1550

  return [
    new Paragraph({ children: [new PageBreak()] }),
    p([
      r('بناءً على التقرير أعلاه، فإن المياه والغابات الممضي أسفله قد قرّرت بكيفية نهائية أن يُطلب من المحكمة أن تُصدر حكمها على المتهم المذكور في هذا التقرير بالعقوبات التالية :'),
    ]),
    spacer(),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: [w, w, w, w, w, w],
      borders: {
        top: THIN, bottom: THIN, left: THIN, right: THIN,
        insideHorizontal: THIN, insideVertical: THIN,
      },
      rows: [
        new TableRow({
          tableHeader: true,
          children: cols.map(c => cell(c, { bold: true, width: w, shade: true })),
        }),
        ...Array.from({ length: 4 }).map(
          () => new TableRow({ children: cols.map(() => cell(' ', { width: w })) })
        ),
      ],
    }),
    spacer(),
    field('و ذلك عملاً بمقتضيات الفصول', ''),
    field('و أن يُحكم عليه فضلاً عن ذلك بأداء النفقات', '', false),
    p([
      r('كما يُطلب من المحكمة بأن تصرّح بأن السيد '),
      r('............', { bold: true }),
      r(' هو المسؤول مدنياً عن الأحكام التي تصدر ضده.'),
    ]),
    spacer(),
    p([
      r('حُرِّر بـ '),
      r('............', { bold: true }),
      r(' بتاريخ '),
      r('............', { bold: true }),
    ], { align: AlignmentType.CENTER, spacingBefore: 240 }),
  ]
}

// ──────────────────────────────────────────────────────
// الصفحة 4 (ملحق): لائحة إحداثيات القطعة المترامى عليها
// ──────────────────────────────────────────────────────
function pageCoordAnnex(d: PVDocxData): (Paragraph | Table)[] {
  const pts = (d.coordPoints || []).filter(pt => pt.x || pt.y)
  if (!pts.length) return []

  const w = 3000
  return [
    new Paragraph({ children: [new PageBreak()] }),
    p([r('ملحق : لائحة إحداثيات القطعة المترامى عليها موضوع المحضر', { bold: true, size: 28, underline: true })], {
      align: AlignmentType.CENTER,
      spacingAfter: 200,
    }),
    p([r('رقم المحضر : ', { bold: true }), r(d.pvNum, { bold: true })], {
      align: AlignmentType.CENTER,
      spacingAfter: 200,
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: [w, w, w],
      borders: {
        top: THIN, bottom: THIN, left: THIN, right: THIN,
        insideHorizontal: THIN, insideVertical: THIN,
      },
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            cell('Y', { bold: true, width: w, shade: true }),
            cell('X', { bold: true, width: w, shade: true }),
            cell('النقطة', { bold: true, width: w, shade: true }),
          ],
        }),
        ...pts.map(pt =>
          new TableRow({
            children: [
              cell(pt.y || '—', { width: w }),
              cell(pt.x || '—', { width: w }),
              cell('B' + pt.num, { width: w, bold: true }),
            ],
          })
        ),
      ],
    }),
    spacer(),
    p([r('المساحة الإجمالية : ', { bold: true }), r(`${d.ha || '0'} هكتار ${d.are || '0'} آر ${d.ca || '0'} سنتيار`)], {
      align: AlignmentType.CENTER,
    }),
    p([r('نظام الإسقاط : Merchich / Nord Maroc (EPSG:26191)', { size: 20, color: '555555' })], {
      align: AlignmentType.CENTER,
    }),
  ]
}

// ──────────────────────────────────────────────────────
// البناء والتنزيل
// ──────────────────────────────────────────────────────
export async function generatePVDocx(d: PVDocxData): Promise<void> {
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: FONT, size: BASE } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4 portrait (DXA)
            margin: { top: 1000, right: 1100, bottom: 1000, left: 1100 },
          },
        },
        children: [
          ...pageBody(d),
          ...pageSummons(d),
          ...pageSanctions(),
          ...pageCoordAnnex(d),
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `PV_${d.pvNum.replace(/\//g, '-') || 'nouveau'}.docx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
