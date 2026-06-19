// src/views/DomaineForestier/DomaineForestier.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  PVReconnaissanceModal,
  runChevauchementAnalysis, FORET_AR,
} from './DocumentModals';
import type { ChevauchementResult } from './DocumentModals';
import proj4 from 'proj4';
import { createPortal } from 'react-dom';
import {
  registerProjections, normalizeToWGS84, smartNormalizeToWGS84, repairGeometry, hasSelfIntersection,
  difference, clip, symmetricDifference, unionAll, splitPolygonByLine,
  multiRingBuffer, dissolveAll, convexHullOf, envelopeOf, centroidOf,
  voronoiOf, distanceToBoundary, toKML, toGPX, downloadText,
  buildScaledPlanSVG, printPlan, polygonFromLambertBornes, exportShapefile,
} from '../../lib/forestGisCore';
import { ESRI_WORLD_IMAGERY, fetchWaybackReleases, type WaybackRelease } from '../../lib/forestMaps';
import { analyzeOverlapServer, saveParcelForTarget } from '../../lib/forestRepo';

registerProjections();

// Mappe le résultat serveur (PostGIS) vers la forme bilingue ChevauchementResult.
function mapServerToChevResult(srv: any, importedGeojson: any, name: string): ChevauchementResult {
  const hits = (srv.hits || []).map((h: any) => {
    const foret = h.foret || '';
    const pct = h.percentage ?? (srv.total_area ? (h.intersection_area / srv.total_area) * 100 : 0);
    const position = pct >= 95 ? 'داخل الملك الغابوي' : pct >= 1 ? 'جزئيا داخل الملك الغابوي' : 'خارج الملك الغابوي';
    return { foret, foretAr: FORET_AR[foret.toUpperCase()] || '', canton: h.canton || '', intersectionArea: h.intersection_area, importedArea: srv.total_area, percentage: pct, position, properties: {} } as any;
  });
  const totalPercentage = Math.min(100, srv.total_percentage ?? 0);
  const globalPosition = totalPercentage >= 95 ? 'داخل الملك الغابوي' : totalPercentage >= 1 ? 'جزئيا داخل الملك الغابوي' : 'خارج الملك الغابوي';
  return {
    layerName: name, importedArea: srv.total_area, totalIntersectionArea: srv.inside_area,
    totalPercentage, globalPosition, hits, intersections: hits,
    importedGeoJSON: importedGeojson, forestGeoJSON: null,
    insideArea: srv.inside_area, outsideArea: srv.outside_area, outsideGeoJSON: null,
  } as ChevauchementResult;
}

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
  Zap, PenLine, RotateCcw, Bell, BarChart3, AlertTriangle,
  Edit3, CheckCircle, History, TrendingUp, RefreshCw, Contrast,
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
type ToastItem = {
  id: string; type: 'success' | 'warning' | 'error' | 'info';
  title: string; msg?: string;
};

// ─── Session persistence ──────────────────────────────────────────────────────
const SESSION_KEY = 'domaine_forestier_session_v2';
const saveSessionToStorage = (layers: any[]) => {
  try {
    const data = layers.map(({ leafletLayer, ...rest }: any) => rest);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ v: 2, ts: Date.now(), layers: data }));
  } catch {}
};
const loadSessionFromStorage = (): any[] => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.layers) ? parsed.layers : [];
  } catch { return []; }
};
const clearSession = () => { try { localStorage.removeItem(SESSION_KEY); } catch {} };

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

const MapEvents = ({ setCoords, onIdentify, customLayersRef }: { setCoords: any; onIdentify?: (latlng: any, results: any[]) => void; customLayersRef?: React.MutableRefObject<any[]> }) => {
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
      // Also check custom imported layers
      if (customLayersRef?.current) {
        for (const layer of customLayersRef.current) {
          if (!layer.visible || !layer.geojson) continue;
          try {
            const gj = layer.geojson;
            const features = gj.type === 'FeatureCollection' ? gj.features : [gj];
            for (const feat of features) {
              if (!feat?.geometry) continue;
              const geomType = feat.geometry.type;
              if ((geomType === 'Polygon' || geomType === 'MultiPolygon') && turf.booleanPointInPolygon(pt, feat)) {
                const area = turf.area(feat);
                const areaStr = area < 10000 ? `${area.toFixed(1)} m²` : `${(area/10000).toFixed(3)} ha`;
                results.push({
                  key: layer.id, label: `📂 ${layer.name}`,
                  color: layer.color || '#38bdf8',
                  properties: { 'Type': layer.type === 'imported' ? 'Import' : 'Dessin', 'Surface': areaStr, ...feat.properties }
                });
                break;
              }
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

const CustomMapEventsHandler = ({ setCustomLayers, onLayerImported }: { setCustomLayers: any; onLayerImported?: (id: string, name: string, geojson: any) => void }) => {
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
        const layerName = `Recherche: ${data.display_name?.substring(0, 20) || 'Point'}`;
        setCustomLayers((prev: any) => [...prev, { id, name: layerName, type: 'drawn', visible: true, color: '#10b981', leafletLayer: marker, geojson: marker.toGeoJSON() }]);
        // Run chevauchement on a small buffer (10m) around the point
        if (onLayerImported) {
          try {
            const ptGeoJSON = marker.toGeoJSON();
            const buffered = turf.buffer(ptGeoJSON, 0.01, { units: 'kilometers' }); // 10m buffer
            onLayerImported(id, layerName, buffered || ptGeoJSON);
          } catch { onLayerImported(id, layerName, marker.toGeoJSON()); }
        }
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

  // ── Toast notifications ───────────────────────────────────────────────────
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const addToast = useCallback((item: Omit<ToastItem, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev.slice(-4), { ...item, id }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000);
  }, []);
  const dismissToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  // ── Undo/History ──────────────────────────────────────────────────────────
  const [layerHistory, setLayerHistory] = useState<any[][]>([]);
  const pushHistory = useCallback((layers: any[]) => {
    setLayerHistory(prev => [...prev.slice(-19), layers.map(({ leafletLayer, ...rest }: any) => rest)]);
  }, []);
  const canUndo = layerHistory.length > 0;

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
  // Ref for MapEvents identify (avoids stale closure)
  const customLayersRef = useRef<any[]>([]);
  useEffect(() => { customLayersRef.current = customLayers; }, [customLayers]);

  // ── Auto-save session ─────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => { saveSessionToStorage(customLayers); }, 800);
    return () => clearTimeout(timer);
  }, [customLayers]);

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

  // ── الربط المكاني مع قسم المنازعات عبر window (لا استيراد ⇒ لا خطأ مسار) — النقطة 1 ──
  const [pickingForCase, setPickingForCase] = useState<boolean>(() => { try { return !!(window as any).__anefParcelPicking; } catch { return false; } });
  useEffect(() => {
    const sync = () => { try { setPickingForCase(!!(window as any).__anefParcelPicking); } catch {} };
    sync();
    window.addEventListener('parcel:pick-requested', sync);
    window.addEventListener('parcel:pick-cancelled', sync);
    window.addEventListener('parcel:delivered', sync);
    return () => {
      window.removeEventListener('parcel:pick-requested', sync);
      window.removeEventListener('parcel:pick-cancelled', sync);
      window.removeEventListener('parcel:delivered', sync);
    };
  }, []);

  const cancelParcelPick = () => {
    try { (window as any).__anefParcelPicking = false; } catch {}
    window.dispatchEvent(new CustomEvent('parcel:pick-cancelled'));
    setPickingForCase(false);
  };

  // ── عرض قطعة ملف قضائي قادمة من قسم المنازعات (anef_show_parcel) ──
  /** تحويل GeoJSON (Polygon/MultiPolygon/Feature) إلى إحداثيات Leaflet [lat,lng] للحلقة الخارجية. */
  const geojsonToAreaCoords = (geojson: any): [number, number][] | null => {
    try {
      const f = geojson?.type === 'FeatureCollection'
        ? (geojson.features.find((x: any) => x?.geometry) || geojson.features[0])
        : geojson;
      const geom = f?.type === 'Feature' ? f.geometry : f;
      if (!geom) return null;
      let ring: number[][] | null = null;
      if (geom.type === 'Polygon') ring = geom.coordinates?.[0] || null;
      else if (geom.type === 'MultiPolygon') ring = geom.coordinates?.[0]?.[0] || null;
      if (!ring) return null;
      return ring.map((c: number[]) => [c[1], c[0]] as [number, number]); // [lng,lat] → [lat,lng]
    } catch { return null; }
  };

  /** يرسم قطعة ملف قضائي على الخريطة (طبقة مرجعية حمراء) ويُحلّق إليها ويحسب تداخلها. */
  const showLinkedParcel = useCallback((req: { geojson: any; openFiche?: boolean; ref?: string }) => {
    if (!req?.geojson) return;
    const areaCoords = geojsonToAreaCoords(req.geojson);
    if (!areaCoords || areaCoords.length < 3) { addToast({ type: 'warning', title: 'تعذّر رسم القطعة', msg: 'هندسة غير صالحة' }); return; }
    const id = 'linked-parcel';
    const label = req.ref ? `قطعة الملف ${req.ref}` : 'قطعة الملف القضائي';
    setCustomLayers((curr: any[]) => {
      const without = curr.filter((l: any) => l.id !== id);
      return [...without, {
        id, name: label, type: 'static_polygon', areaCoords,
        color: '#dc2626', visible: true, opacity: 1,
      }];
    });
    // تحليل التداخل + تغذية اللوحة الجانبية
    try { handleLayerImported(id, label, req.geojson); } catch {}
    // التحليق إلى مركز القطعة
    try {
      const feat = req.geojson.type === 'Feature'
        ? req.geojson
        : { type: 'Feature', geometry: (req.geojson.type === 'FeatureCollection' ? req.geojson.features[0].geometry : req.geojson), properties: {} };
      const c = turf.centroid(feat as any);
      const [lng, lat] = c.geometry.coordinates as [number, number];
      setMapTargetCenter([lat, lng]);
    } catch {}
    addToast({ type: 'info', title: 'معاينة قطعة الملف', msg: 'عُرضت القطعة على الخريطة بالأحمر' });
    // handleLayerImported يُستدعى داخل الجسم بعد الرندر؛ لا نضعه في التبعيات (مُعرَّف لاحقاً)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addToast]);

  // عند التحميل + عند كل طلب فتح خريطة: استهلك طلب «معاينة القطعة» إن وُجد.
  useEffect(() => {
    const consume = () => {
      try {
        const raw = sessionStorage.getItem('anef_show_parcel');
        if (!raw) return;
        sessionStorage.removeItem('anef_show_parcel');
        showLinkedParcel(JSON.parse(raw));
      } catch {}
    };
    consume();
    window.addEventListener('anef:open-map', consume);
    return () => window.removeEventListener('anef:open-map', consume);
  }, [showLinkedParcel]);

  /** يبني بطاقة تموقع القطعة، يحفظها في domaine.parcels مربوطةً بالملف/المحضر، ثم يُسلّمها لقسم المنازعات. */
  const attachParcelToCase = async () => {
    const layer = lastImportedLayer;
    if (!layer || !layer.geojson) { addToast({ type: 'warning', title: 'لا توجد قطعة محدّدة', msg: 'ارسم القطعة على الخريطة أولاً' }); return; }
    try {
      const gj = layer.geojson;
      const feat = gj.type === 'FeatureCollection'
        ? (gj.features.find((f: any) => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')) || gj.features[0])
        : gj;
      const centroid = turf.centroid(feat);
      const [lng, lat] = centroid.geometry.coordinates as [number, number];
      let areaM2 = 0; try { areaM2 = turf.area(feat); } catch { areaM2 = layer.chevauchement?.importedArea || 0; }
      let perimeterKm = 0; try { perimeterKm = turf.length(feat, { units: 'kilometers' }); } catch {}
      const lam = calcLambert(lat, lng);
      const chev = layer.chevauchement;
      const overlap = chev ? {
        globalPosition: chev.globalPosition,
        totalPercentage: chev.totalPercentage,
        totalIntersectionArea: chev.totalIntersectionArea,
        hits: chev.hits.map(h => ({ foret: h.foret, foretAr: h.foretAr, canton: h.canton, intersectionArea: h.intersectionArea, percentage: h.percentage, position: h.position })),
      } : null;

      // هدف الربط القادم من قسم المنازعات (ملف/محضر)
      let target: { kind: 'case' | 'pv'; id: string; ref?: string } | null = null;
      try { const raw = sessionStorage.getItem('anef_parcel_target'); if (raw) target = JSON.parse(raw); } catch {}

      // حفظ حقيقي في domaine.parcels (idempotent: CTX-CASE-<id> / CTX-PV-<id>)
      let parcelId: string | null = null;
      if (target?.id) {
        try {
          parcelId = await saveParcelForTarget({
            target,
            name: `قطعة الملف ${target.ref || target.id}`,
            source: String(layer.id || '').startsWith('imported') ? 'imported' : 'drawn',
            geojson: feat,
            province: layer.province || null,
            overlap,
            area_m2: areaM2,
          });
        } catch (e) { console.warn('[attachParcelToCase] saveParcelForTarget', e); }
      }

      const location = {
        geojson: feat,
        centroidLat: lat, centroidLng: lng,
        lambertX: parseFloat(lam.x), lambertY: parseFloat(lam.y),
        areaM2, perimeterKm,
        province: layer.province || null,
        overlap,
        parcelId: parcelId || undefined,
        capturedAt: new Date().toISOString(),
      };
      try { (window as any).__anefParcelPicking = false; } catch {}
      try { sessionStorage.setItem('anef_parcel_pending', JSON.stringify(location)); } catch {}
      window.dispatchEvent(new CustomEvent('parcel:delivered', { detail: location }));
      window.dispatchEvent(new CustomEvent('anef:return-from-map'));
      setPickingForCase(false);
      addToast({
        type: 'success',
        title: parcelId ? 'سُجِّلت القطعة وأُرفقت بالملف ✓' : 'أُرفقت القطعة بالملف ✓',
        msg: parcelId ? 'محفوظة في قاعدة الملك الغابوي ومربوطة بالملف' : 'عُد إلى قسم المنازعات لإكمال الملف',
      });
    } catch (e) { addToast({ type: 'error', title: 'تعذّر الإرفاق', msg: String((e as Error)?.message || e) }); }
  };

  // ── Layer imported: run chevauchement, auto-load forest if needed ──────────
  const handleLayerImported = (layerId: string, name: string, geojson: any) => {
    const runAnalysis = async (forestData: any) => {
      let chev: ChevauchementResult | null = null;
      try {
        const srv = await analyzeOverlapServer(geojson);   // PostGIS d'abord
        chev = (srv && srv.total_area > 0)
          ? mapServerToChevResult(srv, geojson, name)
          : runChevauchementAnalysis(geojson, forestData, name);  // repli local
        setChevauchementResults(prev => ({ ...prev, [layerId]: chev! }));
        // ── Overlap alert if > 5% ──
        if (chev && chev.totalPercentage > 5) {
          const isTotal = chev.globalPosition === 'داخل الملك الغابوي';
          addToast({
            type: isTotal ? 'error' : 'warning',
            title: isTotal ? '⚠ Inclusion totale détectée' : `⚠ Chevauchement ${chev.totalPercentage.toFixed(1)}%`,
            msg: `Couche «${name}» ${isTotal ? 'est entièrement dans' : 'chevauche'} le Domaine Forestier`,
          });
        } else if (chev && chev.totalPercentage === 0) {
          addToast({ type: 'success', title: '✓ Hors domaine forestier', msg: `La couche «${name}» est hors du Mlak Ghabi` });
        }
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
            <BaseLayer name="Satellite (Esri World Imagery)">
              <TileLayer url={ESRI_WORLD_IMAGERY} attribution="Esri, Maxar, Earthstar" maxZoom={21} />
            </BaseLayer>
          </LayersControl>
          <MapComparison />

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
          <MapEvents setCoords={setCoords} onIdentify={handleIdentify} customLayersRef={customLayersRef} />
          <MapResizeTracker isPanelCollapsed={isPanelCollapsed} />
          <MapCenterUpdater mapTargetCenter={mapTargetCenter} setMapTargetCenter={setMapTargetCenter} />
          <CustomMapEventsHandler setCustomLayers={setCustomLayers} onLayerImported={handleLayerImported} />
          <ScaleControl position="bottomleft" imperial={false} />
        </MapContainer>

        {/* ── Toast notifications ── */}
        {toasts.length > 0 && (
          <div className="absolute top-16 right-4 z-[1002] flex flex-col gap-2 pointer-events-auto max-w-72">
            {toasts.map(t => (
              <div key={t.id}
                className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl shadow-2xl border backdrop-blur-md text-sm animate-in slide-in-from-right-3 fade-in duration-200"
                style={{
                  backgroundColor: t.type === 'error' ? '#ef444420' : t.type === 'warning' ? '#f9731620' : t.type === 'success' ? '#22c55e20' : '#3b82f620',
                  borderColor: t.type === 'error' ? '#ef4444aa' : t.type === 'warning' ? '#f97316aa' : t.type === 'success' ? '#22c55eaa' : '#3b82f6aa',
                  color: t.type === 'error' ? '#ef4444' : t.type === 'warning' ? '#f97316' : t.type === 'success' ? '#22c55e' : '#3b82f6',
                }}>
                <div className="shrink-0 mt-0.5">
                  {t.type === 'error'   && <AlertTriangle className="w-3.5 h-3.5" />}
                  {t.type === 'warning' && <Bell className="w-3.5 h-3.5" />}
                  {t.type === 'success' && <CheckCircle className="w-3.5 h-3.5" />}
                  {t.type === 'info'    && <BarChart3 className="w-3.5 h-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold leading-tight">{t.title}</p>
                  {t.msg && <p className="text-[10px] mt-0.5 opacity-80 leading-snug">{t.msg}</p>}
                </div>
                <button onClick={() => dismissToast(t.id)} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity mt-0.5">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── وضع تحديد قطعة لملف قضائي (النقطة 1) ── */}
        {pickingForCase && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1003] pointer-events-auto w-[min(92%,560px)]">
            <div className="flex items-center gap-3 bg-emerald-600 text-white rounded-2xl shadow-2xl px-4 py-2.5">
              <MapPin className="w-4 h-4 shrink-0" />
              <p className="text-[12px] font-bold flex-1 leading-snug">
                وضع تحديد القطعة لملف قضائي — ارسم القطعة (يُحسب التداخل تلقائياً){lastImportedLayer ? ' ثم أرفقها' : ''}.
              </p>
              <button onClick={attachParcelToCase} disabled={!lastImportedLayer}
                className="shrink-0 bg-white text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed font-bold text-[12px] px-3 py-1.5 rounded-lg transition-colors">
                إرفاق القطعة بالملف
              </button>
              <button onClick={cancelParcelPick} title="إلغاء"
                className="shrink-0 text-white/80 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Undo button ── */}
        {canUndo && (
          <div className="absolute top-16 left-4 z-[1001] pointer-events-auto">
            <button
              onClick={() => {
                const prev = layerHistory[layerHistory.length - 1];
                setLayerHistory(h => h.slice(0, -1));
                // Remove current leaflet layers and restore previous state
                setCustomLayers((curr: any[]) => {
                  curr.forEach((l: any) => {
                    if (l.leafletLayer) {
                      if (featureGroupRef.current?.hasLayer(l.leafletLayer)) featureGroupRef.current?.removeLayer(l.leafletLayer);
                      else l.leafletLayer.remove?.();
                    }
                  });
                  return prev;
                });
                addToast({ type: 'info', title: 'Annulation effectuée', msg: 'Retour à l\'état précédent' });
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a1c]/90 hover:bg-[#2a2a2c] text-amber-400 hover:text-amber-300 text-[11px] font-bold rounded-xl border border-white/10 shadow-lg backdrop-blur-md transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Annuler ({layerHistory.length})
            </button>
          </div>
        )}
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
                  onPushHistory={pushHistory}
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
          title="PV de Reconnaissance de Site"
          subtitle="OTDF · Carrière · Mobilisation · Commission régionale"
          desc="Fiche de reconnaissance — occupation temporaire / échange immobilier"
          color="#0ea5e9" icon={FileText}
          onClick={() => setActiveReport("PV Reconnaissance")}
        />
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

      {activeReport === "PV Reconnaissance" && (
        <PVReconnaissanceModal onClose={() => setActiveReport(null)} importedLayer={lastImportedLayer} forestData={forestData} communesData={communesData} />
      )}
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

// ─── Shared PolyBuilder sub-component ────────────────────────────────────────
function PolyBuilder({
  polyPoints, polyName, polyMsg, setPolyName, setPolyPoints, setPolyMsg, removePoint, buildPolygon,
}: {
  polyPoints: PolyPoint[]; polyName: string; polyMsg: { type: 'success' | 'error'; text: string } | null;
  setPolyName: (n: string) => void; setPolyPoints: (fn: (prev: PolyPoint[]) => PolyPoint[]) => void;
  setPolyMsg: (m: { type: 'success' | 'error'; text: string } | null) => void;
  removePoint: (id: string) => void; buildPolygon: () => void;
}) {
  const canBuild = polyPoints.length >= 3;
  return (
    <div className="mt-3 rounded-xl border-2 border-amber-400/40 bg-amber-500/5 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-amber-400/25">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3 h-3 text-amber-500" />
          <span className="text-[9px] font-black uppercase tracking-[0.08em] text-amber-600">
            Polygone · {polyPoints.length} point{polyPoints.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={() => { setPolyPoints(() => []); setPolyMsg(null); }}
          className="text-[9px] text-amber-500/70 hover:text-red-500 font-medium transition-colors flex items-center gap-0.5"
        >
          <X className="w-2.5 h-2.5" /> Effacer tout
        </button>
      </div>

      <div className="px-3 py-2.5 space-y-2.5">
        {/* Layer name input — prominent rename field */}
        <div className="rounded-xl border-2 border-dashed border-amber-400/70 bg-amber-400/5 p-2.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Edit3 className="w-3 h-3 text-amber-500" />
            <span className="text-[9px] font-black uppercase tracking-wider text-amber-600">✏ Nommez votre couche</span>
            <span className="ml-auto text-[8px] text-amber-400/80 italic font-medium">Obligatoire</span>
          </div>
          <div className="relative">
            <input
              type="text"
              value={polyName}
              onChange={e => setPolyName(e.target.value)}
              placeholder="Ex: Parcelle Nord — Lot 4B…"
              className="w-full bg-white dark:bg-zinc-900 border-2 border-amber-400 rounded-lg py-2.5 px-3 pr-8 text-[13px] font-bold focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all text-(--text-main) placeholder:text-amber-300 shadow-sm"
              autoComplete="off"
            />
            {polyName && polyName !== 'Polygone personnalisé' ? (
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              </div>
            ) : (
              <Edit3 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-amber-400 pointer-events-none" />
            )}
          </div>
          <p className="text-[9px] text-amber-500/70 mt-1.5 font-medium">Ce nom identifiera votre couche dans le panneau</p>
        </div>

        {/* Points list */}
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {polyPoints.map((pt, i) => (
            <div key={pt.id} className="flex items-center gap-2 group px-2 py-1 rounded-lg hover:bg-amber-500/10 transition-colors">
              <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-600 text-[8px] font-black flex items-center justify-center shrink-0 font-mono">{i + 1}</span>
              <span className="text-[10px] font-mono text-(--text-muted) flex-1 truncate">
                <span className={cn("font-black text-[9px] mr-1 px-1 rounded", pt.mode === 'lambert' ? "bg-orange-100 dark:bg-orange-900/30 text-orange-600" : "bg-blue-100 dark:bg-blue-900/30 text-blue-600")}>
                  {pt.mode === 'lambert' ? 'LN' : 'WGS'}
                </span>
                {pt.label}
              </span>
              <button onClick={() => removePoint(pt.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        {/* Feedback */}
        {polyMsg && (
          <div className={cn("flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded-lg", polyMsg.type === 'success' ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500")}>
            {polyMsg.type === 'success' ? <CheckCircle className="w-3 h-3 shrink-0" /> : <AlertTriangle className="w-3 h-3 shrink-0" />}
            {polyMsg.text}
          </div>
        )}

        {/* Create button */}
        <button
          onClick={buildPolygon}
          disabled={!canBuild}
          className={cn(
            "w-full py-2.5 rounded-xl font-bold text-[12px] flex items-center justify-center gap-1.5 transition-all border-2",
            canBuild
              ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-500 shadow-md active:scale-98"
              : "bg-amber-500/10 text-amber-400/60 border-amber-400/30 cursor-not-allowed"
          )}
        >
          <Zap className="w-3.5 h-3.5" />
          {canBuild
            ? `⚡ Créer la couche (${polyPoints.length} pts)`
            : `Encore ${3 - polyPoints.length} point${3 - polyPoints.length > 1 ? 's' : ''} requis`}
        </button>
      </div>
    </div>
  );
}

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
  const [lngVal, setLngVal]           = useState('');
  const [latVal, setLatVal]           = useState('');
  const [lambertX, setLambertX]       = useState('');
  const [lambertY, setLambertY]       = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [lambertPoly, setLambertPoly] = useState(false);
  const [wgsPoly, setWgsPoly]         = useState(false);
  const [polyPoints, setPolyPoints]   = useState<PolyPoint[]>([]);
  const [polyName, setPolyName]       = useState('Polygone personnalisé');
  const [polyMsg, setPolyMsg]         = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [polySourceMode, setPolySourceMode] = useState<'lambert' | 'wgs84' | null>(null);

  const inp = "flex-1 min-w-0 bg-(--bg-main) border border-(--border-color) rounded-lg py-2 px-2.5 text-[12px] font-mono focus:outline-none focus:border-(--brand) transition-colors text-(--text-main) placeholder:text-(--text-muted)";
  const rowLabel = "text-[9px] font-bold uppercase tracking-wider text-(--text-muted) select-none";

  const handleCenterLambert = () => {
    const x = parseFloat(lambertX), y = parseFloat(lambertY);
    if (!isNaN(x) && !isNaN(y)) {
      const c = calcLngLatFromLambert(x, y);
      window.dispatchEvent(new CustomEvent('mapSearch', { detail: { lat: c.lat, lon: c.lng, display_name: `Lambert (${x.toFixed(0)}, ${y.toFixed(0)})` } }));
    }
  };
  const handleCenterWGS = () => {
    const lng = parseFloat(lngVal), lat = parseFloat(latVal);
    if (!isNaN(lng) && !isNaN(lat))
      window.dispatchEvent(new CustomEvent('mapSearch', { detail: { lat, lon: lng, display_name: `WGS84 (${lng.toFixed(5)}, ${lat.toFixed(5)})` } }));
  };

  const addLambertPoint = () => {
    const x = parseFloat(lambertX), y = parseFloat(lambertY);
    if (isNaN(x) || isNaN(y)) return;
    setPolyPoints(prev => [...prev, { id: `pt-${Date.now()}`, x: lambertX, y: lambertY, mode: 'lambert', label: `${x.toFixed(0)}, ${y.toFixed(0)}` }]);
    setPolySourceMode('lambert');
    setPolyMsg(null);
  };
  const addWgsPoint = () => {
    const lng = parseFloat(lngVal), lat = parseFloat(latVal);
    if (isNaN(lng) || isNaN(lat)) return;
    setPolyPoints(prev => [...prev, { id: `pt-${Date.now()}`, x: lngVal, y: latVal, mode: 'wgs84', label: `${lng.toFixed(5)}, ${lat.toFixed(5)}` }]);
    setPolySourceMode('wgs84');
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
      if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) coords.push([...coords[0]]);
      const geojson = turf.featureCollection([turf.polygon([coords])]);
      const id = `poly-${Date.now()}`;
      const color = '#f59e0b';
      const name = polyName || 'Polygone';

      // Build popup with measurements
      const area = turf.area(geojson.features[0]);
      const perim = turf.length(geojson.features[0], { units: 'kilometers' });
      const popupHtml = `
        <div style="min-width:180px;padding:4px 0">
          <b style="font-size:13px;display:block;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #eee">📍 ${name}</b>
          <div style="font-size:11px;line-height:1.8">
            <b>Surface:</b> ${area < 10000 ? area.toFixed(2) + ' m²' : (area / 10000).toFixed(4) + ' ha'}<br/>
            <b>Périmètre:</b> ${perim.toFixed(4)} km<br/>
            <b>Sommets:</b> ${polyPoints.length}<br/>
            <b>SCR:</b> ${polyPoints.some(p => p.mode === 'lambert') ? 'Lambert Nord / WGS84' : 'WGS84 EPSG:4326'}
          </div>
        </div>`;

      const leafletLayer = L.geoJSON(geojson, {
        style: { color, weight: 2.5, opacity: 0.9, fillColor: color, fillOpacity: 0.22 },
        onEachFeature: (_, lyr) => { lyr.bindPopup(popupHtml); },
      });
      if (featureGroupRef?.current) {
        featureGroupRef.current.addLayer(leafletLayer);
        try { const b = leafletLayer.getBounds(); if (b?.isValid()) window.dispatchEvent(new CustomEvent('flyToBounds', { detail: b })); } catch {}
      }
      setCustomLayers((prev: any) => [...prev, { id, name, type: 'imported', visible: true, color, opacity: 0.9, geojson, leafletLayer }]);
      onLayerImported?.(id, name, geojson);
      setPolyMsg({ type: 'success', text: `Couche «${name}» créée avec succès.` });
      setPolyPoints(() => []);
      setPolyName('Polygone personnalisé');
      setLambertPoly(false);
      setWgsPoly(false);
      setPolySourceMode(null);
      if (setActiveTab) setTimeout(() => { setActiveTab('couches'); setIsPanelCollapsed?.(false); }, 700);
    } catch { setPolyMsg({ type: 'error', text: 'Erreur lors de la création.' }); }
  };

  const hasPoints = polyPoints.length > 0;

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
            className="px-3.5 py-1.5 bg-(--brand) hover:opacity-90 text-white font-bold text-[11px] rounded-lg shadow-sm transition-all active:scale-95 shrink-0"
          >GO</button>
        </div>
      </div>

      <div className="h-px bg-(--border-color)" />

      {/* ── Lambert Nord ─────────────────────────────────────────────────── */}
      <div className="py-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className={rowLabel}>Lambert Nord</span>
            <span className="text-[8px] text-(--text-muted) bg-(--bg-main) border border-(--border-color) rounded px-1 py-px font-mono">EPSG:26191</span>
          </div>
          <button
            onClick={() => { setLambertPoly(v => !v); setWgsPoly(false); }}
            title={lambertPoly ? "Désactiver mode polygone" : "Activer mode polygone Lambert"}
            className={cn(
              "flex items-center gap-1 text-[9px] font-bold px-2.5 py-1 rounded-lg border transition-all",
              lambertPoly
                ? "bg-amber-500/20 border-amber-500/60 text-amber-600 shadow-sm"
                : "border-(--border-color) text-(--text-muted) hover:text-(--text-main) hover:border-amber-500/40"
            )}
          >
            <Zap className="w-2.5 h-2.5" /> Poly
            {lambertPoly && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
          </button>
        </div>

        <div className="flex gap-2">
          <input type="number" step="any" value={lambertX} onChange={e => setLambertX(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCenterLambert(); }}
            placeholder="X" className={inp} />
          <input type="number" step="any" value={lambertY} onChange={e => setLambertY(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCenterLambert(); }}
            placeholder="Y" className={inp} />
          <button onClick={handleCenterLambert}
            className="px-3 py-1.5 bg-(--bg-surface) border border-(--border-color) hover:bg-(--bg-main) text-(--text-main) font-bold text-[11px] rounded-lg shadow-sm transition-all active:scale-95 shrink-0">
            GO
          </button>
        </div>

        {/* Lambert add row — revealed when Poly is active */}
        {lambertPoly && (
          <div className="flex items-center gap-2 pl-1 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="w-px h-5 bg-amber-400/60 shrink-0" />
            <p className="text-[10px] text-(--text-muted) flex-1 font-mono">
              {lambertX && lambertY
                ? <span className="text-amber-600 font-bold">{parseFloat(lambertX).toFixed(0)}, {parseFloat(lambertY).toFixed(0)}</span>
                : <span className="italic">Entrez X et Y puis ↓ Ajouter</span>}
            </p>
            <button
              onClick={() => { addLambertPoint(); handleCenterLambert(); }}
              disabled={!lambertX || !lambertY}
              className={cn(
                "flex items-center gap-1 text-[10px] font-bold px-3 py-1 rounded-lg border transition-all",
                lambertX && lambertY
                  ? "bg-amber-500/20 border-amber-500/50 text-amber-600 hover:bg-amber-500/30 active:scale-95"
                  : "border-(--border-color) text-(--text-muted) cursor-not-allowed opacity-40"
              )}
            >
              <Plus className="w-3 h-3" /> Ajouter
            </button>
          </div>
        )}

        {/* Inline Poly Builder for Lambert */}
        {(lambertPoly || polySourceMode === 'lambert') && hasPoints && (
          <PolyBuilder
            polyPoints={polyPoints} polyName={polyName} polyMsg={polyMsg}
            setPolyName={setPolyName} setPolyPoints={(fn) => { setPolyPoints(fn); if (fn(polyPoints).length === 0) setPolySourceMode(null); }} setPolyMsg={setPolyMsg}
            removePoint={removePoint} buildPolygon={buildPolygon}
          />
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
            onClick={() => { setWgsPoly(v => !v); setLambertPoly(false); }}
            title={wgsPoly ? "Désactiver mode polygone" : "Activer mode polygone WGS84"}
            className={cn(
              "flex items-center gap-1 text-[9px] font-bold px-2.5 py-1 rounded-lg border transition-all",
              wgsPoly
                ? "bg-amber-500/20 border-amber-500/60 text-amber-600 shadow-sm"
                : "border-(--border-color) text-(--text-muted) hover:text-(--text-main) hover:border-amber-500/40"
            )}
          >
            <Zap className="w-2.5 h-2.5" /> Poly
            {wgsPoly && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
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
            className="px-3 py-1.5 bg-(--bg-surface) border border-(--border-color) hover:bg-(--bg-main) text-(--text-main) font-bold text-[11px] rounded-lg shadow-sm transition-all active:scale-95 shrink-0">
            GO
          </button>
        </div>

        {/* WGS add row — revealed when Poly is active */}
        {wgsPoly && (
          <div className="flex items-center gap-2 pl-1 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="w-px h-5 bg-amber-400/60 shrink-0" />
            <p className="text-[10px] text-(--text-muted) flex-1 font-mono">
              {lngVal && latVal
                ? <span className="text-amber-600 font-bold">{parseFloat(lngVal).toFixed(5)}, {parseFloat(latVal).toFixed(5)}</span>
                : <span className="italic">Entrez Lon/Lat puis ↓ Ajouter</span>}
            </p>
            <button
              onClick={() => { addWgsPoint(); handleCenterWGS(); }}
              disabled={!lngVal || !latVal}
              className={cn(
                "flex items-center gap-1 text-[10px] font-bold px-3 py-1 rounded-lg border transition-all",
                lngVal && latVal
                  ? "bg-amber-500/20 border-amber-500/50 text-amber-600 hover:bg-amber-500/30 active:scale-95"
                  : "border-(--border-color) text-(--text-muted) cursor-not-allowed opacity-40"
              )}
            >
              <Plus className="w-3 h-3" /> Ajouter
            </button>
          </div>
        )}

        {/* Inline Poly Builder for WGS84 */}
        {(wgsPoly || polySourceMode === 'wgs84') && hasPoints && (
          <PolyBuilder
            polyPoints={polyPoints} polyName={polyName} polyMsg={polyMsg}
            setPolyName={setPolyName} setPolyPoints={(fn) => { setPolyPoints(fn); if (fn(polyPoints).length === 0) setPolySourceMode(null); }} setPolyMsg={setPolyMsg}
            removePoint={removePoint} buildPolygon={buildPolygon}
          />
        )}
      </div>

      <div className="h-px bg-(--border-color) mt-4" />

      {/* ── Centrer sur l'étendue ── */}
      <div className="pt-4">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('mapCenterExtent'))}
          className="w-full py-2 bg-(--bg-main) hover:bg-(--bg-surface) border border-(--border-color) text-(--brand) font-bold rounded-lg text-[11px] flex items-center justify-center gap-2 transition-all"
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
// CouchesTab — with Excel sheet selection, per-layer chevauchement, session restore, stats
// ─────────────────────────────────────────────────────────────────────────────
function CouchesTab({
  customLayers, setCustomLayers, featureGroupRef, setIsPanelCollapsed,
  onLayerImported, onLayerDeleted, chevauchementResults, onPushHistory,
}: {
  customLayers: any[]; setCustomLayers: any; featureGroupRef: any;
  setIsPanelCollapsed: any;
  onLayerImported?: (layerId: string, name: string, geojson: any) => void;
  onLayerDeleted?: (id: string) => void;
  chevauchementResults: Record<string, ChevauchementResult>;
  onPushHistory?: (layers: any[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [excelSheetPending, setExcelSheetPending] = useState<{ wb: any; sheets: string[]; name: string } | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [sessionRestored, setSessionRestored] = useState(false);
  const [layerFilter, setLayerFilter] = useState('');
  const [showCompare, setShowCompare] = useState(false);

  // ── Restore session on first mount ─────────────────────────────────────────
  useEffect(() => {
    if (sessionRestored) return;
    setSessionRestored(true);
    const saved = loadSessionFromStorage();
    if (saved.length === 0 || customLayers.length > 0) return;
    const fg = featureGroupRef.current;
    if (!fg) return;
    const restored: any[] = [];
    saved.forEach((l: any) => {
      if (!l.geojson) { restored.push(l); return; }
      const color = l.color || '#38bdf8';
      const op = l.opacity ?? 1;
      try {
        const lyr = L.geoJSON(l.geojson, {
          style: { color, weight: 2, opacity: op, fillColor: color, fillOpacity: l.fillMode === 'outline' ? 0 : op * 0.35 },
          pointToLayer: (_f, ll) => L.circleMarker(ll, { radius: l.size ?? 6, fillColor: color, color, weight: 1.5, opacity: op, fillOpacity: op * 0.8 }),
        });
        if (l.visible !== false) fg.addLayer(lyr);
        restored.push({ ...l, leafletLayer: lyr });
      } catch { restored.push(l); }
    });
    if (restored.length > 0) setCustomLayers(restored);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featureGroupRef]);

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
    const map: L.Map | undefined = (fg as any)?._map;
    if (!fg || !map) return;
    const paneId = `official-${key}`;
    if (!map.getPane(paneId)) {
      map.createPane(paneId);
      const pp = map.getPane(paneId);
      if (pp) pp.style.zIndex = '395';   // au-dessus du fond, sous les vecteurs dessinés
    }
    // déjà chargée → simple bascule d'affichage (instantané, ne peut pas échouer)
    if (officialRefs.current[key]) {
      const willShow = !officialVisible[key];
      const pp = map.getPane(paneId);
      if (pp) pp.style.display = willShow ? '' : 'none';
      setOfficialVisible(p => ({ ...p, [key]: willShow }));
      return;
    }
    // premier chargement
    try {
      const res = await fetch(file);
      const geojson = await res.json();
      const style = officialStyles[key];
      const layer = L.geoJSON(geojson, {
        pane: paneId,
        style: { color: style.strokeColor, weight, fillColor: style.strokeColor, fillOpacity: style.fillOpacity, opacity: 0.85 },
        onEachFeature: (feature, lyr) => {
          lyr.bindTooltip(tooltip(feature.properties || {}), { sticky: true });
          lyr.on('mouseover', function () { (lyr as L.Path).setStyle({ fillOpacity: 0.22, weight: weight + 1 }); });
          lyr.on('mouseout',  function () { (lyr as L.Path).setStyle({ fillOpacity: officialStyles[key].fillOpacity, weight }); });
        },
      });
      layer.addTo(map);
      officialRefs.current[key] = layer;
      _officialGeoData[key] = geojson;
      const pp = map.getPane(paneId);
      if (pp) pp.style.display = '';
      setOfficialVisible(p => ({ ...p, [key]: true }));
    } catch (err) { console.error('[OfficialLayer]', key, err); }
  };

  // ── addGeoLayer: central function for adding any imported layer ────────────
  const addGeoLayer = (rawGeojson: any, fileName: string, opts: { noPoints?: boolean } = {}) => {
    const _norm = smartNormalizeToWGS84(rawGeojson);  // auto-CRS: positionne correctement la couche
    const geojson = repairGeometry(_norm.geojson);
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
      onPushHistory?.(prev); // push history before deletion
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
        const fmap: L.Map | undefined = (fg as any)?._map;
        if (!fg || !fmap) return;
        const paneId = 'official-forest';
        if (!fmap.getPane(paneId)) { fmap.createPane(paneId); const pp = fmap.getPane(paneId); if (pp) pp.style.zIndex = '395'; }
        fetch('/assets/data/forest_limits.json')
          .then(r => r.json())
          .then(geojson => {
            const style = officialStyles['forest'];
            const layer = L.geoJSON(geojson, {
              pane: paneId,
              style: { color: style.strokeColor, weight: 2, fillColor: style.strokeColor, fillOpacity: 0.07, opacity: 0.85 },
              onEachFeature: (feature, lyr) => {
                const p = feature.properties || {};
                lyr.bindTooltip(`🌲 ${p.FORET||''} — ${p.CANTON||''}${p.SUPERFICIE ? '\n'+Math.round(p.SUPERFICIE)+' ha' : ''}`, { sticky: true });
                lyr.on('mouseover', function () { (lyr as L.Path).setStyle({ fillOpacity: 0.22, weight: 3 }); });
                lyr.on('mouseout',  function () { (lyr as L.Path).setStyle({ fillOpacity: 0.07, weight: 2 }); });
              },
            });
            layer.addTo(fmap);
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

      {/* Compare modal */}
      {showCompare && (
        <CompareLayersModal
          customLayers={customLayers}
          chevauchementResults={chevauchementResults}
          onClose={() => setShowCompare(false)}
        />
      )}

      {/* Stats panel */}
      {showStats && (
        <StatsPanel customLayers={customLayers} chevauchementResults={chevauchementResults} />
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
        <div className="flex items-center gap-2">
          <h2 className="text-(--brand) flex items-center gap-2 font-semibold text-sm tracking-wide">
            Couches importées
            <span className="text-[10px] bg-(--bg-surface) px-2 py-0.5 rounded-full text-(--text-main) font-mono border border-(--border-color)">
              {customLayers.length}
            </span>
          </h2>
          <button
            onClick={() => setShowStats(v => !v)}
            title="Statistiques"
            className={cn("p-1.5 rounded-lg border transition-all text-[9px] font-bold", showStats ? "bg-(--brand)/15 border-(--brand)/40 text-(--brand)" : "border-(--border-color) text-(--text-muted) hover:text-(--brand) hover:border-(--brand)/40")}
          >
            <BarChart3 className="w-3.5 h-3.5" />
          </button>
          {customLayers.length >= 2 && (
            <button
              onClick={() => setShowCompare(true)}
              title="Comparer deux couches"
              className="p-1.5 rounded-lg border border-(--border-color) text-(--text-muted) hover:text-indigo-500 hover:border-indigo-500/40 transition-all"
            >
              <TrendingUp className="w-3.5 h-3.5" />
            </button>
          )}
          {customLayers.length > 0 && (
            <button
              onClick={() => {
                if (!confirm('Effacer toutes les couches importées et la session sauvegardée ?')) return;
                customLayers.forEach((l: any) => {
                  if (l.leafletLayer) {
                    if (featureGroupRef.current?.hasLayer(l.leafletLayer)) featureGroupRef.current?.removeLayer(l.leafletLayer);
                    else l.leafletLayer.remove?.();
                  }
                });
                setCustomLayers([]);
                clearSession();
              }}
              title="Effacer la session"
              className="p-1.5 rounded-lg border border-(--border-color) text-(--text-muted) hover:text-red-500 hover:border-red-500/40 transition-all"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          )}
        </div>
        <button onClick={() => fileInputRef.current?.click()}
          className="text-[11px] flex items-center gap-1.5 bg-(--brand) hover:opacity-90 text-white px-3 py-1.5 rounded-lg font-semibold shadow-sm">
          <Upload size={14} /> Importer
        </button>
        <input type="file" ref={fileInputRef} onChange={handleImport}
          accept=".json,.geojson,.kml,.csv,.xlsx,.xls,.zip"
          className="hidden" />
      </div>

      {/* Layer filter / search */}
      {customLayers.length > 2 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-(--text-muted) pointer-events-none" />
          <input
            type="text"
            value={layerFilter}
            onChange={e => setLayerFilter(e.target.value)}
            placeholder="Filtrer les couches par nom…"
            className="w-full bg-(--bg-main) border border-(--border-color) rounded-lg pl-8 pr-8 py-1.5 text-[11px] focus:outline-none focus:border-(--brand) text-(--text-main) placeholder:text-(--text-muted) transition-colors"
          />
          {layerFilter && (
            <button onClick={() => setLayerFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-(--text-muted) hover:text-(--text-main) p-0.5">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Custom layers list */}
      <div className="space-y-2 max-h-105 overflow-y-auto pr-0.5 select-none">
        {customLayers.length === 0 && (
          <div className="text-center py-10 text-(--text-muted) border border-dashed border-(--border-color) rounded-xl bg-(--bg-main)">
            <Layers className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p className="text-xs font-semibold">Aucune couche importée</p>
            <p className="text-[10px] mt-1 opacity-70">GeoJSON · CSV · KML · SHP · XLSX</p>
          </div>
        )}
        {(() => {
          const filtered = layerFilter
            ? customLayers.filter((l: any) => l.name.toLowerCase().includes(layerFilter.toLowerCase()))
            : customLayers;
          if (customLayers.length > 0 && filtered.length === 0) return (
            <div className="text-center py-6 text-(--text-muted) border border-dashed border-(--border-color) rounded-xl bg-(--bg-main)">
              <Search className="w-5 h-5 mx-auto mb-2 opacity-50" />
              <p className="text-[11px] font-semibold">Aucun résultat pour «{layerFilter}»</p>
            </div>
          );
          return filtered.map((layer: any) => (
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
          ));
        })()}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CompareLayersModal — side-by-side layer comparison with metrics
// ─────────────────────────────────────────────────────────────────────────────
function CompareLayersModal({ customLayers, chevauchementResults, onClose }: {
  customLayers: any[];
  chevauchementResults: Record<string, ChevauchementResult>;
  onClose: () => void;
}) {
  const [layerA, setLayerA] = useState(customLayers[0]?.id || '');
  const [layerB, setLayerB] = useState(customLayers[1]?.id || '');

  const sel = "w-full bg-(--bg-main) border border-(--border-color) text-(--text-main) rounded-lg p-2 text-[12px] focus:outline-none focus:border-(--brand)";

  const getStats = (layer: any) => {
    if (!layer) return null;
    const chev = chevauchementResults[layer.id];
    let area = 0, perim = 0, pointCount = 0;
    try {
      if (layer.geojson) {
        const gj = layer.geojson;
        const features = gj.type === 'FeatureCollection' ? gj.features : [gj];
        const polyFeats = features.filter((f: any) => f?.geometry?.type?.includes('Polygon'));
        const pointFeats = features.filter((f: any) => f?.geometry?.type === 'Point');
        pointCount = pointFeats.length;
        if (polyFeats.length > 0) {
          const fc = { type: 'FeatureCollection', features: polyFeats };
          area = turf.area(fc as any);
          perim = turf.length(fc as any, { units: 'kilometers' });
        }
      }
    } catch {}
    return { area, perim, pointCount, chev };
  };

  const lA = customLayers.find((l: any) => l.id === layerA);
  const lB = customLayers.find((l: any) => l.id === layerB);
  const sA = getStats(lA);
  const sB = getStats(lB);

  const chevLabel = (chev: ChevauchementResult | undefined) => {
    if (!chev) return { label: 'Non analysée', color: '#9ca3af' };
    if (chev.globalPosition === 'داخل الملك الغابوي') return { label: 'Inclusion totale', color: '#ef4444' };
    if (chev.globalPosition === 'جزئيا داخل الملك الغابوي') return { label: `Chevauch. ${chev.totalPercentage.toFixed(1)}%`, color: '#f97316' };
    return { label: 'Hors domaine', color: '#22c55e' };
  };

  const MetricRow = ({ label, a, b }: { label: string; a: string; b: string }) => (
    <div className="grid grid-cols-3 gap-2 py-2 border-b border-(--border-color) last:border-0">
      <span className="text-[10px] text-(--text-muted) font-medium self-center text-center">{label}</span>
      <span className="text-[11px] font-bold text-(--text-main) text-center bg-blue-500/10 rounded-lg py-1">{a}</span>
      <span className="text-[11px] font-bold text-(--text-main) text-center bg-emerald-500/10 rounded-lg py-1">{b}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-(--bg-surface) border border-(--border-color) rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-(--border-color) flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-sm font-bold text-(--text-main) flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-(--brand)" /> Comparer deux couches
            </h3>
            <p className="text-[10px] text-(--text-muted) mt-0.5">Analyse comparative — Domaine Forestier</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-(--text-muted) hover:text-(--text-main) hover:bg-(--bg-main) rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* Layer selectors */}
          <div className="px-5 py-4 space-y-3 border-b border-(--border-color)">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[9px] font-bold uppercase tracking-wider text-blue-500 mb-1 block">Couche A</label>
                <select value={layerA} onChange={e => setLayerA(e.target.value)} className={sel}>
                  {customLayers.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-bold uppercase tracking-wider text-emerald-500 mb-1 block">Couche B</label>
                <select value={layerB} onChange={e => setLayerB(e.target.value)} className={sel}>
                  {customLayers.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Comparison table */}
          {layerA && layerB && layerA !== layerB && sA && sB ? (
            <div className="px-5 py-4 space-y-4">
              {/* Header row */}
              <div className="grid grid-cols-3 gap-2 pb-2">
                <div />
                <div className="text-center">
                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-blue-500 bg-blue-500/10 px-2 py-1 rounded-lg">
                    <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" style={{ backgroundColor: lA?.color }} /> A
                  </span>
                  <p className="text-[9px] text-(--text-muted) mt-0.5 truncate">{lA?.name}</p>
                </div>
                <div className="text-center">
                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-lg">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" style={{ backgroundColor: lB?.color }} /> B
                  </span>
                  <p className="text-[9px] text-(--text-muted) mt-0.5 truncate">{lB?.name}</p>
                </div>
              </div>

              <div className="bg-(--bg-main) rounded-xl border border-(--border-color) px-3 divide-y divide-(--border-color)">
                <MetricRow
                  label="Surface"
                  a={sA.area > 0 ? (sA.area < 10000 ? `${sA.area.toFixed(0)} m²` : `${(sA.area/10000).toFixed(3)} ha`) : '—'}
                  b={sB.area > 0 ? (sB.area < 10000 ? `${sB.area.toFixed(0)} m²` : `${(sB.area/10000).toFixed(3)} ha`) : '—'}
                />
                <MetricRow
                  label="Périmètre"
                  a={sA.perim > 0 ? `${sA.perim.toFixed(3)} km` : '—'}
                  b={sB.perim > 0 ? `${sB.perim.toFixed(3)} km` : '—'}
                />
                <MetricRow
                  label="Points"
                  a={sA.pointCount > 0 ? String(sA.pointCount) : '—'}
                  b={sB.pointCount > 0 ? String(sB.pointCount) : '—'}
                />
                <MetricRow
                  label="Type"
                  a={lA?.type === 'static_polygon' ? 'Référence' : lA?.type === 'drawn' ? 'Dessin' : 'Import'}
                  b={lB?.type === 'static_polygon' ? 'Référence' : lB?.type === 'drawn' ? 'Dessin' : 'Import'}
                />
                <div className="grid grid-cols-3 gap-2 py-2">
                  <span className="text-[10px] text-(--text-muted) font-medium self-center text-center">Domaine F.</span>
                  {[sA, sB].map((s, i) => {
                    const { label, color } = chevLabel(s?.chev);
                    return (
                      <span key={i} className="text-[10px] font-bold text-center rounded-lg py-1 px-1" style={{ backgroundColor: color + '20', color }}>
                        {label}
                      </span>
                    );
                  })}
                </div>
                {sA.chev && sB.chev && (
                  <MetricRow
                    label="% Chevauch."
                    a={`${sA.chev.totalPercentage.toFixed(1)}%`}
                    b={`${sB.chev.totalPercentage.toFixed(1)}%`}
                  />
                )}
              </div>

              {/* Diff highlight */}
              {sA.area > 0 && sB.area > 0 && (
                <div className="bg-(--bg-main) rounded-xl border border-(--border-color) px-3 py-2.5">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-(--text-muted) mb-1.5">Différence de surface</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-(--border-color) overflow-hidden relative">
                      <div className="h-full rounded-full absolute left-0 top-0 transition-all" style={{ width: `${Math.min(100, (sA.area / Math.max(sA.area, sB.area)) * 100)}%`, backgroundColor: lA?.color || '#3b82f6' }} />
                    </div>
                    <span className="text-[10px] font-black font-mono text-(--text-main) w-20 text-right">
                      {sA.area > sB.area
                        ? `A + ${((sA.area - sB.area) / 10000).toFixed(3)} ha`
                        : `B + ${((sB.area - sA.area) / 10000).toFixed(3)} ha`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-2 rounded-full bg-(--border-color) overflow-hidden relative">
                      <div className="h-full rounded-full absolute left-0 top-0 transition-all" style={{ width: `${Math.min(100, (sB.area / Math.max(sA.area, sB.area)) * 100)}%`, backgroundColor: lB?.color || '#22c55e' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : layerA === layerB ? (
            <div className="px-5 py-8 text-center text-(--text-muted)">
              <AlertTriangle className="w-6 h-6 mx-auto mb-2 opacity-50" />
              <p className="text-[11px]">Sélectionnez deux couches différentes</p>
            </div>
          ) : (
            <div className="px-5 py-8 text-center text-(--text-muted)">
              <p className="text-[11px]">Sélectionnez deux couches pour comparer</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-(--border-color) shrink-0">
          <button onClick={onClose} className="w-full py-2 text-[11px] font-semibold text-(--text-muted) hover:text-(--text-main) border border-(--border-color) hover:border-(--brand)/40 rounded-lg transition-all">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MapComparison — Comparaison d'imagerie / détection de changement.
//  • Fondu  : superpose l'imagerie de référence/historique avec opacité réglable.
//  • Swipe  : barre verticale GLISSABLE sur la carte ; à gauche = imagerie de
//             comparaison, à droite = carte actuelle. (poignée ⇔ visible)
//  • Wayback : frise temporelle (timeline) pour parcourir les dates réelles.
// Auto-contenu : gère sa couche + son UI (portal). Injecté dans <MapContainer/>.
// ─────────────────────────────────────────────────────────────────────────────
function MapComparison() {
  const map = useMap();
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(false);
  const [mode, setMode] = useState<'swipe' | 'blend'>('blend');
  const [src, setSrc] = useState<'esri' | 'wayback' | 'osm' | 'ghybrid'>('wayback');
  const [opacity, setOpacity] = useState(70);
  const [wb, setWb] = useState<WaybackRelease[]>([]);
  const [rel, setRel] = useState<number | null>(null);
  const [dividerX, setDividerX] = useState(0);
  const layerRef = useRef<any>(null);
  const ctrlRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    if (!map.getPane('comparePane')) {
      map.createPane('comparePane');
      const p = map.getPane('comparePane');
      if (p) { p.style.zIndex = '350'; p.style.pointerEvents = 'none'; }
    }
  }, [map]);

  useEffect(() => { fetchWaybackReleases().then((r) => { setWb(r); if (r[0]) setRel(r[0].rel); }).catch(() => {}); }, []);
  useEffect(() => { if (ctrlRef.current) L.DomEvent.disableClickPropagation(ctrlRef.current); }, [open]);

  // initialise la barre au centre quand on active le mode swipe
  useEffect(() => { if (on && mode === 'swipe' && !dividerX) setDividerX(Math.round(map.getSize().x / 2)); }, [on, mode, map, dividerX]);

  // drag global de la barre
  useEffect(() => {
    const move = (e: any) => {
      if (!dragging.current) return;
      const rect = map.getContainer().getBoundingClientRect();
      const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      setDividerX(Math.max(0, Math.min(rect.width, cx)));
    };
    const up = () => { dragging.current = false; };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [map]);

  const compareUrl = () => {
    if (src === 'esri') return ESRI_WORLD_IMAGERY;
    if (src === 'osm') return 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    if (src === 'ghybrid') return 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
    const r = wb.find((w) => w.rel === rel) || wb[0];
    return r?.url || ESRI_WORLD_IMAGERY;
  };

  useEffect(() => {
    if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
    if (!on) return;
    const tl = L.tileLayer(compareUrl(), { pane: 'comparePane', maxZoom: 21 } as any);
    tl.addTo(map);
    layerRef.current = tl;
    return () => { if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, src, rel, wb, map]);

  useEffect(() => {
    const pane = map.getPane('comparePane'); if (!pane) return;
    const clearClip = () => { (pane.style as any).clip = ''; pane.style.clipPath = ''; };
    const update = () => {
      if (!on) { clearClip(); pane.style.opacity = '1'; return; }
      if (mode === 'blend') { clearClip(); pane.style.opacity = String(opacity / 100); return; }
      // SWIPE : clip en coordonnées "layer" pour compenser le transform de Leaflet
      pane.style.opacity = '1';
      const size = map.getSize();
      const x = dividerX || size.x / 2;
      const nw = map.containerPointToLayerPoint([0, 0]);
      const se = map.containerPointToLayerPoint([size.x, size.y]);
      const clipX = nw.x + (se.x - nw.x) * (x / size.x);
      (pane.style as any).clip = `rect(${nw.y}px, ${clipX}px, ${se.y}px, ${nw.x}px)`;
    };
    update();
    map.on('move zoom resize zoomend moveend viewreset', update);
    return () => { map.off('move zoom resize zoomend moveend viewreset', update); };
  }, [on, mode, dividerX, opacity, map, src, rel]);

  // frise temporelle Wayback (gauche = ancien, droite = récent)
  const wbIdx = wb.findIndex((w) => w.rel === rel);
  const sliderVal = wb.length ? (wb.length - 1 - (wbIdx < 0 ? 0 : wbIdx)) : 0;
  const inp = "w-full bg-(--bg-main) border border-(--border-color) text-(--text-main) rounded-md p-1.5 text-[11px]";

  return createPortal(
    <>
      {/* barre de swipe glissable */}
      {on && mode === 'swipe' && (
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: dividerX, width: 0, zIndex: 900, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: -1.5, width: 3, background: '#fff', boxShadow: '0 0 6px rgba(0,0,0,.6)' }} />
          <div onPointerDown={(e) => { dragging.current = true; e.preventDefault(); }}
            style={{ position: 'absolute', top: '50%', left: -18, marginTop: -18, width: 36, height: 36, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,.45)', cursor: 'ew-resize', pointerEvents: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#166534', fontSize: 16, fontWeight: 700 }}>
            ⇔
          </div>
        </div>
      )}

      {/* contrôle (bas-gauche, ouvre vers le haut) */}
      <div ref={ctrlRef} style={{ position: 'absolute', bottom: 30, left: 12, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {open && (
          <div className="w-64 bg-(--bg-surface) border border-(--border-color) rounded-xl shadow-2xl p-3 space-y-2.5 text-(--text-main)">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold flex items-center gap-1.5"><Contrast className="w-3.5 h-3.5" /> Détection de changement</span>
              <label className="flex items-center gap-1 text-[11px] cursor-pointer select-none">
                <input type="checkbox" checked={on} onChange={e => setOn(e.target.checked)} /> Activer
              </label>
            </div>
            <p className="text-[10px] text-(--text-muted) leading-tight">Compare la carte actuelle (Google) avec une imagerie de référence ou historique (Esri Wayback daté).</p>

            <div>
              <label className="text-[10px] font-semibold text-(--text-muted) uppercase">Couche de comparaison</label>
              <select value={src} onChange={e => setSrc(e.target.value as any)} className={inp}>
                <option value="wayback">Esri Wayback (historique daté)</option>
                <option value="esri">Esri World Imagery</option>
                <option value="ghybrid">Hybride Google</option>
                <option value="osm">OpenStreetMap</option>
              </select>
            </div>

            {src === 'wayback' && (
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-semibold text-(--text-muted) uppercase">Frise temporelle</label>
                  <span className="text-[11px] font-bold text-(--brand)">{wb[wbIdx]?.date ?? '—'}</span>
                </div>
                <input type="range" min={0} max={Math.max(0, wb.length - 1)} value={sliderVal}
                  onChange={e => { const idx = wb.length - 1 - Number(e.target.value); if (wb[idx]) setRel(wb[idx].rel); }}
                  className="w-full accent-(--brand)" disabled={wb.length === 0} />
                <div className="flex justify-between text-[9px] text-(--text-muted)"><span>{wb[wb.length - 1]?.date ?? 'ancien'}</span><span>{wb[0]?.date ?? 'récent'}</span></div>
              </div>
            )}

            <div className="flex gap-1 p-0.5 bg-(--bg-main) rounded-lg">
              <button onClick={() => setMode('blend')} className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold transition ${mode === 'blend' ? 'bg-(--brand) text-white shadow' : 'text-(--text-muted)'}`}>Fondu</button>
              <button onClick={() => setMode('swipe')} className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold transition ${mode === 'swipe' ? 'bg-(--brand) text-white shadow' : 'text-(--text-muted)'}`}>Swipe</button>
            </div>

            {mode === 'blend'
              ? <div><div className="flex items-center justify-between"><label className="text-[10px] text-(--text-muted)">Opacité</label><span className="text-[10px] font-semibold">{opacity}%</span></div><input type="range" min={0} max={100} value={opacity} onChange={e => setOpacity(Number(e.target.value))} className="w-full accent-(--brand)" /></div>
              : <p className="text-[10px] text-(--text-muted) leading-tight">Glissez la poignée <span className="font-bold text-(--text-main)">⇔</span> sur la carte. Gauche = imagerie de comparaison, droite = carte actuelle.</p>}
          </div>
        )}
        <button onClick={() => { setOpen(o => !o); if (!open && !on) setOn(true); }} title="Comparaison / détection de changement"
          className="w-10 h-10 bg-(--bg-surface) border border-(--border-color) text-(--brand) rounded-lg shadow-lg flex items-center justify-center hover:bg-(--bg-main) self-start">
          <Contrast className="w-5 h-5" />
        </button>
      </div>
    </>,
    map.getContainer()
  );
}

function AttributeTableModal({ layer, onClose }: { layer: any; onClose: () => void }) {
  const [q, setQ] = useState('');
  const gj = layer.geojson || layer.leafletLayer?.toGeoJSON?.();
  const features = gj ? (gj.type === 'FeatureCollection' ? gj.features : [gj]) : [];
  const cols = Array.from(new Set(features.flatMap((f: any) => Object.keys(f.properties || {})))).slice(0, 40) as string[];
  const rows = features.filter((f: any) => !q || JSON.stringify(f.properties || {}).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="fixed inset-0 z-2000 flex items-center justify-center p-3 bg-black/60" onClick={onClose}>
      <div className="bg-(--bg-surface) rounded-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden border border-(--border-color)" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-(--border-color) flex items-center justify-between shrink-0">
          <span className="font-bold text-sm text-(--text-main)">Table attributaire — {layer.name} ({rows.length}/{features.length})</span>
          <button onClick={onClose} className="text-(--text-muted) hover:text-(--text-main)">✕</button>
        </div>
        <div className="px-4 py-2 shrink-0">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrer (sélection par attribut)…"
            className="w-full bg-(--bg-main) border border-(--border-color) rounded-lg p-2 text-sm text-(--text-main)" />
        </div>
        <div className="flex-1 overflow-auto px-4 pb-4">
          <table className="w-full text-[11px] border-collapse">
            <thead className="sticky top-0 bg-(--bg-main)">
              <tr><th className="border border-(--border-color) px-2 py-1 text-(--text-muted)">#</th>
              {cols.map((c) => <th key={c} className="border border-(--border-color) px-2 py-1 text-left text-(--text-muted) whitespace-nowrap">{c}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((f: any, i: number) => (
                <tr key={i} className="hover:bg-(--bg-main)">
                  <td className="border border-(--border-color) px-2 py-1 text-(--text-muted)">{i + 1}</td>
                  {cols.map((c) => <td key={c} className="border border-(--border-color) px-2 py-1 text-(--text-main) whitespace-nowrap">{String(f.properties?.[c] ?? '')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function GeotoolsTab({ customLayers, setCustomLayers, featureGroupRef }: any) {
  const [tool, setTool] = useState<string>('points_to_polygon');
  const [layer1, setLayer1] = useState<string>('');
  const [layer2, setLayer2] = useState<string>('');
  const [radius, setRadius] = useState<number>(50);
  const [tableLayer, setTableLayer] = useState<any>(null);

  const SECOND = ['intersect', 'union', 'difference', 'symdiff', 'split', 'distance_boundary'];
  const DISTANCE = ['buffer', 'multibuffer'];

  const getGeojson = (l: any) => {
    if (!l) return null;
    if (l.geojson) return l.geojson;
    if (l.leafletLayer?.toGeoJSON) return l.leafletLayer.toGeoJSON();
    if (l.type === 'static_polygon' && l.areaCoords) {
      const coords = [...l.areaCoords];
      if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) coords.push([...coords[0]]);
      return turf.polygon([coords.map((c: any) => [c[1], c[0]])]);
    }
    return null;
  };

  const addResult = (resultGeojson: any, label: string) => {
    const id = `geotool-${Date.now()}`, color = '#eab308', opacity = 0.8;
    const leafletLayer = L.geoJSON(resultGeojson, {
      style: { color, weight: 2, opacity, fillOpacity: opacity * 0.4 },
      pointToLayer: (_f, latlng) => L.circleMarker(latlng, { radius: 6, fillColor: color, color, weight: 1, opacity: 1, fillOpacity: 0.8 }),
    });
    if (featureGroupRef?.current) featureGroupRef.current.addLayer(leafletLayer);
    setCustomLayers((prev: any) => [...prev, { id, name: `Résultat: ${label}`, type: 'imported', visible: true, color, opacity, geojson: resultGeojson, leafletLayer }]);
    alert('✅ Opération réussie — couche ajoutée.');
  };

  const executeTool = () => {
    // COGO : ne nécessite pas de couche source (on saisit des bornes)
    if (tool === 'cogo_lambert') {
      const raw = prompt('Collez les bornes en Lambert Nord (une par ligne, "X Y" ou "X,Y") :');
      if (!raw) return;
      const bornes = raw.split(/\n/).map((line) => line.trim().split(/[ ,;\t]+/).map(Number))
        .filter((a) => a.length >= 2 && !isNaN(a[0]) && !isNaN(a[1])).map((a) => ({ x: a[0], y: a[1] }));
      if (bornes.length < 3) return alert('Minimum 3 bornes valides requises.');
      const poly = polygonFromLambertBornes(bornes);
      if (!poly) return alert('Construction du polygone impossible.');
      return addResult(poly, 'Parcelle COGO (bornes Lambert)');
    }
    const l1 = customLayers.find((l: any) => l.id === layer1);
    if (!l1) return alert('Sélectionnez la couche principale.');
    const g1 = getGeojson(l1);
    if (!g1) return alert('Couche principale invalide.');
    const l2 = customLayers.find((l: any) => l.id === layer2);
    const g2 = getGeojson(l2);
    let result: any = null;
    try {
      switch (tool) {
        // ── Informations & attributs ──
        case 'calculate_geometry': {
          const area = turf.area(g1), len = turf.length(g1, { units: 'kilometers' });
          return alert(`📐 ${l1.name}\n\nSurface: ${(area / 10000).toFixed(4)} ha (${area.toFixed(2)} m²)\nPérimètre: ${len.toFixed(4)} km`);
        }
        case 'check_geometry':
          return alert(hasSelfIntersection(g1) ? '⚠️ Auto-intersections détectées — utilisez « Réparer la géométrie ».' : '✅ Géométrie valide.');
        case 'repair': result = repairGeometry(g1); break;
        // ── Export ──
        case 'export_kml': return downloadText(toKML(g1, l1.name), `${l1.name}.kml`, 'application/vnd.google-earth.kml+xml');
        case 'export_gpx': return downloadText(toGPX(g1, l1.name), `${l1.name}.gpx`, 'application/gpx+xml');
        case 'export_shp': return void exportShapefile(g1, l1.name, { lambert: false });
        case 'export_shp_lambert': return void exportShapefile(g1, l1.name, { lambert: true });
        case 'export_excel': {
          const features = g1.type === 'FeatureCollection' ? g1.features : [g1];
          const data = features.map((f: any) => ({ Couche: l1.name, Type: f.geometry?.type || '', ...f.properties }));
          const ws = XLSX.utils.json_to_sheet(data), wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Données');
          const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
          const blob = new Blob([buf], { type: 'application/octet-stream' });
          const url = URL.createObjectURL(blob);
          Object.assign(document.createElement('a'), { href: url, download: `${l1.name}.xlsx` }).click();
          URL.revokeObjectURL(url);
          return alert('✅ Excel téléchargé.');
        }
        // ── Topologie & géotraitement ──
        case 'buffer': result = turf.buffer(g1, radius, { units: 'meters' }); break;
        case 'multibuffer': result = multiRingBuffer(g1, [radius, radius * 2, radius * 3]); break;
        case 'intersect': if (!g2) return alert('Couche secondaire requise.'); result = clip(g1, g2); break;
        case 'union': if (!g2) return alert('Couche secondaire requise.'); result = unionAll(g1, g2); break;
        case 'difference': if (!g2) return alert('Couche secondaire requise.'); result = difference(g1, g2); break;
        case 'symdiff': if (!g2) return alert('Couche secondaire requise.'); result = symmetricDifference(g1, g2); break;
        case 'split': if (!g2) return alert('Ligne de coupe (couche secondaire) requise.'); result = splitPolygonByLine(g1, g2); break;
        case 'dissolve': result = dissolveAll(g1.type === 'FeatureCollection' ? g1.features : [g1]); break;
        // ── Géométrie & conversion ──
        case 'convex': result = convexHullOf(g1); break;
        case 'envelope': result = envelopeOf(g1); break;
        case 'centroid': result = centroidOf(g1); break;
        case 'voronoi': result = voronoiOf(g1); break;
        case 'explode': result = turf.explode(g1); break;
        case 'points_to_polygon': {
          if (g1.type === 'FeatureCollection') {
            const coords = g1.features.map((f: any) => f.geometry.coordinates);
            if (coords.length > 2) {
              if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) coords.push([...coords[0]]);
              result = turf.polygon([coords]);
            } else return alert('Minimum 3 points requis.');
          } else return alert('La couche doit contenir des points.');
          break;
        }
        case 'polygon_to_line': result = turf.polygonToLine(g1); break;
        // ── Plan à l'échelle ──
        case 'print_plan': {
          const sd = Number(prompt('Échelle 1:N (ex. 2000 pour 1:2000)', '2000')) || 2000;
          const svg = buildScaledPlanSVG(g1, { scaleDenominator: sd, title: l1.name, showBornes: true });
          printPlan(svg, l1.name);
          return;
        }
        // ── Proximité ──
        case 'distance_boundary': {
          if (!g2) return alert('Sélectionnez la couche forêt comme couche secondaire.');
          const c = centroidOf(g1);
          const d = distanceToBoundary(c, g2);
          return alert(d < 0 ? `Le centre est À L'INTÉRIEUR — à ${Math.abs(d).toFixed(0)} m du bord.` : `Distance au bord : ${d.toFixed(0)} m.`);
        }
        // ── Reprojection ──
        case 'reproject_lambert': {
          const t = structuredClone(g1);
          turf.coordEach(t, (cc: any) => { const p = proj4('EPSG:4326', 'EPSG:26191', cc); cc[0] = p[0]; cc[1] = p[1]; });
          downloadText(JSON.stringify(t, null, 2), `${l1.name}_lambert.geojson`, 'application/json');
          return alert('✅ GeoJSON Lambert téléchargé.');
        }
        case 'reproject_wgs84': {
          result = structuredClone(g1);
          turf.coordEach(result, (cc: any) => { const p = proj4('EPSG:26191', 'EPSG:4326', cc); cc[0] = p[0]; cc[1] = p[1]; });
          break;
        }
      }
      if (!result) return alert('Aucun résultat (géométries invalides ou pas de chevauchement). Essayez « Réparer ».');
      addResult(result, tool);
    } catch (e) {
      console.error('[geotool]', tool, e);
      alert('Erreur de traitement. Essayez « Réparer la géométrie » sur la couche d\'abord.');
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
              <option value="calculate_geometry">Calculer la géométrie (surface/périmètre)</option>
              <option value="check_geometry">Vérifier la géométrie</option>
              <option value="repair">Réparer la géométrie (ST_MakeValid)</option>
              <option value="export_excel">Exporter Excel (.xlsx)</option>
              <option value="export_kml">Exporter KML (QGIS)</option>
              <option value="export_gpx">Exporter GPX (GPS)</option>
              <option value="export_shp">Exporter Shapefile (.zip · WGS84)</option>
              <option value="export_shp_lambert">Exporter Shapefile (.zip · Lambert Nord)</option>
            </optgroup>
            <optgroup label="Topologie & Géotraitement">
              <option value="buffer">Zone tampon (Buffer)</option>
              <option value="multibuffer">Tampon multi-anneaux (×3)</option>
              <option value="intersect">Intersection (Clip)</option>
              <option value="union">Union</option>
              <option value="difference">Différence (Erase) — surface hors domaine</option>
              <option value="symdiff">Différence symétrique</option>
              <option value="split">Découper par ligne</option>
              <option value="dissolve">Fusionner (Dissolve)</option>
            </optgroup>
            <optgroup label="Géométrie & Conversion">
              <option value="convex">Enveloppe convexe</option>
              <option value="envelope">Boîte englobante</option>
              <option value="centroid">Centroïde</option>
              <option value="voronoi">Voronoï (couche de points)</option>
              <option value="explode">Extraire les sommets</option>
              <option value="points_to_polygon">Points → Polygone</option>
              <option value="polygon_to_line">Polygone → Ligne</option>
            </optgroup>
            <optgroup label="Bornage / Plan">
              <option value="cogo_lambert">Saisir parcelle par bornes Lambert (COGO)</option>
              <option value="print_plan">Imprimer un plan à l'échelle (1:N)</option>
            </optgroup>
            <optgroup label="Proximité">
              <option value="distance_boundary">Distance au bord (forêt en 2ᵉ couche)</option>
            </optgroup>
            <optgroup label="Reprojection">
              <option value="reproject_lambert">Reprojeter → Lambert Nord (export)</option>
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
        {SECOND.includes(tool) && (
          <div>
            <label className="text-xs font-semibold text-(--text-muted) uppercase tracking-wider mb-1.5 block">Couche secondaire</label>
            <select value={layer2} onChange={e => setLayer2(e.target.value)} className={sel}>
              <option value="">Sélectionner une couche…</option>
              {customLayers.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}
        {DISTANCE.includes(tool) && (
          <div>
            <label className="text-xs font-semibold text-(--text-muted) uppercase tracking-wider mb-1.5 block">Distance (mètres){tool === 'multibuffer' ? ' — base ×1 / ×2 / ×3' : ''}</label>
            <input type="number" value={radius} onChange={e => setRadius(Number(e.target.value))} min={1} className={sel} />
          </div>
        )}
        <button onClick={executeTool} className="w-full mt-4 bg-(--brand) hover:opacity-90 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2">
          <Combine className="w-4 h-4" /> Exécuter
        </button>
        <button onClick={() => { const l = customLayers.find((x: any) => x.id === layer1); if (!l) return alert('Sélectionnez la couche principale.'); setTableLayer(l); }}
          className="w-full bg-(--bg-main) border border-(--border-color) hover:border-(--brand) text-(--text-main) text-xs font-semibold py-2 rounded-lg">
          Table attributaire de la couche
        </button>
      </div>
      {tableLayer && <AttributeTableModal layer={tableLayer} onClose={() => setTableLayer(null)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatsPanel — Statistics dashboard for all layers
// ─────────────────────────────────────────────────────────────────────────────
function StatsPanel({ customLayers, chevauchementResults }: { customLayers: any[]; chevauchementResults: Record<string, ChevauchementResult> }) {
  const polyLayers = customLayers.filter((l: any) => l.geojson && (JSON.stringify(l.geojson).includes('"Polygon"') || JSON.stringify(l.geojson).includes('"MultiPolygon"')));
  const totalArea = polyLayers.reduce((sum: number, l: any) => { try { return sum + turf.area(l.geojson) / 10000; } catch { return sum; } }, 0);
  const allResults = Object.entries(chevauchementResults);
  const avgPct = allResults.length > 0 ? allResults.reduce((s, [, r]) => s + (r.totalPercentage || 0), 0) / allResults.length : 0;
  const inside = allResults.filter(([, r]) => r.globalPosition === 'داخل الملك الغابوي').length;
  const partial = allResults.filter(([, r]) => r.globalPosition === 'جزئيا داخل الملك الغابوي').length;
  const outside = allResults.filter(([, r]) => r.globalPosition === 'خارج الملك الغابوي').length;

  return (
    <div className="bg-(--bg-main) rounded-xl border border-(--brand)/30 p-3 space-y-3 mb-2 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-center gap-1.5">
        <BarChart3 className="w-3.5 h-3.5 text-(--brand)" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-(--brand)">Tableau de bord</span>
        <span className="text-[8px] text-(--text-muted) ml-auto font-mono">إحصائيات</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Couches totales', value: String(customLayers.length), color: 'var(--brand)' },
          { label: 'Surface totale', value: totalArea > 0 ? `${totalArea.toFixed(2)} ha` : '—', color: '#22c55e' },
          { label: 'Analysées', value: String(allResults.length), color: '#3b82f6' },
          { label: 'Chevauch. moy.', value: allResults.length > 0 ? `${avgPct.toFixed(1)}%` : '—', color: avgPct > 5 ? '#ef4444' : '#22c55e' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-(--bg-surface) rounded-lg border border-(--border-color) px-2.5 py-2 flex flex-col gap-0.5">
            <span className="text-[8px] uppercase tracking-wider text-(--text-muted) font-medium">{label}</span>
            <span className="text-[15px] font-black font-mono leading-tight" style={{ color }}>{value}</span>
          </div>
        ))}
      </div>
      {allResults.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[9px] font-bold uppercase tracking-wider text-(--text-muted)">Statuts chevauchement</span>
          <div className="flex gap-2">
            {[
              { label: 'Inclus', count: inside, color: '#ef4444' },
              { label: 'Partiel', count: partial, color: '#f97316' },
              { label: 'Hors', count: outside, color: '#22c55e' },
            ].map(({ label, count, color }) => (
              <div key={label} className="flex-1 rounded-lg border py-1.5 text-center" style={{ borderColor: color + '44', backgroundColor: color + '12' }}>
                <p className="text-[13px] font-black" style={{ color }}>{count}</p>
                <p className="text-[8px] font-bold uppercase" style={{ color }}>{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      <button
        onClick={() => {
          const lines = [
            `DOMAINE FORESTIER — Statistiques — ${new Date().toLocaleDateString('fr-MA')}`,
            `Couches totales: ${customLayers.length}`,
            `Surface totale polygones: ${totalArea.toFixed(3)} ha`,
            `Couches analysées: ${allResults.length}`,
            `Chevauchement moyen: ${avgPct.toFixed(2)}%`,
            `Incluses: ${inside} | Partielles: ${partial} | Hors domaine: ${outside}`,
          ];
          const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          Object.assign(document.createElement('a'), { href: url, download: 'stats_domaine_forestier.txt' }).click();
          URL.revokeObjectURL(url);
        }}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-bold text-(--text-muted) hover:text-(--brand) border border-(--border-color) hover:border-(--brand)/40 rounded-lg transition-all"
      >
        <Printer className="w-3 h-3" /> Exporter les statistiques
      </button>
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
            <div className="flex items-center gap-1">
              <PenLine className="w-3 h-3 text-(--brand) shrink-0" />
              <input
                ref={renameInputRef}
                type="text"
                value={renameVal}
                onChange={e => setRenameVal(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                  if (e.key === 'Escape') setIsRenaming(false);
                }}
                className="flex-1 text-[12px] font-semibold bg-(--bg-surface) border-2 border-(--brand) rounded-lg px-2 py-0.5 outline-none text-(--text-main) shadow-sm"
                autoFocus
              />
              <button onMouseDown={e => { e.preventDefault(); commitRename(); }}
                className="p-0.5 text-emerald-500 hover:text-emerald-400 shrink-0"><CheckCircle className="w-3.5 h-3.5" /></button>
              <button onMouseDown={e => { e.preventDefault(); setIsRenaming(false); }}
                className="p-0.5 text-red-400 hover:text-red-500 shrink-0"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <div className="flex-1 min-w-0 cursor-pointer group/name" onDoubleClick={() => { if (onRename) { setRenameVal(layer.name); setIsRenaming(true); } }}>
              <p
                className={cn("text-[12px] font-semibold leading-tight truncate", layer.visible ? "text-(--text-main)" : "text-(--text-muted)")}
                title={onRename ? `Double-clic pour renommer` : layer.name}
              >
                {layer.name}
              </p>
              {onRename && (
                <p className="text-[8px] text-(--text-muted) opacity-0 group-hover/name:opacity-60 transition-opacity font-medium">
                  ✏ double-clic pour renommer
                </p>
              )}
            </div>
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
          {/* Rename — always visible pencil icon */}
          {onRename && !isRenaming && (
            <button
              onClick={() => { setRenameVal(layer.name); setIsRenaming(true); setTimeout(() => renameInputRef.current?.select(), 50); }}
              title="Renommer la couche"
              className="p-1.5 text-(--text-muted) hover:text-(--brand) hover:bg-(--brand)/10 rounded-md transition-all opacity-60 hover:opacity-100 group-hover/layer:opacity-100"
            >
              <PenLine className="w-3.5 h-3.5" />
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