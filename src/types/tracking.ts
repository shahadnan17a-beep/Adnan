export type UnitSystem = 'metric' | 'imperial';

export type TrackerStatus = 'idle' | 'tracking' | 'paused';

export type TrackingSource = 'gps' | 'simulated' | 'manual' | 'calculator';

export type AppView = 'live' | 'daily' | 'calculator';

export type MapStyleType = 'roadmap' | 'hybrid' | 'terrain';

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface GpsPoint extends LatLngPoint {
  timestamp: number;
  speedMs: number;
  accuracy: number;
  heading: number | null;
  altitude: number | null;
}

export interface SpeedSample {
  elapsedSec: number;
  speedMs: number;
  distanceMeters: number;
}

export interface TripSession {
  id: string;
  dateKey: string; // YYYY-MM-DD in local time
  name: string;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  movingDurationSec: number;
  distanceMeters: number;
  avgSpeedMs: number;
  movingAvgSpeedMs: number;
  maxSpeedMs: number;
  source: TrackingSource;
  path: LatLngPoint[];
  speedSamples: SpeedSample[];
}

export interface DailyAggregate {
  dateKey: string;
  label: string;
  shortLabel: string;
  tripCount: number;
  totalDistanceMeters: number;
  totalDurationSec: number;
  avgSpeedMs: number;
  maxSpeedMs: number;
  trips: TripSession[];
}

export interface AppPreferences {
  unit: UnitSystem;
  dailyGoalMeters: number;
  theme: 'light' | 'dark';
}
