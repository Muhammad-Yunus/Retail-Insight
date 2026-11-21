export type StreamType =
  | 'webrtc_public'
  | 'webrtc_whep'
  | 'hls'
  | 'mp4'
  | 'webrtc_demo';

export interface Keypoint {
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  score?: number;
}

export interface DetectionBox {
  id: string;
  label: string;
  confidence: number; // 0..1 or 0..100
  bbox: [number, number, number, number]; // normalized [x, y, width, height] in 0..1
  color?: 'blue' | 'green' | 'purple' | 'amber';
  keypoints?: Keypoint[];
}

export interface DetectionFrame {
  storeId: number;
  cameraId: string;
  frameTimestamp: string;
  imageWidth: number;
  imageHeight: number;
  sourceEngine: string;
  detections: DetectionBox[];
}

export interface StoreRecord {
  id: number;
  code: string;
  name: string;
  area: string;
  footfall: number;
  conversionRate: number;
  avgDwellMin: number;
  rankDelta: number;
  status: 'Good' | 'Critical';
  cameraId: string;
  cameraLocation: string;
  cameraModel: string;
  signalStrength: string;
  streamType: StreamType;
  streamUrl: string;
  inStoreNow: number;
  staffOnFloor: number;
  customerWaiting: number;
  topAgeRange: string;
  femaleCount: number;
  maleCount: number;
  updatedAt: string;
}

export interface HourlyIntervalRecord {
  id: number;
  storeId: number;
  intervalIndex: number;
  label: string;
  rangeLabel: string;
  footfall: number;
  conversionRate: number;
}

export interface StaffingMetricsRecord {
  id: number;
  avgDwellMin: number;
  avgQueueMin: number;
  statusLabel: string;
  networkRatio: number;
  updatedAt: string;
}

export interface AttentionAlertRecord {
  id: number;
  storeId: number;
  storeCode: string;
  severity: 'Medium' | 'High' | 'Critical';
  title: string;
  description: string;
  actionLabel: string;
  acknowledged: boolean;
  createdAt: string;
}

export interface ZoneOverlayAlert {
  id: string;
  zone: string;
  messageHighlight: string;
  messagePrefix: string;
  messageSuffix: string;
  actionLabel: string;
  anchorX: number; // 0..1
  anchorY: number; // 0..1
  acknowledged: boolean;
}

export interface DashboardPayload {
  stores: StoreRecord[];
  activeStoreId: number;
  summary: {
    dateLabel: string;
    totalFootfall: number;
    footfallDeltaPct: number;
    conversionPct: number;
    estimatedBuyers: number;
  };
  intervals: HourlyIntervalRecord[];
  staffing: StaffingMetricsRecord;
  alerts: AttentionAlertRecord[];
  zoneAlert: ZoneOverlayAlert | null;
  latestDetections: DetectionFrame;
  dbBackend: 'postgresql' | 'memory-fallback';
}

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'operator';
}

export interface ApiKeySummary {
  id: number;
  name: string;
  keyPrefix: string;
  scopes: string;
  lastUsedAt: string | null;
  createdAt: string;
}
