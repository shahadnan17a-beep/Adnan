import React, {useMemo, useState} from 'react';
import {
  AdvancedMarker,
  ColorScheme,
  Map as GoogleMap,
  MapMouseEvent,
  Polyline,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  Check,
  Crosshair,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
} from 'lucide-react';
import type {LatLngPoint, TripSession, UnitSystem} from '../types/tracking';
import {
  computePathDistanceMeters,
  distanceUnitLabel,
  formatCoords,
  formatDistance,
  formatDuration,
  formatPace,
  formatSpeed,
  getLocalDateKey,
  haversineDistanceMeters,
  metersToUnit,
  speedMsToUnit,
  speedUnitLabel,
  unitSpeedToMs,
  unitToMeters,
} from '../utils/geo';

interface DistanceCalculatorViewProps {
  currentGpsPoint: LatLngPoint | null;
  unit: UnitSystem;
  isDark: boolean;
  quotaExceeded: boolean;
  hasApiKey: boolean;
  onSaveCalculatedTrip: (trip: TripSession) => void;
}

type SolveMode = 'avgSpeed' | 'duration' | 'distance';

const DEFAULT_CENTER: LatLngPoint = {lat: 37.7749, lng: -122.4194};

const MapPanner: React.FC<{target: LatLngPoint | null}> = ({target}) => {
  const map = useMap();
  React.useEffect(() => {
    if (!map || !target) return;
    map.panTo(target);
  }, [map, target]);
  return null;
};

export const DistanceCalculatorView: React.FC<DistanceCalculatorViewProps> = ({
  currentGpsPoint,
  unit,
  isDark,
  quotaExceeded,
  hasApiKey,
  onSaveCalculatedTrip,
}) => {
  const [waypoints, setWaypoints] = useState<LatLngPoint[]>([]);
  const [panTarget, setPanTarget] = useState<LatLngPoint | null>(
    currentGpsPoint
  );
  const [solveMode, setSolveMode] = useState<SolveMode>('avgSpeed');

  // Solver inputs
  const [manualDistanceStr, setManualDistanceStr] = useState('12.5');
  const [hoursStr, setHoursStr] = useState('0');
  const [minutesStr, setMinutesStr] = useState('25');
  const [secondsStr, setSecondsStr] = useState('0');
  const [speedStr, setSpeedStr] = useState('30');
  const [tripLabel, setTripLabel] = useState('');
  const [savedFeedback, setSavedFeedback] = useState(false);

  const mapDistanceMeters = useMemo(
    () => computePathDistanceMeters(waypoints),
    [waypoints]
  );

  // Sync map distance automatically into calculator whenever waypoints >= 2
  const effectiveDistanceMeters = useMemo(() => {
    if (solveMode === 'distance') {
      const totalSec =
        Math.max(0, Number(hoursStr) || 0) * 3600 +
        Math.max(0, Number(minutesStr) || 0) * 60 +
        Math.max(0, Number(secondsStr) || 0);
      const speedMs = unitSpeedToMs(Math.max(0, Number(speedStr) || 0), unit);
      return speedMs * totalSec;
    }
    if (waypoints.length >= 2) {
      return mapDistanceMeters;
    }
    return unitToMeters(Math.max(0, Number(manualDistanceStr) || 0), unit);
  }, [
    solveMode,
    hoursStr,
    minutesStr,
    secondsStr,
    speedStr,
    unit,
    waypoints.length,
    mapDistanceMeters,
    manualDistanceStr,
  ]);

  const solved = useMemo(() => {
    const inputSec =
      Math.max(0, Number(hoursStr) || 0) * 3600 +
      Math.max(0, Number(minutesStr) || 0) * 60 +
      Math.max(0, Number(secondsStr) || 0);
    const inputSpeedMs = unitSpeedToMs(Math.max(0, Number(speedStr) || 0), unit);

    if (solveMode === 'avgSpeed') {
      const durationSec = inputSec;
      const avgSpeedMs =
        durationSec > 0 ? effectiveDistanceMeters / durationSec : 0;
      return {
        distanceMeters: effectiveDistanceMeters,
        durationSec,
        avgSpeedMs,
      };
    }

    if (solveMode === 'duration') {
      const durationSec =
        inputSpeedMs > 0 ? effectiveDistanceMeters / inputSpeedMs : 0;
      return {
        distanceMeters: effectiveDistanceMeters,
        durationSec,
        avgSpeedMs: inputSpeedMs,
      };
    }

    // solveMode === 'distance'
    const distanceMeters = inputSpeedMs * inputSec;
    return {
      distanceMeters,
      durationSec: inputSec,
      avgSpeedMs: inputSpeedMs,
    };
  }, [
    effectiveDistanceMeters,
    hoursStr,
    minutesStr,
    secondsStr,
    speedStr,
    solveMode,
    unit,
  ]);

  const segments = useMemo(() => {
    const list: Array<{from: number; to: number; meters: number}> = [];
    for (let i = 1; i < waypoints.length; i++) {
      list.push({
        from: i,
        to: i + 1,
        meters: haversineDistanceMeters(waypoints[i - 1], waypoints[i]),
      });
    }
    return list;
  }, [waypoints]);

  const handleMapClick = (ev: MapMouseEvent) => {
    if (!ev.detail.latLng) return;
    const pt: LatLngPoint = {
      lat: ev.detail.latLng.lat,
      lng: ev.detail.latLng.lng,
    };
    setWaypoints((prev) => [...prev, pt]);
    if (solveMode === 'distance') {
      setSolveMode('avgSpeed');
    }
  };

  const handleAddCurrentGps = () => {
    if (currentGpsPoint) {
      setWaypoints((prev) => [...prev, currentGpsPoint]);
      setPanTarget(currentGpsPoint);
      return;
    }
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const pt = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          setWaypoints((prev) => [...prev, pt]);
          setPanTarget(pt);
        },
        () => {},
        {enableHighAccuracy: true, timeout: 8000}
      );
    }
  };

  const handleSaveToDailyLog = () => {
    if (solved.distanceMeters <= 0 || solved.durationSec <= 0) return;
    const now = Date.now();
    const session: TripSession = {
      id: `calc_${now}_${Math.random().toString(36).slice(2, 6)}`,
      dateKey: getLocalDateKey(now),
      name:
        tripLabel.trim() ||
        (waypoints.length >= 2
          ? `Map Route (${waypoints.length} pts)`
          : 'Calculated Route'),
      startedAt: now - Math.round(solved.durationSec) * 1000,
      endedAt: now,
      durationSec: Math.round(solved.durationSec),
      movingDurationSec: Math.round(solved.durationSec),
      distanceMeters: solved.distanceMeters,
      avgSpeedMs: solved.avgSpeedMs,
      movingAvgSpeedMs: solved.avgSpeedMs,
      maxSpeedMs: solved.avgSpeedMs,
      source: 'calculator',
      path: [...waypoints],
      speedSamples: [],
    };
    onSaveCalculatedTrip(session);
    setTripLabel('');
    setSavedFeedback(true);
    window.setTimeout(() => setSavedFeedback(false), 2400);
  };

  const dUnit = distanceUnitLabel(unit);
  const sUnit = speedUnitLabel(unit);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          GPS Distance &amp; Speed Calculator
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Click waypoints on the map to measure geodesic GPS distance, then calculate average speed or travel time and log it to your daily total.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Interactive Map Waypoint Measurer */}
        <div className="lg:col-span-7 flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                Click Map to Drop Waypoints
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-blue-700 dark:text-blue-400 font-semibold">
                {formatDistance(mapDistanceMeters, unit, 2)} {dUnit}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleAddCurrentGps}
                className="min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Crosshair className="w-3.5 h-3.5" />
                Add My GPS
              </button>
              <button
                type="button"
                disabled={waypoints.length === 0}
                onClick={() => setWaypoints((prev) => prev.slice(0, -1))}
                className="min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 inline-flex items-center gap-1 whitespace-nowrap"
              >
                <Undo2 className="w-3.5 h-3.5" />
                Undo
              </button>
              <button
                type="button"
                disabled={waypoints.length === 0}
                onClick={() => setWaypoints([])}
                className="min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-red-600 hover:border-red-200 dark:hover:border-red-900 disabled:opacity-40 inline-flex items-center gap-1 whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Clear
              </button>
            </div>
          </div>

          <div className="relative flex-1 min-h-[380px] lg:min-h-[460px] w-full bg-slate-100 dark:bg-slate-950">
            {hasApiKey && !quotaExceeded ? (
              <GoogleMap
                mapId="DEMO_MAP_ID"
                defaultCenter={currentGpsPoint || DEFAULT_CENTER}
                defaultZoom={13}
                colorScheme={isDark ? ColorScheme.DARK : ColorScheme.LIGHT}
                gestureHandling="greedy"
                disableDefaultUI={false}
                streetViewControl={false}
                fullscreenControl={false}
                onClick={handleMapClick}
                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                style={{width: '100%', height: '100%'}}
              >
                <MapPanner target={panTarget} />

                {waypoints.length >= 2 && (
                  <Polyline
                    path={waypoints}
                    strokeColor={isDark ? '#60A5FA' : '#2563EB'}
                    strokeOpacity={0.95}
                    strokeWeight={4}
                    geodesic
                  />
                )}

                {waypoints.map((pt, index) => (
                  <AdvancedMarker
                    key={`${pt.lat}-${pt.lng}-${index}`}
                    position={pt}
                    draggable
                    onDragEnd={(e) => {
                      if (!e.latLng) return;
                      const updated = {
                        lat: e.latLng.lat(),
                        lng: e.latLng.lng(),
                      };
                      setWaypoints((prev) =>
                        prev.map((item, i) => (i === index ? updated : item))
                      );
                    }}
                    anchorLeft="-50%"
                    anchorTop="-50%"
                    title={`Waypoint ${index + 1} (drag to move)`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full border-2 border-white shadow-md flex items-center justify-center font-mono text-xs font-bold text-white ${
                        index === 0
                          ? 'bg-emerald-600'
                          : index === waypoints.length - 1
                            ? 'bg-red-600'
                            : 'bg-blue-600'
                      }`}
                    >
                      {index + 1}
                    </div>
                  </AdvancedMarker>
                ))}
              </GoogleMap>
            ) : (
              <div className="h-full min-h-[380px] flex flex-col items-center justify-center p-6 text-center">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Interactive map unavailable right now
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  You can still enter distance, time, and speed directly in the calculator panel on the right.
                </p>
              </div>
            )}
          </div>

          {/* Segment list footer */}
          {waypoints.length > 0 && (
            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 max-h-40 overflow-y-auto">
              <div className="space-y-1.5 text-xs font-mono tabular-nums">
                {waypoints.map((pt, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 text-slate-600 dark:text-slate-300"
                  >
                    <span className="truncate">
                      <strong className="text-slate-900 dark:text-slate-100">
                        P{idx + 1}
                      </strong>{' '}
                      {formatCoords(pt)}
                    </span>
                    <div className="flex items-center gap-3 shrink-0">
                      {idx > 0 && (
                        <span className="text-blue-700 dark:text-blue-400">
                          +{formatDistance(segments[idx - 1].meters, unit, 2)}{' '}
                          {dUnit}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setWaypoints((prev) =>
                            prev.filter((_, i) => i !== idx)
                          )
                        }
                        className="p-1 text-slate-400 hover:text-red-600"
                        aria-label={`Remove waypoint ${idx + 1}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Distance / Speed / Avg Speed Solver */}
        <div className="lg:col-span-5 flex flex-col justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-5">
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Speed &amp; Time Solver
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Choose the metric to calculate. Map waypoints automatically populate distance.
              </p>
            </div>

            {/* Solve mode segmented buttons */}
            <div
              className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800"
              role="group"
              aria-label="Calculation target"
            >
              {(
                [
                  ['avgSpeed', 'Avg Speed'],
                  ['duration', 'Travel Time'],
                  ['distance', 'Distance'],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSolveMode(mode)}
                  className={`py-2 px-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                    solveMode === mode
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Dynamic input fields */}
            <div className="space-y-4">
              {solveMode !== 'distance' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="calc-distance"
                      className="text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Distance ({dUnit})
                    </label>
                    {waypoints.length >= 2 && (
                      <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                        Synced from {waypoints.length} map pins
                      </span>
                    )}
                  </div>
                  <input
                    id="calc-distance"
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={waypoints.length >= 2}
                    value={
                      waypoints.length >= 2
                        ? metersToUnit(mapDistanceMeters, unit).toFixed(2)
                        : manualDistanceStr
                    }
                    onChange={(e) => setManualDistanceStr(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-base text-slate-900 dark:text-slate-100 disabled:opacity-75 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              )}

              {solveMode !== 'duration' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Duration (Hours · Minutes · Seconds)
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <input
                        type="number"
                        min="0"
                        max="999"
                        value={hoursStr}
                        onChange={(e) => setHoursStr(e.target.value)}
                        aria-label="Hours"
                        className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-base text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                      <span className="mt-1 block text-[11px] text-slate-400">
                        hrs
                      </span>
                    </div>
                    <div>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={minutesStr}
                        onChange={(e) => setMinutesStr(e.target.value)}
                        aria-label="Minutes"
                        className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-base text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                      <span className="mt-1 block text-[11px] text-slate-400">
                        min
                      </span>
                    </div>
                    <div>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={secondsStr}
                        onChange={(e) => setSecondsStr(e.target.value)}
                        aria-label="Seconds"
                        className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-base text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                      <span className="mt-1 block text-[11px] text-slate-400">
                        sec
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {solveMode !== 'avgSpeed' && (
                <div>
                  <label
                    htmlFor="calc-speed"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Average Speed ({sUnit})
                  </label>
                  <input
                    id="calc-speed"
                    type="number"
                    step="0.5"
                    min="0"
                    value={speedStr}
                    onChange={(e) => setSpeedStr(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-base text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              )}
            </div>

            {/* Result summary panel */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {solveMode === 'avgSpeed'
                    ? 'Calculated Avg Speed'
                    : solveMode === 'duration'
                      ? 'Estimated Travel Time'
                      : 'Calculated Distance'}
                </span>
                <span className="font-mono text-3xl font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                  {solveMode === 'avgSpeed' && (
                    <>
                      {formatSpeed(solved.avgSpeedMs, unit, 1)}{' '}
                      <span className="text-sm font-medium text-slate-500">
                        {sUnit}
                      </span>
                    </>
                  )}
                  {solveMode === 'duration' && formatDuration(solved.durationSec)}
                  {solveMode === 'distance' && (
                    <>
                      {formatDistance(solved.distanceMeters, unit, 2)}{' '}
                      <span className="text-sm font-medium text-slate-500">
                        {dUnit}
                      </span>
                    </>
                  )}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs tabular-nums">
                <div>
                  <span className="text-slate-500 dark:text-slate-400">
                    Distance
                  </span>
                  <p className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {formatDistance(solved.distanceMeters, unit, 2)} {dUnit}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">
                    Avg Speed
                  </span>
                  <p className="mt-0.5 font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                    {speedMsToUnit(solved.avgSpeedMs, unit).toFixed(1)} {sUnit}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">
                    Pace
                  </span>
                  <p className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {formatPace(solved.avgSpeedMs, unit)} /{dUnit}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Save calculated trip into Today's Daily Total */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
            <input
              type="text"
              placeholder="Optional trip label (e.g. Evening Ride)"
              value={tripLabel}
              onChange={(e) => setTripLabel(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <button
              type="button"
              disabled={solved.distanceMeters <= 0 || solved.durationSec <= 0}
              onClick={handleSaveToDailyLog}
              className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-semibold hover:bg-slate-800 dark:hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-2"
            >
              {savedFeedback ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
                  Added to Today&apos;s Daily Log
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save to Today&apos;s Daily Total
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
