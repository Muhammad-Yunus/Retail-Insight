import { useState } from 'react';
import { ArrowUpCircle } from 'lucide-react';
import type { HourlyIntervalRecord } from '../types/retail.ts';

interface TodayAtGlanceCardProps {
  totalFootfall: number;
  footfallDeltaPct: number;
  conversionPct: number;
  estimatedBuyers: number;
  intervals: HourlyIntervalRecord[];
}

export function TodayAtGlanceCard({
  totalFootfall,
  footfallDeltaPct,
  conversionPct,
  estimatedBuyers,
  intervals,
}: TodayAtGlanceCardProps) {
  const [selectedIdx, setSelectedIdx] = useState(2); // Default Interval 3 (15:00 to 18:00)

  const safeIntervals = intervals;
  if (safeIntervals.length < 2) {
    return (
      <div className="bg-white rounded-[18px] border border-[#EAECEF] shadow-[0_2px_12px_rgba(15,23,42,0.03)] p-5">
        <h2 className="text-[14.5px] font-semibold text-[#111827]">
          Today at a glance
        </h2>
        <div className="py-10 text-center text-[12px] text-[#6B7280]">
          Awaiting transaction ingestion via API...
        </div>
      </div>
    );
  }

  const activeIndex = Math.min(selectedIdx, safeIntervals.length - 2);
  const activeInterval = safeIntervals[activeIndex];

  // SVG chart coordinate system
  const chartW = 340;
  const chartH = 92;
  const padX = 12;
  const maxVal = Math.max(...safeIntervals.map((d) => d.footfall), 100);
  const minVal = 0;

  const points = safeIntervals.map((item, i) => {
    const x = padX + (i / (safeIntervals.length - 1)) * (chartW - padX * 2);
    const norm = Math.max(0.08, (item.footfall - minVal) / (maxVal - minVal));
    const y = chartH - 12 - norm * (chartH - 26);
    return { x, y, item };
  });

  // Smooth cubic bezier curve path
  function buildSmoothPath(pts: Array<{ x: number; y: number }>) {
    if (pts.length === 0) return '';
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const cx = (p0.x + p1.x) / 2;
      d += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
    }
    return d;
  }

  const linePath = buildSmoothPath(points);
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${chartH} L ${points[0].x} ${chartH} Z`;

  const pStart = points[activeIndex];
  const pEnd = points[activeIndex + 1];
  const midX = (pStart.x + pEnd.x) / 2;
  const tooltipLeftPct = Math.min(72, Math.max(28, (midX / chartW) * 100));

  return (
    <div className="bg-white rounded-[18px] border border-[#EAECEF] shadow-[0_2px_12px_rgba(15,23,42,0.03)] p-5 relative overflow-hidden">
      {/* Subtle Blue Dotted Scatter Decoration in top-right */}
      <svg
        width="108"
        height="72"
        viewBox="0 0 108 72"
        fill="none"
        aria-hidden="true"
        className="pointer-events-none absolute top-1 right-1 opacity-60"
      >
        {[
          [22, 10, 1.5], [38, 18, 1.2], [48, 8, 1.8], [62, 14, 1.4], [76, 8, 2.0], [92, 12, 1.6],
          [32, 28, 1.3], [52, 24, 1.5], [68, 26, 2.0], [84, 22, 1.4], [98, 28, 1.8],
          [44, 38, 1.2], [60, 40, 1.6], [76, 36, 1.5], [90, 42, 1.8], [100, 52, 1.4],
          [72, 50, 1.3], [84, 58, 1.6], [96, 64, 1.2], [54, 52, 1.1],
        ].map(([cx, cy, r], idx) => (
          <circle
            key={idx}
            cx={cx}
            cy={cy}
            r={r}
            fill={idx % 3 === 0 ? '#93C5FD' : '#CBD5E1'}
          />
        ))}
      </svg>

      <h2 className="text-[14.5px] font-semibold text-[#111827] relative z-10">
        Today at a glance
      </h2>

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-4 mt-3.5 relative z-10">
        <div>
          <div className="text-[11.5px] text-[#6B7280]">Footfall</div>
          <div className="text-[23px] font-semibold text-[#111827] tracking-[-0.02em] tabular-nums mt-0.5 leading-tight">
            {totalFootfall.toLocaleString('en-US')}
          </div>
          <div className="flex items-center gap-1 mt-1 text-[11px]">
            <ArrowUpCircle className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
            <span className="font-medium text-[#10B981] tabular-nums">
              {footfallDeltaPct.toFixed(2)}%
            </span>
            <span className="text-[#6B7280] truncate">than yesterday</span>
          </div>
        </div>

        <div>
          <div className="text-[11.5px] text-[#6B7280]">Conversion</div>
          <div className="text-[23px] font-semibold text-[#111827] tracking-[-0.02em] tabular-nums mt-0.5 leading-tight">
            {conversionPct.toFixed(1)}%
          </div>
          <div className="mt-1 text-[11px] text-[#6B7280]">
            Around{' '}
            <span className="font-semibold text-[#111827] underline decoration-[#D1D5DB] underline-offset-2 tabular-nums">
              {estimatedBuyers.toLocaleString('en-US')}
            </span>{' '}
            buyer
          </div>
        </div>
      </div>

      {/* Area Chart with Interval Tooltip */}
      <div className="relative mt-6 pt-10">
        {/* Floating Tooltip Box matching reference */}
        <div
          className="absolute top-0 -translate-x-1/2 z-20 bg-white/95 backdrop-blur-sm border border-[#F1F5F9] rounded-[10px] shadow-[0_6px_18px_rgba(15,23,42,0.08)] px-3 py-2 min-w-[126px] transition-all duration-200"
          style={{ left: `${tooltipLeftPct}%` }}
        >
          <div className="text-[9.5px] text-[#9CA3AF] leading-tight">
            Interval {activeInterval.intervalIndex + 1}
          </div>
          <div className="text-[10.5px] font-medium text-[#374151] mt-0.5">
            {activeInterval.rangeLabel}
          </div>
          <div className="mt-1.5 space-y-1 text-[10.5px]">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-semibold text-[#111827] tabular-nums">
                <span className="w-[2.5px] h-2.5 rounded-full bg-[#3B82F6]" />
                {activeInterval.footfall}
              </span>
              <span className="text-[#9CA3AF] text-[10px]">footfall</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-semibold text-[#111827] tabular-nums">
                <span className="w-[2.5px] h-2.5 rounded-full bg-[#8B5CF6]" />
                {activeInterval.conversionRate}%
              </span>
              <span className="text-[#9CA3AF] text-[10px]">conversion</span>
            </div>
          </div>
        </div>

        <svg
          viewBox={`0 0 ${chartW} ${chartH}`}
          className="w-full h-[88px] overflow-visible"
          aria-label="Hourly footfall and conversion area chart"
        >
          <defs>
            <linearGradient id="tealBaseGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#99F6E4" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#CCFBF1" stopOpacity="0.06" />
            </linearGradient>
            <linearGradient id="tealHighlightGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0D9488" stopOpacity="0.55" />
              <stop offset="65%" stopColor="#2DD4BF" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#99F6E4" stopOpacity="0.08" />
            </linearGradient>
            <clipPath id="activeIntervalClip">
              <rect
                x={pStart.x}
                y={0}
                width={Math.max(1, pEnd.x - pStart.x)}
                height={chartH}
              />
            </clipPath>
          </defs>

          {/* Base Area Fill */}
          <path d={areaPath} fill="url(#tealBaseGrad)" />
          <path d={linePath} fill="none" stroke="#99F6E4" strokeWidth="1.5" />

          {/* Highlighted Selected Interval Band */}
          <path
            d={areaPath}
            fill="url(#tealHighlightGrad)"
            clipPath="url(#activeIntervalClip)"
          />
          <path
            d={linePath}
            fill="none"
            stroke="#0F766E"
            strokeWidth="1.8"
            clipPath="url(#activeIntervalClip)"
          />

          {/* Vertical Dashed Marker Lines */}
          <line
            x1={pStart.x}
            y1={pStart.y}
            x2={pStart.x}
            y2={chartH}
            stroke="#94A3B8"
            strokeWidth="1"
            strokeDasharray="2 2.5"
          />
          <line
            x1={pEnd.x}
            y1={pEnd.y}
            x2={pEnd.x}
            y2={chartH}
            stroke="#94A3B8"
            strokeWidth="1"
            strokeDasharray="2 2.5"
          />

          {/* Curve Intersection Dots */}
          <circle
            cx={pStart.x}
            cy={pStart.y}
            r="3"
            fill="#FFFFFF"
            stroke="#0F766E"
            strokeWidth="1.8"
          />
          <circle
            cx={pEnd.x}
            cy={pEnd.y}
            r="3"
            fill="#FFFFFF"
            stroke="#0F766E"
            strokeWidth="1.8"
          />

          {/* Tiny upward caret triangles at x-axis */}
          <polygon
            points={`${pStart.x},${chartH - 3} ${pStart.x - 3},${chartH + 2} ${pStart.x + 3},${chartH + 2}`}
            fill="#111827"
          />
          <polygon
            points={`${pEnd.x},${chartH - 3} ${pEnd.x - 3},${chartH + 2} ${pEnd.x + 3},${chartH + 2}`}
            fill="#111827"
          />
        </svg>

        {/* X-Axis Interactive Interval Labels */}
        <div className="flex items-center justify-between mt-1.5 px-1">
          {safeIntervals.map((item, idx) => {
            const isHighlighted = idx === activeIndex || idx === activeIndex + 1;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  setSelectedIdx(Math.min(idx, safeIntervals.length - 2))
                }
                className={`text-[10.5px] tabular-nums transition-colors ${
                  isHighlighted
                    ? 'font-semibold text-[#111827]'
                    : 'font-normal text-[#6B7280] hover:text-[#111827]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
