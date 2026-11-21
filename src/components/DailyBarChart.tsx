import React from 'react';
import type {DailyAggregate, UnitSystem} from '../types/tracking';
import {
  distanceUnitLabel,
  formatDistance,
  formatSpeed,
  metersToUnit,
  speedUnitLabel,
} from '../utils/geo';

interface DailyBarChartProps {
  days: DailyAggregate[];
  dailyGoalMeters: number;
  unit: UnitSystem;
  selectedDateKey: string | null;
  onSelectDate: (dateKey: string | null) => void;
}

export const DailyBarChart: React.FC<DailyBarChartProps> = ({
  days,
  dailyGoalMeters,
  unit,
  selectedDateKey,
  onSelectDate,
}) => {
  const maxMeters = Math.max(
    dailyGoalMeters * 1.15,
    ...days.map((d) => d.totalDistanceMeters),
    1000
  );

  const goalPct = Math.min(100, (dailyGoalMeters / maxMeters) * 100);
  const activeDay =
    days.find((d) => d.dateKey === selectedDateKey) || days[days.length - 1];

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-800 dark:text-slate-200">
            {activeDay ? activeDay.label : 'Overview'}
          </span>
          {activeDay && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-slate-900 dark:text-slate-100 font-semibold">
                {formatDistance(activeDay.totalDistanceMeters, unit, 2)}{' '}
                {distanceUnitLabel(unit)}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Avg {formatSpeed(activeDay.avgSpeedMs, unit, 1)}{' '}
                {speedUnitLabel(unit)}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span>
            Daily Target: {metersToUnit(dailyGoalMeters, unit).toFixed(1)}{' '}
            {distanceUnitLabel(unit)}
          </span>
          {selectedDateKey && (
            <button
              type="button"
              onClick={() => onSelectDate(null)}
              className="text-blue-600 dark:text-blue-400 hover:underline font-medium whitespace-nowrap"
            >
              Show All Days
            </button>
          )}
        </div>
      </div>

      {/* Bar chart frame */}
      <div className="relative h-48 pt-4 pb-7 flex items-end gap-1.5 sm:gap-2">
        {/* Daily Target dashed horizontal rule */}
        <div
          className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-emerald-500/70 dark:border-emerald-400/60"
          style={{bottom: `calc(28px + ${goalPct * 0.78}%)`}}
        />

        {days.map((day, idx) => {
          const heightPct = Math.max(
            day.totalDistanceMeters > 0 ? 4 : 1.5,
            (day.totalDistanceMeters / maxMeters) * 100
          );
          const isSelected = selectedDateKey === day.dateKey;
          const reachedGoal = day.totalDistanceMeters >= dailyGoalMeters;
          const showLabel =
            days.length <= 7 ||
            idx === 0 ||
            idx === days.length - 1 ||
            idx % Math.ceil(days.length / 6) === 0;

          return (
            <button
              key={day.dateKey}
              type="button"
              onClick={() =>
                onSelectDate(isSelected ? null : day.dateKey)
              }
              title={`${day.label}: ${formatDistance(day.totalDistanceMeters, unit, 2)} ${distanceUnitLabel(unit)}`}
              className="group relative flex-1 h-full flex flex-col justify-end items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-md"
            >
              <div className="w-full flex-1 flex items-end justify-center px-0.5">
                <div
                  style={{height: `${heightPct}%`}}
                  className={`w-full max-w-[34px] rounded-t-md transition-all duration-150 ${
                    isSelected
                      ? 'bg-blue-600 dark:bg-blue-500 ring-2 ring-blue-600/30 dark:ring-blue-400/30'
                      : day.totalDistanceMeters === 0
                        ? 'bg-slate-200 dark:bg-slate-800'
                        : reachedGoal
                          ? 'bg-emerald-600 dark:bg-emerald-500 group-hover:bg-emerald-700'
                          : 'bg-blue-500/80 dark:bg-blue-500/75 group-hover:bg-blue-600'
                  }`}
                />
              </div>
              <span
                className={`mt-2 text-[10px] sm:text-[11px] font-mono leading-none whitespace-nowrap ${
                  isSelected
                    ? 'text-blue-700 dark:text-blue-400 font-semibold'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {showLabel ? day.shortLabel : ''}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
