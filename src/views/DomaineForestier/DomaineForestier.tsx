import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polygon, useMapEvents, useMap, ZoomControl, Tooltip, LayersControl, Marker, FeatureGroup, Popup, GeoJSON, ScaleControl } from 'react-leaflet';
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
import { FicheModal, AttestationModal, ExpertiseModal, ChevauchementModal } from './DocumentModals';
import proj4 from 'proj4';

// Define Lambert Nord Maroc (EPSG:26191) with standard Merchich datum
proj4.defs("EPSG:26191", "+proj=lcc +lat_1=33.3 +lat_0=33.3 +lon_0=-5.4 +k_0=0.999625769 +x_0=500000 +y_0=300000 +a=6378249.2 +b=6356515 +towgs84=31,146,47,0,0,0,0 +units=m +no_defs");


// Fix Leaflet's default icon path issues
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    tooltipAnchor: [16, -28],
    shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;
import { 
  FileText, Search, Map as MapIcon, Layers, ChevronRight, ChevronLeft, X, User, 
  Target, Crosshair, Upload, Download, Eye, EyeOff, LayoutTemplate,
  PlusSquare, Trash2, Maximize, AlertCircle, ShieldAlert,
  Ruler, Printer, Share2, MapPin, MousePointer2, Settings, DownloadCloud, Palette,
  PanelRightOpen, ChevronDown, Menu, Navigation, Plus, Minus, LocateFixed, Hammer, Wrench, Scissors, Combine, Circle, Square, Triangle
} from 'lucide-react';
import { ViewState } from '../../types';
import { cn } from '../../lib/utils';

const { BaseLayer, Overlay } = LayersControl;

// Custom Marker for click
const customIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

function MapResizeHandler() {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

// Mock Forest Polygon Data for the Map
const forestPolygon: [number, number][] = [
  [35.62, -5.35],
  [35.64, -5.32],
  [35.63, -5.28],
  [35.61, -5.29],
  [35.59, -5.33],
  [35.60, -5.35]
];

const forestPolygon2: [number, number][] = [
  [35.55, -5.40],
  [35.58, -5.38],
  [35.56, -5.35],
  [35.53, -5.37]
];

type TabId = 'rapports' | 'recherche' | 'couches';

interface DomaineForestierProps {
  setCurrentView?: (view: ViewState) => void;
}

export interface MapLayer {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  color: string;
  areaCoords?: [number, number][]; 
  geojson?: any; 
  leafletLayer?: any; 
}

const MeasureSetup = () => {
  const map = useMap();
  useEffect(() => {
    if ((L.control as any).measure) {
      const measureControl = (L.control as any).measure({
        position: 'topright',
        primaryLengthUnit: 'meters',
        secondaryLengthUnit: 'kilometers',
        primaryAreaUnit: 'hectares',
        secondaryAreaUnit: 'sqmeters',
        activeColor: '#10B981',
        completedColor: '#059669',
      });
      measureControl.addTo(map);
      return () => {
        map.removeControl(measureControl);
      };
    }
  }, [map]);
  return null;
};

const GeomanSetup = ({ setCustomLayers }: { setCustomLayers: any }) => {
  const map = useMap();
  useEffect(() => {
    map.pm.addControls({
      position: 'topright',
      drawCircle: false,
      drawCircleMarker: false,
      drawPolyline: true,
      drawRectangle: true,
      drawPolygon: true,
      drawText: false,
      editMode: true,
      dragMode: true,
      cutPolygon: false,
      removalMode: true,
    });

    map.pm.setGlobalOptions({
      measurements: { measurement: true, displayFormat: 'metric' }
    });
    
    map.pm.setLang('fr');

    const handleCreate = (e: any) => {
      try {
        const layer = e.layer;
        const id = `drawn-${L.stamp(layer)}`;
        const geojson = layer.toGeoJSON();
        
        let area = 0;
        let distance = 0;
        let typeName = e.shape;
        
        if (e.shape === 'Polygon' || e.shape === 'Rectangle') {
          area = turf.area(geojson);
        } else if (e.shape === 'Line') {
          distance = turf.length(geojson, { units: 'kilometers' });
        }
        
        let content = `<div style="max-height: 250px; overflow-y: auto;"><b style="font-size:14px;display:block;margin-bottom:8px;border-bottom:1px solid #eee;padding-bottom:4px;">Élément dessiné (${typeName})</b>`;
        
        if (area > 0) {
           content += `<b>Géométrie (Polygone)</b><br/>`;
           if (area < 10000) {
              content += `Surface: ${area.toFixed(2)} m²<br/>`;
           } else {
              content += `Surface: ${(area / 10000).toFixed(2)} Ha<br/>`;
           }
           const length = turf.length(geojson, { units: 'kilometers' });
           content += `Périmètre: ${length.toFixed(2)} km<br/>`;
        } else if (distance > 0) {
           content += `<b>Géométrie (Ligne)</b><br/>`;
           content += `Longueur: ${distance.toFixed(2)} km<br/>`;
        } else if (e.shape === 'Marker' || e.shape === 'CircleMarker') {
           const [lng, lat] = geojson.geometry.coordinates;
           content += `<b>Géométrie (Point)</b><br/>`;
           content += `Lon: ${lng.toFixed(6)}<br/>Lat: ${lat.toFixed(6)}<br/>`;
        }
        content += `</div>`;
        layer.bindPopup(content);
        
        setTimeout(() => {
          if (layer.openPopup) layer.openPopup();
        }, 100);

        setCustomLayers((prev: any) => [...prev, {
          id,
          name: `Couche dessinée (${typeName})`,
          type: 'drawn',
          visible: true,
          color: '#3388ff',
          leafletLayer: layer
        }]);
      } catch (err) {
        console.error("Error creating layer geojson features", err);
      }
    };

    const handleRemove = (e: any) => {
      const layer = e.layer;
      const id = `drawn-${L.stamp(layer)}`;
      setCustomLayers((prev: any) => prev.filter((l: any) => l.id !== id));
    };

    map.on('pm:create', handleCreate);
    map.on('pm:remove', handleRemove);

    return () => {
      map.pm.removeControls();
      map.off('pm:create', handleCreate);
      map.off('pm:remove', handleRemove);
    };
  }, [map, setCustomLayers]);
  return null;
};

const MapEvents = ({ setCoords }: { setCoords: any }) => {
  useMapEvents({
    mousemove(e) {
      setCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
    }
  });
  return null;
};

const MapCenterUpdater = ({ mapTargetCenter, setMapTargetCenter }: { mapTargetCenter: any, setMapTargetCenter: any }) => {
  const map = useMap();
  useEffect(() => {
    if (mapTargetCenter) {
      map.setView(mapTargetCenter, 14);
      setMapTargetCenter(null);
    }
  }, [mapTargetCenter, map, setMapTargetCenter]);

  useEffect(() => {
    const handleMapCenterExtent = () => {
      map.setView([35.65, -5.35], 11); // Center over M'diq Tetouan
    };
    window.addEventListener('mapCenterExtent', handleMapCenterExtent);
    return () => {
      window.removeEventListener('mapCenterExtent', handleMapCenterExtent);
    };
  }, [map]);

  useEffect(() => {
    const handleFlyToBounds = (e: Event) => {
      const bounds = (e as CustomEvent).detail;
      if (bounds) {
        map.fitBounds(bounds, { padding: [20, 20], maxZoom: 16 });
      }
    };
    window.addEventListener('flyToBounds', handleFlyToBounds);
    return () => {
      window.removeEventListener('flyToBounds', handleFlyToBounds);
    };
  }, [map]);
  return null;
};

const MapResizeTracker = ({ isPanelCollapsed }: { isPanelCollapsed: boolean }) => {
  const map = useMapEvents({});
  useEffect(() => {
    const container = map.getContainer();
    if (!container) return;
    
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [map]);
  
  useEffect(() => {
    let start = performance.now();
    const frame = () => {
      map.invalidateSize();
      if (performance.now() - start < 350) {
        requestAnimationFrame(frame);
      }
    };
    setTimeout(() => requestAnimationFrame(frame), 50);
  }, [isPanelCollapsed, map]);
  
  return null;
};

const CustomMapEventsHandler = ({ setCustomLayers }: { setCustomLayers: any }) => {
  const map = useMap();
  useEffect(() => {
    const handleZoomIn = () => map.zoomIn();
    const handleZoomOut = () => map.zoomOut();
    
    const executeSearchObject = (data: any) => {
      const lat = parseFloat(data.lat);
      const lon = parseFloat(data.lon);
      
      if (data.boundingbox) {
         map.fitBounds([
             [parseFloat(data.boundingbox[0]), parseFloat(data.boundingbox[2])],
             [parseFloat(data.boundingbox[1]), parseFloat(data.boundingbox[3])]
         ]);
      } else {
         map.flyTo([lat, lon], 14);
      }
      
      if ((map as any)._searchMarker) map.removeLayer((map as any)._searchMarker);
      
      const popupDiv = document.createElement('div');
      popupDiv.className = 'p-1 min-w-[200px]';
      popupDiv.innerHTML = `
        <h4 class="font-bold text-sm mb-1 text-stone-800">${data.display_name || 'Point de recherche'}</h4>
        <p class="text-xs text-stone-500 mb-3 font-mono">Lat: ${lat.toFixed(6)}<br/>Lng: ${lon.toFixed(6)}</p>
        <div class="flex gap-2">
          <button id="btn-keep-marker" class="flex-1 px-2 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded shadow-sm transition-colors">Conserver</button>
          <button id="btn-remove-marker" class="flex-1 px-2 py-1.5 bg-red-500 hover:bg-red-600 text-white text-[11px] font-bold rounded shadow-sm transition-colors">Effacer</button>
        </div>
      `;

      const marker = L.marker([lat, lon], { icon: customIcon }).addTo(map);
      marker.bindPopup(popupDiv).openPopup();
      
      popupDiv.querySelector('#btn-keep-marker')?.addEventListener('click', () => {
         marker.closePopup();
         delete (map as any)._searchMarker; // detached from auto-remove
         
         const id = `search-${Date.now()}`;
         setCustomLayers((prev: any) => [...prev, {
            id,
            name: `Recherche: ${data.display_name?.substring(0, 20) || 'Point'}`,
            type: 'drawn',
            visible: true,
            color: '#10b981',
            leafletLayer: marker
         }]);
      });
      
      popupDiv.querySelector('#btn-remove-marker')?.addEventListener('click', () => {
         map.removeLayer(marker);
         delete (map as any)._searchMarker;
      });

      (map as any)._searchMarker = marker;
    };

    const handleSearchEvent = (e: any) => {
      if (e.detail && e.detail.lat) {
         executeSearchObject(e.detail);
      }
    };

    const handleLocateUser = () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            map.flyTo([latitude, longitude], 17, { duration: 1 });
            
            if ((map as any)._userLocationMarker) {
               map.removeLayer((map as any)._userLocationMarker);
            }
            if ((map as any)._userLocationCircle) {
               map.removeLayer((map as any)._userLocationCircle);
            }
            
            const userIcon = L.divIcon({
              className: 'user-location-marker',
              html: `<div style="width:16px;height:16px;background-color:#3b82f6;border-radius:50%;border:2px solid white;box-shadow:0 0 10px rgba(0,0,0,0.3);"></div>`,
              iconSize: [16, 16],
              iconAnchor: [8, 8]
            });
            
            const marker = L.marker([latitude, longitude], { icon: userIcon }).addTo(map);
            const circle = L.circle([latitude, longitude], { radius: accuracy, color: '#3b82f6', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.15 }).addTo(map);
            
            marker.bindTooltip("Votre Position", { permanent: false, direction: "top", offset: [0, -10] });

            (map as any)._userLocationMarker = marker;
            (map as any)._userLocationCircle = circle;
          },
          (error) => {
            console.error(error);
            alert("Erreur de géolocalisation: " + error.message);
          },
          {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 10000
          }
        );
      } else {
         alert("Géolocalisation non supportée.");
      }
    };

    const handleSearchString = async (e: any) => {
      const query = e.detail;
      if (!query) return;
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
        const data = await res.json();
        if (data && data.length > 0) {
          executeSearchObject(data[0]);
        } else {
          alert("Lieu introuvable");
        }
      } catch (err) {
        console.error("Search error", err);
      }
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

import { DomaineForestierProps } from '../../types';

export function DomaineForestier({ setCurrentView }: DomaineForestierProps) {
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'rapports' | 'recherche' | 'couches'>('rapports');
  const [coords, setCoords] = useState<{ lat: number, lng: number }>({ lat: 35.624793, lng: -5.329056 });
  const [mapTargetCenter, setMapTargetCenter] = useState<[number, number] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const featureGroupRef = useRef<L.FeatureGroup>(null);
  const searchTimeoutRef = useRef<any>(null);

  const fetchSearchResults = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    setIsSearching(true);
    try {
      // Add more comprehensive parameters for Nominatim OpenStreetMap search
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=8&addressdetails=1`);
      const data = await res.json();
      setSearchResults(data || []);
      setShowDropdown(true);
    } catch (err) {
      console.error("Search fetch error", err);
    } finally {
      setIsSearching(false);
    }
  };

  const onSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      fetchSearchResults(val);
    }, 500);
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
       // Fallback string search
       window.dispatchEvent(new CustomEvent('mapSearchString', { detail: searchQuery }));
    }
  };
  
  const [customLayers, setCustomLayers] = useState<any[]>([
    {
      id: 'df-1',
      name: 'Domaine Forestier - Secteur Alpha',
      type: 'static_polygon',
      visible: true,
      color: '#10b981',
      areaCoords: forestPolygon
    },
    {
      id: 'df-2',
      name: 'Forêt de Jbel Dersa',
      type: 'static_polygon',
      visible: true,
      color: '#84cc16',
      areaCoords: forestPolygon2
    }
  ]);

  // Lambert converter using proj4
  const calcLambert = (lat: number, lng: number) => {
    const projected = proj4('EPSG:4326', 'EPSG:26191', [lng, lat]);
    return {
      x: projected[0].toFixed(2),
      y: projected[1].toFixed(2)
    };
  };

  const calcLngLatFromLambert = (x: number, y: number) => {
    const projected = proj4('EPSG:26191', 'EPSG:4326', [x, y]);
    return {
      lng: projected[0],
      lat: projected[1]
    };
  };

  return (
    <div className="flex w-full h-full font-sans bg-[var(--bg-main)] flex-col md:flex-row">
      
      {/* Main Map Area */}
      <div className="relative bg-[#121214] border-b md:border-b-0 md:border-r border-[var(--border-color)] overflow-hidden h-[35vh] md:h-full md:flex-1 shrink-0 z-10 md:shrink">
        
        <MapContainer 
          center={[35.6, -5.35]} 
          zoom={12} 
          zoomControl={false}
          className="h-full w-full cursor-crosshair outline-none bg-[#e5e7eb]"
        >
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
          
          {/* Render custom layers manually */}
          {customLayers.filter((l: any) => l.visible).map((layer: any) => {
            const currentOpacity = layer.opacity ?? 1;
            if (layer.type === 'static_polygon' && layer.areaCoords) {
               // Calculate area of static polygon using turf
               const mockGeoJSON = turf.polygon([[...layer.areaCoords, layer.areaCoords[0]]] as any);
               const area = turf.area(mockGeoJSON);
               return (
                 <Polygon 
                   key={layer.id}
                   positions={layer.areaCoords} 
                   pathOptions={{ color: layer.color, fillColor: layer.color, opacity: currentOpacity, fillOpacity: currentOpacity * 0.4, weight: 2 }}
                 >
                   <Tooltip sticky className="custom-tooltip">{layer.name}</Tooltip>
                   <Popup>
                     <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                        <b style={{ fontSize: '14px', display: 'block', marginBottom: '8px', borderBottom: '1px solid #eee', paddingBottom: '4px' }}>{layer.name}</b>
                        <b>Géométrie (Polygone)</b><br/>
                        {area < 10000 ? (
                           <>Surface: {area.toFixed(2)} m²<br/></>
                        ) : (
                           <>Surface: {(area / 10000).toFixed(2)} Ha<br/></>
                        )}
                        Périmètre: {turf.length(mockGeoJSON, { units: 'kilometers' }).toFixed(2)} km
                     </div>
                   </Popup>
                 </Polygon>
               );
            }
            return null;
          })}

          <FeatureGroup ref={featureGroupRef} />
          <GeomanSetup setCustomLayers={setCustomLayers} />
          <MeasureSetup />
          <MapEvents setCoords={setCoords} />
          <MapResizeTracker isPanelCollapsed={isPanelCollapsed} />
          <MapCenterUpdater mapTargetCenter={mapTargetCenter} setMapTargetCenter={setMapTargetCenter} />
          <CustomMapEventsHandler setCustomLayers={setCustomLayers} />
          <ScaleControl position="bottomleft" imperial={false} />
        </MapContainer>

        {/* Google Maps style Search Bar */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 md:left-6 md:translate-x-0 z-[1000] pointer-events-auto w-[90vw] md:w-[380px]">
          <div className="flex items-center bg-white rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.2)] pl-3 pr-2 py-2 w-full">
            <button className="p-2 text-gray-700 hover:text-black transition-colors rounded-full hover:bg-gray-100 mr-2">
              <Menu className="size-5" />
            </button>
            <input 
              type="text" 
              placeholder="Rechercher dans la Carte" 
              value={searchQuery}
              onChange={onSearchInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleMapSearch();
                }
              }}
              onFocus={() => { if(searchResults.length > 0) setShowDropdown(true); }}
              className="flex-1 bg-transparent px-1 text-[15px] font-medium text-gray-800 placeholder-gray-500 outline-none w-full"
            />
            {searchQuery && (
              <button 
                onClick={() => { setSearchQuery(''); setSearchResults([]); setShowDropdown(false); }} 
                className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors"
                title="Effacer"
              >
                <X className="size-4" />
              </button>
            )}
            <button onClick={() => handleMapSearch()} className="p-2 text-gray-600 hover:text-gray-900 transition-colors">
              <Search className="size-5" />
            </button>
            <div className="w-[1px] h-6 bg-gray-300 mx-1"></div>
            <button 
              className="p-2 text-blue-600 hover:bg-blue-50 transition-colors rounded-full ml-1" 
              title="Itinéraire / Actions Spatiales"
            >
              <Navigation className="size-5" style={{ transform: 'rotate(45deg)' }} />
            </button>
          </div>

          {/* Search Results Dropdown */}
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute top-[calc(100%+8px)] left-0 right-0 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-[1001]">
               {searchResults.map((result: any, i: number) => {
                 const parts = result.display_name.split(',');
                 const title = parts[0];
                 const subtitle = parts.slice(1).join(',').trim();
                 return (
                   <div 
                     key={i} 
                     onClick={() => handleMapSearch(result)}
                     className="flex items-start gap-3 p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0"
                   >
                     <MapPin className="size-5 text-gray-400 mt-0.5 shrink-0" />
                     <div className="flex flex-col flex-1 overflow-hidden">
                       <span className="text-sm font-medium text-gray-800 truncate">{title}</span>
                       <span className="text-xs text-gray-500 truncate">{subtitle}</span>
                     </div>
                   </div>
                 );
               })}
            </div>
          )}
        </div>

        {/* Custom Zoom Controls (Google Maps Style) */}
        <div className="absolute bottom-6 right-6 flex flex-col gap-3 z-[1000] pointer-events-auto">
          <button 
             onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.dispatchEvent(new CustomEvent('locateUser')); }}
             className="w-[42px] h-[42px] flex items-center justify-center bg-[#1a1a1c] hover:bg-[#2a2a2c] text-blue-400 hover:text-blue-300 transition-colors border border-white/5 rounded-[14px] shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
             title="Ma Localisation"
          >
             <LocateFixed className="size-5" />
          </button>
          
          <div className="flex flex-col bg-[#1a1a1c] rounded-[14px] shadow-[0_2px_8px_rgba(0,0,0,0.4)] overflow-hidden border border-white/5">
            <button 
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.dispatchEvent(new CustomEvent('zoomIn')); }}
              className="w-[42px] h-[42px] flex items-center justify-center hover:bg-[#2a2a2c] text-neutral-300 hover:text-white transition-colors"
              title="Zoom In"
            >
              <Plus className="size-6" strokeWidth={2.5} />
            </button>
            <div className="w-5 h-[1px] bg-white/10 mx-auto"></div>
            <button 
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.dispatchEvent(new CustomEvent('zoomOut')); }}
              className="w-[42px] h-[42px] flex items-center justify-center hover:bg-[#2a2a2c] text-neutral-300 hover:text-white transition-colors"
              title="Zoom Out"
            >
              <Minus className="size-6" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Minimalist Coordinate HUD moved slightly to not overlap */}
        <div className="absolute bottom-4 left-4 md:left-[110px] z-[1000] bg-[#1a1a1c]/80 backdrop-blur-md border border-white/10 rounded-lg px-3 py-1 flex items-center gap-3 shadow-[0_2px_6px_rgba(0,0,0,0.5)] pointer-events-auto">
           <div className="flex items-center gap-1.5 cursor-crosshair">
              <div className="size-1.5 rounded-full bg-emerald-500"></div>
              <span className="text-white font-mono text-[10px] tracking-wide">{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</span>
           </div>
           <div className="w-px h-3 bg-white/20 my-auto"></div>
           <div className="flex items-center cursor-crosshair">
              <span className="text-emerald-400 font-mono text-[10px] tracking-wide">
                 X: {calcLambert(coords.lat, coords.lng).x} | Y: {calcLambert(coords.lat, coords.lng).y}
              </span>
           </div>
        </div>
      </div>

      {/* Sidebar Container */}
        <div 
        className={cn(
          "flex-[0_0_auto] flex flex-col bg-[var(--bg-surface)] border-l border-[var(--border-color)] text-[var(--text-main)] transition-all duration-300 relative z-10 shrink-0",
           isPanelCollapsed ? "w-0 overflow-hidden md:w-16 cursor-pointer items-center justify-center hover:bg-[var(--bg-main)]" : "w-full md:w-[340px]"
        )}
        onClick={() => isPanelCollapsed && setIsPanelCollapsed(false)}
      >
        {isPanelCollapsed && (
          <div className="flex flex-col items-center py-5 h-full transition-opacity duration-300 w-full" onClick={() => setIsPanelCollapsed(false)}>
            <button className="p-2 text-[var(--text-muted)] hover:text-[var(--text-main)] bg-[var(--bg-main)] hover:bg-[var(--bg-surface)] rounded-lg transition-colors border border-[var(--border-color)] shadow-sm mb-6">
               <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex flex-col gap-2 w-full px-3 items-center">
               <button onClick={(e) => { e.stopPropagation(); setActiveTab('rapports'); setIsPanelCollapsed(false); }} className={`p-2 rounded-lg flex items-center justify-center transition-colors ${activeTab === 'rapports' ? 'bg-[var(--bg-surface)] text-[var(--brand)] border border-[var(--border-color)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-main)]'}`} title="Rapports">
                  <FileText className="w-4 h-4" />
               </button>
               <button onClick={(e) => { e.stopPropagation(); setActiveTab('recherche'); setIsPanelCollapsed(false); }} className={`p-2 rounded-lg flex items-center justify-center transition-colors ${activeTab === 'recherche' ? 'bg-[var(--bg-surface)] text-[var(--brand)] border border-[var(--border-color)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-main)]'}`} title="Recherche">
                  <Search className="w-4 h-4" />
               </button>
               <button onClick={(e) => { e.stopPropagation(); setActiveTab('couches'); setIsPanelCollapsed(false); }} className={`p-2 rounded-lg flex items-center justify-center transition-colors ${activeTab === 'couches' ? 'bg-[var(--bg-surface)] text-[var(--brand)] border border-[var(--border-color)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-main)]'}`} title="Couches">
                  <Layers className="w-4 h-4" />
               </button>
               <button onClick={(e) => { e.stopPropagation(); setActiveTab('geotools'); setIsPanelCollapsed(false); }} className={`p-2 rounded-lg flex items-center justify-center transition-colors ${activeTab === 'geotools' ? 'bg-[var(--bg-surface)] text-[var(--brand)] border border-[var(--border-color)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-main)]'}`} title="Géotraitement">
                  <Wrench className="w-4 h-4" />
               </button>
            </div>
            
            <div className="mt-auto px-3 w-full flex justify-center">
              {setCurrentView && (
                <button onClick={(e) => { e.stopPropagation(); setCurrentView('dashboard'); }} className="p-2 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-main)] rounded-lg transition-colors" title="Retour à l'accueil">
                  <LayoutTemplate className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {!isPanelCollapsed && (
          <div className="flex flex-col h-full w-full min-w-[280px] animate-in fade-in duration-300">
            {/* Header & User Info like the image */}
            <div className="p-3 shrink-0 bg-[var(--bg-surface)] relative overflow-hidden flex flex-col gap-3">
              <div className="flex justify-between items-center px-1">
                 <h2 className="text-[var(--text-main)] font-semibold text-sm tracking-wide flex items-center gap-1.5">
                   <Settings className="w-4 h-4 text-[var(--text-muted)]" /> Outils
                 </h2>
                 <button onClick={() => setIsPanelCollapsed(true)} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-main)] rounded-md transition-colors shrink-0">
                    <ChevronRight className="w-4 h-4" />
                 </button>
              </div>

              {/* Nav Tabs like image */}
              <div className="flex gap-1 bg-[var(--bg-main)] p-1 rounded-lg border border-[var(--border-color)] mt-2">
                <TabButton active={activeTab === 'rapports'} onClick={() => setActiveTab('rapports')} icon={FileText} label="Rapports" />
                <TabButton active={activeTab === 'recherche'} onClick={() => setActiveTab('recherche')} icon={Search} label="Recherche" />
                <TabButton active={activeTab === 'couches'} onClick={() => setActiveTab('couches')} icon={Layers} label="Couches" />
                <TabButton active={activeTab === 'geotools'} onClick={() => setActiveTab('geotools')} icon={Wrench} label="Outils" />
              </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-4 md:p-5 no-scrollbar pb-24 md:pb-6 text-left">
               {activeTab === 'rapports' && <RapportsTab />}
               {activeTab === 'recherche' && <RechercheTab calcLngLatFromLambert={calcLngLatFromLambert} />}
               {activeTab === 'couches' && <CouchesTab customLayers={customLayers} setCustomLayers={setCustomLayers} featureGroupRef={featureGroupRef} setIsPanelCollapsed={setIsPanelCollapsed} />}
               {activeTab === 'geotools' && <GeotoolsTab customLayers={customLayers} setCustomLayers={setCustomLayers} featureGroupRef={featureGroupRef} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- Sub Components ----------------

function TabButton({ active, onClick, icon: Icon, label }: any) {
  return (
    <button 
      onClick={onClick}
      className={`flex-1 flex flex-col items-center justify-center p-2 rounded-md transition-all ${
        active ? 'bg-[var(--bg-surface)] text-[var(--text-main)] shadow-sm border border-[var(--border-color)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-main)]'
      }`}
    >
      <Icon className="w-4 h-4 mb-1" />
      <span className="text-[10px] font-semibold tracking-wide">{label}</span>
    </button>
  );
}

// -- Rapports Tab --
function RapportsTab() {
  const [activeReport, setActiveReport] = useState<string | null>(null);
 
  return (
    <div className="space-y-4">
      <h2 className="text-[var(--text-main)] font-semibold text-lg tracking-tight mb-3 px-1">Rapports & Documents</h2>
      <div className="space-y-3">
        <ReportCard
          title="Rapport d'Expertise"
          subtitle="Woqof / Procès-verbal"
          desc="محضر التصريحات للمحكمة"
          color="#3b82f6"
          icon={FileText}
          onClick={() => setActiveReport("Rapport d'Expertise")}
        />
        <ReportCard
          title="Fiche Technique Réquisition"
          subtitle="PDF / Word · 7 sections"
          desc="Délimitation · Immatriculation · Empiètement"
          color="#22c55e"
          icon={LayoutTemplate}
          onClick={() => setActiveReport("Fiche Technique Réquisition")}
        />
        <ReportCard
          title="Attestation Administrative"
          subtitle="بطاقة معاينة — انتفاء الصبغة الغابوية"
          desc="ANEF · CPF M'diq-Fnideq · Tétouan"
          color="#8b5cf6"
          icon={Printer}
          onClick={() => setActiveReport("Attestation Administrative")}
        />
        <ReportCard
          title="Analyse Chevauchement"
          subtitle="Intersection · Domaine Forestier"
          desc="Importez une couche → onglet « Couches »"
          color="#eab308"
          icon={Maximize}
          onClick={() => setActiveReport("Analyse Chevauchement")}
        />
      </div>
 
      {/* Modals spécialisés */}
      {activeReport === "Fiche Technique Réquisition" && (
        <FicheModal onClose={() => setActiveReport(null)} />
      )}
      {activeReport === "Attestation Administrative" && (
        <AttestationModal onClose={() => setActiveReport(null)} />
      )}
      {activeReport === "Rapport d'Expertise" && (
        <ExpertiseModal onClose={() => setActiveReport(null)} />
      )}
      {activeReport === "Analyse Chevauchement" && (
        <ChevauchementModal onClose={() => setActiveReport(null)} />
      )}
    </div>
  );
}

function ReportCard({ title, subtitle, desc, icon: Icon, color, onClick }: any) {
  return (
    <div onClick={onClick} className="group bg-[var(--bg-main)] border border-[var(--border-color)] hover:border-[var(--brand)] rounded-xl p-3 cursor-pointer transition-all hover:shadow-sm">
      <div className="flex gap-3 items-center">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border border-[var(--border-color)] group-hover:border-[var(--brand)] transition-colors bg-[var(--bg-surface)] text-[var(--text-main)]" style={{ color: color || 'var(--text-main)' }}>
           <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1">
           <h4 className="text-[var(--text-main)] font-semibold text-[13px] leading-tight flex items-center justify-between">
             {title}
           </h4>
           <div className="text-[9px] uppercase tracking-wider mb-0.5 text-[var(--text-muted)] mt-0.5">{subtitle}</div>
           <p className="text-[10px] text-[var(--text-muted)] leading-snug">{desc}</p>
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-main)] transition-colors opacity-0 group-hover:opacity-100" />
      </div>
    </div>
  );
}

// -- Recherche Tab --
function RechercheTab({ calcLngLatFromLambert }: { calcLngLatFromLambert: (x: number, y: number) => {lat: number, lng: number} }) {
  const [lngVal, setLngVal] = useState('');
  const [latVal, setLatVal] = useState('');
  
  const [lambertX, setLambertX] = useState('');
  const [lambertY, setLambertY] = useState('');
  
  const [searchQuery, setSearchQuery] = useState('');

  const handleCenterWGS = () => {
    const lng = parseFloat(lngVal);
    const lat = parseFloat(latVal);
    if (!isNaN(lng) && !isNaN(lat)) {
      window.dispatchEvent(new CustomEvent('mapSearch', { 
        detail: { lat, lon: lng, display_name: `Point WGS84 (Lng: ${lng}, Lat: ${lat})` } 
      }));
    }
  };

  const handleCenterLambert = () => {
    const x = parseFloat(lambertX);
    const y = parseFloat(lambertY);
    if (!isNaN(x) && !isNaN(y)) {
      const coords = calcLngLatFromLambert(x, y);
      window.dispatchEvent(new CustomEvent('mapSearch', { 
        detail: { lat: coords.lat, lon: coords.lng, display_name: `Point Lambert (X: ${x}, Y: ${y})` } 
      }));
    }
  };

  const handleSearchByName = (e?: React.KeyboardEvent<HTMLInputElement>) => {
     if (!e || e.key === 'Enter') {
        if (searchQuery.trim()) {
          window.dispatchEvent(new CustomEvent('mapSearchString', { detail: searchQuery.trim() }));
        }
     }
  };

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <label className="text-[11px] uppercase font-bold tracking-wider text-[var(--text-muted)]">Rechercher Lieu</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input 
               type="text" 
               placeholder="Ex: Forêt Jbel Dersa..." 
               className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-[var(--brand)] shadow-sm" 
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               onKeyDown={handleSearchByName}
            />
          </div>
          <button onClick={() => handleSearchByName()} className="px-3 py-2 bg-[var(--brand)] hover:opacity-90 text-white font-bold text-xs rounded shadow-sm">
            GO
          </button>
        </div>
      </div>

      <div className="space-y-3 pt-8 border-t border-[var(--border-color)]">
        <label className="text-[11px] uppercase font-bold tracking-wider text-[var(--text-muted)]">Coordonnées WGS84</label>
        <div className="flex gap-2">
          <input type="number" step="any" value={lngVal} onChange={e => setLngVal(e.target.value)} placeholder="Longitude" className="flex-1 min-w-0 bg-[var(--bg-main)] border border-[var(--border-color)] rounded py-2 px-2 text-sm font-mono focus:outline-none focus:border-[var(--brand)] shadow-sm" />
          <input type="number" step="any" value={latVal} onChange={e => setLatVal(e.target.value)} placeholder="Latitude" className="flex-1 min-w-0 bg-[var(--bg-main)] border border-[var(--border-color)] rounded py-2 px-2 text-sm font-mono focus:outline-none focus:border-[var(--brand)] shadow-sm" />
          <button onClick={handleCenterWGS} className="px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border-color)] hover:bg-[var(--bg-main)] text-[var(--text-main)] font-bold text-xs rounded shadow-sm">
            GO
          </button>
        </div>
      </div>

      <div className="space-y-3 pt-8 border-t border-[var(--border-color)]">
        <label className="text-[11px] uppercase font-bold tracking-wider text-[var(--text-muted)]">Coordonnées Lambert</label>
        <div className="flex gap-2">
          <input type="number" step="any" value={lambertX} onChange={e => setLambertX(e.target.value)} placeholder="X" className="flex-1 min-w-0 bg-[var(--bg-main)] border border-[var(--border-color)] rounded py-2 px-2 text-sm font-mono focus:outline-none focus:border-[var(--brand)] shadow-sm" />
          <input type="number" step="any" value={lambertY} onChange={e => setLambertY(e.target.value)} placeholder="Y" className="flex-1 min-w-0 bg-[var(--bg-main)] border border-[var(--border-color)] rounded py-2 px-2 text-sm font-mono focus:outline-none focus:border-[var(--brand)] shadow-sm" />
          <button onClick={handleCenterLambert} className="px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border-color)] hover:bg-[var(--bg-main)] text-[var(--text-main)] font-bold text-xs rounded shadow-sm">
            GO
          </button>
        </div>
      </div>

      <div className="pt-8 border-t border-[var(--border-color)]">
         <button onClick={() => window.dispatchEvent(new CustomEvent('mapCenterExtent'))} className="w-full py-3 bg-[var(--bg-main)] hover:bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--brand)] font-bold rounded-lg text-sm transition-colors flex items-center justify-center gap-2 shadow-sm">
            <Target className="w-5 h-5" /> Centrer sur M'diq-Tétouan
         </button>
      </div>
    </div>
  );
}

// -- Couches Tab --
function CouchesTab({ customLayers, setCustomLayers, featureGroupRef, setIsPanelCollapsed }: any) {
  const fileInputRef = useRef<HTMLInputElement>(null);
// ═══════════════════════════════════════════════════════════════════════
// PATCH — CouchesTab في DomaineForestier.tsx
//
// التعديل 1: أضف هذا الكود مباشرة بعد السطر 974
//            (بعد: const fileInputRef = useRef<HTMLInputElement>(null);)
// ═══════════════════════════════════════════════════════════════════════
 
// ── Couches Officielles TTH ─────────────────────────────────────────────
const [officialVisible, setOfficialVisible] = useState<Record<string, boolean>>({
  forest: false, communes: false, provinces: false, region: false,
});
const officialRefs = useRef<Record<string, L.GeoJSON | null>>({});
 
const OFFICIAL = [
  {
    key: 'forest',
    label: 'Mlak Ghabi — ملك غابوي',
    file: '/assets/data/forest_limits.json',
    color: '#16a34a',
    weight: 2,
    tooltip: (p: any) => `🌲 ${p.FORET || ''} — ${p.CANTON || ''}\n${p.STADE || ''} · ${p.SUPERFICIE ? Math.round(p.SUPERFICIE) + ' ha' : ''}`,
  },
  {
    key: 'communes',
    label: 'Communes TTH',
    file: '/assets/data/Communes_TTH.json',
    color: '#3b82f6',
    weight: 1,
    tooltip: (p: any) => `🏘 ${p.NomFr || ''}\n${p.NomAr || ''}${p.Pop__24 ? '\nSakina: ' + Number(p.Pop__24).toLocaleString() : ''}`,
  },
  {
    key: 'provinces',
    label: 'Provinces TTH',
    file: '/assets/data/Provinces_TTH.json',
    color: '#f97316',
    weight: 2,
    tooltip: (p: any) => `🏛 ${p.Nom__Fr || ''}\n${p.Nom__Ar || ''}${p.Pop__24 ? '\nSakina: ' + Number(p.Pop__24).toLocaleString() : ''}`,
  },
  {
    key: 'region',
    label: 'Région TTH',
    file: '/assets/data/Region_TTH.json',
    color: '#8b5cf6',
    weight: 2.5,
    tooltip: (p: any) => `🗺 ${p.Nom__fr || ''}\n${p.Nom__ar || ''}${p.Pop__24 ? '\nSakina: ' + Number(p.Pop__24).toLocaleString() : ''}`,
  },
];
 
const toggleOfficial = async (
  key: string, file: string, color: string,
  weight: number, tooltip: (p: any) => string
) => {
  const fg = featureGroupRef.current;
  if (!fg) return;
 
  if (officialVisible[key]) {
    const ref = officialRefs.current[key];
    if (ref) { fg.removeLayer(ref); officialRefs.current[key] = null; }
    setOfficialVisible(p => ({ ...p, [key]: false }));
    return;
  }
 
  try {
    const res     = await fetch(file);
    const geojson = await res.json();
    const layer   = L.geoJSON(geojson, {
      style: { color, weight, fillColor: color, fillOpacity: 0.07, opacity: 0.85 },
      onEachFeature: (feature, lyr) => {
        const text = tooltip(feature.properties || {});
        lyr.bindTooltip(text, { sticky: true, className: 'leaflet-tooltip' });
        lyr.on('mouseover', function () { (lyr as L.Path).setStyle({ fillOpacity: 0.22, weight: weight + 1 }); });
        lyr.on('mouseout',  function () { (lyr as L.Path).setStyle({ fillOpacity: 0.07, weight }); });
      },
    });
    fg.addLayer(layer);
    officialRefs.current[key] = layer;
    setOfficialVisible(p => ({ ...p, [key]: true }));
  } catch (err) {
    console.error('[OfficialLayer]', key, err);
  }
};
// ── Fin Couches Officielles TTH
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase();
    const addLayer = (geojson: any) => {
      const id = `imported-${Date.now()}`;
      const color = '#38bdf8';
      const opacity = 0.8;
      
      const layer = L.geoJSON(geojson, {
        style: {
          color: color,
          weight: 2,
          opacity: opacity,
          fillOpacity: opacity * 0.4
        },
        pointToLayer: (feature, latlng) => {
           return L.circleMarker(latlng, {
              radius: 6,
              fillColor: color,
              color: color,
              weight: 1,
              opacity: 1,
              fillOpacity: 0.8
           });
        },
        onEachFeature: (feature, llayer) => {
           let html = `<div style="max-height: 250px; overflow-y: auto;"><b style="font-size:14px;display:block;margin-bottom:8px;border-bottom:1px solid #eee;padding-bottom:4px;">Import: ${file.name}</b>`;
           
           if (feature.geometry) {
              if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
                 const area = turf.area(feature);
                 const length = turf.length(feature, { units: 'kilometers' });
                 html += `<b>Géométrie (Polygone)</b><br/>`;
                 if (area < 10000) {
                    html += `Surface: ${area.toFixed(2)} m²<br/>`;
                 } else {
                    html += `Surface: ${(area / 10000).toFixed(2)} Ha<br/>`;
                 }
                 html += `Périmètre: ${length.toFixed(2)} km<br/><hr style="margin:8px 0; border:0; border-top:1px solid #eee;"/>`;
              } else if (feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString') {
                 const length = turf.length(feature, { units: 'kilometers' });
                 html += `<b>Géométrie (Ligne)</b><br/>`;
                 html += `Longueur: ${length.toFixed(2)} km<br/><hr style="margin:8px 0; border:0; border-top:1px solid #eee;"/>`;
              } else if (feature.geometry.type === 'Point') {
                 const [lng, lat] = feature.geometry.coordinates;
                 html += `<b>Géométrie (Point)</b><br/>`;
                 html += `Lon: ${lng.toFixed(6)}<br/>Lat: ${lat.toFixed(6)}<br/><hr style="margin:8px 0; border:0; border-top:1px solid #eee;"/>`;
              }
           }

           if (feature.properties) {
             html += `<table style="width:100%; border-collapse: collapse; font-size: 12px; margin-bottom:0;">`;
             for (const key in feature.properties) {
               if (feature.properties[key] !== null && feature.properties[key] !== undefined) {
                  html += `<tr><td style="padding:2px 4px; border:1px solid #eee; font-weight:bold; background:#f9f9f9;">${key}</td><td style="padding:2px 4px; border:1px solid #eee;">${feature.properties[key]}</td></tr>`;
               }
             }
             html += `</table>`;
           }
           html += `</div>`;
           llayer.bindPopup(html);
        }
      });

      if (featureGroupRef.current) {
        featureGroupRef.current.addLayer(layer);
        try {
           const bounds = layer.getBounds();
           if (bounds && bounds.isValid()) {
             window.dispatchEvent(new CustomEvent('flyToBounds', { detail: bounds }));
           }
        } catch(e) {}
      }

      setCustomLayers((prev: any) => [...prev, {
        id,
        name: file.name.replace(new RegExp('\\\\.[^/.]+$'), ""),
        type: 'imported',
        visible: true,
        color: color,
        opacity: opacity,
        geojson: geojson,
        leafletLayer: layer
      }]);
    };

    const ptsToPolygon = (features: any[]) => {
      if (features.length < 3) return turf.featureCollection(features);
      const coords = features.map((f: any) => f.geometry.coordinates);
      // Ensure polygon is closed
      if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
          coords.push([...coords[0]]);
      }
      try {
        return turf.featureCollection([turf.polygon([coords])]);
      } catch (e) {
        return turf.featureCollection(features);
      }
    };

    try {
      const extractFeatures = (dataArray: any[]) => {
        const latKeys = ['lat', 'latitude', 'y', 'y_lambert', 'y lambert'];
        const lngKeys = ['lng', 'longitude', 'x', 'lon', 'x_lambert', 'x lambert'];
        const getVal = (row: any, keys: string[]) => {
          for (let k in row) {
            const cleanKey = String(k).trim().toLowerCase();
            if (keys.includes(cleanKey)) return row[k];
          }
          return undefined;
        };

        return dataArray.map((row: any) => {
          const rawLat = getVal(row, latKeys);
          const rawLng = getVal(row, lngKeys);
          if (rawLat === undefined || rawLng === undefined) return null;
          
          let lat = parseFloat(String(rawLat).replace(',', '.'));
          let lng = parseFloat(String(rawLng).replace(',', '.'));
          if (isNaN(lat) || isNaN(lng)) return null;

          // Auto-detect Lambert coordinates (if magnitude > 180 or 90)
          if (Math.abs(lng) > 180 || Math.abs(lat) > 90) {
            try {
              // from EPSG:26191 (Lambert Nord Maroc) to EPSG:4326 (WGS84)
              const projected = proj4('EPSG:26191', 'EPSG:4326', [lng, lat]);
              lng = projected[0];
              lat = projected[1];
            } catch(e) {
              console.warn("Reprojection automatique échouée pour :", [lng, lat]);
            }
          }

          return turf.point([lng, lat], row);
        }).filter(Boolean);
      };

      if (extension === 'json' || extension === 'geojson') {
        const text = await file.text();
        addLayer(JSON.parse(text));
      } else if (extension === 'kml') {
        const text = await file.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/xml');
        const geojson = kml(doc);
        addLayer(geojson);
      } else if (extension === 'zip') {
        const buffer = await file.arrayBuffer();
        const geojson = await shp(buffer);
        addLayer(geojson);
      } else if (extension === 'csv') {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const features = extractFeatures(results.data);
            if(features.length > 0) addLayer(turf.featureCollection(features));
            else alert("Coordonnées non trouvées (nommez les colonnes X, Y ou lat, lng)");
          }
        });
      } else if (extension === 'xlsx' || extension === 'xls') {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const dataBuffer = e.target?.result as ArrayBuffer;
            const workbook = XLSX.read(new Uint8Array(dataBuffer), { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const data: any = XLSX.utils.sheet_to_json(firstSheet);
            
            const features = extractFeatures(data);
            if(features.length > 0) addLayer(turf.featureCollection(features));
            else alert("Coordonnées non trouvées (nommez les colonnes X, Y ou lat, lng)");
          } catch (err) {
            console.error(err);
            alert("Erreur de parsing du fichier Excel");
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        alert("Format non supporté (.geojson, .kml, .csv, .xlsx, .zip pour shp)");
      }
    } catch (err) {
      console.error("Erreur d'importation", err);
      alert("Erreur lors de l'import");
    }
  };

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
      if (layer && layer.leafletLayer) {
        if (featureGroupRef.current && featureGroupRef.current.hasLayer(layer.leafletLayer)) {
            featureGroupRef.current.removeLayer(layer.leafletLayer);
        } else {
            layer.leafletLayer.remove();
        }
      }
      return prev.filter((l: any) => l.id !== id);
    });
  };

  const updateLayerStyle = (layerState: any) => {
    if (!layerState.leafletLayer) return;
    let weight = layerState.size ? layerState.size / 2 : 2;
    let color = layerState.color || '#38bdf8';
    let opacity = layerState.opacity ?? 1;
    let fillOpacity = (layerState.fillMode === 'outline') ? 0 : (opacity * 0.4);
    let symbol = layerState.symbol || 'circle';

    if (layerState.leafletLayer.eachLayer) {
      layerState.leafletLayer.eachLayer((child: any) => {
        // Line/Polygon
        if (child.setStyle && !child.setRadius) {
          child.setStyle({ color, opacity, weight, fillColor: color, fillOpacity });
        }
        // Points
        if (child.feature && child.feature.geometry && child.feature.geometry.type === 'Point') {
          let radius = layerState.size ?? 6;
          
          if (child.setIcon) {
               if (symbol === 'square') {
                   child.setIcon(L.divIcon({
                      className: 'custom-square-marker',
                      html: `<div style="width:${radius*2}px;height:${radius*2}px;background-color:${fillOpacity > 0 ? color : 'transparent'};border:${weight}px solid ${color};opacity:${opacity}"></div>`,
                      iconSize: [radius*2, radius*2],
                      iconAnchor: [radius, radius]
                   }));
               } else if (symbol === 'triangle') {
                   child.setIcon(L.divIcon({
                      className: 'custom-triangle-marker',
                      html: `<div style="width:0;height:0;border-left:${radius}px solid transparent;border-right:${radius}px solid transparent;border-bottom:${radius*2}px solid ${fillOpacity > 0 ? color : 'transparent'};opacity:${opacity};filter:drop-shadow(0 -${weight}px 0 ${color}) drop-shadow(${weight}px ${weight}px 0 ${color}) drop-shadow(-${weight}px ${weight}px 0 ${color});"></div>`,
                      iconSize: [radius*2, radius*2],
                      iconAnchor: [radius, radius]
                   }));
               }
          } else if (child.setRadius) {
             child.setRadius(radius);
             child.setStyle({ color, opacity, weight: 1, fillColor: color, fillOpacity: fillOpacity > 0 ? opacity : 0 });
          }
        }
      });
    }
  };

  const changeColor = (id: string, color: string) => {
     setCustomLayers((prev: any) => prev.map((l: any) => {
      if (l.id === id) {
        const nextState = { ...l, color };
        updateLayerStyle(nextState);
        return nextState;
      }
      return l;
    }));
  }

  const changeOpacity = (id: string, opacity: number) => {
    setCustomLayers((prev: any) => prev.map((l: any) => {
      if (l.id === id) {
        const nextState = { ...l, opacity };
        updateLayerStyle(nextState);
        return nextState;
      }
      return l;
    }));
  };

  const changeSize = (id: string, size: number) => {
    setCustomLayers((prev: any) => prev.map((l: any) => {
      if (l.id === id) {
        const nextState = { ...l, size };
        updateLayerStyle(nextState);
        return nextState;
      }
      return l;
    }));
  };

  const zoomToLayer = (id: string) => {
    const layer = customLayers.find((l: any) => l.id === id);
    if (!layer) return;

    let bounds: L.LatLngBounds | null = null;
    
    if (layer.leafletLayer) {
      if (typeof layer.leafletLayer.getBounds === 'function') {
        bounds = layer.leafletLayer.getBounds();
      } else if (typeof layer.leafletLayer.getLatLng === 'function') {
        const latLng = layer.leafletLayer.getLatLng();
        bounds = L.latLngBounds(latLng, latLng);
      }
    } 
    
    if (!bounds && layer.geojson) {
      try {
        const bbox = turf.bbox(layer.geojson);
        bounds = L.latLngBounds(
          L.latLng(bbox[1], bbox[0]), // southWest (minY, minX)
          L.latLng(bbox[3], bbox[2])  // northEast (maxY, maxX)
        );
      } catch (err) {}
    } 
    
    if (!bounds && layer.areaCoords) {
      bounds = L.latLngBounds(layer.areaCoords);
    }

    if (bounds && bounds.isValid()) {
      window.dispatchEvent(new CustomEvent('flyToBounds', { detail: bounds }));
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Couches Officielles TTH ──────────────────────────────────── */}
<div className="mb-4">
  <h3 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5">
    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
    Couches Officielles TTH
  </h3>
  <div className="space-y-1">
    {OFFICIAL.map(({ key, label, file, color, weight, tooltip }) => (
      <button
        key={key}
        onClick={() => toggleOfficial(key, file, color, weight, tooltip)}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left text-xs font-medium transition-all ${
          officialVisible[key]
            ? 'bg-[var(--bg-surface)] text-[var(--text-main)]'
            : 'border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-muted)] hover:border-[var(--brand)] hover:text-[var(--text-main)]'
        }`}
        style={officialVisible[key] ? { borderColor: color, boxShadow: `0 0 0 1px ${color}30` } : {}}
      >
        {/* Color indicator */}
        <span
          className="w-3 h-3 rounded-sm shrink-0 border-2 transition-all"
          style={{
            backgroundColor: officialVisible[key] ? color + '30' : 'transparent',
            borderColor: color,
          }}
        />
        <span className="flex-1 truncate">{label}</span>
        <span
          className="text-[8px] font-bold px-1.5 py-0.5 rounded shrink-0"
          style={{
            backgroundColor: officialVisible[key] ? color : 'var(--border-color)',
            color: officialVisible[key] ? '#fff' : 'var(--text-muted)',
          }}
        >
          {officialVisible[key] ? 'ON' : 'OFF'}
        </span>
      </button>
    ))}
  </div>
  <div className="h-px bg-[var(--border-color)] mt-3 mb-1 opacity-50" />
</div>
{/* ── Fin Couches Officielles ───────────────────────────────────── */}
      <div className="flex justify-between items-center px-1 pb-3 border-b border-[var(--border-color)]">
        <h2 className="text-[var(--brand)] flex items-center gap-2 font-semibold text-sm tracking-wide">
          Couches
          <span className="text-[10px] bg-[var(--bg-surface)] px-2 py-0.5 rounded-full text-[var(--text-main)] font-mono border border-[var(--border-color)] shadow-sm">
            {customLayers.length}
          </span>
        </h2>
        <div className="flex gap-2">
          <button 
             onClick={() => fileInputRef.current?.click()} 
             className="text-[11px] flex items-center gap-1.5 bg-[var(--brand)] hover:opacity-90 text-white px-3 py-1.5 rounded-lg transition-all font-semibold shadow-sm"
          >
             <Upload size={14} /> 
             <span>Importer</span>
          </button>
        </div>
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleImport} 
          onClick={(e: any) => { e.target.value = null }} 
          accept=".json,.geojson,.kml,.csv,.xlsx,.xls,.zip" 
          className="hidden" 
        />
      </div>

      <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1 select-none">
        {customLayers.length === 0 && (
          <div className="text-center py-10 text-[var(--text-muted)] border border-dashed border-[var(--border-color)] rounded-xl bg-[var(--bg-main)]">
            <Layers className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p className="text-xs font-semibold">Aucune couche disponible</p>
          </div>
        )}
        {customLayers.map((layer: any) => (
           <LayerItem 
             key={layer.id} 
             layer={layer} 
             onToggle={() => toggleLayer(layer.id)} 
             onDelete={() => deleteLayer(layer.id)}
             onChangeColor={(c: string) => changeColor(layer.id, c)}
             onChangeOpacity={(o: number) => changeOpacity(layer.id, o)}
             onChangeSize={(s: number) => changeSize(layer.id, s)}
             onChangeFillMode={(mode: string) => {
               setCustomLayers((prev: any) => prev.map((l: any) => {
                 if (l.id === layer.id) {
                   const updated = { ...l, fillMode: mode };
                   if (updated.leafletLayer) {
                      updateLayerStyle(updated);
                   }
                   return updated;
                 }
                 return l;
               }));
             }}
             onChangeSymbol={(symbol: string) => {
               setCustomLayers((prev: any) => {
                 const newLayers = [...prev];
                 const idx = newLayers.findIndex((l: any) => l.id === layer.id);
                 if (idx !== -1) {
                   const l = newLayers[idx];
                   const updated = { ...l, symbol: symbol };
                   
                   // For shapes, we must recreate the leaflet layer
                   if (l.leafletLayer && featureGroupRef.current) {
                      featureGroupRef.current.removeLayer(l.leafletLayer);
                      
                      const color = updated.color || '#38bdf8';
                      const opacity = updated.opacity ?? 1;
                      const fillOpacity = (updated.fillMode === 'outline') ? 0 : (opacity * 0.4);
                      const weight = updated.size ? updated.size / 2 : 2;
                      const radius = updated.size ?? 6;

                      const newLeafletLayer = L.geoJSON(l.geojson, {
                         style: {
                            color,
                            opacity,
                            weight,
                            fillColor: color,
                            fillOpacity
                         },
                         pointToLayer: (feature, latlng) => {
                            if (symbol === 'square') {
                               return L.marker(latlng, {
                                  icon: L.divIcon({
                                     className: 'custom-square-marker',
                                     html: `<div style="width:${radius*2}px;height:${radius*2}px;background-color:${fillOpacity > 0 ? color : 'transparent'};border:${weight}px solid ${color};opacity:${opacity}"></div>`,
                                     iconSize: [radius*2, radius*2],
                                     iconAnchor: [radius, radius]
                                  })
                               });
                            } else if (symbol === 'triangle') {
                               return L.marker(latlng, {
                                  icon: L.divIcon({
                                     className: 'custom-triangle-marker',
                                     html: `<div style="width:0;height:0;border-left:${radius}px solid transparent;border-right:${radius}px solid transparent;border-bottom:${radius*2}px solid ${fillOpacity > 0 ? color : 'transparent'};opacity:${opacity};filter:drop-shadow(0 -${weight}px 0 ${color}) drop-shadow(${weight}px ${weight}px 0 ${color}) drop-shadow(-${weight}px ${weight}px 0 ${color});"></div>`,
                                     iconSize: [radius*2, radius*2],
                                     iconAnchor: [radius, radius]
                                  })
                               });
                            }
                            return L.circleMarker(latlng, { radius, fillColor: color, color, weight, opacity, fillOpacity: fillOpacity > 0 ? opacity : 0 });
                         },
                         onEachFeature: l.leafletLayer.options?.onEachFeature
                      });

                      featureGroupRef.current.addLayer(newLeafletLayer);
                      updated.leafletLayer = newLeafletLayer;
                   }
                   newLayers[idx] = updated;
                 }
                 return newLayers;
               });
             }}
             onZoom={() => zoomToLayer(layer.id)}
           />
        ))}
      </div>
    </div>
  );
}

function GeotoolsTab({ customLayers, setCustomLayers, featureGroupRef }: any) {
  const [tool, setTool] = useState<string>('points_to_polygon');
  const [layer1, setLayer1] = useState<string>('');
  const [layer2, setLayer2] = useState<string>('');
  const [radius, setRadius] = useState<number>(50);

  const getGeojson = (l: any) => {
    if (l.geojson) return l.geojson;
    if (l.leafletLayer && l.leafletLayer.toGeoJSON) return l.leafletLayer.toGeoJSON();
    if (l.type === 'static_polygon' && l.areaCoords) {
      const coords = [...l.areaCoords];
      if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
        coords.push([...coords[0]]);
      }
      return turf.polygon([coords.map((c: any) => [c[1], c[0]])]);
    }
    return null;
  };

  const executeTool = () => {
    const l1 = customLayers.find((l: any) => l.id === layer1);
    const l2 = customLayers.find((l: any) => l.id === layer2);

    if (!l1) return alert("Sélectionnez la couche 1");

    try {
      let resultGeojson: any;
      const g1 = getGeojson(l1);

      if (tool === 'calculate_geometry') {
        const area = turf.area(g1);
        const length = turf.length(g1, { units: 'kilometers' });
        alert(`Attributs Géométriques pour ${l1.name}:\nSurface: ${(area / 10000).toFixed(2)} Ha\nLongueur/Périmètre: ${length.toFixed(2)} km`);
        return;
      } else if (tool === 'check_geometry') {
        try {
          const kinks = turf.kinks(g1 as any);
          if (kinks.features.length > 0) {
            resultGeojson = kinks;
            alert(`Géométrie invalide : ${kinks.features.length} auto-intersections trouvées. Une couche avec les points d'intersection a été ajoutée.`);
          } else {
            alert('La géométrie est valide : aucune auto-intersection.');
            return;
          }
        } catch(e) {
          alert('Impossible de vérifier, type de géométrie non supporté (nécessite Polygone/Ligne).');
          return;
        }
      } else if (tool === 'explode') {
        resultGeojson = turf.explode(g1);
      } else if (tool === 'export_excel') {
        const features = g1.type === 'FeatureCollection' ? g1.features : [g1];
        const data = features.map((f: any) => {
          let coordsStr = '';
          if (f.geometry.type === 'Point') coordsStr = f.geometry.coordinates.join(', ');
          else if (f.geometry.type === 'Polygon') coordsStr = 'Polygone (' + f.geometry.coordinates[0].length + ' points)';
          else coordsStr = f.geometry.type;

          return {
             Couche: l1.name,
             Type: f.geometry.type,
             Coordonnees: coordsStr,
             ...f.properties
          };
        });
        
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Donnees");
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        
        const blob = new Blob([excelBuffer], {type: 'application/octet-stream'});
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${l1.name}_export.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        alert("Fichier Excel téléchargé avec succès.");
        return;
      } else if (tool === 'reproject_lambert') {
        // From map (WGS84) to Lambert Nord Maroc
        // We cannot just display it on map since coordinates will be in meters.
        // We will transform, serialize to geojson and triggering download.
        const transformed = structuredClone(g1);
        turf.coordEach(transformed, (currentCoord) => {
          const projected = proj4('EPSG:4326', 'EPSG:26191', currentCoord);
          currentCoord[0] = projected[0];
          currentCoord[1] = projected[1];
        });
        const blob = new Blob([JSON.stringify(transformed)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${l1.name}_lambert_nord_maroc.geojson`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        alert("Fichier projeté en Lambert Nord téléchargé avec succès.");
        return;
      } else if (tool === 'reproject_wgs84') {
        // From Lambert to WGS84
        const transformed = structuredClone(g1);
        turf.coordEach(transformed, (currentCoord) => {
          const projected = proj4('EPSG:26191', 'EPSG:4326', currentCoord);
          currentCoord[0] = projected[0];
          currentCoord[1] = projected[1];
        });
        resultGeojson = transformed;
      } else if (tool === 'buffer') {
        resultGeojson = turf.buffer(g1, radius, { units: 'meters' });
      } else if (tool === 'envelope') {
        resultGeojson = turf.envelope(g1);
      } else if (tool === 'points_to_polygon') {
         if (g1.type === 'FeatureCollection') {
            const coords = g1.features.map((f: any) => f.geometry.coordinates);
            if (coords.length > 2) {
              if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
                coords.push([...coords[0]]);
              }
              resultGeojson = turf.polygon([coords]);
            } else {
              return alert("Une collection de 3 points minimum est requise pour un polygone.");
            }
         } else {
            return alert("La couche n'est pas une collection de points.");
         }
      } else if (tool === 'polygon_to_line') {
         resultGeojson = turf.polygonToLine(g1);
      } else if (tool === 'intersect') {
        if (!l2) return alert("Sélectionnez la couche 2");
        const g2 = getGeojson(l2);
        
        let merged1 = g1.type === 'FeatureCollection' ? turf.union(g1) : g1;
        let merged2 = g2.type === 'FeatureCollection' ? turf.union(g2) : g2;
        
        if (!merged1 || !merged2) return alert("Les couches doivent contenir des polygones valides.");
        
        resultGeojson = turf.intersect(turf.featureCollection([merged1, merged2]));
        if (!resultGeojson) return alert("Aucune intersection trouvée");
      } else if (tool === 'union') {
        if (!l2) return alert("Sélectionnez la couche 2");
        const g2 = getGeojson(l2);
        
        let merged1 = g1.type === 'FeatureCollection' ? turf.union(g1) : g1;
        let merged2 = g2.type === 'FeatureCollection' ? turf.union(g2) : g2;
        
        if (!merged1 || !merged2) return alert("Les couches doivent contenir des polygones valides.");

        resultGeojson = turf.union(turf.featureCollection([merged1, merged2]));
      }

      if (resultGeojson) {
        const id = `geotool-${Date.now()}`;
        const color = '#eab308';
        const opacity = 0.8;
        
        const layer = L.geoJSON(resultGeojson, {
          style: {
            color: color,
            weight: 2,
            opacity: opacity,
            fillOpacity: opacity * 0.4
          },
          pointToLayer: (feature, latlng) => {
             return L.circleMarker(latlng, {
                radius: 6,
                fillColor: color,
                color: color,
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8
             });
          },
          onEachFeature: (feature, llayer) => {
             let html = `<div style="max-height: 250px; overflow-y: auto;"><b style="font-size:14px;display:block;margin-bottom:8px;border-bottom:1px solid #eee;padding-bottom:4px;">Opération: ${tool}</b>`;
             
             if (feature.geometry) {
                if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
                   const area = turf.area(feature);
                   const length = turf.length(feature, { units: 'kilometers' });
                   html += `<b>Géométrie (Polygone)</b><br/>`;
                   if (area < 10000) {
                      html += `Surface: ${area.toFixed(2)} m²<br/>`;
                   } else {
                      html += `Surface: ${(area / 10000).toFixed(2)} Ha<br/>`;
                   }
                   html += `Périmètre: ${length.toFixed(2)} km<br/><hr style="margin:8px 0; border:0; border-top:1px solid #eee;"/>`;
                } else if (feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString') {
                   const length = turf.length(feature, { units: 'kilometers' });
                   html += `<b>Géométrie (Ligne)</b><br/>`;
                   html += `Longueur: ${length.toFixed(2)} km<br/><hr style="margin:8px 0; border:0; border-top:1px solid #eee;"/>`;
                } else if (feature.geometry.type === 'Point') {
                   const [lng, lat] = feature.geometry.coordinates;
                   html += `<b>Géométrie (Point)</b><br/>`;
                   html += `Lon: ${lng.toFixed(6)}<br/>Lat: ${lat.toFixed(6)}<br/><hr style="margin:8px 0; border:0; border-top:1px solid #eee;"/>`;
                }
             }

             if (feature.properties) {
               html += `<table style="width:100%; border-collapse: collapse; font-size: 12px; margin-bottom:0;">`;
               for (const key in feature.properties) {
                 if (feature.properties[key] !== null && feature.properties[key] !== undefined) {
                    html += `<tr><td style="padding:2px 4px; border:1px solid #eee; font-weight:bold; background:#f9f9f9;">${key}</td><td style="padding:2px 4px; border:1px solid #eee;">${feature.properties[key]}</td></tr>`;
                 }
               }
               html += `</table>`;
             }
             html += `</div>`;
             llayer.bindPopup(html);
          }
        });

        if (featureGroupRef && featureGroupRef.current) {
          featureGroupRef.current.addLayer(layer);
        }

        setCustomLayers((prev: any) => [...prev, {
          id,
          name: `Résultat ${tool}`,
          type: 'imported',
          visible: true,
          color: color,
          opacity: opacity,
          geojson: resultGeojson,
          leafletLayer: layer
        }]);
        alert("Opération réussie. Couche ajoutée.");
      }
    } catch (e) {
      console.error(e);
      alert("Erreur lors du traitement : géométries incompatibles ou non-valides.");
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
      <h2 className="text-[var(--text-main)] font-semibold text-lg tracking-tight mb-3 px-1">Géotraitement</h2>
      
      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 block">Outil</label>
          <select 
            value={tool} 
            onChange={e => setTool(e.target.value)}
            className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] text-[var(--text-main)] rounded-lg p-2 text-sm focus:outline-none focus:border-[var(--brand)] transition-colors"
          >
            <optgroup label="Informations & Attributs">
               <option value="calculate_geometry">Calculer la Géométrie (Surface/Périmètre)</option>
               <option value="export_excel">Exporter vers Excel (.xlsx) / Attributs</option>
               <option value="check_geometry">Vérifier la Géométrie (Auto-intersections)</option>
            </optgroup>
            <optgroup label="Topologie & Géotraitement">
               <option value="buffer">Zone tampon (Buffer)</option>
               <option value="intersect">Intersection</option>
               <option value="union">Union</option>
            </optgroup>
            <optgroup label="Conversion & Géométrie">
               <option value="explode">Extraire les Sommets (Vertices to Points)</option>
               <option value="points_to_polygon">Points vers Polygone</option>
               <option value="polygon_to_line">Polygone vers Ligne</option>
               <option value="envelope">Enveloppe (Bounding Box)</option>
            </optgroup>
            <optgroup label="Reprojection">
               <option value="reproject_lambert">Reprojeter vers Lambert Nord (Export JSON)</option>
               <option value="reproject_wgs84">Reprojeter vers WGS84</option>
            </optgroup>
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 block">Couche Principale</label>
          <select 
            value={layer1} 
            onChange={e => setLayer1(e.target.value)}
            className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] text-[var(--text-main)] rounded-lg p-2 text-sm focus:outline-none focus:border-[var(--brand)] transition-colors"
          >
            <option value="">Sélectionner une couche...</option>
            {customLayers.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>

        {(tool === 'intersect' || tool === 'union') && (
          <div className="animate-in slide-in-from-top-2">
            <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 block">Couche Secondaire</label>
            <select 
              value={layer2} 
              onChange={e => setLayer2(e.target.value)}
              className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] text-[var(--text-main)] rounded-lg p-2 text-sm focus:outline-none focus:border-[var(--brand)] transition-colors"
            >
              <option value="">Sélectionner une couche...</option>
              {customLayers.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}

        {tool === 'buffer' && (
          <div className="animate-in slide-in-from-top-2">
            <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 block">Distance (mètres)</label>
            <input 
              type="number" 
              value={radius} 
              onChange={e => setRadius(Number(e.target.value))}
              className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] text-[var(--text-main)] rounded-lg p-2 text-sm focus:outline-none focus:border-[var(--brand)] transition-colors"
            />
          </div>
        )}

        <button 
          onClick={executeTool}
          className="w-full mt-4 bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white font-semibold py-2.5 rounded-lg transition-all shadow-sm flex items-center justify-center gap-2"
        >
          <Combine className="w-4 h-4" />
          Exécuter
        </button>
      </div>
    </div>
  );
}

function LayerItem({ layer, onToggle, onDelete, onChangeColor, onChangeOpacity, onChangeSize, onChangeFillMode, onChangeSymbol, onZoom }: any) {
  const colors = ["#22c55e", "#38bdf8", "#eab308", "#ef4444", "#a855f7", "#ec4899", "#f97316"];
  const [isExpanded, setIsExpanded] = useState(false);
  
  const hasPoints = layer.geojson && JSON.stringify(layer.geojson).includes('"Point"');
  const hasPolygons = layer.geojson && (JSON.stringify(layer.geojson).includes('"Polygon"') || JSON.stringify(layer.geojson).includes('"MultiPolygon"'));
  const isStaticPolygon = layer.type === 'static_polygon';
  const showFillMode = hasPolygons || isStaticPolygon || layer.type === 'drawn';

  return (
    <div className={`p-2.5 rounded-xl border transition-all ${layer.visible ? 'bg-[var(--bg-main)] border-[var(--border-color)]' : 'bg-transparent border-transparent opacity-70 hover:opacity-100'} group`}>
      <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
         <button onClick={(e) => { e.stopPropagation(); onToggle(); }} className={`p-1.5 shrink-0 rounded-lg transition-colors border ${layer.visible ? 'text-[var(--brand)] hover:opacity-80 bg-[var(--bg-surface)] border-[var(--border-color)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-surface)] border-transparent'}`}>
            {layer.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
         </button>
         
         <div className="w-3.5 h-3.5 rounded-[3px] border border-black/10 shrink-0" style={{ backgroundColor: layer.color, opacity: layer.opacity ?? 1, borderRadius: layer.symbol === 'circle' ? '50%' : layer.symbol === 'triangle' ? '0' : '3px' }}></div>
         
         <div className="flex flex-col flex-1 min-w-0 pr-1">
            <span className={`text-xs font-semibold truncate ${layer.visible ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}>{layer.name}</span>
         </div>
         
         <div className="flex items-center gap-1">
            <button onClick={(e) => { e.stopPropagation(); onZoom(); }} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] rounded-md transition-all opacity-0 group-hover:opacity-100" title="Centrer sur la carte">
               <Maximize className="w-3.5 h-3.5" />
            </button>
            <button className={`p-1.5 rounded-md transition-all ${isExpanded ? 'bg-[var(--bg-surface)] text-[var(--text-main)] border border-[var(--border-color)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)] border border-transparent opacity-0 group-hover:opacity-100'}`} title="Paramètres">
               <Settings className="w-3.5 h-3.5" />
            </button>
         </div>
      </div>
      
      {isExpanded && (
         <div className="mt-3 pt-3 border-t border-[var(--border-color)] space-y-4 animate-in fade-in slide-in-from-top-1">
             {hasPoints && (
               <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Symbole</span>
                  <div className="flex items-center gap-1 bg-[var(--bg-surface)] p-1 rounded-lg border border-[var(--border-color)]">
                     <button onClick={() => onChangeSymbol?.('circle')} className={`p-1 rounded ${(!layer.symbol || layer.symbol === 'circle') ? 'bg-white shadow-sm text-[var(--brand)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}><Circle className="w-3.5 h-3.5" /></button>
                     <button onClick={() => onChangeSymbol?.('square')} className={`p-1 rounded ${layer.symbol === 'square' ? 'bg-white shadow-sm text-[var(--brand)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}><Square className="w-3.5 h-3.5" /></button>
                     <button onClick={() => onChangeSymbol?.('triangle')} className={`p-1 rounded ${layer.symbol === 'triangle' ? 'bg-white shadow-sm text-[var(--brand)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}><Triangle className="w-3.5 h-3.5" /></button>
                  </div>
               </div>
             )}

             {showFillMode && (
               <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Style</span>
                  <div className="flex items-center gap-1 bg-[var(--bg-surface)] p-1 rounded-lg border border-[var(--border-color)] text-[10px] font-bold">
                     <button onClick={() => onChangeFillMode?.('fill')} className={`px-2 py-1 rounded ${(!layer.fillMode || layer.fillMode === 'fill') ? 'bg-white shadow-sm text-[var(--brand)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}>Rempli</button>
                     <button onClick={() => onChangeFillMode?.('outline')} className={`px-2 py-1 rounded ${layer.fillMode === 'outline' ? 'bg-white shadow-sm text-[var(--brand)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}>Contour</button>
                  </div>
               </div>
             )}

             <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Couleur</span>
                <div className="flex gap-1.5">
                   {colors.map(c => (
                     <button 
                       key={c} onClick={() => onChangeColor(c)}
                       className={`w-4 h-4 rounded-full ring-offset-2 transition-all hover:scale-110 ${layer.color === c ? 'ring-2 ring-[var(--text-main)] ring-offset-[var(--bg-main)]' : 'opacity-80 hover:opacity-100'}`}
                       style={{ backgroundColor: c }}
                     />
                   ))}
                </div>
             </div>
             
             <div>
                <div className="flex justify-between items-center mb-1.5">
                   <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Opacité</span>
                   <span className="text-[10px] font-mono font-semibold text-[var(--brand)]">{Math.round((layer.opacity ?? 1) * 100)}%</span>
                </div>
                <input type="range" min="0.1" max="1" step="0.1" value={layer.opacity ?? 1} onChange={(e) => onChangeOpacity(parseFloat(e.target.value))} className="w-full accent-[var(--brand)] h-1.5 bg-[var(--border-color)] rounded-full appearance-none cursor-pointer" />
             </div>
             
             <div>
                <div className="flex justify-between items-center mb-1.5">
                   <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Épaisseur du trait</span>
                   <span className="text-[10px] font-mono font-semibold text-[var(--brand)]">{layer.size ?? 6}px</span>
                </div>
                <input type="range" min="1" max="20" step="1" value={layer.size ?? 6} onChange={(e) => onChangeSize(parseInt(e.target.value))} className="w-full accent-[var(--brand)] h-1.5 bg-[var(--border-color)] rounded-full appearance-none cursor-pointer" />
             </div>
             
             <div className="pt-2 flex justify-between items-center border-t border-[var(--border-color)]">
                <span className="text-[9px] font-bold tracking-widest uppercase bg-[var(--bg-surface)] px-2 py-1 rounded text-[var(--text-muted)] border border-[var(--border-color)]">
                   {layer.type === 'static_polygon' ? 'Référence' : layer.type === 'drawn' ? 'Dessin' : 'Import'}
                </span>
                <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-[10px] flex items-center gap-1 font-bold px-2 py-1 rounded text-red-500 hover:bg-red-500/10 hover:text-red-600 transition-colors">
                   <Trash2 className="w-3.5 h-3.5" /> Supprimer
                </button>
             </div>
         </div>
      )}
    </div>
  );
}
