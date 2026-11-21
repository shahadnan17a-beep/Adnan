import React, {useMemo, useState} from 'react';
import type {SpeedSample, UnitSystem} from '../types/tracking';
import {
  formatDuration,
  formatSpeed,
  speedMsToUnit,
  speedUnitLabel,
} from '../utils/geo';

interface SpeedChartProps {
  samples: SpeedSample[];
  avgSpeedMs: number;
  unit: UnitSystem;
}

export const SpeedChart: React.FC<SpeedChartProps> = ({
  samples,
  avgSpeedMs,
  unit,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const chart = useMemo(() => {
    const width = 560;
    const height = 148;
    const padLeft = 36;
    const padRight = 12;
    const padTop = 14;
    const padBottom = 24;
    const innerW = width - padLeft - padRight;
    const innerH = height - padTop - padBottom;

    if (samples.length < 2) {
      return {
        width,
        height,
        padLeft,
        padRight,
        padTop,
        padBottom,
        innerW,
        innerH,
        linePath: '',
        areaPath: '',
        points: [] as Array<{x: number; y: number; sample: SpeedSample; val: number}>,
        maxY: 20,
        avgY: padTop + innerH,
      };
    }

    const vals = samples.map((s) => speedMsToUnit(s.speedMs, unit));
    const avgVal = speedMsToUnit(avgSpeedMs, unit);
    const rawMax = Math.max(...vals, avgVal, 5);
    const maxY = Math.ceil(rawMax / 5) * 5;

    const minTime = samples[0].elapsedSec;
    const maxTime = Math.max(samples[samples.length - 1].elapsedSec, minTime + 1);
    const span = maxTime - minTime;

    const points = samples.map((s, idx) => {
      const val = vals[idx];
      const x = padLeft + ((s.elapsedSec - minTime) / span) * innerW;
      const y = padTop + innerH - (val / maxY) * innerH;
      return {x, y, sample: s, val};
    });

    const linePath = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');

    const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(padTop + innerH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padTop + innerH).toFixed(1)} Z`;

    const avgY = padTop + innerH - (Math.min(avgVal, maxY) / maxY) * innerH;

    return {
      width,
      height,
      padLeft,
      padRight,
      padTop,
      padBottom,
      innerW,
      innerH,
      linePath,
      areaPath,
      points,
      maxY,
      avgY,
    };
  }, [samples, avgSpeedMs, unit]);

  const activePoint =
    hoverIdx !== null && chart.points[hoverIdx] ? chart.points[hoverIdx] : null;

  if (samples.length < 2) {
    return (
      <div className="h-[156px] flex flex-col items-center justify-center text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl px-4">
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Speed profile ready
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Start GPS tracking or run a simulation to chart live speed against your average speed.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2 tabular-nums">
        <div className="flex items-center gap-3">
          <span>
            Live Speed ({speedUnitLabel(unit)})
          </span>
          <span aria-hidden="true">·</span>
          <span className="text-emerald-700 dark:text-emerald-400 font-medium">
            Avg {formatSpeed(avgSpeedMs, unit, 1)} {speedUnitLabel(unit)}
          </span>
        </div>
        {activePoint ? (
          <span className="font-mono text-slate-800 dark:text-slate-200">
            {formatDuration(activePoint.sample.elapsedSec)} ·{' '}
            {activePoint.val.toFixed(1)} {speedUnitLabel(unit)}
          </span>
        ) : (
          <span className="font-mono">
            {formatDuration(samples[samples.length - 1].elapsedSec)} elapsed
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        className="w-full h-[148px] overflow-visible"
        onMouseLeave={() => setHoverIdx(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * chart.width;
          let nearest = 0;
          let bestDist = Infinity;
          for (let i = 0; i < chart.points.length; i++) {
            const d = Math.abs(chart.points[i].x - relX);
            if (d < bestDist) {
              bestDist = d;
              nearest = i;
            }
          }
          setHoverIdx(nearest);
        }}
      >
        <defs>
          <linearGradient id="speedAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563EB" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#2563EB" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {[0, 0.5, 1].map((ratio) => {
          const y = chart.padTop + chart.innerH - ratio * chart.innerH;
          const label = Math.round(chart.maxY * ratio);
          return (
            <g key={ratio}>
              <line
                x1={chart.padLeft}
                y1={y}
                x2={chart.width - chart.padRight}
                y2={y}
                strokeWidth="1"
                className="stroke-slate-200 dark:stroke-slate-800"
              />
              <text
                x={chart.padLeft - 8}
                y={y + 3.5}
                textAnchor="end"
                className="fill-slate-400 dark:fill-slate-500 font-mono text-[10px] tabular-nums"
              >
                {label}
              </text>
            </g>
          );
        })}

        {/* Area & speed curve */}
        <path d={chart.areaPath} fill="url(#speedAreaGrad)" />
        <path
          d={chart.linePath}
          fill="none"
          stroke="#2563EB"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Average speed dashed reference line */}
        {avgSpeedMs > 0 && (
          <line
            x1={chart.padLeft}
            y1={chart.avgY}
            x2={chart.width - chart.padRight}
            y2={chart.avgY}
            stroke="#059669"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
        )}

        {/* Interactive hover vertical guide */}
        {activePoint && (
          <g>
            <line
              x1={activePoint.x}
              y1={chart.padTop}
              x2={activePoint.x}
              y2={chart.padTop + chart.innerH}
              strokeWidth="1"
              className="stroke-slate-400 dark:stroke-slate-600"
            />
            <circle
              cx={activePoint.x}
              cy={activePoint.y}
              r="4"
              fill="#2563EB"
              stroke="#FFFFFF"
              strokeWidth="2"
            />
          </g>
        )}

        {/* Time axis start & end */}
        <text
          x={chart.padLeft}
          y={chart.height - 4}
          textAnchor="start"
          className="fill-slate-400 dark:fill-slate-500 font-mono text-[10px]"
        >
          {formatDuration(samples[0].elapsedSec)}
        </text>
        <text
          x={chart.width - chart.padRight}
          y={chart.height - 4}
          textAnchor="end"
          className="fill-slate-400 dark:fill-slate-500 font-mono text-[10px]"
        >
          {formatDuration(samples[samples.length - 1].elapsedSec)}
        </text>
      </svg>
    </div>
  );
};
