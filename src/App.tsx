import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {APIProvider} from '@vis.gl/react-google-maps';
import {
  Activity,
  AlertCircle,
  CalendarDays,
  Calculator,
  Moon,
  Pause,
  Play,
  RotateCcw,
  Route,
  Square,
  Sun,
  Trash2,
} from 'lucide-react';
import type {
  AppPreferences,
  AppView,
  TripSession,
  UnitSystem,
} from './types/tracking';
import {
  distanceUnitLabel,
  formatDistance,
  formatDuration,
  formatPace,
  formatSpeed,
  formatTimeOfDay,
  getLocalDateKey,
  metersToUnit,
  speedUnitLabel,
} from './utils/geo';
import {
  loadPreferences,
  loadTrips,
  savePreferences,
  saveTrips,
} from './utils/storage';
import {useGpsTracker} from './hooks/useGpsTracker';
import {SpeedometerGauge} from './components/SpeedometerGauge';
import {SpeedChart} from './components/SpeedChart';
import {LiveRouteMap} from './components/LiveRouteMap';
import {DailyLogView} from './components/DailyLogView';
import {DistanceCalculatorView} from './components/DistanceCalculatorView';

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

export default function App() {
  const [activeView, setActiveView] = useState<AppView>('live');
  const [trips, setTrips] = useState<TripSession[]>(() => loadTrips());
  const [prefs, setPrefs] = useState<AppPreferences>(() => loadPreferences());
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  // Sync dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (prefs.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    savePreferences(prefs);
  }, [prefs]);

  // Persist trips whenever updated
  useEffect(() => {
    saveTrips(trips);
  }, [trips]);

  // Listen for Tier 1 Google Maps quota exceeded event
  useEffect(() => {
    const handler = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  const handleTripSaved = useCallback((session: TripSession) => {
    setTrips((prev) => [session, ...prev]);
  }, []);

  const handleDeleteTrip = useCallback((id: string) => {
    setTrips((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const {
    state: tracker,
    startGps,
    startSimulation,
    pause,
    resume,
    finishAndSave,
    discardTrip,
    locateOnce,
  } = useGpsTracker({onTripSaved: handleTripSaved});

  const todayKey = getLocalDateKey();
  const todaysTrips = useMemo(
    () => trips.filter((t) => t.dateKey === todayKey),
    [trips, todayKey]
  );

  const todaySummary = useMemo(() => {
    const savedDistance = todaysTrips.reduce(
      (sum, t) => sum + t.distanceMeters,
      0
    );
    const savedDuration = todaysTrips.reduce((sum, t) => sum + t.durationSec, 0);
    const savedMax = todaysTrips.reduce(
      (max, t) => Math.max(max, t.maxSpeedMs),
      0
    );

    const totalDistanceMeters = savedDistance + tracker.distanceMeters;
    const totalDurationSec = savedDuration + tracker.elapsedSec;
    const avgSpeedMs =
      totalDurationSec > 0 ? totalDistanceMeters / totalDurationSec : 0;
    const maxSpeedMs = Math.max(savedMax, tracker.maxSpeedMs);
    const goalProgressPct = Math.min(
      100,
      Math.round((totalDistanceMeters / prefs.dailyGoalMeters) * 100)
    );

    return {
      totalDistanceMeters,
      totalDurationSec,
      avgSpeedMs,
      maxSpeedMs,
      tripCount: todaysTrips.length + (tracker.status !== 'idle' ? 1 : 0),
      goalProgressPct,
    };
  }, [
    todaysTrips,
    tracker.distanceMeters,
    tracker.elapsedSec,
    tracker.maxSpeedMs,
    tracker.status,
    prefs.dailyGoalMeters,
  ]);

  const setUnit = (unit: UnitSystem) =>
    setPrefs((prev) => ({...prev, unit}));

  const toggleTheme = () =>
    setPrefs((prev) => ({
      ...prev,
      theme: prev.theme === 'dark' ? 'light' : 'dark',
    }));

  const updateDailyGoal = (dailyGoalMeters: number) =>
    setPrefs((prev) => ({...prev, dailyGoalMeters}));

  const isDark = prefs.theme === 'dark';
  const dUnit = distanceUnitLabel(prefs.unit);
  const sUnit = speedUnitLabel(prefs.unit);

  const handlePrimaryHeaderAction = () => {
    if (tracker.status === 'idle') {
      setActiveView('live');
      startGps();
    } else {
      finishAndSave();
    }
  };

  const content = (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Mandatory Demo Key Quota Banner (Section 8 Case A) */}
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveView('live')}
            className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
          >
            Odometra
          </button>

          {/* Zone 2: Concise single-line navigation links */}
          <nav
            aria-label="Primary"
            className="hidden md:flex items-center gap-7 text-sm font-medium"
          >
            {(
              [
                ['live', 'Live Tracker'],
                ['daily', 'Daily Log'],
                ['calculator', 'Calculator'],
              ] as const
            ).map(([view, label]) => (
              <button
                key={view}
                type="button"
                onClick={() => setActiveView(view)}
                className={`relative py-1 whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded ${
                  activeView === view
                    ? 'text-slate-900 dark:text-slate-50 font-semibold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {label}
                {activeView === view && (
                  <span className="absolute left-0 right-0 -bottom-[17px] h-0.5 bg-blue-600 dark:bg-blue-400" />
                )}
              </button>
            ))}
          </nav>

          {/* Zone 3: 1 Primary CTA Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handlePrimaryHeaderAction}
              className={`min-h-[38px] px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600 ${
                tracker.status === 'idle'
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
            >
              {tracker.status === 'idle' ? 'Start GPS' : 'Finish Trip'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 pt-5 pb-24 md:pb-10 space-y-6">
        {/* Workspace Utility Toolbar (below header, never cluttering Top Bar) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 tabular-nums">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              Today&apos;s Total
            </span>
            <span className="font-mono font-bold text-blue-700 dark:text-blue-400">
              {formatDistance(todaySummary.totalDistanceMeters, prefs.unit, 2)}{' '}
              {dUnit}
            </span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
              ·
            </span>
            <span>
              Avg{' '}
              <strong className="font-mono text-emerald-700 dark:text-emerald-400">
                {formatSpeed(todaySummary.avgSpeedMs, prefs.unit, 1)} {sUnit}
              </strong>
            </span>
            <span aria-hidden="true" className="hidden sm:inline text-slate-300 dark:text-slate-700">
              ·
            </span>
            <span className="hidden sm:inline text-slate-500 dark:text-slate-400">
              {todaySummary.goalProgressPct}% of{' '}
              {metersToUnit(prefs.dailyGoalMeters, prefs.unit).toFixed(1)}{' '}
              {dUnit} target
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Unit Segmented Control */}
            <div
              className="inline-flex items-center p-0.5 rounded-lg bg-slate-200/70 dark:bg-slate-800"
              role="group"
              aria-label="Measurement units"
            >
              <button
                type="button"
                onClick={() => setUnit('metric')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  prefs.unit === 'metric'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                km · km/h
              </button>
              <button
                type="button"
                onClick={() => setUnit('imperial')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  prefs.unit === 'imperial'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                mi · mph
              </button>
            </div>

            {/* Light / Dark Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              title={isDark ? 'Light mode' : 'Dark mode'}
            >
              {isDark ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* LIVE TRACKER VIEW */}
        {activeView === 'live' && (
          <div className="space-y-6">
            {/* GPS Permission / Error Notice */}
            {tracker.gpsError && (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 text-xs sm:text-sm"
              >
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>{tracker.gpsError}</span>
                </div>
                <button
                  type="button"
                  onClick={startSimulation}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-900 dark:bg-amber-400 text-white dark:text-slate-950 hover:opacity-90 whitespace-nowrap"
                >
                  Run GPS Simulation
                </button>
              </div>
            )}

            {/* Main 12-column Instrument + Live Map Split */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Left Column: Live Speedometer & Odometer Instrument */}
              <section className="lg:col-span-5 flex flex-col justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-6">
                {/* Instrument header metadata (unboxed clean text) */}
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {tracker.status === 'tracking'
                        ? tracker.source === 'simulated'
                          ? 'Simulated GPS Active'
                          : 'Live GPS Recording'
                        : tracker.status === 'paused'
                          ? 'Session Paused'
                          : 'GPS Odometer Ready'}
                    </span>
                  </div>
                  <span className="font-mono tabular-nums">
                    {formatDuration(tracker.elapsedSec)}
                  </span>
                </div>

                {/* Focal Anchor: Precision Speedometer Gauge */}
                <SpeedometerGauge
                  currentSpeedMs={tracker.currentSpeedMs}
                  avgSpeedMs={tracker.avgSpeedMs}
                  maxSpeedMs={tracker.maxSpeedMs}
                  unit={prefs.unit}
                  status={tracker.status}
                />

                {/* 3-Column Session Telemetry Strip (hairline dividers, zero nested cards) */}
                <div className="grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-800 border-y border-slate-200 dark:border-slate-800 py-4 text-center tabular-nums">
                  <div className="px-2">
                    <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      Trip Distance
                    </p>
                    <p className="mt-1 font-mono text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-50">
                      {formatDistance(tracker.distanceMeters, prefs.unit, 2)}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {dUnit}
                    </p>
                  </div>

                  <div className="px-2">
                    <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      Avg Speed
                    </p>
                    <p className="mt-1 font-mono text-xl sm:text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                      {formatSpeed(tracker.avgSpeedMs, prefs.unit, 1)}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Mov {formatSpeed(tracker.movingAvgSpeedMs, prefs.unit, 1)}{' '}
                      {sUnit}
                    </p>
                  </div>

                  <div className="px-2">
                    <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      Avg Pace
                    </p>
                    <p className="mt-1 font-mono text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-50">
                      {formatPace(tracker.avgSpeedMs, prefs.unit)}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      min/{dUnit}
                    </p>
                  </div>
                </div>

                {/* Primary Tactile Session Controls */}
                <div className="space-y-2.5">
                  {tracker.status === 'idle' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={startGps}
                        className="min-h-[48px] px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap active:scale-[0.99]"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        Start Live GPS
                      </button>
                      <button
                        type="button"
                        onClick={startSimulation}
                        className="min-h-[48px] px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap active:scale-[0.99]"
                      >
                        <Route className="w-4 h-4" />
                        Simulate GPS
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {tracker.status === 'tracking' ? (
                        <button
                          type="button"
                          onClick={pause}
                          className="min-h-[48px] px-3 py-3 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-sm font-semibold hover:bg-amber-100 dark:hover:bg-amber-950/60 transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                        >
                          <Pause className="w-4 h-4" />
                          Pause
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={resume}
                          className="min-h-[48px] px-3 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                        >
                          <Play className="w-4 h-4 fill-current" />
                          Resume
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => finishAndSave()}
                        className="min-h-[48px] px-3 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <Square className="w-3.5 h-3.5 fill-current" />
                        Save Trip
                      </button>

                      <button
                        type="button"
                        onClick={discardTrip}
                        className="min-h-[48px] px-3 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Reset
                      </button>
                    </div>
                  )}
                </div>

                {/* Daily Total Distance Progress Summary */}
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                  <div className="flex items-baseline justify-between text-xs tabular-nums">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      Daily Total Distance
                    </span>
                    <span className="font-mono text-sm font-bold text-slate-900 dark:text-slate-50">
                      {formatDistance(
                        todaySummary.totalDistanceMeters,
                        prefs.unit,
                        2
                      )}{' '}
                      <span className="text-xs font-normal text-slate-500">
                        / {metersToUnit(prefs.dailyGoalMeters, prefs.unit).toFixed(1)}{' '}
                        {dUnit}
                      </span>
                    </span>
                  </div>

                  <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-600 dark:bg-emerald-500 transition-all duration-300"
                      style={{width: `${todaySummary.goalProgressPct}%`}}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    <span>
                      Today Avg{' '}
                      <strong className="font-mono text-slate-800 dark:text-slate-200">
                        {formatSpeed(todaySummary.avgSpeedMs, prefs.unit, 1)}{' '}
                        {sUnit}
                      </strong>{' '}
                      · Peak{' '}
                      <strong className="font-mono text-slate-800 dark:text-slate-200">
                        {formatSpeed(todaySummary.maxSpeedMs, prefs.unit, 1)}
                      </strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveView('daily')}
                      className="text-blue-600 dark:text-blue-400 font-medium hover:underline whitespace-nowrap"
                    >
                      View Daily Log
                    </button>
                  </div>
                </div>
              </section>

              {/* Right Column: Live Interactive Google Map */}
              <div className="lg:col-span-7">
                <LiveRouteMap
                  currentPoint={tracker.currentPoint}
                  path={tracker.path}
                  isTracking={tracker.status === 'tracking'}
                  isDark={isDark}
                  quotaExceeded={quotaExceeded}
                  hasApiKey={Boolean(MAPS_API_KEY)}
                  onLocateOnce={locateOnce}
                />
              </div>
            </div>

            {/* Secondary Row: Live Speed Profile + Today's Trips */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
                  Live Speed &amp; Average Speed Profile
                </h2>
                <SpeedChart
                  samples={tracker.speedSamples}
                  avgSpeedMs={tracker.avgSpeedMs}
                  unit={prefs.unit}
                />
              </section>

              <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Today&apos;s Saved Trips
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveView('daily')}
                    className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                  >
                    Full History
                  </button>
                </div>

                {todaysTrips.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl px-4">
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                      No saved trips today yet
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Tap Save Trip after tracking to add a session to your daily distance total.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {todaysTrips.slice(0, 4).map((trip) => (
                      <div
                        key={trip.id}
                        className="py-2.5 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                            {trip.name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                            {formatTimeOfDay(trip.startedAt)} ·{' '}
                            {formatDuration(trip.durationSec)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right font-mono text-xs tabular-nums">
                            <p className="font-semibold text-slate-900 dark:text-slate-100">
                              {formatDistance(trip.distanceMeters, prefs.unit, 2)}{' '}
                              {dUnit}
                            </p>
                            <p className="text-emerald-700 dark:text-emerald-400">
                              Avg {formatSpeed(trip.avgSpeedMs, prefs.unit, 1)}{' '}
                              {sUnit}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteTrip(trip.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                            aria-label={`Delete ${trip.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {/* DAILY LOG VIEW */}
        {activeView === 'daily' && (
          <DailyLogView
            trips={trips}
            liveDistanceMeters={tracker.distanceMeters}
            liveDurationSec={tracker.elapsedSec}
            liveMaxSpeedMs={tracker.maxSpeedMs}
            dailyGoalMeters={prefs.dailyGoalMeters}
            unit={prefs.unit}
            isDark={isDark}
            quotaExceeded={quotaExceeded}
            hasApiKey={Boolean(MAPS_API_KEY)}
            onUpdateDailyGoal={updateDailyGoal}
            onAddManualTrip={handleTripSaved}
            onDeleteTrip={handleDeleteTrip}
            onStartLiveTracking={() => setActiveView('live')}
          />
        )}

        {/* DISTANCE CALCULATOR VIEW */}
        {activeView === 'calculator' && (
          <DistanceCalculatorView
            currentGpsPoint={
              tracker.currentPoint
                ? {
                    lat: tracker.currentPoint.lat,
                    lng: tracker.currentPoint.lng,
                  }
                : null
            }
            unit={prefs.unit}
            isDark={isDark}
            quotaExceeded={quotaExceeded}
            hasApiKey={Boolean(MAPS_API_KEY)}
            onSaveCalculatedTrip={handleTripSaved}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (56px height; total sticky <= 15% of mobile viewport) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-3"
      >
        {(
          [
            ['live', 'Live GPS', Activity],
            ['daily', 'Daily Log', CalendarDays],
            ['calculator', 'Calculator', Calculator],
          ] as const
        ).map(([view, label, Icon]) => {
          const active = activeView === view;
          return (
            <button
              key={view}
              type="button"
              onClick={() => setActiveView(view)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                active
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );

  if (!MAPS_API_KEY) {
    return content;
  }

  return (
    <APIProvider
      apiKey={MAPS_API_KEY}
      libraries={['marker']}
      language="en"
      region="US"
    >
      {content}
    </APIProvider>
  );
}
