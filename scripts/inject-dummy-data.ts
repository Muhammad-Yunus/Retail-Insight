import 'dotenv/config';

const BASE_URL = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

const API_KEY = parseArg('api-key') || process.env.INGEST_API_KEY || '';
const LOOP_MODE = process.argv.includes('--loop');

if (!API_KEY) {
  console.error(
    'Missing INGEST_API_KEY. Pass --api-key=<KEY> or set INGEST_API_KEY in environment.'
  );
  process.exit(1);
}

async function postApi<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`${path} failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data as T;
}

function buildYoloFrame(storeId: number, cameraId: string, phase: number) {
  const now = new Date();
  const frameTimestamp = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(
    now.getDate()
  ).padStart(2, '0')}/${now.getFullYear()}   ${now.toTimeString().slice(0, 8)}`;

  const dx = Math.sin(phase) * 0.012;
  const dy = Math.cos(phase * 0.8) * 0.006;

  return {
    storeId,
    cameraId,
    frameTimestamp,
    imageWidth: 1280,
    imageHeight: 720,
    sourceEngine: 'yolo-v8x-pose-external',
    detections: [
      {
        id: 'det-person-1',
        label: 'person',
        confidence: 90.4,
        bbox: [0.185 + dx, 0.45 + dy, 0.085, 0.31],
        color: 'blue',
        keypoints: [
          { x: 0.225 + dx, y: 0.485 + dy, score: 0.96 },
          { x: 0.226 + dx, y: 0.54 + dy, score: 0.95 },
          { x: 0.208 + dx, y: 0.56 + dy, score: 0.91 },
          { x: 0.244 + dx, y: 0.56 + dy, score: 0.92 },
          { x: 0.203 + dx, y: 0.625 + dy, score: 0.88 },
          { x: 0.248 + dx, y: 0.62 + dy, score: 0.89 },
          { x: 0.225 + dx, y: 0.635 + dy, score: 0.94 },
          { x: 0.214 + dx, y: 0.705 + dy, score: 0.90 },
          { x: 0.238 + dx, y: 0.705 + dy, score: 0.91 },
          { x: 0.212 + dx, y: 0.748 + dy, score: 0.87 },
          { x: 0.24 + dx, y: 0.748 + dy, score: 0.86 },
        ],
      },
      {
        id: 'det-person-2',
        label: 'person',
        confidence: 84.7,
        bbox: [0.472 - dx * 0.7, 0.27, 0.088, 0.24],
        color: 'blue',
        keypoints: [
          { x: 0.515 - dx * 0.7, y: 0.305, score: 0.93 },
          { x: 0.516 - dx * 0.7, y: 0.35, score: 0.92 },
          { x: 0.495 - dx * 0.7, y: 0.365, score: 0.88 },
          { x: 0.535 - dx * 0.7, y: 0.365, score: 0.89 },
          { x: 0.492 - dx * 0.7, y: 0.42, score: 0.85 },
          { x: 0.538 - dx * 0.7, y: 0.42, score: 0.86 },
          { x: 0.516 - dx * 0.7, y: 0.44, score: 0.90 },
          { x: 0.506 - dx * 0.7, y: 0.495, score: 0.87 },
          { x: 0.526 - dx * 0.7, y: 0.495, score: 0.88 },
        ],
      },
      {
        id: 'det-person-3',
        label: 'person',
        confidence: 82.3,
        bbox: [0.688, 0.08 + dy * 0.6, 0.092, 0.27],
        color: 'blue',
        keypoints: [
          { x: 0.734, y: 0.115 + dy * 0.6, score: 0.91 },
          { x: 0.734, y: 0.165 + dy * 0.6, score: 0.90 },
          { x: 0.712, y: 0.18 + dy * 0.6, score: 0.86 },
          { x: 0.756, y: 0.18 + dy * 0.6, score: 0.87 },
          { x: 0.708, y: 0.245 + dy * 0.6, score: 0.84 },
          { x: 0.76, y: 0.245 + dy * 0.6, score: 0.85 },
          { x: 0.734, y: 0.26 + dy * 0.6, score: 0.89 },
          { x: 0.722, y: 0.325 + dy * 0.6, score: 0.85 },
          { x: 0.746, y: 0.325 + dy * 0.6, score: 0.86 },
        ],
      },
      {
        id: 'det-person-4',
        label: 'person',
        confidence: 91.0,
        bbox: [0.752 + dx * 0.5, 0.37, 0.09, 0.3],
        color: 'blue',
        keypoints: [
          { x: 0.796 + dx * 0.5, y: 0.405, score: 0.95 },
          { x: 0.796 + dx * 0.5, y: 0.455, score: 0.94 },
          { x: 0.774 + dx * 0.5, y: 0.47, score: 0.90 },
          { x: 0.818 + dx * 0.5, y: 0.47, score: 0.91 },
          { x: 0.772 + dx * 0.5, y: 0.535, score: 0.88 },
          { x: 0.82 + dx * 0.5, y: 0.535, score: 0.89 },
          { x: 0.796 + dx * 0.5, y: 0.555, score: 0.93 },
          { x: 0.784 + dx * 0.5, y: 0.62, score: 0.90 },
          { x: 0.808 + dx * 0.5, y: 0.62, score: 0.91 },
          { x: 0.782 + dx * 0.5, y: 0.658, score: 0.87 },
          { x: 0.81 + dx * 0.5, y: 0.658, score: 0.88 },
        ],
      },
      {
        id: 'det-person-5',
        label: 'person',
        confidence: 88.6,
        bbox: [0.048, 0.055 + dy * 0.5, 0.095, 0.28],
        color: 'blue',
        keypoints: [
          { x: 0.092, y: 0.09 + dy * 0.5, score: 0.92 },
          { x: 0.092, y: 0.145 + dy * 0.5, score: 0.91 },
          { x: 0.072, y: 0.16 + dy * 0.5, score: 0.88 },
          { x: 0.112, y: 0.16 + dy * 0.5, score: 0.89 },
          { x: 0.068, y: 0.225 + dy * 0.5, score: 0.86 },
          { x: 0.116, y: 0.225 + dy * 0.5, score: 0.85 },
          { x: 0.092, y: 0.245 + dy * 0.5, score: 0.89 },
          { x: 0.082, y: 0.305 + dy * 0.5, score: 0.87 },
          { x: 0.104, y: 0.305 + dy * 0.5, score: 0.87 },
        ],
      },
      {
        id: 'det-trouser-1',
        label: 'trouser',
        confidence: 93.2,
        bbox: [0.335, 0.065, 0.115, 0.2],
        color: 'green',
      },
      {
        id: 'det-trouser-2',
        label: 'trouser',
        confidence: 91.4,
        bbox: [0.895, 0.155, 0.1, 0.17],
        color: 'green',
      },
      {
        id: 'det-cloth-1',
        label: 'cloth',
        confidence: 92.7,
        bbox: [0.39, 0.65, 0.155, 0.22],
        color: 'purple',
      },
      {
        id: 'det-cloth-2',
        label: '94.1%',
        confidence: 94.1,
        bbox: [0.005, 0.6, 0.11, 0.22],
        color: 'purple',
      },
    ],
  };
}

async function injectInitialBatch() {
  console.info(`[Inject] Target API: ${BASE_URL}`);

  // 1. Inject Yesterday + Today transactional records (aggregated in PostgreSQL)
  const transactions = [
    // Yesterday baseline (2026-08-07) -> total 3,894 footfall (so today 4,293 = +10.25%)
    { storeId: 3, recordedDate: '2026-08-07', intervalIndex: 0, footfallCount: 1980, convertedCount: 1490, dwellMinutes: 11.4, queueMinutes: 10.8, ageGroup: '23-35 yo', femaleCount: 1180, maleCount: 800 },
    { storeId: 2, recordedDate: '2026-08-07', intervalIndex: 1, footfallCount: 1240, convertedCount: 790, dwellMinutes: 14.9, queueMinutes: 11.2, ageGroup: '25-40 yo', femaleCount: 740, maleCount: 500 },
    { storeId: 1, recordedDate: '2026-08-07', intervalIndex: 2, footfallCount: 674, convertedCount: 84, dwellMinutes: 17.5, queueMinutes: 13.0, ageGroup: '18-29 yo', femaleCount: 380, maleCount: 294 },

    // Today (2026-08-08) across 6 intervals & 3 stores -> aggregated total = 4,293 footfall
    // Store 3 Westfield (total 2,248 footfall, 1,758 converted = 78.2%, avg dwell 11.7m, female 80 / male 40 ratio)
    { storeId: 3, recordedDate: '2026-08-08', intervalIndex: 0, footfallCount: 290, convertedCount: 252, dwellMinutes: 11.7, queueMinutes: 10.5, ageGroup: '23-35 yo', femaleCount: 14, maleCount: 7 },
    { storeId: 3, recordedDate: '2026-08-08', intervalIndex: 1, footfallCount: 220, convertedCount: 176, dwellMinutes: 11.7, queueMinutes: 10.8, ageGroup: '23-35 yo', femaleCount: 12, maleCount: 6 },
    { storeId: 3, recordedDate: '2026-08-08', intervalIndex: 2, footfallCount: 330, convertedCount: 257, dwellMinutes: 11.7, queueMinutes: 11.1, ageGroup: '23-35 yo', femaleCount: 16, maleCount: 8 },
    { storeId: 3, recordedDate: '2026-08-08', intervalIndex: 3, footfallCount: 520, convertedCount: 428, dwellMinutes: 11.7, queueMinutes: 11.4, ageGroup: '23-35 yo', femaleCount: 14, maleCount: 7 },
    { storeId: 3, recordedDate: '2026-08-08', intervalIndex: 4, footfallCount: 418, convertedCount: 304, dwellMinutes: 11.7, queueMinutes: 11.0, ageGroup: '23-35 yo', femaleCount: 12, maleCount: 6 },
    { storeId: 3, recordedDate: '2026-08-08', intervalIndex: 5, footfallCount: 470, convertedCount: 341, dwellMinutes: 11.7, queueMinutes: 10.9, ageGroup: '23-35 yo', femaleCount: 12, maleCount: 6 },

    // Store 2 Riverside (total 1,316 footfall -> wait: 2248 + 1316 + 729 = 4293, conversion 65.2%)
    { storeId: 2, recordedDate: '2026-08-08', intervalIndex: 0, footfallCount: 140, convertedCount: 126, dwellMinutes: 15.4, queueMinutes: 11.5, ageGroup: '25-40 yo', femaleCount: 10, maleCount: 6 },
    { storeId: 2, recordedDate: '2026-08-08', intervalIndex: 1, footfallCount: 120, convertedCount: 105, dwellMinutes: 15.4, queueMinutes: 11.8, ageGroup: '25-40 yo', femaleCount: 8, maleCount: 6 },
    { storeId: 2, recordedDate: '2026-08-08', intervalIndex: 2, footfallCount: 185, convertedCount: 125, dwellMinutes: 15.4, queueMinutes: 12.1, ageGroup: '25-40 yo', femaleCount: 10, maleCount: 6 },
    { storeId: 2, recordedDate: '2026-08-08', intervalIndex: 3, footfallCount: 340, convertedCount: 315, dwellMinutes: 15.4, queueMinutes: 12.2, ageGroup: '25-40 yo', femaleCount: 9, maleCount: 6 },
    { storeId: 2, recordedDate: '2026-08-08', intervalIndex: 4, footfallCount: 251, convertedCount: 228, dwellMinutes: 15.4, queueMinutes: 11.6, ageGroup: '25-40 yo', femaleCount: 8, maleCount: 5 },
    { storeId: 2, recordedDate: '2026-08-08', intervalIndex: 5, footfallCount: 280, convertedCount: 251, dwellMinutes: 15.4, queueMinutes: 11.4, ageGroup: '25-40 yo', femaleCount: 7, maleCount: 5 },

    // Store 1 Downtown (total 729 footfall, 90 converted = 12.4%, avg dwell 18.3m)
    { storeId: 1, recordedDate: '2026-08-08', intervalIndex: 0, footfallCount: 90, convertedCount: 15, dwellMinutes: 18.3, queueMinutes: 12.5, ageGroup: '18-29 yo', femaleCount: 6, maleCount: 4 },
    { storeId: 1, recordedDate: '2026-08-08', intervalIndex: 1, footfallCount: 80, convertedCount: 12, dwellMinutes: 18.3, queueMinutes: 12.8, ageGroup: '18-29 yo', femaleCount: 5, maleCount: 4 },
    { storeId: 1, recordedDate: '2026-08-08', intervalIndex: 2, footfallCount: 80, convertedCount: 5, dwellMinutes: 18.3, queueMinutes: 13.0, ageGroup: '18-29 yo', femaleCount: 5, maleCount: 4 },
    { storeId: 1, recordedDate: '2026-08-08', intervalIndex: 3, footfallCount: 180, convertedCount: 25, dwellMinutes: 18.3, queueMinutes: 12.4, ageGroup: '18-29 yo', femaleCount: 5, maleCount: 4 },
    { storeId: 1, recordedDate: '2026-08-08', intervalIndex: 4, footfallCount: 149, convertedCount: 18, dwellMinutes: 18.3, queueMinutes: 12.1, ageGroup: '18-29 yo', femaleCount: 5, maleCount: 4 },
    { storeId: 1, recordedDate: '2026-08-08', intervalIndex: 5, footfallCount: 150, convertedCount: 15, dwellMinutes: 18.3, queueMinutes: 12.0, ageGroup: '18-29 yo', femaleCount: 5, maleCount: 3 },
  ];

  const txRes = await postApi<{ ok: boolean; inserted: number }>('/api/ingest/transactions', {
    replaceExistingForDates: true,
    transactions,
  });
  console.info(`[Inject] /api/ingest/transactions -> inserted ${txRes.inserted} rows`);

  // 2. Update floor occupancy metrics via API
  await postApi('/api/ingest/metrics', {
    storeId: 3,
    inStoreNow: 120,
    staffOnFloor: 8,
    customerWaiting: 23,
    rankDelta: 2,
    signalStrength: 'High',
  });
  await postApi('/api/ingest/metrics', {
    storeId: 2,
    inStoreNow: 86,
    staffOnFloor: 6,
    customerWaiting: 14,
    rankDelta: 1,
    signalStrength: 'High',
  });
  await postApi('/api/ingest/metrics', {
    storeId: 1,
    inStoreNow: 54,
    staffOnFloor: 3,
    customerWaiting: 19,
    rankDelta: -1,
    signalStrength: 'High',
  });
  console.info('[Inject] /api/ingest/metrics -> updated 3 stores');

  // 3. Inject Alerts via API
  await postApi('/api/ingest/alerts', {
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
  console.info('[Inject] /api/ingest/alerts -> updated attention & zone alerts');

  // 4. Inject YOLO Object Detection + Pose Estimation frames via API
  await postApi('/api/detections/ingest', buildYoloFrame(3, 'CAM-WF-01', 0));
  await postApi('/api/detections/ingest', buildYoloFrame(2, 'CAM-RS-02', 0.5));
  await postApi('/api/detections/ingest', buildYoloFrame(1, 'CAM-DT-01', 1.0));
  console.info('[Inject] /api/detections/ingest -> pushed YOLO frames with pose keypoints');
}

async function run() {
  await injectInitialBatch();

  if (LOOP_MODE) {
    console.info('[Inject] Running continuous YOLO & transaction stream (--loop)...');
    let tick = 1;
    setInterval(async () => {
      try {
        const phase = tick * 0.4;
        await postApi('/api/detections/ingest', buildYoloFrame(3, 'CAM-WF-01', phase));
        if (tick % 3 === 0) {
          await postApi('/api/ingest/transactions', {
            transactions: [
              {
                storeId: 3,
                recordedDate: '2026-08-08',
                intervalIndex: 2,
                footfallCount: 1,
                convertedCount: tick % 2 === 0 ? 1 : 0,
                dwellMinutes: 11.7,
                queueMinutes: 11.2,
                ageGroup: '23-35 yo',
                femaleCount: tick % 2 === 0 ? 1 : 0,
                maleCount: tick % 2 === 0 ? 0 : 1,
              },
            ],
          });
        }
        tick++;
      } catch (err) {
        console.error('[Inject loop error]', err instanceof Error ? err.message : err);
      }
    }, 2000);
  }
}

run().catch((err) => {
  console.error('[Inject failed]', err);
  process.exit(1);
});
