// src/components/teledetection/RoiImport.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Emprise d'analyse personnalisée (remplace forest_limits à la demande).
// Lecture robuste de TOUS les formats (mêmes libs que le module DomaineForestier,
// qui sont déjà installées dans le projet) :
//   • GeoJSON / JSON       -> natif
//   • KML / KMZ            -> @tmcw/togeojson
//   • Shapefile .zip       -> shpjs
//   • CSV                  -> papaparse  (colonnes X/Y · lat/lng · Lambert)
//   • Excel .xlsx / .xls   -> xlsx
// Reprojection auto Lambert Maroc Nord (EPSG:26191) -> WGS84 si les coordonnées
// sortent de la plage [-180,180] (cas fréquent des SHP/CSV marocains).
// La géométrie produite (FeatureCollection) part telle quelle au backend via
// `roiGeojson` — aucune modification API/Flask.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react';
import { Upload, Trash2, Square, Hexagon, X, Eye, EyeOff, AlertTriangle, FileUp } from 'lucide-react';
import * as turf from '@turf/turf';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import shp from 'shpjs';
import { kml } from '@tmcw/togeojson';
import proj4 from 'proj4';

// Lambert Maroc « Zone Nord » (EPSG:26191) — enregistré pour proj4 (fallback CRS).
if (!(proj4 as any).defs('EPSG:26191')) {
  (proj4 as any).defs(
    'EPSG:26191',
    '+proj=lcc +lat_1=33.3 +lat_0=33.3 +lon_0=-5.4 +k_0=0.999625769 ' +
    '+x_0=500000 +y_0=300000 +a=6378249.2 +b=6356515 ' +
    '+towgs84=31,146,47,0,0,0,0 +units=m +no_defs',
  );
}

export type RoiFC = { type: 'FeatureCollection'; features: any[] };

interface RoiImportProps {
  roi: RoiFC | null;
  roiName: string;
  drawing: boolean;
  showRoi: boolean;
  fill: number;
  onRoi: (fc: RoiFC, name: string) => void;
  onClear: () => void;
  onDrawRect: () => void;
  onDrawPoly: () => void;
  onCancelDraw: () => void;
  onToggleShow: () => void;
  onFill: (v: number) => void;
}

// ── Reprojection : si une coordonnée dépasse la plage WGS84, on suppose Lambert
//    Maroc Nord et on convertit récursivement toutes les coordonnées. ──────────
function looksProjected(coords: any): boolean {
  if (typeof coords[0] === 'number') return Math.abs(coords[0]) > 180 || Math.abs(coords[1]) > 90;
  return looksProjected(coords[0]);
}
function reprojCoords(coords: any): any {
  if (typeof coords[0] === 'number') {
    const p = proj4('EPSG:26191', 'EPSG:4326', [coords[0], coords[1]]);
    return [p[0], p[1]];
  }
  return coords.map(reprojCoords);
}
function normalizeCrs(fc: RoiFC): RoiFC {
  try {
    const sample = fc.features.find((f: any) => f?.geometry?.coordinates);
    if (!sample || !looksProjected(sample.geometry.coordinates)) return fc;
    const features = fc.features.map((f: any) => {
      if (!f?.geometry?.coordinates) return f;
      return { ...f, geometry: { ...f.geometry, coordinates: reprojCoords(f.geometry.coordinates) } };
    });
    return { type: 'FeatureCollection', features };
  } catch { return fc; }
}

// ── Normalisation : tout ramener à une FeatureCollection propre ──────────────
function toFC(geo: any): RoiFC | null {
  if (!geo) return null;
  let fc: RoiFC | null = null;
  if (geo.type === 'FeatureCollection') fc = { type: 'FeatureCollection', features: (geo.features ?? []).filter(Boolean) };
  else if (geo.type === 'Feature') fc = { type: 'FeatureCollection', features: [geo] };
  else if (geo.type && geo.coordinates) fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: geo }] };
  if (!fc || !fc.features.length) return null;
  // ids entiers -> string (exigence GEE côté backend)
  fc.features = fc.features.map((f: any, i: number) =>
    (f && typeof f.id !== 'undefined' && typeof f.id !== 'string') ? { ...f, id: String(f.id ?? i) } : f);
  return normalizeCrs(fc);
}

// ── Points (CSV / Excel) -> Polygon (au moins 3 sommets) ─────────────────────
function extractPointFeatures(rows: any[]): any[] {
  const latKeys = ['lat', 'latitude', 'y', 'y_lambert', 'y lambert'];
  const lngKeys = ['lng', 'longitude', 'x', 'lon', 'x_lambert', 'x lambert'];
  const getVal = (row: any, keys: string[]) => {
    for (const k in row) if (keys.includes(String(k).trim().toLowerCase())) return row[k];
    return undefined;
  };
  return rows.map((row: any) => {
    const rawLat = getVal(row, latKeys), rawLng = getVal(row, lngKeys);
    if (rawLat == null || rawLng == null) return null;
    let lat = parseFloat(String(rawLat).replace(',', '.'));
    let lng = parseFloat(String(rawLng).replace(',', '.'));
    if (isNaN(lat) || isNaN(lng)) return null;
    if (Math.abs(lng) > 180 || Math.abs(lat) > 90) {     // Lambert -> WGS84
      try { const p = proj4('EPSG:26191', 'EPSG:4326', [lng, lat]); lng = p[0]; lat = p[1]; } catch { /* noop */ }
    }
    return turf.point([lng, lat]);
  }).filter(Boolean) as any[];
}
function pointsToRoi(features: any[]): RoiFC | null {
  if (features.length < 3) return null;
  const coords = features.map((f: any) => [...f.geometry.coordinates]);
  const a = coords[0], b = coords[coords.length - 1];
  if (a[0] !== b[0] || a[1] !== b[1]) coords.push([...a]);
  try { return { type: 'FeatureCollection', features: [turf.polygon([coords])] }; }
  catch { return null; }
}

export default function RoiImport({
  roi, roiName, drawing, showRoi, fill,
  onRoi, onClear, onDrawRect, onDrawPoly, onCancelDraw, onToggleShow, onFill,
}: RoiImportProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const finish = (fc: RoiFC | null, name: string) => {
    if (!fc || !fc.features.length) { setErr('Aucune géométrie valide (polygone ou ≥ 3 points).'); return; }
    setErr(null);
    onRoi(fc, name);
  };

  const handleFile = async (file: File) => {
    setErr(null); setBusy(true);
    const name = file.name.replace(/\.[^.]+$/, '');
    const ext = file.name.split('.').pop()?.toLowerCase();
    try {
      if (ext === 'geojson' || ext === 'json') {
        finish(toFC(JSON.parse(await file.text())), name);
      } else if (ext === 'kml' || ext === 'kmz') {
        const doc = new DOMParser().parseFromString(await file.text(), 'text/xml');
        finish(toFC(kml(doc)), name);
      } else if (ext === 'zip' || ext === 'shp') {
        finish(toFC(await shp(await file.arrayBuffer())), name);
      } else if (ext === 'csv' || ext === 'txt') {
        Papa.parse(file, {
          header: true, skipEmptyLines: true,
          complete: (res) => { finish(pointsToRoi(extractPointFeatures(res.data as any[])), name); setBusy(false); },
          error: () => { setErr('Lecture CSV impossible.'); setBusy(false); },
        });
        return;   // Papa est asynchrone : on libère busy dans son callback
      } else if (ext === 'xlsx' || ext === 'xls') {
        const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as any[];
        finish(pointsToRoi(extractPointFeatures(rows)), name);
      } else {
        setErr('Format non reconnu (.geojson / .kml / .zip / .csv / .xlsx).');
      }
    } catch (e: any) {
      setErr('Lecture impossible : ' + (e?.message ?? 'fichier invalide'));
    } finally {
      if (ext !== 'csv' && ext !== 'txt') setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const btn = "flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all";

  return (
    <div className="space-y-2">
      <input
        ref={fileRef} type="file" accept=".geojson,.json,.kml,.kmz,.zip,.shp,.csv,.txt,.xlsx,.xls"
        className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />

      {/* Barre compacte : Importer · Rectangle · Polygone */}
      <div className="flex items-center gap-1">
        <button onClick={() => fileRef.current?.click()} disabled={busy}
          className={btn + " border-cyan-500/50 text-cyan-500 hover:bg-cyan-500/10 disabled:opacity-50"}>
          <FileUp className="w-3.5 h-3.5" /> {busy ? '…' : 'Importer'}
        </button>
        <button onClick={drawing ? onCancelDraw : onDrawRect}
          className={btn + (drawing ? " border-cyan-500 bg-cyan-500/15 text-cyan-500" : " border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)]")}>
          <Square className="w-3.5 h-3.5" /> Rect.
        </button>
        <button onClick={drawing ? onCancelDraw : onDrawPoly}
          className={btn + (drawing ? " border-cyan-500 bg-cyan-500/15 text-cyan-500" : " border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)]")}>
          <Hexagon className="w-3.5 h-3.5" /> Polyg.
        </button>
      </div>

      {drawing && (
        <div className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
          <span className="text-[10px] text-cyan-500 font-semibold">Tracez sur la carte · double-clic pour terminer</span>
          <button onClick={onCancelDraw} className="text-cyan-500 hover:opacity-70"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Emprise active : nom · couche (œil + opacité) · suppression */}
      {roi && (
        <div className="rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)] divide-y divide-[var(--border-color)]">
          <div className="flex items-center justify-between gap-2 px-2 py-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <Upload className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
              <span className="text-[11px] font-bold text-[var(--text-main)] truncate">{roiName || 'Emprise'} · {roi.features.length}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={onToggleShow} title="Afficher / masquer l'emprise"
                className={showRoi ? "text-cyan-500" : "text-[var(--text-muted)]"}>
                {showRoi ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
              <button onClick={onClear} className="text-rose-500 hover:text-rose-400" title="Supprimer l'emprise">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
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
        SHP en <code>.zip</code> (shp+shx+dbf+prj). CSV/Excel : colonnes X/Y, lat/lng ou Lambert (≥ 3 points). À 0 % seul le contour reste visible.
      </p>
    </div>
  );
}