import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polygon, LayersControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icon in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface MapProps {
  center: [number, number];
  zoom?: number;
  className?: string;
  locationName: string;
  zoomControl?: boolean;
}

export function InteractiveMap({ center, zoom = 14, className, locationName, zoomControl = false }: MapProps) {
  // Move the mockup polygon to the current center
  const dynamicPolygon: [number, number][] = [
    [center[0], center[1]],
    [center[0] + 0.005, center[1] + 0.005],
    [center[0] + 0.007, center[1] - 0.005],
    [center[0] + 0.003, center[1] - 0.010],
  ];

  return (
    <div className={className} style={{ width: '100%', height: '100%' }}>
      <MapContainer key={`${center[0]}-${center[1]}`} center={center} zoom={zoom} style={{ height: '100%', width: '100%', borderRadius: 'inherit' }} zoomControl={zoomControl}>
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Hybride Satellite + Ref">
            <TileLayer
              attribution='&copy; Google Maps'
              url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="OpenStreetMap">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          </LayersControl.BaseLayer>
        </LayersControl>
        
        <Marker position={center}>
          <Popup>{locationName}</Popup>
        </Marker>
        <Polygon positions={dynamicPolygon} pathOptions={{ color: 'var(--brand)', fillColor: 'var(--brand)', fillOpacity: 0.3 }} />
      </MapContainer>
    </div>
  );
}
