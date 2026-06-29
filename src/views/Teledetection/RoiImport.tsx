// src/components/teledetection/RoiImport.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Emprise d'analyse personnalisée (remplace forest_limits à la demande).
// Lecture ROBUSTE de TOUS les formats, normalisation vers une FeatureCollection
// ne contenant QUE des polygones propres :
//   • GeoJSON / JSON   -> natif
//   • KML              -> @tmcw/togeojson
//   • KMZ              -> dézippé (jszip, chargé à la demande) puis togeojson
//   • Shapefile .zip   -> shpjs (gère le multi-couches)
//   • CSV / TXT        -> papaparse  (colonnes X/Y · lat/lng · projeté)
//   • Excel .xlsx/.xls -> xlsx
// Étapes communes :
//   1) aplatissement (GeometryCollection / MultiGeometry éclatés, polygones gardés,
//      points collectés à part) ; 2) si pas de polygone mais ≥ 3 points -> convexe ;
//   3) reprojection vers WGS84 selon le SRC choisi par l'utilisateur (Auto par défaut).
// Fonctions ajoutées : sélecteur de système de coordonnées (CRS), édition de la
// forme tracée, export client (KML / GeoJSON), signalement terrain manuel.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react';
import {
  Upload, Trash2, Square, Hexagon, MapPin, X, Eye, EyeOff,
  AlertTriangle, FileUp, Download, Pencil, Flag, Check,
} from 'lucide-react';
import * as turf from '@turf/turf';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import shp from 'shpjs';
import { kml } from '@tmcw/togeojson';
import proj4 from 'proj4';

// ── Systèmes de coordonnées sélectionnables (Maroc + UTM courants) ────────────
const CRS_DEFS: Record<string, string> = {
  '26191': '+proj=lcc +lat_1=33.3 +lat_0=33.3 +lon_0=-5.4 +k_0=0.999625769 +x_0=500000 +y_0=300000 +a=6378249.2 +b=6356515 +towgs84=31,146,47,0,0,0,0 +units=m +no_defs',
  '26192': '+proj=lcc +lat_1=29.7 +lat_0=29.7 +lon_0=-5.4 +k_0=0.999615596 +x_0=500000 +y_0=300000 +a=6378249.2 +b=6356515 +towgs84=31,146,47,0,0,0,0 +units=m +no_defs',
  '32629': '+proj=utm +zone=29 +datum=WGS84 +units=m +no_defs',
  '32630': '+proj=utm +zone=30 +datum=WGS84 +units=m +no_defs',
};
for (const [code, def] of Object.entries(CRS_DEFS)) {
  if (!(proj4 as any).defs(`EPSG:${code}`)) (proj4 as any).defs(`EPSG:${code}`, def);
}
const CRS_OPTIONS: { value: string; label: string }[] = [
  { value: 'auto',  label: 'Auto (détection)' },
  { value: '4326',  label: 'WGS84 (lat/lng)' },
  { value: '26191', label: 'Lambert Maroc Nord (26191)' },
  { value: '26192', label: 'Lambert Maroc Sud (26192)' },
  { value: '32629', label: 'UTM 29N (32629)' },
  { value: '32630', label: 'UTM 30N (32630)' },
];

export type RoiFC = { type: 'FeatureCollection'; features: any[] };
export type ReportType = 'changement' | 'incendie';

interface RoiImportProps {
  roi: RoiFC | null;
  roiName: string;
  drawShape: 'rectangle' | 'polygon' | 'point' | null;
  showRoi: boolean;
  fill: number;
  editing: boolean;
  onRoi: (fc: RoiFC, name: string) => void;
  onClear: () => void;
  onDrawRect: () => void;
  onDrawPoly: () => void;
  onDrawPoint: () => void;
  onCancelDraw: () => void;
  onToggleShow: () => void;
  onFill: (v: number) => void;
  onToggleEdit: () => void;
  onReport: (type: ReportType, note: string) => Promise<boolean>;
}

// ── Reprojection paramétrée par le CRS source choisi ──────────────────────────
function isLonLat(coords: any): boolean {
  if (!Array.isArray(coords)) return false;
  if (typeof coords[0] === 'number') return Math.abs(coords[0]) <= 180 && Math.abs(coords[1]) <= 90;
  return isLonLat(coords[0]);
}
function reprojCoords(coords: any, src: string): any {
  if (typeof coords[0] === 'number') {
    const p = proj4(`EPSG:${src}`, 'EPSG:4326', [coords[0], coords[1]]);
    return [p[0], p[1]];
  }
  return coords.map((c: any) => reprojCoords(c, src));
}
// Renvoie le code EPSG source à appliquer, ou null si déjà en WGS84 / pas de reproj.
function resolveSrc(crs: string, sampleCoords: any): string | null {
  if (crs === '4326') return null;
  if (crs === 'auto') return isLonLat(sampleCoords) ? null : '26191';  // hypothèse historique
  return crs;   // CRS explicite : on fait confiance à l'utilisateur
}
function normalizeCrs(fc: RoiFC, crs: string): RoiFC {
  try {
    const sample = fc.features.find((f: any) => f?.geometry?.coordinates);
    if (!sample) return fc;
    const src = resolveSrc(crs, sample.geometry.coordinates);
    if (!src) return fc;
    const features = fc.features.map((f: any) => {
      if (!f?.geometry?.coordinates) return f;
      return { ...f, geometry: { ...f.geometry, coordinates: reprojCoords(f.geometry.coordinates, src) } };
    });
    return { type: 'FeatureCollection', features };
  } catch { return fc; }
}

// ── APLATISSEMENT : éclate GeometryCollection / MultiGeometry, isole polygones
//    et points (correctif des KML multi-polygones et fichiers mixtes). ─────────
type Split = { polygons: any[]; points: number[][] };
function pushGeometry(geom: any, props: any, acc: Split): void {
  if (!geom || !geom.type) return;
  switch (geom.type) {
    case 'GeometryCollection':
      (geom.geometries ?? []).forEach((g: any) => pushGeometry(g, props, acc)); break;
    case 'Polygon':
      if (geom.coordinates?.length) acc.polygons.push({ type: 'Feature', properties: props ?? {}, geometry: geom }); break;
    case 'MultiPolygon':
      (geom.coordinates ?? []).forEach((rings: any) => {
        if (rings?.length) acc.polygons.push({ type: 'Feature', properties: props ?? {}, geometry: { type: 'Polygon', coordinates: rings } });
      }); break;
    case 'Point':
      if (Array.isArray(geom.coordinates)) acc.points.push(geom.coordinates); break;
    case 'MultiPoint':
      (geom.coordinates ?? []).forEach((c: number[]) => { if (Array.isArray(c)) acc.points.push(c); }); break;
    default: break;   // LineString / autres ignorés pour une emprise
  }
}
function splitGeo(geo: any, acc: Split): void {
  if (!geo) return;
  if (Array.isArray(geo)) { geo.forEach(g => splitGeo(g, acc)); return; } // shpjs multi-couches
  if (geo.type === 'FeatureCollection') { (geo.features ?? []).forEach((f: any) => splitGeo(f, acc)); return; }
  if (geo.type === 'Feature') { pushGeometry(geo.geometry, geo.properties, acc); return; }
  if (geo.type) pushGeometry(geo, {}, acc);
}

function buildRoiFromGeo(geo: any, crs: string): RoiFC | null {
  const acc: Split = { polygons: [], points: [] };
  splitGeo(geo, acc);
  if (acc.polygons.length) {
    let fc: RoiFC = { type: 'FeatureCollection', features: acc.polygons };
    fc = normalizeCrs(fc, crs);
    fc.features = fc.features.map((f: any, i: number) =>
      (f && typeof f.id !== 'undefined' && typeof f.id !== 'string') ? { ...f, id: String(f.id ?? i) } : f);
    return fc.features.length ? fc : null;
  }
  return pointsToRoi(acc.points, crs);
}

// ── Points (CSV / Excel / nuage) -> Polygon via enveloppe convexe ─────────────
function pointsToRoi(rawPts: number[][], crs: string): RoiFC | null {
  const pts = rawPts.map((c) => {
    let [lng, lat] = c;
    const src = resolveSrc(crs, [lng, lat]);
    if (src) { try { const p = proj4(`EPSG:${src}`, 'EPSG:4326', [lng, lat]); lng = p[0]; lat = p[1]; } catch { /* noop */ } }
    return [lng, lat];
  }).filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
  if (pts.length < 3) return null;
  try {
    const hull = turf.convex(turf.featureCollection(pts.map((c) => turf.point(c))));
    if (hull && hull.geometry) return { type: 'FeatureCollection', features: [hull] };
  } catch { /* fallback */ }
  const ring = pts.map((c) => [...c]);
  const a = ring[0], b = ring[ring.length - 1];
  if (a[0] !== b[0] || a[1] !== b[1]) ring.push([...a]);
  try { return { type: 'FeatureCollection', features: [turf.polygon([ring])] }; }
  catch { return null; }
}
function extractPoints(rows: any[]): number[][] {
  const latKeys = ['lat', 'latitude', 'y', 'y_lambert', 'y lambert', 'northing'];
  const lngKeys = ['lng', 'longitude', 'x', 'lon', 'x_lambert', 'x lambert', 'easting'];
  const getVal = (row: any, keys: string[]) => {
    for (const k in row) if (keys.includes(String(k).trim().toLowerCase())) return row[k];
    return undefined;
  };
  return rows.map((row: any) => {
    const rawLat = getVal(row, latKeys), rawLng = getVal(row, lngKeys);
    if (rawLat == null || rawLng == null) return null;
    const lat = parseFloat(String(rawLat).replace(',', '.'));
    const lng = parseFloat(String(rawLng).replace(',', '.'));
    if (isNaN(lat) || isNaN(lng)) return null;
    return [lng, lat];
  }).filter(Boolean) as number[][];
}

// ── Exports client (sans backend) ────────────────────────────────────────────
function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click(); URL.revokeObjectURL(url);
}
function fcToKml(fc: RoiFC, name: string): string {
  const ringStr = (ring: number[][]) => ring.map((c) => `${c[0]},${c[1]},0`).join(' ');
  const polyKml = (coords: number[][][]) =>
    `<Polygon><outerBoundaryIs><LinearRing><coordinates>${ringStr(coords[0])}</coordinates></LinearRing></outerBoundaryIs>` +
    coords.slice(1).map((r) => `<innerBoundaryIs><LinearRing><coordinates>${ringStr(r)}</coordinates></LinearRing></innerBoundaryIs>`).join('') +
    `</Polygon>`;
  const placemarks = fc.features.map((f: any, i: number) => {
    const g = f.geometry; if (!g) return '';
    let geomKml = '';
    if (g.type === 'Polygon') geomKml = polyKml(g.coordinates);
    else if (g.type === 'MultiPolygon') geomKml = `<MultiGeometry>${g.coordinates.map((c: any) => polyKml(c)).join('')}</MultiGeometry>`;
    else if (g.type === 'Point') geomKml = `<Point><coordinates>${g.coordinates[0]},${g.coordinates[1]},0</coordinates></Point>`;
    else return '';
    return `<Placemark><name>${name} #${i + 1}</name>${geomKml}</Placemark>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${name}</name>${placemarks}</Document></kml>`;
}

export default function RoiImport({
  roi, roiName, drawShape, showRoi, fill, editing,
  onRoi, onClear, onDrawRect, onDrawPoly, onDrawPoint, onCancelDraw,
  onToggleShow, onFill, onToggleEdit, onReport,
}: RoiImportProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [crs, setCrs] = useState<string>('auto');
  // Signalement terrain
  const [reportOpen, setReportOpen] = useState(false);
  const [note, setNote] = useState('');
  const [reportMsg, setReportMsg] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);

  const finish = (fc: RoiFC | null, name: string) => {
    if (!fc || !fc.features.length) { setErr('Aucune géométrie exploitable (polygone, multi-polygone ou ≥ 3 points).'); return; }
    setErr(null); onRoi(fc, name);
  };

  const handleFile = async (file: File) => {
    setErr(null); setBusy(true);
    const name = file.name.replace(/\.[^.]+$/, '');
    const ext = file.name.split('.').pop()?.toLowerCase();
    try {
      if (ext === 'geojson' || ext === 'json') {
        finish(buildRoiFromGeo(JSON.parse(await file.text()), crs), name);
      } else if (ext === 'kml') {
        const doc = new DOMParser().parseFromString(await file.text(), 'text/xml');
        finish(buildRoiFromGeo(kml(doc), crs), name);
      } else if (ext === 'kmz') {
        try {
          const JSZip = (await import('jszip')).default;
          const zip = await JSZip.loadAsync(await file.arrayBuffer());
          const entry = Object.values(zip.files).find((f: any) => /\.kml$/i.test(f.name));
          if (!entry) throw new Error('no kml');
          const txt = await (entry as any).async('text');
          const doc = new DOMParser().parseFromString(txt, 'text/xml');
          finish(buildRoiFromGeo(kml(doc), crs), name);
        } catch {
          setErr("KMZ illisible. Décompressez-le et importez le .kml (ou installez 'jszip').");
        }
      } else if (ext === 'zip' || ext === 'shp') {
        finish(buildRoiFromGeo(await shp(await file.arrayBuffer()), crs), name);
      } else if (ext === 'csv' || ext === 'txt') {
        Papa.parse(file, {
          header: true, skipEmptyLines: true,
          complete: (res) => { finish(pointsToRoi(extractPoints(res.data as any[]), crs), name); setBusy(false); },
          error: () => { setErr('Lecture CSV impossible.'); setBusy(false); },
        });
        return;
      } else if (ext === 'xlsx' || ext === 'xls') {
        const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as any[];
        finish(pointsToRoi(extractPoints(rows), crs), name);
      } else {
        setErr('Format non reconnu (.geojson / .kml / .kmz / .zip / .csv / .xlsx).');
      }
    } catch (e: any) {
      setErr('Lecture impossible : ' + (e?.message ?? 'fichier invalide'));
    } finally {
      if (ext !== 'csv' && ext !== 'txt') setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const submitReport = async (type: ReportType) => {
    setReporting(true); setReportMsg(null);
    const ok = await onReport(type, note.trim());
    setReporting(false);
    setReportMsg(ok ? '✓ Signalement enregistré' : 'Échec de l’enregistrement (Supabase ?)');
    if (ok) { setNote(''); setTimeout(() => { setReportOpen(false); setReportMsg(null); }, 1500); }
  };

  const btn = "flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all";
  const drawBtnCls = (active: boolean) =>
    btn + (active ? " border-cyan-500 bg-cyan-500/15 text-cyan-500"
                  : " border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)]");

  return (
    <div className="space-y-2">
      <input
        ref={fileRef} type="file" accept=".geojson,.json,.kml,.kmz,.zip,.shp,.csv,.txt,.xlsx,.xls"
        className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />

      {/* CRS source du fichier importé */}
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] font-bold uppercase tracking-wide text-[var(--text-muted)] shrink-0">Système</span>
        <select value={crs} onChange={e => setCrs(e.target.value)}
          className="flex-1 p-1.5 rounded border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)] text-[11px]">
          {CRS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Importer */}
      <button onClick={() => fileRef.current?.click()} disabled={busy}
        className={btn + " w-full border-cyan-500/50 text-cyan-500 hover:bg-cyan-500/10 disabled:opacity-50"}>
        <FileUp className="w-3.5 h-3.5" /> {busy ? 'Lecture…' : 'Importer un fichier'}
      </button>

      {/* Dessin : Rectangle · Polygone · Point */}
      <div className="flex items-center gap-1">
        <button onClick={() => (drawShape === 'rectangle' ? onCancelDraw() : onDrawRect())} className={drawBtnCls(drawShape === 'rectangle')}>
          <Square className="w-3.5 h-3.5" /> Rect.
        </button>
        <button onClick={() => (drawShape === 'polygon' ? onCancelDraw() : onDrawPoly())} className={drawBtnCls(drawShape === 'polygon')}>
          <Hexagon className="w-3.5 h-3.5" /> Polyg.
        </button>
        <button onClick={() => (drawShape === 'point' ? onCancelDraw() : onDrawPoint())} className={drawBtnCls(drawShape === 'point')}>
          <MapPin className="w-3.5 h-3.5" /> Point
        </button>
      </div>

      {drawShape && (
        <div className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
          <span className="text-[10px] text-cyan-500 font-semibold">
            {drawShape === 'rectangle' ? 'Rectangle' : drawShape === 'polygon' ? 'Polygone' : 'Point'} · cliquez sur la carte
            {drawShape === 'polygon' ? ' · double-clic = fin' : ''}
          </span>
          <button onClick={onCancelDraw} className="text-cyan-500 hover:opacity-70"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Emprise active */}
      {roi && (
        <div className="rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)] divide-y divide-[var(--border-color)]">
          <div className="flex items-center justify-between gap-2 px-2 py-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <Upload className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
              <span className="text-[11px] font-bold text-[var(--text-main)] truncate">{roiName || 'Emprise'} · {roi.features.length}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={onToggleEdit} title="Éditer les sommets de la forme tracée"
                className={editing ? "text-amber-500" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"}>
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={onToggleShow} title="Afficher / masquer l'emprise"
                className={showRoi ? "text-cyan-500" : "text-[var(--text-muted)]"}>
                {showRoi ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
              <button onClick={onClear} className="text-rose-500 hover:text-rose-400" title="Supprimer l'emprise">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {editing && (
            <div className="px-2 py-1 bg-amber-500/10">
              <span className="text-[9px] text-amber-500 font-semibold">Édition active · glissez les sommets · re-cliquez le crayon pour valider.</span>
            </div>
          )}

          {/* Export client */}
          <div className="flex items-center gap-1.5 px-2 py-1.5">
            <Download className="w-3 h-3 text-[var(--text-muted)] shrink-0" />
            <span className="text-[9px] font-bold uppercase tracking-wide text-[var(--text-muted)] shrink-0">Télécharger</span>
            <button onClick={() => download(fcToKml(roi, roiName || 'emprise'), `${roiName || 'emprise'}.kml`, 'application/vnd.google-earth.kml+xml')}
              className="ml-auto px-2 py-0.5 rounded border border-cyan-500/40 text-cyan-500 text-[10px] font-bold hover:bg-cyan-500/10">KML</button>
            <button onClick={() => download(JSON.stringify(roi, null, 2), `${roiName || 'emprise'}.geojson`, 'application/geo+json')}
              className="px-2 py-0.5 rounded border border-cyan-500/40 text-cyan-500 text-[10px] font-bold hover:bg-cyan-500/10">GeoJSON</button>
          </div>

          {/* Signalement terrain manuel */}
          <div className="px-2 py-1.5">
            <button onClick={() => { setReportOpen(o => !o); setReportMsg(null); }}
              className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-500 hover:opacity-80">
              <Flag className="w-3.5 h-3.5" /> Signaler ce repère (terrain)
            </button>
            {reportOpen && (
              <div className="mt-1.5 space-y-1.5">
                <input value={note} onChange={e => setNote(e.target.value)} maxLength={160}
                  placeholder="Note (ex : coupe illégale, brûlis…)"
                  className="w-full p-1.5 rounded border border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-main)] text-[11px]" />
                <div className="flex items-center gap-1">
                  <button onClick={() => submitReport('changement')} disabled={reporting}
                    className="flex-1 py-1 rounded text-[10px] font-bold border border-amber-500/50 text-amber-500 hover:bg-amber-500/10 disabled:opacity-50">
                    Changement
                  </button>
                  <button onClick={() => submitReport('incendie')} disabled={reporting}
                    className="flex-1 py-1 rounded text-[10px] font-bold border border-rose-500/50 text-rose-500 hover:bg-rose-500/10 disabled:opacity-50">
                    Incendie
                  </button>
                </div>
                {reportMsg && (
                  <div className="flex items-center gap-1 text-[10px] text-emerald-500 font-semibold">
                    <Check className="w-3 h-3" /> {reportMsg}
                  </div>
                )}
              </div>
            )}
          </div>

          {showRoi && (
            <div className="flex items-center gap-2 px-2 py-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wide text-[var(--text-muted)] shrink-0">Remplissage</span>
              <input type="range" min={0} max={0.4} step={0.02} value={fill}
                onChange={e => onFill(Number(e.target.value))}
                className="flex-1 h-1.5 cursor-pointer" style={{ accentColor: '#22d3ee' }} />
              <span className="text-[9px] font-mono text-cyan-500 w-8 text-right shrink-0">{Math.round(fill * 100)}%</span>
            </div>
          )}
        </div>
      )}

      {err && (
        <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
          <span className="text-[10px] text-rose-400 leading-snug">{err}</span>
        </div>
      )}

      <p className="text-[9px] text-[var(--text-muted)] leading-snug">
        KML/KMZ multi-polygones, GeoJSON, SHP en <code>.zip</code>, CSV/Excel (X/Y, lat/lng ou projeté, ≥ 3 points). Choisissez le système si le fichier n'est pas en lat/lng. Un point seul sert au repérage/signalement mais ne peut pas être analysé.
      </p>
    </div>
  );
}