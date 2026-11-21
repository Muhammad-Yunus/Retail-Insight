import { ArrowLeft } from 'lucide-react';
import type { DashboardPayload } from '../types/retail.ts';
import type { NavSection } from './Sidebar.tsx';

interface SecondaryViewPanelProps {
  section: Exclude<NavSection, 'Overview' | 'Settings'>;
  dashboard: DashboardPayload;
  onBackToOverview: () => void;
  onSelectStore: (storeId: number) => void;
  onOpenConfig: () => void;
}

export function SecondaryViewPanel({
  section,
  dashboard,
  onBackToOverview,
  onSelectStore,
  onOpenConfig,
}: SecondaryViewPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBackToOverview}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#2563EB] hover:text-[#1D4ED8]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Overview</span>
        </button>
        <button
          type="button"
          onClick={onOpenConfig}
          className="px-3.5 py-1.5 rounded-lg border border-[#E5E7EB] bg-white text-[12.5px] font-medium text-[#374151] hover:bg-gray-50"
        >
          Configure Streams &amp; APIs
        </button>
      </div>

      <div className="bg-white rounded-[18px] border border-[#EAECEF] p-6">
        <h2 className="text-[16px] font-semibold text-[#111827] mb-1">
          {section} Directory
        </h2>
        <p className="text-[12.5px] text-[#6B7280] mb-5">
          Live synchronized store telemetry backed by {dashboard.dbBackend}.
        </p>

        {section === 'Help' ? (
          <div className="space-y-3 text-[13px] text-[#374151]">
            <p>
              <strong>Live Video Stream:</strong> Supports WebRTC WHEP endpoints, HLS (.m3u8), MP4, and the built-in WebRTC demo feed. Configure per store via the Settings icon.
            </p>
            <p>
              <strong>External YOLO Object Detection:</strong> Send detections to <code className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">POST /api/detections/ingest</code> with your <code className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">x-api-key</code> header. The server pushes frames over <code className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">/ws</code> to render bounding boxes on the UI canvas.
            </p>
            <p>
              <strong>Metrics Ingestion:</strong> Post store occupancy, conversion, and staffing metrics to <code className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">POST /api/ingest/metrics</code>.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {dashboard.stores.map((store) => (
              <div
                key={store.id}
                className="rounded-[14px] border border-[#EAECEF] p-4 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11.5px] text-[#6B7280]">
                      {store.code}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                        store.status === 'Critical'
                          ? 'border-[#FECDD3] bg-[#FFF5F5] text-[#E11D48]'
                          : 'border-[#BFDBFE] bg-[#F8FAFF] text-[#2563EB]'
                      }`}
                    >
                      {store.status}
                    </span>
                  </div>
                  <h3 className="text-[15px] font-semibold text-[#111827] mt-1">
                    {store.name}
                  </h3>
                  <div className="mt-3 space-y-1.5 text-[12px] text-[#4B5563]">
                    <div className="flex justify-between">
                      <span>Footfall</span>
                      <span className="font-semibold text-[#111827] tabular-nums">
                        {store.footfall.toLocaleString('en-US')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>In store now</span>
                      <span className="font-semibold text-[#111827] tabular-nums">
                        {store.inStoreNow}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Staff / Waiting</span>
                      <span className="font-semibold text-[#111827] tabular-nums">
                        {store.staffOnFloor} / {store.customerWaiting}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Camera</span>
                      <span className="font-medium text-[#111827]">
                        {store.cameraLocation} ({store.cameraModel})
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onSelectStore(store.id);
                    onBackToOverview();
                  }}
                  className="mt-4 w-full py-1.5 rounded-lg bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#2563EB] text-[12px] font-medium transition-colors"
                >
                  Open Live Feed
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
