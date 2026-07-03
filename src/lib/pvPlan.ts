// src/lib/pvPlan.ts
// ════════════════════════════════════════════════════════════════════════════
// pvPlan.ts — Générateur du « رسم بياني للقطعة المترامى عليها » (page 2 du PV)
// Reproduit fidèlement les plans officiels joints aux modèles :
//   • cadre double + graticule Lambert (ticks + labels 501700, 501800…)
//   • parcelle globale en trait noir épais + sommets pointés
//   • entités (بناية، صهريج، تعشيب…) avec motifs SVG (hachures, croisillons,
//     pointillés, végétation) et couleurs choisies par l'utilisateur
//   • titre souligné, flèche du nord, barre d'échelle, encadré des surfaces,
//     légende « المفتاح » en bas
// Sorties : SVG (aperçu HTML / impression PDF) et PNG dataURL (insertion docx).
// Projection : Lambert Nord Maroc EPSG:26191 (enregistrement idempotent).
// ════════════════════════════════════════════════════════════════════════════
import proj4 from 'proj4'
import type { PVFeature, PVSymbol } from './pvModel'

// ── CRS (idempotent — même définition que forestGisCore/pvParcelBridge) ──
const L26191 = 'EPSG:26191'
if (typeof (proj4 as any).defs === 'function' && !(proj4 as any).defs(L26191)) {
  ;(proj4 as any).defs(
    L26191,
    '+proj=lcc +lat_1=33.3 +lat_0=33.3 +lon_0=-5.4 +k_0=0.999625769 +x_0=500000 +y_0=300000 +a=6378249.2 +b=6356515 +towgs84=31,146,47,0,0,0,0 +units=m +no_defs'
  )
}

// ──────────────────────────────────────────────────────
// Géométrie → anneaux Lambert
// ──────────────────────────────────────────────────────
type Ring = Array<[number, number]>
interface LambertShape { outer: Ring[]; holes: Ring[]; points: Array<[number, number]>; lines: Ring[] }

function toLambert(c: number[]): [number, number] {
  const [x, y] = proj4('EPSG:4326', L26191, [c[0], c[1]]) as [number, number]
  return [x, y]
}

/** Extrait toutes les géométries d'un GeoJSON en coordonnées Lambert. */
export function geojsonToLambertShape(geojson: any): LambertShape {
  const out: LambertShape = { outer: [], holes: [], points: [], lines: [] }
  const walk = (g: any) => {
    if (!g) return
    if (g.type === 'FeatureCollection') return (g.features || []).forEach(walk)
    if (g.type === 'Feature') return walk(g.geometry)
    if (g.type === 'Polygon') {
      ;(g.coordinates || []).forEach((ring: number[][], i: number) => {
        const r = ring.map(toLambert) as Ring
        i === 0 ? out.outer.push(r) : out.holes.push(r)
      })
    } else if (g.type === 'MultiPolygon') {
      ;(g.coordinates || []).forEach((poly: number[][][]) =>
        poly.forEach((ring, i) => {
          const r = ring.map(toLambert) as Ring
          i === 0 ? out.outer.push(r) : out.holes.push(r)
        })
      )
    } else if (g.type === 'Point') {
      out.points.push(toLambert(g.coordinates))
    } else if (g.type === 'MultiPoint') {
      ;(g.coordinates || []).forEach((c: number[]) => out.points.push(toLambert(c)))
    } else if (g.type === 'LineString') {
      out.lines.push((g.coordinates || []).map(toLambert) as Ring)
    } else if (g.type === 'MultiLineString') {
      ;(g.coordinates || []).forEach((l: number[][]) => out.lines.push(l.map(toLambert) as Ring))
    } else if (g.type === 'GeometryCollection') {
      ;(g.geometries || []).forEach(walk)
    }
  }
  try { walk(geojson) } catch {}
  return out
}

// ──────────────────────────────────────────────────────
// Motifs SVG (المفتاح) — mêmes textures que les plans officiels
// ──────────────────────────────────────────────────────
const escXml = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function patternDef(id: string, sym: PVSymbol): string {
  const c = sym.color
  switch (sym.kind) {
    case 'hatch':
      return `<pattern id="${id}" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="white"/><line x1="0" y1="0" x2="0" y2="7" stroke="${c}" stroke-width="2"/></pattern>`
    case 'crosshatch':
      return `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="white"/><path d="M0 0L8 8M8 0L0 8" stroke="${c}" stroke-width="1.4"/></pattern>`
    case 'dots':
      return `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="white"/><circle cx="4" cy="4" r="1.6" fill="${c}"/></pattern>`
    case 'veg':
      return `<pattern id="${id}" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="#f6fbf4"/><circle cx="4" cy="4" r="2.4" fill="none" stroke="${c}" stroke-width="1.1"/><circle cx="11" cy="10" r="2.4" fill="none" stroke="${c}" stroke-width="1.1"/></pattern>`
    default:
      return ''
  }
}

function fillFor(id: string, sym: PVSymbol): { fill: string; opacity: number } {
  if (sym.kind === 'solid') return { fill: sym.color, opacity: 0.75 }
  if (sym.kind === 'outline') return { fill: 'none', opacity: 1 }
  return { fill: `url(#${id})`, opacity: 1 }
}

/** Swatch de légende (rect 26×14) pour un symbole. */
function legendSwatch(x: number, y: number, id: string, sym: PVSymbol, isParcel = false): string {
  if (isParcel) return `<rect x="${x}" y="${y}" width="26" height="14" fill="white" stroke="#000" stroke-width="2"/>`
  const f = fillFor(id, sym)
  const stroke = sym.kind === 'outline' ? sym.color : '#333'
  return `<rect x="${x}" y="${y}" width="26" height="14" fill="${f.fill}" fill-opacity="${f.opacity}" stroke="${stroke}" stroke-width="${sym.kind === 'outline' ? 2 : 0.8}"/>`
}

// ──────────────────────────────────────────────────────
// Construction du plan
// ──────────────────────────────────────────────────────
export interface PlanInput {
  pvNum: string
  parcelGeojson: any | null
  features: PVFeature[]
  areaSummaryLines: string[]
  widthPx?: number
  heightPx?: number
}

export interface PlanResult { svg: string; width: number; height: number; scaleDenominator: number }

function niceRound(v: number): number {
  if (!(v > 0)) return 1
  const pow = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / pow
  return (n >= 5 ? 5 : n >= 2 ? 2 : 1) * pow
}

export function buildPlanSvg(input: PlanInput): PlanResult | null {
  const W = input.widthPx ?? 1120
  const H = input.heightPx ?? 760
  const M = 46                       // marge extérieure (labels graticule)
  const innerPad = 14

  // — collecte des formes —
  const parcelShape = input.parcelGeojson ? geojsonToLambertShape(input.parcelGeojson) : null
  const featShapes = input.features
    .filter(f => f.showOnPlan && f.geojson)
    .map(f => ({ f, shape: geojsonToLambertShape(f.geojson) }))

  // bbox globale
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const eat = (s: LambertShape | null) => {
    if (!s) return
    const all: Array<[number, number]> = [
      ...s.outer.flat(), ...s.holes.flat(), ...s.points, ...s.lines.flat(),
    ]
    for (const [x, y] of all) {
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    }
  }
  eat(parcelShape)
  featShapes.forEach(fs => eat(fs.shape))
  if (!Number.isFinite(minX)) return null

  // padding géographique 8%
  const spanX0 = Math.max(maxX - minX, 4), spanY0 = Math.max(maxY - minY, 4)
  minX -= spanX0 * 0.08; maxX += spanX0 * 0.08
  minY -= spanY0 * 0.08; maxY += spanY0 * 0.08
  const spanX = maxX - minX, spanY = maxY - minY

  // zone de dessin (réserve titre en haut / échelle en bas)
  const drawX = M + innerPad, drawY = M + 58
  const drawW = W - 2 * (M + innerPad), drawH = H - drawY - (M + 40)
  const scale = Math.min(drawW / spanX, drawH / spanY) // px par mètre
  const usedW = spanX * scale, usedH = spanY * scale
  const offX = drawX + (drawW - usedW) / 2
  const offY = drawY + (drawH - usedH) / 2
  const px = (x: number) => offX + (x - minX) * scale
  const py = (y: number) => offY + (maxY - y) * scale // Y géographique vers le haut

  // dénominateur d'échelle approx (96 dpi → 1px = 0.264583 mm)
  const scaleDenominator = Math.round((1 / scale) / 0.000264583)

  // — chemins —
  const ringPath = (r: Ring) => 'M' + r.map(([x, y]) => `${px(x).toFixed(1)},${py(y).toFixed(1)}`).join('L') + 'Z'
  const shapePath = (s: LambertShape) => [...s.outer, ...s.holes].map(ringPath).join(' ')

  const defs: string[] = []
  const featPaths: string[] = []
  featShapes.forEach(({ f, shape }, i) => {
    const pid = `pv-pat-${i}`
    const def = patternDef(pid, f.symbol)
    if (def) defs.push(def)
    const fl = fillFor(pid, f.symbol)
    const stroke = f.symbol.kind === 'outline' ? f.symbol.color : '#7a1f1f'
    if (shape.outer.length)
      featPaths.push(`<path d="${shapePath(shape)}" fill-rule="evenodd" fill="${fl.fill}" fill-opacity="${fl.opacity}" stroke="${stroke}" stroke-width="${f.symbol.kind === 'outline' ? 2.4 : 1.1}"/>`)
    shape.lines.forEach(l =>
      featPaths.push(`<polyline points="${l.map(([x, y]) => `${px(x).toFixed(1)},${py(y).toFixed(1)}`).join(' ')}" fill="none" stroke="${f.symbol.color}" stroke-width="2.2"/>`)
    )
    shape.points.forEach(([x, y]) =>
      featPaths.push(`<circle cx="${px(x).toFixed(1)}" cy="${py(y).toFixed(1)}" r="5" fill="${f.symbol.color}" stroke="#111" stroke-width="1"/>`)
    )
    // sommets pointés (comme les plans officiels)
    shape.outer.forEach(r => r.slice(0, -1).forEach(([x, y]) =>
      featPaths.push(`<circle cx="${px(x).toFixed(1)}" cy="${py(y).toFixed(1)}" r="2.2" fill="#7a1f1f"/>`)
    ))
  })

  let parcelPaths = ''
  if (parcelShape && parcelShape.outer.length) {
    parcelPaths =
      `<path d="${shapePath(parcelShape)}" fill-rule="evenodd" fill="none" stroke="#000" stroke-width="2.6"/>` +
      parcelShape.outer.map(r => r.slice(0, -1).map(([x, y]) =>
        `<circle cx="${px(x).toFixed(1)}" cy="${py(y).toFixed(1)}" r="3.1" fill="#22d3ee" stroke="#0e7490" stroke-width="1"/>`
      ).join('')).join('')
  }

  // — graticule Lambert (ticks + labels sur le cadre) —
  const step = niceRound(Math.max(spanX, spanY) / 4)
  const gridLines: string[] = []
  const gridLabels: string[] = []
  for (let gx = Math.ceil(minX / step) * step; gx <= maxX; gx += step) {
    const X = px(gx)
    gridLines.push(`<line x1="${X.toFixed(1)}" y1="${(M).toFixed(1)}" x2="${X.toFixed(1)}" y2="${(M + 6).toFixed(1)}" stroke="#222" stroke-width="1"/>`)
    gridLines.push(`<line x1="${X.toFixed(1)}" y1="${(H - M).toFixed(1)}" x2="${X.toFixed(1)}" y2="${(H - M - 6).toFixed(1)}" stroke="#222" stroke-width="1"/>`)
    gridLabels.push(`<text x="${X.toFixed(1)}" y="${(M - 8).toFixed(1)}" text-anchor="middle" font-size="11" font-family="Arial">${Math.round(gx)}</text>`)
    gridLabels.push(`<text x="${X.toFixed(1)}" y="${(H - M + 16).toFixed(1)}" text-anchor="middle" font-size="11" font-family="Arial">${Math.round(gx)}</text>`)
    gridLines.push(`<line x1="${X.toFixed(1)}" y1="${M}" x2="${X.toFixed(1)}" y2="${H - M}" stroke="#000" stroke-opacity="0.06" stroke-width="1"/>`)
  }
  for (let gy = Math.ceil(minY / step) * step; gy <= maxY; gy += step) {
    const Y = py(gy)
    gridLines.push(`<line x1="${M}" y1="${Y.toFixed(1)}" x2="${M + 6}" y2="${Y.toFixed(1)}" stroke="#222" stroke-width="1"/>`)
    gridLines.push(`<line x1="${W - M}" y1="${Y.toFixed(1)}" x2="${W - M - 6}" y2="${Y.toFixed(1)}" stroke="#222" stroke-width="1"/>`)
    gridLabels.push(`<text x="${(M - 14).toFixed(1)}" y="${Y.toFixed(1)}" text-anchor="middle" font-size="11" font-family="Arial" transform="rotate(-90 ${(M - 14).toFixed(1)} ${Y.toFixed(1)})">${Math.round(gy)}</text>`)
    gridLabels.push(`<text x="${(W - M + 16).toFixed(1)}" y="${Y.toFixed(1)}" text-anchor="middle" font-size="11" font-family="Arial" transform="rotate(-90 ${(W - M + 16).toFixed(1)} ${Y.toFixed(1)})">${Math.round(gy)}</text>`)
    gridLines.push(`<line x1="${M}" y1="${Y.toFixed(1)}" x2="${W - M}" y2="${Y.toFixed(1)}" stroke="#000" stroke-opacity="0.06" stroke-width="1"/>`)
  }

  // — flèche du nord (rose 4 branches comme le modèle) —
  const nX = M + 40, nY = M + 46
  const north = `
  <g transform="translate(${nX},${nY})" font-family="Arial">
    <polygon points="0,-22 5,0 0,-6 -5,0" fill="#111"/>
    <polygon points="0,22 5,0 0,6 -5,0" fill="#fff" stroke="#111" stroke-width="1"/>
    <polygon points="-22,0 0,5 -6,0 0,-5" fill="#fff" stroke="#111" stroke-width="1"/>
    <polygon points="22,0 0,5 6,0 0,-5" fill="#111"/>
    <text x="0" y="-27" text-anchor="middle" font-size="12" font-weight="bold">N</text>
    <text x="0" y="36" text-anchor="middle" font-size="10">S</text>
    <text x="-30" y="4" text-anchor="middle" font-size="10">W</text>
    <text x="30" y="4" text-anchor="middle" font-size="10">E</text>
  </g>`

  // — barre d'échelle —
  const targetBar = niceRound(spanX / 4)
  const barPx = targetBar * scale
  const barX = M + 24, barY = H - M - 18
  const half = barPx / 2
  const scaleBar = `
  <g font-family="Arial" font-size="11">
    <rect x="${barX}" y="${barY}" width="${half.toFixed(1)}" height="7" fill="#111"/>
    <rect x="${(barX + half).toFixed(1)}" y="${barY}" width="${half.toFixed(1)}" height="7" fill="#fff" stroke="#111"/>
    <text x="${barX}" y="${barY - 5}" text-anchor="middle">0</text>
    <text x="${(barX + half).toFixed(1)}" y="${barY - 5}" text-anchor="middle">${targetBar / 2}</text>
    <text x="${(barX + barPx).toFixed(1)}" y="${barY - 5}" text-anchor="middle">${targetBar}</text>
    <text x="${(barX + barPx + 26).toFixed(1)}" y="${barY + 7}" text-anchor="middle" font-size="12">متر</text>
  </g>`

  // — encadré des surfaces (haut-droite) : largeur DYNAMIQUE selon la plus
  //   longue ligne pour que rien ne déborde du cadre —
  let areaBox = ''
  if (input.areaSummaryLines.length) {
    const lineH = 19
    const maxLen = Math.max(...input.areaSummaryLines.map(l => l.length))
    const boxW = Math.min(Math.round(W * 0.42), Math.max(240, maxLen * 7.6 + 28))
    const boxH = input.areaSummaryLines.length * lineH + 16
    const bx = W - M - innerPad - boxW, by = M + 56
    areaBox =
      `<rect x="${bx}" y="${by}" width="${boxW}" height="${boxH}" fill="#ffffff" fill-opacity="0.92" stroke="#111" stroke-width="1.4"/>` +
      input.areaSummaryLines.map((l, i) =>
        `<text x="${bx + boxW - 10}" y="${by + 16 + i * lineH}" text-anchor="end" direction="rtl" font-size="12.5" font-family="Arial" font-weight="bold">${escXml(l)}</text>`
      ).join('')
  }

  // — légende المفتاح (bas-gauche pour ne pas gêner l'encadré) —
  const legendEntries: Array<{ label: string; swatch: (x: number, y: number) => string }> = [
    { label: 'حدود القطعة الاجمالية', swatch: (x, y) => legendSwatch(x, y, '', { kind: 'outline', color: '#000' }, true) },
    ...featShapes.map(({ f }, i) => ({
      label: f.label,
      swatch: (x: number, y: number) => legendSwatch(x, y, `pv-pat-${i}`, f.symbol),
    })),
  ]
  // — largeur DYNAMIQUE : le swatch (26px) reste à l'intérieur du cadre et le
  //   libellé le plus long détermine la largeur (fin du débordement observé) —
  const legLineH = 22
  const maxLegLen = Math.max(...legendEntries.map(e => e.label.length))
  const legW = Math.min(340, Math.max(200, maxLegLen * 7.4 + 64))
  const legH = legendEntries.length * legLineH + 34
  const lx = W - M - innerPad - legW, ly = H - M - innerPad - legH
  const legend =
    `<rect x="${lx}" y="${ly}" width="${legW}" height="${legH}" fill="#fff" fill-opacity="0.95" stroke="#111" stroke-width="1.4"/>` +
    `<text x="${lx + legW - 10}" y="${ly + 20}" text-anchor="end" direction="rtl" font-size="14" font-weight="bold" font-family="Arial">المفتاح</text>` +
    legendEntries.map((e, i) => {
      const y = ly + 32 + i * legLineH
      return e.swatch(lx + 8, y) +
        `<text x="${lx + legW - 10}" y="${y + 11}" text-anchor="end" direction="rtl" font-size="12" font-family="Arial">${escXml(e.label)}</text>`
    }).join('')

  const title = `رسم بياني للقطعة المترامى عليها موضوع المحضر عدد ${input.pvNum}`

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="background:#fff">
  <defs>${defs.join('')}</defs>
  <rect x="6" y="6" width="${W - 12}" height="${H - 12}" fill="none" stroke="#111" stroke-width="2.2"/>
  <rect x="${M}" y="${M}" width="${W - 2 * M}" height="${H - 2 * M}" fill="none" stroke="#111" stroke-width="1.2"/>
  <text x="${W / 2}" y="${M + 30}" text-anchor="middle" direction="rtl" font-size="19" font-weight="bold" font-family="Arial" text-decoration="underline">${escXml(title)}</text>
  ${gridLines.join('')}${gridLabels.join('')}
  ${featPaths.join('')}
  ${parcelPaths}
  ${north}
  ${scaleBar}
  ${areaBox}
  ${legend}
</svg>`

  return { svg, width: W, height: H, scaleDenominator }
}

// ──────────────────────────────────────────────────────
// SVG → PNG dataURL (insertion dans le .docx)
// ──────────────────────────────────────────────────────
export async function svgToPngDataUrl(svg: string, width: number, height: number, scale = 2): Promise<string> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.decoding = 'sync'
    await new Promise<void>((res, rej) => {
      img.onload = () => res()
      img.onerror = () => rej(new Error('svg load failed'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d unavailable')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}