// src/lib/import-vector.ts
// ─────────────────────────────────────────────────────────────────────────────
// Lecteur de couches vectorielles importées par l'utilisateur.
// Formats supportés : .geojson / .json (GeoJSON), .kml, .kmz, .csv.
// Retourne TOUJOURS un FeatureCollection GeoJSON propre, 2D, prêt pour
// Leaflet ET pour Google Earth Engine (system:index forcé en string).
//
// KML/KMZ : on s'appuie sur @tmcw/togeojson (standard de fait, gère les
// MultiGeometry, namespaces, coordonnées multilignes...) et jszip (KMZ = KML
// zippé). Les deux sont chargés en import() dynamique → code-split : ils ne
// pèsent dans le bundle que si un .kml/.kmz est réellement ouvert.
// CSV : parseur autonome (zéro dépendance) qui détecte soit une colonne WKT,
// soit un couple de colonnes lat/lon.
// ─────────────────────────────────────────────────────────────────────────────

export interface ImportedFC {
  type: 'FeatureCollection';
  features: any[];
}

const MAX_FILE_BYTES = 8_000_000; // garde-fou lecture (8 Mo)

// ── Point d'entrée unique ────────────────────────────────────────────────────
export async function parseVectorFile(file: File): Promise<ImportedFC> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`Fichier trop volumineux (> ${Math.round(MAX_FILE_BYTES / 1e6)} Mo).`);
  }
  const ext = (file.name.split('.').pop() || '').toLowerCase();

  let fc: ImportedFC;
  if (ext === 'geojson' || ext === 'json') {
    fc = parseGeoJsonText(await file.text());
  } else if (ext === 'kml') {
    fc = await parseKmlText(await file.text());
  } else if (ext === 'kmz') {
    fc = await parseKmz(await file.arrayBuffer());
  } else if (ext === 'csv' || ext === 'tsv') {
    fc = parseCsvText(await file.text(), ext === 'tsv' ? '\t' : undefined);
  } else {
    throw new Error('Format non supporté. Utilisez GeoJSON, KML, KMZ ou CSV.');
  }

  const clean = normalizeFC(fc);
  if (!clean.features.length) {
    throw new Error('Aucune entité géométrique valide trouvée dans le fichier.');
  }
  return clean;
}

// ── GeoJSON ──────────────────────────────────────────────────────────────────
function parseGeoJsonText(text: string): ImportedFC {
  let obj: any;
  try { obj = JSON.parse(text); }
  catch { throw new Error('GeoJSON invalide (JSON illisible).'); }

  if (obj?.type === 'FeatureCollection') return { type: 'FeatureCollection', features: obj.features || [] };
  if (obj?.type === 'Feature') return { type: 'FeatureCollection', features: [obj] };
  if (obj?.type && obj?.coordinates) {
    return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: obj }] };
  }
  throw new Error('GeoJSON non reconnu (ni FeatureCollection, ni Feature, ni Geometry).');
}

// ── KML (import dynamique de @tmcw/togeojson) ────────────────────────────────
async function parseKmlText(text: string): Promise<ImportedFC> {
  const { kml } = await import('@tmcw/togeojson');
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('KML invalide (XML illisible).');
  const gj = kml(doc) as any;
  return { type: 'FeatureCollection', features: gj?.features || [] };
}

// ── KMZ (zip → kml) ──────────────────────────────────────────────────────────
async function parseKmz(buf: ArrayBuffer): Promise<ImportedFC> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buf);
  // Le KML principal est généralement doc.kml ; sinon on prend le premier .kml.
  let entry = zip.file(/\.kml$/i)[0];
  if (!entry) throw new Error('Archive KMZ sans fichier .kml.');
  const txt = await entry.async('text');
  return parseKmlText(txt);
}

// ── CSV / TSV (autonome) ─────────────────────────────────────────────────────
function parseCsvText(text: string, forcedDelim?: string): ImportedFC {
  const rows = splitCsv(text, forcedDelim);
  if (rows.length < 2) throw new Error('CSV vide ou sans données.');

  const headers = rows[0].map(h => h.trim());
  const lower = headers.map(h => h.toLowerCase());

  // 1) Colonne géométrie WKT ?
  const wktIdx = lower.findIndex(h => /^(wkt|geometry|geom|the_geom)$/.test(h));
  // 2) Sinon couple lat/lon
  const latIdx = lower.findIndex(h => /^(lat|latitude|y)$/.test(h));
  const lonIdx = lower.findIndex(h => /^(lon|lng|long|longitude|x)$/.test(h));

  if (wktIdx === -1 && (latIdx === -1 || lonIdx === -1)) {
    throw new Error("CSV non géolocalisé : ajoutez une colonne 'wkt'/'geometry' OU deux colonnes 'lat' et 'lon'.");
  }

  const features: any[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (!cells.length || cells.every(c => c.trim() === '')) continue;

    const props: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      if (i === wktIdx || i === latIdx || i === lonIdx) return;
      props[h] = cells[i];
    });

    let geometry: any = null;
    if (wktIdx !== -1) {
      geometry = wktToGeometry(cells[wktIdx]);
    } else {
      const lat = parseFloat(cells[latIdx]); const lon = parseFloat(cells[lonIdx]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) geometry = { type: 'Point', coordinates: [lon, lat] };
    }
    if (geometry) features.push({ type: 'Feature', properties: props, geometry });
  }
  return { type: 'FeatureCollection', features };
}

// Découpe CSV robuste : guillemets, virgules/tab dans les champs, "" échappé,
// auto-détection du séparateur (',' ';' ou tab) sur la 1re ligne.
function splitCsv(text: string, forcedDelim?: string): string[][] {
  const clean = text.replace(/^\uFEFF/, ''); // BOM
  const firstLine = clean.slice(0, clean.indexOf('\n') >= 0 ? clean.indexOf('\n') : clean.length);
  const delim = forcedDelim
    ?? (firstLine.includes('\t') ? '\t' : firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',');

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
}

// WKT minimal mais correct : POINT / LINESTRING / POLYGON / MULTIPOINT /
// MULTILINESTRING / MULTIPOLYGON (SRID=...; préfixe toléré). Suffit pour une ROI.
function wktToGeometry(wktRaw: string): any | null {
  if (!wktRaw) return null;
  let wkt = wktRaw.trim().replace(/^SRID=\d+;/i, '').trim();
  const m = /^([A-Za-z]+)\s*(Z|M|ZM)?\s*\((.*)\)$/s.exec(wkt);
  if (!m) return null;
  const type = m[1].toUpperCase();
  const body = m[3];

  const coordSet = (s: string): number[] =>
    s.trim().split(/\s+/).slice(0, 2).map(Number).filter(Number.isFinite).reverse().reverse();
  const ptList = (s: string): number[][] =>
    s.split(',').map(p => coordSet(p)).filter(c => c.length === 2);
  // Sépare des groupes de 1er niveau "( ... ),( ... )" en respectant les parenthèses.
  const splitGroups = (s: string): string[] => {
    const out: string[] = []; let depth = 0, start = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '(') { if (depth === 0) start = i + 1; depth++; }
      else if (s[i] === ')') { depth--; if (depth === 0) out.push(s.slice(start, i)); }
    }
    return out;
  };

  try {
    switch (type) {
      case 'POINT':           return { type: 'Point', coordinates: coordSet(body) };
      case 'LINESTRING':      return { type: 'LineString', coordinates: ptList(body) };
      case 'MULTIPOINT':      return { type: 'MultiPoint', coordinates: ptList(body.replace(/[()]/g, '')) };
      case 'POLYGON':         return { type: 'Polygon', coordinates: splitGroups(body).map(ptList) };
      case 'MULTILINESTRING': return { type: 'MultiLineString', coordinates: splitGroups(body).map(ptList) };
      case 'MULTIPOLYGON':    return {
        type: 'MultiPolygon',
        coordinates: splitGroups(body).map(poly => splitGroups(poly).map(ptList)),
      };
      default: return null;
    }
  } catch { return null; }
}

// ── Normalisation finale ─────────────────────────────────────────────────────
// • supprime les entités sans géométrie
// • aplatit en 2D (KML porte souvent une altitude → GEE/Leaflet 2D)
// • force id en string (exigence GEE system:index)
function normalizeFC(fc: ImportedFC): ImportedFC {
  const features = (fc.features || [])
    .filter(f => f && f.geometry && f.geometry.coordinates)
    .map((f, i) => {
      const out: any = {
        type: 'Feature',
        properties: f.properties || {},
        geometry: { type: f.geometry.type, coordinates: to2D(f.geometry.coordinates) },
      };
      out.id = typeof f.id === 'string' ? f.id : String(f.id ?? i);
      return out;
    });
  return { type: 'FeatureCollection', features };
}

function to2D(coords: any): any {
  if (typeof coords[0] === 'number') return [coords[0], coords[1]];
  return coords.map(to2D);
}