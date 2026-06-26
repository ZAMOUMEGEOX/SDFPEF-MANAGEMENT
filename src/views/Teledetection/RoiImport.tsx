// src/components/teledetection/RoiImport.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Import de limites personnalisées de l'utilisateur (au lieu de forest_limits) :
//   • GeoJSON / JSON   (natif)
//   • KML / KMZ        (@tmcw/togeojson — import dynamique, optionnel)
//   • Shapefile .zip   (shpjs — import dynamique, optionnel)
//   • CSV (lng,lat)    (parsing natif -> polygone)
// La géométrie produite est une FeatureCollection GeoJSON, envoyée telle quelle
// au backend Flask via `roiGeojson` (get_roi la consomme déjà : aucune modif API).
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react';
import { Upload, Trash2, Pencil, FileUp, AlertTriangle } from 'lucide-react';

export type RoiFC = { type: 'FeatureCollection'; features: any[] };

interface RoiImportProps {
  roi: RoiFC | null;
  roiName: string;
  drawing: boolean;
  onRoi: (fc: RoiFC, name: string) => void;
  onClear: () => void;
  onToggleDraw: () => void;
}

// ── Normalisation : tout ramener à une FeatureCollection ─────────────────────
function toFeatureCollection(geo: any): RoiFC | null {
  if (!geo) return null;
  if (geo.type === 'FeatureCollection') {
    return { type: 'FeatureCollection', features: (geo.features ?? []).filter(Boolean) };
  }
  if (geo.type === 'Feature') {
    return { type: 'FeatureCollection', features: [geo] };
  }
  // Géométrie nue (Polygon, MultiPolygon…)
  if (geo.type && geo.coordinates) {
    return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: geo }] };
  }
  return null;
}

// ── CSV (lng,lat ou lon,lat ou x,y) -> Polygon fermé ─────────────────────────
function csvToFC(text: string): RoiFC | null {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 3) return null;
  const header = lines[0].toLowerCase().split(/[;,]/).map(s => s.trim());
  const iLng = header.findIndex(h => ['lng', 'lon', 'long', 'longitude', 'x'].includes(h));
  const iLat = header.findIndex(h => ['lat', 'latitude', 'y'].includes(h));
  const start = (iLng >= 0 && iLat >= 0) ? 1 : 0;     // pas d'entête -> on lit dès la 1re ligne
  const cx = start === 1 ? iLng : 0;
  const cy = start === 1 ? iLat : 1;
  const ring: number[][] = [];
  for (let k = start; k < lines.length; k++) {
    const cols = lines[k].split(/[;,]/).map(s => s.trim());
    const lng = parseFloat(cols[cx]); const lat = parseFloat(cols[cy]);
    if (Number.isFinite(lng) && Number.isFinite(lat)) ring.push([lng, lat]);
  }
  if (ring.length < 3) return null;
  // fermeture de l'anneau
  const a = ring[0]; const b = ring[ring.length - 1];
  if (a[0] !== b[0] || a[1] !== b[1]) ring.push([a[0], a[1]]);
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }] };
}

export default function RoiImport({ roi, roiName, drawing, onRoi, onClear, onToggleDraw }: RoiImportProps) {
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
        // import dynamique : ne casse pas le build si la lib n'est pas installée
        const mod = await import('@tmcw/togeojson').catch(() => null);
        if (!mod) { setErr("Installer @tmcw/togeojson pour lire les KML."); return; }
        const xmlText = await file.text();
        const dom = new DOMParser().parseFromString(xmlText, 'text/xml');
        fc = toFeatureCollection((mod as any).kml(dom));

      } else if (lower.endsWith('.zip') || lower.endsWith('.shp')) {
        const shpMod = await import('shpjs').catch(() => null);
        if (!shpMod) { setErr("Installer shpjs pour lire les Shapefile (.zip)."); return; }
        const shp = (shpMod as any).default ?? shpMod;
        const buf = await file.arrayBuffer();
        fc = toFeatureCollection(await shp(buf));

      } else {
        setErr("Format non reconnu (.geojson / .kml / .zip / .csv).");
        return;
      }

      if (!fc || !fc.features.length) { setErr("Aucune géométrie valide trouvée dans le fichier."); return; }
      // ids entiers -> string (exigence GEE côté backend)
      fc.features = fc.features.map((f: any, i: number) =>
        (f && typeof f.id !== 'undefined' && typeof f.id !== 'string') ? { ...f, id: String(f.id ?? i) } : f);
      onRoi(fc, name);
    } catch (e: any) {
      setErr("Lecture impossible : " + (e?.message ?? 'fichier invalide'));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={fileRef} type="file" accept=".geojson,.json,.kml,.kmz,.zip,.shp,.csv,.txt"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />

      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border-2 border-dashed border-[var(--brand)]/60 text-[var(--brand)] text-[12px] font-bold hover:bg-[var(--brand-light)] transition-all disabled:opacity-50">
        <FileUp className="w-4 h-4" />
        {busy ? 'Lecture…' : 'رفع ملف الحدود (GeoJSON / KML / SHP.zip / CSV)'}
      </button>

      <button
        onClick={onToggleDraw}
        className={
          "w-full flex items-center justify-center gap-2 py-2 rounded-lg border-2 text-[12px] font-bold transition-all " +
          (drawing
            ? "border-emerald-500 bg-emerald-500/10 text-emerald-500"
            : "border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)]")
        }>
        <Pencil className="w-4 h-4" />
        {drawing ? 'وضع الرسم مُفعّل — ارسم على الخريطة' : 'رسم الحدود يدويًا على الخريطة'}
      </button>

      {roi && (
        <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)]">
          <div className="flex items-center gap-2 min-w-0">
            <Upload className="w-3.5 h-3.5 text-[var(--brand)] shrink-0" />
            <span className="text-[11px] font-bold text-[var(--text-main)] truncate">
              {roiName || 'حدود مخصّصة'} · {roi.features.length} شكل
            </span>
          </div>
          <button onClick={onClear} className="text-rose-500 hover:text-rose-400 shrink-0" title="حذف الحدود">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {err && (
        <div className="flex items-start gap-1.5 p-2 rounded-lg bg-rose-500/10 border border-rose-500/30">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
          <span className="text-[10px] text-rose-400 leading-snug">{err}</span>
        </div>
      )}

      <p className="text-[9px] text-[var(--text-muted)] leading-snug">
        ملاحظة: ملف SHP يجب أن يكون مضغوطًا <code>.zip</code> (shp+shx+dbf+prj). الإحداثيات يجب أن تكون بنظام WGS84 (EPSG:4326).
      </p>
    </div>
  );
}
