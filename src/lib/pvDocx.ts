// src/lib/pvDocx.ts
// ════════════════════════════════════════════════════════════════════════════
// pvDocx.ts — Mise en page du « تقرير الجنحة » (PV forestier) — modèle officiel ANEF
//   • Page 1 : A4 PAYSAGE, 3 colonnes RTL
//       [ corps du rapport | en-tête + n° + وصف الجنحة | إعلام واستدعاء ]
//   • Page 2 : « التصميم البياني » professionnel : plan (pvPlan.ts) + tables de
//       coordonnées PAR ENTITÉ (une parcelle peut porter plusieurs infractions).
//
// La composition du contenu vit dans pvModel.ts (composePV). Ici : rendu pur.
//   - renderDocx() → .docx natif RTL (lib docx)      → generatePVDocx()
//   - renderHtml() → HTML paysage imprimable          → previewPVHtml()/generatePVPdf()
// Les deux moteurs consomment le MÊME ComposedPV → sorties identiques.
// ════════════════════════════════════════════════════════════════════════════
import {
  Document, Packer, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell,
  WidthType, BorderStyle, ShadingType, VerticalAlign, PageOrientation, PageBreak, ImageRun,
} from 'docx'
import { composePV, type ComposedPV, type PVComposeInput, type PVCoordPoint, type PVFeature } from './pvModel'
import { buildPlanSvg, svgToPngDataUrl } from './pvPlan'

export type { PVComposeInput, PVCoordPoint, PVFeature }

// ──────────────────────────────────────────────────────
// Constantes de style
// ──────────────────────────────────────────────────────
const FONT = 'Traditional Arabic'
const A4L = { width: 16838, height: 11906 } // twips

// n° PV isolé en LTR pour préserver « 08/03/2025/BM » en contexte RTL
const LRI = '\u2066', PDI = '\u2069'
const ltrPV = (s: string) => `${LRI}${s}${PDI}`

// ──────────────────────────────────────────────────────
// Préparation : compose + plan (une seule fois pour les deux moteurs)
// ──────────────────────────────────────────────────────
interface PreparedPV {
  c: ComposedPV
  planSvg: string | null
  planW: number
  planH: number
}

// ── Formulaire officiel « إعلام واستدعاء » comme IMAGE (public/images) ──
const CONVOCATION_URLS = ['/images/convocation.png', '/images/convocation.jpg', '/images/convocation.jpeg']
interface ConvImage { bytes: Uint8Array; width: number; height: number; type: 'png' | 'jpg' }

async function loadConvocationImage(): Promise<ConvImage | null> {
  if (typeof document === 'undefined') return null
  for (const url of CONVOCATION_URLS) {
    try {
      const res = await fetch(url, { cache: 'force-cache' })
      if (!res.ok) continue
      const blob = await res.blob()
      const objUrl = URL.createObjectURL(blob)
      try {
        const img = new Image()
        await new Promise<void>((ok, ko) => { img.onload = () => ok(); img.onerror = () => ko(new Error('img')); img.src = objUrl })
        const buf = new Uint8Array(await blob.arrayBuffer())
        return { bytes: buf, width: img.naturalWidth || 700, height: img.naturalHeight || 1100, type: url.endsWith('.png') ? 'png' : 'jpg' }
      } finally { URL.revokeObjectURL(objUrl) }
    } catch { /* essayer l'URL suivante */ }
  }
  return null
}

function prepare(inp: PVComposeInput, parcelCoordPoints: PVCoordPoint[], parcelGeojson: any | null): PreparedPV {
  const c = composePV(inp, parcelCoordPoints)
  const plan = buildPlanSvg({
    pvNum: inp.pvNum,
    parcelGeojson,
    features: inp.features,
    areaSummaryLines: c.areaSummaryLines,
  })
  return { c, planSvg: plan?.svg ?? null, planW: plan?.width ?? 0, planH: plan?.height ?? 0 }
}

/** Groupes de tables de coordonnées de la page 2 : parcelle + chaque entité. */
function coordGroups(c: ComposedPV): Array<{ title: string; pts: PVCoordPoint[] }> {
  const groups: Array<{ title: string; pts: PVCoordPoint[] }> = []
  if (c.parcelCoordPoints.length)
    groups.push({ title: 'القطعة الاجمالية', pts: c.parcelCoordPoints })
  c.features.forEach(f => {
    if (f.showCoordsTable && f.coordPoints.length)
      groups.push({ title: f.label, pts: f.coordPoints })
  })
  return groups
}

// ══════════════════════════════════════════════════════
// 1) RENDU DOCX
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
  c.infractionBullets.forEach(inf => out.push(par([run('- ' + inf, { size: 15 })], { after: 20, line: 220 })))
  if (c.overlapLine) out.push(line(c.overlapLine.text, { size: 15, color: c.overlapLine.color, bold: true }))
  if (c.damagesIntro) out.push(line(c.damagesIntro, { size: 16, align: AlignmentType.BOTH }))
  c.damages.forEach(dm => out.push(par([run('- ' + dm, { size: 15 })], { after: 20, line: 220 })))
  c.investigationParas.forEach(t => out.push(line(t, { size: 16, align: AlignmentType.BOTH })))
  if (c.seizurePara) out.push(line(c.seizurePara, { size: 16, align: AlignmentType.BOTH }))
  if (c.identityPara) out.push(line(c.identityPara.text, { size: 16, bold: c.identityPara.bold, align: AlignmentType.BOTH }))
  out.push(line(c.closingLine, { size: 16, align: AlignmentType.BOTH, after: 60 }))
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

function summonsColumn(c: ComposedPV, conv: ConvImage | null): Paragraph[] {
  if (conv) {
    // largeur cellule ≈ 4200 twips ≈ 280px ; hauteur au ratio, plafonnée à la page
    const targetW = 266
    const targetH = Math.min(672, Math.round(targetW * (conv.height / conv.width)))
    return [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new ImageRun({ data: conv.bytes, transformation: { width: targetW, height: targetH }, type: conv.type })],
    })]
  }
  const out: Paragraph[] = [
    par([run(c.summonsTitle, { bold: true, size: 18, underline: true })], { align: AlignmentType.CENTER, after: 120 }),
  ]
  c.summonsLines.forEach(l => out.push(line(l, { size: 13, after: 60 })))
  out.push(new Paragraph({ text: '', spacing: { after: 60 } }))
  out.push(line(c.attestation, { bold: true, size: 14, align: AlignmentType.CENTER }))
  out.push(new Paragraph({ text: '', spacing: { after: 120 } }))
  out.push(line(c.summonsFootnote, { size: 11, color: '555555' }))
  return out
}

function page1Table(c: ComposedPV, conv: ConvImage | null): Table {
  const cell = (children: (Paragraph | Table)[], leftBorder: boolean) =>
    new TableCell({
      verticalAlign: VerticalAlign.TOP,
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      borders: { top: NO, bottom: NO, right: NO, left: leftBorder ? THIN : NO },
      children,
    })
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    // Ordre PHYSIQUE gauche→droite (déterministe dans Word/LibreOffice, sans
    // bidiVisual) : [corps du rapport | ديباجة + n° + وصف | إعلام واستدعاء]
    // → إعلام واستدعاء à DROITE et le corps à GAUCHE, comme le modèle officiel.
    columnWidths: [7200, 4000, 4200],
    borders: { top: THIN, bottom: THIN, left: THIN, right: THIN, insideHorizontal: NO, insideVertical: NO },
    rows: [
      new TableRow({
        children: [
          cell(bodyColumn(c), false),   // gauche
          cell(midColumn(c), true),     // milieu (séparateur à sa gauche)
          cell(summonsColumn(c, conv), true), // droite (séparateur à sa gauche)
        ],
      }),
    ],
  })
}

/** Table de coordonnées d'un groupe (en-tête = nom de l'entité). */
function coordTableDocx(title: string, pts: PVCoordPoint[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: THIN, bottom: THIN, left: THIN, right: THIN, insideHorizontal: THIN, insideVertical: THIN },
    rows: [
      new TableRow({
        children: [new TableCell({
          columnSpan: 3, borders: CELL_ALL,
          shading: { type: ShadingType.CLEAR, fill: 'DCE8DC', color: 'auto' },
          children: [line(title, { bold: true, align: AlignmentType.CENTER, size: 15 })],
        })],
      }),
      new TableRow({
        tableHeader: true,
        children: ['Y', 'X', 'Pts'].map(h => new TableCell({
          borders: CELL_ALL,
          shading: { type: ShadingType.CLEAR, fill: 'F1F5F1', color: 'auto' },
          children: [line(h, { bold: true, align: AlignmentType.CENTER, size: 14 })],
        })),
      }),
      ...pts.map(p => new TableRow({
        children: [
          new TableCell({ borders: CELL_ALL, children: [line(p.y || '—', { align: AlignmentType.CENTER, size: 13 })] }),
          new TableCell({ borders: CELL_ALL, children: [line(p.x || '—', { align: AlignmentType.CENTER, size: 13 })] }),
          new TableCell({ borders: CELL_ALL, children: [line(String(p.num), { align: AlignmentType.CENTER, bold: true, size: 13 })] }),
        ],
      })),
    ],
  })
}

async function page2Design(p: PreparedPV): Promise<(Paragraph | Table)[]> {
  const { c } = p
  const out: (Paragraph | Table)[] = [
    new Paragraph({ children: [new PageBreak()] }),
    par([run(c.planTitle, { bold: true, size: 22, underline: true })], { align: AlignmentType.CENTER, after: 140 }),
  ]

  const groups = coordGroups(c)

  // colonne image (plan) — ratio préservé, largeur bornée à ~660px
  let planCell: (Paragraph | Table)[] = [
    line('يُرفق هنا التصميم البياني للقطعة المترامى عليها (لم تُرسم أي هندسة بعد).', { align: AlignmentType.CENTER, color: '777777', size: 15 }),
  ]
  if (p.planSvg) {
    try {
      const dataUrl = await svgToPngDataUrl(p.planSvg, p.planW, p.planH, 2)
      const base64 = dataUrl.split(',')[1]
      const bytes = Uint8Array.from(atob(base64), ch => ch.charCodeAt(0))
      const targetW = groups.length ? 660 : 900
      const targetH = Math.round(targetW * (p.planH / p.planW))
      planCell = [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({ data: bytes, transformation: { width: targetW, height: targetH }, type: 'png' })],
      })]
    } catch { /* environnement sans canvas → note conservée */ }
  }

  if (!groups.length) {
    out.push(...planCell)
    return out
  }

  // colonne coordonnées : tables empilées avec respiration
  const coordCell: (Paragraph | Table)[] = [
    line('لائحة إحداثيات المخالفات ( Lambert Nord Maroc — EPSG:26191 )', { bold: true, align: AlignmentType.CENTER, size: 14, after: 80 }),
  ]
  groups.forEach((g, i) => {
    coordCell.push(coordTableDocx(g.title, g.pts))
    if (i < groups.length - 1) coordCell.push(new Paragraph({ text: '', spacing: { after: 80 } }))
  })

  // Ordre PHYSIQUE gauche→droite : [coords | plan] → plan à DROITE (modèle 08.03)
  out.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [5400, 10400],
    borders: { top: NO, bottom: NO, left: NO, right: NO, insideHorizontal: NO, insideVertical: NO },
    rows: [new TableRow({
      children: [
        new TableCell({ borders: { top: NO, bottom: NO, left: NO, right: NO }, verticalAlign: VerticalAlign.TOP, margins: { left: 100, right: 100 }, children: coordCell }),
        new TableCell({ borders: { top: NO, bottom: NO, left: NO, right: NO }, verticalAlign: VerticalAlign.TOP, margins: { left: 100, right: 100 }, children: planCell }),
      ],
    })],
  }))
  out.push(new Paragraph({ text: '', spacing: { after: 80 } }))
  out.push(line(`المساحة الإجمالية للقطعة : ${c.areaText}`, { bold: true, align: AlignmentType.CENTER, size: 16 }))
  return out
}

async function renderDocx(p: PreparedPV): Promise<Blob> {
  const conv = await loadConvocationImage()
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
        page1Table(p.c, conv),
        ...(await page2Design(p)),
      ],
    }],
  })
  return Packer.toBlob(doc)
}

// ══════════════════════════════════════════════════════
// 2) RENDU HTML (aperçu + impression PDF — identique)
// ══════════════════════════════════════════════════════
const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function coordTableHtml(title: string, pts: PVCoordPoint[]): string {
  const rows = pts.map(p => `<tr><td>${esc(p.y || '—')}</td><td>${esc(p.x || '—')}</td><td><b>${p.num}</b></td></tr>`).join('')
  return `<table class="coord">
    <thead>
      <tr><th colspan="3" class="cg-title">${esc(title)}</th></tr>
      <tr><th>Y</th><th>X</th><th>Pts</th></tr>
    </thead><tbody>${rows}</tbody></table>`
}

function renderHtml(p: PreparedPV): string {
  const c = p.c
  const bodyParas = c.bodyParas.map(x => `<p class="just">${esc(x.text)}</p>`).join('')
  const infractions = c.infractionBullets.map(i => `<div class="bul">- ${esc(i)}</div>`).join('')
  const damages = c.damages.map(d => `<div class="bul">- ${esc(d)}</div>`).join('')
  const overlap = c.overlapLine ? `<p class="ov" style="color:#${c.overlapLine.color}">${esc(c.overlapLine.text)}</p>` : ''
  const investigation = c.investigationParas.map(t => `<p class="just">${esc(t)}</p>`).join('')
  const seizure = c.seizurePara ? `<p class="just">${esc(c.seizurePara)}</p>` : ''
  const identity = c.identityPara ? `<p class="just" style="${c.identityPara.bold ? 'font-weight:bold' : ''}">${esc(c.identityPara.text)}</p>` : ''
  const ministry = c.ministry.map((m, i) => `<div class="${i < 2 ? 'minb' : 'min'}">${esc(m)}</div>`).join('')
  const summons = c.summonsLines.map(l => `<div class="sline">${esc(l)}</div>`).join('')

  const groups = coordGroups(c)
  const coordCol = groups.length
    ? `<div class="p2coords"><div class="p2sub">لائحة إحداثيات المخالفات ( Lambert — EPSG:26191 )</div>${groups.map(g => coordTableHtml(g.title, g.pts)).join('')}</div>`
    : ''
  const planCol = p.planSvg
    ? `<div class="p2plan">${p.planSvg}</div>`
    : `<p class="p2note">يُرفق هنا التصميم البياني للقطعة المترامى عليها (لم تُرسم أي هندسة بعد).</p>`

  const page2 = `
    <section class="sheet">
      <div class="p2wrap">${planCol}${coordCol}</div>
      <p class="p2area">المساحة الإجمالية للقطعة : ${esc(c.areaText)}</p>
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
  .c-mid  { width:26%; border-left:1.2px solid #000; }
  .c-sum  { width:26%; border-left:1.2px solid #000; }
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
  .conv { display:block; width:100%; height:auto; max-height:186mm; object-fit:contain; }
  .sum-t { text-align:center; font-weight:bold; font-size:12pt; text-decoration:underline; margin:0 0 2.5mm; }
  .sline { font-size:8.5pt; line-height:1.7; margin:0; }
  .attest { text-align:center; font-weight:bold; font-size:9pt; margin:2mm 0; }
  .sumfoot { font-size:7pt; color:#555; margin-top:2mm; }
  .serie { font-size:8pt; color:#777; margin-top:2mm; }
  .closing { text-align:justify; font-size:10.5pt; margin-top:2mm; }
  .topbar { display:flex; justify-content:space-between; align-items:center; margin:0 0 1mm; }
  .topbar .ind { font-size:8.5pt; }
  /* ── Page 2 ── */
  .p2wrap { display:flex; gap:4mm; align-items:flex-start; }
  .p2plan { flex:1 1 auto; text-align:center; }
  .p2plan svg { max-width:100%; height:auto; }
  .p2coords { flex:0 0 62mm; max-width:62mm; }
  .p2sub { text-align:center; font-size:9pt; font-weight:bold; margin:0 0 2mm; }
  .coord { border-collapse:collapse; width:100%; margin:0 0 3mm; }
  .coord th,.coord td { border:1px solid #000; text-align:center; padding:0.6mm 1mm; font-size:8pt; }
  .coord th { background:#F1F5F1; }
  .coord .cg-title { background:#DCE8DC; font-size:8.5pt; }
  .p2area { text-align:center; font-weight:bold; font-size:11pt; margin-top:3mm; }
  .p2note { text-align:center; color:#777; font-size:11pt; margin-top:8mm; }
</style></head><body>
  <section class="sheet">
    <div class="topbar"><span class="ind">الرقم الاستدلالي ${esc(c.indicatif)}</span><span class="ind" style="font-weight:bold">${esc(c.title)}</span></div>
    <table class="grid"><tr>
      <td class="col c-sum">
        <img class="conv" src="${CONVOCATION_URLS[0]}" alt="" onerror="this.remove();var t=document.getElementById('convtxt');if(t)t.removeAttribute('hidden')" />
        <div id="convtxt" hidden>
          <div class="sum-t">${esc(c.summonsTitle)}</div>
          ${summons}
          <div class="attest">${esc(c.attestation)}</div>
          <div class="sumfoot">${esc(c.summonsFootnote)}</div>
        </div>
      </td>
      <td class="col c-mid">
        ${ministry}
        <table class="numbox"><tr><td>${esc(c.numBoxL2)}</td><td>${esc(c.numBoxL1)}</td></tr><tr><td colspan="2" class="nb-num" dir="ltr">${esc(c.pvNum)}</td></tr></table>
        <div class="desc-t">${esc(c.descTitle)}</div>
        <div class="desc-v">${esc(c.legalDescription)}</div>
        <div class="midfoot">${esc(c.midFootnote)}</div>
      </td>
      <td class="col c-body">
        <div class="title">${esc(c.title)}</div>
        ${bodyParas}
        ${infractions}
        ${overlap}
        ${c.damagesIntro ? `<p class="just">${esc(c.damagesIntro)}</p>` : ''}
        ${damages}
        ${investigation}
        ${seizure}
        ${identity}
        <p class="closing">${esc(c.closingLine)}</p>
        <div class="serie">${esc(c.serie)}</div>
      </td>
    </tr></table>
  </section>
  ${page2}
</body></html>`
}

// ══════════════════════════════════════════════════════
// 3) API PUBLIQUE
// ══════════════════════════════════════════════════════
export interface PVRenderData {
  input: PVComposeInput
  parcelCoordPoints: PVCoordPoint[]
  parcelGeojson: any | null
}

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

const fileBase = (pvNum: string) => `PV_${(pvNum || 'nouveau').replace(/\//g, '-')}`

/** Télécharge le PV au format Word (.docx) — page 1 modèle officiel + page 2 plan. */
export async function generatePVDocx(d: PVRenderData): Promise<void> {
  const p = prepare(d.input, d.parcelCoordPoints, d.parcelGeojson)
  const blob = await renderDocx(p)
  saveBlob(blob, `${fileBase(d.input.pvNum)}.docx`)
}

/** Aperçu HTML dans un onglet visible (mise en page identique au PDF). */
export function previewPVHtml(d: PVRenderData): void {
  const html = renderHtml(prepare(d.input, d.parcelCoordPoints, d.parcelGeojson))
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const w = window.open(url, '_blank')
  if (!w) { downloadPVHtml(d); return }
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

/** Télécharge le PV en .html autonome. */
export function downloadPVHtml(d: PVRenderData): void {
  const html = renderHtml(prepare(d.input, d.parcelCoordPoints, d.parcelGeojson))
  saveBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${fileBase(d.input.pvNum)}.html`)
}

/** Impression paysage → PDF navigateur (iframe caché, après chargement polices). */
export function generatePVPdf(d: PVRenderData): void {
  const html = renderHtml(prepare(d.input, d.parcelCoordPoints, d.parcelGeojson))
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
    const doPrint = () => { try { win.focus(); win.print() } catch {} }
    const fonts: any = (win.document as any).fonts
    if (fonts && typeof fonts.ready?.then === 'function') {
      fonts.ready.then(() => setTimeout(doPrint, 150)).catch(() => setTimeout(doPrint, 300))
    } else {
      setTimeout(doPrint, 400)
    }
    win.onafterprint = cleanup
    setTimeout(cleanup, 60000)
  }

  document.body.appendChild(iframe)
}