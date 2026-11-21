import {useCallback, useEffect, useRef, useState} from 'react';
import type {
  GpsPoint,
  LatLngPoint,
  SpeedSample,
  TrackerStatus,
  TrackingSource,
  TripSession,
} from '../types/tracking';
import {
  buildSimulationWaypoints,
  computeBearingDegrees,
  getLocalDateKey,
  haversineDistanceMeters,
  moveCoordinate,
} from '../utils/geo';

// Default starting anchor (San Francisco Embarcadero) used only if browser geolocation
// has not yet returned a coordinate when the user starts Simulation mode.
const FALLBACK_ORIGIN: LatLngPoint = {lat: 37.7955, lng: -122.3937};

const MAX_ACCEPTED_ACCURACY_METERS = 75;
const MIN_MOVEMENT_METERS = 2.5;
const MOVING_SPEED_THRESHOLD_MS = 0.5; // 1.8 km/h
const MAX_SPEED_SAMPLES = 240;

export interface GpsTrackerState {
  status: TrackerStatus;
  source: TrackingSource;
  currentPoint: GpsPoint | null;
  path: LatLngPoint[];
  distanceMeters: number;
  currentSpeedMs: number;
  avgSpeedMs: number;
  movingAvgSpeedMs: number;
  maxSpeedMs: number;
  elapsedSec: number;
  movingSec: number;
  speedSamples: SpeedSample[];
  gpsError: string | null;
  permissionState: 'prompt' | 'granted' | 'denied' | 'unsupported';
  pointsRecorded: number;
}

interface UseGpsTrackerOptions {
  onTripSaved: (trip: TripSession) => void;
}

export function useGpsTracker({onTripSaved}: UseGpsTrackerOptions) {
  const [status, setStatus] = useState<TrackerStatus>('idle');
  const [source, setSource] = useState<TrackingSource>('gps');
  const [currentPoint, setCurrentPoint] = useState<GpsPoint | null>(null);
  const [path, setPath] = useState<LatLngPoint[]>([]);
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [currentSpeedMs, setCurrentSpeedMs] = useState(0);
  const [maxSpeedMs, setMaxSpeedMs] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [movingSec, setMovingSec] = useState(0);
  const [speedSamples, setSpeedSamples] = useState<SpeedSample[]>([]);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<
    'prompt' | 'granted' | 'denied' | 'unsupported'
  >('prompt');

  const watchIdRef = useRef<number | null>(null);
  const simIntervalRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const startedAtRef = useRef<number | null>(null);
  const lastValidPointRef = useRef<GpsPoint | null>(null);
  const recentSpeedsRef = useRef<number[]>([]);
  const distanceRef = useRef(0);
  const currentSpeedRef = useRef(0);
  const maxSpeedRef = useRef(0);
  const elapsedRef = useRef(0);
  const movingRef = useRef(0);
  const pathRef = useRef<LatLngPoint[]>([]);
  const speedSamplesRef = useRef<SpeedSample[]>([]);

  // Simulation cursor refs
  const simWaypointsRef = useRef<LatLngPoint[]>([]);
  const simSegmentIdxRef = useRef(0);
  const simPosRef = useRef<LatLngPoint>(FALLBACK_ORIGIN);
  const simTickRef = useRef(0);

  // Check geolocation permission state on mount
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setPermissionState('unsupported');
      return;
    }
    if ('permissions' in navigator && navigator.permissions?.query) {
      navigator.permissions
        .query({name: 'geolocation'})
        .then((perm) => {
          setPermissionState(perm.state);
          perm.onchange = () => setPermissionState(perm.state);
        })
        .catch(() => {
          // Permissions API not available for geolocation in this browser
        });
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
  }, []);

  const acquireWakeLock = useCallback(() => {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      navigator.wakeLock
        .request('screen')
        .then((sentinel) => {
          wakeLockRef.current = sentinel;
        })
        .catch(() => {
          // Wake lock optional
        });
    }
  }, []);

  const stopStreams = useCallback(() => {
    if (watchIdRef.current !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (simIntervalRef.current !== null) {
      window.clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }
    if (timerIntervalRef.current !== null) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    releaseWakeLock();
  }, [releaseWakeLock]);

  const ingestGpsPoint = useCallback((point: GpsPoint, isSimulated: boolean) => {
    const prev = lastValidPointRef.current;

    // Filter noisy GPS readings when using real hardware GPS
    if (!isSimulated && point.accuracy > MAX_ACCEPTED_ACCURACY_METERS && prev) {
      setCurrentPoint(point);
      return;
    }

    let deltaMeters = 0;
    let computedSpeedMs = point.speedMs;
    let heading = point.heading;

    if (prev) {
      const rawDist = haversineDistanceMeters(prev, point);
      const dtSec = Math.max(0.2, (point.timestamp - prev.timestamp) / 1000);

      // Guard against impossible GPS teleport spikes (> 110 m/s = ~396 km/h)
      const impliedSpeed = rawDist / dtSec;
      if (!isSimulated && impliedSpeed > 110) {
        return;
      }

      if (!Number.isFinite(computedSpeedMs) || computedSpeedMs < 0) {
        computedSpeedMs = impliedSpeed;
      }

      // Suppress stationary GPS drift jitter
      if (
        !isSimulated &&
        rawDist < MIN_MOVEMENT_METERS &&
        computedSpeedMs < MOVING_SPEED_THRESHOLD_MS
      ) {
        computedSpeedMs = 0;
        deltaMeters = 0;
      } else {
        deltaMeters = rawDist;
        if (heading === null && rawDist > 1) {
          heading = computeBearingDegrees(prev, point);
        }
      }
    } else if (!Number.isFinite(computedSpeedMs) || computedSpeedMs < 0) {
      computedSpeedMs = 0;
    }

    // 3-sample rolling average for smooth live speedometer needle
    const buf = recentSpeedsRef.current;
    buf.push(computedSpeedMs);
    if (buf.length > 3) buf.shift();
    const smoothedSpeed =
      buf.reduce((acc, v) => acc + v, 0) / Math.max(1, buf.length);

    const nextPoint: GpsPoint = {
      ...point,
      speedMs: smoothedSpeed,
      heading,
    };

    setCurrentPoint(nextPoint);
    currentSpeedRef.current = smoothedSpeed;
    setCurrentSpeedMs(smoothedSpeed);

    if (smoothedSpeed > maxSpeedRef.current) {
      maxSpeedRef.current = smoothedSpeed;
      setMaxSpeedMs(smoothedSpeed);
    }

    if (!prev || deltaMeters > 0) {
      lastValidPointRef.current = nextPoint;
      distanceRef.current += deltaMeters;
      setDistanceMeters(distanceRef.current);

      const coord: LatLngPoint = {lat: nextPoint.lat, lng: nextPoint.lng};
      const nextPath = [...pathRef.current, coord];
      pathRef.current = nextPath;
      setPath(nextPath);
    }
  }, []);

  const startTimerLoop = useCallback(() => {
    if (timerIntervalRef.current !== null) {
      window.clearInterval(timerIntervalRef.current);
    }
    timerIntervalRef.current = window.setInterval(() => {
      elapsedRef.current += 1;
      setElapsedSec(elapsedRef.current);

      if (currentSpeedRef.current >= MOVING_SPEED_THRESHOLD_MS) {
        movingRef.current += 1;
        setMovingSec(movingRef.current);
      }

      // Record speed sample for chart
      const nextSample: SpeedSample = {
        elapsedSec: elapsedRef.current,
        speedMs: currentSpeedRef.current,
        distanceMeters: distanceRef.current,
      };
      const samples = [...speedSamplesRef.current, nextSample];
      if (samples.length > MAX_SPEED_SAMPLES) {
        // Keep every second sample when exceeding cap to preserve full trip shape
        speedSamplesRef.current = samples.filter(
          (_, idx) => idx % 2 === 0 || idx === samples.length - 1
        );
      } else {
        speedSamplesRef.current = samples;
      }
      setSpeedSamples(speedSamplesRef.current);
    }, 1000);
  }, []);

  const startHardwareGpsWatch = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGpsError(
        'Geolocation is not supported in this browser. Try Simulate GPS or the Distance Calculator.'
      );
      setStatus('idle');
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsError(null);
        setPermissionState('granted');
        const speed =
          typeof pos.coords.speed === 'number' && pos.coords.speed >= 0
            ? pos.coords.speed
            : -1;
        ingestGpsPoint(
          {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            timestamp: pos.timestamp || Date.now(),
            speedMs: speed,
            accuracy: pos.coords.accuracy ?? 15,
            heading: pos.coords.heading ?? null,
            altitude: pos.coords.altitude ?? null,
          },
          false
        );
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setPermissionState('denied');
          setGpsError(
            'Location access was denied. Enable GPS permission in your browser settings or use Simulate GPS to test live telemetry.'
          );
          stopStreams();
          setStatus('idle');
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGpsError(
            'GPS signal unavailable right now. Move near an open sky or try Simulate GPS.'
          );
        } else if (err.code === err.TIMEOUT) {
          setGpsError('Waiting for stronger GPS satellite lock...');
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 15000,
      }
    );
  }, [ingestGpsPoint, stopStreams]);

  const startSimulationLoop = useCallback(
    (anchor: LatLngPoint) => {
      if (simWaypointsRef.current.length === 0) {
        simWaypointsRef.current = buildSimulationWaypoints(anchor);
        simSegmentIdxRef.current = 0;
        simPosRef.current = anchor;
      }

      // Emit immediate initial point if starting fresh
      if (pathRef.current.length === 0) {
        ingestGpsPoint(
          {
            lat: simPosRef.current.lat,
            lng: simPosRef.current.lng,
            timestamp: Date.now(),
            speedMs: 0,
            accuracy: 4.5,
            heading: 0,
            altitude: 14,
          },
          true
        );
      }

      simIntervalRef.current = window.setInterval(() => {
        simTickRef.current += 1;
        const t = simTickRef.current;
        const waypoints = simWaypointsRef.current;
        const targetIdx = (simSegmentIdxRef.current + 1) % waypoints.length;
        const target = waypoints[targetIdx];

        const current = simPosRef.current;
        const distToTarget = haversineDistanceMeters(current, target);
        const bearing = computeBearingDegrees(current, target);

        // Realistic urban cycling/driving speed curve (between ~18 km/h and ~46 km/h)
        const baseSpeedMs = 8.4 + Math.sin(t / 7) * 3.1 + Math.cos(t / 13) * 1.4;
        const speedMs = Math.max(3.2, baseSpeedMs);
        const stepMeters = speedMs * 1.0; // 1 second tick

        let nextPos: LatLngPoint;
        if (stepMeters >= distToTarget) {
          nextPos = target;
          simSegmentIdxRef.current = targetIdx;
        } else {
          nextPos = moveCoordinate(current, bearing, stepMeters);
        }

        simPosRef.current = nextPos;

        ingestGpsPoint(
          {
            lat: nextPos.lat,
            lng: nextPos.lng,
            timestamp: Date.now(),
            speedMs,
            accuracy: 4.2 + (t % 3) * 0.6,
            heading: bearing,
            altitude: 14 + Math.sin(t / 10) * 6,
          },
          true
        );
      }, 1000);
    },
    [ingestGpsPoint]
  );

  const resetInternalState = useCallback(() => {
    startedAtRef.current = null;
    lastValidPointRef.current = null;
    recentSpeedsRef.current = [];
    distanceRef.current = 0;
    currentSpeedRef.current = 0;
    maxSpeedRef.current = 0;
    elapsedRef.current = 0;
    movingRef.current = 0;
    pathRef.current = [];
    speedSamplesRef.current = [];
    simWaypointsRef.current = [];
    simSegmentIdxRef.current = 0;
    simTickRef.current = 0;

    setPath([]);
    setDistanceMeters(0);
    setCurrentSpeedMs(0);
    setMaxSpeedMs(0);
    setElapsedSec(0);
    setMovingSec(0);
    setSpeedSamples([]);
    setGpsError(null);
  }, []);

  const locateOnce = useCallback(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPermissionState('granted');
        setGpsError(null);
        setCurrentPoint({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          timestamp: pos.timestamp || Date.now(),
          speedMs: Math.max(0, pos.coords.speed ?? 0),
          accuracy: pos.coords.accuracy ?? 15,
          heading: pos.coords.heading ?? null,
          altitude: pos.coords.altitude ?? null,
        });
      },
      () => {
        // Silent best-effort centering
      },
      {enableHighAccuracy: true, timeout: 8000, maximumAge: 10000}
    );
  }, []);

  const startGps = useCallback(() => {
    stopStreams();
    resetInternalState();
    setSource('gps');
    setStatus('tracking');
    startedAtRef.current = Date.now();
    acquireWakeLock();
    startTimerLoop();
    startHardwareGpsWatch();
  }, [
    acquireWakeLock,
    resetInternalState,
    startHardwareGpsWatch,
    startTimerLoop,
    stopStreams,
  ]);

  const startSimulation = useCallback(() => {
    stopStreams();
    resetInternalState();
    setSource('simulated');
    setStatus('tracking');
    startedAtRef.current = Date.now();
    const anchor = currentPoint
      ? {lat: currentPoint.lat, lng: currentPoint.lng}
      : FALLBACK_ORIGIN;
    simPosRef.current = anchor;
    startTimerLoop();
    startSimulationLoop(anchor);
  }, [
    currentPoint,
    resetInternalState,
    startSimulationLoop,
    startTimerLoop,
    stopStreams,
  ]);

  const pause = useCallback(() => {
    if (status !== 'tracking') return;
    stopStreams();
    currentSpeedRef.current = 0;
    setCurrentSpeedMs(0);
    setStatus('paused');
  }, [status, stopStreams]);

  const resume = useCallback(() => {
    if (status !== 'paused') return;
    // Prevent connecting paused jump directly into inflated speed
    lastValidPointRef.current = currentPoint;
    setStatus('tracking');
    startTimerLoop();
    if (source === 'simulated') {
      startSimulationLoop(simPosRef.current);
    } else {
      acquireWakeLock();
      startHardwareGpsWatch();
    }
  }, [
    acquireWakeLock,
    currentPoint,
    source,
    startHardwareGpsWatch,
    startSimulationLoop,
    startTimerLoop,
    status,
  ]);

  const finishAndSave = useCallback(
    (customName?: string): TripSession | null => {
      stopStreams();
      const finalDistance = distanceRef.current;
      const finalDuration = elapsedRef.current;
      const finalMoving = movingRef.current;
      const finalMax = maxSpeedRef.current;
      const startedAt = startedAtRef.current || Date.now();
      const endedAt = Date.now();

      if (finalDuration < 2 && finalDistance < 1) {
        resetInternalState();
        setStatus('idle');
        return null;
      }

      const avgSpeedMs = finalDuration > 0 ? finalDistance / finalDuration : 0;
      const movingAvgSpeedMs =
        finalMoving > 0 ? finalDistance / finalMoving : avgSpeedMs;

      const defaultName =
        customName?.trim() ||
        (source === 'simulated'
          ? `Simulated Route · ${new Date(startedAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}`
          : `GPS Trip · ${new Date(startedAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}`);

      const session: TripSession = {
        id: `trip_${startedAt}_${Math.random().toString(36).slice(2, 7)}`,
        dateKey: getLocalDateKey(startedAt),
        name: defaultName,
        startedAt,
        endedAt,
        durationSec: finalDuration,
        movingDurationSec: finalMoving,
        distanceMeters: finalDistance,
        avgSpeedMs,
        movingAvgSpeedMs,
        maxSpeedMs: finalMax,
        source,
        path: [...pathRef.current],
        speedSamples: [...speedSamplesRef.current],
      };

      onTripSaved(session);
      resetInternalState();
      setStatus('idle');
      return session;
    },
    [onTripSaved, resetInternalState, source, stopStreams]
  );

  const discardTrip = useCallback(() => {
    stopStreams();
    resetInternalState();
    setStatus('idle');
  }, [resetInternalState, stopStreams]);

  useEffect(() => {
    return () => {
      stopStreams();
    };
  }, [stopStreams]);

  const avgSpeedMs = elapsedSec > 0 ? distanceMeters / elapsedSec : 0;
  const movingAvgSpeedMs =
    movingSec > 0 ? distanceMeters / movingSec : avgSpeedMs;

  const state: GpsTrackerState = {
    status,
    source,
    currentPoint,
    path,
    distanceMeters,
    currentSpeedMs,
    avgSpeedMs,
    movingAvgSpeedMs,
    maxSpeedMs,
    elapsedSec,
    movingSec,
    speedSamples,
    gpsError,
    permissionState,
    pointsRecorded: path.length,
  };

  return {
    state,
    startGps,
    startSimulation,
    pause,
    resume,
    finishAndSave,
    discardTrip,
    locateOnce,
  };
}
