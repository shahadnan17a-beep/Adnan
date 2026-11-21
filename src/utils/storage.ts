import type {
  AppPreferences,
  DailyAggregate,
  TripSession,
} from '../types/tracking';
import {formatDateKeyLabel, getLocalDateKey} from './geo';

const TRIPS_STORAGE_KEY = 'odometra.trips.v1';
const PREFS_STORAGE_KEY = 'odometra.prefs.v1';

export const DEFAULT_PREFERENCES: AppPreferences = {
  unit: 'metric',
  dailyGoalMeters: 10000, // 10 km default daily distance target
  theme: 'light',
};

export function loadTrips(): TripSession[] {
  try {
    const raw = localStorage.getItem(TRIPS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as TripSession[];
  } catch {
    return [];
  }
}

export function saveTrips(trips: TripSession[]): void {
  try {
    localStorage.setItem(TRIPS_STORAGE_KEY, JSON.stringify(trips));
  } catch {
    // Handle storage quota gracefully by trimming old detailed paths if needed
    try {
      const compact = trips.slice(0, 150).map((t, idx) =>
        idx > 30
          ? {
              ...t,
              path: t.path.filter((_, i) => i % 4 === 0),
              speedSamples: t.speedSamples.filter((_, i) => i % 3 === 0),
            }
          : t
      );
      localStorage.setItem(TRIPS_STORAGE_KEY, JSON.stringify(compact));
    } catch {
      // Ignore unrecoverable storage failure
    }
  }
}

export function loadPreferences(): AppPreferences {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return {
      unit: parsed.unit === 'imperial' ? 'imperial' : 'metric',
      dailyGoalMeters:
        typeof parsed.dailyGoalMeters === 'number' &&
        parsed.dailyGoalMeters >= 500
          ? parsed.dailyGoalMeters
          : DEFAULT_PREFERENCES.dailyGoalMeters,
      theme: parsed.theme === 'dark' ? 'dark' : 'light',
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(prefs: AppPreferences): void {
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage write errors
  }
}

/**
 * Aggregates trips by local YYYY-MM-DD date key, computing daily total distance,
 * weighted daily average speed (total distance / total active duration), and peak speed.
 */
export function buildDailyAggregates(trips: TripSession[]): DailyAggregate[] {
  const byDate: Record<string, TripSession[]> = {};

  for (const trip of trips) {
    const key = trip.dateKey || getLocalDateKey(trip.startedAt);
    if (!byDate[key]) {
      byDate[key] = [];
    }
    byDate[key].push(trip);
  }

  const keys = Object.keys(byDate).sort((a, b) => (a < b ? 1 : -1));

  return keys.map((dateKey) => {
    const dayTrips = byDate[dateKey].sort((a, b) => b.startedAt - a.startedAt);
    const totalDistanceMeters = dayTrips.reduce(
      (sum, t) => sum + t.distanceMeters,
      0
    );
    const totalDurationSec = dayTrips.reduce((sum, t) => sum + t.durationSec, 0);
    const maxSpeedMs = dayTrips.reduce(
      (max, t) => Math.max(max, t.maxSpeedMs),
      0
    );

    const avgSpeedMs =
      totalDurationSec > 0 ? totalDistanceMeters / totalDurationSec : 0;

    const [y, m, d] = dateKey.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const shortLabel = dt.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });

    return {
      dateKey,
      label: formatDateKeyLabel(dateKey),
      shortLabel,
      tripCount: dayTrips.length,
      totalDistanceMeters,
      totalDurationSec,
      avgSpeedMs,
      maxSpeedMs,
      trips: dayTrips,
    };
  });
}

/**
 * Builds a contiguous series of the last N days for daily distance bar charts,
 * ensuring days with 0 distance are still visible on the timeline.
 */
export function buildRecentDaysSeries(
  trips: TripSession[],
  days: number,
  liveDistanceMeters = 0,
  liveDurationSec = 0,
  liveMaxSpeedMs = 0
): DailyAggregate[] {
  const todayKey = getLocalDateKey();
  const byDate: Record<string, TripSession[]> = {};

  for (const trip of trips) {
    const key = trip.dateKey || getLocalDateKey(trip.startedAt);
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(trip);
  }

  const result: DailyAggregate[] = [];
  const now = new Date();

  for (let offset = days - 1; offset >= 0; offset--) {
    const d = new Date(now);
    d.setDate(now.getDate() - offset);
    const key = getLocalDateKey(d.getTime());
    const dayTrips = byDate[key] || [];

    const savedDist = dayTrips.reduce((s, t) => s + t.distanceMeters, 0);
    const savedDur = dayTrips.reduce((s, t) => s + t.durationSec, 0);
    const savedMax = dayTrips.reduce((m, t) => Math.max(m, t.maxSpeedMs), 0);

    const isToday = key === todayKey;
    const totalDistanceMeters = savedDist + (isToday ? liveDistanceMeters : 0);
    const totalDurationSec = savedDur + (isToday ? liveDurationSec : 0);
    const maxSpeedMs = Math.max(savedMax, isToday ? liveMaxSpeedMs : 0);
    const avgSpeedMs =
      totalDurationSec > 0 ? totalDistanceMeters / totalDurationSec : 0;

    result.push({
      dateKey: key,
      label: formatDateKeyLabel(key),
      shortLabel: d.toLocaleDateString(undefined, {
        weekday: days <= 7 ? 'short' : undefined,
        month: days > 7 ? 'short' : undefined,
        day: 'numeric',
      }),
      tripCount: dayTrips.length + (isToday && liveDistanceMeters > 0 ? 1 : 0),
      totalDistanceMeters,
      totalDurationSec,
      avgSpeedMs,
      maxSpeedMs,
      trips: dayTrips,
    });
  }

  return result;
}
