import { MapContainer, TileLayer, Marker, Popup, LayersControl } from 'react-leaflet';
import L from 'leaflet';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Fix for default marker icons in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

export function DashboardMap() {
  const position: L.LatLngExpression = [35.3, -5.2]; // Approximate center of Tanger-Tetouan-Al Hoceima

  return (
    <div className="h-[400px] w-full rounded-2xl overflow-hidden shadow-sm border border-stone-200 z-0 relative">
      <MapContainer center={position} zoom={8} className="h-full w-full" style={{ zIndex: 0 }}>
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Cartographie Standard">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite">
            <TileLayer
              attribution='&copy; Esri &amp;mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
          </LayersControl.BaseLayer>
        </LayersControl>
        
        <Marker position={[35.7595, -5.8340]}>
          <Popup>Direction Provinciale de Tanger</Popup>
        </Marker>
        <Marker position={[35.5785, -5.3684]}>
          <Popup>Direction Provinciale de Tétouan</Popup>
        </Marker>
        <Marker position={[35.2472, -3.9317]}>
          <Popup>Direction Provinciale d'Al Hoceïma</Popup>
        </Marker>
        <Marker position={[35.1667, -5.2667]}>
           <Popup>Direction Provinciale de Chefchaouen</Popup>
        </Marker>

      </MapContainer>
    </div>
  );
}
