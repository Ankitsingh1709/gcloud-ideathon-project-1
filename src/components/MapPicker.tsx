import React, { useState, useEffect } from 'react';
import { APIProvider, Map, Marker } from '@vis.gl/react-google-maps';
import { MapPin, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { LocationData } from '../types';

interface MapPickerProps {
  location?: LocationData;
  onChange: (loc?: LocationData) => void;
}

export default function MapPicker({ location, onChange }: MapPickerProps) {
  // Initialize state with default or existing values
  const [latInput, setLatInput] = useState(location?.lat?.toString() || '');
  const [lngInput, setLngInput] = useState(location?.lng?.toString() || '');
  const [placeInput, setPlaceInput] = useState(location?.placeName || '');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Read client-side build-time Google Maps API key
  const mapsApiKey = ((import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY as string) || '';

  // Keep input fields synchronized with prop changes
  useEffect(() => {
    setLatInput(location?.lat?.toString() || '');
    setLngInput(location?.lng?.toString() || '');
    setPlaceInput(location?.placeName || '');
    setValidationError(null);
  }, [location?.lat, location?.lng, location?.placeName]);

  // Validates coordinate boundaries and parses numeric values
  const handleValidateAndSave = (latStr: string, lngStr: string, placeStr: string) => {
    if (!latStr.trim() && !lngStr.trim() && !placeStr.trim()) {
      onChange(undefined);
      setValidationError(null);
      return;
    }

    const parsedLat = parseFloat(latStr);
    const parsedLng = parseFloat(lngStr);

    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      setValidationError('Coordinates must be valid decimal numbers.');
      return;
    }

    if (parsedLat < -90 || parsedLat > 90) {
      setValidationError('Latitude must be between -90 and 90 degrees.');
      return;
    }

    if (parsedLng < -180 || parsedLng > 180) {
      setValidationError('Longitude must be between -180 and 180 degrees.');
      return;
    }

    setValidationError(null);
    onChange({
      lat: parsedLat,
      lng: parsedLng,
      placeName: placeStr.trim() || undefined
    });
  };

  const handleManualSave = () => {
    handleValidateAndSave(latInput, lngInput, placeInput);
  };

  const handleClearLocation = () => {
    setLatInput('');
    setLngInput('');
    setPlaceInput('');
    setValidationError(null);
    onChange(undefined);
  };

  // Click on active Google Map returns clicked coordinates
  const handleMapClick = (e: any) => {
    if (e.detail?.latLng) {
      const clickedLat = e.detail.latLng.lat;
      const clickedLng = e.detail.latLng.lng;
      
      setLatInput(clickedLat.toFixed(6));
      setLngInput(clickedLng.toFixed(6));
      handleValidateAndSave(clickedLat.toFixed(6), clickedLng.toFixed(6), placeInput);
    }
  };

  // Default coordinate center (San Francisco)
  const defaultCenter = { 
    lat: location?.lat || 37.7749, 
    lng: location?.lng || -122.4194 
  };

  return (
    <div className="bg-[#121212] border border-[#2a2a2a] rounded-2xl p-5 space-y-4 text-left" id="map-picker-container">
      <div className="flex items-center justify-between border-b border-[#222] pb-3">
        <div className="flex items-center space-x-2 text-white">
          <MapPin className="w-4.5 h-4.5 text-[#8b5cf6]" />
          <span className="text-xs font-bold uppercase tracking-wider">Location Metadata</span>
        </div>
        {location && (
          <button
            type="button"
            onClick={handleClearLocation}
            className="text-[10px] text-rose-400 hover:underline font-bold uppercase cursor-pointer"
          >
            Clear Location
          </button>
        )}
      </div>

      {/* Interactive Google Map Frame */}
      <div className="relative w-full h-[180px] bg-[#0c0c0c] rounded-xl overflow-hidden border border-[#222]" id="google-map-frame-wrapper">
        {mapsApiKey ? (
          <APIProvider apiKey={mapsApiKey}>
            <Map
              defaultZoom={12}
              defaultCenter={defaultCenter}
              mapId="DEMO_MAP_ID"
              onClick={handleMapClick}
              gestureHandling={'cooperative'}
              className="w-full h-full"
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            >
              {location && (
                <Marker 
                  position={{ lat: location.lat, lng: location.lng }} 
                />
              )}
            </Map>
          </APIProvider>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-2 bg-gradient-to-br from-[#0c0c0c] to-[#121212]">
            <MapPin className="w-8 h-8 text-[#333] shrink-0" />
            <div className="space-y-0.5">
              <span className="text-[11px] font-bold text-[#888] block">Interactive Map Standby</span>
              <p className="text-[9px] text-[#555] leading-relaxed max-w-xs">
                To activate interactive clicking, add your restricted key to <strong>VITE_GOOGLE_MAPS_API_KEY</strong>. Manual entry below is fully operational.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Coordinates Form Entry */}
      <div className="grid grid-cols-2 gap-3" id="map-picker-coordinates-form">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-[#666] uppercase tracking-wider block">Latitude</label>
          <input
            type="text"
            value={latInput}
            onChange={(e) => {
              setLatInput(e.target.value);
              setValidationError(null);
            }}
            placeholder="e.g. 37.7749"
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-[#444] focus:outline-none focus:border-[#8b5cf6]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-[#666] uppercase tracking-wider block">Longitude</label>
          <input
            type="text"
            value={lngInput}
            onChange={(e) => {
              setLngInput(e.target.value);
              setValidationError(null);
            }}
            placeholder="e.g. -122.4194"
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-[#444] focus:outline-none focus:border-[#8b5cf6]"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-bold text-[#666] uppercase tracking-wider block">Place Name</label>
        <input
          type="text"
          value={placeInput}
          onChange={(e) => {
            setPlaceInput(e.target.value);
            setValidationError(null);
          }}
          placeholder="e.g. Golden Gate Park"
          className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-[#444] focus:outline-none focus:border-[#8b5cf6]"
        />
      </div>

      {/* Error Alert feedback */}
      {validationError && (
        <div className="flex items-start space-x-1.5 bg-rose-950/20 border border-rose-900/30 p-2.5 rounded-lg text-[10px] text-rose-300">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400 mt-0.5" />
          <span>{validationError}</span>
        </div>
      )}

      {/* Manual Pin Bind Button */}
      <button
        type="button"
        onClick={handleManualSave}
        className="w-full flex items-center justify-center space-x-1 bg-[#1a1a1a] hover:bg-[#222] text-[#ccc] border border-[#333] font-bold text-[10px] py-2 rounded-xl transition cursor-pointer"
      >
        <Check className="w-3.5 h-3.5 text-[#10b981]" />
        <span>Save Location Coordinates</span>
      </button>
    </div>
  );
}
