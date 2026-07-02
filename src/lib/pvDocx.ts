// src/lib/pvDocx.ts
// ════════════════════════════════════════════════════════════════════════════
// Génération du « تقرير الجنحة » (PV forestier) FIDÈLE au modèle officiel ANEF :
//   • Page 1 : A4 PAYSAGE, 3 colonnes RTL
//        [ corps du rapport (gauche) | en-tête + description (milieu) | إعلام واستدعاء (droite) ]
//   • Page 2 : dédiée au « التصميم » — liste des coordonnées de la parcelle (+ image si fournie)
//
// Source unique : composePV() construit le CONTENU une seule fois ; deux moteurs
// de rendu le mettent en page à l'identique :
//   - renderDocx()  → vrai .docx (lib docx, RTL natif)  → generatePVDocx()
//   - renderHtml()  → HTML paysage imprimable           → generatePVPdf() (impression navigateur)
// ════════════════════════════════════════════════════════════════════════════
import {
  Document, Packer, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell,
  WidthType, BorderStyle, ShadingType, VerticalAlign, PageOrientation, PageBreak, ImageRun,
} from 'docx'

// ──────────────────────────────────────────────────────
// Types
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
  // ── Champs liaison carte (facultatifs) ──
  coordPoints?: PVCoordPoint[]
  overlap?: PVOverlap | null
  mapImage?: string | null // dataURL (image du plan capturé) — page 2
  // ── Champs narratifs facultatifs (respect du modèle) ──
  indicatif?: string        // « الرقم الاستدلالي » ex : 8 58
  serie?: string            // pied de page ex : السلسلة 8 رقم 2
  patrouilleNum?: string    // n° décision de ratissage/تمشيط
  patrouilleDate?: string   // date de la décision
  chefCentre?: string       // رئيس مركز حماية الغابات ...
  heureText?: string        // ex : الثالثة زوالا
  investigationText?: string// narration de l'enquête (فتحنا بحثا...)
  redactionLieu?: string    // lieu de rédaction (ex : المضيق)
}

// ──────────────────────────────────────────────────────
// Constantes de style
// ──────────────────────────────────────────────────────
const FONT = 'Traditional Arabic'
const A4L = { width: 16838, height: 11906 } // A4 paysage (twips)
const GREEN = '166534'
const RED = 'DC2626'
const ORANGE = 'EA580C'
const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'ماي', 'يونيو', 'يوليوز', 'غشت', 'شتنبر', 'أكتوبر', 'نونبر', 'دجنبر']

const arDate = (iso: string): string => {
  if (!iso) return '............'
  const parts = iso.split('-').map(Number)
  const [y, m, d] = parts
  if (!y || !m || !d) return iso
  return `${d} ${AR_MONTHS[m - 1] || ''} ${y}`
}

const overlapColor = (pos: string) =>
  pos === 'داخل الملك الغابوي' ? RED : pos === 'جزئيا داخل الملك الغابوي' ? ORANGE : GREEN

// Isole le n° PV en LTR pour préserver l'ordre « 08/03/2025/BM » malgré le contexte RTL.
const LRI = '\u2066', PDI = '\u2069'
const ltrPV = (s: string) => `${LRI}${s}${PDI}`

// ══════════════════════════════════════════════════════
// 1) COMPOSITION DU CONTENU (source unique)
// ══════════════════════════════════════════════════════
interface ComposedPV {
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
  infractions: string[]
  damagesIntro: string
  damages: string[]
  redaction: string
  overlapLine: { text: string; color: string } | null
  summonsTitle: string
  summonsLines: string[]
  summonsFootnote: string
  coordPoints: PVCoordPoint[]
  areaText: string
  mapImage?: string | null
}

function composePV(d: PVDocxData): ComposedPV {
  const agentsNames = d.agents.filter(a => a.nom).map(a => a.nom).join(' ، ')
  const residence = d.agents[0]?.residence || d.redactionLieu || '............'
  const areaText = `${d.ha || '0'} هكتار ${d.are || '0'} آر ${d.ca || '0'} سنتيار`
  const contrevenant = [d.contrevenantPrenom, d.contrevenantNom].filter(Boolean).join(' ') || 'مجهول'

  // Corps « تقرير الجنحة »
  const intro =
    `في سنة ${d.date ? d.date.split('-')[0] : 'ألفين و ...'} ، بتاريخ ${arDate(d.date)} ، نحن الموقعون أسفله ` +
    `${agentsNames || '............'} تقنيون للمياه والغابات بمحل اقامتنا بـ${residence} ، المحلفون والحاملون لشعار مهنتنا.`

  const witness =
    `نشهد أنه حوالي الساعة ${d.heureText || d.heure || '............'} ، بغابة ${d.foret || '............'} ، ` +
    `قسم ${d.canton || '............'} في طور التحديد النهائي بموجب المرسوم الوزاري عدد ${d.decreeNum || '02.84.321'} ` +
    `المؤرخ في ${d.decreeDate || '1984/10/09'} ، بالضبط بالمكان المسمى "${d.placeName || '............'}" ` +
    `التابع ترابيا لجماعة وقيادة ${d.commune || '............'} ، ${d.province || 'عمالة تطوان'}.`

  const patrouille =
    `عاينا ${d.chefCentre ? 'و برفقتنا ' + d.chefCentre : 'و برفقتنا رئيس مركز حماية الغابات للمضيق-الفنيدق'} ` +
    `${d.patrouilleNum ? `في إطار قرار عملية تمشيط للمنطقة الغابوية (عدد ${d.patrouilleNum} بتاريخ ${arDate(d.patrouilleDate || '')})` : 'أثناء مهام المراقبة والحراسة'} ` +
    `بالمكان ذي الإحداثيات X=${d.coordX || '............'} Y=${d.coordY || '............'} ، ` +
    `قطعة غابوية مساحتها الإجمالية حوالي ${areaText} (انظر التصميم البياني بالصفحة الموالية) ، تم الترامي عليها بـ :`

  const damagesIntro = 'و قد قدرنا الأضرار الناجمة عن هذا الترامي بحوالي :'
  const damages = d.degats
    .filter(g => g.type || g.quantite || g.equivalent)
    .map(g => [g.quantite, g.type && `من ${g.type}`, g.equivalent && `أي ما يعادل ${g.equivalent}`].filter(Boolean).join(' '))

  const investigation =
    d.investigationText ||
    'فتحنا بحثا من أجل التوصل لهوية المخالف ، وبعد التنسيق مع المصالح المختصة تم تحديد هويته على النحو التالي.'

  const identity =
    `الهوية الكاملة للمخالف هي : ${contrevenant} ${d.filiation || ''}${d.motherName ? ' ومن والدته ' + d.motherName : ''} ، ` +
    `مزداد${d.dob ? ' بتاريخ ' + arDate(d.dob) : ''}${d.birthPlace ? ' بـ' + d.birthPlace : ''} ، ` +
    `رقم بطاقة تعريفه الوطنية ${d.cin || '............'} ، مهنته ${d.profession || '............'} ، ` +
    `حالته العائلية ${d.maritalStatus || '............'} ، عنوانه ${d.address || '............'}` +
    `${d.outsideMaroc ? ' (مقيم خارج التراب الوطني — تطبق في حقه الإجراءات الخاصة)' : ''}.`

  const redaction = `حرر وختم بـ${d.redactionLieu || residence} في ${arDate(d.date)}`

  const bodyParas: Array<{ text: string; bold?: boolean }> = [
    { text: intro },
    { text: witness },
    { text: patrouille },
  ]

  const overlapLine = d.overlap
    ? {
        text: `موقع القطعة بالنسبة للملك الغابوي : ${d.overlap.globalPosition} (نسبة التداخل ${d.overlap.totalPercentage.toFixed(1)}%)`,
        color: overlapColor(d.overlap.globalPosition),
      }
    : null

  // Colonne « إعلام واستدعاء » (formulaire pré-imprimé)
  const summonsLines = [
    'في سنة ألفين و ............ في ............',
    'من شهر ............ بطلب من إدارة المياه و الغابات',
    'و بإقامة دعوى من طرف ............',
    'للمياه و الغابات بمحل إقامته بـ ............',
    'التي اختار محل سكناه بـ ............',
    'أشهد أنا الموقع أسفله ............',
    '............ للمياه و الغابات',
    'الساكن بـ ............ المحلف و الحامل لشعار',
    'مهنتي أني بلغت التقرير من جهة إلى ............ (1)',
    'الساكن بـ ............',
    'و تكلمت في ذلك مع ............ (2)',
    'الساكن بـ ............',
    'و تكلمت في ذلك مع ............ (3)',
    'الساكن بـ ............',
    'و تكلمت في ذلك مع ............ (4)',
    'بورقة استدعاء للحضور بتاريخ ............',
    'على الساعة ............ و الأيام الموالية إن اقتضى الحال أمام المحكمة',
    'في جلسة جنحية بـ ............ للحكم عليه بالعقوبات',
    'التي ينص عليها القانون ، و لكي يكون على علم بذلك تركت له نسخة من التقرير و من صك هذه المرافعة.',
  ]

  return {
    pvNum: d.pvNum,
    indicatif: d.indicatif || '8 58',
    serie: d.serie || 'السلسلة 8 رقم 2',
    title: 'تقرير الجنحة',
    ministry: [
      'المملكة المغربية',
      'الوكالة الوطنية للمياه والغابات',
      'المديرية الإقليمية للوكالة الوطنية للمياه و الغابات لتطوان',
      'من اختصاص المحكمة تطوان',
    ],
    numBoxL1: 'رقم سجل التقارير',
    numBoxL2: 'صحيفة دفتر تقييد الجنحة',
    descTitle: 'وصف الجنحة المثبتة',
    legalDescription: d.legalDescription || '............',
    midFootnote:
      '(1)- يبين مكان تحقيق الجنحة بكيفية واضحة. و إذا وقعت مباشرته داخل الغابة فيبين اسمها و اسم الفرع و سن الغابة ' +
      'وكذلك الناحية الإدارية التي وقع فيها التحقيق (الجماعة القروية، القيادة، الدائرة...).',
    bodyParas,
    infractions: d.infractions.length ? d.infractions : ['............'],
    damagesIntro,
    damages: damages.length ? damages : ['............'],
    redaction: `${investigation}\n${identity}\n${redaction}`,
    overlapLine,
    summonsTitle: 'إعلام و استدعاء',
    summonsLines,
    summonsFootnote: '(1)- يبين المكان الذي وقع فيه إعلام : بالمنزل أو ب',
    coordPoints: (d.coordPoints || []).filter(p => p.x || p.y),
    areaText,
    mapImage: d.mapImage || null,
  }
}

// ══════════════════════════════════════════════════════
// 2) RENDU DOCX (lib docx — paysage, RTL natif)
// ══════════════════════════════════════════════════════
const THIN = { style: BorderStyle.SINGLE, size: 4, color: '000000' } as const
const NO = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const
const CELL_ALL = { top: THIN, bottom: THIN, left: THIN, right: THIN }

const run = (text: string, o: Partial<{ bold: boolean; size: number; underline: boolean; color: string }> = {}) =>
  new TextRun({ text: text ?? '', rightToLeft: true, font: FONT, size: o.size ?? 16, bold: o.bold, color: o.color, underline: o.underline ? {} : undefined })

const par = (children: TextRun[], o: Partial<{ align: any; after: number; before: number; line: number }> = {}) =>
  new Paragraph({ bidirectional: true, alignment: o.align ?? AlignmentType.RIGHT, spacing: { after: o.after ?? 40, before: o.before ?? 0, line: o.line ?? 240 }, children })

const line = (text: string, o: Partial<{ bold: boolean; size: number; align: any; color: string; underline: boolean; after: number }> = {}) =>
  par([run(text, o)], { align: o.align, after: o.after })

function numberBox(c: ComposedPV): Table {
  return new Table({
    visuallyRightToLeft: true,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: THIN, bottom: THIN, left: THIN, right: THIN, insideHorizontal: THIN, insideVertical: THIN },
    rows: [
      new TableRow({
        children: [
          new TableCell({ borders: CELL_ALL, verticalAlign: VerticalAlign.CENTER, children: [line(c.numBoxL2, { size: 14, align: AlignmentType.CENTER })] }),
          new TableCell({ borders: CELL_ALL, verticalAlign: VerticalAlign.CENTER, children: [line(c.numBoxL1, { size: 14, align: AlignmentType.CENTER })] }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ columnSpan: 2, borders: CELL_ALL, verticalAlign: VerticalAlign.CENTER, children: [line(ltrPV(c.pvNum), { bold: true, size: 22, align: AlignmentType.CENTER })] }),
        ],
      }),
    ],
  })
}

function bodyColumn(c: ComposedPV): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [
    new Paragraph({
      bidirectional: true, alignment: AlignmentType.CENTER, spacing: { after: 80 },
      children: [run(c.title, { bold: true, size: 24, underline: true })],
    }),
  ]
  c.bodyParas.forEach(p => out.push(line(p.text, { bold: p.bold, size: 16, align: AlignmentType.BOTH })))
  c.infractions.forEach(inf => out.push(par([run('- ' + inf, { size: 15 })], { after: 20, line: 220 })))
  if (c.overlapLine) out.push(line(c.overlapLine.text, { size: 15, color: c.overlapLine.color, bold: true }))
  out.push(line(c.damagesIntro, { size: 16, align: AlignmentType.BOTH }))
  c.damages.forEach(dm => out.push(par([run('- ' + dm, { size: 15 })], { after: 20, line: 220 })))
  c.redaction.split('\n').forEach(t => out.push(line(t, { size: 16, align: AlignmentType.BOTH })))
  out.push(line(c.serie, { size: 13, color: '777777', after: 0 }))
  return out
}

function midColumn(c: ComposedPV): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = []
  c.ministry.forEach((m, i) => out.push(line(m, { align: AlignmentType.CENTER, bold: i < 2, size: i === 1 ? 16 : 13 })))
  out.push(new Paragraph({ text: '', spacing: { after: 80 } }))
  out.push(numberBox(c))
  out.push(new Paragraph({ text: '', spacing: { after: 120 } }))
  out.push(line(c.descTitle, { align: AlignmentType.CENTER, bold: true, underline: true, size: 16 }))
  out.push(line(c.legalDescription, { align: AlignmentType.CENTER, bold: true, size: 18 }))
  out.push(new Paragraph({ text: '', spacing: { after: 120 } }))
  out.push(line(c.midFootnote, { size: 12, color: '555555', align: AlignmentType.BOTH }))
  return out
}

function summonsColumn(c: ComposedPV): Paragraph[] {
  const out: Paragraph[] = [
    par([run(c.summonsTitle, { bold: true, size: 18, underline: true })], { align: AlignmentType.CENTER, after: 120 }),
  ]
  c.summonsLines.forEach(l => out.push(line(l, { size: 13, after: 60 })))
  out.push(new Paragraph({ text: '', spacing: { after: 60 } }))
  out.push(line('و بـه الإشهـاد', { bold: true, size: 14, align: AlignmentType.CENTER }))
  out.push(new Paragraph({ text: '', spacing: { after: 120 } }))
  out.push(line(c.summonsFootnote, { size: 11, color: '555555' }))
  return out
}

function page1Table(c: ComposedPV): Table {
  const cell = (children: (Paragraph | Table)[], leftBorder: boolean) =>
    new TableCell({
      verticalAlign: VerticalAlign.TOP,
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      borders: { top: NO, bottom: NO, right: NO, left: leftBorder ? THIN : NO },
      children,
    })
  // Ordre visuel RTL : [droite=summons, milieu=mid, gauche=body]
  return new Table({
    visuallyRightToLeft: true,
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [4200, 4000, 7200],
    borders: { top: THIN, bottom: THIN, left: THIN, right: THIN, insideHorizontal: NO, insideVertical: NO },
    rows: [
      new TableRow({
        children: [
          cell(summonsColumn(c), false),
          cell(midColumn(c), true),
          cell(bodyColumn(c), true),
        ],
      }),
    ],
  })
}

function page2Design(c: ComposedPV, logoBytes?: Uint8Array | null): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [
    new Paragraph({ children: [new PageBreak()] }),
    par([run(`رسم بياني للقطعة المترامى عليها موضوع المحضر عدد ${c.pvNum}`, { bold: true, size: 22, underline: true })], { align: AlignmentType.CENTER, after: 160 }),
  ]

  if (c.mapImage) {
    try {
      const base64 = c.mapImage.includes(',') ? c.mapImage.split(',')[1] : c.mapImage
      const bytes = Uint8Array.from(atob(base64), ch => ch.charCodeAt(0))
      out.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({ data: bytes, transformation: { width: 900, height: 520 }, type: 'png' })],
      }))
    } catch { /* image invalide → on garde la table */ }
  }

  if (c.coordPoints.length) {
    const w = 2600
    out.push(new Paragraph({ text: '', spacing: { after: 120 } }))
    out.push(line('لائحة إحداثيات القطعة (Lambert / EPSG:26191)', { bold: true, align: AlignmentType.CENTER, size: 16 }))
    out.push(new Table({
      visuallyRightToLeft: true,
      width: { size: 60, type: WidthType.PERCENTAGE },
      columnWidths: [w, w, w],
      borders: { top: THIN, bottom: THIN, left: THIN, right: THIN, insideHorizontal: THIN, insideVertical: THIN },
      rows: [
        new TableRow({
          tableHeader: true,
          children: ['Y', 'X', 'النقطة'].map(h => new TableCell({ borders: CELL_ALL, shading: { type: ShadingType.CLEAR, fill: 'E8F5E9', color: 'auto' }, verticalAlign: VerticalAlign.CENTER, children: [line(h, { bold: true, align: AlignmentType.CENTER, size: 16 })] })),
        }),
        ...c.coordPoints.map(p => new TableRow({
          children: [
            new TableCell({ borders: CELL_ALL, children: [line(p.y || '—', { align: AlignmentType.CENTER, size: 14 })] }),
            new TableCell({ borders: CELL_ALL, children: [line(p.x || '—', { align: AlignmentType.CENTER, size: 14 })] }),
            new TableCell({ borders: CELL_ALL, children: [line('B' + p.num, { align: AlignmentType.CENTER, bold: true, size: 14 })] }),
          ],
        })),
      ],
    }))
    out.push(new Paragraph({ text: '', spacing: { after: 80 } }))
    out.push(line(`المساحة الإجمالية : ${c.areaText}`, { bold: true, align: AlignmentType.CENTER, size: 16 }))
  } else if (!c.mapImage) {
    out.push(line('يُرفق هنا التصميم البياني (المخطط الطبوغرافي) للقطعة المترامى عليها.', { align: AlignmentType.CENTER, color: '777777', size: 16 }))
  }
  return out
}

async function renderDocx(c: ComposedPV): Promise<Blob> {
  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 16 } } } },
    sections: [{
      properties: {
        page: {
          size: { width: A4L.width, height: A4L.height, orientation: PageOrientation.LANDSCAPE },
          margin: { top: 500, right: 500, bottom: 400, left: 500 },
        },
      },
      children: [
        page1Table(c),
        ...page2Design(c),
      ],
    }],
  })
  return Packer.toBlob(doc)
}

// ══════════════════════════════════════════════════════
// 3) RENDU HTML (pour l'impression PDF — mise en page identique)
// ══════════════════════════════════════════════════════
const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function renderHtml(c: ComposedPV): string {
  const summons = c.summonsLines.map(l => `<div class="sline">${esc(l)}</div>`).join('')
  const bodyParas = c.bodyParas.map(p => `<p class="just">${esc(p.text)}</p>`).join('')
  const infractions = c.infractions.map(i => `<div class="bul">- ${esc(i)}</div>`).join('')
  const damages = c.damages.map(d => `<div class="bul">- ${esc(d)}</div>`).join('')
  const overlap = c.overlapLine ? `<p class="ov" style="color:${c.overlapLine.color}">${esc(c.overlapLine.text)}</p>` : ''
  const redaction = c.redaction.split('\n').map(t => `<p class="just">${esc(t)}</p>`).join('')
  const ministry = c.ministry.map((m, i) => `<div class="${i < 2 ? 'minb' : 'min'}">${esc(m)}</div>`).join('')

  const coordRows = c.coordPoints.map(p => `<tr><td>${esc(p.y || '—')}</td><td>${esc(p.x || '—')}</td><td><b>B${p.num}</b></td></tr>`).join('')
  const page2 = `
    <section class="sheet">
      <h2 class="p2title">رسم بياني للقطعة المترامى عليها موضوع المحضر عدد ${esc(c.pvNum)}</h2>
      ${c.mapImage ? `<div style="text-align:center"><img src="${c.mapImage}" style="max-width:90%;max-height:150mm;object-fit:contain"/></div>` : ''}
      ${c.coordPoints.length ? `
        <h3 class="p2sub">لائحة إحداثيات القطعة (Lambert / EPSG:26191)</h3>
        <table class="coord"><thead><tr><th>Y</th><th>X</th><th>النقطة</th></tr></thead><tbody>${coordRows}</tbody></table>
        <p class="p2area">المساحة الإجمالية : ${esc(c.areaText)}</p>
      ` : (!c.mapImage ? `<p class="p2note">يُرفق هنا التصميم البياني (المخطط الطبوغرافي) للقطعة المترامى عليها.</p>` : '')}
    </section>`

  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<title>تقرير الجنحة ${esc(c.pvNum)}</title>
<style>
  @page { size: A4 landscape; margin: 8mm; }
  * { box-sizing: border-box; }
  html,body { margin:0; padding:0; }
  body { font-family:'Traditional Arabic','Amiri','Arial',sans-serif; direction:rtl; color:#000; }
  .sheet { width:281mm; min-height:194mm; padding:2mm; page-break-after:always; }
  .sheet:last-child { page-break-after:auto; }
  .grid { width:100%; table-layout:fixed; border:1.2px solid #000; border-collapse:collapse; }
  .col { vertical-align:top; padding:2.5mm 3mm; }
  .c-body { width:48%; }
  .c-mid  { width:26%; border-right:1.2px solid #000; }
  .c-sum  { width:26%; border-right:1.2px solid #000; }
  .title { text-align:center; font-weight:bold; font-size:15pt; text-decoration:underline; margin:0 0 3mm; }
  .just { text-align:justify; font-size:10.5pt; line-height:1.5; margin:0 0 2mm; }
  .bul { font-size:10pt; line-height:1.4; margin:0 0 0.6mm; padding-right:2mm; }
  .ov { font-size:10pt; font-weight:bold; margin:1mm 0; }
  .min { text-align:center; font-size:8.5pt; margin:0.3mm 0; }
  .minb { text-align:center; font-size:10pt; font-weight:bold; margin:0.4mm 0; }
  .numbox { width:100%; border-collapse:collapse; margin:2mm 0; }
  .numbox td { border:1px solid #000; text-align:center; padding:1mm; font-size:9pt; }
  .numbox .nb-num { font-size:13pt; font-weight:bold; padding:1.5mm; }
  .desc-t { text-align:center; font-weight:bold; text-decoration:underline; font-size:10.5pt; margin:2mm 0 1mm; }
  .desc-v { text-align:center; font-weight:bold; font-size:12pt; margin:0 0 2mm; }
  .midfoot { font-size:7.5pt; color:#555; text-align:justify; margin-top:2mm; }
  .sum-t { text-align:center; font-weight:bold; font-size:12pt; text-decoration:underline; margin:0 0 2.5mm; }
  .sline { font-size:8.5pt; line-height:1.7; border-bottom:0; margin:0; }
  .attest { text-align:center; font-weight:bold; font-size:9pt; margin:2mm 0; }
  .sumfoot { font-size:7pt; color:#555; margin-top:2mm; }
  .serie { font-size:8pt; color:#777; margin-top:2mm; }
  .topbar { display:flex; justify-content:space-between; align-items:center; margin:0 0 1mm; }
  .topbar .ind { font-size:8.5pt; }
  .p2title { text-align:center; text-decoration:underline; font-size:14pt; margin:4mm 0; }
  .p2sub { text-align:center; font-size:11pt; margin:4mm 0 2mm; }
  .coord { margin:0 auto; border-collapse:collapse; width:60%; }
  .coord th,.coord td { border:1px solid #000; text-align:center; padding:1.2mm 2mm; font-size:10pt; }
  .coord th { background:#E8F5E9; }
  .p2area { text-align:center; font-weight:bold; font-size:11pt; margin-top:3mm; }
  .p2note { text-align:center; color:#777; font-size:11pt; margin-top:8mm; }
</style></head><body>
  <section class="sheet">
    <div class="topbar"><span class="ind">الرقم الاستدلالي ${esc(c.indicatif)}</span><span class="ind" style="font-weight:bold">${esc(c.title)}</span></div>
    <table class="grid"><tr>
      <td class="col c-body">
        <div class="title">${esc(c.title)}</div>
        ${bodyParas}
        ${infractions}
        ${overlap}
        <p class="just">${esc(c.damagesIntro)}</p>
        ${damages}
        ${redaction}
        <div class="serie">${esc(c.serie)}</div>
      </td>
      <td class="col c-mid">
        ${ministry}
        <table class="numbox"><tr><td>${esc(c.numBoxL2)}</td><td>${esc(c.numBoxL1)}</td></tr><tr><td colspan="2" class="nb-num" dir="ltr">${esc(c.pvNum)}</td></tr></table>
        <div class="desc-t">${esc(c.descTitle)}</div>
        <div class="desc-v">${esc(c.legalDescription)}</div>
        <div class="midfoot">${esc(c.midFootnote)}</div>
      </td>
      <td class="col c-sum">
        <div class="sum-t">${esc(c.summonsTitle)}</div>
        ${summons}
        <div class="attest">و بـه الإشهـاد</div>
        <div class="sumfoot">${esc(c.summonsFootnote)}</div>
      </td>
    </tr></table>
  </section>
  ${page2}
</body></html>`
}

// ══════════════════════════════════════════════════════
// 4) API PUBLIQUE
// ══════════════════════════════════════════════════════
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

/** Télécharge le PV au format Word (.docx) — modèle paysage officiel. */
export async function generatePVDocx(d: PVDocxData): Promise<void> {
  const c = composePV(d)
  const blob = await renderDocx(c)
  saveBlob(blob, `PV_${(d.pvNum || 'nouveau').replace(/\//g, '-')}.docx`)
}

/** Ouvre l'aperçu HTML dans un onglet VISIBLE (pour voir la mise en page à l'écran). */
export function previewPVHtml(d: PVDocxData): void {
  const html = renderHtml(composePV(d))
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const w = window.open(url, '_blank')
  if (!w) {
    // popup bloqué → repli : téléchargement du HTML
    downloadPVHtml(d)
    return
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

/** Télécharge le PV au format .html (ouvrable dans n'importe quel navigateur). */
export function downloadPVHtml(d: PVDocxData): void {
  const html = renderHtml(composePV(d))
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  saveBlob(blob, `PV_${(d.pvNum || 'nouveau').replace(/\//g, '-')}.html`)
}

/** Ouvre l'aperçu imprimable (paysage) pour enregistrement en PDF via le navigateur.
 *  iframe caché + Blob URL : non bloqué comme un popup, et l'impression n'est
 *  déclenchée qu'APRÈS le chargement complet (polices + image du plan). */
export function generatePVPdf(d: PVDocxData): void {
  const c = composePV(d)
  const html = renderHtml(c)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
  iframe.src = url

  let done = false
  const cleanup = () => {
    if (done) return
    done = true
    setTimeout(() => {
      URL.revokeObjectURL(url)
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
    }, 1000)
  }

  iframe.onload = () => {
    const win = iframe.contentWindow
    if (!win) { cleanup(); return }
    // attendre les polices (si supporté) avant d'imprimer
    const doPrint = () => { try { win.focus(); win.print() } catch {} }
    const fonts: any = (win.document as any).fonts
    if (fonts && typeof fonts.ready?.then === 'function') {
      fonts.ready.then(() => setTimeout(doPrint, 150)).catch(() => setTimeout(doPrint, 300))
    } else {
      setTimeout(doPrint, 400)
    }
    win.onafterprint = cleanup
    // filet de sécurité si onafterprint ne se déclenche pas
    setTimeout(cleanup, 60000)
  }

  document.body.appendChild(iframe)
}