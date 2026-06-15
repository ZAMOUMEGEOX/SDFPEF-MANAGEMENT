// src/views/DomaineForestier/DomaineForestier.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  MapContainer, TileLayer, Polygon, useMapEvents, useMap,
  Tooltip, LayersControl, FeatureGroup, Popup, ScaleControl,
} from 'react-leaflet';
import * as turf from '@turf/turf';
import L from 'leaflet';
(window as any).L = L;
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import shp from 'shpjs';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import 'leaflet-measure/dist/leaflet-measure.css';
import 'leaflet-measure';
import { kml } from '@tmcw/togeojson';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import {
  FicheModal, AttestationModal, ExpertiseModal, ChevauchementModal,
  runChevauchementAnalysis,
} from './DocumentModals';
import type { ChevauchementResult } from './DocumentModals';
import proj4 from 'proj4';

proj4.defs("EPSG:26191", "+proj=lcc +lat_1=33.3 +lat_0=33.3 +lon_0=-5.4 +k_0=0.999625769 +x_0=500000 +y_0=300000 +a=6378249.2 +b=6356515 +towgs84=31,146,47,0,0,0,0 +units=m +no_defs");

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon, shadowUrl: iconShadow,
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
  tooltipAnchor: [16, -28], shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

import {
  FileText, Search, Layers, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, X,
  Target, Upload, Eye, EyeOff, LayoutTemplate,
  Trash2, Maximize, Palette, Printer, Save,
  Menu, Navigation, Plus, Minus, LocateFixed, Wrench, Combine,
  Circle, Square, Triangle, Settings, MapPin, MousePointer2,
  Zap,
} from 'lucide-react';
import { ViewState } from '../../types';
import { cn } from '../../lib/utils';

const { BaseLayer } = LayersControl;

// ─── Custom Marker Icon ───────────────────────────────────────────────────────
const customIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41],
});

// ─── Types ────────────────────────────────────────────────────────────────────
type TabId = 'couches' | 'recherche' | 'geotools' | 'documents';
interface DomaineForestierProps { setCurrentView?: (view: ViewState) => void; }
export interface MapLayer {
  id: string; name: string; type: string; visible: boolean; color: string;
  areaCoords?: [number, number][]; geojson?: any; leafletLayer?: any;
}

// ─── Module-level GeoJSON data store ─────────────────────────────────────────
const _officialGeoData: Record<string, any> = {};

// ─── Map helper components (unchanged) ───────────────────────────────────────
function MapResizeHandler() {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const observer = new ResizeObserver(() => { map.invalidateSize(); });
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

const MeasureSetup = () => {
  const map = useMap();
  useEffect(() => {
    if ((L.control as any).measure) {
      const measureControl = (L.control as any).measure({
        position: 'topright', primaryLengthUnit: 'meters', secondaryLengthUnit: 'kilometers',
        primaryAreaUnit: 'hectares', secondaryAreaUnit: 'sqmeters',
        activeColor: '#10B981', completedColor: '#059669',
      });
      measureControl.addTo(map);
      return () => { map.removeControl(measureControl); };
    }
  }, [map]);
  return null;
};

const GeomanSetup = ({ setCustomLayers, onLayerImported }: { setCustomLayers: any; onLayerImported?: (id: string, name: string, geojson: any) => void }) => {
  const map = useMap();
  useEffect(() => {
    map.pm.addControls({
      position: 'topright', drawCircle: false, drawCircleMarker: false,
      drawPolyline: true, drawRectangle: true, drawPolygon: true, drawText: false,
      editMode: true, dragMode: true, cutPolygon: false, removalMode: true,
    });
    map.pm.setGlobalOptions({ measurements: { measurement: true, displayFormat: 'metric' } });
    map.pm.setLang('fr');

    const handleCreate = (e: any) => {
      try {
        const layer = e.layer;
        const id = `drawn-${L.stamp(layer)}`;
        const geojson = layer.toGeoJSON();
        let area = 0, distance = 0;
        const typeName = e.shape;
        if (e.shape === 'Polygon' || e.shape === 'Rectangle') area = turf.area(geojson);
        else if (e.shape === 'Line') distance = turf.length(geojson, { units: 'kilometers' });
        let content = `<div style="max-height:250px;overflow-y:auto"><b style="font-size:14px;display:block;margin-bottom:8px;border-bottom:1px solid #eee;padding-bottom:4px">Élément dessiné (${typeName})</b>`;
        if (area > 0) {
          content += `<b>Géométrie (Polygone)</b><br/>`;
          content += area < 10000 ? `Surface: ${area.toFixed(2)} m²<br/>` : `Surface: ${(area/10000).toFixed(2)} Ha<br/>`;
          content += `Périmètre: ${turf.length(geojson,{units:'kilometers'}).toFixed(2)} km<br/>`;
        } else if (distance > 0) {
          content += `<b>Géométrie (Ligne)</b><br/>Longueur: ${distance.toFixed(2)} km<br/>`;
        } else if (e.shape === 'Marker' || e.shape === 'CircleMarker') {
          const [lng, lat] = geojson.geometry.coordinates;
          content += `<b>Géométrie (Point)</b><br/>Lon: ${lng.toFixed(6)}<br/>Lat: ${lat.toFixed(6)}<br/>`;
        }
        content += `</div>`;
        layer.bindPopup(content);
        setTimeout(() => { if (layer.openPopup) layer.openPopup(); }, 100);
        setCustomLayers((prev: any) => [...prev, { id, name: `Couche dessinée (${typeName})`, type: 'drawn', visible: true, color: '#3388ff', leafletLayer: layer, geojson }]);
        // Run chevauchement analysis on drawn polygons
        if ((e.shape === 'Polygon' || e.shape === 'Rectangle') && onLayerImported) {
          onLayerImported(id, `Couche dessinée (${typeName})`, geojson);
        }
      } catch (err) { console.error("Error creating layer", err); }
    };
    const handleRemove = (e: any) => {
      const id = `drawn-${L.stamp(e.layer)}`;
      setCustomLayers((prev: any) => prev.filter((l: any) => l.id !== id));
    };
    map.on('pm:create', handleCreate);
    map.on('pm:remove', handleRemove);
    return () => { map.pm.removeControls(); map.off('pm:create', handleCreate); map.off('pm:remove', handleRemove); };
  }, [map, setCustomLayers]);
  return null;
};

const MapEvents = ({ setCoords, onIdentify }: { setCoords: any; onIdentify?: (latlng: any, results: any[]) => void }) => {
  useMapEvents({
    mousemove(e) { setCoords({ lat: e.latlng.lat, lng: e.latlng.lng }); },
    click(e) {
      if (!onIdentify) return;
      const pt = turf.point([e.latlng.lng, e.latlng.lat]);
      const LAYER_META: Record<string, { label: string; color: string }> = {
        forest:    { label: 'Mlak Ghabi — ملك غابوي', color: '#16a34a' },
        communes:  { label: 'Communes TTH',            color: '#3b82f6' },
        provinces: { label: 'Provinces TTH',           color: '#f97316' },
        region:    { label: 'Région TTH',              color: '#8b5cf6' },
      };
      const results: any[] = [];
      for (const [key, data] of Object.entries(_officialGeoData)) {
        if (!data?.features) continue;
        for (const feature of data.features) {
          try {
            if ((feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') && turf.booleanPointInPolygon(pt, feature)) {
              const meta = LAYER_META[key] || { label: key, color: '#888' };
              results.push({ key, label: meta.label, color: meta.color, properties: feature.properties || {} });
              break;
            }
          } catch {}
        }
      }
      onIdentify(e.latlng, results);
    },
  });
  return null;
};

const MapCenterUpdater = ({ mapTargetCenter, setMapTargetCenter }: { mapTargetCenter: any; setMapTargetCenter: any }) => {
  const map = useMap();
  useEffect(() => {
    if (mapTargetCenter) { map.setView(mapTargetCenter, 14); setMapTargetCenter(null); }
  }, [mapTargetCenter, map, setMapTargetCenter]);
  useEffect(() => {
    const handle = () => map.setView([35.65, -5.35], 11);
    window.addEventListener('mapCenterExtent', handle);
    return () => window.removeEventListener('mapCenterExtent', handle);
  }, [map]);
  useEffect(() => {
    const handle = (e: Event) => { const bounds = (e as CustomEvent).detail; if (bounds) map.fitBounds(bounds, { padding: [20, 20], maxZoom: 16 }); };
    window.addEventListener('flyToBounds', handle);
    return () => window.removeEventListener('flyToBounds', handle);
  }, [map]);
  return null;
};

const MapResizeTracker = ({ isPanelCollapsed }: { isPanelCollapsed: boolean }) => {
  const map = useMapEvents({});
  useEffect(() => {
    const container = map.getContainer();
    if (!container) return;
    const ro = new ResizeObserver(() => { map.invalidateSize(); });
    ro.observe(container);
    return () => ro.disconnect();
  }, [map]);
  useEffect(() => {
    let start = performance.now();
    const frame = () => { map.invalidateSize(); if (performance.now() - start < 350) requestAnimationFrame(frame); };
    setTimeout(() => requestAnimationFrame(frame), 50);
  }, [isPanelCollapsed, map]);
  return null;
};

const CustomMapEventsHandler = ({ setCustomLayers }: { setCustomLayers: any }) => {
  const map = useMap();
  useEffect(() => {
    const handleZoomIn  = () => map.zoomIn();
    const handleZoomOut = () => map.zoomOut();
    const executeSearchObject = (data: any) => {
      const lat = parseFloat(data.lat), lon = parseFloat(data.lon);
      if (data.boundingbox) {
        map.fitBounds([[parseFloat(data.boundingbox[0]), parseFloat(data.boundingbox[2])], [parseFloat(data.boundingbox[1]), parseFloat(data.boundingbox[3])]]);
      } else if (data._bounds) {
        map.fitBounds(data._bounds, { padding: [20, 20], maxZoom: 15 });
      } else {
        map.flyTo([lat, lon], 14);
      }
      if ((map as any)._searchMarker) map.removeLayer((map as any)._searchMarker);
      const popupDiv = document.createElement('div');
      popupDiv.className = 'p-1 min-w-[200px]';
      popupDiv.innerHTML = `<h4 class="font-bold text-sm mb-1 text-stone-800">${data.display_name || 'Point'}</h4>
        <p class="text-xs text-stone-500 mb-3 font-mono">Lat: ${lat.toFixed(6)}<br/>Lng: ${lon.toFixed(6)}</p>
        <div class="flex gap-2">
          <button id="btn-keep-marker" class="flex-1 px-2 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded shadow-sm">Conserver</button>
          <button id="btn-remove-marker" class="flex-1 px-2 py-1.5 bg-red-500 hover:bg-red-600 text-white text-[11px] font-bold rounded shadow-sm">Effacer</button>
        </div>`;
      const marker = L.marker([lat, lon], { icon: customIcon }).addTo(map);
      marker.bindPopup(popupDiv).openPopup();
      popupDiv.querySelector('#btn-keep-marker')?.addEventListener('click', () => {
        marker.closePopup();
        delete (map as any)._searchMarker;
        const id = `search-${Date.now()}`;
        setCustomLayers((prev: any) => [...prev, { id, name: `Recherche: ${data.display_name?.substring(0, 20) || 'Point'}`, type: 'drawn', visible: true, color: '#10b981', leafletLayer: marker }]);
      });
      popupDiv.querySelector('#btn-remove-marker')?.addEventListener('click', () => { map.removeLayer(marker); delete (map as any)._searchMarker; });
      (map as any)._searchMarker = marker;
    };
    const handleSearchEvent = (e: any) => { if (e.detail?.lat) executeSearchObject(e.detail); };
    const handleSearchString = async (e: any) => {
      const query = e.detail; if (!query) return;
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
        const data = await res.json();
        if (data?.length > 0) executeSearchObject(data[0]); else alert("Lieu introuvable");
      } catch (err) { console.error("Search error", err); }
    };
    const handleLocateUser = () => {
      if (!navigator.geolocation) { alert("Géolocalisation non supportée."); return; }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          map.flyTo([latitude, longitude], 17, { duration: 1 });
          if ((map as any)._userLocationMarker) map.removeLayer((map as any)._userLocationMarker);
          if ((map as any)._userLocationCircle) map.removeLayer((map as any)._userLocationCircle);
          const userIcon = L.divIcon({ className: 'user-location-marker', html: `<div style="width:16px;height:16px;background-color:#3b82f6;border-radius:50%;border:2px solid white;box-shadow:0 0 10px rgba(0,0,0,0.3)"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] });
          const marker = L.marker([latitude, longitude], { icon: userIcon }).addTo(map);
          const circle = L.circle([latitude, longitude], { radius: accuracy, color: '#3b82f6', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.15 }).addTo(map);
          marker.bindTooltip("Votre Position", { permanent: false, direction: "top", offset: [0, -10] });
          (map as any)._userLocationMarker = marker;
          (map as any)._userLocationCircle = circle;
        },
        (err) => { alert("Erreur de géolocalisation: " + err.message); },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
      );
    };
    window.addEventListener('locateUser', handleLocateUser);
    window.addEventListener('zoomIn', handleZoomIn);
    window.addEventListener('zoomOut', handleZoomOut);
    window.addEventListener('mapSearch', handleSearchEvent);
    window.addEventListener('mapSearchString', handleSearchString);
    return () => {
      window.removeEventListener('locateUser', handleLocateUser);
      window.removeEventListener('zoomIn', handleZoomIn);
      window.removeEventListener('zoomOut', handleZoomOut);
      window.removeEventListener('mapSearch', handleSearchEvent);
      window.removeEventListener('mapSearchString', handleSearchString);
    };
  }, [map]);
  return null;
};

// ─── Utility: detect province from geojson centroid ──────────────────────────
function detectProvinceFromGeojson(geojson: any): string | null {
  if (!_officialGeoData.provinces?.features) return null;
  try {
    const centroid = turf.centroid(geojson);
    const PRIORITY = ['M\'diq-Fnideq', 'Fnideq', 'M\'diq', 'Tétouan', 'Tetouan', 'Mdiq'];
    const matches: { name: string; priority: number }[] = [];
    for (const feat of _officialGeoData.provinces.features) {
      if (turf.booleanPointInPolygon(centroid, feat)) {
        const name = feat.properties?.Nom__Fr || feat.properties?.NomFr || '';
        const priority = PRIORITY.findIndex(p => name.toLowerCase().includes(p.toLowerCase()));
        matches.push({ name, priority: priority === -1 ? 99 : priority });
      }
    }
    if (matches.length === 0) return null;
    matches.sort((a, b) => a.priority - b.priority);
    return matches[0].name;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function DomaineForestier({ setCurrentView }: DomaineForestierProps) {
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('couches');
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({ lat: 35.624793, lng: -5.329056 });
  const [identifyPanel, setIdentifyPanel] = useState<{
    latlng: { lat: number; lng: number };
    results: Array<{ key: string; label: string; color: string; properties: Record<string, any> }>;
  } | null>(null);

  const handleIdentify = (latlng: any, results: any[]) => {
    if (results.length === 0) { setIdentifyPanel(null); return; }
    setIdentifyPanel({ latlng: { lat: latlng.lat, lng: latlng.lng }, results });
  };

  const [mapTargetCenter, setMapTargetCenter] = useState<[number, number] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const featureGroupRef = useRef<L.FeatureGroup>(null);
  const searchTimeoutRef = useRef<any>(null);

  // ── Per-layer chevauchement results ──────────────────────────────────────
  const [chevauchementResults, setChevauchementResults] = useState<Record<string, ChevauchementResult>>({});

  // ── Last imported layer for document generation ───────────────────────────
  const [lastImportedLayer, setLastImportedLayer] = useState<{
    id: string; name: string; geojson: any;
    chevauchement: ChevauchementResult | null;
    province?: string | null;
  } | null>(null);

  const [customLayers, setCustomLayers] = useState<any[]>([]);

  // ── Enhanced search ───────────────────────────────────────────────────────
  const fetchSearchResults = async (query: string) => {
    if (!query.trim()) { setSearchResults([]); setShowDropdown(false); return; }
    setIsSearching(true);
    try {
      const q = query.toLowerCase();
      const localResults: any[] = [];
      if (_officialGeoData.forest?.features) {
        for (const feat of _officialGeoData.forest.features) {
          const p = feat.properties || {};
          if ((p.FORET || '').toLowerCase().includes(q) || (p.CANTON || '').toLowerCase().includes(q)) {
            try {
              const centroid = turf.centroid(feat);
              const [lng, lat] = centroid.geometry.coordinates;
              const bounds = turf.bbox(feat);
              localResults.push({ display_name: `🌲 ${p.FORET}${p.CANTON ? ' — ' + p.CANTON : ''}`, lat: String(lat), lon: String(lng), _bounds: [[bounds[1], bounds[0]], [bounds[3], bounds[2]]], _local: true });
            } catch {}
            if (localResults.length >= 4) break;
          }
        }
      }
      if (_officialGeoData.communes?.features) {
        for (const feat of _officialGeoData.communes.features) {
          const p = feat.properties || {};
          if ((p.NomFr || '').toLowerCase().includes(q) || (p.NomAr || '').toLowerCase().includes(q)) {
            try {
              const centroid = turf.centroid(feat);
              const [lng, lat] = centroid.geometry.coordinates;
              const bounds = turf.bbox(feat);
              localResults.push({ display_name: `🏘 ${p.NomFr || ''}${p.NomAr ? ' / ' + p.NomAr : ''}`, lat: String(lat), lon: String(lng), _bounds: [[bounds[1], bounds[0]], [bounds[3], bounds[2]]], _local: true });
            } catch {}
            if (localResults.length >= 6) break;
          }
        }
      }
      let nominatimResults: any[] = [];
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`);
        nominatimResults = await res.json() || [];
      } catch {}
      const combined = [...localResults, ...nominatimResults].slice(0, 8);
      setSearchResults(combined);
      setShowDropdown(combined.length > 0);
    } catch (err) { console.error("Search error", err); }
    finally { setIsSearching(false); }
  };

  const onSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => { fetchSearchResults(val); }, 400);
  };

  const handleMapSearch = (result?: any) => {
    if (result) {
      setSearchQuery(result.display_name.split(',')[0]);
      setShowDropdown(false);
      window.dispatchEvent(new CustomEvent('mapSearch', { detail: result }));
    } else if (searchResults.length > 0) {
      setShowDropdown(false);
      window.dispatchEvent(new CustomEvent('mapSearch', { detail: searchResults[0] }));
    } else if (searchQuery.trim()) {
      setShowDropdown(false);
      window.dispatchEvent(new CustomEvent('mapSearchString', { detail: searchQuery }));
    }
  };

  const calcLambert = (lat: number, lng: number) => {
    const p = proj4('EPSG:4326', 'EPSG:26191', [lng, lat]);
    return { x: p[0].toFixed(2), y: p[1].toFixed(2) };
  };
  const calcLngLatFromLambert = (x: number, y: number) => {
    const p = proj4('EPSG:26191', 'EPSG:4326', [x, y]);
    return { lng: p[0], lat: p[1] };
  };

  // ── Layer imported: run chevauchement, auto-load forest if needed ──────────
  const handleLayerImported = (layerId: string, name: string, geojson: any) => {
    const runAnalysis = (forestData: any) => {
      let chev: ChevauchementResult | null = null;
      try {
        chev = runChevauchementAnalysis(geojson, forestData, name);
        setChevauchementResults(prev => ({ ...prev, [layerId]: chev! }));
      } catch (e) { console.warn('[Chevauchement]', e); }
      const province = detectProvinceFromGeojson(geojson);
      setLastImportedLayer({ id: layerId, name, geojson, chevauchement: chev, province });
    };

    if (_officialGeoData.forest) {
      runAnalysis(_officialGeoData.forest);
    } else {
      setLastImportedLayer({ id: layerId, name, geojson, chevauchement: null, province: detectProvinceFromGeojson(geojson) });
      // Auto-load forest and run analysis
      fetch('/assets/data/forest_limits.json')
        .then(r => r.json())
        .then(forestData => {
          _officialGeoData.forest = forestData;
          runAnalysis(forestData);
        })
        .catch(() => console.warn('[AutoForestLoad] Failed'));
    }
  };

  const handleLayerDeleted = (id: string) => {
    setChevauchementResults(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (lastImportedLayer?.id === id) setLastImportedLayer(null);
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="flex w-full h-full font-sans bg-(--bg-main) flex-col md:flex-row">
      {/* ── Map Area ── */}
      <div className="relative bg-[#121214] border-b md:border-b-0 md:border-r border-(--border-color) overflow-hidden h-[35vh] md:h-full md:flex-1 shrink-0 z-10 md:shrink">
        <MapContainer center={[35.6, -5.35]} zoom={12} zoomControl={false} className="h-full w-full cursor-crosshair outline-none bg-[#e5e7eb]">
          <MapResizeHandler />
          <LayersControl position="topright">
            <BaseLayer name="Satellite (Google)">
              <TileLayer url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}" attribution="Google" />
            </BaseLayer>
            <BaseLayer checked name="Hybride (Satellite + Labels)">
              <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" attribution="Google" />
            </BaseLayer>
            <BaseLayer name="OpenStreetMap">
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
            </BaseLayer>
            <BaseLayer name="Topographique">
              <TileLayer url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png" attribution="OSM" />
            </BaseLayer>
          </LayersControl>

          {customLayers.filter((l: any) => l.visible && l.type === 'static_polygon' && l.areaCoords).map((layer: any) => {
            const mockGeoJSON = turf.polygon([[...layer.areaCoords, layer.areaCoords[0]]] as any);
            const area = turf.area(mockGeoJSON);
            const op = layer.opacity ?? 1;
            return (
              <Polygon key={layer.id} positions={layer.areaCoords} pathOptions={{ color: layer.color, fillColor: layer.color, opacity: op, fillOpacity: op * 0.4, weight: 2 }}>
                <Tooltip sticky>{layer.name}</Tooltip>
                <Popup>
                  <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                    <b style={{ fontSize: 14, display: 'block', marginBottom: 8, borderBottom: '1px solid #eee', paddingBottom: 4 }}>{layer.name}</b>
                    {area < 10000 ? <>Surface: {area.toFixed(2)} m²<br/></> : <>Surface: {(area/10000).toFixed(2)} Ha<br/></>}
                    Périmètre: {turf.length(mockGeoJSON, { units: 'kilometers' }).toFixed(2)} km
                  </div>
                </Popup>
              </Polygon>
            );
          })}

          <FeatureGroup ref={featureGroupRef} />
          <GeomanSetup setCustomLayers={setCustomLayers} onLayerImported={handleLayerImported} />
          <MeasureSetup />
          <MapEvents setCoords={setCoords} onIdentify={handleIdentify} />
          <MapResizeTracker isPanelCollapsed={isPanelCollapsed} />
          <MapCenterUpdater mapTargetCenter={mapTargetCenter} setMapTargetCenter={setMapTargetCenter} />
          <CustomMapEventsHandler setCustomLayers={setCustomLayers} />
          <ScaleControl position="bottomleft" imperial={false} />
        </MapContainer>

        {/* Identify Panel */}
        {identifyPanel && identifyPanel.results.length > 0 && (
          <div className="absolute bottom-10 left-4 z-1001 w-72 md:w-80 pointer-events-auto">
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
                <div className="flex items-center gap-2">
                  <MousePointer2 className="w-3.5 h-3.5 text-zinc-400" />
                  <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">Identifier</span>
                  <span className="text-[9px] text-zinc-400 font-mono">{identifyPanel.latlng.lat.toFixed(5)}, {identifyPanel.latlng.lng.toFixed(5)}</span>
                </div>
                <button onClick={() => setIdentifyPanel(null)} className="w-5 h-5 flex items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-500 hover:bg-zinc-300 text-xs font-bold">×</button>
              </div>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-72 overflow-y-auto">
                {identifyPanel.results.map((result, i) => {
                  const HIDDEN = ['FID','OBJECTID','Shape_Area','Shape_Length','MERGE_SRC','MERGE_SRC_1','TextString','RefName'];
                  const props = Object.entries(result.properties).filter(([k]) => !HIDDEN.includes(k) && result.properties[k] !== null && result.properties[k] !== '');
                  return (
                    <div key={i} className="p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: result.color }} />
                        <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-200 uppercase tracking-wide">{result.label}</span>
                      </div>
                      <table className="w-full text-[10px]"><tbody>
                        {props.map(([key, val]) => (
                          <tr key={key} className="border-b border-zinc-50 dark:border-zinc-800 last:border-0">
                            <td className="py-0.5 pr-2 font-semibold text-zinc-400 dark:text-zinc-500 w-1/3 align-top truncate">{key}</td>
                            <td className="py-0.5 text-zinc-700 dark:text-zinc-300 font-medium wrap-break-word">{String(val)}</td>
                          </tr>
                        ))}
                      </tbody></table>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 md:left-6 md:translate-x-0 z-1000 pointer-events-auto w-[90vw] md:w-95">
          <div className="flex items-center bg-white rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.2)] pl-3 pr-2 py-2 w-full">
            <button className="p-2 text-gray-700 hover:text-black transition-colors rounded-full hover:bg-gray-100 mr-2"><Menu className="size-5" /></button>
            <input
              type="text" placeholder="Rechercher forêt, commune..."
              value={searchQuery} onChange={onSearchInputChange}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleMapSearch(); } }}
              onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
              className="flex-1 bg-transparent px-1 text-[15px] font-medium text-gray-800 placeholder-gray-500 outline-none"
            />
            {isSearching && <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mr-1" />}
            {searchQuery && !isSearching && (
              <button onClick={() => { setSearchQuery(''); setSearchResults([]); setShowDropdown(false); }} className="p-1.5 text-gray-400 hover:text-gray-700"><X className="size-4" /></button>
            )}
            <button onClick={() => handleMapSearch()} className="p-2 text-gray-600 hover:text-gray-900"><Search className="size-5" /></button>
            <div className="w-px h-6 bg-gray-300 mx-1" />
            <button className="p-2 text-blue-600 hover:bg-blue-50 rounded-full" title="Itinéraire">
              <Navigation className="size-5" style={{ transform: 'rotate(45deg)' }} />
            </button>
          </div>
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute top-[calc(100%+8px)] left-0 right-0 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-1001">
              {searchResults.map((result: any, i: number) => {
                const parts = result.display_name.split(',');
                return (
                  <div key={i} onClick={() => handleMapSearch(result)} className="flex items-start gap-3 p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0">
                    <MapPin className={`size-5 mt-0.5 shrink-0 ${result._local ? 'text-emerald-500' : 'text-gray-400'}`} />
                    <div className="flex flex-col flex-1 overflow-hidden">
                      <span className="text-sm font-medium text-gray-800 truncate">{parts[0]}</span>
                      {parts[1] && <span className="text-xs text-gray-500 truncate">{parts.slice(1).join(',').trim()}</span>}
                    </div>
                    {result._local && <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold shrink-0">LOCAL</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Zoom Controls */}
        <div className="absolute bottom-6 right-6 flex flex-col gap-3 z-1000 pointer-events-auto">
          <button onClick={() => window.dispatchEvent(new CustomEvent('locateUser'))}
            className="w-10.5 h-10.5 flex items-center justify-center bg-[#1a1a1c] hover:bg-[#2a2a2c] text-blue-400 hover:text-blue-300 transition-colors border border-white/5 rounded-[14px] shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
            <LocateFixed className="size-5" />
          </button>
          <div className="flex flex-col bg-[#1a1a1c] rounded-[14px] shadow-[0_2px_8px_rgba(0,0,0,0.4)] overflow-hidden border border-white/5">
            <button onClick={() => window.dispatchEvent(new CustomEvent('zoomIn'))} className="w-10.5 h-10.5 flex items-center justify-center hover:bg-[#2a2a2c] text-neutral-300 hover:text-white transition-colors">
              <Plus className="size-6" strokeWidth={2.5} />
            </button>
            <div className="w-5 h-px bg-white/10 mx-auto" />
            <button onClick={() => window.dispatchEvent(new CustomEvent('zoomOut'))} className="w-10.5 h-10.5 flex items-center justify-center hover:bg-[#2a2a2c] text-neutral-300 hover:text-white transition-colors">
              <Minus className="size-6" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Coordinate HUD */}
        <div className="absolute bottom-4 left-4 md:left-27.5 z-1000 bg-[#1a1a1c]/80 backdrop-blur-md border border-white/10 rounded-lg px-3 py-1 flex items-center gap-3 shadow-[0_2px_6px_rgba(0,0,0,0.5)] pointer-events-auto">
          <div className="flex items-center gap-1.5">
            <div className="size-1.5 rounded-full bg-emerald-500" />
            <span className="text-white font-mono text-[10px] tracking-wide">{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</span>
          </div>
          <div className="w-px h-3 bg-white/20 my-auto" />
          <span className="text-emerald-400 font-mono text-[10px] tracking-wide">X: {calcLambert(coords.lat, coords.lng).x} | Y: {calcLambert(coords.lat, coords.lng).y}</span>
        </div>
      </div>

      {/* ── Sidebar ── */}
      <div
        className={cn(
          "flex-[0_0_auto] flex flex-col bg-(--bg-surface) border-l border-(--border-color) text-(--text-main) transition-all duration-300 relative z-10 shrink-0",
          isPanelCollapsed ? "w-0 overflow-hidden md:w-16 cursor-pointer items-center justify-center hover:bg-(--bg-main)" : "w-full md:w-85"
        )}
        onClick={() => isPanelCollapsed && setIsPanelCollapsed(false)}
      >
        {isPanelCollapsed && (
          <div className="flex flex-col items-center py-5 h-full w-full" onClick={() => setIsPanelCollapsed(false)}>
            <button className="p-2 text-(--text-muted) hover:text-(--text-main) bg-(--bg-main) rounded-lg border border-(--border-color) shadow-sm mb-6">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex flex-col gap-2 w-full px-3 items-center">
              {[{ id:'couches', icon: Layers, title:'Couches'}, { id:'recherche', icon: Search, title:'Recherche'}, { id:'geotools', icon: Wrench, title:'Outils'}, { id:'documents', icon: FileText, title:'Documents'}].map(({ id, icon: Icon, title }) => (
                <button key={id} onClick={(e) => { e.stopPropagation(); setActiveTab(id as TabId); setIsPanelCollapsed(false); }}
                  className={`p-2 rounded-lg flex items-center justify-center transition-colors ${activeTab===id ? 'bg-(--bg-surface) text-(--brand) border border-(--border-color)' : 'text-(--text-muted) hover:text-(--text-main) hover:bg-(--bg-main)'}`} title={title}>
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
            <div className="mt-auto px-3 w-full flex justify-center">
              {setCurrentView && (
                <button onClick={(e) => { e.stopPropagation(); setCurrentView('dashboard'); }} className="p-2 text-(--text-muted) hover:text-(--text-main) hover:bg-(--bg-main) rounded-lg">
                  <LayoutTemplate className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {!isPanelCollapsed && (
          <div className="flex flex-col h-full w-full min-w-70">
            {/* Header */}
            <div className="p-3 shrink-0 bg-(--bg-surface) flex flex-col gap-3">
              <div className="flex justify-between items-center px-1">
                <h2 className="text-(--text-main) font-semibold text-sm tracking-wide flex items-center gap-1.5">
                  <Settings className="w-4 h-4 text-(--text-muted)" /> Outils
                </h2>
                <button onClick={() => setIsPanelCollapsed(true)} className="p-1 text-(--text-muted) hover:text-(--text-main) hover:bg-(--bg-main) rounded-md">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-1 bg-(--bg-main) p-1 rounded-lg border border-(--border-color) mt-1">
                <TabButton active={activeTab==='couches'}   onClick={() => setActiveTab('couches')}   icon={Layers}   label="Couches" />
                <TabButton active={activeTab==='recherche'} onClick={() => setActiveTab('recherche')} icon={Search}   label="Recherche" />
                <TabButton active={activeTab==='geotools'}  onClick={() => setActiveTab('geotools')}  icon={Wrench}   label="Outils" />
                <TabButton active={activeTab==='documents'} onClick={() => setActiveTab('documents')} icon={FileText} label="Docs" />
              </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-4 md:p-5 no-scrollbar pb-24 md:pb-6 text-left">
              <div style={{ display: activeTab === 'couches' ? 'block' : 'none' }}>
                <CouchesTab
                  customLayers={customLayers}
                  setCustomLayers={setCustomLayers}
                  featureGroupRef={featureGroupRef}
                  setIsPanelCollapsed={setIsPanelCollapsed}
                  onLayerImported={handleLayerImported}
                  onLayerDeleted={handleLayerDeleted}
                  chevauchementResults={chevauchementResults}
                />
              </div>
              <div style={{ display: activeTab === 'recherche' ? 'block' : 'none' }}>
                <RechercheTab
                  calcLngLatFromLambert={calcLngLatFromLambert}
                  setCustomLayers={setCustomLayers}
                  featureGroupRef={featureGroupRef}
                  onLayerImported={handleLayerImported}
                  setActiveTab={setActiveTab}
                  setIsPanelCollapsed={setIsPanelCollapsed}
                />
              </div>
              <div style={{ display: activeTab === 'geotools' ? 'block' : 'none' }}>
                <GeotoolsTab customLayers={customLayers} setCustomLayers={setCustomLayers} featureGroupRef={featureGroupRef} />
              </div>
              <div style={{ display: activeTab === 'documents' ? 'block' : 'none' }}>
                <RapportsTab
                  lastImportedLayer={lastImportedLayer}
                  forestData={_officialGeoData.forest}
                  communesData={_officialGeoData.communes}
                  chevauchementResults={chevauchementResults}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TabButton
// ─────────────────────────────────────────────────────────────────────────────
function TabButton({ active, onClick, icon: Icon, label }: any) {
  return (
    <button onClick={onClick}
      className={`flex-1 flex flex-col items-center justify-center p-2 rounded-md transition-all ${active ? 'bg-(--bg-surface) text-(--text-main) shadow-sm border border-(--border-color)' : 'text-(--text-muted) hover:bg-(--bg-surface) hover:text-(--text-main)'}`}>
      <Icon className="w-4 h-4 mb-1" />
      <span className="text-[10px] font-semibold tracking-wide">{label}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ExcelSheetModal — NEW: select worksheet when Excel has multiple sheets
// ─────────────────────────────────────────────────────────────────────────────
function ExcelSheetModal({ sheets, fileName, onSelect, onClose }: {
  sheets: string[]; fileName: string;
  onSelect: (sheet: string) => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-(--bg-surface) border border-(--border-color) rounded-2xl shadow-2xl w-80 overflow-hidden">
        <div className="px-4 py-3 border-b border-(--border-color) flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-(--text-main)">Sélectionner une feuille</h3>
            <p className="text-[10px] text-(--text-muted) mt-0.5 truncate max-w-55">{fileName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-(--text-muted) hover:text-(--text-main) hover:bg-(--bg-main) rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 space-y-1.5 max-h-64 overflow-y-auto">
          {sheets.map((s, i) => (
            <button key={s} onClick={() => { onSelect(s); onClose(); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-(--bg-main) hover:bg-(--brand)/10 border border-(--border-color) hover:border-(--brand)/40 text-left transition-all group">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">{i + 1}</span>
              </div>
              <span className="text-sm font-medium text-(--text-main) group-hover:text-(--brand) flex-1 truncate">{s}</span>
              <ChevronRight className="w-4 h-4 text-(--text-muted) opacity-0 group-hover:opacity-100 group-hover:text-(--brand) transition-all" />
            </button>
          ))}
        </div>
        <div className="px-4 pb-3">
          <button onClick={onClose} className="w-full py-2 text-[10px] text-(--text-muted) hover:text-(--text-main) font-medium">Annuler</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ChevauchementLayerPanel — NEW: per-layer professional bilingual panel
// ─────────────────────────────────────────────────────────────────────────────
function ChevauchementLayerPanel({
  result, layerName, onOpenReport,
}: {
  result: ChevauchementResult;
  layerName: string;
  onOpenReport?: () => void;
}) {
  const r = result as any;
  const isInside  = result.globalPosition === 'داخل الملك الغابوي';
  const isPartial = result.globalPosition === 'جزئيا داخل الملك الغابوي';

  const statusColor = isInside ? '#ef4444' : isPartial ? '#f97316' : '#22c55e';
  const labelFr    = isInside ? 'INCLUSION TOTALE' : isPartial ? 'CHEVAUCHEMENT PARTIEL' : 'HORS DOMAINE FORESTIER';
  const descFr     = isInside
    ? `La parcelle «\u00a0${layerName}\u00a0» tombe entièrement dans le Domaine Forestier`
    : isPartial
    ? `La parcelle «\u00a0${layerName}\u00a0» tombe partiellement dans le Domaine Forestier`
    : `La parcelle «\u00a0${layerName}\u00a0» se situe en dehors du Domaine Forestier`;

  const descAr = isInside
    ? `القطعة «${layerName}» تقع كلياً داخل الملك الغابوي`
    : isPartial
    ? `القطعة «${layerName}» تقع جزئياً داخل الملك الغابوي`
    : `القطعة «${layerName}» تقع خارج الملك الغابوي`;

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: statusColor + '55' }}>
      {/* Header row */}
      <div className="px-3 py-2 flex items-center justify-between" style={{ backgroundColor: statusColor + '18' }}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: statusColor }} />
          <span className="text-[9px] font-black tracking-[0.08em] uppercase" style={{ color: statusColor }}>{labelFr}</span>
        </div>
        <span className="text-base font-black font-mono leading-none" style={{ color: statusColor }}>
          {result.totalPercentage.toFixed(1)}%
        </span>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5 space-y-2 bg-(--bg-main)">
        <p className="text-[11px] text-(--text-main) leading-relaxed">{descFr}.</p>
        <p className="text-[10px] text-(--text-muted) text-right leading-relaxed font-medium" dir="rtl">{descAr}.</p>

        {/* Stats */}
        {(r.totalArea != null || r.intersectionArea != null) && (
          <div className="bg-(--bg-surface) rounded-lg border border-(--border-color) px-2.5 py-2 grid grid-cols-2 gap-x-4 gap-y-0.5">
            {r.totalArea != null && <>
              <span className="text-[10px] text-(--text-muted)">Surface totale</span>
              <span className="text-[10px] font-mono font-bold text-(--text-main) text-right">{Number(r.totalArea).toFixed(3)} ha</span>
            </>}
            {r.intersectionArea != null && <>
              <span className="text-[10px] text-(--text-muted)">Intersection</span>
              <span className="text-[10px] font-mono font-bold text-right" style={{ color: statusColor }}>{Number(r.intersectionArea).toFixed(3)} ha</span>
            </>}
          </div>
        )}

        {/* Breakdown per forest/canton */}
        {(result.intersections?.length ?? 0) > 0 && (
          <div className="space-y-1.5 pt-0.5">
            {result.intersections?.map((inter: any, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
                <span className="text-[10px] text-(--text-main) font-medium flex-1 truncate">
                  {inter.foret}{inter.canton ? ` — ${inter.canton}` : ''}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="w-14 h-1.5 rounded-full bg-(--border-color) overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, Number(inter.percentage) || 0)}%`, backgroundColor: statusColor }} />
                  </div>
                  <span className="text-[10px] font-black font-mono w-10 text-right" style={{ color: statusColor }}>
                    {Number(inter.percentage || 0).toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* PDF report button */}
        {onOpenReport && (
          <button
            onClick={onOpenReport}
            className="w-full mt-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-[10px] font-bold tracking-wide transition-all hover:opacity-90 active:scale-95"
            style={{ borderColor: statusColor + '55', backgroundColor: statusColor + '15', color: statusColor }}
          >
            <Printer className="w-3 h-3" />
            تقرير PDF / Rapport
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RapportsTab — cleaned up: no inline chevauchement panel
// ─────────────────────────────────────────────────────────────────────────────
function RapportsTab({ lastImportedLayer, forestData, communesData, chevauchementResults }: {
  lastImportedLayer?: { id: string; name: string; geojson: any; chevauchement: ChevauchementResult | null; province?: string | null } | null;
  forestData?: any; communesData?: any;
  chevauchementResults?: Record<string, ChevauchementResult>;
}) {
  const [activeReport, setActiveReport] = useState<string | null>(null);
  const chev = lastImportedLayer?.chevauchement;
  const allChevResults = Object.values(chevauchementResults || {});

  const chevBadge = chev
    ? (chev.globalPosition === 'داخل الملك الغابوي'
        ? { label: 'Inclusion totale', color: '#ef4444' }
        : chev.globalPosition === 'جزئيا داخل الملك الغابوي'
        ? { label: 'Chevauchement partiel', color: '#f97316' }
        : { label: 'Hors domaine', color: '#22c55e' })
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1 mb-2">
        <h2 className="text-(--text-main) font-semibold text-base tracking-tight">Rapports & Documents</h2>
        {lastImportedLayer && (
          <span className="text-[10px] bg-(--bg-main) px-2 py-0.5 rounded-full border border-(--border-color) text-(--text-muted) font-medium truncate max-w-30">
            {lastImportedLayer.name}
          </span>
        )}
      </div>

      <div className="space-y-2.5">
        <ReportCard
          title="Rapport d'Expertise"
          subtitle="Woqof · Procès-verbal"
          desc="محضر التصريحات — وقوف على المكان"
          color="#3b82f6" icon={FileText}
          onClick={() => setActiveReport("Rapport d'Expertise")}
        />
        <ReportCard
          title="Fiche Technique Réquisition"
          subtitle="PDF / Word · 7 sections"
          desc="Délimitation · Immatriculation · Empiètement"
          color="#22c55e" icon={LayoutTemplate}
          onClick={() => setActiveReport("Fiche Technique Réquisition")}
        />
        <ReportCard
          title="Attestation Administrative"
          subtitle="بطاقة معاينة — إنتفاء الصبغة الغابوية"
          desc="ANEF · CPF M'diq-Fnideq · Tétouan"
          color="#8b5cf6" icon={Palette}
          onClick={() => setActiveReport("Attestation Administrative")}
        />
        <ReportCard
          title="Analyse Chevauchement"
          subtitle="Intersection · Domaine Forestier"
          desc={allChevResults.length > 1
            ? `${allChevResults.length} couches analysées`
            : chevBadge
            ? `${chevBadge.label} — ${chev!.totalPercentage.toFixed(1)}%`
            : lastImportedLayer
            ? "Calcul en cours…"
            : "Importez une couche → résultat auto"}
          color={chevBadge?.color ?? "#eab308"} icon={Maximize}
          onClick={() => setActiveReport("Analyse Chevauchement")}
          badge={allChevResults.length > 1
            ? { label: `${allChevResults.length} couches`, color: '#3b82f6' }
            : chevBadge ? { label: `${chev!.totalPercentage.toFixed(1)}%`, color: chevBadge.color } : undefined}
        />
      </div>

      {activeReport === "Fiche Technique Réquisition" && (
        <FicheModal onClose={() => setActiveReport(null)} forestData={forestData} communesData={communesData} importedLayer={lastImportedLayer} />
      )}
      {activeReport === "Attestation Administrative" && (
        <AttestationModal onClose={() => setActiveReport(null)} forestData={forestData} communesData={communesData} importedLayer={lastImportedLayer} chevauchementResult={lastImportedLayer?.chevauchement} />
      )}
      {activeReport === "Rapport d'Expertise" && (
        <ExpertiseModal onClose={() => setActiveReport(null)} importedLayer={lastImportedLayer} forestData={forestData} />
      )}
      {activeReport === "Analyse Chevauchement" && (
        <ChevauchementModal
          onClose={() => setActiveReport(null)}
          result={allChevResults.length === 1 ? allChevResults[0] : undefined}
          results={allChevResults.length > 1 ? allChevResults : undefined}
        />
      )}
    </div>
  );
}

function ReportCard({ title, subtitle, desc, icon: Icon, color, onClick, badge }: any) {
  return (
    <div onClick={onClick} className="group bg-(--bg-main) border border-(--border-color) hover:border-(--brand) rounded-xl p-3 cursor-pointer transition-all hover:shadow-sm">
      <div className="flex gap-3 items-center">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-(--bg-surface) border border-(--border-color) group-hover:border-(--brand)" style={{ color }}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-(--text-main) font-semibold text-[13px] leading-tight">{title}</h4>
          <div className="text-[9px] uppercase tracking-wider text-(--text-muted) mt-0.5">{subtitle}</div>
          <p className="text-[10px] text-(--text-muted) leading-snug mt-0.5">{desc}</p>
        </div>
        {badge && (
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded shrink-0" style={{ backgroundColor: badge.color + '20', color: badge.color }}>
            {badge.label}
          </span>
        )}
        <ChevronRight className="w-3.5 h-3.5 text-(--text-muted) group-hover:text-(--text-main) opacity-0 group-hover:opacity-100 shrink-0" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RechercheTab — pro minimalist: flat rows, inline poly toggle per coord block
// ─────────────────────────────────────────────────────────────────────────────
interface PolyPoint { id: string; x: string; y: string; mode: 'lambert' | 'wgs84'; label?: string; }

function RechercheTab({
  calcLngLatFromLambert, setCustomLayers, featureGroupRef, onLayerImported, setActiveTab, setIsPanelCollapsed,
}: {
  calcLngLatFromLambert: (x: number, y: number) => { lat: number; lng: number };
  setCustomLayers: any;
  featureGroupRef: any;
  onLayerImported?: (id: string, name: string, geojson: any) => void;
  setActiveTab?: (tab: any) => void;
  setIsPanelCollapsed?: (v: boolean) => void;
}) {
  const [lngVal, setLngVal]         = useState('');
  const [latVal, setLatVal]         = useState('');
  const [lambertX, setLambertX]     = useState('');
  const [lambertY, setLambertY]     = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Per-row poly toggle
  const [lambertPoly, setLambertPoly] = useState(false);
  const [wgsPoly,     setWgsPoly]     = useState(false);

  // Shared polygon builder
  const [polyPoints, setPolyPoints] = useState<PolyPoint[]>([]);
  const [polyName,   setPolyName]   = useState('Polygone personnalisé');
  const [polyMsg,    setPolyMsg]    = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Shared styles
  const inp = "flex-1 min-w-0 bg-(--bg-main) border border-(--border-color) rounded-md py-1.5 px-2.5 text-[12px] font-mono focus:outline-none focus:border-(--brand) transition-colors text-(--text-main) placeholder:text-(--text-muted)";
  const rowLabel = "text-[9px] font-bold uppercase tracking-wider text-(--text-muted) select-none";

  // ── Navigation handlers ───────────────────────────────────────────────────
  const handleCenterLambert = () => {
    const x = parseFloat(lambertX), y = parseFloat(lambertY);
    if (!isNaN(x) && !isNaN(y)) {
      const c = calcLngLatFromLambert(x, y);
      window.dispatchEvent(new CustomEvent('mapSearch', { detail: { lat: c.lat, lon: c.lng, display_name: `Lambert (${x}, ${y})` } }));
    }
  };
  const handleCenterWGS = () => {
    const lng = parseFloat(lngVal), lat = parseFloat(latVal);
    if (!isNaN(lng) && !isNaN(lat))
      window.dispatchEvent(new CustomEvent('mapSearch', { detail: { lat, lon: lng, display_name: `WGS84 (${lng}, ${lat})` } }));
  };

  // ── Polygon helpers ───────────────────────────────────────────────────────
  const addLambertPoint = () => {
    const x = parseFloat(lambertX), y = parseFloat(lambertY);
    if (isNaN(x) || isNaN(y)) return;
    setPolyPoints(prev => [...prev, { id: `pt-${Date.now()}`, x: lambertX, y: lambertY, mode: 'lambert', label: `L ${x.toFixed(0)}, ${y.toFixed(0)}` }]);
    setPolyMsg(null);
  };
  const addWgsPoint = () => {
    const lng = parseFloat(lngVal), lat = parseFloat(latVal);
    if (isNaN(lng) || isNaN(lat)) return;
    setPolyPoints(prev => [...prev, { id: `pt-${Date.now()}`, x: lngVal, y: latVal, mode: 'wgs84', label: `W ${lng.toFixed(4)}, ${lat.toFixed(4)}` }]);
    setPolyMsg(null);
  };
  const removePoint = (id: string) => setPolyPoints(prev => prev.filter(p => p.id !== id));

  const pointToWGS84 = (pt: PolyPoint): [number, number] => {
    const x = parseFloat(pt.x), y = parseFloat(pt.y);
    if (pt.mode === 'lambert') { const c = calcLngLatFromLambert(x, y); return [c.lng, c.lat]; }
    return [x, y];
  };

  const buildPolygon = () => {
    if (polyPoints.length < 3) { setPolyMsg({ type: 'error', text: 'Minimum 3 points requis.' }); return; }
    try {
      const coords = polyPoints.map(pointToWGS84);
      if (coords[0][0] !== coords[coords.length-1][0] || coords[0][1] !== coords[coords.length-1][1]) coords.push([...coords[0]]);
      const geojson = turf.featureCollection([turf.polygon([coords])]);
      const id = `poly-${Date.now()}`;
      const color = '#f59e0b';
      const leafletLayer = L.geoJSON(geojson, { style: { color, weight: 2, opacity: 0.9, fillColor: color, fillOpacity: 0.22 } });
      if (featureGroupRef?.current) {
        featureGroupRef.current.addLayer(leafletLayer);
        try { const b = leafletLayer.getBounds(); if (b?.isValid()) window.dispatchEvent(new CustomEvent('flyToBounds', { detail: b })); } catch {}
      }
      setCustomLayers((prev: any) => [...prev, { id, name: polyName || 'Polygone', type: 'imported', visible: true, color, opacity: 0.9, geojson, leafletLayer }]);
      onLayerImported?.(id, polyName || 'Polygone', geojson);
      setPolyMsg({ type: 'success', text: `Couche «${polyName}» créée.` });
      setPolyPoints([]); setPolyName('Polygone personnalisé');
      if (setActiveTab) setTimeout(() => { setActiveTab('couches'); setIsPanelCollapsed?.(false); }, 600);
    } catch { setPolyMsg({ type: 'error', text: 'Erreur de création.' }); }
  };

  const hasPoints = polyPoints.length > 0;
  const canBuild  = polyPoints.length >= 3;

  return (
    <div className="space-y-0 pb-4">

      {/* ── Recherche interne ────────────────────────────────────────────── */}
      <div className="pb-4">
        <p className={rowLabel}>Recherche interne · Forêts / Communes</p>
        <div className="flex gap-2 mt-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-(--text-muted) pointer-events-none" />
            <input
              type="text"
              placeholder="Forêt Jbel Dersa, Commune Martil…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && searchQuery.trim()) window.dispatchEvent(new CustomEvent('mapSearchString', { detail: searchQuery.trim() })); }}
              className={`${inp} pl-8`}
            />
          </div>
          <button
            onClick={() => { if (searchQuery.trim()) window.dispatchEvent(new CustomEvent('mapSearchString', { detail: searchQuery.trim() })); }}
            className="px-3.5 py-1.5 bg-(--brand) hover:opacity-90 text-white font-bold text-[11px] rounded-md shadow-sm transition-all active:scale-95 shrink-0"
          >GO</button>
        </div>
      </div>

      <div className="h-px bg-(--border-color)" />

      {/* ── Lambert Nord ─────────────────────────────────────────────────── */}
      <div className="py-4 space-y-2.5">
        {/* Row header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className={rowLabel}>Lambert Nord</span>
            <span className="text-[8px] text-(--text-muted) bg-(--bg-main) border border-(--border-color) rounded px-1 py-px font-mono">EPSG:26191</span>
          </div>
          {/* Polygon toggle */}
          <button
            onClick={() => setLambertPoly(v => !v)}
            title={lambertPoly ? "Désactiver ajout au polygone" : "Activer ajout au polygone"}
            className={cn(
              "flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-md border transition-all",
              lambertPoly
                ? "bg-amber-500/15 border-amber-500/40 text-amber-600"
                : "border-(--border-color) text-(--text-muted) hover:text-(--text-main) hover:border-(--brand)/40"
            )}
          >
            <Zap className="w-2.5 h-2.5" />
            Poly
          </button>
        </div>

        {/* Inputs */}
        <div className="flex gap-2">
          <input type="number" step="any" value={lambertX} onChange={e => setLambertX(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCenterLambert(); }}
            placeholder="X — Est" className={inp} />
          <input type="number" step="any" value={lambertY} onChange={e => setLambertY(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCenterLambert(); }}
            placeholder="Y — Nord" className={inp} />
          <button onClick={handleCenterLambert}
            className="px-3 py-1.5 bg-(--bg-surface) border border-(--border-color) hover:bg-(--bg-main) text-(--text-main) font-bold text-[11px] rounded-md shadow-sm transition-all active:scale-95 shrink-0">
            GO
          </button>
        </div>

        {/* Poly add row — revealed when toggled */}
        {lambertPoly && (
          <div className="flex items-center gap-2 pl-0.5 pt-0.5 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="w-px h-6 bg-amber-400/50 shrink-0" />
            <p className="text-[10px] text-(--text-muted) flex-1">
              {lambertX && lambertY
                ? <span className="font-mono text-amber-600">{parseFloat(lambertX).toFixed(0)}, {parseFloat(lambertY).toFixed(0)}</span>
                : 'Entrez X et Y ci-dessus'}
            </p>
            <button
              onClick={() => { addLambertPoint(); handleCenterLambert(); }}
              disabled={!lambertX || !lambertY}
              className={cn(
                "flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-md border transition-all",
                lambertX && lambertY
                  ? "bg-amber-500/15 border-amber-500/40 text-amber-600 hover:bg-amber-500/25 active:scale-95"
                  : "border-(--border-color) text-(--text-muted) cursor-not-allowed opacity-50"
              )}
            >
              <Plus className="w-3 h-3" /> Ajouter
            </button>
          </div>
        )}
      </div>

      <div className="h-px bg-(--border-color)" />

      {/* ── WGS84 ────────────────────────────────────────────────────────── */}
      <div className="py-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className={rowLabel}>WGS84</span>
            <span className="text-[8px] text-(--text-muted) bg-(--bg-main) border border-(--border-color) rounded px-1 py-px font-mono">EPSG:4326</span>
          </div>
          <button
            onClick={() => setWgsPoly(v => !v)}
            title={wgsPoly ? "Désactiver ajout au polygone" : "Activer ajout au polygone"}
            className={cn(
              "flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-md border transition-all",
              wgsPoly
                ? "bg-amber-500/15 border-amber-500/40 text-amber-600"
                : "border-(--border-color) text-(--text-muted) hover:text-(--text-main) hover:border-(--brand)/40"
            )}
          >
            <Zap className="w-2.5 h-2.5" />
            Poly
          </button>
        </div>

        <div className="flex gap-2">
          <input type="number" step="any" value={lngVal} onChange={e => setLngVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCenterWGS(); }}
            placeholder="Longitude" className={inp} />
          <input type="number" step="any" value={latVal} onChange={e => setLatVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCenterWGS(); }}
            placeholder="Latitude" className={inp} />
          <button onClick={handleCenterWGS}
            className="px-3 py-1.5 bg-(--bg-surface) border border-(--border-color) hover:bg-(--bg-main) text-(--text-main) font-bold text-[11px] rounded-md shadow-sm transition-all active:scale-95 shrink-0">
            GO
          </button>
        </div>

        {wgsPoly && (
          <div className="flex items-center gap-2 pl-0.5 pt-0.5 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="w-px h-6 bg-amber-400/50 shrink-0" />
            <p className="text-[10px] text-(--text-muted) flex-1">
              {lngVal && latVal
                ? <span className="font-mono text-amber-600">{parseFloat(lngVal).toFixed(4)}, {parseFloat(latVal).toFixed(4)}</span>
                : 'Entrez Longitude et Latitude ci-dessus'}
            </p>
            <button
              onClick={() => { addWgsPoint(); handleCenterWGS(); }}
              disabled={!lngVal || !latVal}
              className={cn(
                "flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-md border transition-all",
                lngVal && latVal
                  ? "bg-amber-500/15 border-amber-500/40 text-amber-600 hover:bg-amber-500/25 active:scale-95"
                  : "border-(--border-color) text-(--text-muted) cursor-not-allowed opacity-50"
              )}
            >
              <Plus className="w-3 h-3" /> Ajouter
            </button>
          </div>
        )}
      </div>

      {/* ── Polygon builder panel — appears only when points exist ────────── */}
      {hasPoints && (
        <>
          <div className="h-px bg-(--border-color)" />
          <div className="py-4 space-y-3">
            {/* Header row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-amber-500" />
                <span className={`${rowLabel} text-amber-600`}>Polygone · {polyPoints.length} point{polyPoints.length > 1 ? 's' : ''}</span>
              </div>
              <button onClick={() => { setPolyPoints([]); setPolyMsg(null); }} className="text-[9px] text-(--text-muted) hover:text-red-500 transition-colors">
                Effacer tout
              </button>
            </div>

            {/* Layer name */}
            <input
              type="text" value={polyName} onChange={e => setPolyName(e.target.value)}
              placeholder="Nom de la couche…"
              className={`${inp} w-full`}
            />

            {/* Points list */}
            <div className="space-y-1">
              {polyPoints.map((pt, i) => (
                <div key={pt.id} className="flex items-center gap-2 group">
                  <span className="w-4 h-4 rounded-full bg-(--brand)/15 text-(--brand) text-[8px] font-black flex items-center justify-center shrink-0 font-mono">{i+1}</span>
                  <span className="text-[10px] font-mono text-(--text-muted) flex-1 truncate">
                    <span className={cn("font-bold mr-1", pt.mode === 'lambert' ? "text-orange-500" : "text-blue-500")}>
                      {pt.mode === 'lambert' ? 'L' : 'W'}
                    </span>
                    {pt.label}
                  </span>
                  <button onClick={() => removePoint(pt.id)} className="opacity-0 group-hover:opacity-100 text-(--text-muted) hover:text-red-500 transition-all p-px">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>

            {/* Feedback */}
            {polyMsg && (
              <p className={`text-[10px] font-medium ${polyMsg.type === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
                {polyMsg.text}
              </p>
            )}

            {/* Create button */}
            <button
              onClick={buildPolygon}
              disabled={!canBuild}
              className={cn(
                "w-full py-2 rounded-md font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all border",
                canBuild
                  ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-500 shadow-sm active:scale-95"
                  : "bg-(--bg-main) text-(--text-muted) border-(--border-color) cursor-not-allowed"
              )}
            >
              <Zap className="w-3.5 h-3.5" />
              {canBuild ? `Créer la couche (${polyPoints.length} pts)` : `Encore ${3 - polyPoints.length} pt${3 - polyPoints.length > 1 ? 's' : ''}`}
            </button>
          </div>
        </>
      )}

      <div className="h-px bg-(--border-color)" />

      {/* ── Centrer sur l'étendue ── */}
      <div className="pt-4">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('mapCenterExtent'))}
          className="w-full py-2 bg-(--bg-main) hover:bg-(--bg-surface) border border-(--border-color) text-(--brand) font-bold rounded-md text-[11px] flex items-center justify-center gap-2 transition-all"
        >
          <Target className="w-3.5 h-3.5" /> Centrer sur M'diq-Tétouan
        </button>
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Point-to-polygon + field extractor helpers (module-level for reuse)
// ─────────────────────────────────────────────────────────────────────────────
function ptsToPolygon(features: any[]) {
  if (features.length < 3) return turf.featureCollection(features);
  const coords = features.map((f: any) => [...f.geometry.coordinates]);
  if (coords[0][0] !== coords[coords.length-1][0] || coords[0][1] !== coords[coords.length-1][1]) coords.push([...coords[0]]);
  try { return turf.featureCollection([turf.polygon([coords])]); }
  catch { return turf.featureCollection(features); }
}

function extractPointFeatures(dataArray: any[]): any[] {
  const latKeys = ['lat', 'latitude', 'y', 'y_lambert', 'y lambert'];
  const lngKeys = ['lng', 'longitude', 'x', 'lon', 'x_lambert', 'x lambert'];
  const getVal = (row: any, keys: string[]) => {
    for (const k in row) { if (keys.includes(String(k).trim().toLowerCase())) return row[k]; }
    return undefined;
  };
  return dataArray.map((row: any) => {
    const rawLat = getVal(row, latKeys), rawLng = getVal(row, lngKeys);
    if (rawLat == null || rawLng == null) return null;
    let lat = parseFloat(String(rawLat).replace(',', '.')), lng = parseFloat(String(rawLng).replace(',', '.'));
    if (isNaN(lat) || isNaN(lng)) return null;
    if (Math.abs(lng) > 180 || Math.abs(lat) > 90) {
      try { const p = proj4('EPSG:26191','EPSG:4326',[lng,lat]); lng=p[0]; lat=p[1]; } catch {}
    }
    return turf.point([lng, lat], row);
  }).filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// CouchesTab — with Excel sheet selection, per-layer chevauchement
// ─────────────────────────────────────────────────────────────────────────────
function CouchesTab({
  customLayers, setCustomLayers, featureGroupRef, setIsPanelCollapsed,
  onLayerImported, onLayerDeleted, chevauchementResults,
}: {
  customLayers: any[]; setCustomLayers: any; featureGroupRef: any;
  setIsPanelCollapsed: any;
  onLayerImported?: (layerId: string, name: string, geojson: any) => void;
  onLayerDeleted?: (id: string) => void;
  chevauchementResults: Record<string, ChevauchementResult>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [excelSheetPending, setExcelSheetPending] = useState<{ wb: any; sheets: string[]; name: string } | null>(null);

  // Official layers
  const [officialVisible, setOfficialVisible] = useState<Record<string, boolean>>({ forest: true, communes: false, provinces: false, region: false });
  const officialRefs = useRef<Record<string, L.GeoJSON | null>>({});
  const [officialStyles, setOfficialStyles] = useState<Record<string, { fillColor: string; strokeColor: string; weight: number; fillOpacity: number }>>({
    forest:    { fillColor: '#16a34a', strokeColor: '#16a34a', weight: 2,   fillOpacity: 0.07 },
    communes:  { fillColor: '#3b82f6', strokeColor: '#3b82f6', weight: 1,   fillOpacity: 0.07 },
    provinces: { fillColor: '#f97316', strokeColor: '#f97316', weight: 2,   fillOpacity: 0.07 },
    region:    { fillColor: '#8b5cf6', strokeColor: '#8b5cf6', weight: 2.5, fillOpacity: 0.07 },
  });
  const [expandedSymbo, setExpandedSymbo] = useState<string | null>(null);

  const applyLayerStyle = (key: string, style: any) => {
    setOfficialStyles(p => ({ ...p, [key]: style }));
    const lyr = officialRefs.current[key];
    if (lyr) lyr.setStyle({ color: style.strokeColor, fillColor: style.strokeColor, weight: style.weight, fillOpacity: style.fillOpacity, opacity: 0.85 });
  };

  const OFFICIAL = [
    { key: 'forest',    label: 'DOMAINE FORESTIER', file: '/assets/data/forest_limits.json',  color: '#16a34a', weight: 2,   tooltip: (p: any) => `🌲 ${p.FORET||''} — ${p.CANTON||''}\n${p.STADE||''} · ${p.SUPERFICIE ? Math.round(p.SUPERFICIE)+' ha' : ''}` },
    { key: 'communes',  label: 'Communes TTH',      file: '/assets/data/Communes_TTH.json',   color: '#3b82f6', weight: 1,   tooltip: (p: any) => `🏘 ${p.NomFr||''}\n${p.NomAr||''}${p.Pop__24 ? '\nPop: '+Number(p.Pop__24).toLocaleString() : ''}` },
    { key: 'provinces', label: 'Provinces TTH',     file: '/assets/data/Provinces_TTH.json',  color: '#f97316', weight: 2,   tooltip: (p: any) => `🏛 ${p.Nom__Fr||''}\n${p.Nom__Ar||''}${p.Pop__24 ? '\nPop: '+Number(p.Pop__24).toLocaleString() : ''}` },
    { key: 'region',    label: 'Région TTH',        file: '/assets/data/Region_TTH.json',     color: '#8b5cf6', weight: 2.5, tooltip: (p: any) => `🗺 ${p.Nom__fr||''}\n${p.Nom__ar||''}` },
  ];

  const toggleOfficial = async (key: string, file: string, color: string, weight: number, tooltip: (p: any) => string) => {
    const fg = featureGroupRef.current;
    if (!fg) return;
    if (officialVisible[key]) {
      const ref = officialRefs.current[key];
      if (ref) { fg.removeLayer(ref); officialRefs.current[key] = null; }
      setOfficialVisible(p => ({ ...p, [key]: false }));
      return;
    }
    try {
      const res = await fetch(file);
      const geojson = await res.json();
      const style = officialStyles[key];
      const layer = L.geoJSON(geojson, {
        style: { color: style.strokeColor, weight, fillColor: style.strokeColor, fillOpacity: style.fillOpacity, opacity: 0.85 },
        onEachFeature: (feature, lyr) => {
          lyr.bindTooltip(tooltip(feature.properties || {}), { sticky: true });
          lyr.on('mouseover', function () { (lyr as L.Path).setStyle({ fillOpacity: 0.22, weight: weight + 1 }); });
          lyr.on('mouseout',  function () { (lyr as L.Path).setStyle({ fillOpacity: style.fillOpacity, weight }); });
        },
      });
      fg.addLayer(layer);
      officialRefs.current[key] = layer;
      _officialGeoData[key] = geojson;
      setOfficialVisible(p => ({ ...p, [key]: true }));
    } catch (err) { console.error('[OfficialLayer]', key, err); }
  };

  // ── addGeoLayer: central function for adding any imported layer ────────────
  const addGeoLayer = (geojson: any, fileName: string, opts: { noPoints?: boolean } = {}) => {
    const id = `imported-${Date.now()}`;
    const color = '#38bdf8';
    const layerName = fileName.replace(/\.[^/.]+$/, '');

    const buildPopup = (feature: any, name: string) => {
      let html = `<div style="max-height:250px;overflow-y:auto"><b style="font-size:13px;display:block;margin-bottom:6px;border-bottom:1px solid #eee;padding-bottom:4px">📂 ${name}</b>`;
      const g = feature.geometry;
      if (g?.type === 'Polygon' || g?.type === 'MultiPolygon') {
        const area = turf.area(feature);
        html += `<span style="font-size:10px;color:#666">Polygone</span><br/>`;
        html += area < 10000 ? `<b>Surface:</b> ${area.toFixed(2)} m²<br/>` : `<b>Surface:</b> ${(area/10000).toFixed(2)} Ha<br/>`;
        html += `<b>Périmètre:</b> ${turf.length(feature,{units:'kilometers'}).toFixed(3)} km<br/>`;
      } else if (g?.type === 'LineString' || g?.type === 'MultiLineString') {
        html += `<b>Longueur:</b> ${turf.length(feature,{units:'kilometers'}).toFixed(3)} km<br/>`;
      } else if (g?.type === 'Point') {
        const [lng, lat] = g.coordinates;
        html += `<b>Lon:</b> ${lng.toFixed(6)}<br/><b>Lat:</b> ${lat.toFixed(6)}<br/>`;
      }
      if (feature.properties && Object.keys(feature.properties).length > 0) {
        html += `<hr style="margin:6px 0;border:0;border-top:1px solid #eee"/>`;
        html += `<table style="width:100%;border-collapse:collapse;font-size:11px">`;
        for (const k in feature.properties) {
          if (feature.properties[k] != null && feature.properties[k] !== '') {
            html += `<tr><td style="padding:2px 4px;border:1px solid #eee;font-weight:600;background:#f9f9f9;white-space:nowrap">${k}</td><td style="padding:2px 4px;border:1px solid #eee">${feature.properties[k]}</td></tr>`;
          }
        }
        html += `</table>`;
      }
      html += `</div>`;
      return html;
    };

    const leafletLayer = L.geoJSON(geojson, {
      style: { color, weight: 2, opacity: 0.9, fillOpacity: 0.32 },
      ...(opts.noPoints ? {} : {
        pointToLayer: (feature, latlng) => L.circleMarker(latlng, { radius: 6, fillColor: color, color, weight: 1.5, opacity: 1, fillOpacity: 0.8 }),
      }),
      onEachFeature: (feature, llayer) => {
        llayer.bindPopup(buildPopup(feature, layerName));
      },
    });

    if (featureGroupRef.current) {
      featureGroupRef.current.addLayer(leafletLayer);
      try {
        const bounds = leafletLayer.getBounds();
        if (bounds?.isValid()) window.dispatchEvent(new CustomEvent('flyToBounds', { detail: bounds }));
      } catch {}
    }

    setCustomLayers((prev: any) => [...prev, {
      id, name: layerName, type: 'imported', visible: true, color, opacity: 0.9, geojson, leafletLayer,
    }]);
    onLayerImported?.(id, layerName, geojson);
  };

  // ── processExcelData: convert rows to features/polygon ────────────────────
  const processExcelData = (data: any[], fileName: string) => {
    const features = extractPointFeatures(data);
    if (features.length === 0) { alert("Coordonnées non trouvées.\nNommez les colonnes X/Y ou lat/lng."); return; }
    const allPoints = features.every((f: any) => f.geometry.type === 'Point');
    if (allPoints && features.length >= 3) {
      addGeoLayer(ptsToPolygon(features), fileName, { noPoints: true });
    } else {
      addGeoLayer(turf.featureCollection(features), fileName);
    }
  };

  // ── handleImport ──────────────────────────────────────────────────────────
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    try {
      if (ext === 'json' || ext === 'geojson') {
        addGeoLayer(JSON.parse(await file.text()), file.name);
      } else if (ext === 'kml') {
        const doc = new DOMParser().parseFromString(await file.text(), 'text/xml');
        addGeoLayer(kml(doc), file.name);
      } else if (ext === 'zip') {
        addGeoLayer(await shp(await file.arrayBuffer()), file.name);
      } else if (ext === 'csv') {
        Papa.parse(file, {
          header: true, skipEmptyLines: true,
          complete: (results) => processExcelData(results.data as any[], file.name),
        });
      } else if (ext === 'xlsx' || ext === 'xls') {
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const wb = XLSX.read(new Uint8Array(ev.target?.result as ArrayBuffer), { type: 'array' });
            const sheets = wb.SheetNames;
            if (sheets.length === 1) {
              processExcelData(XLSX.utils.sheet_to_json(wb.Sheets[sheets[0]]) as any[], file.name);
            } else {
              setExcelSheetPending({ wb, sheets, name: file.name });
            }
          } catch (err) { console.error(err); alert("Erreur de lecture du fichier Excel."); }
        };
        reader.readAsArrayBuffer(file);
      } else {
        alert("Format non supporté.\nAcceptés: .geojson .kml .csv .xlsx .zip (SHP)");
      }
    } catch (err) {
      console.error("Import error:", err);
      alert("Erreur lors de l'import du fichier.");
    }
    e.target.value = '';
  };

  // ── Layer ops ─────────────────────────────────────────────────────────────
  const toggleLayer = (id: string) => {
    setCustomLayers((prev: any) => prev.map((l: any) => {
      if (l.id === id) {
        const newVisible = !l.visible;
        if (l.leafletLayer && featureGroupRef.current) {
          if (newVisible) featureGroupRef.current.addLayer(l.leafletLayer);
          else featureGroupRef.current.removeLayer(l.leafletLayer);
        }
        return { ...l, visible: newVisible };
      }
      return l;
    }));
  };

  const deleteLayer = (id: string) => {
    setCustomLayers((prev: any) => {
      const layer = prev.find((l: any) => l.id === id);
      if (layer?.leafletLayer) {
        if (featureGroupRef.current?.hasLayer(layer.leafletLayer)) featureGroupRef.current.removeLayer(layer.leafletLayer);
        else layer.leafletLayer.remove?.();
      }
      return prev.filter((l: any) => l.id !== id);
    });
    onLayerDeleted?.(id);
  };

  const updateLeafletStyle = (layerState: any) => {
    if (!layerState.leafletLayer) return;
    const weight = layerState.size ? layerState.size / 2 : 2;
    const color = layerState.color || '#38bdf8';
    const opacity = layerState.opacity ?? 1;
    const fillOpacity = layerState.fillMode === 'outline' ? 0 : opacity * 0.35;
    if (layerState.leafletLayer.eachLayer) {
      layerState.leafletLayer.eachLayer((child: any) => {
        if (child.setStyle && !child.setRadius) child.setStyle({ color, opacity, weight, fillColor: color, fillOpacity });
        if (child.setRadius) {
          child.setRadius(layerState.size ?? 6);
          child.setStyle({ color, opacity, weight: 1.5, fillColor: color, fillOpacity: fillOpacity > 0 ? opacity : 0 });
        }
      });
    }
  };

  const changeColor   = (id: string, color: string)   => setCustomLayers((prev: any) => prev.map((l: any) => { if (l.id===id) { const n={...l,color}; updateLeafletStyle(n); return n; } return l; }));
  const changeOpacity = (id: string, opacity: number) => setCustomLayers((prev: any) => prev.map((l: any) => { if (l.id===id) { const n={...l,opacity}; updateLeafletStyle(n); return n; } return l; }));
  const changeSize    = (id: string, size: number)    => setCustomLayers((prev: any) => prev.map((l: any) => { if (l.id===id) { const n={...l,size}; updateLeafletStyle(n); return n; } return l; }));
  const changeFillMode = (id: string, mode: string)   => setCustomLayers((prev: any) => prev.map((l: any) => { if (l.id===id) { const n={...l,fillMode:mode}; updateLeafletStyle(n); return n; } return l; }));

  const renameLayer = (id: string, name: string) => setCustomLayers((prev: any) => prev.map((l: any) => l.id === id ? { ...l, name } : l));

  const changeSymbol = (id: string, symbol: string) => {
    setCustomLayers((prev: any) => {
      const newLayers = [...prev];
      const idx = newLayers.findIndex((l: any) => l.id === id);
      if (idx === -1) return prev;
      const l = newLayers[idx];
      const updated = { ...l, symbol };
      if (l.leafletLayer && featureGroupRef.current && l.geojson) {
        featureGroupRef.current.removeLayer(l.leafletLayer);
        const color = updated.color || '#38bdf8', opacity = updated.opacity ?? 1, radius = updated.size ?? 6;
        const fillOpacity = updated.fillMode === 'outline' ? 0 : opacity * 0.35;
        const weight = updated.size ? updated.size / 2 : 2;
        const newLeafletLayer = L.geoJSON(l.geojson, {
          style: { color, opacity, weight, fillColor: color, fillOpacity },
          pointToLayer: (feature, latlng) => {
            if (symbol === 'square') return L.marker(latlng, { icon: L.divIcon({ className: '', html: `<div style="width:${radius*2}px;height:${radius*2}px;background:${fillOpacity>0?color:'transparent'};border:${weight}px solid ${color};opacity:${opacity}"></div>`, iconSize: [radius*2, radius*2], iconAnchor: [radius, radius] }) });
            if (symbol === 'triangle') return L.marker(latlng, { icon: L.divIcon({ className: '', html: `<div style="width:0;height:0;border-left:${radius}px solid transparent;border-right:${radius}px solid transparent;border-bottom:${radius*2}px solid ${fillOpacity>0?color:'transparent'};opacity:${opacity}"></div>`, iconSize: [radius*2, radius*2], iconAnchor: [radius, radius] }) });
            return L.circleMarker(latlng, { radius, fillColor: color, color, weight: 1.5, opacity, fillOpacity: fillOpacity > 0 ? opacity : 0 });
          },
        });
        featureGroupRef.current.addLayer(newLeafletLayer);
        updated.leafletLayer = newLeafletLayer;
      }
      newLayers[idx] = updated;
      return newLayers;
    });
  };

  const zoomToLayer = (id: string) => {
    const layer = customLayers.find((l: any) => l.id === id);
    if (!layer) return;
    let bounds: L.LatLngBounds | null = null;
    if (layer.leafletLayer?.getBounds) try { bounds = layer.leafletLayer.getBounds(); } catch {}
    else if (layer.leafletLayer?.getLatLng) { const ll = layer.leafletLayer.getLatLng(); bounds = L.latLngBounds(ll, ll); }
    if (!bounds && layer.geojson) try { const b = turf.bbox(layer.geojson); bounds = L.latLngBounds(L.latLng(b[1],b[0]), L.latLng(b[3],b[2])); } catch {}
    if (!bounds && layer.areaCoords) try { bounds = L.latLngBounds(layer.areaCoords); } catch {}
    if (bounds?.isValid()) window.dispatchEvent(new CustomEvent('flyToBounds', { detail: bounds }));
  };

  // Auto-load forest on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!officialRefs.current['forest']) {
        const fg = featureGroupRef.current;
        if (!fg) return;
        fetch('/assets/data/forest_limits.json')
          .then(r => r.json())
          .then(geojson => {
            const style = officialStyles['forest'];
            const layer = L.geoJSON(geojson, {
              style: { color: style.strokeColor, weight: 2, fillColor: style.strokeColor, fillOpacity: 0.07, opacity: 0.85 },
              onEachFeature: (feature, lyr) => {
                const p = feature.properties || {};
                lyr.bindTooltip(`🌲 ${p.FORET||''} — ${p.CANTON||''}${p.SUPERFICIE ? '\n'+Math.round(p.SUPERFICIE)+' ha' : ''}`, { sticky: true });
                lyr.on('mouseover', function () { (lyr as L.Path).setStyle({ fillOpacity: 0.22, weight: 3 }); });
                lyr.on('mouseout',  function () { (lyr as L.Path).setStyle({ fillOpacity: 0.07, weight: 2 }); });
              },
            });
            fg.addLayer(layer);
            officialRefs.current['forest'] = layer;
            _officialGeoData['forest'] = geojson;
            setOfficialVisible(p => ({ ...p, forest: true }));
          })
          .catch(err => console.warn('[ForestAutoLoad]', err));
      }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      {/* Excel sheet selector modal */}
      {excelSheetPending && (
        <ExcelSheetModal
          sheets={excelSheetPending.sheets}
          fileName={excelSheetPending.name}
          onSelect={(sheet) => {
            processExcelData(XLSX.utils.sheet_to_json(excelSheetPending.wb.Sheets[sheet]) as any[], excelSheetPending.name);
            setExcelSheetPending(null);
          }}
          onClose={() => setExcelSheetPending(null)}
        />
      )}

      {/* Official layers */}
      <div className="mb-4">
        <h3 className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider mb-2.5 px-1 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
          Couches Officielles TTH
        </h3>
        <div className="space-y-1.5">
          {OFFICIAL.map(({ key, label, file, color, weight, tooltip }) => {
            const style = officialStyles[key];
            const isExpanded = expandedSymbo === key;
            const isOn = officialVisible[key];
            return (
              <div key={key} className="rounded-lg border overflow-hidden transition-all"
                style={isOn ? { borderColor: color, boxShadow: `0 0 0 1px ${color}20` } : { borderColor: 'var(--border-color)' }}>
                <div className="flex items-center gap-2 px-2.5 py-2 bg-(--bg-main)">
                  {/* Clickable row: checkbox + name = toggle */}
                  <button
                    onClick={() => toggleOfficial(key, file, color, weight, tooltip)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left group"
                  >
                    <span
                      className="w-4 h-4 rounded shrink-0 border-2 transition-all flex items-center justify-center group-hover:scale-110"
                      style={{ backgroundColor: isOn ? style.strokeColor + '40' : 'transparent', borderColor: style.strokeColor }}
                    >
                      {isOn && <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: style.strokeColor }} />}
                    </span>
                    <span className={`text-xs font-medium truncate transition-colors ${isOn ? 'text-(--text-main)' : 'text-(--text-muted) group-hover:text-(--text-main)'}`}>
                      {label}
                    </span>
                  </button>
                  {isOn && (
                    <button onClick={() => setExpandedSymbo(isExpanded ? null : key)}
                      className="p-1 rounded hover:bg-(--bg-surface) text-(--text-muted) hover:text-(--brand)">
                      <Palette className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => toggleOfficial(key, file, color, weight, tooltip)}
                    className="text-[8px] font-bold px-1.5 py-0.5 rounded transition-all"
                    style={{ backgroundColor: isOn ? style.strokeColor : 'var(--border-color)', color: isOn ? '#fff' : 'var(--text-muted)' }}
                  >
                    {isOn ? 'ON' : 'OFF'}
                  </button>
                </div>
                {isExpanded && isOn && (
                  <div className="px-3 py-2.5 bg-(--bg-surface) border-t border-(--border-color) space-y-2.5">
                    <p className="text-[9px] font-bold text-(--brand) uppercase tracking-wider">Symbologie</p>
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[10px] text-(--text-muted) w-20 shrink-0">Contour</label>
                      <input type="color" value={style.strokeColor} onChange={(e) => applyLayerStyle(key, {...style, strokeColor: e.target.value})} className="w-8 h-6 rounded border border-(--border-color) cursor-pointer p-0" />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-(--text-muted) w-20 shrink-0">Épaisseur</label>
                      <input type="range" min={1} max={6} step={0.5} value={style.weight} onChange={(e) => applyLayerStyle(key, {...style, weight: Number(e.target.value)})} className="flex-1 accent-(--brand)" />
                      <span className="text-[10px] font-mono text-(--brand) w-6 text-right">{style.weight}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-(--text-muted) w-20 shrink-0">Transparence</label>
                      <input type="range" min={0} max={0.5} step={0.01} value={style.fillOpacity} onChange={(e) => applyLayerStyle(key, {...style, fillOpacity: Number(e.target.value)})} className="flex-1 accent-(--brand)" />
                      <span className="text-[10px] font-mono text-(--brand) w-8 text-right">{Math.round(style.fillOpacity*100)}%</span>
                    </div>
                    <button onClick={() => applyLayerStyle(key, { fillColor: color+'30', strokeColor: color, weight, fillOpacity: 0.07 })}
                      className="w-full py-1 text-[9px] font-semibold text-(--text-muted) hover:text-(--brand) border border-(--border-color) hover:border-(--brand) rounded">
                      Réinitialiser
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="h-px bg-(--border-color) mt-3 mb-1 opacity-50" />
      </div>

      {/* Import header */}
      <div className="flex justify-between items-center px-1 pb-3 border-b border-(--border-color)">
        <h2 className="text-(--brand) flex items-center gap-2 font-semibold text-sm tracking-wide">
          Couches importées
          <span className="text-[10px] bg-(--bg-surface) px-2 py-0.5 rounded-full text-(--text-main) font-mono border border-(--border-color)">
            {customLayers.length}
          </span>
        </h2>
        <button onClick={() => fileInputRef.current?.click()}
          className="text-[11px] flex items-center gap-1.5 bg-(--brand) hover:opacity-90 text-white px-3 py-1.5 rounded-lg font-semibold shadow-sm">
          <Upload size={14} /> Importer
        </button>
        <input type="file" ref={fileInputRef} onChange={handleImport}
          accept=".json,.geojson,.kml,.csv,.xlsx,.xls,.zip"
          className="hidden" />
      </div>

      {/* Custom layers list */}
      <div className="space-y-2 max-h-105 overflow-y-auto pr-0.5 select-none">
        {customLayers.length === 0 && (
          <div className="text-center py-10 text-(--text-muted) border border-dashed border-(--border-color) rounded-xl bg-(--bg-main)">
            <Layers className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p className="text-xs font-semibold">Aucune couche importée</p>
            <p className="text-[10px] mt-1 opacity-70">GeoJSON · CSV · KML · SHP · XLSX</p>
          </div>
        )}
        {customLayers.map((layer: any) => (
          <LayerItem
            key={layer.id}
            layer={layer}
            chevauchementResult={chevauchementResults[layer.id]}
            onToggle={() => toggleLayer(layer.id)}
            onDelete={() => deleteLayer(layer.id)}
            onChangeColor={(c: string) => changeColor(layer.id, c)}
            onChangeOpacity={(o: number) => changeOpacity(layer.id, o)}
            onChangeSize={(s: number) => changeSize(layer.id, s)}
            onChangeFillMode={(m: string) => changeFillMode(layer.id, m)}
            onChangeSymbol={(s: string) => changeSymbol(layer.id, s)}
            onZoom={() => zoomToLayer(layer.id)}
            onRename={(name: string) => renameLayer(layer.id, name)}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GeotoolsTab (unchanged from original)
// ─────────────────────────────────────────────────────────────────────────────
function GeotoolsTab({ customLayers, setCustomLayers, featureGroupRef }: any) {
  const [tool, setTool] = useState<string>('points_to_polygon');
  const [layer1, setLayer1] = useState<string>('');
  const [layer2, setLayer2] = useState<string>('');
  const [radius, setRadius] = useState<number>(50);

  const getGeojson = (l: any) => {
    if (l.geojson) return l.geojson;
    if (l.leafletLayer?.toGeoJSON) return l.leafletLayer.toGeoJSON();
    if (l.type === 'static_polygon' && l.areaCoords) {
      const coords = [...l.areaCoords];
      if (coords[0][0] !== coords[coords.length-1][0] || coords[0][1] !== coords[coords.length-1][1]) coords.push([...coords[0]]);
      return turf.polygon([coords.map((c: any) => [c[1], c[0]])]);
    }
    return null;
  };

  const executeTool = () => {
    const l1 = customLayers.find((l: any) => l.id === layer1);
    if (!l1) return alert("Sélectionnez la couche principale");
    try {
      const g1 = getGeojson(l1);
      let resultGeojson: any;

      if (tool === 'calculate_geometry') {
        const area = turf.area(g1), length = turf.length(g1, { units: 'kilometers' });
        alert(`📐 Attributs géométriques — ${l1.name}\n\nSurface: ${(area/10000).toFixed(4)} Ha (${area.toFixed(2)} m²)\nPérimètre: ${length.toFixed(4)} km`);
        return;
      } else if (tool === 'check_geometry') {
        try {
          const kinks = turf.kinks(g1 as any);
          if (kinks.features.length > 0) { resultGeojson = kinks; alert(`⚠️ Géométrie invalide: ${kinks.features.length} auto-intersection(s) détectée(s).`); }
          else { alert('✅ Géométrie valide — aucune auto-intersection.'); return; }
        } catch { alert('Impossible de vérifier la géométrie.'); return; }
      } else if (tool === 'explode') {
        resultGeojson = turf.explode(g1);
      } else if (tool === 'export_excel') {
        const features = g1.type === 'FeatureCollection' ? g1.features : [g1];
        const data = features.map((f: any) => ({
          Couche: l1.name, Type: f.geometry.type,
          Coordonnees: f.geometry.type === 'Point' ? f.geometry.coordinates.join(', ') : `${f.geometry.type} (${f.geometry.coordinates?.[0]?.length || '?'} pts)`,
          ...f.properties
        }));
        const ws = XLSX.utils.json_to_sheet(data), wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Données");
        const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([buf], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${l1.name}_export.xlsx`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert("✅ Fichier Excel téléchargé."); return;
      } else if (tool === 'reproject_lambert') {
        const transformed = structuredClone(g1);
        turf.coordEach(transformed, (c) => { const p = proj4('EPSG:4326','EPSG:26191',c); c[0]=p[0]; c[1]=p[1]; });
        const blob = new Blob([JSON.stringify(transformed, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${l1.name}_lambert.geojson`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        alert("✅ Fichier Lambert Nord téléchargé."); return;
      } else if (tool === 'reproject_wgs84') {
        resultGeojson = structuredClone(g1);
        turf.coordEach(resultGeojson, (c) => { const p = proj4('EPSG:26191','EPSG:4326',c); c[0]=p[0]; c[1]=p[1]; });
      } else if (tool === 'buffer') {
        resultGeojson = turf.buffer(g1, radius, { units: 'meters' });
      } else if (tool === 'envelope') {
        resultGeojson = turf.envelope(g1);
      } else if (tool === 'points_to_polygon') {
        if (g1.type === 'FeatureCollection') {
          const coords = g1.features.map((f: any) => f.geometry.coordinates);
          if (coords.length > 2) {
            if (coords[0][0] !== coords[coords.length-1][0] || coords[0][1] !== coords[coords.length-1][1]) coords.push([...coords[0]]);
            resultGeojson = turf.polygon([coords]);
          } else return alert("Minimum 3 points requis.");
        } else return alert("La couche doit contenir des points.");
      } else if (tool === 'polygon_to_line') {
        resultGeojson = turf.polygonToLine(g1);
      } else if (tool === 'intersect') {
        const l2 = customLayers.find((l: any) => l.id === layer2);
        if (!l2) return alert("Sélectionnez la couche secondaire");
        const g2 = getGeojson(l2);
        const m1 = g1.type==='FeatureCollection' ? turf.union(g1) : g1;
        const m2 = g2.type==='FeatureCollection' ? turf.union(g2) : g2;
        if (!m1 || !m2) return alert("Polygones valides requis.");
        resultGeojson = turf.intersect(turf.featureCollection([m1, m2]));
        if (!resultGeojson) return alert("Aucune intersection trouvée.");
      } else if (tool === 'union') {
        const l2 = customLayers.find((l: any) => l.id === layer2);
        if (!l2) return alert("Sélectionnez la couche secondaire");
        const g2 = getGeojson(l2);
        const m1 = g1.type==='FeatureCollection' ? turf.union(g1) : g1;
        const m2 = g2.type==='FeatureCollection' ? turf.union(g2) : g2;
        if (!m1 || !m2) return alert("Polygones valides requis.");
        resultGeojson = turf.union(turf.featureCollection([m1, m2]));
      }

      if (resultGeojson) {
        const id = `geotool-${Date.now()}`, color = '#eab308', opacity = 0.8;
        const layer = L.geoJSON(resultGeojson, {
          style: { color, weight: 2, opacity, fillOpacity: opacity * 0.4 },
          pointToLayer: (_f, latlng) => L.circleMarker(latlng, { radius: 6, fillColor: color, color, weight: 1, opacity: 1, fillOpacity: 0.8 }),
        });
        if (featureGroupRef?.current) featureGroupRef.current.addLayer(layer);
        setCustomLayers((prev: any) => [...prev, { id, name: `Résultat: ${tool}`, type: 'imported', visible: true, color, opacity, geojson: resultGeojson, leafletLayer: layer }]);
        alert("✅ Opération réussie — couche ajoutée.");
      }
    } catch (e) {
      console.error(e);
      alert("Erreur lors du traitement. Vérifiez que les géométries sont valides.");
    }
  };

  const sel = "w-full bg-(--bg-main) border border-(--border-color) text-(--text-main) rounded-lg p-2 text-sm focus:outline-none focus:border-(--brand)";
  return (
    <div className="space-y-4">
      <h2 className="text-(--text-main) font-semibold text-base tracking-tight px-1">Géotraitement</h2>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-(--text-muted) uppercase tracking-wider mb-1.5 block">Outil</label>
          <select value={tool} onChange={e => setTool(e.target.value)} className={sel}>
            <optgroup label="Informations & Attributs">
              <option value="calculate_geometry">Calculer la Géométrie (Surface / Périmètre)</option>
              <option value="export_excel">Exporter vers Excel (.xlsx)</option>
              <option value="check_geometry">Vérifier la Géométrie (Auto-intersections)</option>
            </optgroup>
            <optgroup label="Topologie & Géotraitement">
              <option value="buffer">Zone tampon (Buffer)</option>
              <option value="intersect">Intersection</option>
              <option value="union">Union</option>
            </optgroup>
            <optgroup label="Conversion & Géométrie">
              <option value="explode">Extraire les Sommets</option>
              <option value="points_to_polygon">Points → Polygone</option>
              <option value="polygon_to_line">Polygone → Ligne</option>
              <option value="envelope">Enveloppe (Bounding Box)</option>
            </optgroup>
            <optgroup label="Reprojection">
              <option value="reproject_lambert">Reprojeter → Lambert Nord (Export)</option>
              <option value="reproject_wgs84">Reprojeter → WGS84</option>
            </optgroup>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-(--text-muted) uppercase tracking-wider mb-1.5 block">Couche principale</label>
          <select value={layer1} onChange={e => setLayer1(e.target.value)} className={sel}>
            <option value="">Sélectionner une couche…</option>
            {customLayers.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        {(tool === 'intersect' || tool === 'union') && (
          <div>
            <label className="text-xs font-semibold text-(--text-muted) uppercase tracking-wider mb-1.5 block">Couche secondaire</label>
            <select value={layer2} onChange={e => setLayer2(e.target.value)} className={sel}>
              <option value="">Sélectionner une couche…</option>
              {customLayers.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}
        {tool === 'buffer' && (
          <div>
            <label className="text-xs font-semibold text-(--text-muted) uppercase tracking-wider mb-1.5 block">Distance (mètres)</label>
            <input type="number" value={radius} onChange={e => setRadius(Number(e.target.value))} min={1} className="w-full bg-(--bg-main) border border-(--border-color) text-(--text-main) rounded-lg p-2 text-sm focus:outline-none focus:border-(--brand)" />
          </div>
        )}
        <button onClick={executeTool} className="w-full mt-4 bg-(--brand) hover:opacity-90 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2">
          <Combine className="w-4 h-4" /> Exécuter
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LayerItem — REDESIGNED: professional minimalist with per-layer chevauchement
// ─────────────────────────────────────────────────────────────────────────────
const PRESET_COLORS = ["#22c55e","#38bdf8","#eab308","#ef4444","#a855f7","#ec4899","#f97316","#06b6d4","#84cc16","#f43f5e"];

function LayerItem({ layer, chevauchementResult, onToggle, onDelete, onChangeColor, onChangeOpacity, onChangeSize, onChangeFillMode, onChangeSymbol, onZoom, onRename }: {
  layer: any;
  chevauchementResult?: ChevauchementResult;
  onToggle: () => void; onDelete: () => void;
  onChangeColor: (c: string) => void; onChangeOpacity: (o: number) => void;
  onChangeSize: (s: number) => void; onChangeFillMode: (m: string) => void;
  onChangeSymbol: (s: string) => void; onZoom: () => void;
  onRename?: (name: string) => void;
}) {
  const [showStyle, setShowStyle] = useState(false);
  const [showChev, setShowChev] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showChevModal, setShowChevModal] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(layer.name);
  const renameInputRef = React.useRef<HTMLInputElement>(null);

  const commitRename = () => {
    const trimmed = renameVal.trim();
    if (trimmed && trimmed !== layer.name) onRename?.(trimmed);
    setIsRenaming(false);
  };

  // Auto-open chevauchement panel when result first arrives
  const prevResultRef = React.useRef<ChevauchementResult | undefined>(undefined);
  useEffect(() => {
    if (chevauchementResult && !prevResultRef.current) {
      setShowChev(true);
    }
    prevResultRef.current = chevauchementResult;
  }, [chevauchementResult]);

  const hasPoints   = layer.geojson && JSON.stringify(layer.geojson).includes('"Point"');
  const hasPolygons = layer.geojson && (JSON.stringify(layer.geojson).includes('"Polygon"') || JSON.stringify(layer.geojson).includes('"MultiPolygon"'));
  const showFillMode = hasPolygons || layer.type === 'static_polygon' || layer.type === 'drawn';

  // Chevauchement badge config
  const chevPos = chevauchementResult?.globalPosition;
  const chevColor = chevPos === 'داخل الملك الغابوي' ? '#ef4444'
    : chevPos === 'جزئيا داخل الملك الغابوي' ? '#f97316'
    : chevPos ? '#22c55e' : null;

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden transition-all group/layer",
      layer.visible
        ? "bg-(--bg-main) border-(--border-color)"
        : "bg-transparent border-(--border-color)/40 opacity-55 hover:opacity-80",
    )}>
      {/* ─ Main row ─ */}
      <div className="flex items-center gap-2 px-2.5 py-2 min-h-11">
        {/* Color swatch → opens picker */}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowColorPicker(!showColorPicker)}
            title="Changer la couleur"
            className="w-4 h-4 rounded border border-black/10 hover:scale-110 transition-transform focus:outline-none"
            style={{
              backgroundColor: layer.visible ? layer.color : '#9ca3af',
              borderRadius: layer.symbol === 'circle' ? '50%' : layer.symbol === 'triangle' ? '2px' : '3px',
            }}
          />
          {showColorPicker && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowColorPicker(false)} />
              <div className="absolute left-0 top-6 z-50 bg-(--bg-surface) border border-(--border-color) rounded-xl p-2.5 shadow-2xl">
                <div className="grid grid-cols-5 gap-1.5">
                  {PRESET_COLORS.map(c => (
                    <button key={c} onClick={() => { onChangeColor(c); setShowColorPicker(false); }}
                      className={cn("w-5 h-5 rounded-full border-2 hover:scale-110 transition-transform", layer.color === c ? "border-(--text-main) shadow-sm" : "border-transparent")}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Name + type */}
        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <input
              ref={renameInputRef}
              type="text"
              value={renameVal}
              onChange={e => setRenameVal(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setIsRenaming(false); }}
              className="w-full text-[12px] font-semibold bg-(--bg-surface) border border-(--brand) rounded px-1.5 py-0.5 outline-none text-(--text-main)"
              autoFocus
            />
          ) : (
            <p
              className={cn("text-[12px] font-semibold leading-tight truncate cursor-text", layer.visible ? "text-(--text-main)" : "text-(--text-muted)")}
              onDoubleClick={() => { if (onRename) { setRenameVal(layer.name); setIsRenaming(true); } }}
              title={onRename ? "Double-clic pour renommer" : layer.name}
            >
              {layer.name}
            </p>
          )}
          <p className="text-[9px] text-(--text-muted) uppercase tracking-wide font-medium">
            {layer.type === 'static_polygon' ? 'référence' : layer.type === 'drawn' ? 'dessin' : 'import'}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center shrink-0">
          {/* Zoom — hover reveal */}
          <button onClick={onZoom} title="Centrer la vue"
            className="p-1.5 text-(--text-muted) hover:text-(--text-main) hover:bg-(--bg-surface) rounded-md opacity-0 group-hover/layer:opacity-100 transition-all">
            <Maximize className="w-3.5 h-3.5" />
          </button>
          {/* Rename — hover reveal */}
          {onRename && (
            <button onClick={() => { setRenameVal(layer.name); setIsRenaming(true); }} title="Renommer la couche"
              className="p-1.5 text-(--text-muted) hover:text-(--text-main) hover:bg-(--bg-surface) rounded-md opacity-0 group-hover/layer:opacity-100 transition-all">
              <FileText className="w-3.5 h-3.5" />
            </button>
          )}
          {/* Visibility */}
          <button onClick={onToggle} title={layer.visible ? "Masquer" : "Afficher"}
            className={cn("p-1.5 rounded-md transition-colors",
              layer.visible ? "text-(--brand) hover:bg-(--brand)/10" : "text-(--text-muted) hover:bg-(--bg-surface)")}>
            {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>
          {/* Settings */}
          <button onClick={() => setShowStyle(!showStyle)} title="Paramètres de couche"
            className={cn("p-1.5 rounded-md transition-colors",
              showStyle
                ? "bg-(--bg-surface) text-(--brand) border border-(--border-color)"
                : "text-(--text-muted) hover:bg-(--bg-surface) opacity-0 group-hover/layer:opacity-100")}>
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ─ Chevauchement section header (always visible when result exists) ─ */}
      {chevauchementResult && chevColor && (
        <div
          className="flex items-center gap-2 px-2.5 py-1.5 border-t cursor-pointer select-none group/chev"
          style={{ borderColor: chevColor + '44', backgroundColor: chevColor + '0a' }}
          onClick={() => setShowChev(!showChev)}
          role="button"
          title={showChev ? "Réduire l'analyse" : "Développer l'analyse"}
        >
          <div className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: chevColor }} />
          <span className="text-[9px] font-black tracking-wide uppercase flex-1" style={{ color: chevColor }}>
            Chevauchement · {chevauchementResult.totalPercentage.toFixed(1)}%
          </span>
          <span className="text-[9px] font-bold shrink-0" style={{ color: chevColor }}>
            {showChev ? '↑ réduire' : '↓ voir'}
          </span>
          <div className="w-5 h-5 rounded-md flex items-center justify-center border transition-all group-hover/chev:opacity-100"
            style={{ borderColor: chevColor + '55', backgroundColor: chevColor + '15', color: chevColor }}>
            {showChev
              ? <ChevronUp className="w-3 h-3" />
              : <ChevronDown className="w-3 h-3" />
            }
          </div>
        </div>
      )}

      {/* ─ Chevauchement panel body ─ */}
      {showChev && chevauchementResult && (
        <div className="px-2.5 pb-2.5 pt-0">
          <div className="pt-2">
            <ChevauchementLayerPanel
              result={chevauchementResult}
              layerName={layer.name}
              onOpenReport={() => setShowChevModal(true)}
            />
          </div>
        </div>
      )}

      {/* ─ Chevauchement full-report modal ─ */}
      {showChevModal && chevauchementResult && (
        <ChevauchementModal
          onClose={() => setShowChevModal(false)}
          result={chevauchementResult}
        />
      )}

      {/* ─ Style panel ─ */}
      {showStyle && (
        <div className="px-3 py-3 border-t border-(--border-color) bg-(--bg-surface) space-y-3">
          {/* Symbol picker (points only) */}
          {hasPoints && (
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-wider text-(--text-muted)">Symbole</span>
              <div className="flex gap-0.5 bg-(--bg-main) p-0.5 rounded-lg border border-(--border-color)">
                {([['circle', Circle], ['square', Square], ['triangle', Triangle]] as const).map(([sym, Icon]) => (
                  <button key={sym} onClick={() => onChangeSymbol(sym)}
                    className={cn("p-1.5 rounded transition-colors", (!layer.symbol || layer.symbol === sym) ? "bg-(--brand) text-white shadow-sm" : "text-(--text-muted) hover:text-(--text-main)")}>
                    <Icon className="w-3 h-3" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Fill mode (polygons) */}
          {showFillMode && (
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-wider text-(--text-muted)">Remplissage</span>
              <div className="flex gap-0.5 bg-(--bg-main) p-0.5 rounded-lg border border-(--border-color)">
                {[['fill', 'Rempli'], ['outline', 'Contour']].map(([mode, label]) => (
                  <button key={mode} onClick={() => onChangeFillMode(mode)}
                    className={cn("px-2.5 py-1 rounded text-[10px] font-bold transition-colors",
                      (mode === 'fill' ? !layer.fillMode || layer.fillMode === 'fill' : layer.fillMode === mode)
                        ? "bg-(--brand) text-white shadow-sm"
                        : "text-(--text-muted) hover:text-(--text-main)")}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Opacity */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wider text-(--text-muted)">Opacité</span>
              <span className="text-[10px] font-mono font-bold text-(--brand)">{Math.round((layer.opacity ?? 1) * 100)}%</span>
            </div>
            <input type="range" min="0.05" max="1" step="0.05" value={layer.opacity ?? 1}
              onChange={e => onChangeOpacity(parseFloat(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-(--brand)" />
          </div>

          {/* Size/weight */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wider text-(--text-muted)">Épaisseur / Taille</span>
              <span className="text-[10px] font-mono font-bold text-(--brand)">{layer.size ?? 6}px</span>
            </div>
            <input type="range" min="1" max="20" step="1" value={layer.size ?? 6}
              onChange={e => onChangeSize(parseInt(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-(--brand)" />
          </div>

          {/* Delete + Export */}
          <div className="flex items-center justify-between pt-1 border-t border-(--border-color)">
            <span className="text-[9px] uppercase tracking-wider bg-(--bg-main) px-2 py-0.5 rounded border border-(--border-color) text-(--text-muted) font-bold">
              {layer.type === 'static_polygon' ? 'Référence' : layer.type === 'drawn' ? 'Dessin' : 'Import'}
            </span>
            <div className="flex items-center gap-1">
              {(layer.geojson || layer.leafletLayer?.toGeoJSON) && (
                <>
                  {/* GeoJSON download */}
                  <button
                    onClick={() => {
                      try {
                        const geojson = layer.geojson || layer.leafletLayer?.toGeoJSON?.();
                        if (!geojson) return;
                        const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        Object.assign(document.createElement('a'), { href: url, download: `${layer.name}.geojson` }).click();
                        URL.revokeObjectURL(url);
                      } catch {}
                    }}
                    className="flex items-center gap-1 text-[10px] font-bold text-(--brand) hover:bg-(--brand)/10 px-2 py-1.5 rounded-lg transition-colors"
                    title="Télécharger GeoJSON"
                  >
                    <Save className="w-3.5 h-3.5" />
                  </button>
                  {/* Excel download */}
                  <button
                    onClick={() => {
                      try {
                        const geojson = layer.geojson || layer.leafletLayer?.toGeoJSON?.();
                        if (!geojson) return;
                        const features = geojson.type === 'FeatureCollection' ? geojson.features : [geojson];
                        const data = features.map((f: any) => ({
                          Couche: layer.name,
                          Type: f.geometry?.type || '',
                          Coordonnees: f.geometry?.type === 'Point'
                            ? f.geometry.coordinates.join(', ')
                            : `${f.geometry?.type} (${f.geometry?.coordinates?.[0]?.length || '?'} pts)`,
                          ...f.properties,
                        }));
                        const ws = XLSX.utils.json_to_sheet(data);
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, ws, 'Données');
                        const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                        const blob = new Blob([buf], { type: 'application/octet-stream' });
                        const url = URL.createObjectURL(blob);
                        Object.assign(document.createElement('a'), { href: url, download: `${layer.name}.xlsx` }).click();
                        URL.revokeObjectURL(url);
                      } catch {}
                    }}
                    className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 hover:bg-emerald-500/10 px-2 py-1.5 rounded-lg transition-colors"
                    title="Télécharger Excel (.xlsx)"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span className="text-[9px]">XLS</span>
                  </button>
                </>
              )}
              <button onClick={onDelete} className="flex items-center gap-1.5 text-[10px] font-bold text-red-500 hover:bg-red-500/10 px-2.5 py-1.5 rounded-lg transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}