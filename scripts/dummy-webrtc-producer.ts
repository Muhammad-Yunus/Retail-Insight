import 'dotenv/config';
import dgram from 'node:dgram';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import {
  MediaStream,
  MediaStreamTrack,
  RTCPeerConnection,
  useOPUS,
  useVP8,
} from 'werift';

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

const APP_BASE_URL = (
  parseArg('app-url') ||
  process.env.APP_BASE_URL ||
  'http://localhost:3000'
).replace(/\/$/, '');

const WHEP_HOST = parseArg('whep-host') || process.env.WHEP_HOST || '0.0.0.0';
const WHEP_PORT = Number(parseArg('whep-port') || process.env.WHEP_PORT || 8889);
const STORE_ID = Number(parseArg('store-id') || process.env.STORE_ID || 3);
const CAMERA_ID = parseArg('camera-id') || 'CAM-WF-01';
const DETECTION_INTERVAL_MS = Number(parseArg('interval') || 1500);
const IMAGE_PATH = path.resolve(
  process.cwd(),
  parseArg('image') || 'public/assets/aistudio/template_dummy_webrtc_b8bc220d.jpg'
);
const VIDEO_WIDTH = 1440;
const VIDEO_HEIGHT = 800;
const FPS = 1;

let activeApiKey = parseArg('api-key') || process.env.INGEST_API_KEY || '';
const ADMIN_EMAIL = parseArg('admin-email') || 'riana@uniqlo.jp';
const ADMIN_PASSWORD =
  parseArg('admin-password') || process.env.ADMIN_PASSCODE || '';
const SEED_METRICS =
  process.argv.includes('--seed-metrics') ||
  process.argv.includes('--with-metrics');

if (!fs.existsSync(IMAGE_PATH)) {
  console.error(`[DummyProducer] Template image not found: ${IMAGE_PATH}`);
  process.exit(1);
}

interface Keypoint {
  x: number;
  y: number;
  score: number;
}

interface DetectionTemplate {
  id: string;
  label: string;
  baseConfidence: number;
  bbox: [number, number, number, number];
  color: 'blue' | 'green' | 'purple' | 'amber';
  keypoints?: Keypoint[];
}

// Accurate normalized coordinates mapped directly to public/assets/aistudio/template_dummy_webrtc_b8bc220d.jpg (1440x800)
// Keypoint order matches LiveDetectionPlayer skeleton bones:
// [0:head, 1:neck, 2:L_shoulder, 3:R_shoulder, 4:L_hand, 5:R_hand, 6:pelvis, 7:L_knee, 8:R_knee, 9:L_ankle, 10:R_ankle]
const TEMPLATE_DETECTIONS: DetectionTemplate[] = [
  {
    id: 'person-01-left-grey',
    label: 'person',
    baseConfidence: 94.2,
    bbox: [0.018, 0.635, 0.095, 0.36],
    color: 'blue',
    keypoints: [
      { x: 0.045, y: 0.678, score: 0.96 },
      { x: 0.056, y: 0.722, score: 0.95 },
      { x: 0.036, y: 0.742, score: 0.93 },
      { x: 0.078, y: 0.732, score: 0.92 },
      { x: 0.032, y: 0.815, score: 0.89 },
      { x: 0.096, y: 0.768, score: 0.9 },
      { x: 0.068, y: 0.855, score: 0.94 },
      { x: 0.078, y: 0.915, score: 0.91 },
      { x: 0.098, y: 0.91, score: 0.91 },
      { x: 0.088, y: 0.978, score: 0.88 },
      { x: 0.106, y: 0.968, score: 0.87 },
    ],
  },
  {
    id: 'person-02-left-striped',
    label: 'person',
    baseConfidence: 92.8,
    bbox: [0.098, 0.515, 0.095, 0.345],
    color: 'blue',
    keypoints: [
      { x: 0.128, y: 0.552, score: 0.95 },
      { x: 0.14, y: 0.592, score: 0.94 },
      { x: 0.125, y: 0.605, score: 0.92 },
      { x: 0.16, y: 0.608, score: 0.91 },
      { x: 0.105, y: 0.658, score: 0.89 },
      { x: 0.155, y: 0.68, score: 0.87 },
      { x: 0.16, y: 0.715, score: 0.93 },
      { x: 0.162, y: 0.785, score: 0.9 },
      { x: 0.178, y: 0.778, score: 0.9 },
      { x: 0.168, y: 0.84, score: 0.88 },
      { x: 0.184, y: 0.835, score: 0.86 },
    ],
  },
  {
    id: 'person-03-holding-shoe',
    label: 'person',
    baseConfidence: 93.6,
    bbox: [0.362, 0.448, 0.082, 0.275],
    color: 'blue',
    keypoints: [
      { x: 0.388, y: 0.492, score: 0.96 },
      { x: 0.398, y: 0.525, score: 0.95 },
      { x: 0.376, y: 0.535, score: 0.93 },
      { x: 0.422, y: 0.535, score: 0.93 },
      { x: 0.378, y: 0.59, score: 0.9 },
      { x: 0.405, y: 0.588, score: 0.91 },
      { x: 0.4, y: 0.635, score: 0.93 },
      { x: 0.392, y: 0.68, score: 0.89 },
      { x: 0.412, y: 0.68, score: 0.89 },
      { x: 0.394, y: 0.715, score: 0.84 },
      { x: 0.412, y: 0.715, score: 0.84 },
    ],
  },
  {
    id: 'person-04-kneeling-shoes',
    label: 'person',
    baseConfidence: 90.4,
    bbox: [0.382, 0.672, 0.106, 0.245],
    color: 'blue',
    keypoints: [
      { x: 0.42, y: 0.708, score: 0.94 },
      { x: 0.436, y: 0.738, score: 0.93 },
      { x: 0.425, y: 0.75, score: 0.9 },
      { x: 0.46, y: 0.755, score: 0.92 },
      { x: 0.395, y: 0.788, score: 0.88 },
      { x: 0.438, y: 0.805, score: 0.89 },
      { x: 0.468, y: 0.835, score: 0.92 },
      { x: 0.415, y: 0.862, score: 0.87 },
      { x: 0.448, y: 0.868, score: 0.88 },
      { x: 0.458, y: 0.888, score: 0.85 },
      { x: 0.468, y: 0.895, score: 0.86 },
    ],
  },
  {
    id: 'person-05-center-floral',
    label: 'person',
    baseConfidence: 91.5,
    bbox: [0.462, 0.365, 0.075, 0.31],
    color: 'blue',
    keypoints: [
      { x: 0.506, y: 0.395, score: 0.95 },
      { x: 0.505, y: 0.43, score: 0.94 },
      { x: 0.49, y: 0.445, score: 0.91 },
      { x: 0.52, y: 0.445, score: 0.92 },
      { x: 0.468, y: 0.422, score: 0.89 },
      { x: 0.492, y: 0.505, score: 0.88 },
      { x: 0.505, y: 0.545, score: 0.93 },
      { x: 0.496, y: 0.605, score: 0.9 },
      { x: 0.514, y: 0.605, score: 0.9 },
      { x: 0.494, y: 0.658, score: 0.88 },
      { x: 0.512, y: 0.655, score: 0.88 },
    ],
  },
  {
    id: 'person-06-aisle-backpack',
    label: 'person',
    baseConfidence: 95.1,
    bbox: [0.532, 0.51, 0.095, 0.368],
    color: 'blue',
    keypoints: [
      { x: 0.592, y: 0.548, score: 0.96 },
      { x: 0.585, y: 0.592, score: 0.95 },
      { x: 0.562, y: 0.605, score: 0.93 },
      { x: 0.602, y: 0.61, score: 0.93 },
      { x: 0.578, y: 0.728, score: 0.9 },
      { x: 0.618, y: 0.642, score: 0.91 },
      { x: 0.578, y: 0.72, score: 0.94 },
      { x: 0.565, y: 0.785, score: 0.91 },
      { x: 0.588, y: 0.79, score: 0.92 },
      { x: 0.55, y: 0.84, score: 0.89 },
      { x: 0.586, y: 0.858, score: 0.9 },
    ],
  },
  {
    id: 'person-07-rack-69',
    label: 'person',
    baseConfidence: 91.0,
    bbox: [0.625, 0.41, 0.092, 0.285],
    color: 'blue',
    keypoints: [
      { x: 0.668, y: 0.44, score: 0.94 },
      { x: 0.662, y: 0.475, score: 0.93 },
      { x: 0.646, y: 0.488, score: 0.9 },
      { x: 0.678, y: 0.485, score: 0.91 },
      { x: 0.668, y: 0.518, score: 0.87 },
      { x: 0.706, y: 0.495, score: 0.89 },
      { x: 0.654, y: 0.585, score: 0.92 },
      { x: 0.646, y: 0.635, score: 0.89 },
      { x: 0.664, y: 0.635, score: 0.9 },
      { x: 0.642, y: 0.68, score: 0.86 },
      { x: 0.66, y: 0.68, score: 0.87 },
    ],
  },
  {
    id: 'person-08-right-plaid',
    label: 'person',
    baseConfidence: 92.3,
    bbox: [0.802, 0.518, 0.088, 0.288],
    color: 'blue',
    keypoints: [
      { x: 0.858, y: 0.55, score: 0.95 },
      { x: 0.852, y: 0.588, score: 0.94 },
      { x: 0.83, y: 0.598, score: 0.92 },
      { x: 0.874, y: 0.605, score: 0.92 },
      { x: 0.812, y: 0.662, score: 0.88 },
      { x: 0.876, y: 0.688, score: 0.89 },
      { x: 0.844, y: 0.695, score: 0.93 },
      { x: 0.832, y: 0.748, score: 0.89 },
      { x: 0.85, y: 0.752, score: 0.9 },
      { x: 0.828, y: 0.79, score: 0.85 },
      { x: 0.846, y: 0.795, score: 0.85 },
    ],
  },
  {
    id: 'person-09-upper-left-bag',
    label: 'person',
    baseConfidence: 88.9,
    bbox: [0.24, 0.245, 0.056, 0.258],
    color: 'blue',
    keypoints: [
      { x: 0.264, y: 0.27, score: 0.93 },
      { x: 0.265, y: 0.3, score: 0.92 },
      { x: 0.25, y: 0.312, score: 0.89 },
      { x: 0.28, y: 0.312, score: 0.9 },
      { x: 0.248, y: 0.362, score: 0.86 },
      { x: 0.284, y: 0.355, score: 0.87 },
      { x: 0.268, y: 0.398, score: 0.91 },
      { x: 0.264, y: 0.445, score: 0.88 },
      { x: 0.282, y: 0.44, score: 0.89 },
      { x: 0.268, y: 0.488, score: 0.85 },
      { x: 0.29, y: 0.48, score: 0.85 },
    ],
  },
  {
    id: 'person-10-upper-center-grey',
    label: 'person',
    baseConfidence: 84.7,
    bbox: [0.49, 0.22, 0.054, 0.185],
    color: 'blue',
    keypoints: [
      { x: 0.512, y: 0.244, score: 0.92 },
      { x: 0.514, y: 0.27, score: 0.91 },
      { x: 0.498, y: 0.282, score: 0.88 },
      { x: 0.53, y: 0.282, score: 0.89 },
      { x: 0.494, y: 0.338, score: 0.85 },
      { x: 0.536, y: 0.338, score: 0.85 },
      { x: 0.516, y: 0.355, score: 0.9 },
      { x: 0.512, y: 0.385, score: 0.86 },
      { x: 0.526, y: 0.385, score: 0.86 },
    ],
  },
  {
    id: 'person-11-entrance-blue',
    label: 'person',
    baseConfidence: 86.4,
    bbox: [0.31, 0.048, 0.052, 0.205],
    color: 'blue',
    keypoints: [
      { x: 0.326, y: 0.068, score: 0.91 },
      { x: 0.328, y: 0.092, score: 0.9 },
      { x: 0.316, y: 0.102, score: 0.87 },
      { x: 0.342, y: 0.1, score: 0.88 },
      { x: 0.314, y: 0.15, score: 0.84 },
      { x: 0.352, y: 0.148, score: 0.85 },
      { x: 0.332, y: 0.162, score: 0.89 },
      { x: 0.328, y: 0.205, score: 0.86 },
      { x: 0.34, y: 0.205, score: 0.86 },
      { x: 0.328, y: 0.242, score: 0.83 },
      { x: 0.34, y: 0.238, score: 0.83 },
    ],
  },
  {
    id: 'person-12-upper-right-navy',
    label: 'person',
    baseConfidence: 82.3,
    bbox: [0.688, 0.105, 0.054, 0.228],
    color: 'blue',
    keypoints: [
      { x: 0.716, y: 0.126, score: 0.91 },
      { x: 0.715, y: 0.15, score: 0.9 },
      { x: 0.7, y: 0.16, score: 0.87 },
      { x: 0.73, y: 0.16, score: 0.88 },
      { x: 0.692, y: 0.205, score: 0.84 },
      { x: 0.736, y: 0.21, score: 0.85 },
      { x: 0.714, y: 0.232, score: 0.89 },
      { x: 0.704, y: 0.28, score: 0.86 },
      { x: 0.716, y: 0.28, score: 0.86 },
      { x: 0.702, y: 0.322, score: 0.83 },
      { x: 0.715, y: 0.322, score: 0.83 },
    ],
  },
  // Apparel & Footwear Merchandise Boxes
  {
    id: 'apparel-trouser-rack-45',
    label: 'trouser',
    baseConfidence: 93.2,
    bbox: [0.298, 0.345, 0.148, 0.175],
    color: 'green',
  },
  {
    id: 'apparel-trouser-rack-69',
    label: 'trouser',
    baseConfidence: 91.4,
    bbox: [0.642, 0.358, 0.146, 0.165],
    color: 'green',
  },
  {
    id: 'apparel-cloth-foreground',
    label: 'cloth',
    baseConfidence: 92.7,
    bbox: [0.675, 0.815, 0.205, 0.18],
    color: 'purple',
  },
  {
    id: 'apparel-shoes-display',
    label: 'shoes',
    baseConfidence: 94.1,
    bbox: [0.178, 0.605, 0.205, 0.295],
    color: 'purple',
  },
];

function buildRealisticYoloFrame(tick: number) {
  const now = new Date();
  const frameTimestamp = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(
    now.getDate()
  ).padStart(2, '0')}/${now.getFullYear()}   ${now.toTimeString().slice(0, 8)}`;

  const detections = TEMPLATE_DETECTIONS.map((det, idx) => {
    const phase = tick * 0.65 + idx * 0.9;
    const confDelta = Math.sin(phase) * 0.45;
    const confidence = Number(
      Math.max(70, Math.min(99.5, det.baseConfidence + confDelta)).toFixed(1)
    );

    const microDx = det.label === 'person' ? Math.sin(phase) * 0.0014 : 0;
    const microDy = det.label === 'person' ? Math.cos(phase * 0.8) * 0.001 : 0;

    return {
      id: det.id,
      label: det.label,
      confidence,
      bbox: [
        Number(Math.max(0, det.bbox[0] + microDx).toFixed(4)),
        Number(Math.max(0, det.bbox[1] + microDy).toFixed(4)),
        det.bbox[2],
        det.bbox[3],
      ] as [number, number, number, number],
      color: det.color,
      keypoints: det.keypoints?.map((kp, kIdx) => ({
        x: Number(
          Math.max(
            0,
            Math.min(1, kp.x + microDx + Math.sin(phase + kIdx * 0.3) * 0.0008)
          ).toFixed(4)
        ),
        y: Number(
          Math.max(
            0,
            Math.min(1, kp.y + microDy + Math.cos(phase + kIdx * 0.3) * 0.0008)
          ).toFixed(4)
        ),
        score: kp.score,
      })),
    };
  });

  return {
    storeId: STORE_ID,
    cameraId: CAMERA_ID,
    frameTimestamp,
    imageWidth: VIDEO_WIDTH,
    imageHeight: VIDEO_HEIGHT,
    sourceEngine: 'yolo-v8x-pose-dummy-producer',
    detections,
  };
}

async function resolveIngestApiKey(): Promise<string | null> {
  if (activeApiKey) return activeApiKey;
  if (!ADMIN_PASSWORD) {
    return null;
  }

  try {
    const loginRes = await fetch(`${APP_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    if (!loginRes.ok) return null;
    const loginJson = (await loginRes.json()) as { token?: string };
    if (!loginJson.token) return null;

    const keyRes = await fetch(`${APP_BASE_URL}/api/api-keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${loginJson.token}`,
      },
      body: JSON.stringify({
        name: `dummy-producer-${Date.now()}`,
        scopes: 'ingest,detections',
      }),
    });
    if (!keyRes.ok) return null;
    const keyJson = (await keyRes.json()) as { plaintextKey?: string };
    if (keyJson.plaintextKey) {
      activeApiKey = keyJson.plaintextKey;
      console.info('[DummyProducer] Provisioned ingest API key via /api/auth/login.');
      return activeApiKey;
    }
  } catch (err) {
    console.warn(
      '[DummyProducer] Auto-auth key provisioning skipped:',
      err instanceof Error ? err.message : err
    );
  }
  return null;
}

async function postApi(apiKey: string, apiPath: string, body: unknown) {
  const res = await fetch(`${APP_BASE_URL}${apiPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${apiPath} -> ${res.status}: ${text}`);
  }
  return res.json();
}

async function maybeSeedDashboardIfEmpty(apiKey: string) {
  try {
    const res = await fetch(`${APP_BASE_URL}/api/dashboard?storeId=${STORE_ID}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      summary?: { totalFootfall?: number };
    };
    const isEmpty = !data.summary?.totalFootfall;
    if (!isEmpty && !SEED_METRICS) return;

    await postApi(apiKey, '/api/ingest/transactions', {
      replaceExistingForDates: true,
      transactions: [
        { storeId: 3, recordedDate: '2026-08-07', intervalIndex: 0, footfallCount: 1980, convertedCount: 1490, dwellMinutes: 11.4, queueMinutes: 10.8, ageGroup: '23-35 yo', femaleCount: 1180, maleCount: 800 },
        { storeId: 2, recordedDate: '2026-08-07', intervalIndex: 1, footfallCount: 1240, convertedCount: 790, dwellMinutes: 14.9, queueMinutes: 11.2, ageGroup: '25-40 yo', femaleCount: 740, maleCount: 500 },
        { storeId: 1, recordedDate: '2026-08-07', intervalIndex: 2, footfallCount: 674, convertedCount: 84, dwellMinutes: 17.5, queueMinutes: 13.0, ageGroup: '18-29 yo', femaleCount: 380, maleCount: 294 },

        { storeId: 3, recordedDate: '2026-08-08', intervalIndex: 0, footfallCount: 290, convertedCount: 252, dwellMinutes: 11.7, queueMinutes: 10.5, ageGroup: '23-35 yo', femaleCount: 14, maleCount: 7 },
        { storeId: 3, recordedDate: '2026-08-08', intervalIndex: 1, footfallCount: 220, convertedCount: 176, dwellMinutes: 11.7, queueMinutes: 10.8, ageGroup: '23-35 yo', femaleCount: 12, maleCount: 6 },
        { storeId: 3, recordedDate: '2026-08-08', intervalIndex: 2, footfallCount: 330, convertedCount: 257, dwellMinutes: 11.7, queueMinutes: 11.1, ageGroup: '23-35 yo', femaleCount: 16, maleCount: 8 },
        { storeId: 3, recordedDate: '2026-08-08', intervalIndex: 3, footfallCount: 520, convertedCount: 428, dwellMinutes: 11.7, queueMinutes: 11.4, ageGroup: '23-35 yo', femaleCount: 14, maleCount: 7 },
        { storeId: 3, recordedDate: '2026-08-08', intervalIndex: 4, footfallCount: 418, convertedCount: 304, dwellMinutes: 11.7, queueMinutes: 11.0, ageGroup: '23-35 yo', femaleCount: 12, maleCount: 6 },
        { storeId: 3, recordedDate: '2026-08-08', intervalIndex: 5, footfallCount: 470, convertedCount: 341, dwellMinutes: 11.7, queueMinutes: 10.9, ageGroup: '23-35 yo', femaleCount: 12, maleCount: 6 },

        { storeId: 2, recordedDate: '2026-08-08', intervalIndex: 0, footfallCount: 140, convertedCount: 126, dwellMinutes: 15.4, queueMinutes: 11.5, ageGroup: '25-40 yo', femaleCount: 10, maleCount: 6 },
        { storeId: 2, recordedDate: '2026-08-08', intervalIndex: 1, footfallCount: 120, convertedCount: 105, dwellMinutes: 15.4, queueMinutes: 11.8, ageGroup: '25-40 yo', femaleCount: 8, maleCount: 6 },
        { storeId: 2, recordedDate: '2026-08-08', intervalIndex: 2, footfallCount: 185, convertedCount: 125, dwellMinutes: 15.4, queueMinutes: 12.1, ageGroup: '25-40 yo', femaleCount: 10, maleCount: 6 },
        { storeId: 2, recordedDate: '2026-08-08', intervalIndex: 3, footfallCount: 340, convertedCount: 315, dwellMinutes: 15.4, queueMinutes: 12.2, ageGroup: '25-40 yo', femaleCount: 9, maleCount: 6 },
        { storeId: 2, recordedDate: '2026-08-08', intervalIndex: 4, footfallCount: 251, convertedCount: 228, dwellMinutes: 15.4, queueMinutes: 11.6, ageGroup: '25-40 yo', femaleCount: 8, maleCount: 5 },
        { storeId: 2, recordedDate: '2026-08-08', intervalIndex: 5, footfallCount: 280, convertedCount: 251, dwellMinutes: 15.4, queueMinutes: 11.4, ageGroup: '25-40 yo', femaleCount: 7, maleCount: 5 },

        { storeId: 1, recordedDate: '2026-08-08', intervalIndex: 0, footfallCount: 90, convertedCount: 15, dwellMinutes: 18.3, queueMinutes: 12.5, ageGroup: '18-29 yo', femaleCount: 6, maleCount: 4 },
        { storeId: 1, recordedDate: '2026-08-08', intervalIndex: 1, footfallCount: 80, convertedCount: 12, dwellMinutes: 18.3, queueMinutes: 12.8, ageGroup: '18-29 yo', femaleCount: 5, maleCount: 4 },
        { storeId: 1, recordedDate: '2026-08-08', intervalIndex: 2, footfallCount: 80, convertedCount: 5, dwellMinutes: 18.3, queueMinutes: 13.0, ageGroup: '18-29 yo', femaleCount: 5, maleCount: 4 },
        { storeId: 1, recordedDate: '2026-08-08', intervalIndex: 3, footfallCount: 180, convertedCount: 25, dwellMinutes: 18.3, queueMinutes: 12.4, ageGroup: '18-29 yo', femaleCount: 5, maleCount: 4 },
        { storeId: 1, recordedDate: '2026-08-08', intervalIndex: 4, footfallCount: 149, convertedCount: 18, dwellMinutes: 18.3, queueMinutes: 12.1, ageGroup: '18-29 yo', femaleCount: 5, maleCount: 4 },
        { storeId: 1, recordedDate: '2026-08-08', intervalIndex: 5, footfallCount: 150, convertedCount: 15, dwellMinutes: 18.3, queueMinutes: 12.0, ageGroup: '18-29 yo', femaleCount: 5, maleCount: 3 },
      ],
    });

    await postApi(apiKey, '/api/ingest/metrics', {
      storeId: 3,
      inStoreNow: 120,
      staffOnFloor: 8,
      customerWaiting: 23,
      rankDelta: 2,
      signalStrength: 'High',
    });
    await postApi(apiKey, '/api/ingest/metrics', {
      storeId: 2,
      inStoreNow: 86,
      staffOnFloor: 6,
      customerWaiting: 14,
      rankDelta: 1,
      signalStrength: 'High',
    });
    await postApi(apiKey, '/api/ingest/metrics', {
      storeId: 1,
      inStoreNow: 54,
      staffOnFloor: 3,
      customerWaiting: 19,
      rankDelta: -1,
      signalStrength: 'High',
    });

    await postApi(apiKey, '/api/ingest/alerts', {
      replaceExisting: true,
      attentionAlerts: [
        {
          storeId: 3,
          storeCode: 'Store 3',
          severity: 'Medium',
          title: 'Camera Offline',
          description:
            '3 devices suddenly down to offline at the same time, need to check th...',
          actionLabel: 'Check stream',
        },
        {
          storeId: 1,
          storeCode: 'Store 1',
          severity: 'Medium',
          title: 'Low conversion',
          description:
            'Amount footfall of today at store 1 just gained less than 20% of conv...',
          actionLabel: 'Review floor',
        },
        {
          storeId: 2,
          storeCode: 'Store 2',
          severity: 'Medium',
          title: 'Capacity',
          description:
            'Peak arrival rate across all sections requires additional floor support...',
          actionLabel: 'Monitor area',
        },
      ],
      zoneAlerts: [
        {
          storeId: 3,
          zone: 'Zone a',
          messagePrefix: 'Zone a is ',
          messageHighlight: 'understaffed',
          messageSuffix: ', need at least 2 staff',
          actionLabel: 'Sent alert',
          anchorX: 0.615,
          anchorY: 0.65,
        },
      ],
    });
    console.info('[DummyProducer] Seeded initial transactions, metrics, and alerts via API.');
  } catch (err) {
    console.warn(
      '[DummyProducer] Failed initial dashboard seed check:',
      err instanceof Error ? err.message : err
    );
  }
}

async function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = 1000) {
  if (pc.iceGatheringState === 'complete') return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      resolve();
    }, timeoutMs);
    pc.iceGatheringStateChange.subscribe((state) => {
      if (state === 'complete') {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function main() {
  // 1. Bind UDP RTP receiver socket fed by ffmpeg
  const udpSocket = dgram.createSocket('udp4');
  await new Promise<void>((resolve) => {
    udpSocket.bind(0, '127.0.0.1', () => resolve());
  });
  const rtpPort = udpSocket.address().port;

  const masterVideoTrack = new MediaStreamTrack({ kind: 'video' });
  let rtpPacketCount = 0;

  udpSocket.on('message', (msg) => {
    rtpPacketCount++;
    try {
      masterVideoTrack.writeRtp(msg);
    } catch {
      // ignore transient malformed RTP packets
    }
  });

  // 2. Spawn continuous ffmpeg VP8 RTP encoder from static store JPEG image
  let ffmpegProc: ChildProcessWithoutNullStreams | null = null;
  let shuttingDown = false;

  function startFfmpeg() {
    if (shuttingDown) return;
    ffmpegProc = spawn('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-re',
      '-loop',
      '1',
      '-framerate',
      String(FPS),
      '-i',
      IMAGE_PATH,
      '-vf',
      `scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT},format=yuv420p`,
      '-c:v',
      'libvpx',
      '-deadline',
      'realtime',
      '-cpu-used',
      '16',
      '-threads',
      '1',
      '-b:v',
      '600k',
      '-maxrate',
      '900k',
      '-bufsize',
      '1200k',
      '-g',
      String(FPS),
      '-keyint_min',
      String(FPS),
      '-error-resilient',
      '1',
      '-an',
      '-f',
      'rtp',
      `rtp://127.0.0.1:${rtpPort}?pkt_size=1200`,
    ]);

    ffmpegProc.stderr.on('data', (chunk) => {
      const msg = chunk.toString().trim();
      if (msg) {
        console.warn(`[ffmpeg] ${msg}`);
      }
    });

    ffmpegProc.on('exit', (code) => {
      if (!shuttingDown) {
        console.warn(`[ffmpeg] exited with code ${code}; restarting in 1s...`);
        setTimeout(startFfmpeg, 1000);
      }
    });
  }

  startFfmpeg();
  console.info(
    `[DummyProducer] Streaming ${path.relative(process.cwd(), IMAGE_PATH)} (${VIDEO_WIDTH}x${VIDEO_HEIGHT} VP8 @ ${FPS}fps) -> udp://127.0.0.1:${rtpPort}`
  );

  // Read JPEG frame buffer for HTTP/MJPEG live stream relay (used when Cloud Run firewall blocks UDP ICE)
  const jpegFrameBuffer = fs.readFileSync(IMAGE_PATH);

  // 3. Start standard WebRTC WHEP HTTP Server (+ HTTP MJPEG stream relay)
  const sessions = new Map<
    string,
    { pc: RTCPeerConnection; track: MediaStreamTrack }
  >();

  const whepServer = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, If-Match'
    );
    res.setHeader('Access-Control-Expose-Headers', 'Location');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (reqUrl.pathname === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          rtpPacketsReceived: rtpPacketCount,
          activePeers: sessions.size,
          image: path.basename(IMAGE_PATH),
        })
      );
      return;
    }

    if (reqUrl.pathname === '/dummy/frame.jpg' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Content-Length': jpegFrameBuffer.length,
        'Cache-Control': 'no-store',
      });
      res.end(jpegFrameBuffer);
      return;
    }

    if (reqUrl.pathname === '/dummy/stream' && req.method === 'GET') {
      const boundary = 'retailinsightframe';
      res.writeHead(200, {
        'Content-Type': `multipart/x-mixed-replace; boundary=${boundary}`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Connection: 'keep-alive',
      });

      const sendFrame = () => {
        if (res.writableEnded || res.destroyed) return;
        res.write(
          `--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpegFrameBuffer.length}\r\n\r\n`
        );
        res.write(jpegFrameBuffer);
        res.write('\r\n');
      };

      sendFrame();
      const timer = setInterval(sendFrame, Math.round(1000 / FPS));
      req.on('close', () => {
        clearInterval(timer);
      });
      return;
    }

    if (reqUrl.pathname === '/dummy/whep' && req.method === 'POST') {
      try {
        const offerSdp = await readRequestBody(req);
        if (!offerSdp.includes('m=')) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Invalid SDP offer');
          return;
        }

        const sessionId = crypto.randomUUID();
        const pc = new RTCPeerConnection({
          codecs: {
            video: [useVP8()],
            audio: [useOPUS()],
          },
          iceServers: [],
          iceUseDefaultStunServer: false,
          iceAdditionalHostAddresses: ['127.0.0.1'],
          iceUseIpv4: true,
          iceUseIpv6: false,
          iceUseTcp: true,
        });

        const viewerTrack = masterVideoTrack.clone();
        const mediaStream = new MediaStream([viewerTrack]);
        pc.addTrack(viewerTrack, mediaStream);

        sessions.set(sessionId, { pc, track: viewerTrack });

        const cleanupSession = () => {
          const entry = sessions.get(sessionId);
          if (!entry) return;
          sessions.delete(sessionId);
          entry.track.stop();
          entry.pc.close().catch(() => {});
        };

        pc.connectionStateChange.subscribe((state) => {
          if (state === 'failed' || state === 'closed' || state === 'disconnected') {
            if (state === 'failed' || state === 'closed') {
              cleanupSession();
            }
          }
        });

        await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await waitForIceGathering(pc, 900);

        const localSdp = pc.localDescription?.sdp || answer.sdp;
        res.writeHead(201, {
          'Content-Type': 'application/sdp',
          Location: `/dummy/whep/${sessionId}`,
        });
        res.end(localSdp);
        console.info(`[WHEP] Peer connected (${sessionId}), active peers: ${sessions.size}`);
      } catch (err) {
        console.error('[WHEP POST error]', err);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(err instanceof Error ? err.message : 'WHEP negotiation failed');
      }
      return;
    }

    if (reqUrl.pathname.startsWith('/dummy/whep/')) {
      const sessionId = reqUrl.pathname.slice('/dummy/whep/'.length);
      const entry = sessions.get(sessionId);
      if (!entry) {
        res.writeHead(404);
        res.end('Session not found');
        return;
      }

      if (req.method === 'DELETE') {
        sessions.delete(sessionId);
        entry.track.stop();
        await entry.pc.close().catch(() => {});
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.method === 'PATCH') {
        await readRequestBody(req);
        res.writeHead(204);
        res.end();
        return;
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  await new Promise<void>((resolve) => {
    whepServer.listen(WHEP_PORT, WHEP_HOST, () => resolve());
  });

  console.info(
    `[WHEP] WebRTC streaming provider ready at http://localhost:${WHEP_PORT}/dummy/whep (proxied via ${APP_BASE_URL}/api/webrtc/dummy/whep)`
  );

  // 4. Push realistic YOLO detection frames + pose keypoints into /api/detections/ingest
  const apiKey = await resolveIngestApiKey();
  if (!apiKey) {
    console.warn(
      '[DummyProducer] No INGEST_API_KEY or ADMIN_PASSCODE available. WebRTC video is live, but YOLO detection API injection is paused. Pass --api-key=<KEY> or --admin-password=<PASS>.'
    );
  } else {
    await maybeSeedDashboardIfEmpty(apiKey);

    let tick = 0;
    const pushFrame = async () => {
      try {
        const frame = buildRealisticYoloFrame(tick++);
        await postApi(apiKey, '/api/detections/ingest', frame);
      } catch (err) {
        console.warn(
          '[DummyProducer] YOLO ingest error:',
          err instanceof Error ? err.message : err
        );
      }
    };

    await pushFrame();
    console.info(
      `[DummyProducer] Injecting ${TEMPLATE_DETECTIONS.length} real-mapped YOLO bboxes & pose skeletons to ${APP_BASE_URL}/api/detections/ingest every ${DETECTION_INTERVAL_MS}ms`
    );
    setInterval(pushFrame, DETECTION_INTERVAL_MS);
  }

  const shutdown = async () => {
    shuttingDown = true;
    console.info('\n[DummyProducer] Shutting down...');
    ffmpegProc?.kill('SIGTERM');
    for (const [id, entry] of sessions.entries()) {
      entry.track.stop();
      await entry.pc.close().catch(() => {});
      sessions.delete(id);
    }
    udpSocket.close();
    whepServer.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[DummyProducer fatal]', err);
  process.exit(1);
});
