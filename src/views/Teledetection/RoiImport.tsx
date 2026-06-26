// src/components/teledetection/RoiImport.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Emprise d'analyse personnalisée (remplace forest_limits à la demande) :
//   • Import : GeoJSON / JSON (natif), KML/KMZ (@tmcw/togeojson), Shapefile .zip
//     (shpjs), CSV lng,lat (natif). Les deux libs sont importées DYNAMIQUEMENT :
//     le build ne casse pas si elles ne sont pas installées.
//   • Dessin : rectangle / polygone (déclenchés par le parent, handler leaflet-draw
//     programmatique -> pas de barre d'outils par défaut, plus propre).
//   • Couche : visibilité + opacité de remplissage pilotables (comme la limite ANEF).
// La géométrie produite (FeatureCollection) part telle quelle au backend via
// `roiGeojson` (get_roi la consomme déjà -> aucune modification API/Flask).
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react';
import { Upload, Trash2, Square, Hexagon, X, Eye, EyeOff, AlertTriangle, FileUp } from 'lucide-react';

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

// ── Normalisation : tout ramener à une FeatureCollection ─────────────────────
function toFeatureCollection(geo: any): RoiFC | null {
  if (!geo) return null;
  if (geo.type === 'FeatureCollection') return { type: 'FeatureCollection', features: (geo.features ?? []).filter(Boolean) };
  if (geo.type === 'Feature') return { type: 'FeatureCollection', features: [geo] };
  if (geo.type && geo.coordinates) return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: geo }] };
  return null;
}

// ── CSV (lng,lat / lon,lat / x,y) -> Polygon fermé ───────────────────────────
function csvToFC(text: string): RoiFC | null {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 3) return null;
  const header = lines[0].toLowerCase().split(/[;,]/).map(s => s.trim());
  const iLng = header.findIndex(h => ['lng', 'lon', 'long', 'longitude', 'x'].includes(h));
  const iLat = header.findIndex(h => ['lat', 'latitude', 'y'].includes(h));
  const start = (iLng >= 0 && iLat >= 0) ? 1 : 0;
  const cx = start === 1 ? iLng : 0;
  const cy = start === 1 ? iLat : 1;
  const ring: number[][] = [];
  for (let k = start; k < lines.length; k++) {
    const cols = lines[k].split(/[;,]/).map(s => s.trim());
    const lng = parseFloat(cols[cx]); const lat = parseFloat(cols[cy]);
    if (Number.isFinite(lng) && Number.isFinite(lat)) ring.push([lng, lat]);
  }
  if (ring.length < 3) return null;
  const a = ring[0]; const b = ring[ring.length - 1];
  if (a[0] !== b[0] || a[1] !== b[1]) ring.push([a[0], a[1]]);
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }] };
}

export default function RoiImport({
  roi, roiName, drawing, showRoi, fill,
  onRoi, onClear, onDrawRect, onDrawPoly, onCancelDraw, onToggleShow, onFill,
}: RoiImportProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    setErr(null); setBusy(true);
    const name = file.name.replace(/\.[^.]+$/, '');
    const lower = file.name.toLowerCase();
    try {
      let fc: RoiFC | null = null;
      if (lower.endsWith('.geojson') || lower.endsWith('.json')) {
        fc = toFeatureCollection(JSON.parse(await file.text()));
      } else if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
        fc = csvToFC(await file.text());
      } else if (lower.endsWith('.kml') || lower.endsWith('.kmz')) {
        const mod = await import('@tmcw/togeojson').catch(() => null);
        if (!mod) { setErr('Installer @tmcw/togeojson pour lire les KML.'); return; }
        const dom = new DOMParser().parseFromString(await file.text(), 'text/xml');
        fc = toFeatureCollection((mod as any).kml(dom));
      } else if (lower.endsWith('.zip') || lower.endsWith('.shp')) {
        const shpMod = await import('shpjs').catch(() => null);
        if (!shpMod) { setErr('Installer shpjs pour lire les Shapefile (.zip).'); return; }
        const shp = (shpMod as any).default ?? shpMod;
        fc = toFeatureCollection(await shp(await file.arrayBuffer()));
      } else {
        setErr('Format non reconnu (.geojson / .kml / .zip / .csv).'); return;
      }
      if (!fc || !fc.features.length) { setErr('Aucune géométrie valide dans le fichier.'); return; }
      fc.features = fc.features.map((f: any, i: number) =>
        (f && typeof f.id !== 'undefined' && typeof f.id !== 'string') ? { ...f, id: String(f.id ?? i) } : f);
      onRoi(fc, name);
    } catch (e: any) {
      setErr('Lecture impossible : ' + (e?.message ?? 'fichier invalide'));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const btn = "flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all";

  return (
    <div className="space-y-2">
      <input
        ref={fileRef} type="file" accept=".geojson,.json,.kml,.kmz,.zip,.shp,.csv,.txt"
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
          <span className="text-[10px] text-cyan-500 font-semibold">Cliquez sur la carte pour tracer…</span>
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
        SHP en <code>.zip</code> (shp+shx+dbf+prj), coordonnées WGS84 (EPSG:4326). À 0 % de remplissage, seul le contour reste visible.
      </p>
    </div>
  );
}