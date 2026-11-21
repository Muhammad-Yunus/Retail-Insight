import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import { initDatabase, isPostgresActive, repository } from './src/db/repository.ts';
import {
  extractBearerToken,
  generateApiKey,
  hashPassword,
  requireApiKey,
  requireUserAuth,
  signToken,
  verifyPassword,
  verifyToken,
  type AuthenticatedRequest,
} from './src/server/auth.ts';
import type { DetectionBox, DetectionFrame } from './src/types/retail.ts';

const PORT = Number(process.env.PORT || 3000);

const bootstrapSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(80),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

const streamConfigSchema = z.object({
  streamType: z.enum(['webrtc_public', 'webrtc_whep', 'hls', 'mp4', 'webrtc_demo']),
  streamUrl: z.string().min(1).max(1000).refine((val) => {
    const lower = val.trim().toLowerCase();
    return (
      lower.startsWith('http://') ||
      lower.startsWith('https://') ||
      lower.startsWith('webrtc://') ||
      lower.startsWith('/api/webrtc/')
    );
  }, 'Stream URL must use http://, https://, webrtc://, or /api/webrtc/'),
  cameraLocation: z.string().min(1).max(100).optional(),
  cameraModel: z.string().min(1).max(40).optional(),
});

const ingestMetricsSchema = z.object({
  storeId: z.number().int().positive(),
  inStoreNow: z.number().int().nonnegative().optional(),
  staffOnFloor: z.number().int().nonnegative().optional(),
  customerWaiting: z.number().int().nonnegative().optional(),
  rankDelta: z.number().int().min(-20).max(20).optional(),
  signalStrength: z.string().min(1).max(20).optional(),
  status: z.enum(['Good', 'Critical']).optional(),
});

const ingestTransactionsSchema = z.object({
  replaceExistingForDates: z.boolean().optional().default(false),
  transactions: z
    .array(
      z.object({
        storeId: z.number().int().positive(),
        recordedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        intervalIndex: z.number().int().min(0).max(5),
        footfallCount: z.number().int().nonnegative().default(1),
        convertedCount: z.number().int().nonnegative().default(0),
        dwellMinutes: z.number().min(0).max(300),
        queueMinutes: z.number().min(0).max(180),
        ageGroup: z.string().min(1).max(30),
        femaleCount: z.number().int().nonnegative().default(0),
        maleCount: z.number().int().nonnegative().default(0),
      })
    )
    .min(1)
    .max(500),
});

const ingestAlertsSchema = z.object({
  replaceExisting: z.boolean().optional().default(false),
  attentionAlerts: z
    .array(
      z.object({
        storeId: z.number().int().positive(),
        storeCode: z.string().min(1).max(40),
        severity: z.enum(['Medium', 'High', 'Critical']),
        title: z.string().min(1).max(80),
        description: z.string().min(1).max(240),
        actionLabel: z.string().min(1).max(40),
      })
    )
    .optional(),
  zoneAlerts: z
    .array(
      z.object({
        storeId: z.number().int().positive(),
        zone: z.string().min(1).max(40),
        messagePrefix: z.string().max(80),
        messageHighlight: z.string().max(40),
        messageSuffix: z.string().max(80),
        actionLabel: z.string().min(1).max(40),
        anchorX: z.number().min(0).max(1),
        anchorY: z.number().min(0).max(1),
      })
    )
    .optional(),
});

const detectionIngestSchema = z.object({
  storeId: z.number().int().positive(),
  cameraId: z.string().min(1).max(60).optional(),
  frameTimestamp: z.string().min(1).max(60).optional(),
  imageWidth: z.number().int().positive().default(1280),
  imageHeight: z.number().int().positive().default(720),
  sourceEngine: z.string().min(1).max(80).default('yolo-external-engine'),
  detections: z
    .array(
      z.object({
        id: z.string().max(80).optional(),
        label: z.string().min(1).max(60),
        confidence: z.number().min(0).max(100),
        bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
        color: z.enum(['blue', 'green', 'purple', 'amber']).optional(),
        keypoints: z
          .array(
            z.object({
              x: z.number(),
              y: z.number(),
              score: z.number().optional(),
            })
          )
          .optional(),
      })
    )
    .max(200),
});

function normalizeDetectionFrame(
  parsed: z.infer<typeof detectionIngestSchema>
): DetectionFrame {
  const { imageWidth, imageHeight } = parsed;
  const normalizedDetections: DetectionBox[] = parsed.detections.map((d, idx) => {
    const [bx, by, bw, bh] = d.bbox;
    const isPixelCoords = bx > 1 || by > 1 || bw > 1 || bh > 1;
    const normBbox: [number, number, number, number] = isPixelCoords
      ? [
          Math.max(0, Math.min(1, bx / imageWidth)),
          Math.max(0, Math.min(1, by / imageHeight)),
          Math.max(0, Math.min(1, bw / imageWidth)),
          Math.max(0, Math.min(1, bh / imageHeight)),
        ]
      : [
          Math.max(0, Math.min(1, bx)),
          Math.max(0, Math.min(1, by)),
          Math.max(0, Math.min(1, bw)),
          Math.max(0, Math.min(1, bh)),
        ];

    const normalizedConf = d.confidence > 1 ? d.confidence / 100 : d.confidence;
    const labelLower = d.label.toLowerCase();
    const inferredColor =
      d.color ??
      (labelLower.includes('trouser') || labelLower.includes('pant')
        ? 'green'
        : labelLower.includes('cloth') || labelLower.includes('shirt')
          ? 'purple'
          : 'blue');

    const normKeypoints = d.keypoints?.map((kp) => ({
      x: kp.x > 1 ? kp.x / imageWidth : kp.x,
      y: kp.y > 1 ? kp.y / imageHeight : kp.y,
      score: kp.score,
    }));

    return {
      id: d.id || `det-${Date.now()}-${idx}`,
      label: d.label,
      confidence: Number(normalizedConf.toFixed(3)),
      bbox: normBbox,
      color: inferredColor,
      keypoints: normKeypoints,
    };
  });

  const now = new Date();
  const defaultTs = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(
    now.getDate()
  ).padStart(2, '0')}/${now.getFullYear()}   ${now.toTimeString().slice(0, 8)}`;

  return {
    storeId: parsed.storeId,
    cameraId: parsed.cameraId || 'CAM-EXT-01',
    frameTimestamp: parsed.frameTimestamp || defaultTs,
    imageWidth,
    imageHeight,
    sourceEngine: parsed.sourceEngine,
    detections: normalizedDetections,
  };
}

async function startServer() {
  await initDatabase();

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  const clients = new Map<WebSocket, { storeId: number }>();

  function broadcastEvent(type: string, storeId: number, payload: unknown) {
    const message = JSON.stringify({ type, storeId, payload });
    for (const [ws, meta] of clients.entries()) {
      if (ws.readyState === WebSocket.OPEN && (meta.storeId === storeId || type === 'metrics:updated')) {
        ws.send(message);
      }
    }
  }

  wss.on('connection', async (ws, request) => {
    const reqUrl = new URL(request.url || '/ws', `http://${request.headers.host || 'localhost'}`);
    const initialStoreId = Number(reqUrl.searchParams.get('storeId')) || 3;
    clients.set(ws, { storeId: initialStoreId });

    try {
      const latest = await repository.getLatestDetections(initialStoreId);
      ws.send(JSON.stringify({ type: 'detections:frame', storeId: initialStoreId, payload: latest }));
    } catch {
      // ignore initial send error
    }

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type?: string; storeId?: number };
        if (msg.type === 'subscribe' && typeof msg.storeId === 'number') {
          clients.set(ws, { storeId: msg.storeId });
          const latest = await repository.getLatestDetections(msg.storeId);
          ws.send(
            JSON.stringify({ type: 'detections:frame', storeId: msg.storeId, payload: latest })
          );
        }
      } catch {
        // ignore malformed client messages
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
    });
  });

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(
      request.url || '/',
      `http://${request.headers.host || 'localhost'}`
    ).pathname;
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else if (process.env.NODE_ENV === 'production') {
      socket.destroy();
    }
  });

  // --- AUTH ROUTES ---
  app.get('/api/auth/status', async (req, res) => {
    const userCount = await repository.countUsers();
    const token = extractBearerToken(req);
    const verified = token ? verifyToken(token) : null;
    res.json({
      hasAdminUser: userCount > 0,
      hasEnvPasscode: Boolean(process.env.ADMIN_PASSCODE?.trim()),
      authenticated: Boolean(verified),
      user: verified,
      dbBackend: isPostgresActive() ? 'postgresql' : 'memory-fallback',
    });
  });

  app.post('/api/auth/bootstrap-admin', async (req, res) => {
    const parsed = bootstrapSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });
      return;
    }
    const existingCount = await repository.countUsers();
    if (existingCount > 0 || process.env.ADMIN_PASSCODE?.trim()) {
      res.status(409).json({
        error: 'Admin account is already initialized. Please sign in instead.',
      });
      return;
    }

    const user = await repository.createUser({
      email: parsed.data.email,
      name: parsed.data.name,
      role: 'admin',
      passwordHash: hashPassword(parsed.data.password),
    });
    const token = signToken(user);
    res.status(201).json({ token, user });
  });

  app.post('/api/auth/login', async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid email and password are required.' });
      return;
    }

    const envPasscode = process.env.ADMIN_PASSCODE?.trim();
    if (envPasscode) {
      const providedBuf = Buffer.from(parsed.data.password);
      const expectedBuf = Buffer.from(envPasscode);
      if (
        providedBuf.length === expectedBuf.length &&
        crypto.timingSafeEqual(providedBuf, expectedBuf)
      ) {
        const user = {
          id: 1,
          email: parsed.data.email.toLowerCase(),
          name: 'Riana davidson',
          role: 'admin' as const,
        };
        res.json({ token: signToken(user), user });
        return;
      }
    }

    const dbUser = await repository.findUserByEmail(parsed.data.email);
    if (!dbUser || !verifyPassword(parsed.data.password, dbUser.passwordHash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const authUser = {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
    };
    res.json({ token: signToken(authUser), user: authUser });
  });

  app.get('/api/auth/me', requireUserAuth, (req: AuthenticatedRequest, res) => {
    res.json({ user: req.user });
  });

  // --- DASHBOARD READ ROUTES ---
  app.get('/api/dashboard', async (req, res) => {
    const storeId = Number(req.query.storeId) || 3;
    const payload = await repository.getDashboardPayload(storeId);
    res.json(payload);
  });

  app.get('/api/stores', async (_req, res) => {
    const list = await repository.getStores();
    res.json({ stores: list });
  });

  // --- PROTECTED STREAM CONFIG & OPERATOR ACTIONS ---
  app.put(
    '/api/config/stream/:storeId',
    requireUserAuth,
    async (req: AuthenticatedRequest, res) => {
      const storeId = Number(req.params.storeId);
      if (!Number.isInteger(storeId) || storeId <= 0) {
        res.status(400).json({ error: 'Invalid storeId' });
        return;
      }
      const parsed = streamConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid config' });
        return;
      }

      const updated = await repository.updateStoreStreamConfig(storeId, parsed.data);
      if (!updated) {
        res.status(404).json({ error: 'Store not found' });
        return;
      }

      const dashboard = await repository.getDashboardPayload(storeId);
      broadcastEvent('metrics:updated', storeId, dashboard);
      res.json({ store: updated });
    }
  );

  app.post(
    '/api/alerts/:id/ack',
    requireUserAuth,
    async (req: AuthenticatedRequest, res) => {
      const alertId = Number(req.params.id);
      const updated = await repository.acknowledgeAlert(alertId);
      if (!updated) {
        res.status(404).json({ error: 'Alert not found' });
        return;
      }
      const dashboard = await repository.getDashboardPayload(updated.storeId);
      broadcastEvent('metrics:updated', updated.storeId, dashboard);
      res.json({ alert: updated });
    }
  );

  app.post('/api/zone-alert/ack', requireUserAuth, async (req, res) => {
    const storeId = Number(req.body?.storeId) || 3;
    await repository.acknowledgeZoneAlert(storeId);
    const dashboard = await repository.getDashboardPayload(storeId);
    broadcastEvent('metrics:updated', storeId, dashboard);
    res.json({ ok: true });
  });

  // --- API KEYS MANAGEMENT (PROTECTED) ---
  app.get('/api/api-keys', requireUserAuth, async (_req, res) => {
    const keys = await repository.listApiKeys();
    res.json({ apiKeys: keys });
  });

  app.post('/api/api-keys', requireUserAuth, async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      name: z.string().min(2).max(60),
      scopes: z.string().min(2).max(100).default('ingest,detections'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid API key request' });
      return;
    }

    const generated = generateApiKey();
    const saved = await repository.createApiKey({
      name: parsed.data.name,
      keyPrefix: generated.keyPrefix,
      keyHash: generated.keyHash,
      scopes: parsed.data.scopes,
      createdBy: req.user?.id ?? null,
    });

    res.status(201).json({
      apiKey: saved,
      plaintextKey: generated.rawKey,
    });
  });

  app.delete('/api/api-keys/:id', requireUserAuth, async (req, res) => {
    const id = Number(req.params.id);
    const ok = await repository.deleteApiKey(id);
    if (!ok) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }
    res.json({ deleted: true });
  });

  // --- EXTERNAL DATA INGESTION API (FLOOR METRICS) ---
  app.post('/api/ingest/metrics', requireApiKey, async (req, res) => {
    const parsed = ingestMetricsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid metrics payload' });
      return;
    }
    const updated = await repository.ingestStoreMetrics(parsed.data);
    if (!updated) {
      res.status(404).json({ error: 'Store not found' });
      return;
    }
    const dashboard = await repository.getDashboardPayload(updated.id);
    broadcastEvent('metrics:updated', updated.id, dashboard);
    res.json({ ok: true, store: updated });
  });

  // --- EXTERNAL DATA INGESTION API (FOOTFALL & POS TRANSACTIONS) ---
  app.post('/api/ingest/transactions', requireApiKey, async (req, res) => {
    const parsed = ingestTransactionsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid transactions payload',
      });
      return;
    }
    const inserted = await repository.ingestTransactions(
      parsed.data.transactions,
      parsed.data.replaceExistingForDates
    );
    const primaryStoreId = parsed.data.transactions[0]?.storeId ?? 3;
    const dashboard = await repository.getDashboardPayload(primaryStoreId);
    broadcastEvent('metrics:updated', primaryStoreId, dashboard);
    res.status(201).json({ ok: true, inserted });
  });

  // --- EXTERNAL DATA INGESTION API (ALERTS) ---
  app.post('/api/ingest/alerts', requireApiKey, async (req, res) => {
    const parsed = ingestAlertsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid alerts payload',
      });
      return;
    }
    await repository.ingestAlerts(parsed.data);
    const storeId =
      parsed.data.zoneAlerts?.[0]?.storeId ??
      parsed.data.attentionAlerts?.[0]?.storeId ??
      3;
    const dashboard = await repository.getDashboardPayload(storeId);
    broadcastEvent('metrics:updated', storeId, dashboard);
    res.status(201).json({ ok: true });
  });

  // --- EXTERNAL YOLO OBJECT DETECTION ENGINE RECEIVER API ---
  app.post('/api/detections/ingest', requireApiKey, async (req, res) => {
    const parsed = detectionIngestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid detection payload' });
      return;
    }
    const normalized = normalizeDetectionFrame(parsed.data);
    await repository.saveDetectionFrame(normalized);
    broadcastEvent('detections:frame', normalized.storeId, normalized);
    res.json({
      ok: true,
      storeId: normalized.storeId,
      detectionsCount: normalized.detections.length,
    });
  });

  // --- CSV EXPORT ---
  app.get('/api/export/csv', async (req, res) => {
    const storeId = Number(req.query.storeId) || 3;
    const data = await repository.getDashboardPayload(storeId);
    const lines = [
      'Store Code,Area,Footfall,Conversion %,Avg Dwell (min),Status,In Store Now,Staff On Floor,Waiting',
      ...data.stores.map(
        (s) =>
          `"${s.code}","${s.area}",${s.footfall},${s.conversionRate},${s.avgDwellMin},"${s.status}",${s.inStoreNow},${s.staffOnFloor},${s.customerWaiting}`
      ),
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="retail-insight-report.csv"');
    res.send(lines.join('\n'));
  });

  // --- DUMMY WEBRTC WHEP SIGNALING REVERSE PROXY (PORT 8889) ---
  const whepTextParser = express.text({
    type: ['application/sdp', 'application/trickle-ice-sdpfrag', 'text/plain'],
    limit: '1mb',
  });
  const whepUpstreamBase = (
    process.env.DUMMY_WHEP_UPSTREAM ||
    `http://127.0.0.1:${process.env.WHEP_PORT || 8889}/dummy/whep`
  ).replace(/\/$/, '');

  app.all(['/api/webrtc/dummy/whep', '/api/webrtc/dummy/whep/:sessionId'], whepTextParser, async (req, res) => {
    try {
      const targetUrl = req.params.sessionId
        ? `${whepUpstreamBase}/${encodeURIComponent(req.params.sessionId)}`
        : whepUpstreamBase;

      const upstreamRes = await fetch(targetUrl, {
        method: req.method,
        headers: {
          'Content-Type': req.get('content-type') || 'application/sdp',
        },
        body:
          req.method === 'POST' || req.method === 'PATCH'
            ? typeof req.body === 'string'
              ? req.body
              : ''
            : undefined,
      });

      const location = upstreamRes.headers.get('location');
      if (location) {
        res.setHeader(
          'Location',
          location.replace(/^\/dummy\/whep/, '/api/webrtc/dummy/whep')
        );
      }
      const contentType = upstreamRes.headers.get('content-type');
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }
      const payload = await upstreamRes.text();
      res.status(upstreamRes.status).send(payload);
    } catch {
      res
        .status(503)
        .type('text/plain')
        .send('Dummy WebRTC producer is not running. Start it with: npm run producer:dummy');
    }
  });

  // --- DUMMY WEBRTC HTTP STREAM RELAY PROXY (FOR CLOUD RUN / UDP-BLOCKED BROWSERS) ---
  const dummyProducerOrigin = (
    process.env.DUMMY_PRODUCER_ORIGIN ||
    `http://127.0.0.1:${process.env.WHEP_PORT || 8889}`
  ).replace(/\/$/, '');

  app.get('/api/webrtc/dummy/stream', (req, res) => {
    const upstreamUrl = new URL(`${dummyProducerOrigin}/dummy/stream`);
    const proxyReq = http.request(
      {
        hostname: upstreamUrl.hostname,
        port: Number(upstreamUrl.port || 80),
        path: upstreamUrl.pathname,
        method: 'GET',
      },
      (upstreamRes) => {
        res.status(upstreamRes.statusCode || 200);
        if (upstreamRes.headers['content-type']) {
          res.setHeader('Content-Type', upstreamRes.headers['content-type']);
        }
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        upstreamRes.pipe(res);
      }
    );
    proxyReq.on('error', () => {
      if (!res.headersSent) {
        res.status(503).type('text/plain').send('Dummy producer stream unavailable');
      }
    });
    req.on('close', () => {
      proxyReq.destroy();
    });
    proxyReq.end();
  });

  app.get('/api/webrtc/dummy/frame.jpg', async (_req, res) => {
    try {
      const upstream = await fetch(`${dummyProducerOrigin}/dummy/frame.jpg`);
      if (!upstream.ok) {
        res.status(upstream.status).end();
        return;
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'no-store');
      res.send(buf);
    } catch {
      res.status(503).end();
    }
  });

  // --- VITE / STATIC FRONTEND ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  let producerProc: ChildProcess | null = null;
  const stopProducer = () => {
    if (producerProc && !producerProc.killed) {
      producerProc.kill('SIGTERM');
      producerProc = null;
    }
  };
  process.on('SIGINT', () => {
    stopProducer();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    stopProducer();
    process.exit(0);
  });
  process.on('exit', stopProducer);

  server.listen(PORT, '0.0.0.0', async () => {
    console.info(`Retail Insight server listening on http://0.0.0.0:${PORT}`);

    if (process.env.AUTO_START_DUMMY_PRODUCER !== 'false') {
      try {
        let producerKey = process.env.INGEST_API_KEY?.trim() || '';
        if (!producerKey) {
          const generated = generateApiKey();
          await repository.createApiKey({
            name: 'dummy-webrtc-producer-auto',
            keyPrefix: generated.keyPrefix,
            keyHash: generated.keyHash,
            scopes: 'ingest,detections',
            createdBy: null,
          });
          producerKey = generated.rawKey;
        }

        const tsxCli = path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs');
        const producerScript = path.resolve(
          process.cwd(),
          'scripts/dummy-webrtc-producer.ts'
        );
        producerProc = spawn(
          process.execPath,
          [tsxCli, producerScript, '--seed-metrics'],
          {
            env: {
              ...process.env,
              APP_BASE_URL: `http://127.0.0.1:${PORT}`,
              INGEST_API_KEY: producerKey,
            },
            stdio: 'inherit',
          }
        );
        producerProc.on('exit', (code) => {
          if (code !== null && code !== 0) {
            console.warn(`[DummyProducer] exited with code ${code}`);
          }
          producerProc = null;
        });
      } catch (err) {
        console.warn(
          '[DummyProducer] Failed to auto-start:',
          err instanceof Error ? err.message : err
        );
      }
    }
  });
}

startServer().catch((err) => {
  console.error('Failed to start Retail Insight server:', err);
  process.exit(1);
});
