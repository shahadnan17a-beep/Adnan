import React from 'react';
import type {TrackerStatus, UnitSystem} from '../types/tracking';
import {formatSpeed, speedMsToUnit, speedUnitLabel} from '../utils/geo';

interface SpeedometerGaugeProps {
  currentSpeedMs: number;
  avgSpeedMs: number;
  maxSpeedMs: number;
  unit: UnitSystem;
  status: TrackerStatus;
}

function chooseScaleMax(maxObserved: number, unit: UnitSystem): number {
  const steps = unit === 'metric' ? [20, 40, 60, 100, 140, 200] : [15, 30, 50, 80, 120, 160];
  for (const s of steps) {
    if (maxObserved <= s * 0.85) return s;
  }
  return steps[steps.length - 1];
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 0 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export const SpeedometerGauge: React.FC<SpeedometerGaugeProps> = ({
  currentSpeedMs,
  avgSpeedMs,
  maxSpeedMs,
  unit,
  status,
}) => {
  const currentVal = speedMsToUnit(currentSpeedMs, unit);
  const avgVal = speedMsToUnit(avgSpeedMs, unit);
  const maxVal = speedMsToUnit(maxSpeedMs, unit);
  const scaleMax = chooseScaleMax(Math.max(currentVal, maxVal, avgVal), unit);

  // Arc sweeps from -120° to +120° (240° sweep)
  const startAngle = -120;
  const sweepDeg = 240;
  const endAngle = startAngle + sweepDeg;

  const clampedRatio = Math.min(1, Math.max(0, currentVal / scaleMax));
  const activeEndAngle = startAngle + clampedRatio * sweepDeg;

  const avgRatio = Math.min(1, Math.max(0, avgVal / scaleMax));
  const avgAngle = startAngle + avgRatio * sweepDeg;

  const cx = 140;
  const cy = 128;
  const radius = 102;

  const bgPath = describeArc(cx, cy, radius, startAngle, endAngle);
  const activePath =
    clampedRatio > 0.004
      ? describeArc(cx, cy, radius, startAngle, activeEndAngle)
      : '';

  const avgOuter = polarToCartesian(cx, cy, radius + 11, avgAngle);
  const avgInner = polarToCartesian(cx, cy, radius - 11, avgAngle);

  const tickCount = 5;
  const ticks = Array.from({length: tickCount + 1}, (_, i) => {
    const ratio = i / tickCount;
    const angle = startAngle + ratio * sweepDeg;
    const outer = polarToCartesian(cx, cy, radius - 14, angle);
    const inner = polarToCartesian(cx, cy, radius - 22, angle);
    const labelPos = polarToCartesian(cx, cy, radius - 35, angle);
    return {
      value: Math.round(scaleMax * ratio),
      outer,
      inner,
      labelPos,
    };
  });

  const accentStroke =
    status === 'tracking'
      ? '#2563EB'
      : status === 'paused'
        ? '#D97706'
        : '#64748B';

  return (
    <div className="relative flex flex-col items-center justify-center select-none">
      <svg
        viewBox="0 0 280 198"
        className="w-full max-w-[300px] h-auto overflow-visible"
        role="img"
        aria-label={`Current speed ${formatSpeed(currentSpeedMs, unit)} ${speedUnitLabel(unit)}`}
      >
        {/* Background track */}
        <path
          d={bgPath}
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          className="stroke-slate-200 dark:stroke-slate-800"
        />

        {/* Active speed progress arc */}
        {activePath && (
          <path
            d={activePath}
            fill="none"
            stroke={accentStroke}
            strokeWidth="12"
            strokeLinecap="round"
            style={{
              transition: 'stroke-dashoffset 180ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          />
        )}

        {/* Scale ticks & labels */}
        {ticks.map((tick) => (
          <g key={tick.value}>
            <line
              x1={tick.outer.x}
              y1={tick.outer.y}
              x2={tick.inner.x}
              y2={tick.inner.y}
              strokeWidth="1.5"
              className="stroke-slate-300 dark:stroke-slate-700"
            />
            <text
              x={tick.labelPos.x}
              y={tick.labelPos.y + 3}
              textAnchor="middle"
              className="fill-slate-400 dark:fill-slate-500 font-mono text-[10px] tabular-nums"
            >
              {tick.value}
            </text>
          </g>
        ))}

        {/* Average speed reference notch on arc */}
        {avgVal > 0.2 && (
          <line
            x1={avgOuter.x}
            y1={avgOuter.y}
            x2={avgInner.x}
            y2={avgInner.y}
            stroke="#059669"
            strokeWidth="3"
            strokeLinecap="round"
          />
        )}
      </svg>

      {/* Centered high-contrast digital speedometer readout */}
      <div className="absolute inset-x-0 top-[68px] flex flex-col items-center pointer-events-none">
        <span className="font-mono text-5xl sm:text-[54px] font-bold tracking-tight text-slate-900 dark:text-slate-50 leading-none tabular-nums">
          {formatSpeed(currentSpeedMs, unit, 1)}
        </span>
        <span className="mt-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
          {speedUnitLabel(unit)}
        </span>
        <div className="mt-2.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          <span>
            Avg{' '}
            <strong className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
              {formatSpeed(avgSpeedMs, unit, 1)}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Max{' '}
            <strong className="font-mono font-semibold text-slate-700 dark:text-slate-200">
              {formatSpeed(maxSpeedMs, unit, 1)}
            </strong>
          </span>
        </div>
      </div>
    </div>
  );
};
