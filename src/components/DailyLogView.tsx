import React, {useMemo, useState} from 'react';
import {
  AdvancedMarker,
  ColorScheme,
  Map as GoogleMap,
  Pin,
  Polyline,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Download,
  MapPin,
  Plus,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import type {TripSession, UnitSystem} from '../types/tracking';
import {
  distanceUnitLabel,
  exportTripsToCsv,
  formatDistance,
  formatDuration,
  formatDurationShort,
  formatPace,
  formatSpeed,
  formatTimeOfDay,
  getLocalDateKey,
  metersToUnit,
  speedUnitLabel,
  unitToMeters,
} from '../utils/geo';
import {buildDailyAggregates, buildRecentDaysSeries} from '../utils/storage';
import {DailyBarChart} from './DailyBarChart';
import {SpeedChart} from './SpeedChart';

interface DailyLogViewProps {
  trips: TripSession[];
  liveDistanceMeters: number;
  liveDurationSec: number;
  liveMaxSpeedMs: number;
  dailyGoalMeters: number;
  unit: UnitSystem;
  isDark: boolean;
  quotaExceeded: boolean;
  hasApiKey: boolean;
  onUpdateDailyGoal: (meters: number) => void;
  onAddManualTrip: (trip: TripSession) => void;
  onDeleteTrip: (id: string) => void;
  onStartLiveTracking: () => void;
}

const FitTripBounds: React.FC<{path: Array<{lat: number; lng: number}>}> = ({
  path,
}) => {
  const map = useMap();
  const coreLib = useMapsLibrary('core');
  React.useEffect(() => {
    if (!map || path.length === 0) return;
    if (path.length === 1) {
      map.setCenter(path[0]);
      map.setZoom(15);
      return;
    }
    if (!coreLib) return;
    const bounds = new coreLib.LatLngBounds();
    path.forEach((pt) => bounds.extend(pt));
    map.fitBounds(bounds, 40);
  }, [map, coreLib, path]);
  return null;
};

export const DailyLogView: React.FC<DailyLogViewProps> = ({
  trips,
  liveDistanceMeters,
  liveDurationSec,
  liveMaxSpeedMs,
  dailyGoalMeters,
  unit,
  isDark,
  quotaExceeded,
  hasApiKey,
  onUpdateDailyGoal,
  onAddManualTrip,
  onDeleteTrip,
  onStartLiveTracking,
}) => {
  const [rangeDays, setRangeDays] = useState<7 | 14 | 30>(7);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState(
    metersToUnit(dailyGoalMeters, unit).toFixed(1)
  );

  // Manual trip modal state
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualDate, setManualDate] = useState(getLocalDateKey());
  const [manualDistance, setManualDistance] = useState('5.0');
  const [manualMinutes, setManualMinutes] = useState('15');
  const [manualMaxSpeed, setManualMaxSpeed] = useState('');

  const series = useMemo(
    () =>
      buildRecentDaysSeries(
        trips,
        rangeDays,
        liveDistanceMeters,
        liveDurationSec,
        liveMaxSpeedMs
      ),
    [trips, rangeDays, liveDistanceMeters, liveDurationSec, liveMaxSpeedMs]
  );

  const periodStats = useMemo(() => {
    const totalDistance = series.reduce((s, d) => s + d.totalDistanceMeters, 0);
    const totalDuration = series.reduce((s, d) => s + d.totalDurationSec, 0);
    const activeDays = series.filter((d) => d.totalDistanceMeters > 0).length;
    const maxSpeed = series.reduce((m, d) => Math.max(m, d.maxSpeedMs), 0);
    const avgSpeed = totalDuration > 0 ? totalDistance / totalDuration : 0;
    const dailyAvg = totalDistance / Math.max(1, rangeDays);
    return {
      totalDistance,
      totalDuration,
      activeDays,
      maxSpeed,
      avgSpeed,
      dailyAvg,
    };
  }, [series, rangeDays]);

  const dailyGroups = useMemo(() => {
    const all = buildDailyAggregates(trips);
    if (!selectedDateKey) return all;
    return all.filter((g) => g.dateKey === selectedDateKey);
  }, [trips, selectedDateKey]);

  const handleSaveGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(goalInput);
    if (Number.isFinite(num) && num >= 0.5 && num <= 2000) {
      onUpdateDailyGoal(unitToMeters(num, unit));
      setEditingGoal(false);
    }
  };

  const handleCreateManualTrip = (e: React.FormEvent) => {
    e.preventDefault();
    const distVal = parseFloat(manualDistance);
    const minsVal = parseFloat(manualMinutes);
    if (!Number.isFinite(distVal) || distVal <= 0) return;
    if (!Number.isFinite(minsVal) || minsVal <= 0) return;

    const distMeters = unitToMeters(distVal, unit);
    const durationSec = Math.round(minsVal * 60);
    const avgSpeedMs = distMeters / durationSec;

    const maxSpeedInput = parseFloat(manualMaxSpeed);
    const maxSpeedMs =
      Number.isFinite(maxSpeedInput) && maxSpeedInput > 0
        ? unit === 'metric'
          ? maxSpeedInput / 3.6
          : maxSpeedInput / 2.23693629
        : avgSpeedMs * 1.2;

    const [y, m, d] = manualDate.split('-').map(Number);
    const now = new Date();
    const startDt = new Date(
      y,
      m - 1,
      d,
      now.getHours(),
      now.getMinutes(),
      0,
      0
    );
    const startedAt = startDt.getTime();

    const newTrip: TripSession = {
      id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      dateKey: manualDate,
      name: manualName.trim() || 'Manual Distance Entry',
      startedAt,
      endedAt: startedAt + durationSec * 1000,
      durationSec,
      movingDurationSec: durationSec,
      distanceMeters: distMeters,
      avgSpeedMs,
      movingAvgSpeedMs: avgSpeedMs,
      maxSpeedMs: Math.max(avgSpeedMs, maxSpeedMs),
      source: 'manual',
      path: [],
      speedSamples: [],
    };

    onAddManualTrip(newTrip);
    setShowManualForm(false);
    setManualName('');
    setManualMaxSpeed('');
  };

  const dUnit = distanceUnitLabel(unit);
  const sUnit = speedUnitLabel(unit);

  return (
    <div className="space-y-6">
      {/* Header strip & actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Daily Distance Log
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Daily total distance, weighted average speed, and recorded GPS trip history.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setGoalInput(metersToUnit(dailyGoalMeters, unit).toFixed(1));
              setEditingGoal((v) => !v);
            }}
            className="min-h-[40px] px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Target className="w-3.5 h-3.5" />
            Daily Target
          </button>

          <button
            type="button"
            onClick={() => setShowManualForm((v) => !v)}
            className="min-h-[40px] px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Log Manual Trip
          </button>

          <button
            type="button"
            disabled={trips.length === 0}
            onClick={() => exportTripsToCsv(trips, unit)}
            className="min-h-[40px] px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Download CSV
          </button>
        </div>
      </div>

      {/* Inline Daily Goal Editor */}
      {editingGoal && (
        <form
          onSubmit={handleSaveGoal}
          className="flex flex-wrap items-end gap-3 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl"
        >
          <div>
            <label
              htmlFor="daily-goal-input"
              className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1"
            >
              Daily Distance Target ({dUnit})
            </label>
            <input
              id="daily-goal-input"
              type="number"
              step="0.5"
              min="0.5"
              max="2000"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              className="w-36 h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <button
            type="submit"
            className="h-10 px-4 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Save Target
          </button>
          <button
            type="button"
            onClick={() => setEditingGoal(false)}
            className="h-10 px-3 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
        </form>
      )}

      {/* Inline Manual Trip Entry Form */}
      {showManualForm && (
        <form
          onSubmit={handleCreateManualTrip}
          className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Add Manual Distance Entry
            </h2>
            <button
              type="button"
              onClick={() => setShowManualForm(false)}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close manual entry form"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Trip Name
              </label>
              <input
                type="text"
                placeholder="Morning Commute"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Date
              </label>
              <input
                type="date"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Distance ({dUnit})
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={manualDistance}
                onChange={(e) => setManualDistance(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Duration (minutes)
              </label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                value={manualMinutes}
                onChange={(e) => setManualMinutes(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Peak Speed ({sUnit}, opt.)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                placeholder="Auto"
                value={manualMaxSpeed}
                onChange={(e) => setManualMaxSpeed(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowManualForm(false)}
              className="h-10 px-4 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-10 px-4 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              Save to Daily Log
            </button>
          </div>
        </form>
      )}

      {/* 4-column Period Summary KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {rangeDays}-Day Total Distance
          </p>
          <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 dark:text-slate-50 tabular-nums">
            {formatDistance(periodStats.totalDistance, unit, 2)}{' '}
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {dUnit}
            </span>
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {periodStats.activeDays} active {periodStats.activeDays === 1 ? 'day' : 'days'}
          </p>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Daily Avg Distance
          </p>
          <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 dark:text-slate-50 tabular-nums">
            {formatDistance(periodStats.dailyAvg, unit, 2)}{' '}
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {dUnit}/day
            </span>
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Target {metersToUnit(dailyGoalMeters, unit).toFixed(1)} {dUnit}
          </p>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Overall Avg Speed
          </p>
          <p className="mt-1.5 font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
            {formatSpeed(periodStats.avgSpeed, unit, 1)}{' '}
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {sUnit}
            </span>
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Pace {formatPace(periodStats.avgSpeed, unit)} /{dUnit}
          </p>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Peak Speed
          </p>
          <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 dark:text-slate-50 tabular-nums">
            {formatSpeed(periodStats.maxSpeed, unit, 1)}{' '}
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {sUnit}
            </span>
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Active time {formatDurationShort(periodStats.totalDuration)}
          </p>
        </div>
      </div>

      {/* Interactive Daily Totals Bar Chart */}
      <section className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Daily Total Distance
          </h2>
          <div
            className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800"
            role="group"
            aria-label="Date range"
          >
            {([7, 14, 30] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => {
                  setRangeDays(days);
                  setSelectedDateKey(null);
                }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  rangeDays === days
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {days} Days
              </button>
            ))}
          </div>
        </div>

        <DailyBarChart
          days={series}
          dailyGoalMeters={dailyGoalMeters}
          unit={unit}
          selectedDateKey={selectedDateKey}
          onSelectDate={setSelectedDateKey}
        />
      </section>

      {/* Grouped Daily Breakdown & Individual Trips */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 text-sm">
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">
              {selectedDateKey
                ? `Trips on ${selectedDateKey}`
                : 'Daily Breakdown'}
            </h2>
            <span aria-hidden="true" className="text-slate-400">
              ·
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {trips.length} total {trips.length === 1 ? 'trip' : 'trips'}
            </span>
          </div>
          {selectedDateKey && (
            <button
              type="button"
              onClick={() => setSelectedDateKey(null)}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              Clear Filter
            </button>
          )}
        </div>

        {dailyGroups.length === 0 ? (
          <div className="p-10 text-center">
            <Calendar className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {selectedDateKey
                ? 'No saved trips on this date'
                : 'No recorded trips yet'}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Start a live GPS session or run a route simulation to automatically aggregate daily total distance, average speed, and route maps.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={onStartLiveTracking}
                className="min-h-[40px] px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                Open Live Tracker
              </button>
              <button
                type="button"
                onClick={() => setShowManualForm(true)}
                className="min-h-[40px] px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Log Manual Trip
              </button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {dailyGroups.map((group) => {
              const goalPct = Math.min(
                100,
                Math.round((group.totalDistanceMeters / dailyGoalMeters) * 100)
              );

              return (
                <div key={group.dateKey} className="p-5 space-y-4">
                  {/* Day summary row */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                          {group.label}
                        </h3>
                        <span className="text-xs font-mono text-slate-400 dark:text-slate-500">
                          {group.dateKey}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        <span>
                          {group.tripCount}{' '}
                          {group.tripCount === 1 ? 'session' : 'sessions'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          Active {formatDurationShort(group.totalDurationSec)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{goalPct}% of daily target</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 text-right tabular-nums">
                      <div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Daily Total
                        </p>
                        <p className="font-mono text-lg font-bold text-slate-900 dark:text-slate-50">
                          {formatDistance(group.totalDistanceMeters, unit, 2)}{' '}
                          <span className="text-xs font-medium text-slate-500">
                            {dUnit}
                          </span>
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Daily Avg
                        </p>
                        <p className="font-mono text-lg font-semibold text-emerald-700 dark:text-emerald-400">
                          {formatSpeed(group.avgSpeedMs, unit, 1)}{' '}
                          <span className="text-xs font-medium text-slate-500">
                            {sUnit}
                          </span>
                        </p>
                      </div>
                      <div className="hidden sm:block">
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Peak
                        </p>
                        <p className="font-mono text-lg font-semibold text-slate-700 dark:text-slate-300">
                          {formatSpeed(group.maxSpeedMs, unit, 1)}{' '}
                          <span className="text-xs font-medium text-slate-500">
                            {sUnit}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Individual trips within this day */}
                  <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3 space-y-2">
                    {group.trips.map((trip) => {
                      const isExpanded = expandedTripId === trip.id;
                      const hasMapRoute = trip.path && trip.path.length >= 2;
                      return (
                        <div
                          key={trip.id}
                          className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 overflow-hidden"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedTripId(isExpanded ? null : trip.id)
                              }
                              className="flex-1 min-w-[200px] text-left flex items-center gap-3 focus-visible:outline-none"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                                  {trip.name}
                                </p>
                                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                                  <span>{formatTimeOfDay(trip.startedAt)}</span>
                                  <span aria-hidden="true">·</span>
                                  <span>{formatDuration(trip.durationSec)}</span>
                                  <span aria-hidden="true">·</span>
                                  <span className="capitalize">{trip.source}</span>
                                </div>
                              </div>
                            </button>

                            <div className="flex items-center gap-5 text-right font-mono text-xs tabular-nums">
                              <div>
                                <div className="text-slate-900 dark:text-slate-100 font-semibold text-sm">
                                  {formatDistance(trip.distanceMeters, unit, 2)}{' '}
                                  {dUnit}
                                </div>
                                <div className="text-slate-500 dark:text-slate-400">
                                  Avg {formatSpeed(trip.avgSpeedMs, unit, 1)}{' '}
                                  {sUnit}
                                </div>
                              </div>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedTripId(isExpanded ? null : trip.id)
                                  }
                                  className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
                                  aria-label={
                                    isExpanded ? 'Collapse trip details' : 'Expand trip details'
                                  }
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="w-4 h-4" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onDeleteTrip(trip.id)}
                                  className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                                  aria-label={`Delete ${trip.name}`}
                                  title="Delete trip"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Expanded detail: Route map + Speed curve */}
                          {isExpanded && (
                            <div className="px-4 pb-4 pt-2 border-t border-slate-200/80 dark:border-slate-800 space-y-4">
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs tabular-nums">
                                <div>
                                  <span className="text-slate-500 dark:text-slate-400">
                                    Moving Avg Speed
                                  </span>
                                  <p className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100">
                                    {formatSpeed(trip.movingAvgSpeedMs, unit, 1)}{' '}
                                    {sUnit}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-slate-500 dark:text-slate-400">
                                    Peak Speed
                                  </span>
                                  <p className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100">
                                    {formatSpeed(trip.maxSpeedMs, unit, 1)}{' '}
                                    {sUnit}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-slate-500 dark:text-slate-400">
                                    Avg Pace
                                  </span>
                                  <p className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100">
                                    {formatPace(trip.avgSpeedMs, unit)} /{dUnit}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-slate-500 dark:text-slate-400">
                                    Moving Time
                                  </span>
                                  <p className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100">
                                    {formatDuration(trip.movingDurationSec)}
                                  </p>
                                </div>
                              </div>

                              {hasMapRoute && hasApiKey && !quotaExceeded && (
                                <div className="h-[240px] w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
                                  <GoogleMap
                                    mapId="DEMO_MAP_ID"
                                    defaultCenter={trip.path[0]}
                                    defaultZoom={14}
                                    colorScheme={
                                      isDark
                                        ? ColorScheme.DARK
                                        : ColorScheme.LIGHT
                                    }
                                    gestureHandling="cooperative"
                                    disableDefaultUI
                                    zoomControl
                                    internalUsageAttributionIds={[
                                      'gmp_mcp_codeassist_v1_aistudio',
                                    ]}
                                    style={{width: '100%', height: '100%'}}
                                  >
                                    <FitTripBounds path={trip.path} />
                                    <Polyline
                                      path={trip.path}
                                      strokeColor="#2563EB"
                                      strokeOpacity={0.95}
                                      strokeWeight={4}
                                      geodesic
                                    />
                                    <AdvancedMarker
                                      position={trip.path[0]}
                                      title="Start"
                                    >
                                      <Pin
                                        background="#059669"
                                        borderColor="#065F46"
                                        glyphColor="#FFFFFF"
                                        scale={0.8}
                                      />
                                    </AdvancedMarker>
                                    <AdvancedMarker
                                      position={trip.path[trip.path.length - 1]}
                                      title="Finish"
                                    >
                                      <Pin
                                        background="#DC2626"
                                        borderColor="#991B1B"
                                        glyphColor="#FFFFFF"
                                        scale={0.8}
                                      />
                                    </AdvancedMarker>
                                  </GoogleMap>
                                </div>
                              )}

                              {!hasMapRoute && (
                                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                  <MapPin className="w-3.5 h-3.5" />
                                  <span>
                                    No GPS route coordinates stored for this entry.
                                  </span>
                                </div>
                              )}

                              {trip.speedSamples &&
                                trip.speedSamples.length >= 2 && (
                                  <SpeedChart
                                    samples={trip.speedSamples}
                                    avgSpeedMs={trip.avgSpeedMs}
                                    unit={unit}
                                  />
                                )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
