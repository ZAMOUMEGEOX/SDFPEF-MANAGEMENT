import React, { useState, useEffect, useRef } from 'react';
import { Aperture, Settings, Map, Maximize, Play, Crosshair, MapPin, Layers, Video, Rotate3D, Box, Hexagon, Activity, ChevronRight, Zap, ListTree, Info, ChevronUp, ChevronDown, Ruler, Type, MapPin as MapPinIcon, UploadCloud, Download, Printer, Trash2 } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { cn } from '../../lib/utils';
import { MapContainer, TileLayer, LayersControl, FeatureGroup, useMap, ZoomControl } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import L from 'leaflet';
import * as turf from '@turf/turf';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

interface Mission {
  id: string;
  title: string;
  type: string;
  date: string;
  location: string;
  area: string;
  status: 'Ready' | 'Processing';
  image: string;
  tech: string[];
  coordinates: [number, number];
}

const missions: Mission[] = [
  {
    id: 'm4',
    title: 'Mission de Test Forêt Amsa',
    type: 'Modèle 3D/2D (LiDAR & RVB)',
    date: '20 Nov 2024',
    location: 'Tétouan',
    area: '25 Ha',
    status: 'Ready',
    image: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&q=80',
    tech: ['LiDAR L2', 'Zenmuse P1 RGB'],
    coordinates: [35.535, -5.200]
  },
  {
    id: 'm1',
    title: 'Surveillance Forêt Maâmora',
    type: 'Orthomosaïque & MNE',
    date: '12 Oct 2024',
    location: 'Rabat-Salé-Kénitra',
    area: '120 Ha',
    status: 'Ready',
    image: 'https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&q=80',
    tech: ['Zenmuse P1', 'Photogrammétrie'],
    coordinates: [34.0, -6.6]
  },
  {
    id: 'm2',
    title: 'Analyse Biomasse L2',
    type: 'Nuage de Points 3D (LiDAR)',
    date: '05 Nov 2024',
    location: 'Parc National d\'Ifrane',
    area: '45 Ha',
    status: 'Ready',
    image: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&q=80',
    tech: ['Zenmuse L2', 'LiDAR', 'Mesh 3D'],
    coordinates: [33.5, -5.1]
  },
  {
    id: 'm3',
    title: 'Cartographie Dégâts Incendies',
    type: 'Thermique & Multispectral',
    date: '28 Aou 2024',
    location: 'Chefchaouen',
    area: '300 Ha',
    status: 'Processing',
    image: 'https://images.unsplash.com/photo-1542314831-c6a4d140b648?auto=format&fit=crop&q=80',
    tech: ['Zenmuse H20T', 'Thermique'],
    coordinates: [35.1, -5.2]
  }
];

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 15);
  }, [center, map]);
  return null;
}

export function Drone3D() {
  const { theme } = useTheme();
  const isSportMode = theme === 'sport';
  const [activeMission, setActiveMission] = useState<Mission>(missions[0]);
  const [activeTab, setActiveTab] = useState<'POINT_CLOUD' | 'TREE_ID' | 'CLASSIFICATION' | 'ORTHO_2D'>('POINT_CLOUD');
  
  const [isCalculating, setIsCalculating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [isPanelMinimized, setIsPanelMinimized] = useState(false);
  
  const viewerRef = React.useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mapOverlay, setMapOverlay] = useState(false);
  const [isCentering, setIsCentering] = useState(false);
  
  const [measurements, setMeasurements] = useState<{ id: string; type: string; value: string }[]>([]);
  const featureGroupRef = useRef<any>(null);

  const onCreated = (e: any) => {
      const { layerType, layer } = e;
      let measureStr = '';
      
      try {
          if (layerType === 'polygon' || layerType === 'rectangle') {
              const latlngs = layer.getLatLngs()[0];
              const coordinates = [...latlngs, latlngs[0]].map((ll: any) => [ll.lng, ll.lat]);
              const poly = turf.polygon([coordinates]);
              const area = turf.area(poly);
              measureStr = area > 1000000 ? `${(area / 1000000).toFixed(2)} km²` : `${area.toFixed(2)} m²`;
          } else if (layerType === 'polyline') {
              const latlngs = layer.getLatLngs();
              const coordinates = latlngs.map((ll: any) => [ll.lng, ll.lat]);
              const line = turf.lineString(coordinates);
              const length = turf.length(line, {units: 'meters'});
              measureStr = length > 1000 ? `${(length / 1000).toFixed(2)} km` : `${length.toFixed(2)} m`;
          } else if (layerType === 'circle') {
              const radius = layer.getRadius();
              const area = Math.PI * radius * radius;
              measureStr = area > 1000000 ? `${(area / 1000000).toFixed(2)} km²` : `${area.toFixed(2)} m²`;
          }
      } catch (err) {
          console.error("Measurement error:", err);
      }
      
      if (measureStr) {
          layer.bindTooltip(`M: ${measureStr}`, { permanent: true, direction: 'center', className: 'bg-black/80 text-white font-mono text-xs border-none shadow-xl' }).openTooltip();
          setMeasurements(prev => [...prev, {
              id: String(L.stamp(layer)),
              type: layerType,
              value: measureStr
          }]);
      }
  };

  const triggerDraw = (type: string) => {
      const el = document.querySelector('.leaflet-draw-draw-' + type) as HTMLElement;
      if (el) el.click();
  };

  const clearLayers = () => {
      if (featureGroupRef.current) {
          featureGroupRef.current.clearLayers();
          setMeasurements([]);
      }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      viewerRef.current?.requestFullscreen().catch(err => {
        console.warn(`Error attempting to enable fullscreen: ${err.message}`);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleCenter = () => {
    setIsCentering(true);
    setTimeout(() => setIsCentering(false), 500);
  };

  const handleCalculations = () => {
    setIsCalculating(true);
    setTimeout(() => {
      setIsCalculating(false);
      setShowTable(true);
    }, 1500);
  };

  const handleImport = () => {
    setIsImporting(true);
    setTimeout(() => {
      setIsImporting(false);
    }, 1000);
  };

  return (
    <div className={cn("flex flex-col h-full animate-in fade-in duration-500", isSportMode ? "bg-[#09090b]" : "bg-[var(--bg-main)]")}>
      {/* Header */}
      <div className={cn(
        "p-3 md:p-6 flex flex-col sm:flex-row sm:items-center justify-between border-b shrink-0 gap-3 md:gap-4",
        isSportMode ? "border-white/10 bg-[#121214]" : "border-[var(--border-color)] bg-[var(--bg-surface)]"
      )}>
        <div>
          <div className="flex items-center gap-1.5 md:gap-2 mb-0.5 md:mb-1">
            <Aperture className="w-4 h-4 md:w-5 md:h-5 text-[var(--brand)]" />
            <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-[var(--brand)]">Technologie Avancée</span>
          </div>
          <h1 className={cn("text-lg md:text-2xl font-black tracking-tight leading-tight", isSportMode ? "text-white" : "text-[var(--text-main)]")}>
            Simulations & Modèles 3D
          </h1>
          <p className="text-[10px] md:text-sm text-[var(--text-muted)] mt-0.5 md:mt-1 leading-snug">Exploitation Lidar, Photogrammétrie et Nuages de points</p>
        </div>
        <div className="flex flex-wrap gap-2 md:gap-3">
          <button 
            onClick={handleImport}
            disabled={isImporting}
            className={cn("flex-1 sm:flex-none justify-center flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 rounded-lg border text-xs md:text-sm font-bold transition-all disabled:opacity-50", isSportMode ? "border-white/10 text-white hover:bg-white/5" : "border-[var(--border-color)] text-[var(--text-main)] hover:bg-black/5")}
          >
            <Rotate3D className={cn("w-3.5 h-3.5 md:w-4 md:h-4", isImporting ? "animate-spin" : "")} />
            {isImporting ? "Import..." : "Importer"}
          </button>
          <button className="flex-1 sm:flex-none justify-center flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 rounded-lg bg-[var(--brand)] text-[var(--bg-main)] text-xs md:text-sm font-bold shadow-md hover:brightness-110 transition-all">
            <Play className="w-3.5 h-3.5 md:w-4 md:h-4" />
            Nouvelle Mission
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        {/* Sidebar - Missions Gallery */}
        <div className={cn("w-full md:w-80 border-b md:border-b-0 md:border-r flex flex-col shrink-0", isSportMode ? "border-white/10 bg-[#121214]" : "border-[var(--border-color)] bg-[var(--bg-surface)]")}>
          <div className="p-3 md:p-4 border-b border-[var(--border-color)] hidden md:block">
            <h2 className="font-bold text-sm tracking-wide mb-4">Bibliothèque de Capteurs</h2>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2 py-1 rounded-full border border-[var(--brand)] text-[var(--brand)] font-bold">Zenmuse P1</span>
              <span className="px-2 py-1 rounded-full border border-[var(--border-color)] text-[var(--text-muted)]">Zenmuse L2</span>
              <span className="px-2 py-1 rounded-full border border-[var(--border-color)] text-[var(--text-muted)]">Mavic 3M</span>
            </div>
          </div>
          <div className="flex overflow-x-auto md:flex-col md:overflow-y-auto p-3 md:p-4 gap-3 md:space-y-4 md:gap-0 snap-x">
            {missions.map(mission => (
              <button 
                key={mission.id}
                onClick={() => setActiveMission(mission)}
                className={cn(
                  "w-64 md:w-full flex-shrink-0 text-left rounded-xl overflow-hidden border-2 transition-all group snap-center",
                  activeMission.id === mission.id 
                    ? "border-[var(--brand)] shadow-[0_0_15px_rgba(var(--brand-rgb),0.15)]" 
                    : "border-transparent hover:border-[var(--brand)]/50 bg-black/5 dark:bg-white/5"
                )}
              >
                <div className="h-20 md:h-24 w-full relative overflow-hidden">
                  <img src={mission.image} alt={mission.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
                  <div className="absolute bottom-2 left-2 right-2 flex justify-between items-end">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/80 bg-black/40 px-1.5 py-0.5 rounded backdrop-blur-sm">
                      {mission.tech[0]}
                    </span>
                    <span className={cn("w-2 h-2 rounded-full", mission.status === 'Ready' ? "bg-emerald-500" : "bg-amber-500 animate-pulse")}></span>
                  </div>
                </div>
                <div className="p-2 md:p-3">
                  <h3 className={cn("font-bold text-xs md:text-sm truncate", isSportMode ? "text-white" : "text-[var(--text-main)]")}>{mission.title}</h3>
                  <div className="text-[10px] md:text-[11px] text-[var(--text-muted)] mt-1 flex items-center justify-between">
                    <span>{mission.date}</span>
                    <span className="font-mono text-[var(--brand)] font-bold">{mission.area}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Main Viewer */}
        <div ref={viewerRef} className="flex-1 relative flex flex-col bg-black overflow-hidden">
          {/* Top tools bar */}
          <div className="absolute top-2 md:top-4 left-2 md:left-4 right-2 md:right-4 z-10 flex flex-col sm:flex-row justify-between items-start pointer-events-none gap-2">
            <div className="flex overflow-x-auto max-w-[calc(100vw-4rem)] md:max-w-full space-x-2 pointer-events-auto bg-black/50 backdrop-blur-md p-1.5 rounded-lg border border-white/10 no-scrollbar snap-x">
              <button 
                onClick={() => setActiveTab('POINT_CLOUD')} 
                className={cn("px-3 py-1.5 text-xs font-bold rounded-md transition-colors whitespace-nowrap snap-start", activeTab === 'POINT_CLOUD' ? "bg-[var(--brand)] text-white" : "text-white/60 hover:text-white hover:bg-white/10")}
              >
                <Box className="w-3 h-3 md:w-4 md:h-4 inline-block mr-1.5" />Nuage de Points
              </button>
              <button 
                onClick={() => setActiveTab('TREE_ID')} 
                className={cn("px-3 py-1.5 text-xs font-bold rounded-md transition-colors whitespace-nowrap snap-start", activeTab === 'TREE_ID' ? "bg-purple-600 text-white" : "text-white/60 hover:text-white hover:bg-white/10")}
              >
                <ListTree className="w-3 h-3 md:w-4 md:h-4 inline-block mr-1.5" />Tree ID (Seg.)
              </button>
              <button 
                onClick={() => setActiveTab('CLASSIFICATION')} 
                className={cn("px-3 py-1.5 text-xs font-bold rounded-md transition-colors whitespace-nowrap snap-start", activeTab === 'CLASSIFICATION' ? "bg-emerald-600 text-white" : "text-white/60 hover:text-white hover:bg-white/10")}
              >
                <Activity className="w-3 h-3 md:w-4 md:h-4 inline-block mr-1.5" />Classification
              </button>
              <button 
                onClick={() => setActiveTab('ORTHO_2D')} 
                className={cn("px-3 py-1.5 text-xs font-bold rounded-md transition-colors whitespace-nowrap snap-start", activeTab === 'ORTHO_2D' ? "bg-[var(--brand)] text-white" : "text-white/60 hover:text-white hover:bg-white/10")}
              >
                <Layers className="w-3 h-3 md:w-4 md:h-4 inline-block mr-1.5" />2D Map (Terra)
              </button>
            </div>

            <div className="flex flex-row sm:flex-col space-x-2 sm:space-x-0 space-y-0 sm:space-y-2 pointer-events-auto absolute sm:relative right-0 top-0 sm:top-auto sm:right-auto">
              <button title="Afficher/Masquer la légende" onClick={() => setShowLegend(!showLegend)} className={cn("w-8 h-8 md:w-10 md:h-10 rounded-full backdrop-blur-md border border-white/10 flex items-center justify-center transition-colors", showLegend ? "bg-white text-black" : "bg-black/50 text-white hover:bg-white/20")}><Info className="w-4 h-4 md:w-5 md:h-5" /></button>
              <button title="Carte interactive" onClick={() => setMapOverlay(!mapOverlay)} className={cn("w-8 h-8 md:w-10 md:h-10 rounded-full backdrop-blur-md border border-white/10 flex items-center justify-center transition-colors", mapOverlay ? "bg-[var(--brand)] text-[var(--bg-main)]" : "bg-black/50 text-white hover:bg-[var(--brand)]")}><Map className="w-4 h-4 md:w-5 md:h-5" /></button>
              <button title="Récentrer" onClick={handleCenter} className={cn("w-8 h-8 md:w-10 md:h-10 rounded-full backdrop-blur-md border border-white/10 flex items-center justify-center transition-all duration-300", isCentering ? "bg-[var(--brand)] text-[var(--bg-main)] scale-90" : "bg-black/50 text-white hover:bg-[var(--brand)] scale-100")}><Crosshair className="w-4 h-4 md:w-5 md:h-5" /></button>
              <button title="Plein écran" onClick={toggleFullscreen} className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-white flex items-center justify-center hover:bg-[var(--brand)] transition-colors"><Maximize className="w-4 h-4 md:w-5 md:h-5" /></button>
            </div>
          </div>

          {/* Bottom Info overlay */}
          <div className="absolute bottom-4 md:bottom-6 left-4 md:left-6 right-4 md:right-auto z-10 pointer-events-none">
            <div className={cn("bg-black/60 backdrop-blur-lg border border-white/10 rounded-2xl md:max-w-sm w-full pointer-events-auto transition-all duration-300 overflow-hidden", isPanelMinimized ? "p-3" : "p-4 md:p-5")}>
              <div className="flex justify-between items-start gap-4 cursor-pointer md:cursor-auto" onClick={() => window.innerWidth < 768 && setIsPanelMinimized(!isPanelMinimized)}>
                <div>
                  <h3 className={cn("text-white font-bold transition-all", isPanelMinimized ? "text-sm" : "text-base md:text-lg")}>{activeMission.title}</h3>
                  <p className={cn("text-white/60 transition-all", isPanelMinimized ? "text-[10px] md:text-xs mt-0.5" : "text-xs md:text-sm mt-1")}>{activeMission.type} • {activeMission.location}</p>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); setIsPanelMinimized(!isPanelMinimized); }} 
                  className="text-white/50 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors shrink-0"
                  title={isPanelMinimized ? "Agrandir" : "Réduire"}
                >
                  {isPanelMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
              
              <div className={cn("grid transition-all duration-300 ease-in-out", isPanelMinimized ? "grid-rows-[0fr] opacity-0 mt-0" : "grid-rows-[1fr] opacity-100 mt-4 md:mt-5")}>
                <div className="overflow-hidden">
                  <div className="grid grid-cols-2 gap-3 md:gap-4">
                    <div>
                      <p className="text-[9px] md:text-[10px] text-white/50 uppercase tracking-wider font-bold">Points / m²</p>
                      <p className="text-lg md:text-xl font-mono text-[var(--brand)] mt-0.5">850</p>
                    </div>
                    <div>
                      <p className="text-[9px] md:text-[10px] text-white/50 uppercase tracking-wider font-bold">Altitude</p>
                      <p className="text-lg md:text-xl font-mono text-[var(--brand)] mt-0.5">120m</p>
                    </div>
                    <div>
                      <p className="text-[9px] md:text-[10px] text-white/50 uppercase tracking-wider font-bold">GSD</p>
                      <p className="text-base md:text-lg font-mono text-white mt-0.5">1.5 cm/px</p>
                    </div>
                    <div>
                      <p className="text-[9px] md:text-[10px] text-white/50 uppercase tracking-wider font-bold">Précision</p>

                      <p className="text-lg font-mono text-white mt-0.5">± 3 cm</p>
                    </div>
                  </div>

                  <button 
                    onClick={handleCalculations}
                    disabled={isCalculating || activeMission.status === 'Processing'}
                    className={cn(
                      "w-full mt-5 py-2.5 text-xs font-bold uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-2",
                      isCalculating || activeMission.status === 'Processing' 
                        ? "bg-white/5 text-white/40 cursor-not-allowed border border-white/5" 
                        : "bg-white/10 hover:bg-[var(--brand)] hover:border-transparent border border-white/20 text-white"
                    )}
                  >
                    {isCalculating ? (
                      <><Hexagon className="w-4 h-4 animate-spin" /> Calcul en cours...</>
                    ) : (
                      <><Zap className="w-4 h-4" /> Lancer Calculs Volumétriques</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 3D Environment Mockup */}
          <div className="absolute inset-0 z-0">
            {activeTab === 'POINT_CLOUD' && (
              <div className="w-full h-full relative" style={{ 
                background: 'radial-gradient(circle at center, #1a202c 0%, #000000 100%)',
                backgroundImage: `url('${activeMission.image}')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: 'saturate(1.2) contrast(1.1)'
              }}>
                 {/* Simulate point cloud effect & Height Color mapping (Blue to Red) */}
                 <div className="absolute inset-0 opacity-60 mix-blend-color" style={{
                    background: 'linear-gradient(to top, #0000ff 0%, #00ffff 25%, #00ff00 50%, #ffff00 75%, #ff0000 100%)'
                 }}></div>
                 <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-50 mix-blend-overlay"></div>
                 <div className="absolute inset-0 bg-black/30"></div>
                 
                 {/* Elevation scale legend (LiDAR360 style) */}
                 <div className="absolute top-1/2 -translate-y-1/2 left-4 md:left-6 w-8 md:w-10 h-32 md:h-48 rounded border border-white/20 shadow-2xl flex flex-col justify-between items-start py-1" style={{ background: 'linear-gradient(to top, #0000ff 0%, #00ffff 25%, #00ff00 50%, #ffff00 75%, #ff0000 100%)' }}>
                    <span className="text-[9px] md:text-[10px] text-white font-mono font-bold ml-10 md:ml-12 drop-shadow-md bg-black/60 px-1.5 py-0.5 rounded border border-white/10">8.08</span>
                    <span className="text-[9px] md:text-[10px] text-white font-mono font-bold ml-10 md:ml-12 drop-shadow-md bg-black/60 px-1.5 py-0.5 rounded border border-white/10">4.04</span>
                    <span className="text-[9px] md:text-[10px] text-white font-mono font-bold ml-10 md:ml-12 drop-shadow-md bg-black/60 px-1.5 py-0.5 rounded border border-white/10">0.00</span>
                    <span className="absolute -top-6 left-0 text-[9px] md:text-[10px] text-white/80 font-bold uppercase tracking-wider">Height</span>
                 </div>
              </div>
            )}
            
            {activeTab === 'TREE_ID' && (
              <div className="w-full h-full relative" style={{ 
                background: 'radial-gradient(circle at center, #1a202c 0%, #000000 100%)',
                backgroundImage: `url('${activeMission.image}')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}>
                 {/* Simulate ID Tree Segment colorizing (Distinct blobs) */}
                 <div className="absolute inset-0 mix-blend-color opacity-80" style={{
                   backgroundImage: `
                     radial-gradient(circle at 30% 40%, #ff0044 0%, transparent 22%),
                     radial-gradient(circle at 45% 35%, #00eeff 0%, transparent 25%),
                     radial-gradient(circle at 65% 30%, #4400ff 0%, transparent 20%),
                     radial-gradient(circle at 75% 55%, #ffee00 0%, transparent 25%),
                     radial-gradient(circle at 25% 65%, #aa00ff 0%, transparent 20%),
                     radial-gradient(circle at 50% 60%, #00ffaa 0%, transparent 28%),
                     radial-gradient(circle at 80% 40%, #ff6600 0%, transparent 18%)
                   `
                 }}></div>
                 <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-50 mix-blend-overlay"></div>
                 <div className="absolute inset-0 bg-black/30"></div>
                 
                 {/* Color legend mock */}
                 {showLegend && (
                   <div className="absolute top-16 md:top-20 right-4 md:right-[5rem] bg-black/60 backdrop-blur p-3 md:p-4 rounded-lg border border-white/10 shadow-2xl animate-in fade-in duration-200 w-40 md:w-48">
                     <h4 className="text-white text-[10px] md:text-xs font-bold mb-2 md:mb-3 border-b border-white/10 pb-2">Tree Segmentation ID</h4>
                     <div className="flex items-center justify-between mb-2"><div className="flex items-center gap-2"><div className="w-2.5 h-2.5 md:w-3 md:h-3 bg-[#ff0044]"></div><span className="text-white/80 text-[10px] md:text-xs font-mono">Tree_01</span></div></div>
                     <div className="flex items-center justify-between mb-2"><div className="flex items-center gap-2"><div className="w-2.5 h-2.5 md:w-3 md:h-3 bg-[#00eeff]"></div><span className="text-white/80 text-[10px] md:text-xs font-mono">Tree_02</span></div></div>
                     <div className="flex items-center justify-between mb-2"><div className="flex items-center gap-2"><div className="w-2.5 h-2.5 md:w-3 md:h-3 bg-[#4400ff]"></div><span className="text-white/80 text-[10px] md:text-xs font-mono">Tree_03</span></div></div>
                     <div className="flex items-center justify-between mb-2"><div className="flex items-center gap-2"><div className="w-2.5 h-2.5 md:w-3 md:h-3 bg-[#ffee00]"></div><span className="text-white/80 text-[10px] md:text-xs font-mono">Tree_04</span></div></div>
                     <div className="flex items-center justify-between"><div className="flex items-center gap-2"><div className="w-2.5 h-2.5 md:w-3 md:h-3 bg-[#00ffaa]"></div><span className="text-white/80 text-[10px] md:text-xs font-mono">Tree_05</span></div></div>
                   </div>
                 )}
              </div>
            )}
            
            {activeTab === 'CLASSIFICATION' && (
              <div className="w-full h-full relative" style={{ 
                background: 'radial-gradient(circle at center, #1a202c 0%, #000000 100%)',
                backgroundImage: `url('${activeMission.image}')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: 'contrast(1.2)'
              }}>
                 {/* Simulate Classification (Green canopy, White noise/ground gaps, Orange terrain) */}
                 <div className="absolute inset-0 mix-blend-color opacity-90" style={{
                   backgroundImage: `
                     linear-gradient(to bottom, 
                       #006400 0%, #006400 50%,    /* Branches and Leaves */
                       #ffffff 50%, #ffffff 65%,    /* Unclassified / ground noise */
                       #d2691e 65%, #d2691e 85%,    /* Ground */
                       #8b4513 85%, #8b4513 100%    /* Trunk */
                     )
                   `
                 }}></div>
                 <div className="absolute inset-0 bg-black/20"></div>
                 <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30 mix-blend-overlay"></div>
                 
                 {/* Classification Legend */}
                 {showLegend && (
                   <div className="absolute top-1/2 -translate-y-1/2 left-4 md:left-6 bg-black/80 backdrop-blur p-3 md:p-4 rounded-lg border border-white/10 shadow-2xl animate-in fade-in duration-200">
                     <h4 className="text-white text-[10px] md:text-xs font-bold mb-2 md:mb-3 border-b border-white/20 pb-2">Classification</h4>
                     <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-3"><div className="w-3 h-3 md:w-5 md:h-5 bg-[#006400] border border-white/10"></div><span className="text-white text-[9px] md:text-xs font-mono drop-shadow">24-Branches and Leaves</span></div>
                     <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-3"><div className="w-3 h-3 md:w-5 md:h-5 bg-[#8b4513] border border-white/10"></div><span className="text-white text-[9px] md:text-xs font-mono drop-shadow">23-Trunk</span></div>
                     <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-3"><div className="w-3 h-3 md:w-5 md:h-5 bg-[#d2691e] border border-white/10"></div><span className="text-white text-[9px] md:text-xs font-mono drop-shadow">2-Ground</span></div>
                     <div className="flex items-center gap-2 md:gap-3"><div className="w-3 h-3 md:w-5 md:h-5 bg-white border border-white/10"></div><span className="text-white text-[9px] md:text-xs font-mono drop-shadow">1-UnClassified</span></div>
                   </div>
                 )}
              </div>
            )}
            
            {activeTab === 'ORTHO_2D' && (
               <div className="w-full h-full bg-[#1a1a1a] relative z-0">
                 {/* Top professional toolbar (DJI Terra style) */}
                 <div className="absolute top-0 inset-x-0 h-10 md:h-12 bg-[#2d2d2d]/90 backdrop-blur border-b border-white/10 z-[500] flex items-center justify-between px-2 md:px-4 pointer-events-auto">
                    <div className="flex items-center gap-2 md:gap-4">
                       <span className="text-white/80 text-[10px] md:text-xs font-bold uppercase tracking-wider flex items-center gap-2"><Layers className="w-3 h-3 md:w-4 md:h-4" /> Analyse 2D Terra</span>
                       <div className="h-5 w-px bg-white/20"></div>
                       <button onClick={() => triggerDraw('polygon')} className="text-white/70 hover:text-white p-1 md:p-1.5 rounded hover:bg-white/10 transition-colors" title="Dessiner Polygone (Surface)"><Hexagon className="w-3.5 h-3.5 md:w-4 md:h-4" /></button>
                       <button onClick={() => triggerDraw('polyline')} className="text-white/70 hover:text-white p-1 md:p-1.5 rounded hover:bg-white/10 transition-colors" title="Mesurer Distance"><Ruler className="w-3.5 h-3.5 md:w-4 md:h-4" /></button>
                       <button onClick={() => triggerDraw('circle')} className="text-white/70 hover:text-white p-1 md:p-1.5 rounded hover:bg-white/10 transition-colors" title="Zone Cyclique"><Type className="w-3.5 h-3.5 md:w-4 md:h-4" /></button>
                       <button onClick={() => triggerDraw('marker')} className="text-white/70 hover:text-white p-1 md:p-1.5 rounded hover:bg-white/10 transition-colors" title="Marqueur"><MapPinIcon className="w-3.5 h-3.5 md:w-4 md:h-4" /></button>
                       {measurements.length > 0 && <button onClick={clearLayers} className="text-red-400 hover:text-red-300 p-1 md:p-1.5 rounded hover:bg-red-500/10 transition-colors border-l border-white/20 pl-2 ml-1" title="Effacer tout"><Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" /></button>}
                    </div>
                    <div className="flex items-center gap-1 md:gap-2">
                       <button className="text-white/70 hover:text-white p-1 md:p-1.5 rounded hover:bg-white/10 transition-colors flex items-center gap-1 text-[10px] md:text-xs"><Download className="w-3.5 h-3.5 md:w-4 md:h-4" /><span className="hidden leading-none md:inline mt-0.5">Exporter</span></button>
                       <button className="text-white/70 hover:text-white p-1 md:p-1.5 rounded hover:bg-white/10 transition-colors flex items-center gap-1 text-[10px] md:text-xs"><Printer className="w-3.5 h-3.5 md:w-4 md:h-4" /><span className="hidden leading-none md:inline mt-0.5">Rapport</span></button>
                    </div>
                 </div>

                 {/* Real Map Implementation */}
                 <div className="w-full h-full pt-10 md:pt-12">
                   <MapContainer 
                     center={activeMission.coordinates} 
                     zoom={15} 
                     style={{ height: '100%', width: '100%', background: '#1a1a1a' }}
                     zoomControl={false}
                   >
                     <ZoomControl position="bottomright" />
                     <MapUpdater center={activeMission.coordinates} />
                     <LayersControl position="topright">
                       <LayersControl.BaseLayer checked name="Ortho Mosaïque (Satellite)">
                         <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
                       </LayersControl.BaseLayer>
                       <LayersControl.BaseLayer name="Plan (OSM)">
                         <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                       </LayersControl.BaseLayer>
                       <LayersControl.BaseLayer name="Hybride Topo">
                         <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}" />
                       </LayersControl.BaseLayer>
                     </LayersControl>

                     <style>{`.leaflet-draw.leaflet-control { display: none !important; }`}</style>
                     <FeatureGroup ref={featureGroupRef}>
                       <EditControl
                         position="topleft"
                         onCreated={onCreated}
                         draw={{
                           rectangle: true,
                           polygon: true,
                           circle: true,
                           circlemarker: false,
                           marker: true,
                           polyline: true,
                         }}
                       />
                     </FeatureGroup>
                   </MapContainer>
                 </div>

                 {/* Floating Side Info */}
                 <div className="absolute top-16 md:top-20 left-4 bg-[#2d2d2d]/90 backdrop-blur border border-white/10 p-3 rounded-lg z-[400] shadow-2xl pointer-events-auto w-48 md:w-56 text-white">
                   <h4 className="text-xs md:text-sm font-bold mb-2 md:mb-3 pb-2 border-b border-white/10">Layers (Terra)</h4>
                   <label className="flex items-center gap-2 text-xs text-white/80 mb-2 cursor-pointer hover:text-white">
                     <input type="checkbox" defaultChecked className="accent-[var(--brand)]" />
                     <span>Orthophoto (RGB)</span>
                   </label>
                   <label className="flex items-center gap-2 text-xs text-white/80 mb-2 cursor-pointer hover:text-white">
                     <input type="checkbox" defaultChecked className="accent-[var(--brand)]" />
                     <span>Modèle Numérique de Surface (MNS)</span>
                   </label>
                   <label className="flex items-center gap-2 text-xs text-white/80 cursor-pointer hover:text-white">
                     <input type="checkbox" className="accent-[var(--brand)]" />
                     <span>Modèle Numérique de Terrain (MNT)</span>
                   </label>
                 </div>

                 {/* Existing bottom right info overlay */}
                 <div className="absolute bottom-4 md:bottom-20 right-4 md:right-[4rem] bg-black/80 backdrop-blur border border-white/20 p-3 md:p-4 rounded-xl z-[400] shadow-2xl pointer-events-none">
                   <h4 className="text-white text-xs md:text-sm font-bold mb-1 md:mb-2">2D Orthomosaïque (Terra)</h4>
                   <p className="text-white/60 text-[10px] md:text-xs font-mono">{activeMission.location}</p>
                   <div className="mt-2 md:mt-3 flex items-center gap-2">
                     <div className="w-3 h-3 md:w-4 md:h-4 bg-[var(--brand)]/30 border border-[var(--brand)]"></div>
                     <span className="text-white/80 text-[10px] md:text-xs">Zone d'étude {activeMission.area}</span>
                   </div>
                 </div>
               </div>
            )}
            
            {/* Map Overlay for mapOverlay button toggler */}
            {mapOverlay && (
               <div className="absolute top-[4.5rem] md:top-[4.5rem] right-4 left-4 md:left-auto w-auto md:w-96 h-80 md:h-96 rounded-2xl border border-white/20 shadow-2xl overflow-hidden bg-black z-20 animate-in slide-in-from-right duration-300 flex flex-col pointer-events-auto">
                  <div className="bg-black/90 p-3 flex justify-between items-center border-b border-white/10 shrink-0">
                    <div>
                      <h4 className="text-white text-xs font-bold font-mono">2D Map Viewer (TERRA)</h4>
                      <p className="text-white/50 text-[10px] uppercase tracking-wider">{activeMission.location}</p>
                    </div>
                    <button onClick={() => setMapOverlay(false)} className="text-white/50 hover:text-white transition-colors">✕</button>
                  </div>
                  <div className="flex-1 relative bg-[#1a1a1a]">
                    <MapContainer 
                      center={activeMission.coordinates} 
                      zoom={15} 
                      style={{ height: '100%', width: '100%', background: '#1a1a1a' }}
                      zoomControl={false}
                    >
                      <MapUpdater center={activeMission.coordinates} />
                      <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
                    </MapContainer>
                  </div>
               </div>
            )}
            
            {/* Tree Data Table Overlay */}
            {showTable && (
               <div className="absolute bottom-4 left-4 md:left-auto right-4 z-20 bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl p-4 w-auto md:w-[500px] shadow-2xl animate-in slide-in-from-bottom border-t-4 border-t-[var(--brand)] pointer-events-auto">
                 <div className="flex items-center justify-between mb-4">
                   <h3 className="text-white font-bold flex items-center gap-2"><ListTree className="w-4 h-4 text-[var(--brand)]" /> Résultats: Extraction et Analyse des Arbres (LiDAR)</h3>
                   <button onClick={() => setShowTable(false)} className="text-white/50 hover:text-white">✕</button>
                 </div>
                 
                 <div className="overflow-x-auto">
                   <table className="w-full text-left text-sm text-white/80">
                     <thead className="text-xs uppercase bg-white/5 text-white/50 border-b border-white/10">
                       <tr>
                         <th className="px-3 py-2 font-mono">Tree ID</th>
                         <th className="px-3 py-2 font-mono">DBH (cm)</th>
                         <th className="px-3 py-2 font-mono">Hauteur (m)</th>
                         <th className="px-3 py-2 font-mono">Volume (m³)</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-white/5">
                       <tr className="hover:bg-white/5 transition-colors">
                         <td className="px-3 py-2 font-bold text-[var(--brand)]">102</td>
                         <td className="px-3 py-2 font-mono">35.2</td>
                         <td className="px-3 py-2 font-mono text-emerald-400">14.2</td>
                         <td className="px-3 py-2 font-mono">1.24</td>
                       </tr>
                       <tr className="hover:bg-white/5 transition-colors">
                         <td className="px-3 py-2 font-bold text-[var(--brand)]">103</td>
                         <td className="px-3 py-2 font-mono">42.8</td>
                         <td className="px-3 py-2 font-mono text-emerald-400">16.5</td>
                         <td className="px-3 py-2 font-mono">1.88</td>
                       </tr>
                       <tr className="hover:bg-white/5 transition-colors">
                         <td className="px-3 py-2 font-bold text-[var(--brand)]">104</td>
                         <td className="px-3 py-2 font-mono">28.4</td>
                         <td className="px-3 py-2 font-mono text-emerald-400">11.8</td>
                         <td className="px-3 py-2 font-mono">0.92</td>
                       </tr>
                       <tr className="hover:bg-white/5 transition-colors">
                         <td className="px-3 py-2 font-bold text-[var(--brand)]">105</td>
                         <td className="px-3 py-2 font-mono">31.0</td>
                         <td className="px-3 py-2 font-mono text-emerald-400">12.4</td>
                         <td className="px-3 py-2 font-mono">1.05</td>
                       </tr>
                       <tr className="hover:bg-white/5 transition-colors">
                         <td className="px-3 py-2 font-bold text-[var(--brand)]">106</td>
                         <td className="px-3 py-2 font-mono">48.2</td>
                         <td className="px-3 py-2 font-mono text-emerald-400">18.1</td>
                         <td className="px-3 py-2 font-mono">2.41</td>
                       </tr>
                     </tbody>
                   </table>
                 </div>
                 
                 <div className="mt-3 pt-3 border-t border-white/10 flex justify-between items-center">
                    <span className="text-[10px] text-white/50 uppercase">Extrait via Modèle d'IA</span>
                    <button className="px-3 py-1.5 bg-[var(--brand)] rounded text-xs font-bold text-[var(--bg-main)]">Exporter CSV</button>
                 </div>
               </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
