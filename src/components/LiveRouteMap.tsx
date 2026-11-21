import React, {useEffect, useState} from 'react';
import {
  AdvancedMarker,
  Circle,
  ColorScheme,
  Map as GoogleMap,
  Pin,
  Polyline,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {Crosshair, Layers, Navigation} from 'lucide-react';
import type {GpsPoint, LatLngPoint, MapStyleType} from '../types/tracking';
import {formatCoords} from '../utils/geo';

interface LiveRouteMapProps {
  currentPoint: GpsPoint | null;
  path: LatLngPoint[];
  isTracking: boolean;
  isDark: boolean;
  quotaExceeded: boolean;
  hasApiKey: boolean;
  onLocateOnce: () => void;
}

const DEFAULT_CENTER: LatLngPoint = {lat: 37.7955, lng: -122.3937};

interface CameraFollowerProps {
  target: LatLngPoint | null;
  followLock: boolean;
  recenterSignal: number;
  fitPath: LatLngPoint[];
}

const CameraController: React.FC<CameraFollowerProps> = ({
  target,
  followLock,
  recenterSignal,
  fitPath,
}) => {
  const map = useMap();
  const coreLib = useMapsLibrary('core');

  useEffect(() => {
    if (!map || !target) return;
    if (followLock) {
      map.panTo(target);
    }
  }, [map, target, followLock]);

  useEffect(() => {
    if (!map || recenterSignal === 0) return;
    if (target) {
      map.panTo(target);
      if ((map.getZoom() ?? 15) < 15) {
        map.setZoom(16);
      }
    } else if (fitPath.length > 1 && coreLib) {
      const bounds = new coreLib.LatLngBounds();
      fitPath.forEach((p) => bounds.extend(p));
      map.fitBounds(bounds, 48);
    }
  }, [map, coreLib, recenterSignal, target, fitPath]);

  return null;
};

export const LiveRouteMap: React.FC<LiveRouteMapProps> = ({
  currentPoint,
  path,
  isTracking,
  isDark,
  quotaExceeded,
  hasApiKey,
  onLocateOnce,
}) => {
  const [followLock, setFollowLock] = useState(true);
  const [mapType, setMapType] = useState<MapStyleType>('roadmap');
  const [recenterSignal, setRecenterSignal] = useState(0);

  const startPoint = path.length > 0 ? path[0] : null;
  const activeCoord: LatLngPoint | null = currentPoint
    ? {lat: currentPoint.lat, lng: currentPoint.lng}
    : path.length > 0
      ? path[path.length - 1]
      : null;

  const heading = currentPoint?.heading ?? 0;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
      {/* Compact top control bar over map frame */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            Live GPS Route
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {path.length} pts
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Map type segmented control */}
          <div
            className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800"
            role="group"
            aria-label="Map layer"
          >
            {(
              [
                ['roadmap', 'Road'],
                ['hybrid', 'Satellite'],
                ['terrain', 'Terrain'],
              ] as const
            ).map(([type, label]) => (
              <button
                key={type}
                type="button"
                onClick={() => setMapType(type)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  mapType === type
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setFollowLock((prev) => !prev);
            }}
            className={`min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              followLock
                ? 'border-blue-600/30 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
            title="Auto-follow live GPS position"
          >
            <Navigation className="w-3.5 h-3.5" />
            Follow
          </button>

          <button
            type="button"
            onClick={() => {
              onLocateOnce();
              setFollowLock(true);
              setRecenterSignal((n) => n + 1);
            }}
            className="min-h-[34px] min-w-[34px] px-2 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center justify-center"
            title="Center on current GPS location"
            aria-label="Center on current GPS location"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Map canvas with explicit height per CF2 */}
      <div className="relative flex-1 min-h-[380px] lg:min-h-[470px] w-full bg-slate-100 dark:bg-slate-950">
        {hasApiKey && !quotaExceeded ? (
          <GoogleMap
            mapId="DEMO_MAP_ID"
            defaultCenter={activeCoord || DEFAULT_CENTER}
            defaultZoom={15}
            mapTypeId={mapType}
            colorScheme={isDark ? ColorScheme.DARK : ColorScheme.LIGHT}
            gestureHandling="greedy"
            disableDefaultUI={false}
            streetViewControl={false}
            mapTypeControl={false}
            fullscreenControl={false}
            onDragstart={() => setFollowLock(false)}
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            style={{width: '100%', height: '100%'}}
          >
            <CameraController
              target={activeCoord}
              followLock={followLock}
              recenterSignal={recenterSignal}
              fitPath={path}
            />

            {/* GPS route polyline */}
            {path.length >= 2 && (
              <Polyline
                path={path}
                strokeColor={isDark ? '#60A5FA' : '#2563EB'}
                strokeOpacity={0.95}
                strokeWeight={5}
                geodesic
              />
            )}

            {/* Accuracy circle around live GPS position */}
            {currentPoint && currentPoint.accuracy > 0 && (
              <Circle
                center={{lat: currentPoint.lat, lng: currentPoint.lng}}
                radius={Math.min(currentPoint.accuracy, 120)}
                strokeColor="#2563EB"
                strokeOpacity={0.35}
                strokeWeight={1}
                fillColor="#3B82F6"
                fillOpacity={0.12}
                clickable={false}
              />
            )}

            {/* Start point marker */}
            {startPoint && path.length > 1 && (
              <AdvancedMarker position={startPoint} title="Trip Start">
                <Pin
                  background="#059669"
                  borderColor="#065F46"
                  glyphColor="#FFFFFF"
                  scale={0.85}
                />
              </AdvancedMarker>
            )}

            {/* Live GPS position marker with directional indicator */}
            {activeCoord && (
              <AdvancedMarker
                position={activeCoord}
                anchorLeft="-50%"
                anchorTop="-50%"
                title="Current GPS Position"
              >
                <div className="relative flex items-center justify-center w-8 h-8">
                  <div
                    className={`w-5 h-5 rounded-full border-2 border-white shadow-md flex items-center justify-center ${
                      isTracking ? 'bg-blue-600' : 'bg-slate-700'
                    }`}
                    style={{
                      transform: `rotate(${heading}deg)`,
                      transition: 'transform 180ms cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                  >
                    <svg
                      viewBox="0 0 12 12"
                      className="w-2.5 h-2.5 fill-white"
                      aria-hidden="true"
                    >
                      <path d="M6 1L10 10L6 8L2 10L6 1Z" />
                    </svg>
                  </div>
                </div>
              </AdvancedMarker>
            )}
          </GoogleMap>
        ) : (
          <div className="h-full min-h-[380px] flex flex-col items-center justify-center p-6 text-center">
            <Layers className="w-8 h-8 text-slate-400 mb-3" />
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {quotaExceeded
                ? 'Map tiles paused due to API quota'
                : 'Google Maps API key required for map view'}
            </p>
            <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
              Live GPS distance, speed, average speed, and daily odometer logging continue working offline in real time.
            </p>
          </div>
        )}
      </div>

      {/* Unboxed telemetry footer line */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
        <span>{formatCoords(activeCoord)}</span>
        <div className="flex items-center gap-2">
          <span>
            Accuracy:{' '}
            {currentPoint ? `±${Math.round(currentPoint.accuracy)} m` : '—'}
          </span>
          {currentPoint?.altitude !== null &&
            currentPoint?.altitude !== undefined && (
              <>
                <span aria-hidden="true">·</span>
                <span>Alt: {Math.round(currentPoint.altitude)} m</span>
              </>
            )}
        </div>
      </div>
    </div>
  );
};
