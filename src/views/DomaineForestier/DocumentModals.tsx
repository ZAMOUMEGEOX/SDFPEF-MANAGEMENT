// src/views/DomaineForestier/DocumentModals.tsx
import React, { useState, useEffect, useRef } from 'react';
import * as turf from '@turf/turf';
import proj4 from 'proj4';
import {
  X, Printer, FileDown, FileText, Layers,
  Plus, Minus, MapPin, RefreshCw, Copy, Download,
} from 'lucide-react';
import { exportFicheDocx, exportAttestationDocx, htmlToDocx } from '../../lib/forestDocx';

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

export const FORET_AR: Record<string, string> = {
  'BENI HASSAN':'بني حسن','BOUHACHEM':'بوهشم','RHOMARA':'غمارة',
  'TALEMBOTE':'تالمبوت','JBEL DARSA':'جبل درسة','JBEL DERSA':'جبل درسة',
  'ANJRA NORD':'أنجرة الشمالية','ANJRA SUD':'أنجرة الجنوبية',
  'FNIDEQ':'الفنيدق','BENSLIMANE':'بن سليمان',
};

// ─────────────────────────────────────────────────────────────────────────────
// القسم الغابوي (CANTON) — translittération arabe LITTÉRALE (pas une traduction)
// ex: AZFA → عزفة, MELLALYEN → الملاليين. Le canton est lu depuis la couche
// forestière (propriété CANTON), puis converti ici en arabe pour le document.
// ─────────────────────────────────────────────────────────────────────────────
export const CANTON_AR: Record<string, string> = {
  'AZFA':'عزفة','MELLALYEN':'الملاليين','MALLALYEN':'الملاليين','MALALIYINE':'الملاليين',
  'NICH HLOUEN':'نيش الحلوين','NICH':'نيش الحلوين','HLOUEN':'الحلوين',
  'EL HAOUZ':'الحوز','HAOUZ':'الحوز','ALIYINE':'عليين','ALIINE':'عليين',
  'KOUDIAT':'كدية','RMEL':'الرمل','OUED LAOU':'وادي لاو','MARTIL':'مرتيل',
  'BENI YDER':'بني يدر','ZIATEN':'زيانة','TAGHRAMT':'تغرامت',
};

// Translittérateur de secours pour les cantons inconnus (Latin → arabe).
const _ARMAP: Array<[RegExp, string]> = [
  [/ch/gi,'ش'],[/kh/gi,'خ'],[/gh/gi,'غ'],[/th/gi,'ث'],[/sh/gi,'ش'],[/ou/gi,'و'],[/aa/gi,'ا'],
  [/dj/gi,'ج'],[/a/gi,'ا'],[/b/gi,'ب'],[/c/gi,'ك'],[/d/gi,'د'],[/e/gi,''],[/f/gi,'ف'],[/g/gi,'گ'],
  [/h/gi,'ه'],[/i/gi,'ي'],[/j/gi,'ج'],[/k/gi,'ك'],[/l/gi,'ل'],[/m/gi,'م'],[/n/gi,'ن'],[/o/gi,'و'],
  [/p/gi,'ب'],[/q/gi,'ق'],[/r/gi,'ر'],[/s/gi,'س'],[/t/gi,'ت'],[/u/gi,'و'],[/v/gi,'ف'],[/w/gi,'و'],
  [/x/gi,'كس'],[/y/gi,'ي'],[/z/gi,'ز'],
];
function transliterateAr(s: string): string {
  let out = ' ' + s.toLowerCase() + ' ';
  for (const [re, rep] of _ARMAP) out = out.replace(re, rep);
  return out.trim();
}
export function cantonArabic(canton?: string): string {
  if (!canton) return '';
  const key = canton.trim().toUpperCase();
  if (CANTON_AR[key]) return CANTON_AR[key];
  // tolérance accents / espaces
  const norm = key.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  if (CANTON_AR[norm]) return CANTON_AR[norm];
  return transliterateAr(canton);
}

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
  insideArea?: number; outsideArea?: number; outsideGeoJSON?: any;
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
  let impBbox: number[] | null = null;
  try { impBbox = turf.bbox(importedPoly); } catch {}
  const bboxOverlap = (a: number[], b: number[]) => !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);

  const hits: ChevauchementHit[] = [];
  const interFeatures: any[] = [];   // pour le dé-doublonnage (dissolve)
  const candidates: any[] = [];      // parcelles forêt réellement concernées
  for (const feat of (forestGeojson?.features || [])) {
    if (!feat.geometry) continue;
    if (feat.geometry.type !== 'Polygon' && feat.geometry.type !== 'MultiPolygon') continue;
    if (impBbox) { try { if (!bboxOverlap(impBbox, turf.bbox(feat))) continue; } catch {} }  // pré-filtre rapide
    try {
      const intersection = turf.intersect(turf.featureCollection([importedPoly, feat]));
      if (!intersection) continue;
      const intersectionArea = turf.area(intersection);
      if (intersectionArea < 1) continue;
      interFeatures.push(intersection);
      candidates.push(feat);
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

  // Surface intérieure DÉ-DOUBLONNÉE : union des intersections (évite de compter
  // deux fois une zone couverte par 2 parcelles forêt qui se chevauchent).
  let insideArea = 0; let outsideGeoJSON: any = null;
  try {
    let merged: any = interFeatures[0] || null;
    for (let i = 1; i < interFeatures.length; i++) {
      const u = turf.union(turf.featureCollection([merged, interFeatures[i]]));
      if (u) merged = u;
    }
    insideArea = merged ? turf.area(merged) : 0;
    if (candidates.length) {
      let forestMerged: any = candidates[0];
      for (let i = 1; i < candidates.length; i++) {
        const u = turf.union(turf.featureCollection([forestMerged, candidates[i]]));
        if (u) forestMerged = u;
      }
      outsideGeoJSON = turf.difference(turf.featureCollection([importedPoly, forestMerged]));
    } else { outsideGeoJSON = importedPoly; }
  } catch (_) { insideArea = hits.reduce((s, h) => s + h.intersectionArea, 0); }

  const totalIntersectionArea = insideArea;                       // = surface réelle dans le domaine
  const outsideArea = Math.max(0, importedArea - insideArea);
  const totalPercentage = Math.min(100, importedArea > 0 ? (insideArea / importedArea) * 100 : 0);
  const globalPosition: ChevauchementResult['globalPosition'] =
    totalPercentage >= 95 ? 'داخل الملك الغابوي' : totalPercentage >= 1 ? 'جزئيا داخل الملك الغابوي' : 'خارج الملك الغابوي';
  return { layerName, importedArea, totalIntersectionArea, totalPercentage, globalPosition, hits, intersections: hits, importedGeoJSON: importedGeojson, forestGeoJSON: forestGeojson, insideArea, outsideArea, outsideGeoJSON };
}

// ─────────────────────────────────────────────────────────────────────────────
// buildMiniMapSVG — enhanced with north arrow + scale
// ─────────────────────────────────────────────────────────────────────────────

function buildMiniMapSVG(importedGeojson: any, forestFeats: any[]): string {
  try {
    const impFeats = (importedGeojson.type === 'FeatureCollection'
      ? importedGeojson.features
      : [importedGeojson]
    ).filter((f: any) => f?.geometry);
    if (impFeats.length === 0) throw new Error('empty');

    // Zoom viewport to the parcel only, with generous buffer
    const impCollection = turf.featureCollection(impFeats);
    const [minX, minY, maxX, maxY] = turf.bbox(impCollection);
    const dX = Math.max(maxX - minX, 0.001);
    const dY = Math.max(maxY - minY, 0.001);
    const bufX = dX * 0.65, bufY = dY * 0.65;
    const bMinX = minX - bufX, bMaxX = maxX + bufX;
    const bMinY = minY - bufY, bMaxY = maxY + bufY;

    const W = 470, H = 330;
    // Latitude correction — 1° lon ≠ 1° lat at Morocco's latitude (~35°N)
    const midLat = (bMinY + bMaxY) / 2;
    const latCos = Math.cos(midLat * Math.PI / 180);
    const rangeX = (bMaxX - bMinX) * latCos;
    const rangeY = bMaxY - bMinY;
    const sc = Math.min(W / rangeX, H / rangeY);

    const tx = (c: number[]) => {
      const px = (c[0] - bMinX) * latCos * sc;
      const py = H - (c[1] - bMinY) * sc;
      return `${px.toFixed(1)},${py.toFixed(1)}`;
    };
    const gp = (geom: any): string => {
      if (!geom) return '';
      if (geom.type === 'Polygon')
        return geom.coordinates.map((r: number[][]) => 'M' + r.map(tx).join('L') + 'Z').join(' ');
      if (geom.type === 'MultiPolygon')
        return geom.coordinates.flatMap((p: number[][][]) => p.map((r: number[][]) => 'M' + r.map(tx).join('L') + 'Z')).join(' ');
      return '';
    };

    // Filter forest features to those visible in the viewport
    const visibleForest = forestFeats.filter(f => {
      if (!f?.geometry) return false;
      try {
        const [fx0, fy0, fx1, fy1] = turf.bbox(f);
        return fx0 < bMaxX && fx1 > bMinX && fy0 < bMaxY && fy1 > bMinY;
      } catch (_) { return false; }
    });

    const forestPaths = visibleForest.map(f =>
      `<path d="${gp(f.geometry)}" fill="#16a34a" fill-opacity="0.15" stroke="#16a34a" stroke-width="1.4"/>`
    ).join('');
    const impPaths = impFeats.map((f: any) =>
      `<path d="${gp(f?.geometry)}" fill="#dc2626" fill-opacity="0.22" stroke="#dc2626" stroke-width="3" stroke-linejoin="round"/>`
    ).join('');

    // Centroid dot
    let centX = W / 2, centY = H / 2;
    try {
      const ctr = turf.centroid(impCollection);
      centX = (ctr.geometry.coordinates[0] - bMinX) * latCos * sc;
      centY = H - (ctr.geometry.coordinates[1] - bMinY) * sc;
    } catch (_) {}

    // Échelle : mètres au sol par pixel (sc = pixels par degré de latitude ≈ 111 km)
    const mPerPx = 111000 / sc;
    const targetPx = 90;                       // longueur visée de la barre d'échelle
    const NICE = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];
    const rawDist = targetPx * mPerPx;
    const niceDist = NICE.reduce((a, b) => (Math.abs(b - rawDist) < Math.abs(a - rawDist) ? b : a), NICE[0]);
    const barPx = Math.max(28, Math.min(150, niceDist / mPerPx));
    const scaleLabel = niceDist >= 1000 ? `${(niceDist / 1000).toFixed(niceDist % 1000 === 0 ? 0 : 1)} km` : `${niceDist} m`;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
      <defs>
        <pattern id="mgrid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#b8cfe0" stroke-width="0.5"/>
        </pattern>
      </defs>
      <rect width="${W}" height="${H}" fill="#d8eaf7" rx="5"/>
      <rect width="${W}" height="${H}" fill="url(#mgrid)" rx="5"/>
      ${forestPaths}
      ${impPaths}
      <circle cx="${centX.toFixed(1)}" cy="${centY.toFixed(1)}" r="5" fill="#ef4444" opacity="0.95" stroke="white" stroke-width="1.4"/>

      <!-- Rose des vents (Nord) -->
      <g transform="translate(${W - 30},30)" font-family="Arial">
        <circle cx="0" cy="0" r="15" fill="white" stroke="#475569" stroke-width="1.2" opacity="0.97"/>
        <polygon points="0,-11 -4,3 0,0.5 4,3" fill="#1e293b"/>
        <polygon points="0,11 -4,-3 0,-0.5 4,-3" fill="#cbd5e1"/>
        <text x="0" y="-15.5" text-anchor="middle" font-size="9" fill="#1e293b" font-weight="bold">N</text>
      </g>

      <!-- Barre d'échelle (bas-droite) -->
      <g transform="translate(${(W - barPx - 34).toFixed(1)},${H - 18})" font-family="Arial">
        <rect x="-6" y="-13" width="${barPx + 24}" height="28" rx="5" fill="white" stroke="#9aa5b1" stroke-width="0.8" opacity="0.96"/>
        <rect x="2" y="2" width="${(barPx / 2).toFixed(1)}" height="6" fill="#1e293b"/>
        <rect x="${(2 + barPx / 2).toFixed(1)}" y="2" width="${(barPx / 2).toFixed(1)}" height="6" fill="white" stroke="#1e293b" stroke-width="0.8"/>
        <text x="2" y="-3" font-size="9.5" fill="#1e293b" font-weight="bold">0</text>
        <text x="${(2 + barPx).toFixed(1)}" y="-3" text-anchor="middle" font-size="9.5" fill="#1e293b" font-weight="bold">${scaleLabel}</text>
      </g>

      <!-- Légende — carte claire, texte dans le cadre -->
      <g font-family="Arial">
        <rect x="10" y="${H - 86}" width="206" height="58" rx="7" fill="#ffffff" stroke="#9aa5b1" stroke-width="1" opacity="0.97"/>
        <text x="22" y="${H - 68}" font-size="12.5" font-weight="bold" fill="#334155" letter-spacing="0.4">Légende</text>
        <line x1="22" y1="${H - 63}" x2="204" y2="${H - 63}" stroke="#e2e8f0" stroke-width="1"/>
        <rect x="22" y="${H - 56}" width="20" height="13" rx="2" fill="#16a34a" fill-opacity="0.2" stroke="#16a34a" stroke-width="1.6"/>
        <text x="50" y="${H - 46}" font-size="13" fill="#166534" font-weight="bold">Domaine forestier</text>
        <rect x="22" y="${H - 37}" width="20" height="13" rx="2" fill="#dc2626" fill-opacity="0.2" stroke="#ef4444" stroke-width="2.2"/>
        <text x="50" y="${H - 27}" font-size="13" fill="#b91c1c" font-weight="bold">Parcelle concernée</text>
      </g>
    </svg>`;
  } catch (_) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="100">
      <rect width="440" height="100" fill="#f4f4f4" rx="4"/>
      <text x="50%" y="50%" text-anchor="middle" fill="#999" font-size="12" font-family="Arial">Croquis non disponible</text>
    </svg>`;
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
        <div className="text-[10px] text-(--text-muted)">
          {(result.importedArea / 10000).toFixed(3)} ha · تقاطع: {(result.totalIntersectionArea / 10000).toFixed(3)} ha
        </div>
        {result.hits.slice(0, 3).map((h, i) => (
          <div key={i} className="text-[10px] flex items-center justify-between">
            <span className="text-(--text-main) truncate flex-1 mr-2">🌲 {h.foret}{h.canton ? ` — ${h.canton}` : ''}</span>
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

const inp = "w-full bg-(--bg-main) border border-(--border-color) rounded-lg px-2.5 py-2 text-sm text-(--text-main) focus:outline-none focus:border-(--brand) transition-colors";
const lbl = "block text-[10px] font-semibold text-(--text-muted) uppercase tracking-wider mb-1";
const sel = "w-full bg-(--bg-main) border border-(--border-color) rounded-lg px-2.5 py-2 text-sm text-(--text-main) focus:outline-none focus:border-(--brand) transition-colors";

function ModalWrap({ title, subtitle, onClose, wide = false, children }: {
  title: string; subtitle?: string; onClose: () => void; wide?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-2000 flex items-center justify-center p-3 bg-black/65 backdrop-blur-sm">
      <div
        className={`bg-(--bg-surface) border border-(--border-color) rounded-2xl shadow-2xl w-full flex flex-col overflow-hidden ${wide ? 'max-w-2xl' : 'max-w-lg'}`}
        style={{ maxHeight: '92vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-(--border-color) bg-(--bg-main) shrink-0">
          <div>
            <h3 className="text-(--text-main) font-bold text-sm tracking-wide">{title}</h3>
            {subtitle && <p className="text-[10px] text-(--text-muted) mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose}
            className="p-1.5 text-(--text-muted) hover:text-(--text-main) hover:bg-(--bg-surface) rounded-lg border border-(--border-color) transition-colors">
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
    <div className="flex border-b border-(--border-color) shrink-0 bg-(--bg-main) px-1">
      {tabs.map(tab => (
        <button key={tab.id} onClick={() => onChange(tab.id)}
          className={`
            flex-1 px-2 py-2.5 text-[11px] font-bold tracking-wide transition-all relative
            ${active === tab.id
              ? 'text-(--brand)'
              : 'text-(--text-muted) hover:text-(--text-main)'}
          `}>
          {tab.label}
          {active === tab.id && (
            <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-(--brand)" />
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
    <div className="shrink-0 px-4 py-3 border-t border-(--border-color) bg-(--bg-main) flex gap-2">
      {children}
    </div>
  );
}

function BtnPrimary({ onClick, icon: Icon, children }: any) {
  return (
    <button onClick={onClick}
      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-(--brand) hover:opacity-90 text-white font-semibold rounded-xl text-sm active:scale-95 transition-all">
      {Icon && <Icon className="w-4 h-4" />}{children}
    </button>
  );
}

function BtnSecondary({ onClick, icon: Icon, children, title }: any) {
  return (
    <button onClick={onClick} title={title}
      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-(--bg-surface) border border-(--border-color) hover:border-(--brand) text-(--text-main) font-semibold rounded-xl text-sm active:scale-95 transition-all">
      {Icon && <Icon className="w-4 h-4" />}{children}
    </button>
  );
}

function printHtml(html: string) {
  const w = window.open('', '_blank', 'width=960,height=750');
  if (w) { w.document.write(html); w.document.close(); setTimeout(() => { w.focus(); w.print(); }, 400); }
}

function downloadWord(html: string, filename: string) {
  // Produit désormais un VRAI .docx (au lieu du faux application/msword)
  void htmlToDocx(html, filename);
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

function buildFicheHTML(c: FicheConfig, croquisSvg?: string): string {
  const empColor = c['empiètement']==='TOTAL' ? '#dc2626' : c['empiètement']==='PARTIEL' ? '#d97706' : '#166534';
  const empBg    = c['empiètement']==='TOTAL' ? 'rgba(220,38,38,0.08)' : c['empiètement']==='PARTIEL' ? 'rgba(217,119,6,0.08)' : 'rgba(22,101,52,0.08)';
  const avisColor = c.avis==='DÉFAVORABLE' ? '#dc2626' : '#166534';
  const croquisPart = croquisSvg
    ? `<div class="croquis-frame">${croquisSvg}</div>`
    : `<div class="croquis-placeholder">[ Croquis de situation — utilisez « Générer le croquis » ]</div>`;
  // Mise en page par TABLEAU (et non flexbox) → rendu fidèle dans Word + impression PDF.
  return `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">
<title>Fiche Technique de Réquisition</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:Orientation>Landscape</w:Orientation></w:WordDocument></xml><![endif]-->
<style>
  @page{size:A4 landscape;margin:1.1cm 1.3cm}
  *{box-sizing:border-box}
  body{font-family:"Times New Roman",serif;font-size:9.5pt;color:#111;line-height:1.32;margin:0;padding:0}
  table.layout{width:100%;border-collapse:collapse;table-layout:fixed}
  td.col-left{width:56%;vertical-align:top;padding:0 14px 0 0;border-right:1.5pt solid #555}
  td.col-right{width:44%;vertical-align:top;padding:0 0 0 14px}
  table.hdr{width:100%;border-collapse:collapse;margin-bottom:4pt}
  table.hdr td{vertical-align:top;font-size:9pt;line-height:1.45}
  table.hdr td.r{text-align:right}
  h2{text-align:center;font-size:11pt;text-decoration:underline;margin:3pt 0 5pt;line-height:1.35}
  .sec{margin-top:3.5pt}
  .sec-title{font-weight:bold;text-decoration:underline;font-size:9.5pt;margin:0 0 1.5pt}
  .sec p{margin:1pt 0}
  p{margin:1.5pt 0}
  .sup-cell{display:inline-block;border:1px solid #888;padding:0 6px;font-weight:bold;background:#fafafa;margin:0 1px}
  .badge{display:inline-block;border:2pt solid ${empColor};color:${empColor};background:${empBg};padding:2pt 14pt;font-weight:bold;font-size:12pt;letter-spacing:2pt;margin-top:2pt}
  .croquis-title{font-size:10pt;font-weight:bold;text-align:center;margin-bottom:5pt;text-decoration:underline}
  .croquis-frame{width:100%;border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;background:#fff}
  .croquis-frame svg{display:block;width:100%;height:auto}
  .croquis-placeholder{width:100%;height:260pt;border:1px dashed #bbb;display:flex;align-items:center;justify-content:center;color:#999;font-style:italic;font-size:9pt;background:#f9f9f9}
  .corr{border-top:1.5pt solid #555;margin-top:9pt;padding-top:6pt;font-size:8.5pt;line-height:1.5}
  .corr .center{text-align:center;font-style:italic;margin:5pt 0}
  .avis-word{font-size:12pt;font-weight:bold;color:${avisColor}}
</style></head><body>
<table class="layout"><tr>
  <td class="col-left">
    <table class="hdr"><tr>
      <td><b>DRANEF :</b> TTH<br><b>DPANEF :</b> Tétouan<br><b>CPF :</b> M'diq-Fnideq<br><b>BM :</b> M'diq-Fnideq</td>
      <td class="r">N° <b>${c.numero||'___'}</b><br>Le, <b>${c.date||''}</b><br>Réf : Envoi CPF n° <b>${c.refEnvoi||'___'}</b></td>
    </tr></table>
    <h2>- RÉQUISITION DE LA DÉLIMITATION OU D'IMMATRICULATION -<br><span style="font-size:10pt">- FICHE DE RECONNAISSANCE -</span></h2>
    <p><u>L'immeuble foncier dit :</u> <b>${c.immeubleDit||'…'}</b></p>
    <p>Objet de la réquisition N° : <b>${c.objetRequisition||'…'}</b></p>
    <p>Bulletin officiel N° <b>${c.bulletinOfficielNum||'…'}</b> du <b>${c.bulletinOfficielDate||'…'}</b></p>
    <p>A la demande de : <b>${c.demandeParNom||'…'}</b></p>
    <div class="sec"><div class="sec-title">2°) SITUATION ADMINISTRATIVE ET FORESTIÈRE :</div>
      <p>- Commune Rurale de : <b>${c.communeRurale||'…'}</b> &nbsp; Cercle de : <b>${c.cercle||'…'}</b> &nbsp; Caïdat de : <b>${c.caidat||'…'}</b></p>
      <p>- Forêt : <b>${c.foret||'…'}</b>, BM : M'diq-Fnideq, Canton de <b>${c.canton||'…'}</b></p>
      <p>- Périmètre : <b>${c.perimetre||'…'}</b> m &nbsp; Lieudit : <b>${c.lieudit||'…'}</b></p>
      <p>- Coordonnées Lambert &nbsp; X : <b>${c.lambertX||'…'}</b> ; Y : <b>${c.lambertY||'…'}</b> &nbsp; sur carte Tétouan</p>
      <p>- Superficie déclarée :
        <span class="sup-cell">${c.superficieDeclareHa||'00'}</span> HA
        <span class="sup-cell">${c.superficieDeclareAr||'00'}</span> A
        <span class="sup-cell">${c.superficieDeclareCa||'00'}</span> CA
        &nbsp; Bornée : <b>${c.superficieBornee||'…'}</b></p>
      <p>- N° de la borne la plus proche : <b>${c.borneNumero||'…'}</b></p>
    </div>
    <div class="sec"><div class="sec-title">3°) DESCRIPTION DE L'IMMEUBLE :</div>
      <p>- Distance / position par rapport à la forêt : <b style="color:${empColor}">${c.distanceDescription||'…'}</b></p>
      <p>- Description : ${c.descriptionVegetation||'matorral et chêne liège'}</p>
    </div>
    <div class="sec"><div class="sec-title">4°) INTERVENTIONS FORESTIÈRES :</div>
      <p>- Reboisement : ${c.reboisement||'—'} &nbsp; - Équipement : ${c.equipement||'—'} &nbsp; - Exploitation : ${c.exploitation||'—'} &nbsp; - P.V. dressés : ${c.pvDresses||'—'}</p>
    </div>
    <div class="sec"><div class="sec-title">5°) ACTES DE PROPRIÉTÉ EN PRÉSENCE :</div>
      <p>${c.actesPropriete||'—'}</p>
    </div>
    <div class="sec"><div class="sec-title">6°) EMPIÈTEMENT DE LA RÉQUISITION :</div>
      <p><span class="badge">EMPIÈTEMENT ${c['empiètement']}</span></p>
    </div>
    <div class="sec"><div class="sec-title">7°) CONCLUSION ET ÉLÉMENTS DIVERS :</div>
      <p>${c.conclusion||'…………………………………………………………'}</p>
      <p style="text-align:right;margin-top:3pt">En date du : <b>${c.signataireDate||c.date||''}</b></p>
    </div>
  </td>
  <td class="col-right">
    <div class="croquis-title">Croquis de situation à valider :</div>
    ${croquisPart}
    <div class="corr">
      <div>N° &nbsp;&nbsp;&nbsp;&nbsp; /CPF/M'diq-Fnideq &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; M'diq, Le ${c.signataireDate||c.date||''}</div>
      <div class="center">Copie conforme transmise à<br><b>Mr le Directeur Provincial de l'ANEF de TETOUAN</b></div>
      <div>« Pour information, en ayant l'honneur de vous informer que cette Zone émet un avis <span class="avis-word">${c.avis}</span> ».</div>
      <div style="text-align:right;margin-top:9pt"><b>Le Chef de CPF de M'diq - Fnideq</b><br>${c.signataire||''}</div>
    </div>
  </td>
</tr></table>
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
  const [croquisSvg, setCroquisSvg] = useState<string | null>(null);
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
    const emp: FicheConfig['empiètement'] = chev
      ? (chev.globalPosition === 'داخل الملك الغابوي' ? 'TOTAL' : chev.globalPosition === 'جزئيا داخل الملك الغابوي' ? 'PARTIEL' : 'NÉANT')
      : 'NÉANT';
    setC(prev => ({
      ...prev,
      immeubleDit: prev.immeubleDit || importedLayer.name,
      foret: prev.foret || (chev?.hits[0]?.foret ?? ''),
      canton: prev.canton || (chev?.hits[0]?.canton ?? ''),
      'empiètement': chev ? emp : prev['empiètement'],
      avis: chev ? (emp === 'NÉANT' ? 'FAVORABLE' : 'DÉFAVORABLE') : prev.avis,
    }));
    if (importedLayer.geojson) {
      const impPoly = importedLayer.geojson.type === 'FeatureCollection'
        ? importedLayer.geojson.features[0] : importedLayer.geojson;
      let centroidPt: any = null;
      try {
        const area = turf.area(importedLayer.geojson);
        const ha = Math.floor(area / 10000);
        const ar = Math.floor((area % 10000) / 100);
        const ca = Math.round(area % 100);
        const perim = turf.length(importedLayer.geojson, { units: 'meters' });
        centroidPt = turf.centroid(importedLayer.geojson);
        const [lng, lat] = centroidPt.geometry.coordinates;
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

      // Distance / position par rapport à la forêt (auto, en français)
      try {
        let distTxt = '';
        if (emp === 'TOTAL') {
          distTxt = 'Totalement à l\'intérieur du domaine forestier.';
        } else if (emp === 'PARTIEL') {
          const pct = chev ? chev.totalPercentage.toFixed(1) : '';
          distTxt = `Partiellement à l'intérieur du domaine forestier (chevauchement ${pct} %).`;
        } else {
          // Hors domaine : calcul de la distance au bord forestier le plus proche (borné par bbox)
          let nearest = Infinity;
          if (centroidPt && forestData?.features) {
            const [cx, cy] = centroidPt.geometry.coordinates;
            for (const feat of forestData.features) {
              if (!feat?.geometry) continue;
              try {
                const [fx0, fy0, fx1, fy1] = turf.bbox(feat);
                if (cx < fx0 - 0.05 || cx > fx1 + 0.05 || cy < fy0 - 0.05 || cy > fy1 + 0.05) continue;
                const line = turf.polygonToLine(feat);
                const lines = line.type === 'FeatureCollection' ? line.features : [line];
                for (const ln of lines) {
                  const d = turf.pointToLineDistance(centroidPt, ln as any, { units: 'meters' });
                  if (d < nearest) nearest = d;
                }
              } catch (_) {}
            }
          }
          distTxt = Number.isFinite(nearest)
            ? `À l'extérieur du domaine forestier (à environ ${Math.round(nearest)} m du domaine le plus proche).`
            : 'À l\'extérieur du domaine forestier.';
        }
        if (distTxt) setC(prev => ({ ...prev, distanceDescription: prev.distanceDescription || distTxt }));
      } catch (_) {}

      // Auto-fill commune + lieudit via intersection géographique (noms FR)
      if (communesData?.features) {
        try {
          let best = ''; let bestArea = 0;
          for (const feat of communesData.features) {
            if (!feat.geometry) continue;
            try {
              const inter = turf.intersect(turf.featureCollection([impPoly, feat]));
              if (inter) {
                const a = turf.area(inter);
                if (a > bestArea) { bestArea = a; best = feat.properties?.NomFr || feat.properties?.NomAr || ''; }
              }
            } catch (_) {}
          }
          if (best) setC(prev => ({
            ...prev,
            communeRurale: prev.communeRurale || best,
            lieudit: prev.lieudit || best,
          }));
        } catch (_) {}
      }
    }
  }, [importedLayer, communesData, forestData]);

  const generateCroquis = () => {
    if (!importedLayer?.geojson) { alert('Importez une couche pour générer le croquis.'); return; }
    const forestFeats = forestData?.features
      ? forestData.features.filter((f: any) => !c.foret || f.properties?.FORET === c.foret).slice(0, 80)
      : [];
    setCroquisSvg(buildMiniMapSVG(importedLayer.geojson, forestFeats));
  };

  // Bannière : synthèse des données auto-remplies depuis la carte
  const empMeta = {
    TOTAL:   { fr: 'EMPIÈTEMENT TOTAL',   cls: 'bg-red-50 text-red-700 border-red-200' },
    PARTIEL: { fr: 'EMPIÈTEMENT PARTIEL', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
    'NÉANT': { fr: 'HORS DOMAINE',        cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  }[c['empiètement']];
  const mapBanner = importedLayer ? (
    <div className="rounded-xl border border-(--border-color) overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-(--bg-main) border-b border-(--border-color)">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-(--text-muted)">
          <MapPin className="w-3 h-3" /> Données auto-remplies — {importedLayer.name}
        </span>
        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${empMeta?.cls}`}>{empMeta?.fr}</span>
      </div>
      <div className="grid grid-cols-3 gap-px bg-(--border-color) text-center">
        {[
          ['Superficie', `${c.superficieDeclareHa||'0'} ha ${c.superficieDeclareAr||'00'} a ${c.superficieDeclareCa||'00'} ca`],
          ['Périmètre', `${c.perimetre||'—'} m`],
          ['Lambert X / Y', `${c.lambertX||'—'} / ${c.lambertY||'—'}`],
          ['Commune', c.communeRurale || '—'],
          ['Forêt', c.foret || '—'],
          ['Canton', c.canton || '—'],
        ].map(([k, v]) => (
          <div key={k} className="bg-(--bg-surface) px-2 py-1.5">
            <div className="text-[8px] uppercase tracking-wider text-(--text-muted)">{k}</div>
            <div className="text-[10px] font-bold text-(--text-main) truncate" title={v}>{v}</div>
          </div>
        ))}
      </div>
      {c.distanceDescription && (
        <div className="px-3 py-1.5 bg-(--bg-surface) border-t border-(--border-color) text-[10px] text-(--text-main)">
          <span className="text-(--text-muted)">Position : </span>{c.distanceDescription}
        </div>
      )}
    </div>
  ) : (
    <div className="rounded-xl border border-dashed border-(--border-color) px-3 py-3 text-center text-[10px] text-(--text-muted)">
      Importez une couche sur la carte pour le remplissage automatique (surface, coordonnées, commune, forêt, chevauchement).
    </div>
  );

  const tabContent: Record<string, React.ReactNode> = {
    entete: (
      <div className="space-y-3">
        {mapBanner}
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
        {mapBanner}
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
            <span className="text-[10px] font-bold text-(--text-muted)">HA</span>
            <input value={c.superficieDeclareAr} onChange={e => set('superficieDeclareAr')(e.target.value)} className={`${inp} text-center font-mono`} placeholder="A" />
            <span className="text-[10px] font-bold text-(--text-muted)">A</span>
            <input value={c.superficieDeclareCa} onChange={e => set('superficieDeclareCa')(e.target.value)} className={`${inp} text-center font-mono`} placeholder="CA" />
            <span className="text-[10px] font-bold text-(--text-muted)">CA</span>
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
        {/* Croquis generation */}
        <div className="border border-(--border-color) rounded-xl overflow-hidden">
          <div className="px-3 py-2 bg-(--bg-main) flex items-center justify-between border-b border-(--border-color)">
            <span className="text-[10px] font-bold uppercase tracking-wider text-(--text-muted)">Croquis de Situation</span>
            <button onClick={generateCroquis}
              className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-(--brand) text-white hover:opacity-90 transition-opacity active:scale-95">
              <RefreshCw className="w-3 h-3" />
              Générer le croquis
            </button>
          </div>
          {croquisSvg ? (
            <div className="p-2 bg-(--bg-surface)" dangerouslySetInnerHTML={{ __html: croquisSvg }} />
          ) : (
            <div className="h-20 flex items-center justify-center text-(--text-muted) bg-(--bg-surface)">
              <p className="text-[10px]">Cliquez «Générer le croquis» pour créer le plan de situation</p>
            </div>
          )}
        </div>
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
                  className={`flex-1 py-2.5 rounded-xl text-xs font-black border-2 transition-all tracking-widest ${c['empiètement']===v ? color : 'border-(--border-color) text-(--text-muted) hover:border-(--brand)'}`}>
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
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold border-2 transition-all ${c.avis===v ? (v==='FAVORABLE'?'bg-emerald-600 text-white border-emerald-600':'bg-red-600 text-white border-red-600') : 'border-(--border-color) text-(--text-muted) hover:border-(--brand)'}`}>
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
        <BtnPrimary onClick={() => printHtml(buildFicheHTML(c, croquisSvg || undefined))} icon={Printer}>Imprimer PDF</BtnPrimary>
        <BtnSecondary onClick={() => exportFicheDocx(c as any)} icon={FileDown}>Word (.docx)</BtnSecondary>
        <BtnSecondary onClick={() => navigator.clipboard.writeText(`Fiche ${c.immeubleDit} | ${c.foret} | ${c['empiètement']}`).catch(()=>{})} icon={Copy} title="Copier" />
      </ActionBar>
    </ModalWrap>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AttestConfig
// ─────────────────────────────────────────────────────────────────────────────

export interface AttestConfig {
  nomImmeuble: string;          // اسم العقار  (parcelle du requérant — ≠ forêt)
  nomProprietaire: string; referenceParcel: string;
  commune: string; qiada: string; omala: string;
  foret: string; foretAr: string; canton: string; cantonAr: string; cpf: string;
  foretVoisine: string;         // الغابة المجاورة
  distanceForet: string;        // أقرب مسافة تفصل العقار عن الغابة المجاورة
  superficieM2: string; dateVisite: string;
  limiteNord: string; limiteSud: string; limiteEst: string; limiteOuest: string;
  positionDomaine: 'داخل الملك الغابوي' | 'جزئيا داخل الملك الغابوي' | 'خارج الملك الغابوي';
  rapporteurs: string[];
  chefCPF: string;
  coordPoints: Array<{ num: number; x: string; y: string }>;
}

const ATTEST_DEFAULT: AttestConfig = {
  nomImmeuble: '', nomProprietaire: '', referenceParcel: '', commune: '', qiada: '', omala: 'تطوان',
  foret: '', foretAr: '', canton: '', cantonAr: '', cpf: "M'diq-Fnideq",
  foretVoisine: '', distanceForet: '',
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

  // ✓ mark when checked; blank box when not
  const chk = (val: string, opt: string) => {
    const on = val === opt;
    return `<span style="display:inline-block;width:14px;height:14px;border:1.5px solid #333;border-radius:2px;background:${on?'#166534':'white'};margin-left:4px;vertical-align:middle;text-align:center;line-height:14px;font-size:10px;color:white;font-weight:bold">${on?'✓':''}</span>`;
  };
  // Show bold value if filled, blank line if empty
  const ul = (val: string, minW = '80px') => val
    ? `<strong>${val}</strong>`
    : `<span style="display:inline-block;border-bottom:1px solid #555;min-width:${minW};padding-bottom:1px">&nbsp;</span>`;

  const pointsRows = cfg.coordPoints.filter(p => p.x||p.y).map(p =>
    `<tr><td style="border:1px solid #999;padding:2px 7px;text-align:center;font-size:8.5pt">${p.num}</td>
     <td style="border:1px solid #999;padding:2px 7px;text-align:center;font-size:8.5pt;direction:ltr">${p.x||'—'}</td>
     <td style="border:1px solid #999;padding:2px 7px;text-align:center;font-size:8.5pt;direction:ltr">${p.y||'—'}</td></tr>`).join('');
  const rapporteursSig = cfg.rapporteurs.length > 0
    ? cfg.rapporteurs.map(r => `<td style="border:1px solid #555;padding:5px 7px;text-align:center;font-size:8pt;vertical-align:top;height:60px"><strong>${r}</strong></td>`).join('')
    : `<td style="border:1px solid #555;padding:5px 7px;height:60px"></td>`;
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar"><head><meta charset="UTF-8"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Arial',sans-serif;font-size:9.5pt;color:#111;direction:rtl}
  .page{width:210mm;min-height:297mm;max-height:297mm;padding:8mm 13mm 6mm;margin:auto;background:#fff;overflow:hidden}
  .logo-bar{text-align:center;margin-bottom:8px}
  .logo-bar img{height:60px;width:auto}
  .logo-fallback{display:inline-flex;width:60px;height:60px;border:2px solid #166534;border-radius:50%;align-items:center;justify-content:center;font-size:7pt;font-weight:bold;color:#166534;text-align:center}
  .title{text-align:center;font-size:13pt;font-weight:bold;text-decoration:underline;margin:8px 0 10px}
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:8px}
  .field{margin-bottom:4px;font-size:9pt;line-height:1.5}
  .field-label{font-weight:bold}
  .section-title{font-weight:bold;font-size:9.5pt;margin:7px 0 4px}
  .coords-table{width:100%;border-collapse:collapse;margin:4px 0}
  .coords-table th{background:#e8f5e9;border:1px solid #999;padding:3px 7px;font-size:8.5pt;text-align:center}
  .checkbox-row{display:flex;gap:20px;margin:6px 0;font-size:9pt;align-items:center;flex-wrap:wrap}
  .sig-table{width:100%;border-collapse:collapse;margin-top:6px}
  .sig-head{font-weight:bold;background:#f4f7f4;padding:3px 7px!important;height:auto!important}
  .legal{font-size:7pt;color:#555;margin-top:7px;padding-top:6px;border-top:1px solid #ddd;line-height:1.5}
  .ref-box{border:1px solid #888;padding:2px 8px;display:inline-block;font-size:8.5pt}
  @media print{@page{size:A4;margin:0}body{margin:0}}
</style>
</head><body><div class="page">
  <div class="logo-bar">
    <img src="/images/logo-anef.png" alt="ANEF" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex'"/>
    <span class="logo-fallback" style="display:none">ANEF</span>
  </div>
  <div style="text-align:center;font-weight:bold;font-size:8.5pt;line-height:1.5;margin-bottom:4px">
    المديرية الجهوية للوكالة الوطنية للمياه والغابات طنجة-تطوان-الحسيمة<br/>
    المديرية الإقليمية للوكالة الوطنية للمياه والغابات لتطوان<br/>
    مركز حماية الغابات للمضيق-فنيدق
  </div>
  <div class="title">بطاقة معاينة حول إنتفاء الصبغة الغابوية</div>
  <div class="two-col">
    <div>
      <div class="field"><span class="field-label">اسم العقار: </span>${ul(cfg.nomImmeuble)}</div>
      <div class="field"><span class="field-label">المرجع: </span><span class="ref-box">${cfg.referenceParcel||'...... م ح غ / م ف'}</span></div>
      <div class="field"><span class="field-label">الجماعة القروية أو الحضارية: </span>${ul(cfg.commune)}</div>
      <div class="field"><span class="field-label">قيادة: </span>${ul(cfg.qiada)}</div>
      <div class="field"><span class="field-label">اسم صاحب العقار: </span>${ul(cfg.nomProprietaire,'120px')}</div>
      <div class="field"><span class="field-label">بتاريخ: </span> يوم ${ul(String(dayAr),'30px')} شهر ${ul(monthAr,'50px')} سنة ${ul(String(yearAr),'50px')}</div>
      <div class="field"><span class="field-label">عمالة: </span>${ul(cfg.omala||'تطوان')}</div>
      <div class="field"><span class="field-label">مساحة الأرض: </span>${ul(cfg.superficieM2,'80px')} متر مربع</div>
    </div>
    <div>
      <div class="section-title" style="text-align:center">الإحداثيات (لامبار):</div>
      <table class="coords-table">
        <thead><tr><th>النقطة</th><th>X</th><th>Y</th></tr></thead>
        <tbody>${pointsRows||'<tr><td colspan="3" style="text-align:center;padding:5px;color:#999;font-size:8pt">—</td></tr>'}</tbody>
      </table>
    </div>
  </div>
  <div class="section-title">حدود العقار كما يلي:</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;font-size:9pt;margin-bottom:8px">
    <div><strong>الشمال:</strong> ${ul(cfg.limiteNord,'100px')}</div>
    <div><strong>الجنوب:</strong> ${ul(cfg.limiteSud,'100px')}</div>
    <div><strong>الغرب:</strong> ${ul(cfg.limiteOuest,'100px')}</div>
    <div><strong>الشرق:</strong> ${ul(cfg.limiteEst,'100px')}</div>
  </div>
  <div class="field" style="margin-bottom:4px"><span class="field-label">الغابة المجاورة: </span>${ul(cfg.foretVoisine,'200px')}</div>
  <div class="field" style="margin-bottom:8px"><span class="field-label">أقرب مسافة تفصل بين العقار المذكور والغابة المجاورة: </span>${ul(cfg.distanceForet,'200px')}</div>
  <div class="section-title">تمت المعاينة بناءا على حدود الملك الغابوي حيث أن العقار يتواجد:</div>
  <div class="checkbox-row">
    ${chk(cfg.positionDomaine,'خارج الملك الغابوي')} خارج الملك الغابوي &nbsp;
    ${chk(cfg.positionDomaine,'جزئيا داخل الملك الغابوي')} جزئيا داخل الملك الغابوي &nbsp;
    ${chk(cfg.positionDomaine,'داخل الملك الغابوي')} داخل الملك الغابوي
  </div>
  ${miniSvg ? `<div style="margin:6px 0;text-align:center">${miniSvg}</div>` : `<div style="margin-top:6px;font-size:7.5pt;color:#555;text-align:center">المرفقات: تصميم توضيحي لموقع العقار بالنسبة لأقرب غابة مخزنية.</div>`}
  <div class="legal">المحدد بموجب مرسوم رقم 2.84321 صادر في 13 محرم 1405 الموافق ل 9 أكتوبر 1984. ويبقى للإدارة حق الرجوع إذا ظهرت قوانين جديدة كما أن هذه الإفادة لا يمكن الاستشهاد بها خارج الإدارة ولا تكسب طالبها حق الملكية لهذا العقار.</div>
  <div class="section-title" style="margin-top:8px">إمضاء اللجنة التي عاينت العقار:</div>
  <table class="sig-table">
    <tr>
      <td class="sig-head">رئيس مركز حماية الغابات المضيق - الفنيدق</td>
      <td class="sig-head" colspan="${Math.max(1,cfg.rapporteurs.length)}">عناصر الفرقة المتنقلة المضيق-الفنيدق</td>
    </tr>
    <tr>
      <td style="border:1px solid #555;padding:5px 7px;text-align:center;font-size:8pt;vertical-align:top;height:60px"><strong>${cfg.chefCPF||''}</strong></td>
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

  // Auto-fill from chevauchement (forêt voisine + canton arabe + distance)
  useEffect(() => {
    const chev = chevauchementResult || importedLayer?.chevauchement;
    if (!chev || chev.hits.length === 0) return;
    const top = chev.hits[0];
    const cantAr = cantonArabic(top.canton);
    // الغابة المجاورة : "الملك المخزني غابة <X> قسم <Y>"
    const foretLabel = top.foretAr || FORET_AR[top.foret?.toUpperCase()] || top.foret || '';
    const voisine = foretLabel
      ? `الملك المخزني غابة ${foretLabel}${cantAr ? ` قسم ${cantAr}` : ''}`
      : '';
    setC(prev => ({
      ...prev,
      foret:          prev.foret    || top.foret,
      foretAr:        prev.foretAr  || foretLabel,
      canton:         prev.canton   || top.canton,
      cantonAr:       prev.cantonAr || cantAr,
      foretVoisine:   prev.foretVoisine || voisine,
      positionDomaine: chev.globalPosition,
    }));
  }, [chevauchementResult, importedLayer]);

  // Auto-fill area, coords, province + commune + nom immeuble via SIG
  useEffect(() => {
    if (!importedLayer?.geojson) return;
    // اسم العقار = nom de la couche importée (parcelle du requérant) — éditable
    const layerName = (importedLayer.name || '').replace(/\.(geojson|json|kml|gpx|shp|zip)$/i, '').trim();
    try {
      const area = Math.round(turf.area(importedLayer.geojson));
      const pts = extractLambertCoords(importedLayer.geojson, 8);
      setC(prev => ({
        ...prev,
        nomImmeuble:   prev.nomImmeuble || layerName,
        superficieM2:  prev.superficieM2 || String(area),
        coordPoints:   pts.length > 0 ? pts : prev.coordPoints,
        omala:         importedLayer.province ? (importedLayer.province.includes("M'diq") || importedLayer.province.includes('Fnideq') ? "المضيق-الفنيدق" : importedLayer.province) : prev.omala,
      }));
    } catch (_) {}
    // Commune via intersection géographique (nom arabe, tolère toutes les variantes d'attribut)
    if (communesData?.features) {
      try {
        const impPoly = importedLayer.geojson.type === 'FeatureCollection'
          ? importedLayer.geojson.features[0]
          : importedLayer.geojson;
        const arName = (p: any) => p?.NomAr || p?.nomar || p?.NOM_AR || p?.Nom__Ar || '';
        const frName = (p: any) => p?.NomFr || p?.nomfr || p?.Nom__Fr || p?.NOM_FR || '';
        let best = ''; let bestArea = 0;
        for (const feat of communesData.features) {
          if (!feat.geometry) continue;
          try {
            const inter = turf.intersect(turf.featureCollection([impPoly, feat]));
            if (inter) {
              const a = turf.area(inter);
              if (a > bestArea) { bestArea = a; best = arName(feat.properties) || frName(feat.properties); }
            }
          } catch (_) {}
        }
        if (best) setC(prev => ({ ...prev, commune: prev.commune || best }));
      } catch (_) {}
    }
  }, [importedLayer, communesData]);

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
    void exportAttestationDocx(c as any);
  };

  // ── Tab content ────────────────────────────────────────────────────────────

  const tabContent: Record<string, React.ReactNode> = {

    // Tab 1 — العقار
    aqar: (
      <div className="space-y-3">
        {/* اسم العقار — الحقل الأهم، يُعبّأ آليًا من اسم الطبقة المستوردة */}
        <div className="bg-(--brand)/5 border border-(--brand)/30 rounded-xl p-3">
          <label className={lbl}>
            اسم العقار / Nom de l'immeuble
            <span className="normal-case text-(--brand) font-bold mr-1">— العقار المطلوب (ليس اسم الغابة)</span>
          </label>
          <input value={c.nomImmeuble} onChange={e => set('nomImmeuble')(e.target.value)} dir="rtl"
            placeholder="مثال: الزبير" className={`${inp} font-bold text-base`} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="اسم صاحب العقار / Propriétaire" value={c.nomProprietaire} onChange={set('nomProprietaire')} />
          <Field label="المرجع / Référence" value={c.referenceParcel} onChange={set('referenceParcel')} placeholder="...... م ح غ / م ف" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={lbl}>الجماعة القروية / Commune</label>
            {communes.length > 0
              ? <select value={c.commune} onChange={e => set('commune')(e.target.value)} className={sel} dir="rtl"><option value="">—</option>{communes.map(v => <option key={v}>{v}</option>)}</select>
              : <input value={c.commune} onChange={e => set('commune')(e.target.value)} className={inp} dir="rtl" />}
          </div>
          <div>
            <label className={lbl}>القيادة / Qiada</label>
            <select value={c.qiada} onChange={e => set('qiada')(e.target.value)} className={sel} dir="rtl">
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
            <div>
              <span className="text-[9px] font-bold text-(--text-muted)">الشمال / Nord</span>
              <input value={c.limiteNord} onChange={e => set('limiteNord')(e.target.value)} className={inp} dir="rtl" />
            </div>
            <div>
              <span className="text-[9px] font-bold text-(--text-muted)">الغرب / Ouest</span>
              <input value={c.limiteOuest} onChange={e => set('limiteOuest')(e.target.value)} className={inp} dir="rtl" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-[9px] font-bold text-(--text-muted)">الجنوب / Sud</span>
            <textarea value={c.limiteSud} onChange={e => set('limiteSud')(e.target.value)} rows={2} className={`${inp} resize-none`} dir="rtl" />
          </div>
          <div className="mt-2">
            <span className="text-[9px] font-bold text-(--text-muted)">الشرق / Est</span>
            <textarea value={c.limiteEst} onChange={e => set('limiteEst')(e.target.value)} rows={2} className={`${inp} resize-none`} dir="rtl" />
          </div>
        </div>
      </div>
    ),

    // Tab 2 — الغابة والوضعية
    ghaba: (
      <div className="space-y-3">
        {/* الغابة المجاورة — éditable, auto-suggérée par l'analyse SIG */}
        <div>
          <label className={lbl}>
            الغابة المجاورة / Forêt mitoyenne
            {c.foretVoisine && <span className="normal-case text-emerald-600 font-bold mr-1">• مقترح آليًا</span>}
          </label>
          <input value={c.foretVoisine} onChange={e => set('foretVoisine')(e.target.value)} dir="rtl"
            placeholder="الملك المخزني غابة ... قسم ..." className={`${inp} font-semibold`} />
        </div>
        {/* أقرب مسافة */}
        <div>
          <label className={lbl}>أقرب مسافة تفصل العقار عن الغابة المجاورة / Distance</label>
          <textarea value={c.distanceForet} onChange={e => set('distanceForet')(e.target.value)} rows={2} dir="rtl"
            placeholder="مثال: 1,05 كلم مستقيمة بالنسبة للرسم الخليفي ... و 1,9 كلم بالنسبة لغابة الحوز قسم ..."
            className={`${inp} resize-none`} />
        </div>

        {/* Source de l'analyse : forêt / canton (alimente الغابة المجاورة) */}
        <details className="bg-(--bg-main) border border-(--border-color) rounded-xl px-3 py-2">
          <summary className="text-[11px] font-bold text-(--text-muted) cursor-pointer select-none">
            مصدر التحليل · الغابة / القسم الغابوي
          </summary>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <div>
              <label className={lbl}>الغابة / Forêt</label>
              {forets.length > 0
                ? <select value={c.foret} onChange={e => { const v=e.target.value; setC(p=>({...p, foret:v, foretAr:FORET_AR[v.toUpperCase()]||'', canton:'', cantonAr:''})); }} className={sel}><option value="">—</option>{forets.map(v => <option key={v}>{v}</option>)}</select>
                : <input value={c.foret} onChange={e => set('foret')(e.target.value)} className={inp} />}
            </div>
            <div>
              <label className={lbl}>القسم / Canton</label>
              {cantons.length > 0
                ? <select value={c.canton} onChange={e => { const v=e.target.value; const cAr=cantonArabic(v); setC(p=>({...p, canton:v, cantonAr:cAr, foretVoisine: p.foretVoisine || (p.foretAr ? `الملك المخزني غابة ${p.foretAr}${cAr?` قسم ${cAr}`:''}` : '') })); }} className={sel}><option value="">—</option>{cantons.map(v => <option key={v}>{v}</option>)}</select>
                : <input value={c.canton} onChange={e => { const v=e.target.value; set('canton')(v); set('cantonAr')(cantonArabic(v)); }} className={inp} />}
            </div>
            <Field label="CPF" value={c.cpf} onChange={set('cpf')} />
          </div>
          {(c.foretAr || c.cantonAr) && (
            <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px]" dir="rtl">
              {c.foretAr && <span className="px-2 py-1 rounded-lg bg-emerald-600/10 text-emerald-700 font-bold">غابة: {c.foretAr}</span>}
              {c.cantonAr && <span className="px-2 py-1 rounded-lg bg-(--brand)/10 text-(--brand) font-bold">قسم: {c.cantonAr}</span>}
            </div>
          )}
        </details>

        <div>
          <label className={lbl}>وضعية العقار / Position Domaine Forestier</label>
          <div className="space-y-1.5">
            {(['خارج الملك الغابوي','جزئيا داخل الملك الغابوي','داخل الملك الغابوي'] as const).map(opt => {
              const active = c.positionDomaine === opt;
              const color = opt==='داخل الملك الغابوي' ? 'border-red-500 bg-red-500/10 text-red-600' : opt==='جزئيا داخل الملك الغابوي' ? 'border-orange-500 bg-orange-500/10 text-orange-600' : 'border-emerald-600 bg-emerald-600/10 text-emerald-700';
              return (
                <button key={opt} onClick={() => set('positionDomaine')(opt)}
                  className={`w-full py-2.5 rounded-xl text-sm font-bold border-2 transition-all text-right px-4 ${active ? color : 'border-(--border-color) text-(--text-muted) hover:border-(--brand)'}`}
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
                className={`text-right px-3 py-2 rounded-xl text-xs font-medium border-2 transition-all ${c.rapporteurs.includes(name) ? 'bg-(--brand) text-white border-(--brand)' : 'border-(--border-color) text-(--text-muted) hover:border-(--brand)'}`}
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
              className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-(--brand)/10 text-(--brand) border border-(--brand)/30 hover:bg-(--brand)/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <Download className="w-3 h-3" />
              استيراد من الطبقة
            </button>
          </div>

          {/* Table header */}
          <div className="grid grid-cols-[32px_1fr_1fr_28px] gap-1 mb-1 px-1">
            <span className="text-[9px] font-bold text-(--text-muted) text-center uppercase">ب.</span>
            <span className="text-[9px] font-bold text-(--text-muted) text-center uppercase">X Lambert</span>
            <span className="text-[9px] font-bold text-(--text-muted) text-center uppercase">Y Lambert</span>
            <span />
          </div>

          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
            {c.coordPoints.map((pt, i) => (
              <div key={i} className="grid grid-cols-[32px_1fr_1fr_28px] gap-1 items-center">
                <span className="text-[11px] text-center font-mono font-bold text-(--text-muted) bg-(--bg-main) border border-(--border-color) rounded-lg py-2">
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
                  className="w-7 h-9.5 flex items-center justify-center text-(--text-muted) hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                  <Minus className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <button onClick={addPoint}
            className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-(--border-color) hover:border-(--brand) text-(--text-muted) hover:text-(--brand) rounded-xl text-xs font-semibold transition-colors">
            <Plus className="w-3.5 h-3.5" /> نقطة جديدة · Nouveau point
          </button>
        </div>

        {/* Croquis section */}
        <div className="border border-(--border-color) rounded-xl overflow-hidden">
          <div className="px-3 py-2 bg-(--bg-main) flex items-center justify-between border-b border-(--border-color)">
            <span className="text-[10px] font-bold uppercase tracking-wider text-(--text-muted)">التصميم التوضيحي · Croquis</span>
            <button onClick={generateCroquis}
              className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-(--brand) text-white hover:opacity-90 transition-opacity active:scale-95">
              <RefreshCw className="w-3 h-3" />
              توليد تصميم العقار (شمال للأعلى)
            </button>
          </div>
          {croquisSvg ? (
            <div
              className="p-2 bg-(--bg-surface)"
              dangerouslySetInnerHTML={{ __html: croquisSvg }}
            />
          ) : (
            <div className="h-28 flex items-center justify-center text-(--text-muted) bg-(--bg-surface)">
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
        <BtnSecondary onClick={handleWord} icon={FileDown}>Word (.docx)</BtnSecondary>
      </ActionBar>
    </ModalWrap>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// ExpertiseModal — محضر التصريحات (2 types)
// ─────────────────────────────────────────────────────────────────────────────

// Shared CSS for both expertise HTML builders
const EXPERTISE_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Arial',sans-serif;direction:rtl;font-size:11pt;color:#111;line-height:2;background:#fff}
  .page{width:210mm;min-height:297mm;padding:1.5cm 2cm 1.2cm;margin:auto}
  .logo-wrap{text-align:center;margin-bottom:10px;padding-bottom:10px;border-bottom:2px solid #166534}
  .logo-wrap img{height:62px;width:auto}
  .logo-fallback{display:inline-flex;width:62px;height:62px;border:2px solid #166534;border-radius:50%;align-items:center;justify-content:center;font-size:7pt;font-weight:bold;color:#166534;text-align:center}
  .main-title{font-size:14pt;font-weight:bold;text-align:center;text-decoration:underline;margin:10px 0}
  .ref-box{background:#f4f7f4;border:1px solid #c8e6c9;border-radius:4px;padding:8px 14px;margin-bottom:14px;font-size:10.5pt;line-height:1.8}
  .ref-row{margin:2px 0}
  .ref-label{font-weight:bold}
  .body-text{font-size:11pt;line-height:2;text-align:justify;margin-bottom:6px}
  .body-text strong{font-weight:bold}
  .section-title{font-weight:bold;font-size:11.5pt;margin:12px 0 6px;text-decoration:underline}
  .bullet{margin-right:14px;margin-bottom:8px;text-align:justify;font-size:11pt;line-height:2}
  .bullet::before{content:"- ";font-weight:bold}
  .annexes{margin-top:14px;font-size:10pt;line-height:1.9}
  .annexes-title{font-weight:bold;text-decoration:underline;margin-bottom:4px}
  .annexes ul{margin-right:20px;list-style:disc}
  .sig-table{width:100%;border-collapse:collapse;margin-top:20px}
  .sig-table td{border:1px solid #555;padding:8px;text-align:center;vertical-align:top;height:75px;font-size:9.5pt}
  .sig-head{background:#e8f5e9;font-weight:bold;height:auto!important;padding:5px!important}
  .map-wrap{margin:12px 0;text-align:center}
  .salutation{margin-top:14px;font-size:11pt;font-weight:bold}
  .sat-figure{margin:14px 0;text-align:center;page-break-inside:avoid}
  .sat-title{font-size:10pt;font-weight:bold;color:#166534;margin-bottom:6px;text-decoration:underline}
  .sat-img{max-width:100%;max-height:340px;border:2px solid #166534;border-radius:4px}
  .sat-cap{font-size:8.5pt;color:#555;font-style:italic;margin-top:4px}
  @media print{@page{size:A4;margin:0}body{margin:0}.page{min-height:auto}}
`;

export interface ExpertiseData {
  caseType: 'daawa' | 'tahfiz';
  courtLevel: 'ابتدائية' | 'استئناف';
  legalBasis: 'delim' | 'taslim';
  dahirArticle: 'أ' | 'ب';
  dossier: string; tribunal: string; reqNum: string;
  ordreNum: string; ordreDate: string;
  rapporteur1: string; rapporteur2: string;
  foret: string; foretAr: string; canton: string; cantonAr: string; superficie: string;
  position: string;
  // Base « en cours de délimitation »
  decreeNum: string; decreeDate: string; joNum: string; joDate: string;
  eastMarkers: string; westMarkers: string; habisa: string;
  commissionDate1: string; commissionDate2: string; commissionDate3: string;
  // Base « titre khalifien / remise »
  domaineGlobal: string; rasmKhalifi: string; rasmNum: string;
  taslimNum: string; taslimDate: string;
  // Couvert végétal + aérien
  vegetation: string; aerialMonth: string; aerialYear: string;
  // PV (cas empiètement)
  pvNum: string; pvDate: string; pvType: string;
  // Image satellite ancienne
  satelliteImg: string; satelliteYear: string;
}

const esc = (s: string) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function buildExpertiseHTML(d: ExpertiseData, croquisSvg?: string): string {
  const foretDisplay = d.foretAr || d.foret || '...';
  const cantonDisplay = d.cantonAr || d.canton || '...';
  const pos = d.position === 'جزئيا' ? 'جزئيا' : d.position === 'خارج' ? 'خارجاً' : 'كليا';
  const isTahfiz = d.caseType === 'tahfiz';
  const isAppeal = d.courtLevel === 'استئناف';
  const decisionWord = isAppeal ? 'القرار' : 'الأمر';
  const courtName = isAppeal ? 'محكمة الاستئناف ب' : 'المحكمة الابتدائية ب';
  // Sujet de la déclaration
  const subject = isTahfiz ? `مطلب التحفيظ عدد <strong>${esc(d.reqNum) || '...'}</strong>` : 'القطعة الأرضية';
  const subjectConcl = isTahfiz ? `مطلب التحفيظ عدد ${esc(d.reqNum) || '...'}` : 'العقار موضوع هذا الملف';
  const veg = esc(d.vegetation) || 'البلوط الفليني، صنوبريات و شجيرات ثانوية من صنف الخلنج و الضرو و السيست';

  // ── Corps : selon la base juridique ────────────────────────────────────────
  let corps = '';
  if (d.legalBasis === 'taslim') {
    corps = `
<div class="bullet">إن ${subject} موضوع النزاع يدخل <strong>${pos}</strong> ضمن الملك الغابوي بالغابة المخزنية <strong>${esc(d.domaineGlobal) || foretDisplay}</strong> الرسم الخليفي <strong>${esc(d.rasmKhalifi) || '...'}</strong> عدد <strong>${esc(d.rasmNum) || '...'}</strong> و المسلَّم من طرف إدارة أملاك الدولة لإدارة المياه و الغابات بموجب محضر التسليم عدد <strong>${esc(d.taslimNum) || '...'}</strong> بتاريخ <strong>${esc(d.taslimDate) || '...'}</strong>، حيث جاء في مضمونه أن التسليم يعد نهائيا بالنسبة للأراضي المكسوة بالغطاء النباتي.</div>
<div class="bullet">و بالرجوع إلى الصور الجوية و الخرائط الطبوغرافية يتبين جليا أن ${subject} مكسو بغابة طبيعية النبت (${veg}) مما يجعله ملكا غابويا خالصا طبقا لمقتضيات الظهير الشريف بتاريخ 10 أكتوبر 1917، و المتعلق بحفظ الغابات و استغلالها كما وقع تعديله و تتميمه، الفصل الأول (${d.dahirArticle}) منه.</div>`;
  } else {
    corps = `
<div class="bullet">إن ${subject} موضوع النزاع تدخل <strong>${pos}</strong> ضمن الملك الغابوي بالغابة المخزنية <strong>${foretDisplay}</strong> قسم <strong>${cantonDisplay}</strong> الذي هو في طور التحديد الإداري بموجب المرسوم رقم <strong>${esc(d.decreeNum) || '...'}</strong> بتاريخ <strong>${esc(d.decreeDate) || '...'}</strong> المنشور بالجريدة الرسمية عدد <strong>${esc(d.joNum) || '...'}</strong> بتاريخ <strong>${esc(d.joDate) || '...'}</strong>.</div>
<div class="bullet">إن ${subject} تتموقع تحديدا داخل القسم الغابوي "<strong>${cantonDisplay}</strong>" حيث يوجد شرق القطعة الأرجام الغابوية <strong>${esc(d.eastMarkers) || '...'}</strong> و غربها الأرجام الغابوية <strong>${esc(d.westMarkers) || '...'}</strong>${d.habisa ? ` ل<strong>${esc(d.habisa)}</strong>` : ''} و التي تم وضعها و تحديدها بصفة نهائية من طرف لجنة التحديد، تجدون رفقته صورة من محاضر التحديد ليومي <strong>${esc(d.commissionDate1) || '...'}</strong> و <strong>${esc(d.commissionDate2) || '...'}</strong>${d.commissionDate3 ? ` و <strong>${esc(d.commissionDate3)}</strong>` : ''}.</div>
<div class="bullet">تبين الصور الجوية ${d.aerialMonth ? `ل${esc(d.aerialMonth)} ` : ''}سنة <strong>${esc(d.aerialYear) || '...'}</strong> تواجد معالم القرينة الغابوية داخل القطعة الغابوية و التي تم طمر معالمها فيما بعد، و يعتبر هذا الأخير امتدادا للغطاء النباتي الحالي المتواجد شمال و غرب القطعة الأرضية و المكون أساسا من ${veg}. و منه طبقا لمقتضيات الظهير الشريف الصادر بتاريخ 20 ذي الحجة 1335 و الموافق ل10 أكتوبر 1917، و المتعلق بحفظ الغابات و استغلالها كما وقع تعديله و تتميمه، و خاصة الفصل الأول (${d.dahirArticle}) منه، فإن العقار جزء لا يتجزأ من الغابة المخزنية و هو ما أكده التحديد الإداري و محضر لجنة التحديد بعين المكان التي وضعت نهائيا الأنصاب المحيطة بالعقار السالف الذكر.</div>`;
  }

  // PV de délit (cas empiètement / استحقاق)
  const pvPart = d.pvNum
    ? `<div class="bullet">سبق لإدارة المياه و الغابات أن حررت في حق المعني بالأمر محضر جنحة غابوية عدد <strong>${esc(d.pvNum)}</strong> بتاريخ <strong>${esc(d.pvDate) || '...'}</strong> من أجل <strong>${esc(d.pvType) || '...'}</strong>، مما يؤكد واقعة الترامي على الملك الغابوي و الإضرار به.</div>`
    : '';

  // Article 3 du Dahir de 1916 (uniquement base « délimitation »)
  const art1916 = d.legalBasis === 'delim'
    ? `<div class="section-title">الفصل الثالث من ظهير 03 يناير 1916 :</div>
<p class="body-text">إن الفصل الثالث من الظهير الشريف الصادر بتاريخ 26 صفر 1334 و الموافق ل 03 يناير 1916 ينص على أنه من تاريخ صدور مرسوم التحديد إلى أن يصدر مرسوم المصادقة على أعمال التحديد لا يقبل أي مطلب يقصد به تسجيل العقار إلا بشرط أن يكون ذلك على وجه التعرض لأعمال التحديد وفقا لما تضمنه الفصل الخامس من نفس الظهير، لذا و في غياب تعرض كتابي أو شفوي على عملية التحديد من طرف طالب التحفيظ، فإن مطلب التحفيظ لم يوضع بشكل تأكيدي على التعرض و به فإن هذا المطلب لاغ بقوة القانون.</p>`
    : '';

  // Liste des rapporteurs (déclarants)
  const rapporteursPart = (d.rapporteur1 || d.rapporteur2)
    ? `<p class="body-text" style="margin-right:14px">
        ${d.rapporteur1 ? `<strong>1-</strong> <strong>${esc(d.rapporteur1)}</strong> : رئيس مركز حماية الغابات للمضيق-الفنيدق<br/>` : ''}
        ${d.rapporteur2 ? `<strong>2-</strong> <strong>${esc(d.rapporteur2)}</strong> : عضو الفرقة المتنقلة للمضيق-الفنيدق` : ''}
      </p>`
    : '';

  // Conclusion
  const demande = isTahfiz ? 'التعرض الكلي لإدارة المياه و الغابات' : 'تعرضنا في الملف';

  // Image satellite ancienne (sous la déclaration)
  const satPart = d.satelliteImg
    ? `<div class="sat-figure">
        <div class="sat-title">صورة القمر الصناعي لسنة ${esc(d.satelliteYear) || '...'} — حالة القطعة قبل تاريخ التصريح</div>
        <img src="${d.satelliteImg}" class="sat-img" alt="satellite"/>
        <div class="sat-cap">الصورة تُبيّن المعالم الغابوية و الغطاء النباتي للقطعة قبل الترامي / مطلب التحفيظ.</div>
      </div>`
    : '';

  const croquisPart = croquisSvg
    ? `<div class="map-wrap">${croquisSvg}</div>`
    : `<div style="width:100%;height:180px;border:1px dashed #bbb;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:10px;margin:12px 0">[ التصميم التوضيحي — استعمل « توليد التصميم » ]</div>`;

  // Annexes dynamiques
  const annexes: string[] = [];
  if (d.legalBasis === 'taslim') {
    annexes.push(`صورة من سند الملكية / الرسم الخليفي عدد ${esc(d.rasmNum) || '...'}`);
    annexes.push(`صورة من المرسوم الوزاري للمصادقة على تحديد العقار ${esc(d.domaineGlobal) || ''}`);
    annexes.push(`صورة من محضر التسليم عدد ${esc(d.taslimNum) || '...'} بتاريخ ${esc(d.taslimDate) || '...'}`);
    annexes.push('تصميم توضيحي على خريطة طبوغرافية');
  } else {
    annexes.push(`صورة من المرسوم الوزاري عدد ${esc(d.decreeNum) || '...'} بتاريخ ${esc(d.decreeDate) || '...'}`);
    annexes.push(`صورة من محاضر التحديد بتاريخ ${esc(d.commissionDate1) || '...'} و ${esc(d.commissionDate2) || '...'}${d.commissionDate3 ? ' و ' + esc(d.commissionDate3) : ''}`);
    annexes.push(`لائحة إحداثيات قسم ${cantonDisplay}`);
    annexes.push(`الصور الجوية لسنة ${esc(d.aerialYear) || '...'}`);
  }
  if (d.pvNum) annexes.push(`صورة من محضر الجنحة الغابوية عدد ${esc(d.pvNum)} بتاريخ ${esc(d.pvDate) || '...'}`);
  if (d.satelliteImg) annexes.push(`صورة القمر الصناعي لسنة ${esc(d.satelliteYear) || '...'}`);

  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">
<title>محضر التصريحات${isTahfiz ? ' — مطلب التحفيظ' : ' — دعوى استحقاق'}</title>
<style>${EXPERTISE_CSS}</style></head><body><div class="page">
<div class="logo-wrap">
  <img src="/images/logo-anef.png" alt="ANEF" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex'"/>
  <span class="logo-fallback" style="display:none">ANEF</span>
</div>
<div class="main-title">محضر التصريحات</div>
<div class="ref-box">
  <div class="ref-row"><span class="ref-label">ملف عقاري عدد </span>${esc(d.dossier) || '...'} &nbsp;*&nbsp; <span class="ref-label">${courtName}</span>${esc(d.tribunal) || 'تطوان'}*</div>
</div>
<p class="body-text">
  بناءا على ${decisionWord} التمهيدي عدد <strong>${esc(d.ordreNum) || '...'}</strong> بتاريخ <strong>${esc(d.ordreDate) || '...'}</strong>، و القاضي باجراء الوقوف بعين المكان للتحقق من وضعية العقار موضوع الدعوى و مطابقة الحجج، نحن الموقعون اسفله عن المديرية الإقليمية للوكالة الوطنية للمياه و الغابات بتطوان نصرح بما يلي:
</p>
${rapporteursPart}
<div class="section-title">تحديد العقار من ناحية الموقع و الحدود و المشتملات :</div>
${corps}
${pvPart}
${art1916}
<p class="body-text" style="margin-top:10px">
  لكل ما سبق ذكره نؤكد أمام هيأتكم الموقرة أن ${subjectConcl} يندرج <strong>${pos}</strong> ضمن الملك الغابوي، و نطلب منكم الحكم بصحة <strong>${demande}</strong>.
</p>
<p class="salutation">و السلام ./.</p>
${satPart}
${croquisPart}
<div class="annexes">
  <div class="annexes-title">المرفقات :</div>
  <ul>${annexes.map(a => `<li>${a}</li>`).join('')}</ul>
</div>
<table class="sig-table">
  <tr>
    <td class="sig-head">المصرح الأول<br/>${esc(d.rapporteur1) || ''}</td>
    <td class="sig-head">المصرح الثاني<br/>${esc(d.rapporteur2) || ''}</td>
  </tr>
  <tr><td></td><td></td></tr>
</table>
</div></body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ExpertiseModal — type selection + 2 form screens
// ─────────────────────────────────────────────────────────────────────────────

type ExpertiseType = 'daawa' | 'tahfiz' | null;

const COMMON_DEFAULTS = {
  courtLevel: 'ابتدائية' as 'ابتدائية'|'استئناف',
  legalBasis: 'delim' as 'delim'|'taslim',
  dahirArticle: 'ب' as 'أ'|'ب',
  dossier:'', tribunal:'تطوان', reqNum:'', ordreNum:'', ordreDate:'',
  foret:'', foretAr:'', canton:'', cantonAr:'', superficie:'',
  position: 'كليا' as 'كليا'|'جزئيا'|'خارج',
  decreeNum:'2-84-321', decreeDate:'09/10/1984',
  joNum:'3755', joDate:'17/10/1984',
  eastMarkers:'', westMarkers:'', habisa:'',
  commissionDate1:'10/04/1985', commissionDate2:'11/04/1985', commissionDate3:'',
  domaineGlobal:'', rasmKhalifi:'', rasmNum:'', taslimNum:'', taslimDate:'',
  vegetation:'', aerialMonth:'', aerialYear:'2003',
  satelliteYear:'',
};

export function ExpertiseModal({ onClose, importedLayer, forestData }: {
  onClose: () => void;
  importedLayer?: ImportedLayerInfo | null;
  forestData?: any;
}) {
  const [expertiseType, setExpertiseType] = useState<ExpertiseType>(null);
  const [croquisSvg, setCroquisSvg] = useState<string | null>(null);

  // Choix structurants
  const [courtLevel, setCourtLevel] = useState<'ابتدائية'|'استئناف'>(COMMON_DEFAULTS.courtLevel);
  const [legalBasis, setLegalBasis] = useState<'delim'|'taslim'>(COMMON_DEFAULTS.legalBasis);
  const [dahirArticle, setDahirArticle] = useState<'أ'|'ب'>(COMMON_DEFAULTS.dahirArticle);

  // Champs communs
  const [dossier,   setDossier]    = useState(COMMON_DEFAULTS.dossier);
  const [tribunal,  setTribunal]   = useState(COMMON_DEFAULTS.tribunal);
  const [reqNum,    setReqNum]     = useState(COMMON_DEFAULTS.reqNum);
  const [ordreNum,  setOrdreNum]   = useState(COMMON_DEFAULTS.ordreNum);
  const [ordreDate, setOrdreDate]  = useState(COMMON_DEFAULTS.ordreDate);
  const [foret,     setForet]      = useState(COMMON_DEFAULTS.foret);
  const [foretAr,   setForetAr]    = useState(COMMON_DEFAULTS.foretAr);
  const [canton,    setCanton]     = useState(COMMON_DEFAULTS.canton);
  const [cantonAr,  setCantonAr]   = useState(COMMON_DEFAULTS.cantonAr);
  const [superficie,setSuperficie] = useState(COMMON_DEFAULTS.superficie);
  const [position,  setPosition]   = useState<'كليا'|'جزئيا'|'خارج'>(COMMON_DEFAULTS.position);
  const [decreeNum, setDecreeNum]  = useState(COMMON_DEFAULTS.decreeNum);
  const [decreeDate,setDecreeDate] = useState(COMMON_DEFAULTS.decreeDate);
  const [joNum,     setJoNum]      = useState(COMMON_DEFAULTS.joNum);
  const [joDate,    setJoDate]     = useState(COMMON_DEFAULTS.joDate);
  const [eastM,     setEastM]      = useState(COMMON_DEFAULTS.eastMarkers);
  const [westM,     setWestM]      = useState(COMMON_DEFAULTS.westMarkers);
  const [habisa,    setHabisa]     = useState(COMMON_DEFAULTS.habisa);
  const [cDate1,    setCDate1]     = useState(COMMON_DEFAULTS.commissionDate1);
  const [cDate2,    setCDate2]     = useState(COMMON_DEFAULTS.commissionDate2);
  const [cDate3,    setCDate3]     = useState(COMMON_DEFAULTS.commissionDate3);
  const [aerialMonth,setAerialMonth]=useState(COMMON_DEFAULTS.aerialMonth);
  const [aerialYear,setAerialYear] = useState(COMMON_DEFAULTS.aerialYear);
  const [vegetation,setVegetation] = useState(COMMON_DEFAULTS.vegetation);

  // Base « titre khalifien / remise »
  const [domaineGlobal, setDomaineGlobal] = useState(COMMON_DEFAULTS.domaineGlobal);
  const [rasmKhalifi, setRasmKhalifi] = useState(COMMON_DEFAULTS.rasmKhalifi);
  const [rasmNum,   setRasmNum]    = useState(COMMON_DEFAULTS.rasmNum);
  const [taslimNum, setTaslimNum]  = useState(COMMON_DEFAULTS.taslimNum);
  const [taslimDate,setTaslimDate] = useState(COMMON_DEFAULTS.taslimDate);

  // PV (cas empiètement / استحقاق)
  const [rapporteur1, setR1]  = useState('');
  const [rapporteur2, setR2]  = useState('');
  const [pvNum,   setPvNum]   = useState('');
  const [pvDate,  setPvDate]  = useState('');
  const [pvType,  setPvType]  = useState('');

  // Image satellite ancienne
  const [satelliteImg, setSatelliteImg] = useState('');
  const [satelliteYear, setSatelliteYear] = useState(COMMON_DEFAULTS.satelliteYear);

  const [tab, setTab] = useState('mlaf');

  const forets: string[] = forestData?.features
    ? [...new Set<string>(forestData.features.map((f: any) => f.properties?.FORET || '').filter(Boolean))].sort()
    : [];
  const cantons: string[] = foret && forestData?.features
    ? [...new Set<string>(forestData.features.filter((f: any) => f.properties?.FORET === foret).map((f: any) => f.properties?.CANTON || '').filter(Boolean))].sort()
    : [];

  // Base juridique → article du Dahir 1917 par défaut (أ = remise, ب = délimitation)
  useEffect(() => { setDahirArticle(legalBasis === 'taslim' ? 'أ' : 'ب'); }, [legalBasis]);

  // Auto-remplissage depuis la couche importée + analyse de chevauchement
  useEffect(() => {
    if (!importedLayer) return;
    const chev = importedLayer.chevauchement;
    if (chev?.hits.length) {
      const h0 = chev.hits[0];
      setForet(f => f || h0.foret);
      setForetAr(fa => fa || (FORET_AR[h0.foret?.toUpperCase()] || h0.foretAr || ''));
      setCanton(c => c || h0.canton);
      setCantonAr(ca => ca || cantonArabic(h0.canton));
      setSuperficie(s => s || (chev.importedArea / 10000).toFixed(4));
      setPosition(
        chev.globalPosition === 'داخل الملك الغابوي' ? 'كليا'
        : chev.globalPosition === 'جزئيا داخل الملك الغابوي' ? 'جزئيا'
        : 'خارج'
      );
      // Auto-remplissage du décret de délimitation depuis les attributs (si présents)
      const p: any = h0.properties || {};
      const dN = p.DECRET || p.MARSOUM || p.DECREE || p.decret || '';
      const dD = p.DATE_DECRET || p.DECRET_DATE || p.decret_date || '';
      if (dN) setDecreeNum(v => v && v !== '2-84-321' ? v : String(dN));
      if (dD) setDecreeDate(v => v && v !== '09/10/1984' ? v : String(dD));
    } else if (importedLayer.geojson) {
      try { setSuperficie(s => s || (turf.area(importedLayer.geojson) / 10000).toFixed(4)); } catch (_) {}
    }
  }, [importedLayer]);

  // Synchroniser foretAr / cantonAr
  useEffect(() => { if (foret && !foretAr) setForetAr(FORET_AR[foret.toUpperCase()] || ''); }, [foret]);
  useEffect(() => { if (canton && !cantonAr) setCantonAr(cantonArabic(canton)); }, [canton]);

  const handleGenerateCroquis = () => {
    if (!importedLayer?.geojson) return;
    const forestFeats = (forestData?.features || []).filter((f: any) =>
      !foret || f.properties?.FORET === foret
    ).slice(0, 80);
    setCroquisSvg(buildMiniMapSVG(importedLayer.geojson, forestFeats));
  };

  const onSatelliteFile = (file?: File) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => setSatelliteImg(typeof r.result === 'string' ? r.result : '');
    r.readAsDataURL(file);
  };

  const buildData = (): ExpertiseData => ({
    caseType: expertiseType === 'tahfiz' ? 'tahfiz' : 'daawa',
    courtLevel, legalBasis, dahirArticle,
    dossier, tribunal, reqNum, ordreNum, ordreDate,
    rapporteur1, rapporteur2,
    foret, foretAr, canton, cantonAr, superficie, position,
    decreeNum, decreeDate, joNum, joDate,
    eastMarkers: eastM, westMarkers: westM, habisa,
    commissionDate1: cDate1, commissionDate2: cDate2, commissionDate3: cDate3,
    domaineGlobal, rasmKhalifi, rasmNum, taslimNum, taslimDate,
    vegetation, aerialMonth, aerialYear,
    pvNum, pvDate, pvType,
    satelliteImg, satelliteYear,
  });

  const getPDF = () => buildExpertiseHTML(buildData(), croquisSvg || undefined);
  const getFilename = () => `محضر-${dossier || reqNum || expertiseType || 'expertise'}.doc`;

  // ── TYPE SELECTION SCREEN ───────────────────────────────────────────────────
  if (!expertiseType) {
    return (
      <ModalWrap title="Rapport d'Expertise" subtitle="محضر التصريحات · اختر النوع" onClose={onClose}>
        <div className="p-5 space-y-4">
          <p className="text-(--text-muted) text-xs font-bold uppercase tracking-wider text-center">
            ما هو نوع الملف ؟ · Type de rapport
          </p>
          <button onClick={() => setExpertiseType('daawa')}
            className="w-full text-right px-5 py-4 rounded-xl border-2 border-(--border-color) hover:border-(--brand) bg-(--bg-main) transition-all group">
            <p className="text-[14px] font-bold text-(--text-main) group-hover:text-(--brand)" dir="rtl">
              دعوى استحقاق / ترامٍ على الملك الغابوي
            </p>
            <p className="text-[10px] text-(--text-muted) mt-1" dir="rtl">
              شخص ترامى على الملك الغابوي و حُرّر محضر ضده، ثم طالب باستحقاق القطعة — ندافع بالوضعية القانونية و المحاضر السابقة و صورة قمر صناعي قديمة قبل الترامي.
            </p>
          </button>
          <button onClick={() => setExpertiseType('tahfiz')}
            className="w-full text-right px-5 py-4 rounded-xl border-2 border-(--border-color) hover:border-(--brand) bg-(--bg-main) transition-all group">
            <p className="text-[14px] font-bold text-(--text-main) group-hover:text-(--brand)" dir="rtl">
              تعرض على مطلب تحفيظ
            </p>
            <p className="text-[10px] text-(--text-muted) mt-1" dir="rtl">
              طالبٌ يطلب تحفيظ عقار داخل الملك الغابوي فنتعرض عليه — ندافع بالقوة القانونية و لا سيما ظهير 03 يناير 1916 (الفصل الثالث).
            </p>
          </button>
        </div>
        <ActionBar>
          <BtnSecondary onClick={onClose} icon={X}>إغلاق</BtnSecondary>
        </ActionBar>
      </ModalWrap>
    );
  }

  const typeLabel = expertiseType === 'daawa' ? 'دعوى مدنية · Affaire Civile' : 'مطلب التحفيظ · Opposition';

  const TABS_DAAWA = [
    { id: 'mlaf',    label: 'الملف' },
    { id: 'atraf',   label: 'الأطراف' },
    { id: 'ghaba',   label: 'الغابة' },
    { id: 'arjam',   label: 'الأرجام والتصميم' },
    { id: 'marfaq',  label: 'المرفقات' },
  ];
  const TABS_TAHFIZ = [
    { id: 'mlaf',    label: 'الملف' },
    { id: 'ghaba',   label: 'الغابة' },
    { id: 'arjam',   label: 'الأرجام والتصميم' },
    { id: 'marfaq',  label: 'المرفقات' },
  ];
  const activeTabs = expertiseType === 'daawa' ? TABS_DAAWA : TABS_TAHFIZ;

  const tabContent: Record<string, React.ReactNode> = {
    mlaf: (
      <div className="space-y-3">
        <div className="rounded-xl border border-(--border-color) p-3 space-y-3 bg-(--bg-main)">
          <div>
            <label className={lbl}>درجة المحكمة — تُغيّر « الأمر / القرار التمهيدي »</label>
            <div className="flex gap-2">
              {(['ابتدائية','استئناف'] as const).map(v => (
                <button key={v} onClick={() => setCourtLevel(v)}
                  className={`flex-1 py-2 rounded-lg text-[12px] font-bold border-2 transition-all ${courtLevel===v ? 'bg-(--brand) text-white border-(--brand)' : 'border-(--border-color) text-(--text-muted) hover:border-(--brand)'}`}>
                  {v==='ابتدائية' ? 'ابتدائية (الأمر)' : 'استئناف (القرار)'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={lbl}>الأساس القانوني للملك الغابوي</label>
            <div className="flex gap-2">
              <button onClick={() => setLegalBasis('delim')}
                className={`flex-1 py-2 rounded-lg text-[11px] font-bold border-2 transition-all ${legalBasis==='delim' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-(--border-color) text-(--text-muted) hover:border-(--brand)'}`}>
                في طور التحديد الإداري
              </button>
              <button onClick={() => setLegalBasis('taslim')}
                className={`flex-1 py-2 rounded-lg text-[11px] font-bold border-2 transition-all ${legalBasis==='taslim' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-(--border-color) text-(--text-muted) hover:border-(--brand)'}`}>
                مُسلَّم (رسم خليفي + محضر تسليم)
              </button>
            </div>
            <p className="text-[9px] text-(--text-muted) mt-1" dir="rtl">
              يُطبَّق الفصل الأول (<strong>{dahirArticle}</strong>) من ظهير 1917 تلقائيا{legalBasis==='delim' ? '، مع إدراج الفصل 3 من ظهير 1916.' : '.'}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>ملف عقاري عدد / Dossier</label>
            <input value={dossier} onChange={e => setDossier(e.target.value)} className={inp} placeholder="245/1403/2024" />
          </div>
          <div>
            <label className={lbl}>المدينة / Ville</label>
            <input value={tribunal} onChange={e => setTribunal(e.target.value)} className={inp} placeholder="تطوان" />
          </div>
        </div>
        {expertiseType === 'tahfiz' && (
          <div>
            <label className={lbl}>مطلب التحفيظ عدد</label>
            <input value={reqNum} onChange={e => setReqNum(e.target.value)} className={inp} placeholder="14810/19" dir="rtl" />
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>رقم {courtLevel==='استئناف' ? 'القرار' : 'الأمر'} التمهيدي</label>
            <input value={ordreNum} onChange={e => setOrdreNum(e.target.value)} className={inp} placeholder="45" />
          </div>
          <div>
            <label className={lbl}>تاريخ {courtLevel==='استئناف' ? 'القرار' : 'الأمر'} التمهيدي</label>
            <input value={ordreDate} onChange={e => setOrdreDate(e.target.value)} className={inp} placeholder="26/02/2024" />
          </div>
        </div>
      </div>
    ),
    atraf: (
      <div className="space-y-3">
        <div>
          <label className={lbl}>المصرح الأول / Rapporteur 1</label>
          <input value={rapporteur1} onChange={e => setR1(e.target.value)} className={inp}
            placeholder="الزاموم أحمد" list="rapporteurs-list-1" />
          <datalist id="rapporteurs-list-1">
            {RAPPORTEURS_LIST.map(r => <option key={r} value={r}/>)}
          </datalist>
        </div>
        <div>
          <label className={lbl}>المصرح الثاني / Rapporteur 2</label>
          <input value={rapporteur2} onChange={e => setR2(e.target.value)} className={inp}
            placeholder="المعتمد يوسف" list="rapporteurs-list-2" />
          <datalist id="rapporteurs-list-2">
            {RAPPORTEURS_LIST.map(r => <option key={r} value={r}/>)}
          </datalist>
        </div>
        <div className="pt-2 border-t border-(--border-color)">
          <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider mb-2">تقرير الجنحة الغابوية (اختياري)</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>رقم التقرير</label>
              <input value={pvNum} onChange={e => setPvNum(e.target.value)} className={inp} placeholder="32/2025" />
            </div>
            <div>
              <label className={lbl}>تاريخ التقرير</label>
              <input value={pvDate} onChange={e => setPvDate(e.target.value)} className={inp} placeholder="08/08/2025" />
            </div>
          </div>
          <div className="mt-2">
            <label className={lbl}>نوع المخالفة</label>
            <input value={pvType} onChange={e => setPvType(e.target.value)} className={inp} placeholder="القطع العشوائي" />
          </div>
        </div>
      </div>
    ),
    ghaba: (
      <div className="space-y-3">
        {importedLayer && (
          <div className="rounded-lg border border-(--border-color) bg-(--bg-main) px-3 py-2 text-[10px] text-(--text-muted)" dir="rtl">
            <MapPin className="w-3 h-3 inline ml-1" /> مُعبّأ آليا من الطبقة : الغابة، القسم (بالعربية)، المساحة و الوضعية.
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>الغابة / Forêt</label>
            {forets.length > 0
              ? <select value={foret} onChange={e => { setForet(e.target.value); setCanton(''); setCantonAr(''); }} className={sel}>
                  <option value="">—</option>{forets.map(v => <option key={v}>{v}</option>)}
                </select>
              : <input value={foret} onChange={e => setForet(e.target.value)} className={inp} />}
          </div>
          <div>
            <label className={lbl}>القسم / Canton</label>
            {cantons.length > 0
              ? <select value={canton} onChange={e => { setCanton(e.target.value); setCantonAr(cantonArabic(e.target.value)); }} className={sel}>
                  <option value="">—</option>{cantons.map(v => <option key={v}>{v}</option>)}
                </select>
              : <input value={canton} onChange={e => setCanton(e.target.value)} className={inp} />}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>اسم الغابة بالعربية</label>
            <input value={foretAr} onChange={e => setForetAr(e.target.value)} className={inp} dir="rtl" placeholder="الحوز" />
          </div>
          <div>
            <label className={lbl}>اسم القسم بالعربية</label>
            <input value={cantonAr} onChange={e => setCantonAr(e.target.value)} className={inp} dir="rtl" placeholder="الملاليين" />
          </div>
        </div>

        {legalBasis === 'delim' ? (
          <div className="rounded-xl border border-(--border-color) p-3 space-y-2">
            <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider" dir="rtl">مرسوم التحديد الإداري + الجريدة الرسمية</p>
            <div className="grid grid-cols-2 gap-2">
              <div><label className={lbl}>رقم المرسوم</label><input value={decreeNum} onChange={e => setDecreeNum(e.target.value)} className={inp} dir="rtl" /></div>
              <div><label className={lbl}>تاريخ المرسوم</label><input value={decreeDate} onChange={e => setDecreeDate(e.target.value)} className={inp} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className={lbl}>رقم الجريدة الرسمية</label><input value={joNum} onChange={e => setJoNum(e.target.value)} className={inp} /></div>
              <div><label className={lbl}>تاريخ الجريدة الرسمية</label><input value={joDate} onChange={e => setJoDate(e.target.value)} className={inp} /></div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-(--border-color) p-3 space-y-2">
            <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider" dir="rtl">الرسم الخليفي + محضر التسليم</p>
            <div><label className={lbl}>الملك الغابوي (مثلا: الحوز)</label><input value={domaineGlobal} onChange={e => setDomaineGlobal(e.target.value)} className={inp} dir="rtl" placeholder="الحوز" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className={lbl}>اسم الرسم الخليفي</label><input value={rasmKhalifi} onChange={e => setRasmKhalifi(e.target.value)} className={inp} dir="rtl" placeholder="زمزم" /></div>
              <div><label className={lbl}>عدد الرسم الخليفي</label><input value={rasmNum} onChange={e => setRasmNum(e.target.value)} className={inp} dir="rtl" placeholder="663" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className={lbl}>محضر التسليم عدد</label><input value={taslimNum} onChange={e => setTaslimNum(e.target.value)} className={inp} dir="rtl" placeholder="36" /></div>
              <div><label className={lbl}>تاريخ محضر التسليم</label><input value={taslimDate} onChange={e => setTaslimDate(e.target.value)} className={inp} placeholder="28/08/1962" /></div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>المساحة (هكتار) — تلقائي</label>
            <input value={superficie} onChange={e => setSuperficie(e.target.value)} className={`${inp} font-mono`} placeholder="0.0000" />
          </div>
          <div>
            <label className={lbl}>الفصل الأول من ظهير 1917</label>
            <div className="flex gap-2">
              {(['أ','ب'] as const).map(v => (
                <button key={v} onClick={() => setDahirArticle(v)}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold border-2 transition-all ${dahirArticle===v ? 'bg-(--brand) text-white border-(--brand)' : 'border-(--border-color) text-(--text-muted) hover:border-(--brand)'}`}>
                  ({v})
                </button>
              ))}
            </div>
          </div>
        </div>
        <div>
          <label className={lbl}>وضعية العقار / Position</label>
          <div className="flex gap-2">
            {(['كليا','جزئيا','خارج'] as const).map(v => (
              <button key={v} onClick={() => setPosition(v)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${position===v ? 'bg-(--brand) text-white border-(--brand)' : 'border-(--border-color) text-(--text-muted) hover:border-(--brand)'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={lbl}>الغطاء النباتي (يظهر في النص)</label>
          <textarea value={vegetation} onChange={e => setVegetation(e.target.value)} rows={2} dir="rtl"
            className={`${inp} resize-none`} placeholder="البلوط الفليني، صنوبريات و شجيرات ثانوية من صنف الخلنج و الضرو و السيست" />
        </div>
      </div>
    ),
    arjam: (
      <div className="space-y-3">
        {legalBasis === 'delim' ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div><label className={lbl}>الأرجام شرق القطعة</label><input value={eastM} onChange={e => setEastM(e.target.value)} className={inp} dir="rtl" placeholder="90، 91، 92، 93" /></div>
              <div><label className={lbl}>الأرجام غرب القطعة</label><input value={westM} onChange={e => setWestM(e.target.value)} className={inp} dir="rtl" placeholder="16، 17" /></div>
            </div>
            <div>
              <label className={lbl}>الحبيسة (اختياري)</label>
              <input value={habisa} onChange={e => setHabisa(e.target.value)} className={inp} dir="rtl" placeholder="حبيسة بلوازن-البيين" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><label className={lbl}>تاريخ التحديد 1</label><input value={cDate1} onChange={e => setCDate1(e.target.value)} className={inp} /></div>
              <div><label className={lbl}>تاريخ التحديد 2</label><input value={cDate2} onChange={e => setCDate2(e.target.value)} className={inp} /></div>
              <div><label className={lbl}>تاريخ التحديد 3</label><input value={cDate3} onChange={e => setCDate3(e.target.value)} className={inp} placeholder="—" /></div>
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-(--border-color) px-3 py-3 text-center text-[10px] text-(--text-muted)" dir="rtl">
            الأرجام و محاضر التحديد غير مطلوبة في حالة « الرسم الخليفي / محضر التسليم ».
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div><label className={lbl}>شهر الصور الجوية (اختياري)</label><input value={aerialMonth} onChange={e => setAerialMonth(e.target.value)} className={inp} dir="rtl" placeholder="يوليوز" /></div>
          <div><label className={lbl}>سنة الصور الجوية</label><input value={aerialYear} onChange={e => setAerialYear(e.target.value)} className={inp} placeholder="2003" /></div>
        </div>
        {/* Croquis */}
        <div className="pt-2 border-t border-(--border-color)">
          <div className="flex items-center justify-between mb-2">
            <label className={lbl}>التصميم التوضيحي · CROQUIS</label>
            <button onClick={handleGenerateCroquis} disabled={!importedLayer?.geojson}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-(--brand) text-white text-[11px] font-bold disabled:opacity-40">
              <RefreshCw size={12}/> توليد التصميم
            </button>
          </div>
          {croquisSvg
            ? <div className="p-2 bg-(--bg-surface) rounded-xl border border-(--border-color)" dangerouslySetInnerHTML={{ __html: croquisSvg }} />
            : <div className="h-20 flex items-center justify-center text-(--text-muted) text-xs bg-(--bg-main) rounded-xl border border-dashed border-(--border-color)">
                اضغط «توليد التصميم» لإنشاء الخريطة التوضيحية
              </div>}
        </div>
      </div>
    ),
    marfaq: (
      <div className="space-y-4">
        <div>
          <label className={lbl}>صورة قمر صناعي قديمة (قبل تاريخ التصريح)</label>
          <div className="rounded-xl border-2 border-dashed border-(--border-color) p-3 text-center">
            {satelliteImg ? (
              <div className="space-y-2">
                <img src={satelliteImg} alt="satellite" className="max-h-44 mx-auto rounded-lg border border-(--border-color)" />
                <button onClick={() => setSatelliteImg('')}
                  className="text-[10px] font-bold text-red-600 hover:underline">إزالة الصورة</button>
              </div>
            ) : (
              <label className="cursor-pointer flex flex-col items-center gap-2 py-3 text-(--text-muted)">
                <Download className="w-5 h-5" />
                <span className="text-[11px] font-bold" dir="rtl">اختر صورة (سكرين من Google Earth / صور جوية)</span>
                <span className="text-[9px]" dir="rtl">PNG أو JPG — تُدرج تحت التصريح و في المرفقات</span>
                <input type="file" accept="image/*" className="hidden"
                  onChange={e => onSatelliteFile(e.target.files?.[0])} />
              </label>
            )}
          </div>
        </div>
        <div>
          <label className={lbl}>سنة صورة القمر الصناعي</label>
          <input value={satelliteYear} onChange={e => setSatelliteYear(e.target.value)} className={inp} dir="rtl" placeholder="2003" />
        </div>
        <div className="rounded-lg bg-(--bg-main) border border-(--border-color) px-3 py-2 text-[10px] text-(--text-muted) leading-relaxed" dir="rtl">
          المرفقات تُولَّد آليا حسب الحالة: {legalBasis==='delim' ? 'المرسوم، محاضر التحديد، لائحة الإحداثيات، الصور الجوية' : 'سند الملكية/الرسم الخليفي، مرسوم المصادقة، محضر التسليم، تصميم توضيحي'}{pvNum ? '، محضر الجنحة' : ''}{satelliteImg ? '، صورة القمر الصناعي' : ''}.
        </div>
      </div>
    ),
  };

  return (
    <ModalWrap title="Rapport d'Expertise" subtitle={`محضر التصريحات · ${typeLabel}`} onClose={onClose} wide>
      <div className="px-4 pt-3 pb-1 flex items-center gap-2 shrink-0">
        <button onClick={() => setExpertiseType(null)}
          className="text-[10px] text-(--text-muted) hover:text-(--brand) font-bold uppercase tracking-wide transition-colors">
          ← تغيير النوع
        </button>
        <span className="text-(--border-color)">|</span>
        <span className="text-[11px] font-bold" style={{ color: expertiseType === 'daawa' ? '#ef4444' : '#16a34a' }}>
          {expertiseType === 'daawa' ? '⚖️ دعوى مدنية / جنحية' : '📋 مطلب التحفيظ'}
        </span>
      </div>
      <TabNav tabs={activeTabs} active={tab} onChange={setTab} />
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {tabContent[tab] || null}
      </div>
      <ActionBar>
        <BtnPrimary onClick={() => printHtml(getPDF())} icon={Printer}>توليد وطباعة PDF</BtnPrimary>
        <BtnSecondary onClick={() => htmlToDocx(getPDF(), getFilename())} icon={FileDown}>Word (.docx)</BtnSecondary>
      </ActionBar>
    </ModalWrap>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ChevauchementModal — professional full-screen report (multi-layer support)
// ─────────────────────────────────────────────────────────────────────────────

function buildChevauchementPDF(res: ChevauchementResult): string {
  const isInside  = res.globalPosition === 'داخل الملك الغابوي';
  const isPartial = res.globalPosition === 'جزئيا داخل الملك الغابوي';
  const posColor  = isInside ? '#dc2626' : isPartial ? '#ea580c' : '#16a34a';
  const posLabelFr = isInside ? 'INCLUSION TOTALE' : isPartial ? 'CHEVAUCHEMENT PARTIEL' : 'HORS DOMAINE FORESTIER';

  const relevantFeats = (res.forestGeoJSON?.features || []).filter((f: any) =>
    res.hits.some(h => h.foret === (f.properties?.FORET || ''))
  ).slice(0, 80);
  const miniSvg = buildMiniMapSVG(res.importedGeoJSON, relevantFeats);

  const hitsRows = res.hits.map(h => {
    const hc = h.percentage >= 95 ? '#dc2626' : h.percentage >= 1 ? '#ea580c' : '#16a34a';
    return `<tr>
      <td style="border:1px solid #ddd;padding:5px 8px">${h.foret}</td>
      <td style="border:1px solid #ddd;padding:5px 8px;direction:rtl">${h.foretAr||'—'}</td>
      <td style="border:1px solid #ddd;padding:5px 8px">${h.canton||'—'}</td>
      <td style="border:1px solid #ddd;padding:5px 8px;text-align:center">${(h.intersectionArea/10000).toFixed(4)} ha</td>
      <td style="border:1px solid #ddd;padding:5px 8px;text-align:center;font-weight:bold;color:${hc}">${h.percentage.toFixed(1)}%</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8">
<title>تقرير تحليل التداخل</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Arial',sans-serif;direction:rtl;padding:1.2cm 2cm;font-size:10pt;color:#111;line-height:1.6}
  .logo-wrap{text-align:center;margin-bottom:12px;padding-bottom:10px;border-bottom:2px solid #166534}
  .logo-wrap img{height:62px;width:auto}
  .logo-fallback{display:inline-flex;width:62px;height:62px;border:2px solid #166534;border-radius:50%;align-items:center;justify-content:center;font-size:7pt;font-weight:bold;color:#166534;text-align:center}
  .main-title{font-size:14pt;font-weight:bold;text-align:center;margin:10px 0 14px;text-decoration:underline}
  .position-badge{display:inline-block;padding:4px 18px;border-radius:4px;font-weight:bold;font-size:11pt;margin:6px auto;border:2px solid ${posColor};color:${posColor};background:${posColor}14}
  .pos-wrap{text-align:center;margin:10px 0 14px}
  .pos-label{font-size:8pt;letter-spacing:.08em;color:${posColor};font-weight:bold;display:block;margin-bottom:4px}
  table{width:100%;border-collapse:collapse;margin:10px 0;font-size:9.5pt}
  th{background:#e8f5e9;border:1px solid #ccc;padding:5px 8px;font-weight:bold;text-align:center}
  .map-wrap{margin:16px 0;text-align:center}
  .map-wrap svg{max-width:100%;border-radius:6px;border:1px solid #ccc}
  .legend-note{font-size:8pt;color:#555;text-align:center;margin-top:4px}
  @media print{@page{size:A4;margin:0}body{padding:.8cm 1.5cm}}
</style></head><body>
<div class="logo-wrap">
  <img src="/images/logo-anef.png" alt="ANEF" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex'"/>
  <span class="logo-fallback" style="display:none">ANEF</span>
</div>
<div class="main-title">تقرير تحليل التداخل مع الملك الغابوي</div>
<div class="pos-wrap">
  <span class="pos-label">${posLabelFr}</span>
  <span class="position-badge">${res.globalPosition}</span>
</div>
<table>
  <tr><th colspan="2">معلومات عامة — Informations générales</th></tr>
  <tr><td style="border:1px solid #ddd;padding:5px 8px;font-weight:bold;width:45%">اسم الطبقة</td><td style="border:1px solid #ddd;padding:5px 8px">${res.layerName}</td></tr>
  <tr><td style="border:1px solid #ddd;padding:5px 8px;font-weight:bold">المساحة الإجمالية</td><td style="border:1px solid #ddd;padding:5px 8px">ha ${(res.importedArea/10000).toFixed(4)}</td></tr>
  <tr><td style="border:1px solid #ddd;padding:5px 8px;font-weight:bold">مساحة التداخل</td><td style="border:1px solid #ddd;padding:5px 8px">ha ${(res.totalIntersectionArea/10000).toFixed(4)}</td></tr>
  <tr><td style="border:1px solid #ddd;padding:5px 8px;font-weight:bold">نسبة التداخل</td><td style="border:1px solid #ddd;padding:5px 8px;font-weight:bold;color:${posColor}">${res.totalPercentage.toFixed(1)}%</td></tr>
</table>
${res.hits.length > 0 ? `
<div style="margin:12px 0 6px;font-size:10.5pt;font-weight:bold">تفاصيل التقاطع :</div>
<table>
  <tr><th>الغابة (fr)</th><th>الغابة (ar)</th><th>Canton</th><th>مساحة التقاطع</th><th>النسبة</th></tr>
  ${hitsRows}
</table>` : ''}
<div class="map-wrap">${miniSvg}</div>
<div class="legend-note">الخريطة التوضيحية — Carte de situation · تحليل SIG</div>
</body></html>`;
}

export function ChevauchementModal({ onClose, result, results }: {
  onClose: () => void;
  result?: ChevauchementResult | null;
  results?: ChevauchementResult[];
}) {
  const [selectedResult, setSelectedResult] = useState<ChevauchementResult | null>(null);

  // Determine active result: explicit result prop takes priority, else selected from list
  const activeResult: ChevauchementResult | null = result || selectedResult;
  const allResults: ChevauchementResult[] = results && results.length > 0 ? results : (result ? [result] : []);
  const isMulti = allResults.length > 1;

  // ── Layer selection screen ──────────────────────────────────────────────────
  if (isMulti && !activeResult) {
    return (
      <ModalWrap title="Analyse Chevauchement" subtitle="اختر الطبقة · Sélectionner une couche" onClose={onClose}>
        <div className="p-5 space-y-3">
          <p className="text-(--text-muted) text-xs font-bold uppercase tracking-wider">
            طبقات متعددة — يرجى اختيار الطبقة المراد تحليلها
          </p>
          {allResults.map((r, i) => {
            const ic = r.globalPosition === 'داخل الملك الغابوي' ? '#ef4444'
              : r.globalPosition === 'جزئيا داخل الملك الغابوي' ? '#f97316' : '#22c55e';
            return (
              <button key={i} onClick={() => setSelectedResult(r)}
                className="w-full text-right px-4 py-3 rounded-xl border-2 border-(--border-color) hover:border-(--brand) bg-(--bg-main) transition-all flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-(--text-main) truncate">{r.layerName}</p>
                  <p className="text-[10px] font-mono text-(--text-muted)">{(r.importedArea/10000).toFixed(3)} ha</p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <span className="text-[13px] font-black font-mono" style={{ color: ic }}>{r.totalPercentage.toFixed(1)}%</span>
                  <span className="text-[9px] font-bold" style={{ color: ic }} dir="rtl">{r.globalPosition}</span>
                </div>
              </button>
            );
          })}
        </div>
        <ActionBar>
          <BtnSecondary onClick={onClose} icon={Layers}>إغلاق</BtnSecondary>
        </ActionBar>
      </ModalWrap>
    );
  }

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!activeResult) {
    return (
      <ModalWrap title="Analyse Chevauchement" subtitle="Domaine Forestier · تحليل التداخل" onClose={onClose}>
        <div className="p-5 space-y-4">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
            <p className="text-amber-600 text-xs font-bold uppercase tracking-wider mb-2">Utilisation</p>
            <p className="text-(--text-main) text-sm">L'analyse se lance automatiquement à l'import d'une couche polygone.</p>
          </div>
          <div className="space-y-2">
            {[
              "Aller dans l'onglet Couches",
              "Importer un GeoJSON, SHP ou KML (polygone)",
              "Le résultat apparaît automatiquement sous la couche",
              "Revenez ici pour le rapport PDF complet",
            ].map((s, i) => (
              <div key={i} className="flex gap-3 items-start">
                <span className="w-6 h-6 rounded-full bg-(--brand) text-white text-xs font-bold flex items-center justify-center shrink-0">{i+1}</span>
                <p className="text-(--text-main) text-sm pt-0.5">{s}</p>
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

  const isInside  = activeResult.globalPosition === 'داخل الملك الغابوي';
  const isPartial = activeResult.globalPosition === 'جزئيا داخل الملك الغابوي';
  const statusColor = isInside ? '#ef4444' : isPartial ? '#f97316' : '#22c55e';
  const labelFr  = isInside ? 'INCLUSION TOTALE' : isPartial ? 'CHEVAUCHEMENT PARTIEL' : 'HORS DOMAINE FORESTIER';

  return (
    <ModalWrap title="Analyse Chevauchement" subtitle="Domaine Forestier · تحليل التداخل" onClose={onClose} wide>
      {/* Multi-layer switcher strip */}
      {isMulti && (
        <div className="px-4 pt-3 pb-1 flex gap-2 overflow-x-auto shrink-0">
          {allResults.map((r, i) => {
            const ic = r.globalPosition === 'داخل الملك الغابوي' ? '#ef4444'
              : r.globalPosition === 'جزئيا داخل الملك الغابوي' ? '#f97316' : '#22c55e';
            const active = r === activeResult;
            return (
              <button key={i} onClick={() => setSelectedResult(r)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold border-2 transition-all ${active ? 'text-white' : 'bg-(--bg-main) text-(--text-muted) border-(--border-color) hover:border-(--brand)'}`}
                style={active ? { background: ic, borderColor: ic } : {}}>
                {r.layerName}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Status banner */}
        <div className="rounded-xl overflow-hidden border-2" style={{ borderColor: statusColor }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: statusColor + '18' }}>
            <div>
              <span className="text-[10px] font-black tracking-widest uppercase block" style={{ color: statusColor }}>{labelFr}</span>
              <span className="text-[13px] font-bold" style={{ color: statusColor, direction: 'rtl' }}>{activeResult.globalPosition}</span>
            </div>
            <span className="text-3xl font-black font-mono" style={{ color: statusColor }}>{activeResult.totalPercentage.toFixed(1)}%</span>
          </div>
          <div className="px-4 py-3 grid grid-cols-3 gap-4 bg-(--bg-main) text-center">
            <div>
              <p className="text-[9px] text-(--text-muted) uppercase tracking-wider">Couche</p>
              <p className="text-[11px] font-bold text-(--text-main) truncate">{activeResult.layerName}</p>
            </div>
            <div>
              <p className="text-[9px] text-(--text-muted) uppercase tracking-wider">Surface totale</p>
              <p className="text-[11px] font-bold font-mono text-(--text-main)">{(activeResult.importedArea/10000).toFixed(3)} ha</p>
            </div>
            <div>
              <p className="text-[9px] text-(--text-muted) uppercase tracking-wider">Intersection</p>
              <p className="text-[11px] font-bold font-mono" style={{ color: statusColor }}>{(activeResult.totalIntersectionArea/10000).toFixed(3)} ha</p>
            </div>
          </div>
        </div>

        {/* Breakdown per forest */}
        {activeResult.hits.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-(--text-muted) px-1">Détail par forêt</p>
            {activeResult.hits.map((h, i) => (
              <div key={i} className="bg-(--bg-main) border border-(--border-color) rounded-xl px-3 py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold text-(--text-main) truncate">🌲 {h.foret}{h.canton ? ` — ${h.canton}` : ''}</p>
                  {h.foretAr && <p className="text-[10px] text-(--text-muted) truncate" dir="rtl">{h.foretAr}</p>}
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <span className="text-[13px] font-black font-mono" style={{ color: statusColor }}>{h.percentage.toFixed(1)}%</span>
                  <div className="w-20 h-1.5 rounded-full bg-(--border-color) overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, h.percentage)}%`, backgroundColor: statusColor }} />
                  </div>
                  <span className="text-[9px] font-mono text-(--text-muted)">{(h.intersectionArea/10000).toFixed(3)} ha</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <ActionBar>
        <BtnPrimary onClick={() => printHtml(buildChevauchementPDF(activeResult))} icon={Printer}>تقرير PDF · Rapport</BtnPrimary>
        <BtnSecondary
          onClick={() => {
            const relFeats = (activeResult.forestGeoJSON?.features || []).filter((f: any) =>
              activeResult.hits.some(h => h.foret === (f.properties?.FORET||''))
            ).slice(0, 80);
            const svg = buildMiniMapSVG(activeResult.importedGeoJSON, relFeats);
            const blob = new Blob([svg], { type: 'image/svg+xml' });
            const url  = URL.createObjectURL(blob);
            Object.assign(document.createElement('a'), { href: url, download: `chevauchement-${activeResult.layerName}.svg` }).click();
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