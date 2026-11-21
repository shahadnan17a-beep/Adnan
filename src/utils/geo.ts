import type {LatLngPoint, TripSession, UnitSystem} from '../types/tracking';

const EARTH_RADIUS_METERS = 6371008.8;
const METERS_PER_KM = 1000;
const METERS_PER_MILE = 1609.344;

export function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Computes exact geodesic surface distance between two WGS-84 coordinates in meters
 * using the Haversine formula.
 */
export function haversineDistanceMeters(a: LatLngPoint, b: LatLngPoint): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);

  const h =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Computes total path distance in meters across an ordered list of coordinates.
 */
export function computePathDistanceMeters(points: LatLngPoint[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineDistanceMeters(points[i - 1], points[i]);
  }
  return total;
}

/**
 * Computes forward azimuth (compass heading 0..360°) from point A to point B.
 */
export function computeBearingDegrees(a: LatLngPoint, b: LatLngPoint): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLng = toRadians(b.lng - a.lng);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

export function metersToUnit(meters: number, unit: UnitSystem): number {
  return unit === 'metric'
    ? meters / METERS_PER_KM
    : meters / METERS_PER_MILE;
}

export function unitToMeters(value: number, unit: UnitSystem): number {
  return unit === 'metric'
    ? value * METERS_PER_KM
    : value * METERS_PER_MILE;
}

export function speedMsToUnit(speedMs: number, unit: UnitSystem): number {
  if (!Number.isFinite(speedMs) || speedMs < 0) return 0;
  return unit === 'metric' ? speedMs * 3.6 : speedMs * 2.23693629;
}

export function unitSpeedToMs(speedValue: number, unit: UnitSystem): number {
  if (!Number.isFinite(speedValue) || speedValue < 0) return 0;
  return unit === 'metric' ? speedValue / 3.6 : speedValue / 2.23693629;
}

export function distanceUnitLabel(unit: UnitSystem): string {
  return unit === 'metric' ? 'km' : 'mi';
}

export function speedUnitLabel(unit: UnitSystem): string {
  return unit === 'metric' ? 'km/h' : 'mph';
}

export function formatDistance(
  meters: number,
  unit: UnitSystem,
  decimals = 2
): string {
  const val = metersToUnit(Math.max(0, meters), unit);
  return val.toFixed(decimals);
}

export function formatSpeed(
  speedMs: number,
  unit: UnitSystem,
  decimals = 1
): string {
  const val = speedMsToUnit(Math.max(0, speedMs), unit);
  return val.toFixed(decimals);
}

export function formatPace(speedMs: number, unit: UnitSystem): string {
  const speedPerHour = speedMsToUnit(speedMs, unit);
  if (speedPerHour < 0.5) return '--:--';
  const minutesPerUnit = 60 / speedPerHour;
  if (minutesPerUnit > 99) return '--:--';
  const mins = Math.floor(minutesPerUnit);
  const secs = Math.round((minutesPerUnit - mins) * 60);
  const adjustedMins = secs === 60 ? mins + 1 : mins;
  const adjustedSecs = secs === 60 ? 0 : secs;
  return `${adjustedMins}:${String(adjustedSecs).padStart(2, '0')}`;
}

export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatDurationShort(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export function getLocalDateKey(timestamp = Date.now()): string {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateKeyLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const todayKey = getLocalDateKey();
  if (dateKey === todayKey) return 'Today';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateKey === getLocalDateKey(yesterday.getTime())) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatTimeOfDay(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatCoords(point: LatLngPoint | null): string {
  if (!point) return '—';
  const latDir = point.lat >= 0 ? 'N' : 'S';
  const lngDir = point.lng >= 0 ? 'E' : 'W';
  return `${Math.abs(point.lat).toFixed(5)}° ${latDir}, ${Math.abs(point.lng).toFixed(5)}° ${lngDir}`;
}

/**
 * Generates a realistic closed-loop GPS route around a center point so users
 * testing indoors can verify live distance, speed, average speed, and map tracking.
 */
export function buildSimulationWaypoints(origin: LatLngPoint): LatLngPoint[] {
  // Smooth figure-circuit offsets in degrees (~2.8 km loop)
  const offsets: Array<[number, number]> = [
    [0, 0],
    [0.0018, 0.0012],
    [0.0036, 0.0029],
    [0.0052, 0.0042],
    [0.0068, 0.0035],
    [0.0079, 0.0016],
    [0.0075, -0.0009],
    [0.0061, -0.0031],
    [0.0042, -0.0044],
    [0.0021, -0.0038],
    [0.0008, -0.0021],
    [0, 0],
  ];

  return offsets.map(([dLat, dLng]) => ({
    lat: origin.lat + dLat,
    lng: origin.lng + dLng,
  }));
}

/**
 * Moves a coordinate forward along a heading by distanceMeters.
 */
export function moveCoordinate(
  origin: LatLngPoint,
  bearingDeg: number,
  distanceMeters: number
): LatLngPoint {
  const angularDistance = distanceMeters / EARTH_RADIUS_METERS;
  const bearing = toRadians(bearingDeg);
  const lat1 = toRadians(origin.lat);
  const lng1 = toRadians(origin.lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    lat: toDegrees(lat2),
    lng: toDegrees(lng2),
  };
}

export function exportTripsToCsv(
  trips: TripSession[],
  unit: UnitSystem
): void {
  const dUnit = distanceUnitLabel(unit);
  const sUnit = speedUnitLabel(unit);
  const headers = [
    'Date',
    'Trip Name',
    'Start Time',
    'Duration (sec)',
    `Distance (${dUnit})`,
    `Avg Speed (${sUnit})`,
    `Moving Avg Speed (${sUnit})`,
    `Max Speed (${sUnit})`,
    'Source',
  ];

  const rows = trips.map((t) => [
    t.dateKey,
    `"${t.name.replace(/"/g, '""')}"`,
    new Date(t.startedAt).toISOString(),
    String(Math.round(t.durationSec)),
    formatDistance(t.distanceMeters, unit, 3),
    formatSpeed(t.avgSpeedMs, unit, 2),
    formatSpeed(t.movingAvgSpeedMs, unit, 2),
    formatSpeed(t.maxSpeedMs, unit, 2),
    t.source,
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join(
    '\n'
  );
  const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `odometra-gps-log-${getLocalDateKey()}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
