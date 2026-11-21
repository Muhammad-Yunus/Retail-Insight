import { MoreHorizontal } from 'lucide-react';
import type { StoreRecord } from '../types/retail.ts';

interface StorePerformanceCardProps {
  stores: StoreRecord[];
  activeStoreId: number;
  onSelectStore: (storeId: number) => void;
  onOpenStoreConfig: () => void;
}

export function StorePerformanceCard({
  stores,
  activeStoreId,
  onSelectStore,
  onOpenStoreConfig,
}: StorePerformanceCardProps) {
  return (
    <div className="bg-white rounded-[18px] border border-[#EAECEF] shadow-[0_2px_12px_rgba(15,23,42,0.03)] p-5 flex flex-col justify-between">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[14.5px] font-semibold text-[#111827]">
          Store performance
        </h2>
        <button
          type="button"
          onClick={onOpenStoreConfig}
          title="Store Stream Settings"
          className="text-[#6B7280] hover:text-[#111827] p-1 rounded-md hover:bg-gray-100 transition-colors"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#F3F4F6] text-[11.5px] font-medium text-[#6B7280]">
              <th className="pb-2.5 font-medium">Store/area</th>
              <th className="pb-2.5 font-medium">Footfall</th>
              <th className="pb-2.5 font-medium">Conversion</th>
              <th className="pb-2.5 font-medium text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F8FAFC]">
            {stores.map((store) => {
              const isPositive = store.rankDelta >= 0;
              const isSelected = store.id === activeStoreId;
              const isCritical = store.status === 'Critical';
              const badgeColor =
                store.rankDelta >= 2
                  ? 'bg-[#DBEAFE] text-[#2563EB]'
                  : store.rankDelta >= 0
                    ? 'bg-[#E0F2FE] text-[#0284C7]'
                    : 'bg-[#FFE4E6] text-[#E11D48]';

              return (
                <tr
                  key={store.id}
                  onClick={() => onSelectStore(store.id)}
                  className={`cursor-pointer transition-colors ${
                    isSelected ? 'bg-[#F8FAFF]' : 'hover:bg-[#F9FAFB]'
                  }`}
                >
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-[18px] h-[24px] rounded-[4px] flex flex-col items-center justify-center text-[9px] font-bold leading-none shrink-0 ${badgeColor}`}
                      >
                        <span className="text-[7px] mb-0.5">
                          {isPositive ? '▲' : '▼'}
                        </span>
                        <span className="tabular-nums">
                          {Math.abs(store.rankDelta)}
                        </span>
                      </div>
                      <div>
                        <div className="text-[10.5px] text-[#6B7280] leading-tight">
                          {store.code}
                        </div>
                        <div className="text-[13px] font-medium text-[#111827] leading-tight mt-0.5">
                          {store.name}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="py-2.5 pr-3 text-[13px] font-medium text-[#111827] tabular-nums">
                    {store.footfall.toLocaleString('en-US')}
                  </td>

                  <td className="py-2.5 pr-3">
                    <div className="text-[13px] font-medium text-[#111827] tabular-nums leading-tight">
                      {store.conversionRate.toFixed(1)}%
                    </div>
                    <div className="text-[10.5px] text-[#6B7280] tabular-nums mt-0.5">
                      avg.dwell{' '}
                      <span className="font-medium text-[#374151]">
                        {store.avgDwellMin.toFixed(1)}min
                      </span>
                    </div>
                  </td>

                  <td className="py-2.5 text-right">
                    <span
                      className={`inline-flex items-center justify-center px-3 py-1 rounded-[7px] text-[11.5px] font-medium border ${
                        isCritical
                          ? 'border-[#FECDD3] bg-[#FFF5F5] text-[#E11D48]'
                          : 'border-[#BFDBFE] bg-[#F8FAFF] text-[#2563EB]'
                      }`}
                    >
                      {store.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
