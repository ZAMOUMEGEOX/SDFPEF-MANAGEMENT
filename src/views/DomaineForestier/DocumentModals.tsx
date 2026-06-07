// src/views/DomaineForestier/DocumentModals.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Modals de génération de documents + Analyse Chevauchement (turf.js)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import * as turf from '@turf/turf';
import proj4 from 'proj4';
import { X, Printer, FileDown, Copy, FileText, Layers, ChevronDown, ChevronRight } from 'lucide-react';

// Define Lambert Nord Maroc (safe re-def)
try {
  proj4.defs("EPSG:26191", "+proj=lcc +lat_1=33.3 +lat_0=33.3 +lon_0=-5.4 +k_0=0.999625769 +x_0=500000 +y_0=300000 +a=6378249.2 +b=6356515 +towgs84=31,146,47,0,0,0,0 +units=m +no_defs");
} catch (_) {}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const QIADAS = [
  'عليين', 'الملاليين', 'الجبل الكبير', 'مرتيل', 'وادي لاو',
  'بلِيونَش', 'بني يدر', 'زيانة', 'حمارة', 'تغرامت',
  'الغزاوة', 'الصويني', 'المضيق', 'الفنيدق', 'درة العروس', 'تطوان المدينة'
];

const RAPPORTEURS_LIST = [
  'تجريبات موسى', 'طوال محمد', 'مجاهيد مهدي', 'العتمد يوسف', 'الزاموم أحمد'
];

const FORET_AR: Record<string, string> = {
  'BENI HASSAN': 'بني حسن', 'BOUHACHEM': 'بوهشم', 'RHOMARA': 'غمارة',
  'TALEMBOTE': 'تالمبوت', 'JBEL DARSA': 'جبل درسة',
  'FNIDEQ': 'الفنيدق', 'BENSLIMANE': 'بن سليمان',
};

// ─────────────────────────────────────────────────────────────────────────────
// Types — Chevauchement
// ─────────────────────────────────────────────────────────────────────────────

export interface ChevauchementHit {
  foret: string; foretAr: string; canton: string;
  intersectionArea: number; importedArea: number; percentage: number;
  position: 'داخل الملك الغابوي' | 'جزئيا داخل الملك الغابوي' | 'خارج الملك الغابوي';
  properties: Record<string, any>;
}

export interface ChevauchementResult {
  layerName: string;
  importedArea: number; totalIntersectionArea: number; totalPercentage: number;
  globalPosition: 'داخل الملك الغابوي' | 'جزئيا داخل الملك الغابوي' | 'خارج الملك الغابوي';
  hits: ChevauchementHit[];
  importedGeoJSON: any; forestGeoJSON: any;
  intersections?: any[];
}

// ─────────────────────────────────────────────────────────────────────────────
// runChevauchementAnalysis
// ─────────────────────────────────────────────────────────────────────────────

export function runChevauchementAnalysis(
  importedGeojson: any, forestGeojson: any, layerName: string
): ChevauchementResult {
  // Normalize imported to single polygon
  let importedPoly: any;
  if (importedGeojson.type === 'FeatureCollection') {
    const polys = importedGeojson.features.filter((f: any) =>
      f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
    );
    if (polys.length === 0) throw new Error('No polygon features');
    importedPoly = polys.length === 1 ? polys[0] : turf.union(turf.featureCollection(polys));
  } else {
    importedPoly = importedGeojson.type === 'Feature' ? importedGeojson : turf.feature(importedGeojson);
  }

  const importedArea = turf.area(importedPoly);
  const hits: ChevauchementHit[] = [];

  for (const feat of (forestGeojson?.features || [])) {
    if (!feat.geometry) continue;
    if (feat.geometry.type !== 'Polygon' && feat.geometry.type !== 'MultiPolygon') continue;
    try {
      const intersection = turf.intersect(turf.featureCollection([importedPoly, feat]));
      if (!intersection) continue;
      const intersectionArea = turf.area(intersection);
      if (intersectionArea < 1) continue;
      const pct = (intersectionArea / importedArea) * 100;
      const foret = feat.properties?.FORET || feat.properties?.foret || '';
      const foretAr = FORET_AR[foret.toUpperCase()] || feat.properties?.FORET_AR || '';
      const canton = feat.properties?.CANTON || feat.properties?.canton || '';
      const position: ChevauchementHit['position'] =
        pct >= 95 ? 'داخل الملك الغابوي' : pct >= 1 ? 'جزئيا داخل الملك الغابوي' : 'خارج الملك الغابوي';
      hits.push({ foret, foretAr, canton, intersectionArea, importedArea, percentage: pct, position, properties: feat.properties || {} });
    } catch (_) {}
  }

  hits.sort((a, b) => b.intersectionArea - a.intersectionArea);
  const totalIntersectionArea = hits.reduce((s, h) => s + h.intersectionArea, 0);
  const totalPercentage = Math.min(100, (totalIntersectionArea / importedArea) * 100);
  const globalPosition: ChevauchementResult['globalPosition'] =
    totalPercentage >= 95 ? 'داخل الملك الغابوي' : totalPercentage >= 1 ? 'جزئيا داخل الملك الغابوي' : 'خارج الملك الغابوي';

  return { layerName, importedArea, totalIntersectionArea, totalPercentage, globalPosition, hits, importedGeoJSON: importedGeojson, forestGeoJSON: forestGeojson };
}

// ─────────────────────────────────────────────────────────────────────────────
// buildMiniMapSVG
// ─────────────────────────────────────────────────────────────────────────────

function buildMiniMapSVG(importedGeojson: any, forestFeats: any[]): string {
  try {
    const allFeats = [
      ...(importedGeojson.type === 'FeatureCollection' ? importedGeojson.features : [importedGeojson]),
      ...forestFeats.slice(0, 50)
    ].filter(f => f?.geometry);
    if (allFeats.length === 0) throw new Error('empty');
    const combined = turf.featureCollection(allFeats);
    const [minX, minY, maxX, maxY] = turf.bbox(combined);
    const W = 400, H = 260;
    const padX = (maxX - minX) * 0.08 || 0.002, padY = (maxY - minY) * 0.08 || 0.002;
    const bMinX = minX - padX, bMaxX = maxX + padX, bMinY = minY - padY, bMaxY = maxY + padY;
    const scaleX = W / (bMaxX - bMinX), scaleY = H / (bMaxY - bMinY);
    const toSVG = (c: number[]) => `${((c[0]-bMinX)*scaleX).toFixed(1)},${(H-(c[1]-bMinY)*scaleY).toFixed(1)}`;
    const geomPath = (geom: any): string => {
      if (!geom) return '';
      if (geom.type === 'Polygon') return geom.coordinates.map((r: number[][]) => 'M'+r.map(toSVG).join('L')+'Z').join(' ');
      if (geom.type === 'MultiPolygon') return geom.coordinates.flatMap((p: number[][][]) => p.map((r: number[][]) => 'M'+r.map(toSVG).join('L')+'Z')).join(' ');
      return '';
    };
    const forestPaths = forestFeats.map(f => `<path d="${geomPath(f.geometry)}" fill="#16a34a22" stroke="#16a34a" stroke-width="1.5"/>`).join('');
    const impFeats = importedGeojson.type === 'FeatureCollection' ? importedGeojson.features : [importedGeojson];
    const impPaths = impFeats.map((f: any) => `<path d="${geomPath(f.geometry)}" fill="#ef444433" stroke="#ef4444" stroke-width="2"/>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
      <rect width="${W}" height="${H}" fill="#e8f4f8"/>
      ${forestPaths}${impPaths}
      <text x="8" y="${H-6}" font-size="9" fill="#16a34a" font-family="Arial">■ Domaine Forestier</text>
      <text x="${W/2+10}" y="${H-6}" font-size="9" fill="#ef4444" font-family="Arial">■ Parcelle</text>
    </svg>`;
  } catch (_) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><text x="50%" y="50%" text-anchor="middle" fill="#999" font-size="12">Carte non disponible</text></svg>`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper — extract Lambert coords from polygon
// ─────────────────────────────────────────────────────────────────────────────

function extractLambertCoords(geojson: any): Array<{ num: number; x: string; y: string }> {
  try {
    let coords: number[][] = [];
    const feat = geojson.type === 'FeatureCollection' ? geojson.features[0] : geojson;
    const geom = feat?.geometry;
    if (geom?.type === 'Polygon') coords = geom.coordinates[0].slice(0, -1);
    else if (geom?.type === 'MultiPolygon') coords = geom.coordinates[0][0].slice(0, -1);
    if (coords.length === 0) return [];
    // Take up to 8 representative vertices
    const step = Math.max(1, Math.floor(coords.length / 8));
    const sampled = coords.filter((_: any, i: number) => i % step === 0).slice(0, 8);
    return sampled.map((c: number[], i: number) => {
      try {
        const [x, y] = proj4('EPSG:4326', 'EPSG:26191', [c[0], c[1]]);
        return { num: i + 1, x: x.toFixed(0), y: y.toFixed(0) };
      } catch (_) { return { num: i + 1, x: '', y: '' }; }
    });
  } catch (_) { return []; }
}

// ─────────────────────────────────────────────────────────────────────────────
// ChevauchementInlinePanel — shown under import button
// ─────────────────────────────────────────────────────────────────────────────

export function ChevauchementInlinePanel({ result }: { result: ChevauchementResult }) {
  const COL = {
    'داخل الملك الغابوي':         { bg: 'rgba(220,38,38,0.08)',  border: '#dc2626', text: '#dc2626', fr: 'TOTAL'   },
    'جزئيا داخل الملك الغابوي':  { bg: 'rgba(217,119,6,0.08)',  border: '#d97706', text: '#d97706', fr: 'PARTIEL' },
    'خارج الملك الغابوي':         { bg: 'rgba(22,101,52,0.08)',  border: '#166534', text: '#166534', fr: 'NÉANT'   },
  };
  const col = COL[result.globalPosition];

  const printReport = () => {
    const relevantForestFeats = (result.forestGeoJSON?.features || []).filter((f: any) => {
      const n = f.properties?.FORET || '';
      return result.hits.some(h => h.foret === n) || result.hits.length === 0;
    }).slice(0, 30);
    const miniSvg = buildMiniMapSVG(result.importedGeoJSON, relevantForestFeats);
    const hitsRows = result.hits.map(h => `<tr>
      <td style="border:1px solid #ddd;padding:4px 8px">${h.foret}</td>
      <td style="border:1px solid #ddd;padding:4px 8px;direction:rtl">${h.foretAr}</td>
      <td style="border:1px solid #ddd;padding:4px 8px">${h.canton}</td>
      <td style="border:1px solid #ddd;padding:4px 8px;text-align:center">${(h.intersectionArea/10000).toFixed(4)} ha</td>
      <td style="border:1px solid #ddd;padding:4px 8px;text-align:center;font-weight:bold;color:${h.percentage>=95?'#dc2626':h.percentage>=1?'#d97706':'#166534'}">${h.percentage.toFixed(1)}%</td>
    </tr>`).join('');

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">
<title>تقرير تحليل التداخل</title>
<style>
  body{font-family:'Arial',sans-serif;direction:rtl;padding:1.5cm 2cm;font-size:10pt;color:#111;line-height:1.7}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;padding-bottom:10px;border-bottom:2px solid #166534}
  .title{font-size:15pt;font-weight:bold;text-align:center;margin:14px 0;color:#1a1a1a;text-decoration:underline}
  table{width:100%;border-collapse:collapse;margin:10px 0;font-size:9.5pt}
  th{background:#e8f5e9;border:1px solid #ccc;padding:5px 8px;font-weight:bold;text-align:center}
  td{vertical-align:middle}
  .badge{display:inline-block;border:2px solid ${col.border};color:${col.border};background:${col.bg};padding:3px 14px;font-weight:bold;font-size:13pt;letter-spacing:1.5px;border-radius:3px}
  .logo-circle{width:55px;height:55px;border:2px solid #166534;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:7pt;font-weight:bold;color:#166534;text-align:center;margin:0 auto 4px}
  @media print{@page{size:A4;margin:1cm 1.5cm}body{padding:0}}
</style></head><body>
<div class="header">
  <div style="font-size:8.5pt;line-height:1.8"><strong>المملكة المغربية</strong><br>الوكالة الوطنية للمياه والغابات<br>المديرية الجهوية طنجة-تطوان-الحسيمة<br>المديرية الإقليمية تطوان<br>مركز حماية الغابات المضيق-الفنيدق</div>
  <div style="text-align:center;padding:0 10px"><div class="logo-circle">ANEF</div><div style="font-size:7pt;color:#555">الوكالة الوطنية<br>للمياه والغابات</div></div>
  <div style="text-align:left;direction:ltr;font-size:8.5pt;line-height:1.8"><strong>Royaume du Maroc</strong><br>Agence Nationale des Eaux et Forêts<br>Direction Régionale TTH<br>Direction Provinciale de Tétouan<br>Centre de Protection des Forêts<br>M'diq-Fnideq</div>
</div>
<div class="title">تقرير تحليل التداخل مع الملك الغابوي</div>
<table><tr><th colspan="2">معلومات عامة — Informations générales</th></tr>
  <tr><td style="border:1px solid #ddd;padding:4px 8px;font-weight:bold">اسم الطبقة المستوردة</td><td style="border:1px solid #ddd;padding:4px 8px">${result.layerName}</td></tr>
  <tr><td style="border:1px solid #ddd;padding:4px 8px;font-weight:bold">المساحة الإجمالية للقطعة</td><td style="border:1px solid #ddd;padding:4px 8px">${(result.importedArea/10000).toFixed(4)} هكتار (${Math.round(result.importedArea).toLocaleString()} م²)</td></tr>
  <tr><td style="border:1px solid #ddd;padding:4px 8px;font-weight:bold">مساحة التقاطع مع الملك الغابوي</td><td style="border:1px solid #ddd;padding:4px 8px">${(result.totalIntersectionArea/10000).toFixed(4)} هكتار</td></tr>
  <tr><td style="border:1px solid #ddd;padding:4px 8px;font-weight:bold">نسبة التداخل</td><td style="border:1px solid #ddd;padding:4px 8px"><strong>${result.totalPercentage.toFixed(1)}%</strong></td></tr>
  <tr><td style="border:1px solid #ddd;padding:4px 8px;font-weight:bold">الوضعية</td><td style="border:1px solid #ddd;padding:4px 8px"><span class="badge">${result.globalPosition}</span></td></tr>
</table>
${result.hits.length > 0 ? `<div style="margin:14px 0 6px;font-size:11pt;font-weight:bold">تفاصيل التقاطع مع الملك الغابوي :</div>
<table><tr><th>الغابة (fr)</th><th>الغابة (ar)</th><th>القسم / Canton</th><th>مساحة التقاطع</th><th>النسبة</th></tr>${hitsRows}</table>`
: `<p style="text-align:center;color:#166534;font-size:12pt;margin:20px 0;font-weight:bold">لا يوجد تداخل — القطعة خارج الملك الغابوي</p>`}
<div style="margin:18px 0;text-align:center">${miniSvg}</div>
<div style="margin-top:20px;font-size:8.5pt;color:#555;border-top:1px solid #ddd;padding-top:8px;line-height:1.6">
  <strong>ملاحظة قانونية:</strong> يبقى للإدارة حق الرجوع إذا ظهرت قوانين جديدة. هذه الإفادة لا تكسب طالبها حق الملكية.
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:28px">
  <div style="text-align:center;border-top:1px solid #999;padding-top:8px;font-size:9pt">رئيس مركز حماية الغابات<br>المضيق - الفنيدق<br><br><strong>مومن معاذ</strong></div>
  <div style="text-align:center;border-top:1px solid #999;padding-top:8px;font-size:9pt">عناصر الفرقة المتنقلة<br><br><br></div>
</div>
</body></html>`;
    const w = window.open('', '_blank', 'width=960,height=800');
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => { w.focus(); w.print(); }, 400); }
  };

  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: col.border, background: col.bg }}>
      <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: `1px solid ${col.border}40` }}>
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: col.text }}>
          Chevauchement — {col.fr}
        </span>
        <span className="text-[11px] font-mono font-bold" style={{ color: col.text }}>
          {result.totalPercentage.toFixed(1)}%
        </span>
      </div>
      <div className="px-3 py-2 space-y-1.5">
        <div className="text-[11px] font-bold" style={{ color: col.text, direction: 'rtl' }}>
          {result.globalPosition}
        </div>
        <div className="text-[10px] text-[var(--text-muted)]">
          {(result.importedArea/10000).toFixed(3)} ha · تقاطع: {(result.totalIntersectionArea/10000).toFixed(3)} ha
        </div>
        {result.hits.slice(0, 3).map((h, i) => (
          <div key={i} className="text-[10px] flex items-center justify-between">
            <span className="text-[var(--text-main)] font-medium truncate flex-1 mr-2">🌲 {h.foret}{h.canton ? ` — ${h.canton}` : ''}</span>
            <span className="font-mono font-bold shrink-0" style={{ color: col.text }}>{h.percentage.toFixed(1)}%</span>
          </div>
        ))}
        {result.hits.length > 3 && (
          <div className="text-[9px] text-[var(--text-muted)]">+ {result.hits.length - 3} autre(s)…</div>
        )}
        <button onClick={printReport}
          className="mt-1 w-full text-[10px] font-bold py-1.5 rounded border transition-colors flex items-center justify-center gap-1.5"
          style={{ borderColor: col.border, color: col.text }}>
          <Printer className="w-3 h-3" /> تقرير PDF
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI Helpers
// ─────────────────────────────────────────────────────────────────────────────

const inp = "w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg p-2 text-sm text-[var(--text-main)] focus:outline-none focus:border-[var(--brand)] transition-colors";
const lbl = "block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1";
const sel = "w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg p-2 text-sm text-[var(--text-main)] focus:outline-none focus:border-[var(--brand)] transition-colors";

function ModalWrap({ title, onClose, wide = false, children }: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-2xl w-full overflow-hidden flex flex-col ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
           style={{ maxHeight: '90vh' }}>
        <div className="flex justify-between items-center p-4 border-b border-[var(--border-color)] bg-[var(--bg-main)] shrink-0">
          <h3 className="text-[var(--text-main)] font-semibold text-sm tracking-wide">{title}</h3>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-main)] bg-[var(--bg-surface)] hover:bg-[var(--bg-main)] p-1.5 rounded-lg border border-[var(--border-color)]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder = '' }: any) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      <input type={type} value={value} onChange={(e: any) => onChange(e.target.value)} placeholder={placeholder} className={inp} />
    </div>
  );
}

function Section({ title, children, defaultOpen = false }: any) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-[var(--border-color)] rounded-lg overflow-hidden">
      <button onClick={() => setOpen((o: boolean) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-[var(--bg-main)] text-[11px] font-bold text-[var(--text-main)] uppercase tracking-wider hover:bg-[var(--bg-surface)] transition-colors">
        {title}
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      {open && <div className="p-3 space-y-3 bg-[var(--bg-surface)]">{children}</div>}
    </div>
  );
}

function printHtml(html: string) {
  const w = window.open('', '_blank', 'width=960,height=750');
  if (w) { w.document.write(html); w.document.close(); setTimeout(() => { w.focus(); w.print(); }, 400); }
}

function downloadWord(html: string, filename: string) {
  const wordHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>${html}</html>`;
  const blob = new Blob(['\ufeff', wordHtml], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

const ANEF_LOGO_HTML = `
<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
  <img src="/images/logo-anef.png" alt="ANEF" style="height:55px;width:auto" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
  <div style="display:none;width:55px;height:55px;border:2px solid #166534;border-radius:50%;align-items:center;justify-content:center;font-size:7pt;font-weight:bold;color:#166534;text-align:center;flex-shrink:0">ANEF</div>
</div>`;

// ─────────────────────────────────────────────────────────────────────────────
// FicheConfig & default
// ─────────────────────────────────────────────────────────────────────────────

export interface FicheConfig {
  numero: string; date: string; refEnvoi: string;
  immeubleDit: string; objetRequisition: string;
  bulletinOfficielNum: string; bulletinOfficielDate: string;
  demandeParNom: string; communeRurale: string; cercle: string; caidat: string;
  foret: string; canton: string; lambertX: string; lambertY: string;
  perimetre: string; lieudit: string;
  superficieDeclareHa: string; superficieDeclareAr: string; superficieDeclareCa: string;
  superficieBornee: string; borneNumero: string;
  distanceDescription: string; descriptionVegetation: string;
  reboisement: string; equipement: string; exploitation: string; pvDresses: string;
  actesPropriete: string;
  'empiètement': 'TOTAL' | 'PARTIEL' | 'NÉANT';
  avis: 'FAVORABLE' | 'DÉFAVORABLE';
  conclusion: string; signataire: string; signataireDate: string;
}

const FICHE_DEFAULT: FicheConfig = {
  numero: '', date: new Date().toLocaleDateString('fr-FR'), refEnvoi: '',
  immeubleDit: '', objetRequisition: '', bulletinOfficielNum: '', bulletinOfficielDate: '',
  demandeParNom: '', communeRurale: '', cercle: '', caidat: '',
  foret: '', canton: '', lambertX: '', lambertY: '',
  perimetre: '', lieudit: '',
  superficieDeclareHa: '00', superficieDeclareAr: '00', superficieDeclareCa: '00',
  superficieBornee: '', borneNumero: '',
  distanceDescription: '', descriptionVegetation: 'matorral et chêne liège',
  reboisement: '—', equipement: '—', exploitation: '—', pvDresses: '—',
  actesPropriete: '',
  'empiètement': 'TOTAL', avis: 'FAVORABLE',
  conclusion: '', signataire: '', signataireDate: '',
};

// ─────────────────────────────────────────────────────────────────────────────
// buildFicheHTML
// ─────────────────────────────────────────────────────────────────────────────

function buildFicheHTML(c: FicheConfig): string {
  const empColor = c['empiètement']==='TOTAL' ? '#dc2626' : c['empiètement']==='PARTIEL' ? '#d97706' : '#166534';
  const empBg    = c['empiètement']==='TOTAL' ? 'rgba(220,38,38,0.08)' : c['empiètement']==='PARTIEL' ? 'rgba(217,119,6,0.08)' : 'rgba(22,101,52,0.08)';
  const avisColor = c.avis==='DÉFAVORABLE' ? '#dc2626' : '#166534';
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Fiche Technique de Réquisition</title>
<style>
  @page{size:A4 landscape;margin:1.2cm 1.5cm}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:"Times New Roman",serif;font-size:9.5pt;color:#111;line-height:1.5;height:100vh}
  .page{display:flex;height:100%;gap:0}
  .col-left{width:55%;padding-right:14px;border-right:1.5px solid #555;display:flex;flex-direction:column;gap:5px;overflow:hidden}
  .col-right{width:45%;padding-left:14px;display:flex;flex-direction:column;gap:8px}
  .header-row{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px}
  h2{text-align:center;font-size:11pt;text-decoration:underline;margin:4px 0 6px;line-height:1.4}
  .sec{margin-bottom:3px}.sec-title{font-weight:bold;text-decoration:underline;font-size:9.5pt;margin-bottom:1px}
  .sec p{margin:1px 0;font-size:8.8pt}
  .sup-grid{display:flex;gap:6px;align-items:center;margin:1px 0}
  .sup-cell{border:1px solid #999;padding:1px 6px;font-weight:bold;font-size:9pt;background:#fafafa}
  .sup-unit{font-weight:bold;font-size:8pt;color:#555}
  .badge{display:inline-block;border:2px solid ${empColor};color:${empColor};background:${empBg};padding:1px 12px;font-weight:bold;font-size:11pt;letter-spacing:2px}
  .croquis-box{flex:1;min-height:0}
  .croquis-title{font-size:9.5pt;font-weight:bold;text-align:center;margin-bottom:6px;text-decoration:underline}
  .correspondence{border-top:1.5px solid #555;padding-top:8px;margin-top:auto;font-size:8.5pt}
  .corr-avis{font-size:9pt;margin:4px 0}.avis-word{font-size:12pt;font-weight:bold;color:${avisColor}}
  p{margin:1px 0}strong{font-weight:bold}u{text-decoration:underline}
</style></head><body>
<div class="page">
  <div class="col-left">
    <div class="header-row">
      <div style="font-size:9pt;line-height:1.7"><strong>DRANEF : TTH</strong><br><strong>DPANEF : Tétouan</strong><br><strong>CPF : M'diq-Fnideq</strong><br><strong>BM : M'diq-Fnideq</strong></div>
      <div style="font-size:9pt;text-align:right;line-height:1.7">N° <strong>${c.numero||'___'}</strong><br>Le, <strong>${c.date||''}</strong><br>Réf : Envoi CPF n°<strong>${c.refEnvoi||'___'}</strong></div>
    </div>
    <h2>- RÉQUISITION DE LA DÉLIMITATION OU D'IMMATRICULATION -<br><span style="font-size:10pt">- FICHE DE RECONNAISSANCE -</span></h2>
    <div class="sec">
      <p><u>L'immeuble foncier dit :</u> <strong>${c.immeubleDit||''}</strong></p>
      <p>Objet de la réquisition N° : <strong>${c.objetRequisition||''}</strong></p>
      <p>Bulletin officiel N° <strong>${c.bulletinOfficielNum||''}</strong> du <strong>${c.bulletinOfficielDate||''}</strong></p>
      <p>A la demande de : <strong>${c.demandeParNom||''}</strong></p>
      <p>Visité par la commission de bornage :</p>
    </div>
    <div class="sec">
      <div class="sec-title">2°) SITUATION ADMINISTRATIVE ET FORESTIÈRE :</div>
      <p>- Commune Rurale de : <strong>${c.communeRurale||''}</strong> &nbsp; Cercle de : <strong>${c.cercle||''}</strong> &nbsp; Caïdat de : <strong>${c.caidat||''}</strong></p>
      <p>- Forêt : <strong>${c.foret||''}</strong>, BM : M'diq-Fnideq, Canton de <strong>${c.canton||''}</strong></p>
      <p>- Périmètre de <strong>${c.perimetre||''}</strong>, &nbsp; Lieudit : <strong>${c.lieudit||''}</strong></p>
      <p>- Coordonnées Lambert &nbsp; X : <strong>${c.lambertX||''}</strong> &nbsp; ; &nbsp; Y : <strong>${c.lambertY||''}</strong></p>
      <p>- Superficie déclarée :
        <span class="sup-grid">
          <span class="sup-cell">${c.superficieDeclareHa||'00'}</span><span class="sup-unit">HA</span>
          <span class="sup-cell">${c.superficieDeclareAr||'00'}</span><span class="sup-unit">A</span>
          <span class="sup-cell">${c.superficieDeclareCa||'00'}</span><span class="sup-unit">CA</span>
        </span>
        &nbsp; Superficie bornée : <strong>${c.superficieBornee||''}</strong>
      </p>
      <p>- N° de la borne la plus proche : <strong>${c.borneNumero||''}</strong></p>
    </div>
    <div class="sec">
      <div class="sec-title">3°) DESCRIPTION DE L'IMMEUBLE :</div>
      <p>- Distance par rapport à la forêt : <strong style="color:${empColor}">${c.distanceDescription||''}</strong></p>
      <p>- Description : ${c.descriptionVegetation||'matorral et chêne liège'}</p>
    </div>
    <div class="sec">
      <div class="sec-title">4°) INTERVENTIONS FORESTIÈRES :</div>
      <p>- Reboisement : ${c.reboisement||'—'} &nbsp; - Équipement : ${c.equipement||'—'}</p>
      <p>- Exploitation : ${c.exploitation||'—'} &nbsp; - P.V. dressés : ${c.pvDresses||'—'}</p>
    </div>
    <div class="sec">
      <div class="sec-title">5°) ACTES DE PROPRIÉTÉ EN PRÉSENCE :</div>
      <p>${c.actesPropriete||'Présenté par le requérant :'}</p>
    </div>
    <div class="sec">
      <div class="sec-title">6°) EMPIÈTEMENT DE LA RÉQUISITION :</div>
      <p style="margin-top:3px"><span class="badge">EMPIÈTEMENT ${c['empiètement']||'TOTAL'}</span></p>
    </div>
    <div class="sec">
      <div class="sec-title">7°) CONCLUSION ET ÉLÉMENTS DIVERS :</div>
      <p>${c.conclusion||''}</p>
      <p style="text-align:right;margin-top:2px">En date du : <strong>${c.signataireDate||''}</strong></p>
    </div>
  </div>
  <div class="col-right">
    <div class="croquis-title">Croquis de situation à valider :</div>
    <div class="croquis-box"><div style="width:100%;height:260px;border:1px dashed #bbb;display:flex;align-items:center;justify-content:center;color:#bbb;font-style:italic;font-size:10px;background:#f9f9f9;border-radius:4px">[Croquis — à compléter]</div></div>
    <div class="correspondence">
      <div>N° &nbsp;&nbsp;&nbsp; /CPF/M'diq-Fnideq &nbsp;&nbsp;&nbsp;&nbsp; M'diq, Le ${c.signataireDate||''}</div>
      <div style="text-align:center;font-style:italic;margin:6px 0">Copie conforme transmise à<br><strong>Mr le Directeur Provincial de l'ANEF de TETOUAN</strong></div>
      <div class="corr-avis">« Avis&nbsp;<span class="avis-word">${c.avis||'FAVORABLE'}</span>&nbsp;».</div>
      <div style="text-align:right;margin-top:8px"><strong>Le Chef de CPF de M'diq - Fnideq</strong><br>${c.signataire||''}</div>
    </div>
  </div>
</div>
</body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// FicheModal
// ─────────────────────────────────────────────────────────────────────────────

export function FicheModal({ onClose, forestData, communesData, importedLayer }: {
  onClose: () => void;
  forestData?: any;
  communesData?: any;
  importedLayer?: { name: string; geojson: any } | null;
}) {
  const [c, setC] = useState<FicheConfig>(FICHE_DEFAULT);
  const set = (k: keyof FicheConfig) => (v: string) => setC(prev => ({ ...prev, [k]: v }));

  // Extract unique forêts and cantons from forestData
  const forets: string[] = forestData?.features
    ? [...new Set(forestData.features.map((f: any) => f.properties?.FORET || '').filter(Boolean))] as string[]
    : [];
  const cantons: string[] = c.foret && forestData?.features
    ? [...new Set(forestData.features.filter((f: any) => f.properties?.FORET === c.foret).map((f: any) => f.properties?.CANTON || '').filter(Boolean))] as string[]
    : [];
  const communes: string[] = communesData?.features
    ? [...new Set(communesData.features.map((f: any) => f.properties?.NomFr || '').filter(Boolean))].sort() as string[]
    : [];

  // Auto-fill from importedLayer
  useEffect(() => {
    if (!importedLayer) return;
    setC(prev => ({ ...prev, immeubleDit: prev.immeubleDit || importedLayer.name }));
    if (importedLayer.geojson) {
      try {
        const area = turf.area(importedLayer.geojson);
        const ha = Math.floor(area / 10000);
        const ar = Math.floor((area % 10000) / 100);
        const ca = Math.round(area % 100);
        const perim = turf.length(importedLayer.geojson, { units: 'meters' });
        setC(prev => ({
          ...prev,
          superficieDeclareHa: String(ha),
          superficieDeclareAr: String(ar).padStart(2, '0'),
          superficieDeclareCa: String(ca).padStart(2, '0'),
          perimetre: perim.toFixed(0),
        }));
        // Lambert centroid
        const centroid = turf.centroid(importedLayer.geojson);
        const [lng, lat] = centroid.geometry.coordinates;
        const [lx, ly] = proj4('EPSG:4326', 'EPSG:26191', [lng, lat]);
        setC(prev => ({ ...prev, lambertX: lx.toFixed(0), lambertY: ly.toFixed(0) }));
      } catch (_) {}
    }
  }, [importedLayer]);

  return (
    <ModalWrap title="Fiche Technique de Réquisition" onClose={onClose} wide>
      <Section title="En-tête" defaultOpen>
        <div className="grid grid-cols-3 gap-2">
          <Field label="N°" value={c.numero} onChange={set('numero')} />
          <Field label="Date" value={c.date} onChange={set('date')} />
          <Field label="Réf Envoi CPF" value={c.refEnvoi} onChange={set('refEnvoi')} />
        </div>
      </Section>
      <Section title="1. Identification" defaultOpen>
        <Field label="Immeuble dit" value={c.immeubleDit} onChange={set('immeubleDit')} placeholder="Nom de l'immeuble foncier" />
        <div className="grid grid-cols-2 gap-2">
          <Field label="N° Réquisition" value={c.objetRequisition} onChange={set('objetRequisition')} />
          <Field label="Demandé par" value={c.demandeParNom} onChange={set('demandeParNom')} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Bulletin Officiel N°" value={c.bulletinOfficielNum} onChange={set('bulletinOfficielNum')} />
          <Field label="Date BO" value={c.bulletinOfficielDate} onChange={set('bulletinOfficielDate')} />
        </div>
      </Section>
      <Section title="2. Situation Administrative & Forestière">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={lbl}>Commune</label>
            {communes.length > 0
              ? <select value={c.communeRurale} onChange={e => set('communeRurale')(e.target.value)} className={sel}><option value="">—</option>{communes.map(v => <option key={v}>{v}</option>)}</select>
              : <input value={c.communeRurale} onChange={e => set('communeRurale')(e.target.value)} className={inp} />}
          </div>
          <Field label="Cercle" value={c.cercle} onChange={set('cercle')} />
          <Field label="Caïdat" value={c.caidat} onChange={set('caidat')} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>Forêt</label>
            {forets.length > 0
              ? <select value={c.foret} onChange={e => { set('foret')(e.target.value); set('canton')(''); }} className={sel}><option value="">—</option>{forets.map(v => <option key={v}>{v}</option>)}</select>
              : <input value={c.foret} onChange={e => set('foret')(e.target.value)} className={inp} />}
          </div>
          <div>
            <label className={lbl}>Canton</label>
            {cantons.length > 0
              ? <select value={c.canton} onChange={e => set('canton')(e.target.value)} className={sel}><option value="">—</option>{cantons.map(v => <option key={v}>{v}</option>)}</select>
              : <input value={c.canton} onChange={e => set('canton')(e.target.value)} className={inp} />}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Lieu-dit" value={c.lieudit} onChange={set('lieudit')} />
          <Field label="Périmètre (m)" value={c.perimetre} onChange={set('perimetre')} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Lambert X" value={c.lambertX} onChange={set('lambertX')} />
          <Field label="Lambert Y" value={c.lambertY} onChange={set('lambertY')} />
        </div>
        <div>
          <label className={lbl}>Superficie Déclarée (HA / A / CA)</label>
          <div className="grid grid-cols-3 gap-2">
            <input value={c.superficieDeclareHa} onChange={e => set('superficieDeclareHa')(e.target.value)} className={inp} placeholder="HA" />
            <input value={c.superficieDeclareAr}  onChange={e => set('superficieDeclareAr')(e.target.value)}  className={inp} placeholder="A" />
            <input value={c.superficieDeclareCa} onChange={e => set('superficieDeclareCa')(e.target.value)} className={inp} placeholder="CA" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Superficie bornée" value={c.superficieBornee} onChange={set('superficieBornee')} />
          <Field label="N° Borne la plus proche" value={c.borneNumero} onChange={set('borneNumero')} />
        </div>
      </Section>
      <Section title="3–5. Description & Interventions">
        <Field label="Distance / Position par rapport à la forêt" value={c.distanceDescription} onChange={set('distanceDescription')} />
        <Field label="Description végétation" value={c.descriptionVegetation} onChange={set('descriptionVegetation')} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Reboisement" value={c.reboisement} onChange={set('reboisement')} />
          <Field label="Équipement"  value={c.equipement}  onChange={set('equipement')} />
          <Field label="Exploitation" value={c.exploitation} onChange={set('exploitation')} />
          <Field label="P.V. dressés" value={c.pvDresses} onChange={set('pvDresses')} />
        </div>
        <Field label="Actes de propriété" value={c.actesPropriete} onChange={set('actesPropriete')} />
      </Section>
      <Section title="6–7. Empiètement, Avis & Conclusion" defaultOpen>
        <div>
          <label className={lbl}>Empiètement</label>
          <div className="flex gap-2">
            {(['TOTAL','PARTIEL','NÉANT'] as const).map(v => (
              <button key={v} onClick={() => setC(p => ({...p, 'empiètement': v}))}
                className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${c['empiètement']===v ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--brand)]'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={lbl}>Avis</label>
          <div className="flex gap-2">
            {(['FAVORABLE','DÉFAVORABLE'] as const).map(v => (
              <button key={v} onClick={() => setC(p => ({...p, avis: v}))}
                className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${c.avis===v ? (v==='FAVORABLE'?'bg-emerald-600 text-white border-emerald-600':'bg-red-600 text-white border-red-600') : 'border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--brand)]'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={lbl}>Conclusion</label>
          <textarea value={c.conclusion} onChange={e => set('conclusion')(e.target.value)} rows={3}
            className={`${inp} resize-none`} placeholder="Éléments divers et conclusion..." />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Signataire (Chef CPF)" value={c.signataire} onChange={set('signataire')} />
          <Field label="Date signature" value={c.signataireDate} onChange={set('signataireDate')} />
        </div>
      </Section>
      <div className="flex gap-2 pt-1">
        <button onClick={() => printHtml(buildFicheHTML(c))}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[var(--brand)] hover:opacity-90 text-white font-semibold rounded-lg text-sm">
          <Printer className="w-4 h-4" /> Imprimer PDF
        </button>
        <button onClick={() => downloadWord(buildFicheHTML(c), `fiche-${c.immeubleDit||'requisition'}.doc`)}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[var(--bg-main)] border border-[var(--border-color)] hover:border-[var(--brand)] text-[var(--text-main)] font-semibold rounded-lg text-sm">
          <FileDown className="w-4 h-4" /> Word (.doc)
        </button>
        <button onClick={() => navigator.clipboard.writeText(`FICHE ${c.immeubleDit} | Forêt: ${c.foret} | Emp: ${c['empiètement']}`).catch(()=>{})}
          title="Copier" className="px-3 py-2.5 bg-[var(--bg-main)] border border-[var(--border-color)] hover:border-[var(--brand)] text-[var(--text-muted)] rounded-lg">
          <Copy className="w-4 h-4" />
        </button>
      </div>
    </ModalWrap>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AttestConfig & default
// ─────────────────────────────────────────────────────────────────────────────

export interface AttestConfig {
  nomProprietaire: string; referenceParcel: string;
  commune: string; qiada: string; omala: string;
  foret: string; foretAr: string; canton: string; cpf: string;
  superficieM2: string; dateVisite: string;
  limiteNord: string; limiteSud: string; limiteEst: string; limiteOuest: string;
  positionDomaine: 'داخل الملك الغابوي' | 'جزئيا داخل الملك الغابوي' | 'خارج الملك الغابوي';
  rapporteurs: string[];
  chefCPF: string;
  coordPoints: Array<{ num: number; x: string; y: string }>;
}

const ATTEST_DEFAULT: AttestConfig = {
  nomProprietaire: '', referenceParcel: '', commune: '', qiada: '', omala: 'تطوان',
  foret: '', foretAr: '', canton: '', cpf: "M'diq-Fnideq",
  superficieM2: '', dateVisite: new Date().toISOString().split('T')[0],
  limiteNord: '', limiteSud: '', limiteEst: '', limiteOuest: '',
  positionDomaine: 'خارج الملك الغابوي',
  rapporteurs: [],
  chefCPF: 'مومن معاذ',
  coordPoints: Array.from({ length: 6 }, (_, i) => ({ num: i+1, x: '', y: '' })),
};

// ─────────────────────────────────────────────────────────────────────────────
// buildAttestationHTML
// ─────────────────────────────────────────────────────────────────────────────

function buildAttestationHTML(cfg: AttestConfig): string {
  const date = new Date(cfg.dateVisite || Date.now());
  const dayAr   = date.getDate();
  const monthAr = date.toLocaleDateString('ar-MA', { month: 'long' });
  const yearAr  = date.getFullYear();
  const chk = (val: string, opt: string) =>
    `<span style="display:inline-block;width:13px;height:13px;border:1.5px solid #333;border-radius:2px;background:${val===opt?'#166534':'white'};margin-left:4px;vertical-align:middle"></span>`;
  const pointsRows = cfg.coordPoints.filter(p => p.x||p.y).map(p =>
    `<tr><td style="border:1px solid #999;padding:3px 8px;text-align:center;font-size:9pt">${p.num}</td>
     <td style="border:1px solid #999;padding:3px 8px;text-align:center;font-size:9pt;direction:ltr">${p.x||'—'}</td>
     <td style="border:1px solid #999;padding:3px 8px;text-align:center;font-size:9pt;direction:ltr">${p.y||'—'}</td></tr>`).join('');

  const rapporteursSig = cfg.rapporteurs.length > 0
    ? cfg.rapporteurs.map(r => `<td style="border:1px solid #555;padding:6px 8px;text-align:center;font-size:8.5pt;vertical-align:top;height:70px"><strong>${r}</strong></td>`).join('')
    : `<td style="border:1px solid #555;padding:6px 8px;text-align:center;font-size:8.5pt;vertical-align:top;height:70px"></td>`;

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar"><head><meta charset="UTF-8"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Arial',sans-serif;font-size:10pt;color:#111;direction:rtl}
  .page{width:210mm;min-height:297mm;padding:12mm 15mm 10mm;margin:auto;background:#fff}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;font-size:7.5pt;line-height:1.7}
  .title{text-align:center;font-size:14pt;font-weight:bold;text-decoration:underline;margin:12px 0 14px}
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:10px}
  .field{margin-bottom:5px;font-size:9.5pt}
  .field-label{font-weight:bold}
  .uline{border-bottom:1px solid #555;display:inline-block;min-width:100px;padding-bottom:1px}
  .section-title{font-weight:bold;font-size:10pt;margin:10px 0 5px}
  .coords-table{width:100%;border-collapse:collapse;margin:6px 0}
  .coords-table th{background:#e8f5e9;border:1px solid #999;padding:4px 8px;font-size:9pt;text-align:center}
  .checkbox-row{display:flex;gap:24px;margin:8px 0;font-size:9.5pt;align-items:center;flex-wrap:wrap}
  .sig-table{width:100%;border-collapse:collapse;margin-top:8px}
  .sig-table td{border:1px solid #555;padding:6px 8px;text-align:center;font-size:8.5pt;vertical-align:top;height:70px}
  .sig-head{font-weight:bold;height:auto!important;background:#f4f7f4;padding:4px 8px!important}
  .legal{font-size:7.5pt;color:#555;margin-top:10px;padding-top:8px;border-top:1px solid #ddd;line-height:1.6}
  .ref-box{border:1px solid #888;padding:3px 10px;display:inline-block;font-size:9pt}
  @media print{@page{size:A4;margin:0}body{margin:0}}
</style>
</head><body><div class="page">
  <div class="header">
    <div style="flex:1;line-height:1.8">المملكة المغربية<br/>الوكالة الوطنية للمياه والغابات<br/>المديرية الجهوية طنجة-تطوان-الحسيمة<br/>المديرية الإقليمية تطوان<br/>مركز حماية الغابات المضيق-الفنيدق</div>
    <div style="text-align:center;padding:0 12px;flex-shrink:0">
      <img src="/images/logo-anef.png" alt="ANEF" style="height:60px;width:auto" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
      <div style="display:none;width:60px;height:60px;border:2px solid #166534;border-radius:50%;align-items:center;justify-content:center;margin:0 auto 4px;font-size:7pt;font-weight:bold;color:#166534;text-align:center;flex-shrink:0">ANEF</div>
      <div style="font-size:7pt;color:#555;line-height:1.4;margin-top:4px">الوكالة الوطنية للمياه والغابات<br/>Agence Nationale des Eaux et Forêts</div>
    </div>
    <div style="text-align:left;direction:ltr;font-size:7.5pt;flex:1;line-height:1.8">Royaume du Maroc<br/>Agence Nationale des Eaux et Forêts<br/>Direction Régionale Tanger-Tétouan-Al Hoceima<br/>Direction Provinciale de Tétouan<br/>Centre de Protection des Forêts: ${cfg.cpf||"M'diq-Fnideq"}</div>
  </div>
  <div class="title">بطاقة معاينة حول إنتفاء الصبغة الغابوية</div>
  <div class="two-col">
    <div>
      <div class="field"><span class="field-label">اسم العقار: </span><span class="uline">${cfg.foret||''}</span>${cfg.foretAr ? ` / <span class="uline">${cfg.foretAr}</span>` : ''}</div>
      <div class="field"><span class="field-label">المرجع: </span><span class="ref-box">${cfg.referenceParcel||'...... م ح غ / م ف'}</span></div>
      <div class="field"><span class="field-label">الجماعة: </span><span class="uline">${cfg.commune||''}</span></div>
      <div class="field"><span class="field-label">قيادة: </span><span class="uline">${cfg.qiada||''}</span></div>
      <div class="field"><span class="field-label">اسم صاحب العقار: </span><span class="uline">${cfg.nomProprietaire||''}</span></div>
      <div class="field"><span class="field-label">بتاريخ: </span> يوم <span class="uline">${dayAr}</span> شهر <span class="uline">${monthAr}</span> سنة <span class="uline">${yearAr}</span></div>
      <div class="field"><span class="field-label">عمالة: </span><span class="uline">${cfg.omala||'تطوان'}</span></div>
      <div class="field"><span class="field-label">مساحة الأرض: </span><span class="uline">${cfg.superficieM2||''}</span> متر مربع</div>
    </div>
    <div>
      <div class="section-title" style="text-align:center">الإحداثيات (لامبار):</div>
      <table class="coords-table">
        <thead><tr><th>النقطة</th><th>X</th><th>Y</th></tr></thead>
        <tbody>${pointsRows||'<tr><td colspan="3" style="text-align:center;padding:6px;color:#999;font-size:8pt">—</td></tr>'}</tbody>
      </table>
    </div>
  </div>
  <div class="section-title">حدود العقار كما يلي:</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:9.5pt;margin-bottom:10px">
    <div><strong>الشمال:</strong> <span class="uline">${cfg.limiteNord||''}</span></div>
    <div><strong>الجنوب:</strong> <span class="uline">${cfg.limiteSud||''}</span></div>
    <div><strong>الغرب:</strong> <span class="uline">${cfg.limiteOuest||''}</span></div>
    <div><strong>الشرق:</strong> <span class="uline">${cfg.limiteEst||''}</span></div>
  </div>
  <div class="section-title">وضعية العقار بالنسبة للملك الغابوي :</div>
  <div class="checkbox-row">
    ${chk(cfg.positionDomaine,'خارج الملك الغابوي')} خارج الملك الغابوي &nbsp;
    ${chk(cfg.positionDomaine,'جزئيا داخل الملك الغابوي')} جزئيا داخل الملك الغابوي &nbsp;
    ${chk(cfg.positionDomaine,'داخل الملك الغابوي')} داخل الملك الغابوي
  </div>
  <div class="legal">المحدد بموجب مرسوم رقم 2.84321 صادر في 13 محرم 1405 الموافق ل 9 أكتوبر 1984. ويبقى للإدارة حق الرجوع إذا ظهرت قوانين جديدة كما أن هذه الإفادة لا يمكن الاستشهاد بها خارج الإدارة ولا تكسب طالبها حق الملكية لهذا العقار.</div>
  <div class="section-title" style="margin-top:12px">إمضاء اللجنة التي عاينت العقار:</div>
  <table class="sig-table">
    <tr>
      <td class="sig-head">رئيس مركز حماية الغابات المضيق - الفنيدق</td>
      <td class="sig-head" colspan="${Math.max(1,cfg.rapporteurs.length)}">عناصر الفرقة المتنقلة المضيق-الفنيدق</td>
    </tr>
    <tr>
      <td style="border:1px solid #555;padding:6px 8px;text-align:center;font-size:8.5pt;vertical-align:top;height:70px"><strong>${cfg.chefCPF||''}</strong></td>
      ${rapporteursSig}
    </tr>
  </table>
  <div style="margin-top:10px;font-size:8pt;color:#555;text-align:center">المرفقات: تصميم توضيحي لموقع العقار بالنسبة لأقرب غابة مخزنية.</div>
</div></body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// AttestationModal
// ─────────────────────────────────────────────────────────────────────────────

export function AttestationModal({ onClose, forestData, communesData, importedLayer, chevauchementResult }: {
  onClose: () => void;
  forestData?: any;
  communesData?: any;
  importedLayer?: { name: string; geojson: any } | null;
  chevauchementResult?: ChevauchementResult | null;
}) {
  const [c, setC] = useState<AttestConfig>(ATTEST_DEFAULT);
  const set = (k: keyof AttestConfig) => (v: any) => setC(prev => ({ ...prev, [k]: v }));

  // Extract GIS-based options
  const forets: string[] = forestData?.features
    ? [...new Set(forestData.features.map((f: any) => f.properties?.FORET || '').filter(Boolean))].sort() as string[]
    : [];
  const cantons: string[] = c.foret && forestData?.features
    ? [...new Set(forestData.features.filter((f: any) => f.properties?.FORET === c.foret).map((f: any) => f.properties?.CANTON || '').filter(Boolean))].sort() as string[]
    : [];
  const communes: string[] = communesData?.features
    ? [...new Set(communesData.features.map((f: any) => f.properties?.NomAr || f.properties?.NomFr || '').filter(Boolean))].sort() as string[]
    : [];

  // Auto-fill from chevauchementResult
  useEffect(() => {
    if (!chevauchementResult || chevauchementResult.hits.length === 0) return;
    const top = chevauchementResult.hits[0];
    setC(prev => ({
      ...prev,
      foret: prev.foret || top.foret,
      foretAr: prev.foretAr || top.foretAr,
      canton: prev.canton || top.canton,
      positionDomaine: chevauchementResult.globalPosition,
    }));
  }, [chevauchementResult]);

  // Auto-fill area and coords from importedLayer
  useEffect(() => {
    if (!importedLayer?.geojson) return;
    try {
      const area = Math.round(turf.area(importedLayer.geojson));
      const pts = extractLambertCoords(importedLayer.geojson);
      setC(prev => ({
        ...prev,
        superficieM2: prev.superficieM2 || String(area),
        coordPoints: pts.length > 0 ? pts : prev.coordPoints,
      }));
    } catch (_) {}
  }, [importedLayer]);

  const toggleRapporteur = (name: string) => {
    setC(prev => ({
      ...prev,
      rapporteurs: prev.rapporteurs.includes(name)
        ? prev.rapporteurs.filter(r => r !== name)
        : [...prev.rapporteurs, name]
    }));
  };

  const updatePoint = (i: number, field: 'x'|'y', value: string) => {
    setC(prev => { const pts = [...prev.coordPoints]; pts[i] = { ...pts[i], [field]: value }; return { ...prev, coordPoints: pts }; });
  };
  const addPoint = () => setC(prev => ({ ...prev, coordPoints: [...prev.coordPoints, { num: prev.coordPoints.length+1, x: '', y: '' }] }));

  return (
    <ModalWrap title="بطاقة معاينة — Attestation Administrative" onClose={onClose} wide>
      {chevauchementResult && (
        <div className="mb-2">
          <ChevauchementInlinePanel result={chevauchementResult} />
        </div>
      )}

      <Section title="معلومات العقار / Identification" defaultOpen>
        <div className="grid grid-cols-2 gap-2">
          <Field label="اسم صاحب العقار / Propriétaire" value={c.nomProprietaire} onChange={set('nomProprietaire')} />
          <Field label="المرجع / Référence" value={c.referenceParcel} onChange={set('referenceParcel')} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={lbl}>الجماعة / Commune</label>
            {communes.length > 0
              ? <select value={c.commune} onChange={e => set('commune')(e.target.value)} className={sel}><option value="">—</option>{communes.map(v => <option key={v}>{v}</option>)}</select>
              : <input value={c.commune} onChange={e => set('commune')(e.target.value)} className={inp} />}
          </div>
          <div>
            <label className={lbl}>القيادة / Qiada</label>
            <select value={c.qiada} onChange={e => set('qiada')(e.target.value)} className={sel}>
              <option value="">—</option>
              {QIADAS.map(q => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>
          <Field label="العمالة / Omala" value={c.omala} onChange={set('omala')} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={lbl}>الغابة / Forêt</label>
            {forets.length > 0
              ? <select value={c.foret} onChange={e => { const v=e.target.value; setC(p=>({...p, foret:v, foretAr:FORET_AR[v.toUpperCase()]||'', canton:''})); }} className={sel}><option value="">—</option>{forets.map(v => <option key={v}>{v}</option>)}</select>
              : <input value={c.foret} onChange={e => set('foret')(e.target.value)} className={inp} />}
          </div>
          <div>
            <label className={lbl}>القسم / Canton</label>
            {cantons.length > 0
              ? <select value={c.canton} onChange={e => set('canton')(e.target.value)} className={sel}><option value="">—</option>{cantons.map(v => <option key={v}>{v}</option>)}</select>
              : <input value={c.canton} onChange={e => set('canton')(e.target.value)} className={inp} />}
          </div>
          <Field label="CPF" value={c.cpf} onChange={set('cpf')} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="المساحة (م²) / Surface m²" value={c.superficieM2} onChange={set('superficieM2')} />
          <Field label="تاريخ المعاينة / Date Visite" value={c.dateVisite} onChange={set('dateVisite')} type="date" />
        </div>
      </Section>

      <Section title="الحدود / Limites">
        <div className="grid grid-cols-2 gap-2">
          <Field label="الشمال / Nord"  value={c.limiteNord}  onChange={set('limiteNord')} />
          <Field label="الجنوب / Sud"   value={c.limiteSud}   onChange={set('limiteSud')} />
          <Field label="الغرب / Ouest"  value={c.limiteOuest} onChange={set('limiteOuest')} />
          <Field label="الشرق / Est"    value={c.limiteEst}   onChange={set('limiteEst')} />
        </div>
      </Section>

      <Section title="الإحداثيات / Coordonnées Lambert" defaultOpen>
        <div className="space-y-2">
          {c.coordPoints.map((pt, i) => (
            <div key={i} className="flex gap-2 items-center">
              <span className="text-[10px] text-[var(--text-muted)] w-5 shrink-0 text-center font-mono font-bold">{pt.num}</span>
              <input value={pt.x} onChange={e => updatePoint(i,'x',e.target.value)} placeholder="X Lambert" className={`${inp} flex-1`} />
              <input value={pt.y} onChange={e => updatePoint(i,'y',e.target.value)} placeholder="Y Lambert" className={`${inp} flex-1`} />
            </div>
          ))}
          <button onClick={addPoint} className="w-full py-1.5 border border-dashed border-[var(--border-color)] hover:border-[var(--brand)] text-[var(--text-muted)] hover:text-[var(--brand)] rounded-lg text-xs font-medium transition-colors">
            + نقطة جديدة
          </button>
        </div>
      </Section>

      <Section title="وضعية العقار / Position Domaine" defaultOpen>
        <div className="space-y-2">
          {(['خارج الملك الغابوي','جزئيا داخل الملك الغابوي','داخل الملك الغابوي'] as const).map(opt => (
            <button key={opt} onClick={() => set('positionDomaine')(opt)}
              className={`w-full py-2 rounded-lg text-xs font-bold border transition-all text-right px-3 ${c.positionDomaine===opt ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--brand)]'}`}
              style={{ direction: 'rtl' }}>
              {opt}
            </button>
          ))}
        </div>
      </Section>

      <Section title="التوقيعات / Signatures" defaultOpen>
        <Field label="رئيس مركز حماية الغابات / Chef CPF" value={c.chefCPF} onChange={set('chefCPF')} />
        <div>
          <label className={lbl}>عناصر الفرقة المتنقلة / Rapporteurs</label>
          <div className="grid grid-cols-2 gap-1.5 mt-1">
            {RAPPORTEURS_LIST.map(name => (
              <button key={name} onClick={() => toggleRapporteur(name)}
                className={`text-right px-3 py-1.5 rounded-lg text-xs border transition-all font-medium ${c.rapporteurs.includes(name) ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--brand)]'}`}
                style={{ direction: 'rtl' }}>
                {c.rapporteurs.includes(name) ? '✓ ' : ''}{name}
              </button>
            ))}
          </div>
          {c.rapporteurs.length > 0 && (
            <p className="text-[10px] text-[var(--text-muted)] mt-1.5" style={{ direction: 'rtl' }}>
              محددون: {c.rapporteurs.join(' · ')}
            </p>
          )}
        </div>
      </Section>

      <div className="flex gap-2 pt-1">
        <button onClick={() => printHtml(buildAttestationHTML(c))}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[var(--brand)] hover:opacity-90 text-white font-semibold rounded-lg text-sm">
          <Printer className="w-4 h-4" /> طباعة / Imprimer
        </button>
        <button onClick={() => { const html=buildAttestationHTML(c); const body=html.replace(/<!DOCTYPE[^>]*>/,'').replace(/<html[^>]*>/,'').replace('</html>',''); downloadWord(`<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>${body}</html>`, `بطاقة-${c.nomProprietaire||'عقار'}.doc`); }}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[var(--bg-main)] border border-[var(--border-color)] hover:border-[var(--brand)] text-[var(--text-main)] font-semibold rounded-lg text-sm">
          <FileDown className="w-4 h-4" /> Word (.doc)
        </button>
      </div>
    </ModalWrap>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ExpertiseModal
// ─────────────────────────────────────────────────────────────────────────────

export function ExpertiseModal({ onClose }: { onClose: () => void }) {
  const [dossier, setDossier] = useState('');
  const [tribunal, setTribunal] = useState('Tétouan');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [foret, setForet] = useState('');
  const [canton, setCanton] = useState('');
  const [superficie, setSuperficie] = useState('');
  const [position, setPosition] = useState<'كلياً'|'جزئياً'|'خارج'>('كلياً');
  const [rapporteur1, setR1] = useState('');
  const [rapporteur2, setR2] = useState('');
  const [description, setDesc] = useState('');

  const generate = () => {
    const content = `المملكة المغربية\nالوكالة الوطنية للمياه والغابات\nالمديرية الإقليمية لتطوان\nمركز حماية وتنمية الغابات للمضيق-الفنيدق\n\n${'─'.repeat(45)}\nمحضر التصريحات\nملف عقاري عدد: ${dossier}\nالمحكمة الابتدائية ب${tribunal}\n${'─'.repeat(45)}\n\nبناءا على الأمر التمهيدي والقاضي باجراء الوقوف بعين المكان للتحقق من وضعية العقار موضوع الدعوى، نحن الموقعون اسفله ممثلوا المديرية الإقليمية للوكالة الوطنية للمياه والغابات بتطوان:\n\n1- ${rapporteur1} : رئيس مركز حماية الغابات للمضيق-الفنيدق بالنيابة\n2- ${rapporteur2} : عضو بالفرقة المتنقلة للمضيق-الفنيدق\n\nنصرح بما يلي:\n\nإن القطعة الأرضية موضوع النزاع تدخل ${position} ضمن الملك الغابوي بالغابة المخزنية لـ "${foret}" قسم "${canton}".\n\nالمساحة المحسوبة تقنياً: ${superficie} هكتار.\n\n${description}\n\nحرر بتطوان في: ${date}\n\nتوقيع المصرح 1:                          توقيع المصرح 2:\n${rapporteur1}                             ${rapporteur2}`;
    printHtml(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>محضر التصريحات</title><style>body{font-family:'Arial',sans-serif;direction:rtl;padding:2cm;font-size:11pt;line-height:1.8;color:#111}pre{white-space:pre-wrap;font-family:inherit}</style></head><body><pre>${content}</pre></body></html>`);
  };

  return (
    <ModalWrap title="Rapport d'Expertise — محضر التصريحات" onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={lbl}>ملف رقم / Dossier</label><input value={dossier} onChange={e=>setDossier(e.target.value)} className={inp} placeholder="2024/001" /></div>
        <div><label className={lbl}>المحكمة / Tribunal</label><input value={tribunal} onChange={e=>setTribunal(e.target.value)} className={inp} /></div>
        <div><label className={lbl}>Forêt</label><input value={foret} onChange={e=>setForet(e.target.value)} className={inp} /></div>
        <div><label className={lbl}>Canton</label><input value={canton} onChange={e=>setCanton(e.target.value)} className={inp} /></div>
        <div><label className={lbl}>Superficie (Ha)</label><input value={superficie} onChange={e=>setSuperficie(e.target.value)} className={inp} /></div>
        <div><label className={lbl}>Date</label><input type="date" value={date} onChange={e=>setDate(e.target.value)} className={inp} /></div>
      </div>
      <div><label className={lbl}>Rapporteur 1</label><input value={rapporteur1} onChange={e=>setR1(e.target.value)} className={inp} /></div>
      <div><label className={lbl}>Rapporteur 2</label><input value={rapporteur2} onChange={e=>setR2(e.target.value)} className={inp} /></div>
      <div>
        <label className={lbl}>وضعية العقار</label>
        <div className="flex gap-2">
          {(['كلياً','جزئياً','خارج'] as const).map(v => (
            <button key={v} onClick={()=>setPosition(v)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${position===v?'bg-[var(--brand)] text-white border-[var(--brand)]':'border-[var(--border-color)] text-[var(--text-muted)]'}`}>
              {v}
            </button>
          ))}
        </div>
      </div>
      <div><label className={lbl}>ملاحظات / Observations</label>
        <textarea value={description} onChange={e=>setDesc(e.target.value)} rows={4} className={`${inp} resize-none`} placeholder="تفاصيل إضافية حول العقار..." />
      </div>
      <button onClick={generate} className="w-full py-2.5 bg-[var(--brand)] hover:opacity-90 text-white font-semibold rounded-lg text-sm flex items-center justify-center gap-2">
        <FileText className="w-4 h-4" /> توليد وطباعة المحضر
      </button>
    </ModalWrap>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ChevauchementModal — shows result or instructions
// ─────────────────────────────────────────────────────────────────────────────

export function ChevauchementModal({ onClose, result }: { onClose: () => void; result?: ChevauchementResult | null }) {
  return (
    <ModalWrap title="Analyse Chevauchement — Domaine Forestier" onClose={onClose}>
      {result ? (
        <ChevauchementInlinePanel result={result} />
      ) : (
        <div className="space-y-3">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            <p className="text-amber-600 text-xs font-bold uppercase tracking-wider mb-1">Utilisation</p>
            <p className="text-[var(--text-main)] text-sm">L'analyse se lance automatiquement après import d'une couche dans l'onglet Couches.</p>
          </div>
          <div className="space-y-2">
            {[
              { n:'1', text:"Allez dans l'onglet Couches" },
              { n:'2', text:"Importez un fichier GeoJSON, SHP ou KML (polygone)" },
              { n:'3', text:"Le résultat apparaît automatiquement sous le bouton d'import" },
              { n:'4', text:"Revenez ici pour voir le résultat complet ou générer un PDF" },
            ].map(s => (
              <div key={s.n} className="flex gap-3 items-start">
                <span className="w-6 h-6 rounded-full bg-[var(--brand)] text-white text-xs font-bold flex items-center justify-center shrink-0">{s.n}</span>
                <p className="text-[var(--text-main)] text-sm pt-0.5">{s.text}</p>
              </div>
            ))}
          </div>
          <button onClick={onClose} className="w-full py-2.5 bg-[var(--bg-main)] border border-[var(--border-color)] hover:border-[var(--brand)] text-[var(--text-main)] font-semibold rounded-lg text-sm flex items-center justify-center gap-2 transition-colors">
            <Layers className="w-4 h-4" /> Aller aux Couches
          </button>
        </div>
      )}
    </ModalWrap>
  );
}