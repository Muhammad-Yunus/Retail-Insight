import type { StaffingMetricsRecord } from '../types/retail.ts';

interface StaffingCardProps {
  staffing: StaffingMetricsRecord;
}

export function StaffingCard({ staffing }: StaffingCardProps) {
  const minRatio = 1.1;
  const maxRatio = 1.25;
  const clamped = Math.min(maxRatio, Math.max(minRatio, staffing.networkRatio));
  const tickCount = 35;
  const activeTickIndex = Math.round(
    ((clamped - minRatio) / (maxRatio - minRatio)) * (tickCount - 1)
  );

  return (
    <div className="bg-white rounded-[18px] border border-[#EAECEF] shadow-[0_2px_12px_rgba(15,23,42,0.03)] p-5 flex-1 flex flex-col justify-between">
      <div>
        <h2 className="text-[14.5px] font-semibold text-[#111827]">Staffing</h2>

        {/* Avg dwell & Avg queue */}
        <div className="flex items-start justify-between mt-3.5">
          <div>
            <div className="text-[11.5px] text-[#6B7280]">Avg. dwell</div>
            <div className="text-[17px] font-semibold text-[#111827] tabular-nums mt-0.5">
              ± {staffing.avgDwellMin.toFixed(1)} min
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11.5px] text-[#6B7280]">Avg. queue</div>
            <div className="text-[17px] font-semibold text-[#111827] tabular-nums mt-0.5">
              ± {staffing.avgQueueMin.toFixed(1)} min
            </div>
          </div>
        </div>

        {/* All good green pulse divider */}
        <div className="flex items-center gap-2 my-3.5">
          <svg width="8" height="8" viewBox="0 0 8 8" className="shrink-0">
            <polygon points="1,1 7,4 1,7" fill="#10B981" />
          </svg>
          <div className="h-[1px] flex-1 bg-[#E5E7EB]" />
          <span className="text-[11px] font-medium text-[#10B981] whitespace-nowrap px-1">
            {staffing.statusLabel}
          </span>
          <div className="flex items-center flex-1">
            <div className="h-[1px] flex-1 bg-[#E5E7EB]" />
            <svg width="24" height="12" viewBox="0 0 24 12" fill="none" className="shrink-0">
              <path
                d="M0 6 L6 6 L9 2 L12 10 L15 4 L17 6 L24 6"
                stroke="#10B981"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="h-[1px] w-3 bg-[#E5E7EB]" />
          </div>
          <svg width="8" height="8" viewBox="0 0 8 8" className="shrink-0">
            <polygon points="7,1 1,4 7,7" fill="#10B981" />
          </svg>
        </div>
      </div>

      {/* Avg network ratio tick-bar gauge */}
      <div className="text-center">
        <div className="text-[11.5px] text-[#6B7280]">Avg. network ratio</div>
        <div className="text-[18px] font-semibold text-[#111827] tabular-nums mt-0.5">
          {staffing.networkRatio.toFixed(2)}
        </div>

        <div className="flex items-center justify-between text-[10.5px] text-[#6B7280] tabular-nums mt-1.5 mb-1">
          <span>1.10</span>
          <span>1.25</span>
        </div>

        <div className="relative flex items-end justify-between h-6 pt-1">
          {Array.from({ length: tickCount }).map((_, idx) => {
            const isActive = idx === activeTickIndex;
            const nearActive = Math.abs(idx - activeTickIndex) <= 2;
            return (
              <div
                key={idx}
                className="flex flex-col items-center justify-end relative"
              >
                <span
                  className={`w-[1.5px] rounded-full transition-all ${
                    isActive
                      ? 'h-[20px] bg-[#2563EB]'
                      : nearActive
                        ? 'h-[12px] bg-[#60A5FA]'
                        : 'h-[11px] bg-[#CBD5E1]'
                  }`}
                />
                {isActive && (
                  <svg
                    width="7"
                    height="5"
                    viewBox="0 0 7 5"
                    className="absolute -bottom-1.5"
                  >
                    <polygon points="3.5,0 7,5 0,5" fill="#2563EB" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
