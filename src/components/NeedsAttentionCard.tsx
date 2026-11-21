import { useRef } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { AttentionAlertRecord } from '../types/retail.ts';

interface NeedsAttentionCardProps {
  alerts: AttentionAlertRecord[];
  onActionAlert: (alert: AttentionAlertRecord) => void;
}

export function NeedsAttentionCard({
  alerts,
  onActionAlert,
}: NeedsAttentionCardProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  function scrollByCard(dir: 'left' | 'right') {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({
      left: dir === 'left' ? -245 : 245,
      behavior: 'smooth',
    });
  }

  return (
    <div className="bg-white rounded-[18px] border border-[#EAECEF] shadow-[0_2px_12px_rgba(15,23,42,0.03)] p-5 relative overflow-hidden flex flex-col justify-between">
      <div className="flex items-center justify-between mb-3.5">
        <h2 className="text-[14.5px] font-semibold text-[#111827]">
          Needs Attention
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => scrollByCard('left')}
            aria-label="Previous alert"
            className="p-1 text-[#9CA3AF] hover:text-[#111827] rounded-md hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollByCard('right')}
            aria-label="Next alert"
            className="p-1 text-[#374151] hover:text-[#111827] rounded-md hover:bg-gray-100 transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="relative">
        <div
          ref={scrollRef}
          className="flex items-stretch gap-3.5 overflow-x-auto no-scrollbar pr-8"
        >
          {alerts.map((alert, idx) => {
            const isPrimary = idx === 0;
            const badgeStyle = isPrimary
              ? 'bg-[#FEF3C7] text-[#B45309]'
              : 'bg-[#F3F4F6] text-[#4B5563]';

            return (
              <div
                key={alert.id}
                className="min-w-[235px] max-w-[245px] shrink-0 rounded-[14px] border border-[#ECEEF2] bg-white p-4 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[#6B7280]">
                      {alert.storeCode}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-[6px] text-[10.5px] font-medium ${badgeStyle}`}
                    >
                      {alert.severity}
                    </span>
                  </div>

                  <h3 className="text-[14px] font-semibold text-[#111827] mt-1">
                    {alert.title}
                  </h3>
                  <p className="text-[11.5px] italic text-[#6B7280] leading-[1.45] mt-2 line-clamp-2">
                    {alert.description}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onActionAlert(alert)}
                  className={`mt-4 inline-flex items-center gap-1.5 text-[12px] font-medium transition-colors self-start ${
                    isPrimary
                      ? 'text-[#2563EB] hover:text-[#1D4ED8] underline decoration-[#93C5FD] underline-offset-4'
                      : 'text-[#374151] hover:text-[#111827]'
                  }`}
                >
                  <span>
                    {alert.acknowledged ? 'Dispatched' : alert.actionLabel}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Soft white right-edge gradient matching peeking card in reference */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 right-0 bottom-0 w-16 bg-gradient-to-l from-white via-white/80 to-transparent"
        />
      </div>
    </div>
  );
}
