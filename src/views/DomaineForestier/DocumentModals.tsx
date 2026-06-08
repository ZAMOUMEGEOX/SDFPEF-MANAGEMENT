// src/views/DomaineForestier/DocumentModals.tsx
import React, { useState, useEffect, useRef } from 'react';
import * as turf from '@turf/turf';
import proj4 from 'proj4';
import {
  X, Printer, FileDown, FileText, Layers,
  Plus, Minus, MapPin, RefreshCw, Copy, Download,
} from 'lucide-react';

try {
  proj4.defs("EPSG:26191", "+proj=lcc +lat_1=33.3 +lat_0=33.3 +lon_0=-5.4 +k_0=0.999625769 +x_0=500000 +y_0=300000 +a=6378249.2 +b=6356515 +towgs84=31,146,47,0,0,0,0 +units=m +no_defs");
} catch (_) {}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const QIADAS = [
  'عليين','الملاليين','الجبل الكبير','مرتيل','وادي لاو',
  'بلِيونَش','بني يدر','زيانة','حمارة','تغرامت',
  'الغزاوة','الصويني','المضيق','الفنيدق','درة العروس','تطوان المدينة',
];

const RAPPORTEURS_LIST = [
  'تجريبات موسى','طوال محمد','مجاهيد مهدي','العتمد يوسف','الزاموم أحمد',
];

const FORET_AR: Record<string, string> = {
  'BENI HASSAN':'بني حسن','BOUHACHEM':'بوهشم','RHOMARA':'غمارة',
  'TALEMBOTE':'تالمبوت','JBEL DARSA':'جبل درسة',
  'ANJRA NORD':'أنجرة الشمالية','ANJRA SUD':'أنجرة الجنوبية',
  'FNIDEQ':'الفنيدق','BENSLIMANE':'بن سليمان',
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
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
  intersections?: any[];
  importedGeoJSON: any; forestGeoJSON: any;
}

export interface ImportedLayerInfo {
  id?: string;
  name: string;
  geojson: any;
  chevauchement?: ChevauchementResult | null;
  province?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// runChevauchementAnalysis
// ─────────────────────────────────────────────────────────────────────────────

export function runChevauchementAnalysis(
  importedGeojson: any, forestGeojson: any, layerName: string
): ChevauchementResult {
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
  return { layerName, importedArea, totalIntersectionArea, totalPercentage, globalPosition, hits, intersections: hits, importedGeoJSON: importedGeojson, forestGeoJSON: forestGeojson };
}

// ─────────────────────────────────────────────────────────────────────────────
// buildMiniMapSVG — enhanced with north arrow + scale
// ─────────────────────────────────────────────────────────────────────────────

function buildMiniMapSVG(importedGeojson: any, forestFeats: any[]): string {
  try {
    const allFeats = [
      ...(importedGeojson.type === 'FeatureCollection' ? importedGeojson.features : [importedGeojson]),
      ...forestFeats.slice(0, 60),
    ].filter((f: any) => f?.geometry);
    if (allFeats.length === 0) throw new Error('empty');
    const combined = turf.featureCollection(allFeats);
    const [minX, minY, maxX, maxY] = turf.bbox(combined);
    const W = 420, H = 280;
    const padX = (maxX - minX) * 0.1 || 0.003, padY = (maxY - minY) * 0.1 || 0.003;
    const bMinX = minX - padX, bMaxX = maxX + padX, bMinY = minY - padY, bMaxY = maxY + padY;
    const sx = W / (bMaxX - bMinX), sy = H / (bMaxY - bMinY);
    const tx = (c: number[]) => `${((c[0] - bMinX) * sx).toFixed(1)},${(H - (c[1] - bMinY) * sy).toFixed(1)}`;
    const gp = (geom: any): string => {
      if (!geom) return '';
      if (geom.type === 'Polygon') return geom.coordinates.map((r: number[][]) => 'M' + r.map(tx).join('L') + 'Z').join(' ');
      if (geom.type === 'MultiPolygon') return geom.coordinates.flatMap((p: number[][][]) => p.map((r: number[][]) => 'M' + r.map(tx).join('L') + 'Z')).join(' ');
      return '';
    };
    const forestPaths = forestFeats.slice(0, 60).map(f => `<path d="${gp(f.geometry)}" fill="#16a34a1a" stroke="#16a34a" stroke-width="1"/>`).join('');
    const impFeats = importedGeojson.type === 'FeatureCollection' ? importedGeojson.features : [importedGeojson];
    const impPaths = impFeats.map((f: any) => `<path d="${gp(f?.geometry)}" fill="#ef444426" stroke="#ef4444" stroke-width="2.5"/>`).join('');
    // Centroid label
    let centX = W / 2, centY = H / 2;
    try { const c = turf.centroid(importedGeojson); centX = (c.geometry.coordinates[0] - bMinX) * sx; centY = H - (c.geometry.coordinates[1] - bMinY) * sy; } catch (_) {}
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
      <rect width="${W}" height="${H}" fill="#dce8f0" rx="4"/>
      <rect width="${W}" height="${H}" fill="url(#grid)" rx="4" opacity="0.3"/>
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#aaa" stroke-width="0.5"/>
        </pattern>
      </defs>
      ${forestPaths}${impPaths}
      <circle cx="${centX.toFixed(1)}" cy="${centY.toFixed(1)}" r="4" fill="#ef4444" opacity="0.8"/>
      <!-- North arrow -->
      <g transform="translate(${W - 28},20)">
        <circle cx="0" cy="0" r="13" fill="white" stroke="#333" stroke-width="1.2" opacity="0.9"/>
        <polygon points="0,-10 -4,2 0,0 4,2" fill="#333"/>
        <polygon points="0,10 -4,-2 0,0 4,-2" fill="#aaa"/>
        <text x="0" y="-13" text-anchor="middle" font-size="7" fill="#333" font-family="Arial" font-weight="bold">N</text>
      </g>
      <!-- Legend -->
      <rect x="6" y="${H - 34}" width="160" height="28" fill="white" rx="3" opacity="0.88"/>
      <rect x="10" y="${H - 27}" width="10" height="8" fill="#16a34a1a" stroke="#16a34a" stroke-width="1"/>
      <text x="24" y="${H - 20}" font-size="8.5" fill="#16a34a" font-family="Arial" font-weight="bold">Domaine Forestier</text>
      <rect x="92" y="${H - 27}" width="10" height="8" fill="#ef444426" stroke="#ef4444" stroke-width="1.5"/>
      <text x="106" y="${H - 20}" font-size="8.5" fill="#ef4444" font-family="Arial" font-weight="bold">Parcelle</text>
    </svg>`;
  } catch (_) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="100"><rect width="420" height="100" fill="#f4f4f4" rx="4"/><text x="50%" y="50%" text-anchor="middle" fill="#999" font-size="12" font-family="Arial">Croquis non disponible</text></svg>`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// extractLambertCoords — all vertices (max configurable)
// ─────────────────────────────────────────────────────────────────────────────

function extractLambertCoords(geojson: any, maxPts = 8): Array<{ num: number; x: string; y: string }> {
  try {
    let coords: number[][] = [];
    const feat = geojson.type === 'FeatureCollection' ? geojson.features[0] : geojson;
    const geom = feat?.geometry;
    if (geom?.type === 'Polygon') coords = geom.coordinates[0].slice(0, -1);
    else if (geom?.type === 'MultiPolygon') coords = geom.coordinates[0][0].slice(0, -1);
    if (coords.length === 0) return [];
    const step = Math.max(1, Math.floor(coords.length / maxPts));
    const sampled = coords.filter((_: any, i: number) => i % step === 0).slice(0, maxPts);
    return sampled.map((c: number[], i: number) => {
      try {
        const [x, y] = proj4('EPSG:4326', 'EPSG:26191', [c[0], c[1]]);
        return { num: i + 1, x: x.toFixed(0), y: y.toFixed(0) };
      } catch (_) { return { num: i + 1, x: '', y: '' }; }
    });
  } catch (_) { return []; }
}

// ─────────────────────────────────────────────────────────────────────────────
// ChevauchementInlinePanel — exported for backward compat
// ─────────────────────────────────────────────────────────────────────────────

export function ChevauchementInlinePanel({ result }: { result: ChevauchementResult }) {
  const COL: Record<string, { bg: string; border: string; text: string; fr: string }> = {
    'داخل الملك الغابوي':        { bg: 'rgba(220,38,38,0.08)',  border: '#dc2626', text: '#dc2626', fr: 'TOTAL'   },
    'جزئيا داخل الملك الغابوي': { bg: 'rgba(217,119,6,0.08)',  border: '#d97706', text: '#d97706', fr: 'PARTIEL' },
    'خارج الملك الغابوي':        { bg: 'rgba(22,101,52,0.08)', border: '#166534', text: '#166534', fr: 'NÉANT'   },
  };
  const col = COL[result.globalPosition];
  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: col.border, background: col.bg }}>
      <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: `1px solid ${col.border}40` }}>
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: col.text }}>Chevauchement — {col.fr}</span>
        <span className="text-[12px] font-mono font-bold" style={{ color: col.text }}>{result.totalPercentage.toFixed(1)}%</span>
      </div>
      <div className="px-3 py-2 space-y-1">
        <div className="text-[11px] font-bold" style={{ color: col.text, direction: 'rtl' }}>{result.globalPosition}</div>
        <div className="text-[10px] text-[var(--text-muted)]">
          {(result.importedArea / 10000).toFixed(3)} ha · تقاطع: {(result.totalIntersectionArea / 10000).toFixed(3)} ha
        </div>
        {result.hits.slice(0, 3).map((h, i) => (
          <div key={i} className="text-[10px] flex items-center justify-between">
            <span className="text-[var(--text-main)] truncate flex-1 mr-2">🌲 {h.foret}{h.canton ? ` — ${h.canton}` : ''}</span>
            <span className="font-mono font-bold shrink-0" style={{ color: col.text }}>{h.percentage.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// UI Helpers
// ─────────────────────────────────────────────────────────────────────────────

const inp = "w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-2.5 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:border-[var(--brand)] transition-colors";
const lbl = "block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1";
const sel = "w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-2.5 py-2 text-sm text-[var(--text-main)] focus:outline-none focus:border-[var(--brand)] transition-colors";

function ModalWrap({ title, subtitle, onClose, wide = false, children }: {
  title: string; subtitle?: string; onClose: () => void; wide?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-3 bg-black/65 backdrop-blur-sm">
      <div
        className={`bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden ${wide ? 'max-w-2xl' : 'max-w-lg'}`}
        style={{ maxHeight: '92vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)] bg-[var(--bg-main)] shrink-0">
          <div>
            <h3 className="text-[var(--text-main)] font-bold text-sm tracking-wide">{title}</h3>
            {subtitle && <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] rounded-lg border border-[var(--border-color)] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TabNav({ tabs, active, onChange }: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex border-b border-[var(--border-color)] shrink-0 bg-[var(--bg-main)] px-1">
      {tabs.map(tab => (
        <button key={tab.id} onClick={() => onChange(tab.id)}
          className={`
            flex-1 px-2 py-2.5 text-[11px] font-bold tracking-wide transition-all relative
            ${active === tab.id
              ? 'text-[var(--brand)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}
          `}>
          {tab.label}
          {active === tab.id && (
            <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-[var(--brand)]" />
          )}
        </button>
      ))}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder = '', readOnly = false }: any) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      <input type={type} value={value}
        onChange={(e: any) => !readOnly && onChange(e.target.value)}
        placeholder={placeholder} readOnly={readOnly}
        className={`${inp} ${readOnly ? 'opacity-60 cursor-default' : ''}`} />
    </div>
  );
}

function ActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="shrink-0 px-4 py-3 border-t border-[var(--border-color)] bg-[var(--bg-main)] flex gap-2">
      {children}
    </div>
  );
}

function BtnPrimary({ onClick, icon: Icon, children }: any) {
  return (
    <button onClick={onClick}
      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[var(--brand)] hover:opacity-90 text-white font-semibold rounded-xl text-sm active:scale-95 transition-all">
      {Icon && <Icon className="w-4 h-4" />}{children}
    </button>
  );
}

function BtnSecondary({ onClick, icon: Icon, children, title }: any) {
  return (
    <button onClick={onClick} title={title}
      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--bg-surface)] border border-[var(--border-color)] hover:border-[var(--brand)] text-[var(--text-main)] font-semibold rounded-xl text-sm active:scale-95 transition-all">
      {Icon && <Icon className="w-4 h-4" />}{children}
    </button>
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

// ─────────────────────────────────────────────────────────────────────────────
// buildFicheHTML
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
  .col-left{width:55%;padding-right:14px;border-right:1.5px solid #555;display:flex;flex-direction:column;gap:5px}
  .col-right{width:45%;padding-left:14px;display:flex;flex-direction:column;gap:8px}
  .header-row{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px}
  h2{text-align:center;font-size:11pt;text-decoration:underline;margin:4px 0 6px}
  .sec{margin-bottom:3px}.sec-title{font-weight:bold;text-decoration:underline;font-size:9.5pt;margin-bottom:1px}
  .sec p{margin:1px 0;font-size:8.8pt}
  .sup-grid{display:inline-flex;gap:6px;align-items:center;margin:1px 0}
  .sup-cell{border:1px solid #999;padding:1px 6px;font-weight:bold;font-size:9pt;background:#fafafa}
  .badge{display:inline-block;border:2px solid ${empColor};color:${empColor};background:${empBg};padding:1px 12px;font-weight:bold;font-size:11pt;letter-spacing:2px}
  .croquis-box{flex:1;min-height:0}
  .croquis-title{font-size:9.5pt;font-weight:bold;text-align:center;margin-bottom:6px;text-decoration:underline}
  .correspondence{border-top:1.5px solid #555;padding-top:8px;margin-top:auto;font-size:8.5pt}
  .corr-avis{font-size:9pt;margin:4px 0}.avis-word{font-size:12pt;font-weight:bold;color:${avisColor}}
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
    </div>
    <div class="sec">
      <div class="sec-title">2°) SITUATION ADMINISTRATIVE ET FORESTIÈRE :</div>
      <p>- Commune Rurale : <strong>${c.communeRurale||''}</strong> &nbsp; Cercle : <strong>${c.cercle||''}</strong> &nbsp; Caïdat : <strong>${c.caidat||''}</strong></p>
      <p>- Forêt : <strong>${c.foret||''}</strong>, BM : M'diq-Fnideq, Canton : <strong>${c.canton||''}</strong></p>
      <p>- Périmètre : <strong>${c.perimetre||''}</strong> m &nbsp; Lieudit : <strong>${c.lieudit||''}</strong></p>
      <p>- Coord. Lambert &nbsp; X : <strong>${c.lambertX||''}</strong> &nbsp; Y : <strong>${c.lambertY||''}</strong></p>
      <p>- Superficie déclarée :
        <span class="sup-grid">
          <span class="sup-cell">${c.superficieDeclareHa||'00'}</span><span>HA</span>
          <span class="sup-cell">${c.superficieDeclareAr||'00'}</span><span>A</span>
          <span class="sup-cell">${c.superficieDeclareCa||'00'}</span><span>CA</span>
        </span>
        &nbsp; Bornée : <strong>${c.superficieBornee||''}</strong>
      </p>
      <p>- N° borne la plus proche : <strong>${c.borneNumero||''}</strong></p>
    </div>
    <div class="sec">
      <div class="sec-title">3°) DESCRIPTION DE L'IMMEUBLE :</div>
      <p>- Distance / forêt : <strong style="color:${empColor}">${c.distanceDescription||''}</strong></p>
      <p>- ${c.descriptionVegetation||'matorral et chêne liège'}</p>
    </div>
    <div class="sec">
      <div class="sec-title">4°) INTERVENTIONS FORESTIÈRES :</div>
      <p>Reboisement : ${c.reboisement||'—'} &nbsp; Équipement : ${c.equipement||'—'} &nbsp; Exploitation : ${c.exploitation||'—'} &nbsp; P.V. : ${c.pvDresses||'—'}</p>
    </div>
    <div class="sec">
      <div class="sec-title">5°) ACTES DE PROPRIÉTÉ :</div>
      <p>${c.actesPropriete||'Présenté par le requérant'}</p>
    </div>
    <div class="sec">
      <div class="sec-title">6°) EMPIÈTEMENT :</div>
      <p><span class="badge">EMPIÈTEMENT ${c['empiètement']}</span></p>
    </div>
    <div class="sec">
      <div class="sec-title">7°) CONCLUSION :</div>
      <p>${c.conclusion||''}</p>
      <p style="text-align:right">En date du : <strong>${c.signataireDate||''}</strong></p>
    </div>
  </div>
  <div class="col-right">
    <div class="croquis-title">Croquis de situation :</div>
    <div class="croquis-box"><div style="width:100%;height:240px;border:1px dashed #bbb;display:flex;align-items:center;justify-content:center;color:#bbb;font-style:italic;font-size:11px;background:#f9f9f9">[Croquis — à compléter]</div></div>
    <div class="correspondence">
      <div>N° &nbsp;&nbsp;/CPF/M'diq-Fnideq &nbsp;&nbsp;&nbsp;&nbsp; M'diq, Le ${c.signataireDate||''}</div>
      <div style="text-align:center;font-style:italic;margin:5px 0">Copie conforme transmise à<br><strong>Mr le Directeur Provincial de l'ANEF de TETOUAN</strong></div>
      <div class="corr-avis">« Avis&nbsp;<span class="avis-word">${c.avis}</span>&nbsp;»</div>
      <div style="text-align:right;margin-top:6px"><strong>Le Chef de CPF de M'diq - Fnideq</strong><br>${c.signataire||''}</div>
    </div>
  </div>
</div>
</body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// FicheModal — 3 horizontal tabs
// ─────────────────────────────────────────────────────────────────────────────

const FICHE_TABS = [
  { id: 'entete',   label: 'En-tête & Identification' },
  { id: 'situation', label: 'Situation & Géométrie'   },
  { id: 'conclusion', label: 'Avis & Conclusion'      },
];

export function FicheModal({ onClose, forestData, communesData, importedLayer }: {
  onClose: () => void; forestData?: any; communesData?: any;
  importedLayer?: ImportedLayerInfo | null;
}) {
  const [tab, setTab] = useState('entete');
  const [c, setC] = useState<FicheConfig>(FICHE_DEFAULT);
  const set = (k: keyof FicheConfig) => (v: string) => setC(prev => ({ ...prev, [k]: v }));

  const forets: string[] = forestData?.features
    ? [...new Set<string>(forestData.features.map((f: any) => f.properties?.FORET || '').filter(Boolean))].sort()
    : [];
  const cantons: string[] = c.foret && forestData?.features
    ? [...new Set<string>(forestData.features.filter((f: any) => f.properties?.FORET === c.foret).map((f: any) => f.properties?.CANTON || '').filter(Boolean))].sort()
    : [];
  const communes: string[] = communesData?.features
    ? [...new Set<string>(communesData.features.map((f: any) => f.properties?.NomFr || '').filter(Boolean))].sort()
    : [];

  useEffect(() => {
    if (!importedLayer) return;
    const chev = importedLayer.chevauchement;
    setC(prev => ({
      ...prev,
      immeubleDit: prev.immeubleDit || importedLayer.name,
      foret: prev.foret || (chev?.hits[0]?.foret ?? ''),
      canton: prev.canton || (chev?.hits[0]?.canton ?? ''),
      'empiètement': chev
        ? (chev.globalPosition === 'داخل الملك الغابوي' ? 'TOTAL' : chev.globalPosition === 'جزئيا داخل الملك الغابوي' ? 'PARTIEL' : 'NÉANT')
        : prev['empiètement'],
    }));
    if (importedLayer.geojson) {
      try {
        const area = turf.area(importedLayer.geojson);
        const ha = Math.floor(area / 10000);
        const ar = Math.floor((area % 10000) / 100);
        const ca = Math.round(area % 100);
        const perim = turf.length(importedLayer.geojson, { units: 'meters' });
        const centroid = turf.centroid(importedLayer.geojson);
        const [lng, lat] = centroid.geometry.coordinates;
        const [lx, ly] = proj4('EPSG:4326', 'EPSG:26191', [lng, lat]);
        setC(prev => ({
          ...prev,
          superficieDeclareHa: String(ha),
          superficieDeclareAr: String(ar).padStart(2, '0'),
          superficieDeclareCa: String(ca).padStart(2, '0'),
          perimetre: perim.toFixed(0),
          lambertX: lx.toFixed(0), lambertY: ly.toFixed(0),
        }));
      } catch (_) {}
    }
  }, [importedLayer]);

  const tabContent: Record<string, React.ReactNode> = {
    entete: (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <Field label="N° Fiche" value={c.numero} onChange={set('numero')} />
          <Field label="Date" value={c.date} onChange={set('date')} />
          <Field label="Réf Envoi CPF" value={c.refEnvoi} onChange={set('refEnvoi')} />
        </div>
        <Field label="Immeuble dit (nom de la parcelle)" value={c.immeubleDit} onChange={set('immeubleDit')} placeholder="Nom de l'immeuble foncier" />
        <div className="grid grid-cols-2 gap-2">
          <Field label="N° Réquisition" value={c.objetRequisition} onChange={set('objetRequisition')} />
          <Field label="Demandé par" value={c.demandeParNom} onChange={set('demandeParNom')} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Bulletin Officiel N°" value={c.bulletinOfficielNum} onChange={set('bulletinOfficielNum')} />
          <Field label="Date BO" value={c.bulletinOfficielDate} onChange={set('bulletinOfficielDate')} />
        </div>
      </div>
    ),
    situation: (
      <div className="space-y-3">
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
          <Field label="Lambert X (centroïde)" value={c.lambertX} onChange={set('lambertX')} />
          <Field label="Lambert Y (centroïde)" value={c.lambertY} onChange={set('lambertY')} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Périmètre (m)" value={c.perimetre} onChange={set('perimetre')} />
          <Field label="Lieu-dit" value={c.lieudit} onChange={set('lieudit')} />
        </div>
        <div>
          <label className={lbl}>Superficie Déclarée</label>
          <div className="flex items-center gap-2">
            <input value={c.superficieDeclareHa} onChange={e => set('superficieDeclareHa')(e.target.value)} className={`${inp} text-center font-mono`} placeholder="HA" />
            <span className="text-[10px] font-bold text-[var(--text-muted)]">HA</span>
            <input value={c.superficieDeclareAr} onChange={e => set('superficieDeclareAr')(e.target.value)} className={`${inp} text-center font-mono`} placeholder="A" />
            <span className="text-[10px] font-bold text-[var(--text-muted)]">A</span>
            <input value={c.superficieDeclareCa} onChange={e => set('superficieDeclareCa')(e.target.value)} className={`${inp} text-center font-mono`} placeholder="CA" />
            <span className="text-[10px] font-bold text-[var(--text-muted)]">CA</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Superficie bornée" value={c.superficieBornee} onChange={set('superficieBornee')} />
          <Field label="N° Borne la plus proche" value={c.borneNumero} onChange={set('borneNumero')} />
        </div>
        <Field label="Distance / Position par rapport à la forêt" value={c.distanceDescription} onChange={set('distanceDescription')} />
        <Field label="Description végétation" value={c.descriptionVegetation} onChange={set('descriptionVegetation')} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Reboisement" value={c.reboisement} onChange={set('reboisement')} />
          <Field label="Équipement" value={c.equipement} onChange={set('equipement')} />
          <Field label="Exploitation" value={c.exploitation} onChange={set('exploitation')} />
          <Field label="P.V. dressés" value={c.pvDresses} onChange={set('pvDresses')} />
        </div>
        <Field label="Actes de propriété en présence" value={c.actesPropriete} onChange={set('actesPropriete')} />
      </div>
    ),
    conclusion: (
      <div className="space-y-4">
        <div>
          <label className={lbl}>Empiètement</label>
          <div className="flex gap-2">
            {(['TOTAL','PARTIEL','NÉANT'] as const).map(v => {
              const color = v==='TOTAL' ? 'bg-red-600 border-red-600 text-white' : v==='PARTIEL' ? 'bg-orange-500 border-orange-500 text-white' : 'bg-emerald-600 border-emerald-600 text-white';
              return (
                <button key={v} onClick={() => setC(p => ({...p, 'empiètement': v}))}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-black border-2 transition-all tracking-widest ${c['empiètement']===v ? color : 'border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--brand)]'}`}>
                  {v}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className={lbl}>Avis</label>
          <div className="flex gap-2">
            {(['FAVORABLE','DÉFAVORABLE'] as const).map(v => (
              <button key={v} onClick={() => setC(p => ({...p, avis: v}))}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold border-2 transition-all ${c.avis===v ? (v==='FAVORABLE'?'bg-emerald-600 text-white border-emerald-600':'bg-red-600 text-white border-red-600') : 'border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--brand)]'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={lbl}>Conclusion et éléments divers</label>
          <textarea value={c.conclusion} onChange={e => set('conclusion')(e.target.value)} rows={4}
            className={`${inp} resize-none`} placeholder="Éléments divers et conclusion..." />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Chef CPF (signataire)" value={c.signataire} onChange={set('signataire')} />
          <Field label="Date signature" value={c.signataireDate} onChange={set('signataireDate')} />
        </div>
      </div>
    ),
  };

  return (
    <ModalWrap title="Fiche Technique de Réquisition" subtitle="ANEF · CPF M'diq-Fnideq · Tétouan" onClose={onClose} wide>
      <TabNav tabs={FICHE_TABS} active={tab} onChange={setTab} />
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {tabContent[tab]}
      </div>
      <ActionBar>
        <BtnPrimary onClick={() => printHtml(buildFicheHTML(c))} icon={Printer}>Imprimer PDF</BtnPrimary>
        <BtnSecondary onClick={() => downloadWord(buildFicheHTML(c), `fiche-${c.immeubleDit||'requisition'}.doc`)} icon={FileDown}>Word (.doc)</BtnSecondary>
        <BtnSecondary onClick={() => navigator.clipboard.writeText(`Fiche ${c.immeubleDit} | ${c.foret} | ${c['empiètement']}`).catch(()=>{})} icon={Copy} title="Copier" />
      </ActionBar>
    </ModalWrap>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AttestConfig
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
  coordPoints: Array.from({ length: 6 }, (_, i) => ({ num: i + 1, x: '', y: '' })),
};

// ─────────────────────────────────────────────────────────────────────────────
// buildAttestationHTML
// ─────────────────────────────────────────────────────────────────────────────

function buildAttestationHTML(cfg: AttestConfig, miniSvg?: string): string {
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
    : `<td style="border:1px solid #555;padding:6px 8px;height:70px"></td>`;
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
  .uline{border-bottom:1px solid #555;display:inline-block;min-width:80px;padding-bottom:1px}
  .section-title{font-weight:bold;font-size:10pt;margin:10px 0 5px}
  .coords-table{width:100%;border-collapse:collapse;margin:6px 0}
  .coords-table th{background:#e8f5e9;border:1px solid #999;padding:4px 8px;font-size:9pt;text-align:center}
  .checkbox-row{display:flex;gap:24px;margin:8px 0;font-size:9.5pt;align-items:center;flex-wrap:wrap}
  .sig-table{width:100%;border-collapse:collapse;margin-top:8px}
  .sig-head{font-weight:bold;background:#f4f7f4;padding:4px 8px!important;height:auto!important}
  .legal{font-size:7.5pt;color:#555;margin-top:10px;padding-top:8px;border-top:1px solid #ddd;line-height:1.6}
  .ref-box{border:1px solid #888;padding:3px 10px;display:inline-block;font-size:9pt}
  @media print{@page{size:A4;margin:0}body{margin:0}}
</style>
</head><body><div class="page">
  <div class="header">
    <div style="flex:1;line-height:1.8">المملكة المغربية<br/>الوكالة الوطنية للمياه والغابات<br/>المديرية الجهوية طنجة-تطوان-الحسيمة<br/>المديرية الإقليمية تطوان<br/>مركز حماية الغابات المضيق-الفنيدق</div>
    <div style="text-align:center;padding:0 12px;flex-shrink:0">
      <img src="/images/logo-anef.png" alt="ANEF" style="height:60px;width:auto" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
      <div style="display:none;width:60px;height:60px;border:2px solid #166534;border-radius:50%;align-items:center;justify-content:center;margin:0 auto 4px;font-size:7pt;font-weight:bold;color:#166534;text-align:center">ANEF</div>
      <div style="font-size:7pt;color:#555;line-height:1.4;margin-top:4px">الوكالة الوطنية للمياه والغابات<br/>Agence Nationale des Eaux et Forêts</div>
    </div>
    <div style="text-align:left;direction:ltr;font-size:7.5pt;flex:1;line-height:1.8">Royaume du Maroc<br/>Agence Nationale des Eaux et Forêts<br/>Direction Régionale TTH<br/>Direction Provinciale de Tétouan<br/>Centre de Protection des Forêts: ${cfg.cpf||"M'diq-Fnideq"}</div>
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
  ${miniSvg ? `<div style="margin:12px 0;text-align:center">${miniSvg}</div>` : `<div style="margin-top:10px;font-size:8pt;color:#555;text-align:center">المرفقات: تصميم توضيحي لموقع العقار بالنسبة لأقرب غابة مخزنية.</div>`}
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
</div></body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// AttestationModal — 3 horizontal tabs (ref Image 3)
// ─────────────────────────────────────────────────────────────────────────────

const ATTEST_TABS = [
  { id: 'aqar',   label: 'العقار · Propriété'           },
  { id: 'ghaba',  label: 'الغابة والوضعية · Forêt'      },
  { id: 'coords', label: 'الإحداثيات والتصميم · Plan'   },
];

export function AttestationModal({ onClose, forestData, communesData, importedLayer, chevauchementResult }: {
  onClose: () => void; forestData?: any; communesData?: any;
  importedLayer?: ImportedLayerInfo | null;
  chevauchementResult?: ChevauchementResult | null;
}) {
  const [tab, setTab] = useState('aqar');
  const [c, setC] = useState<AttestConfig>(ATTEST_DEFAULT);
  const [croquisSvg, setCroquisSvg] = useState<string | null>(null);
  const set = (k: keyof AttestConfig) => (v: any) => setC(prev => ({ ...prev, [k]: v }));

  const forets: string[] = forestData?.features
    ? [...new Set<string>(forestData.features.map((f: any) => f.properties?.FORET || '').filter(Boolean))].sort()
    : [];
  const cantons: string[] = c.foret && forestData?.features
    ? [...new Set<string>(forestData.features.filter((f: any) => f.properties?.FORET === c.foret).map((f: any) => f.properties?.CANTON || '').filter(Boolean))].sort()
    : [];
  const communes: string[] = communesData?.features
    ? [...new Set<string>(communesData.features.map((f: any) => f.properties?.NomAr || f.properties?.NomFr || '').filter(Boolean))].sort()
    : [];

  // Auto-fill from chevauchement
  useEffect(() => {
    const chev = chevauchementResult || importedLayer?.chevauchement;
    if (!chev || chev.hits.length === 0) return;
    const top = chev.hits[0];
    setC(prev => ({
      ...prev,
      foret:          prev.foret   || top.foret,
      foretAr:        prev.foretAr || top.foretAr,
      canton:         prev.canton  || top.canton,
      positionDomaine: chev.globalPosition,
    }));
  }, [chevauchementResult, importedLayer]);

  // Auto-fill area, coords, province
  useEffect(() => {
    if (!importedLayer?.geojson) return;
    try {
      const area = Math.round(turf.area(importedLayer.geojson));
      const pts = extractLambertCoords(importedLayer.geojson, 8);
      setC(prev => ({
        ...prev,
        superficieM2:  prev.superficieM2 || String(area),
        coordPoints:   pts.length > 0 ? pts : prev.coordPoints,
        omala:         importedLayer.province ? (importedLayer.province.includes("M'diq") || importedLayer.province.includes('Fnideq') ? "المضيق-الفنيدق" : importedLayer.province) : prev.omala,
      }));
    } catch (_) {}
  }, [importedLayer]);

  // Coordinate table helpers
  const updatePoint = (i: number, field: 'x'|'y', value: string) =>
    setC(prev => { const pts = [...prev.coordPoints]; pts[i] = { ...pts[i], [field]: value }; return { ...prev, coordPoints: pts }; });
  const addPoint = () =>
    setC(prev => ({ ...prev, coordPoints: [...prev.coordPoints, { num: prev.coordPoints.length + 1, x: '', y: '' }] }));
  const removePoint = (i: number) =>
    setC(prev => { const pts = prev.coordPoints.filter((_, idx) => idx !== i).map((p, idx) => ({ ...p, num: idx + 1 })); return { ...prev, coordPoints: pts }; });
  const importCoordsFromLayer = () => {
    if (!importedLayer?.geojson) return;
    const pts = extractLambertCoords(importedLayer.geojson, 12);
    if (pts.length > 0) setC(prev => ({ ...prev, coordPoints: pts }));
  };

  const generateCroquis = () => {
    if (!importedLayer?.geojson) { alert('Importez une couche pour générer le croquis.'); return; }
    const forestFeats = forestData?.features
      ? forestData.features.filter((f: any) => !c.foret || f.properties?.FORET === c.foret).slice(0, 60)
      : [];
    const svg = buildMiniMapSVG(importedLayer.geojson, forestFeats);
    setCroquisSvg(svg);
  };

  const handlePrint = () => printHtml(buildAttestationHTML(c, croquisSvg || undefined));
  const handleWord  = () => {
    const html = buildAttestationHTML(c, croquisSvg || undefined);
    downloadWord(html, `بطاقة-${c.nomProprietaire||'عقار'}.doc`);
  };

  // ── Tab content ────────────────────────────────────────────────────────────

  const tabContent: Record<string, React.ReactNode> = {

    // Tab 1 — العقار
    aqar: (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="اسم صاحب العقار / Propriétaire" value={c.nomProprietaire} onChange={set('nomProprietaire')} />
          <Field label="المرجع / Référence" value={c.referenceParcel} onChange={set('referenceParcel')} placeholder="...... م ح غ / م ف" />
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
        <div className="grid grid-cols-2 gap-2">
          <Field label="مساحة الأرض (م²) / Surface m²" value={c.superficieM2} onChange={set('superficieM2')} />
          <Field label="تاريخ المعاينة / Date Visite" value={c.dateVisite} onChange={set('dateVisite')} type="date" />
        </div>
        <div>
          <label className={lbl}>حدود العقار / Limites</label>
          <div className="grid grid-cols-2 gap-2">
            <Field label="الشمال / Nord"  value={c.limiteNord}  onChange={set('limiteNord')} />
            <Field label="الجنوب / Sud"   value={c.limiteSud}   onChange={set('limiteSud')} />
            <Field label="الغرب / Ouest"  value={c.limiteOuest} onChange={set('limiteOuest')} />
            <Field label="الشرق / Est"    value={c.limiteEst}   onChange={set('limiteEst')} />
          </div>
        </div>
      </div>
    ),

    // Tab 2 — الغابة والوضعية
    ghaba: (
      <div className="space-y-3">
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
        {c.foretAr && (
          <div className="bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-3 py-2 flex items-center gap-2">
            <span className="text-[10px] text-[var(--text-muted)]">الاسم بالعربية:</span>
            <span className="text-sm font-bold text-[var(--text-main)]" dir="rtl">{c.foretAr}</span>
          </div>
        )}
        <div>
          <label className={lbl}>وضعية العقار / Position Domaine Forestier</label>
          <div className="space-y-1.5">
            {(['خارج الملك الغابوي','جزئيا داخل الملك الغابوي','داخل الملك الغابوي'] as const).map(opt => {
              const active = c.positionDomaine === opt;
              const color = opt==='داخل الملك الغابوي' ? 'border-red-500 bg-red-500/10 text-red-600' : opt==='جزئيا داخل الملك الغابوي' ? 'border-orange-500 bg-orange-500/10 text-orange-600' : 'border-emerald-600 bg-emerald-600/10 text-emerald-700';
              return (
                <button key={opt} onClick={() => set('positionDomaine')(opt)}
                  className={`w-full py-2.5 rounded-xl text-sm font-bold border-2 transition-all text-right px-4 ${active ? color : 'border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--brand)]'}`}
                  dir="rtl">
                  {active ? '✓ ' : ''}{opt}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <Field label="رئيس مركز حماية الغابات / Chef CPF" value={c.chefCPF} onChange={set('chefCPF')} />
        </div>
        <div>
          <label className={lbl}>عناصر الفرقة المتنقلة / Rapporteurs</label>
          <div className="grid grid-cols-2 gap-1.5 mt-1">
            {RAPPORTEURS_LIST.map(name => (
              <button key={name}
                onClick={() => setC(prev => ({
                  ...prev,
                  rapporteurs: prev.rapporteurs.includes(name)
                    ? prev.rapporteurs.filter(r => r !== name)
                    : [...prev.rapporteurs, name],
                }))}
                className={`text-right px-3 py-2 rounded-xl text-xs font-medium border-2 transition-all ${c.rapporteurs.includes(name) ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--brand)]'}`}
                dir="rtl">
                {c.rapporteurs.includes(name) ? '✓ ' : ''}{name}
              </button>
            ))}
          </div>
        </div>
      </div>
    ),

    // Tab 3 — الإحداثيات والتصميم
    coords: (
      <div className="space-y-4">
        {/* Coordinate table */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={lbl}>الإحداثيات (لامبار) / Coordonnées Lambert</label>
            <button onClick={importCoordsFromLayer}
              disabled={!importedLayer?.geojson}
              className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-[var(--brand)]/10 text-[var(--brand)] border border-[var(--brand)]/30 hover:bg-[var(--brand)]/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <Download className="w-3 h-3" />
              استيراد من الطبقة
            </button>
          </div>

          {/* Table header */}
          <div className="grid grid-cols-[32px_1fr_1fr_28px] gap-1 mb-1 px-1">
            <span className="text-[9px] font-bold text-[var(--text-muted)] text-center uppercase">ب.</span>
            <span className="text-[9px] font-bold text-[var(--text-muted)] text-center uppercase">X Lambert</span>
            <span className="text-[9px] font-bold text-[var(--text-muted)] text-center uppercase">Y Lambert</span>
            <span />
          </div>

          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
            {c.coordPoints.map((pt, i) => (
              <div key={i} className="grid grid-cols-[32px_1fr_1fr_28px] gap-1 items-center">
                <span className="text-[11px] text-center font-mono font-bold text-[var(--text-muted)] bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg py-2">
                  B{pt.num}
                </span>
                <input
                  value={pt.x}
                  onChange={e => updatePoint(i, 'x', e.target.value)}
                  placeholder="X"
                  className={`${inp} font-mono text-center text-xs`}
                />
                <input
                  value={pt.y}
                  onChange={e => updatePoint(i, 'y', e.target.value)}
                  placeholder="Y"
                  className={`${inp} font-mono text-center text-xs`}
                />
                <button onClick={() => removePoint(i)}
                  className="w-7 h-[38px] flex items-center justify-center text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                  <Minus className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <button onClick={addPoint}
            className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-[var(--border-color)] hover:border-[var(--brand)] text-[var(--text-muted)] hover:text-[var(--brand)] rounded-xl text-xs font-semibold transition-colors">
            <Plus className="w-3.5 h-3.5" /> نقطة جديدة · Nouveau point
          </button>
        </div>

        {/* Croquis section */}
        <div className="border border-[var(--border-color)] rounded-xl overflow-hidden">
          <div className="px-3 py-2 bg-[var(--bg-main)] flex items-center justify-between border-b border-[var(--border-color)]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">التصميم التوضيحي · Croquis</span>
            <button onClick={generateCroquis}
              className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-[var(--brand)] text-white hover:opacity-90 transition-opacity active:scale-95">
              <RefreshCw className="w-3 h-3" />
              توليد تصميم العقار (شمال للأعلى)
            </button>
          </div>
          {croquisSvg ? (
            <div
              className="p-2 bg-[var(--bg-surface)]"
              dangerouslySetInnerHTML={{ __html: croquisSvg }}
            />
          ) : (
            <div className="h-28 flex items-center justify-center text-[var(--text-muted)] bg-[var(--bg-surface)]">
              <div className="text-center">
                <MapPin className="w-6 h-6 mx-auto mb-1 opacity-30" />
                <p className="text-[10px]">اضغط «توليد تصميم العقار» لإنشاء الكروكي</p>
              </div>
            </div>
          )}
        </div>
      </div>
    ),
  };

  return (
    <ModalWrap title="بطاقة معاينة" subtitle="إنتفاء الصبغة الغابوية · ANEF CPF M'diq-Fnideq" onClose={onClose} wide>
      <TabNav tabs={ATTEST_TABS} active={tab} onChange={setTab} />
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {tabContent[tab]}
      </div>
      <ActionBar>
        <BtnPrimary onClick={handlePrint} icon={Printer}>طباعة / Imprimer</BtnPrimary>
        <BtnSecondary onClick={handleWord} icon={FileDown}>Word (.doc)</BtnSecondary>
      </ActionBar>
    </ModalWrap>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// buildExpertiseHTML
// ─────────────────────────────────────────────────────────────────────────────

function buildExpertiseHTML(data: {
  dossier: string; tribunal: string; date: string;
  foret: string; canton: string; superficie: string;
  position: string; rapporteur1: string; rapporteur2: string; description: string;
}): string {
  const dateObj = new Date(data.date || Date.now());
  const dateAr = dateObj.toLocaleDateString('ar-MA', { year: 'numeric', month: 'long', day: 'numeric' });
  return `<!DOCTYPE html><html dir="rtl" lang="ar">
<head><meta charset="utf-8"><title>محضر التصريحات</title>
<style>
  @page{size:A4;margin:2cm 2.5cm}
  body{font-family:'Arial',sans-serif;direction:rtl;font-size:11pt;color:#111;line-height:1.9}
  .header{text-align:center;border-bottom:2px solid #166534;padding-bottom:12px;margin-bottom:18px}
  .header h1{font-size:13pt;color:#166534;margin-bottom:4px}
  .header p{font-size:9pt;color:#555}
  .meta-box{background:#f4f7f4;border:1px solid #c8e6c9;border-radius:4px;padding:10px 14px;margin-bottom:16px;font-size:10pt}
  .meta-row{display:flex;gap:8px;margin:2px 0}
  .meta-label{font-weight:bold;min-width:140px}
  .section{margin-bottom:18px}
  .section-title{font-weight:bold;font-size:12pt;border-bottom:1px solid #ccc;padding-bottom:4px;margin-bottom:10px;color:#166534}
  .body-text{font-size:11pt;line-height:2;text-align:justify}
  .sig-table{width:100%;border-collapse:collapse;margin-top:28px}
  .sig-table td{border:1px solid #555;padding:10px;text-align:center;vertical-align:top;height:80px;font-size:9.5pt}
  .sig-head{background:#e8f5e9;font-weight:bold;height:auto!important;padding:5px!important}
  .legal{font-size:8pt;color:#666;margin-top:20px;padding-top:10px;border-top:1px solid #eee;text-align:center}
</style>
</head><body>
<div class="header">
  <p>المملكة المغربية · الوكالة الوطنية للمياه والغابات · المديرية الإقليمية تطوان · مركز حماية الغابات المضيق-الفنيدق</p>
  <h1>محضر التصريحات</h1>
  <p>Procès-Verbal de Constat · Centre de Protection des Forêts M'diq-Fnideq</p>
</div>
<div class="meta-box">
  <div class="meta-row"><span class="meta-label">ملف عقاري عدد :</span><span>${data.dossier||'—'}</span></div>
  <div class="meta-row"><span class="meta-label">المحكمة الابتدائية :</span><span>${data.tribunal||'تطوان'}</span></div>
  <div class="meta-row"><span class="meta-label">التاريخ :</span><span>${dateAr}</span></div>
  <div class="meta-row"><span class="meta-label">الغابة / Canton :</span><span>${data.foret||'—'}${data.canton ? ' / ' + data.canton : ''}</span></div>
  <div class="meta-row"><span class="meta-label">المساحة المحسوبة :</span><span>${data.superficie||'—'} هكتار</span></div>
</div>
<div class="section">
  <div class="section-title">المحضر</div>
  <p class="body-text">
    بناءا على الأمر التمهيدي والقاضي باجراء الوقوف بعين المكان للتحقق من وضعية العقار موضوع الدعوى، نحن الموقعون اسفله ممثلوا المديرية الإقليمية للوكالة الوطنية للمياه والغابات بتطوان:
  </p>
  <p class="body-text" style="margin-top:8px">
    <strong>1-</strong> ${data.rapporteur1||'...'} : رئيس مركز حماية الغابات للمضيق-الفنيدق بالنيابة<br/>
    <strong>2-</strong> ${data.rapporteur2||'...'} : عضو بالفرقة المتنقلة للمضيق-الفنيدق
  </p>
</div>
<div class="section">
  <div class="section-title">التصريح</div>
  <p class="body-text">
    نصرح بأن القطعة الأرضية موضوع النزاع تدخل <strong>${data.position||'...'}</strong> ضمن الملك الغابوي بالغابة المخزنية لـ «<strong>${data.foret||'...'}</strong>» قسم «<strong>${data.canton||'...'}</strong>».
  </p>
  ${data.superficie ? `<p class="body-text" style="margin-top:6px">المساحة المحسوبة تقنياً: <strong>${data.superficie} هكتار</strong>.</p>` : ''}
  ${data.description ? `<p class="body-text" style="margin-top:6px">${data.description}</p>` : ''}
  <p class="body-text" style="margin-top:10px">حرر بتطوان في: <strong>${dateAr}</strong></p>
</div>
<table class="sig-table">
  <tr>
    <td class="sig-head">المصرح الأول<br/>${data.rapporteur1||''}</td>
    <td class="sig-head">المصرح الثاني<br/>${data.rapporteur2||''}</td>
  </tr>
  <tr><td></td><td></td></tr>
</table>
<div class="legal">مركز حماية الغابات المضيق-الفنيدق — ANEF TTH — الوكالة الوطنية للمياه والغابات</div>
</body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ExpertiseModal — with auto-fill + PDF + Word
// ─────────────────────────────────────────────────────────────────────────────

const EXPERTISE_TABS = [
  { id: 'parties',  label: 'الأطراف · Parties'   },
  { id: 'sujet',    label: 'الموضوع · Objet'       },
];

export function ExpertiseModal({ onClose, importedLayer, forestData }: {
  onClose: () => void;
  importedLayer?: ImportedLayerInfo | null;
  forestData?: any;
}) {
  const [tab, setTab] = useState('parties');
  const [dossier,    setDossier]    = useState('');
  const [tribunal,   setTribunal]   = useState('تطوان');
  const [date,       setDate]       = useState(new Date().toISOString().split('T')[0]);
  const [foret,      setForet]      = useState('');
  const [canton,     setCanton]     = useState('');
  const [superficie, setSuperficie] = useState('');
  const [position,   setPosition]   = useState<'كلياً'|'جزئياً'|'خارج'>('كلياً');
  const [rapporteur1, setR1]        = useState('');
  const [rapporteur2, setR2]        = useState('');
  const [description, setDesc]      = useState('');

  const forets: string[] = forestData?.features
    ? [...new Set<string>(forestData.features.map((f: any) => f.properties?.FORET || '').filter(Boolean))].sort()
    : [];
  const cantons: string[] = foret && forestData?.features
    ? [...new Set<string>(forestData.features.filter((f: any) => f.properties?.FORET === foret).map((f: any) => f.properties?.CANTON || '').filter(Boolean))].sort()
    : [];

  // Auto-fill from importedLayer
  useEffect(() => {
    if (!importedLayer) return;
    const chev = importedLayer.chevauchement;
    if (chev?.hits.length) {
      setForet(f => f || chev.hits[0].foret);
      setCanton(c => c || chev.hits[0].canton);
      const ha = (chev.importedArea / 10000).toFixed(4);
      setSuperficie(s => s || ha);
      setPosition(
        chev.globalPosition === 'داخل الملك الغابوي' ? 'كلياً'
        : chev.globalPosition === 'جزئيا داخل الملك الغابوي' ? 'جزئياً'
        : 'خارج'
      );
    } else if (importedLayer.geojson) {
      try {
        const ha = (turf.area(importedLayer.geojson) / 10000).toFixed(4);
        setSuperficie(s => s || ha);
      } catch (_) {}
    }
  }, [importedLayer]);

  const data = { dossier, tribunal, date, foret, canton, superficie, position, rapporteur1, rapporteur2, description };
  const html = buildExpertiseHTML(data);

  const tabContent: Record<string, React.ReactNode> = {
    parties: (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>ملف رقم / Dossier</label>
            <input value={dossier} onChange={e => setDossier(e.target.value)} className={inp} placeholder="2024/001" />
          </div>
          <div>
            <label className={lbl}>المحكمة / Tribunal</label>
            <input value={tribunal} onChange={e => setTribunal(e.target.value)} className={inp} />
          </div>
        </div>
        <div>
          <label className={lbl}>التاريخ / Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp} />
        </div>
        <div>
          <label className={lbl}>المصرح الأول / Rapporteur 1</label>
          <input value={rapporteur1} onChange={e => setR1(e.target.value)} className={inp} placeholder="رئيس مركز حماية الغابات بالنيابة" />
        </div>
        <div>
          <label className={lbl}>المصرح الثاني / Rapporteur 2</label>
          <input value={rapporteur2} onChange={e => setR2(e.target.value)} className={inp} placeholder="عضو بالفرقة المتنقلة" />
        </div>
        <div>
          <label className={lbl}>ملاحظات / Observations</label>
          <textarea value={description} onChange={e => setDesc(e.target.value)} rows={4}
            className={`${inp} resize-none`} placeholder="تفاصيل إضافية حول العقار..." />
        </div>
      </div>
    ),
    sujet: (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>الغابة / Forêt</label>
            {forets.length > 0
              ? <select value={foret} onChange={e => { setForet(e.target.value); setCanton(''); }} className={sel}><option value="">—</option>{forets.map(v => <option key={v}>{v}</option>)}</select>
              : <input value={foret} onChange={e => setForet(e.target.value)} className={inp} />}
          </div>
          <div>
            <label className={lbl}>القسم / Canton</label>
            {cantons.length > 0
              ? <select value={canton} onChange={e => setCanton(e.target.value)} className={sel}><option value="">—</option>{cantons.map(v => <option key={v}>{v}</option>)}</select>
              : <input value={canton} onChange={e => setCanton(e.target.value)} className={inp} />}
          </div>
        </div>
        <div>
          <label className={lbl}>المساحة المحسوبة (هكتار) / Superficie (Ha)</label>
          <input value={superficie} onChange={e => setSuperficie(e.target.value)} className={`${inp} font-mono`} placeholder="0.0000" />
        </div>
        <div>
          <label className={lbl}>وضعية العقار / Position</label>
          <div className="flex gap-2">
            {(['كلياً','جزئياً','خارج'] as const).map(v => (
              <button key={v} onClick={() => setPosition(v)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${position===v ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--brand)]'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
        {/* Preview summary */}
        <div className="bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl p-3 text-[11px] text-[var(--text-muted)] leading-relaxed" dir="rtl">
          <span className="font-bold text-[var(--text-main)]">معاينة: </span>
          القطعة الأرضية تدخل <strong>{position}</strong> ضمن الملك الغابوي بالغابة المخزنية لـ «{foret||'…'}» قسم «{canton||'…'}» — {superficie||'?'} ha
        </div>
      </div>
    ),
  };

  return (
    <ModalWrap title="Rapport d'Expertise" subtitle="محضر التصريحات · وقوف على المكان" onClose={onClose} wide>
      <TabNav tabs={EXPERTISE_TABS} active={tab} onChange={setTab} />
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {tabContent[tab]}
      </div>
      <ActionBar>
        <BtnPrimary onClick={() => printHtml(html)} icon={Printer}>توليد وطباعة</BtnPrimary>
        <BtnSecondary onClick={() => downloadWord(html, `محضر-${dossier||'expertise'}.doc`)} icon={FileDown}>Word (.doc)</BtnSecondary>
      </ActionBar>
    </ModalWrap>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ChevauchementModal — professional full-screen report
// ─────────────────────────────────────────────────────────────────────────────

export function ChevauchementModal({ onClose, result }: {
  onClose: () => void; result?: ChevauchementResult | null;
}) {
  const printReport = () => {
    if (!result) return;
    const relevantFeats = (result.forestGeoJSON?.features || []).filter((f: any) =>
      result.hits.some(h => h.foret === (f.properties?.FORET || ''))
    ).slice(0, 60);
    const miniSvg = buildMiniMapSVG(result.importedGeoJSON, relevantFeats);
    const hitsRows = result.hits.map(h =>
      `<tr>
        <td style="border:1px solid #ddd;padding:4px 8px">${h.foret}</td>
        <td style="border:1px solid #ddd;padding:4px 8px;direction:rtl">${h.foretAr||'—'}</td>
        <td style="border:1px solid #ddd;padding:4px 8px">${h.canton||'—'}</td>
        <td style="border:1px solid #ddd;padding:4px 8px;text-align:center">${(h.intersectionArea/10000).toFixed(4)} ha</td>
        <td style="border:1px solid #ddd;padding:4px 8px;text-align:center;font-weight:bold;color:${h.percentage>=95?'#dc2626':h.percentage>=1?'#d97706':'#166534'}">${h.percentage.toFixed(1)}%</td>
      </tr>`
    ).join('');
    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>تقرير تحليل التداخل</title>
<style>
  body{font-family:'Arial',sans-serif;direction:rtl;padding:1.5cm 2cm;font-size:10pt;color:#111;line-height:1.7}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;padding-bottom:10px;border-bottom:2px solid #166534}
  .title{font-size:15pt;font-weight:bold;text-align:center;margin:14px 0;text-decoration:underline}
  table{width:100%;border-collapse:collapse;margin:10px 0;font-size:9.5pt}
  th{background:#e8f5e9;border:1px solid #ccc;padding:5px 8px;font-weight:bold;text-align:center}
  @media print{@page{size:A4;margin:1cm 1.5cm}}
</style></head><body>
<div class="header">
  <div style="font-size:8.5pt;line-height:1.8"><strong>المملكة المغربية</strong><br>الوكالة الوطنية للمياه والغابات<br>المديرية الإقليمية طنجة-تطوان-الحسيمة<br>المديرية الإقليمية تطوان<br>مركز حماية الغابات المضيق-الفنيدق</div>
  <div style="text-align:left;direction:ltr;font-size:8.5pt;line-height:1.8"><strong>Royaume du Maroc</strong><br>Agence Nationale des Eaux et Forêts<br>Direction Régionale TTH<br>Direction Provinciale de Tétouan<br>CPF M'diq-Fnideq</div>
</div>
<div class="title">تقرير تحليل التداخل مع الملك الغابوي</div>
<table>
  <tr><th colspan="2">معلومات عامة — Informations générales</th></tr>
  <tr><td style="border:1px solid #ddd;padding:4px 8px;font-weight:bold">اسم الطبقة</td><td style="border:1px solid #ddd;padding:4px 8px">${result.layerName}</td></tr>
  <tr><td style="border:1px solid #ddd;padding:4px 8px;font-weight:bold">المساحة الإجمالية</td><td style="border:1px solid #ddd;padding:4px 8px">${(result.importedArea/10000).toFixed(4)} ha</td></tr>
  <tr><td style="border:1px solid #ddd;padding:4px 8px;font-weight:bold">مساحة التقاطع</td><td style="border:1px solid #ddd;padding:4px 8px">${(result.totalIntersectionArea/10000).toFixed(4)} ha</td></tr>
  <tr><td style="border:1px solid #ddd;padding:4px 8px;font-weight:bold">نسبة التداخل</td><td style="border:1px solid #ddd;padding:4px 8px"><strong>${result.totalPercentage.toFixed(1)}%</strong></td></tr>
  <tr><td style="border:1px solid #ddd;padding:4px 8px;font-weight:bold">الوضعية</td><td style="border:1px solid #ddd;padding:4px 8px;font-weight:bold">${result.globalPosition}</td></tr>
</table>
${result.hits.length > 0 ? `<div style="margin:14px 0 6px;font-size:11pt;font-weight:bold">تفاصيل التقاطع :</div>
<table><tr><th>الغابة (fr)</th><th>الغابة (ar)</th><th>Canton</th><th>مساحة التقاطع</th><th>النسبة</th></tr>${hitsRows}</table>` : ''}
<div style="margin:18px 0;text-align:center">${miniSvg}</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:28px">
  <div style="text-align:center;border-top:1px solid #999;padding-top:8px;font-size:9pt">رئيس مركز حماية الغابات<br>المضيق - الفنيدق<br><br><strong>مومن معاذ</strong></div>
  <div style="text-align:center;border-top:1px solid #999;padding-top:8px;font-size:9pt">عناصر الفرقة المتنقلة<br><br><br></div>
</div>
</body></html>`;
    printHtml(html);
  };

  if (!result) {
    return (
      <ModalWrap title="Analyse Chevauchement" subtitle="Domaine Forestier · تحليل التداخل" onClose={onClose}>
        <div className="p-5 space-y-4">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
            <p className="text-amber-600 text-xs font-bold uppercase tracking-wider mb-2">Utilisation</p>
            <p className="text-[var(--text-main)] text-sm">L'analyse se lance automatiquement à l'import d'une couche polygone.</p>
          </div>
          <div className="space-y-2">
            {[
              "Aller dans l'onglet Couches",
              "Importer un GeoJSON, SHP ou KML (polygone)",
              "Le résultat apparaît automatiquement sous la couche",
              "Revenez ici pour le rapport PDF complet",
            ].map((s, i) => (
              <div key={i} className="flex gap-3 items-start">
                <span className="w-6 h-6 rounded-full bg-[var(--brand)] text-white text-xs font-bold flex items-center justify-center shrink-0">{i+1}</span>
                <p className="text-[var(--text-main)] text-sm pt-0.5">{s}</p>
              </div>
            ))}
          </div>
        </div>
        <ActionBar>
          <BtnSecondary onClick={onClose} icon={Layers}>Aller aux Couches</BtnSecondary>
        </ActionBar>
      </ModalWrap>
    );
  }

  const isInside  = result.globalPosition === 'داخل الملك الغابوي';
  const isPartial = result.globalPosition === 'جزئيا داخل الملك الغابوي';
  const statusColor = isInside ? '#ef4444' : isPartial ? '#f97316' : '#22c55e';
  const labelFr  = isInside ? 'INCLUSION TOTALE' : isPartial ? 'CHEVAUCHEMENT PARTIEL' : 'HORS DOMAINE FORESTIER';

  return (
    <ModalWrap title="Analyse Chevauchement" subtitle="Domaine Forestier · تحليل التداخل" onClose={onClose} wide>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Status banner */}
        <div className="rounded-xl overflow-hidden border-2" style={{ borderColor: statusColor }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: statusColor + '18' }}>
            <div>
              <span className="text-[10px] font-black tracking-widest uppercase block" style={{ color: statusColor }}>{labelFr}</span>
              <span className="text-[13px] font-bold" style={{ color: statusColor, direction: 'rtl' }}>{result.globalPosition}</span>
            </div>
            <span className="text-3xl font-black font-mono" style={{ color: statusColor }}>{result.totalPercentage.toFixed(1)}%</span>
          </div>
          <div className="px-4 py-3 grid grid-cols-3 gap-4 bg-[var(--bg-main)] text-center">
            <div>
              <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">Couche</p>
              <p className="text-[11px] font-bold text-[var(--text-main)] truncate">{result.layerName}</p>
            </div>
            <div>
              <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">Surface totale</p>
              <p className="text-[11px] font-bold font-mono text-[var(--text-main)]">{(result.importedArea/10000).toFixed(3)} ha</p>
            </div>
            <div>
              <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">Intersection</p>
              <p className="text-[11px] font-bold font-mono" style={{ color: statusColor }}>{(result.totalIntersectionArea/10000).toFixed(3)} ha</p>
            </div>
          </div>
        </div>

        {/* Breakdown */}
        {result.hits.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] px-1">Détail par forêt</p>
            {result.hits.map((h, i) => (
              <div key={i} className="bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl px-3 py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold text-[var(--text-main)] truncate">🌲 {h.foret}{h.canton ? ` — ${h.canton}` : ''}</p>
                  {h.foretAr && <p className="text-[10px] text-[var(--text-muted)] truncate" dir="rtl">{h.foretAr}</p>}
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <span className="text-[13px] font-black font-mono" style={{ color: statusColor }}>{h.percentage.toFixed(1)}%</span>
                  <div className="w-20 h-1.5 rounded-full bg-[var(--border-color)] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, h.percentage)}%`, backgroundColor: statusColor }} />
                  </div>
                  <span className="text-[9px] font-mono text-[var(--text-muted)]">{(h.intersectionArea/10000).toFixed(3)} ha</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <ActionBar>
        <BtnPrimary onClick={printReport} icon={Printer}>تقرير PDF · Rapport</BtnPrimary>
        <BtnSecondary
          onClick={() => {
            const relevantFeats = (result.forestGeoJSON?.features || []).filter((f: any) =>
              result.hits.some(h => h.foret === (f.properties?.FORET||''))
            ).slice(0,60);
            const svg = buildMiniMapSVG(result.importedGeoJSON, relevantFeats);
            const blob = new Blob([svg], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            Object.assign(document.createElement('a'), { href: url, download: `chevauchement-${result.layerName}.svg` }).click();
            URL.revokeObjectURL(url);
          }}
          icon={Download}
        >
          Carte SVG
        </BtnSecondary>
      </ActionBar>
    </ModalWrap>
  );
}