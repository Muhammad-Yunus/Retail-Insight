import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { Pool } from 'pg';
import * as schema from './schema.ts';
import type {
  ApiKeySummary,
  AttentionAlertRecord,
  AuthUser,
  DashboardPayload,
  DetectionFrame,
  HourlyIntervalRecord,
  StaffingMetricsRecord,
  StoreRecord,
  StreamType,
  ZoneOverlayAlert,
} from '../types/retail.ts';

type DB = NodePgDatabase<typeof schema>;

let pool: Pool | null = null;
let db: DB | null = null;
let usingPostgres = false;

export interface IngestTransactionInput {
  storeId: number;
  recordedDate: string;
  intervalIndex: number;
  footfallCount: number;
  convertedCount: number;
  dwellMinutes: number;
  queueMinutes: number;
  ageGroup: string;
  femaleCount: number;
  maleCount: number;
}

export interface IngestAlertInput {
  storeId: number;
  storeCode: string;
  severity: 'Medium' | 'High' | 'Critical';
  title: string;
  description: string;
  actionLabel: string;
}

export interface IngestZoneAlertInput {
  storeId: number;
  zone: string;
  messagePrefix: string;
  messageHighlight: string;
  messageSuffix: string;
  actionLabel: string;
  anchorX: number;
  anchorY: number;
}

const INTERVAL_META: Array<{ label: string; rangeLabel: string }> = [
  { label: '09:00', rangeLabel: '09:00 to 12:00' },
  { label: '12:00', rangeLabel: '12:00 to 15:00' },
  { label: '15:00', rangeLabel: '15:00 to 18:00' },
  { label: '18:00', rangeLabel: '18:00 to 21:00' },
  { label: '21:00', rangeLabel: '21:00 to 24:00' },
  { label: '24:00', rangeLabel: '24:00 close' },
];

const STORE_MASTER_DEFAULTS: Array<
  Pick<
    StoreRecord,
    | 'id'
    | 'code'
    | 'name'
    | 'area'
    | 'cameraId'
    | 'cameraLocation'
    | 'cameraModel'
    | 'signalStrength'
    | 'streamType'
    | 'streamUrl'
    | 'staffOnFloor'
  >
> = [
  {
    id: 3,
    code: 'Store 3',
    name: 'Westfield',
    area: 'Westfield',
    cameraId: 'CAM-WF-01',
    cameraLocation: 'Front Entrance',
    cameraModel: 'C01FE',
    signalStrength: 'High',
    streamType: 'webrtc_whep',
    streamUrl: '/api/webrtc/dummy/whep',
    staffOnFloor: 8,
  },
  {
    id: 2,
    code: 'Store 2',
    name: 'Riverside',
    area: 'Riverside',
    cameraId: 'CAM-RS-02',
    cameraLocation: 'Main Atrium',
    cameraModel: 'C02MA',
    signalStrength: 'High',
    streamType: 'webrtc_whep',
    streamUrl: '/api/webrtc/dummy/whep',
    staffOnFloor: 6,
  },
  {
    id: 1,
    code: 'Store 1',
    name: 'Downtown',
    area: 'Downtown',
    cameraId: 'CAM-DT-01',
    cameraLocation: 'Checkout Lane B',
    cameraModel: 'C01CB',
    signalStrength: 'High',
    streamType: 'webrtc_whep',
    streamUrl: '/api/webrtc/dummy/whep',
    staffOnFloor: 3,
  },
];

// In-memory mirror used only when Postgres connection is not configured or unreachable
const memoryState = {
  users: [] as Array<{
    id: number;
    email: string;
    name: string;
    role: 'admin' | 'operator';
    passwordHash: string;
    createdAt: Date;
  }>,
  apiKeys: [] as Array<{
    id: number;
    name: string;
    keyPrefix: string;
    keyHash: string;
    scopes: string;
    createdBy: number | null;
    lastUsedAt: Date | null;
    createdAt: Date;
  }>,
  stores: STORE_MASTER_DEFAULTS.map((s) => ({
    ...s,
    footfall: 0,
    conversionRate: 0,
    avgDwellMin: 0,
    rankDelta: 0,
    status: 'Good' as const,
    inStoreNow: 0,
    customerWaiting: 0,
    topAgeRange: '-',
    femaleCount: 0,
    maleCount: 0,
    updatedAt: new Date().toISOString(),
  })) as StoreRecord[],
  transactions: [] as Array<IngestTransactionInput & { id: number }>,
  alerts: [] as AttentionAlertRecord[],
  zoneAlerts: [] as Array<ZoneOverlayAlert & { dbId: number; storeId: number }>,
  latestDetections: new Map<number, DetectionFrame>(),
  nextUserId: 1,
  nextApiKeyId: 1,
  nextTxId: 1,
  nextAlertId: 1,
  nextZoneAlertId: 1,
};

function resolveDbConfig() {
  const host = (process.env.DB_HOST || process.env.PGHOST || '').trim();
  const port = Number(process.env.DB_PORT || process.env.PGPORT || 5432);
  const database = (process.env.DB_NAME || process.env.PGDATABASE || 'postgres').trim();
  const user = (process.env.DB_USER || process.env.PGUSER || '').trim();
  const password = process.env.DB_PASSWORD ?? process.env.PGPASSWORD ?? '';

  if (!host || !user || !password) {
    return null;
  }

  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const sslEnabled =
    process.env.DB_SSL !== undefined
      ? process.env.DB_SSL.toLowerCase() !== 'false'
      : !isLocal;

  return {
    host,
    port,
    database,
    user,
    password,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
    max: 10,
    connectionTimeoutMillis: 6000,
  };
}

export async function initDatabase(): Promise<void> {
  const dbConfig = resolveDbConfig();
  if (!dbConfig) {
    console.info(
      '[DB] Split DB params (DB_HOST, DB_USER, DB_PASSWORD) not configured. Running with in-memory fallback.'
    );
    usingPostgres = false;
    return;
  }

  try {
    pool = new Pool(dbConfig);
    await pool.query('SELECT 1');
    db = drizzle(pool, { schema });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'operator',
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS api_keys (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        key_prefix TEXT NOT NULL,
        key_hash TEXT NOT NULL,
        scopes TEXT NOT NULL DEFAULT 'ingest,detections',
        created_by INTEGER,
        last_used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS stores (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        area TEXT NOT NULL,
        footfall INTEGER NOT NULL DEFAULT 0,
        conversion_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
        avg_dwell_min DOUBLE PRECISION NOT NULL DEFAULT 0,
        rank_delta INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Good',
        camera_id TEXT NOT NULL,
        camera_location TEXT NOT NULL,
        camera_model TEXT NOT NULL,
        signal_strength TEXT NOT NULL DEFAULT 'High',
        stream_type TEXT NOT NULL DEFAULT 'webrtc_whep',
        stream_url TEXT NOT NULL DEFAULT '/api/webrtc/dummy/whep',
        in_store_now INTEGER NOT NULL DEFAULT 0,
        staff_on_floor INTEGER NOT NULL DEFAULT 0,
        customer_waiting INTEGER NOT NULL DEFAULT 0,
        top_age_range TEXT NOT NULL DEFAULT '-',
        female_count INTEGER NOT NULL DEFAULT 0,
        male_count INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS hourly_intervals (
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL,
        interval_index INTEGER NOT NULL,
        label TEXT NOT NULL,
        range_label TEXT NOT NULL,
        footfall INTEGER NOT NULL DEFAULT 0,
        conversion_rate DOUBLE PRECISION NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS staffing_metrics (
        id SERIAL PRIMARY KEY,
        avg_dwell_min DOUBLE PRECISION NOT NULL DEFAULT 0,
        avg_queue_min DOUBLE PRECISION NOT NULL DEFAULT 0,
        status_label TEXT NOT NULL DEFAULT 'All good',
        network_ratio DOUBLE PRECISION NOT NULL DEFAULT 1.0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS attention_alerts (
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL,
        store_code TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'Medium',
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        action_label TEXT NOT NULL,
        acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS zone_alerts (
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL,
        zone TEXT NOT NULL,
        message_prefix TEXT NOT NULL,
        message_highlight TEXT NOT NULL,
        message_suffix TEXT NOT NULL,
        action_label TEXT NOT NULL,
        anchor_x DOUBLE PRECISION NOT NULL DEFAULT 0.615,
        anchor_y DOUBLE PRECISION NOT NULL DEFAULT 0.65,
        acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS detection_frames (
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL,
        camera_id TEXT NOT NULL,
        frame_timestamp TEXT NOT NULL,
        image_width INTEGER NOT NULL DEFAULT 1280,
        image_height INTEGER NOT NULL DEFAULT 720,
        source_engine TEXT NOT NULL DEFAULT 'yolo-external-engine',
        person_count INTEGER NOT NULL DEFAULT 0,
        apparel_count INTEGER NOT NULL DEFAULT 0,
        avg_confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
        detections_json JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS footfall_transactions (
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL,
        recorded_date TEXT NOT NULL,
        interval_index INTEGER NOT NULL,
        footfall_count INTEGER NOT NULL DEFAULT 1,
        converted_count INTEGER NOT NULL DEFAULT 0,
        dwell_minutes DOUBLE PRECISION NOT NULL DEFAULT 0,
        queue_minutes DOUBLE PRECISION NOT NULL DEFAULT 0,
        age_group TEXT NOT NULL DEFAULT '23-35 yo',
        female_count INTEGER NOT NULL DEFAULT 0,
        male_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE detection_frames ADD COLUMN IF NOT EXISTS person_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE detection_frames ADD COLUMN IF NOT EXISTS apparel_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE detection_frames ADD COLUMN IF NOT EXISTS avg_confidence DOUBLE PRECISION NOT NULL DEFAULT 0;
    `);

    // Ensure store master configuration rows exist (without seeding fake transactions)
    const existingStores = await db.select().from(schema.stores);
    if (existingStores.length === 0) {
      for (const s of STORE_MASTER_DEFAULTS) {
        await db.insert(schema.stores).values({
          id: s.id,
          code: s.code,
          name: s.name,
          area: s.area,
          cameraId: s.cameraId,
          cameraLocation: s.cameraLocation,
          cameraModel: s.cameraModel,
          signalStrength: s.signalStrength,
          streamType: s.streamType,
          streamUrl: s.streamUrl,
          staffOnFloor: s.staffOnFloor,
          footfall: 0,
          conversionRate: 0,
          avgDwellMin: 0,
          rankDelta: 0,
          status: 'Good',
          inStoreNow: 0,
          customerWaiting: 0,
          topAgeRange: '-',
          femaleCount: 0,
          maleCount: 0,
        });
      }
      await pool.query(
        `SELECT setval(pg_get_serial_sequence('stores', 'id'), COALESCE((SELECT MAX(id) FROM stores), 1));`
      );
    } else {
      for (const row of existingStores) {
        const isLegacyDemo =
          (row.streamType === 'webrtc_demo' && row.streamUrl.startsWith('webrtc://demo/')) ||
          (row.streamType === 'webrtc_public' &&
            row.streamUrl.startsWith('https://janus.conf.meetecho.com/janus'));
        if (isLegacyDemo) {
          const master = STORE_MASTER_DEFAULTS.find((s) => s.id === row.id);
          if (master) {
            await db
              .update(schema.stores)
              .set({
                streamType: master.streamType,
                streamUrl: master.streamUrl,
                updatedAt: new Date(),
              })
              .where(eq(schema.stores.id, row.id));
          }
        }
      }
    }

    usingPostgres = true;
    console.info('[DB] Connected to PostgreSQL via Drizzle ORM (real aggregation mode).');
  } catch (err) {
    console.warn(
      '[DB] PostgreSQL connection unavailable, using in-memory fallback:',
      err instanceof Error ? err.message : err
    );
    usingPostgres = false;
    db = null;
    if (pool) {
      await pool.end().catch(() => {});
      pool = null;
    }
  }
}

export function isPostgresActive(): boolean {
  return usingPostgres && db !== null;
}

function formatDateLabel(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function computeAggregatedDashboardFromMemory(activeStoreId: number): DashboardPayload {
  const dates = [...new Set(memoryState.transactions.map((t) => t.recordedDate))].sort();
  const latestDate = dates[dates.length - 1] ?? null;
  const prevDate = dates.length >= 2 ? dates[dates.length - 2] : null;

  const todayTx = latestDate
    ? memoryState.transactions.filter((t) => t.recordedDate === latestDate)
    : [];
  const prevTx = prevDate
    ? memoryState.transactions.filter((t) => t.recordedDate === prevDate)
    : [];

  const enrichedStores: StoreRecord[] = memoryState.stores.map((s) => {
    const storeTx = todayTx.filter((t) => t.storeId === s.id);
    if (storeTx.length === 0) return { ...s };

    const footfall = storeTx.reduce((acc, t) => acc + t.footfallCount, 0);
    const converted = storeTx.reduce((acc, t) => acc + t.convertedCount, 0);
    const dwellWeighted = storeTx.reduce(
      (acc, t) => acc + t.dwellMinutes * t.footfallCount,
      0
    );
    const femaleCount = storeTx.reduce((acc, t) => acc + t.femaleCount, 0);
    const maleCount = storeTx.reduce((acc, t) => acc + t.maleCount, 0);

    const ageCounts = new Map<string, number>();
    for (const t of storeTx) {
      ageCounts.set(t.ageGroup, (ageCounts.get(t.ageGroup) || 0) + t.footfallCount);
    }
    const topAgeRange =
      [...ageCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || s.topAgeRange;

    const conversionRate =
      footfall > 0 ? Number(((converted / footfall) * 100).toFixed(1)) : 0;
    const avgDwellMin =
      footfall > 0 ? Number((dwellWeighted / footfall).toFixed(1)) : 0;

    return {
      ...s,
      footfall,
      conversionRate,
      avgDwellMin,
      femaleCount,
      maleCount,
      topAgeRange,
      status: conversionRate > 0 && conversionRate < 20 ? 'Critical' : 'Good',
    };
  });

  enrichedStores.sort((a, b) => b.footfall - a.footfall);
  const selectedStore =
    enrichedStores.find((s) => s.id === activeStoreId) ?? enrichedStores[0];

  const totalFootfall = todayTx.reduce((acc, t) => acc + t.footfallCount, 0);
  const totalConverted = todayTx.reduce((acc, t) => acc + t.convertedCount, 0);
  const prevFootfall = prevTx.reduce((acc, t) => acc + t.footfallCount, 0);

  const footfallDeltaPct =
    prevFootfall > 0
      ? Number((((totalFootfall - prevFootfall) / prevFootfall) * 100).toFixed(2))
      : 0;
  const conversionPct =
    totalFootfall > 0
      ? Number(((totalConverted / totalFootfall) * 100).toFixed(1))
      : 0;

  const intervals: HourlyIntervalRecord[] = INTERVAL_META.map((meta, idx) => {
    const ivTx = todayTx.filter((t) => t.intervalIndex === idx);
    const f = ivTx.reduce((acc, t) => acc + t.footfallCount, 0);
    const c = ivTx.reduce((acc, t) => acc + t.convertedCount, 0);
    return {
      id: idx + 1,
      storeId: selectedStore.id,
      intervalIndex: idx,
      label: meta.label,
      rangeLabel: meta.rangeLabel,
      footfall: f,
      conversionRate: f > 0 ? Number(((c / f) * 100).toFixed(0)) : 0,
    };
  });

  const totalDwellWeighted = todayTx.reduce(
    (acc, t) => acc + t.dwellMinutes * t.footfallCount,
    0
  );
  const totalQueueWeighted = todayTx.reduce(
    (acc, t) => acc + t.queueMinutes * t.footfallCount,
    0
  );
  const avgDwellMin =
    totalFootfall > 0 ? Number((totalDwellWeighted / totalFootfall).toFixed(1)) : 0;
  const avgQueueMin =
    totalFootfall > 0 ? Number((totalQueueWeighted / totalFootfall).toFixed(1)) : 0;

  const totalInStore = enrichedStores.reduce((acc, s) => acc + s.inStoreNow, 0);
  const totalWaiting = enrichedStores.reduce((acc, s) => acc + s.customerWaiting, 0);
  const networkRatio =
    totalInStore > 0
      ? Number((1 + (totalWaiting / totalInStore) * 0.79).toFixed(2))
      : 1.0;

  const activeZone =
    memoryState.zoneAlerts.find(
      (z) => z.storeId === selectedStore.id && !z.acknowledged
    ) ?? null;

  const latestDetections = memoryState.latestDetections.get(selectedStore.id) ?? {
    storeId: selectedStore.id,
    cameraId: selectedStore.cameraId,
    frameTimestamp: '--',
    imageWidth: 1280,
    imageHeight: 720,
    sourceEngine: 'awaiting-yolo-stream',
    detections: [],
  };

  return {
    stores: enrichedStores,
    activeStoreId: selectedStore.id,
    summary: {
      dateLabel: latestDate ? formatDateLabel(latestDate) : 'No data yet',
      totalFootfall,
      footfallDeltaPct,
      conversionPct,
      estimatedBuyers: totalConverted,
    },
    intervals,
    staffing: {
      id: 1,
      avgDwellMin,
      avgQueueMin,
      statusLabel: avgQueueMin > 15 ? 'High queue' : 'All good',
      networkRatio,
      updatedAt: new Date().toISOString(),
    },
    alerts: memoryState.alerts,
    zoneAlert: activeZone,
    latestDetections,
    dbBackend: 'memory-fallback',
  };
}

export const repository = {
  async countUsers(): Promise<number> {
    if (usingPostgres && db) {
      const rows = await db.select().from(schema.users);
      return rows.length;
    }
    return memoryState.users.length;
  },

  async findUserByEmail(email: string) {
    const normalized = email.trim().toLowerCase();
    if (usingPostgres && db) {
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, normalized))
        .limit(1);
      return user ?? null;
    }
    return memoryState.users.find((u) => u.email === normalized) ?? null;
  },

  async createUser(input: {
    email: string;
    name: string;
    role: 'admin' | 'operator';
    passwordHash: string;
  }): Promise<AuthUser> {
    const normalized = input.email.trim().toLowerCase();
    if (usingPostgres && db) {
      const [created] = await db
        .insert(schema.users)
        .values({
          email: normalized,
          name: input.name.trim(),
          role: input.role,
          passwordHash: input.passwordHash,
        })
        .returning();
      return {
        id: created.id,
        email: created.email,
        name: created.name,
        role: created.role,
      };
    }
    const newUser = {
      id: memoryState.nextUserId++,
      email: normalized,
      name: input.name.trim(),
      role: input.role,
      passwordHash: input.passwordHash,
      createdAt: new Date(),
    };
    memoryState.users.push(newUser);
    return {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
    };
  },

  async listApiKeys(): Promise<ApiKeySummary[]> {
    if (usingPostgres && db) {
      const rows = await db
        .select()
        .from(schema.apiKeys)
        .orderBy(desc(schema.apiKeys.createdAt));
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        keyPrefix: r.keyPrefix,
        scopes: r.scopes,
        lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
      }));
    }
    return memoryState.apiKeys.map((r) => ({
      id: r.id,
      name: r.name,
      keyPrefix: r.keyPrefix,
      scopes: r.scopes,
      lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));
  },

  async createApiKey(input: {
    name: string;
    keyPrefix: string;
    keyHash: string;
    scopes: string;
    createdBy: number | null;
  }): Promise<ApiKeySummary> {
    if (usingPostgres && db) {
      const [created] = await db
        .insert(schema.apiKeys)
        .values({
          name: input.name,
          keyPrefix: input.keyPrefix,
          keyHash: input.keyHash,
          scopes: input.scopes,
          createdBy: input.createdBy,
        })
        .returning();
      return {
        id: created.id,
        name: created.name,
        keyPrefix: created.keyPrefix,
        scopes: created.scopes,
        lastUsedAt: null,
        createdAt: created.createdAt.toISOString(),
      };
    }
    const item = {
      id: memoryState.nextApiKeyId++,
      name: input.name,
      keyPrefix: input.keyPrefix,
      keyHash: input.keyHash,
      scopes: input.scopes,
      createdBy: input.createdBy,
      lastUsedAt: null,
      createdAt: new Date(),
    };
    memoryState.apiKeys.unshift(item);
    return {
      id: item.id,
      name: item.name,
      keyPrefix: item.keyPrefix,
      scopes: item.scopes,
      lastUsedAt: null,
      createdAt: item.createdAt.toISOString(),
    };
  },

  async deleteApiKey(id: number): Promise<boolean> {
    if (usingPostgres && db) {
      const deleted = await db
        .delete(schema.apiKeys)
        .where(eq(schema.apiKeys.id, id))
        .returning();
      return deleted.length > 0;
    }
    const before = memoryState.apiKeys.length;
    memoryState.apiKeys = memoryState.apiKeys.filter((k) => k.id !== id);
    return memoryState.apiKeys.length < before;
  },

  async verifyStoredApiKeyHash(keyHash: string): Promise<boolean> {
    if (usingPostgres && db) {
      const [match] = await db
        .select()
        .from(schema.apiKeys)
        .where(eq(schema.apiKeys.keyHash, keyHash))
        .limit(1);
      if (!match) return false;
      await db
        .update(schema.apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(schema.apiKeys.id, match.id));
      return true;
    }
    const match = memoryState.apiKeys.find((k) => k.keyHash === keyHash);
    if (!match) return false;
    match.lastUsedAt = new Date();
    return true;
  },

  async getStores(): Promise<StoreRecord[]> {
    const dashboard = await this.getDashboardPayload(3);
    return dashboard.stores;
  },

  async updateStoreStreamConfig(
    storeId: number,
    patch: {
      streamType: StreamType;
      streamUrl: string;
      cameraLocation?: string;
      cameraModel?: string;
    }
  ): Promise<StoreRecord | null> {
    if (usingPostgres && db) {
      const [updated] = await db
        .update(schema.stores)
        .set({
          streamType: patch.streamType,
          streamUrl: patch.streamUrl,
          ...(patch.cameraLocation ? { cameraLocation: patch.cameraLocation } : {}),
          ...(patch.cameraModel ? { cameraModel: patch.cameraModel } : {}),
          updatedAt: new Date(),
        })
        .where(eq(schema.stores.id, storeId))
        .returning();
      return updated ? { ...updated, updatedAt: updated.updatedAt.toISOString() } : null;
    }
    const store = memoryState.stores.find((s) => s.id === storeId);
    if (!store) return null;
    store.streamType = patch.streamType;
    store.streamUrl = patch.streamUrl;
    if (patch.cameraLocation) store.cameraLocation = patch.cameraLocation;
    if (patch.cameraModel) store.cameraModel = patch.cameraModel;
    store.updatedAt = new Date().toISOString();
    return { ...store };
  },

  async ingestTransactions(
    rows: IngestTransactionInput[],
    replaceExistingForDates = false
  ): Promise<number> {
    if (rows.length === 0) return 0;

    if (usingPostgres && db && pool) {
      if (replaceExistingForDates) {
        const uniqueDates = [...new Set(rows.map((r) => r.recordedDate))];
        await pool.query(
          `DELETE FROM footfall_transactions WHERE recorded_date = ANY($1::text[])`,
          [uniqueDates]
        );
      }
      await db.insert(schema.footfallTransactions).values(rows);
      return rows.length;
    }

    if (replaceExistingForDates) {
      const dateSet = new Set(rows.map((r) => r.recordedDate));
      memoryState.transactions = memoryState.transactions.filter(
        (t) => !dateSet.has(t.recordedDate)
      );
    }
    for (const r of rows) {
      memoryState.transactions.push({ ...r, id: memoryState.nextTxId++ });
    }
    return rows.length;
  },

  async ingestAlerts(input: {
    attentionAlerts?: IngestAlertInput[];
    zoneAlerts?: IngestZoneAlertInput[];
    replaceExisting?: boolean;
  }): Promise<void> {
    if (usingPostgres && db && pool) {
      if (input.replaceExisting) {
        if (input.attentionAlerts) {
          await pool.query('DELETE FROM attention_alerts');
        }
        if (input.zoneAlerts) {
          await pool.query('DELETE FROM zone_alerts');
        }
      }
      if (input.attentionAlerts && input.attentionAlerts.length > 0) {
        await db.insert(schema.attentionAlerts).values(
          input.attentionAlerts.map((a) => ({
            storeId: a.storeId,
            storeCode: a.storeCode,
            severity: a.severity,
            title: a.title,
            description: a.description,
            actionLabel: a.actionLabel,
            acknowledged: false,
          }))
        );
      }
      if (input.zoneAlerts && input.zoneAlerts.length > 0) {
        await db.insert(schema.zoneAlerts).values(
          input.zoneAlerts.map((z) => ({
            storeId: z.storeId,
            zone: z.zone,
            messagePrefix: z.messagePrefix,
            messageHighlight: z.messageHighlight,
            messageSuffix: z.messageSuffix,
            actionLabel: z.actionLabel,
            anchorX: z.anchorX,
            anchorY: z.anchorY,
            acknowledged: false,
          }))
        );
      }
      return;
    }

    if (input.replaceExisting) {
      if (input.attentionAlerts) memoryState.alerts = [];
      if (input.zoneAlerts) memoryState.zoneAlerts = [];
    }
    if (input.attentionAlerts) {
      for (const a of input.attentionAlerts) {
        memoryState.alerts.push({
          ...a,
          id: memoryState.nextAlertId++,
          acknowledged: false,
          createdAt: new Date().toISOString(),
        });
      }
    }
    if (input.zoneAlerts) {
      for (const z of input.zoneAlerts) {
        const dbId = memoryState.nextZoneAlertId++;
        memoryState.zoneAlerts.push({
          dbId,
          storeId: z.storeId,
          id: `zone-${dbId}`,
          zone: z.zone,
          messagePrefix: z.messagePrefix,
          messageHighlight: z.messageHighlight,
          messageSuffix: z.messageSuffix,
          actionLabel: z.actionLabel,
          anchorX: z.anchorX,
          anchorY: z.anchorY,
          acknowledged: false,
        });
      }
    }
  },

  async ingestStoreMetrics(input: {
    storeId: number;
    inStoreNow?: number;
    staffOnFloor?: number;
    customerWaiting?: number;
    rankDelta?: number;
    signalStrength?: string;
    status?: 'Good' | 'Critical';
  }): Promise<StoreRecord | null> {
    if (usingPostgres && db) {
      const [existing] = await db
        .select()
        .from(schema.stores)
        .where(eq(schema.stores.id, input.storeId))
        .limit(1);
      if (!existing) return null;

      const [updated] = await db
        .update(schema.stores)
        .set({
          inStoreNow: input.inStoreNow ?? existing.inStoreNow,
          staffOnFloor: input.staffOnFloor ?? existing.staffOnFloor,
          customerWaiting: input.customerWaiting ?? existing.customerWaiting,
          rankDelta: input.rankDelta ?? existing.rankDelta,
          signalStrength: input.signalStrength ?? existing.signalStrength,
          status: input.status ?? existing.status,
          updatedAt: new Date(),
        })
        .where(eq(schema.stores.id, input.storeId))
        .returning();

      return { ...updated, updatedAt: updated.updatedAt.toISOString() };
    }

    const store = memoryState.stores.find((s) => s.id === input.storeId);
    if (!store) return null;
    if (input.inStoreNow !== undefined) store.inStoreNow = input.inStoreNow;
    if (input.staffOnFloor !== undefined) store.staffOnFloor = input.staffOnFloor;
    if (input.customerWaiting !== undefined) store.customerWaiting = input.customerWaiting;
    if (input.rankDelta !== undefined) store.rankDelta = input.rankDelta;
    if (input.signalStrength !== undefined) store.signalStrength = input.signalStrength;
    if (input.status !== undefined) store.status = input.status;
    store.updatedAt = new Date().toISOString();
    return { ...store };
  },

  async saveDetectionFrame(frame: DetectionFrame): Promise<DetectionFrame> {
    const personCount = frame.detections.filter(
      (d) => d.label.toLowerCase() === 'person'
    ).length;
    const apparelCount = frame.detections.length - personCount;
    const avgConfidence =
      frame.detections.length > 0
        ? Number(
            (
              frame.detections.reduce((acc, d) => acc + d.confidence, 0) /
              frame.detections.length
            ).toFixed(3)
          )
        : 0;

    if (usingPostgres && db) {
      await db.insert(schema.detectionFrames).values({
        storeId: frame.storeId,
        cameraId: frame.cameraId,
        frameTimestamp: frame.frameTimestamp,
        imageWidth: frame.imageWidth,
        imageHeight: frame.imageHeight,
        sourceEngine: frame.sourceEngine,
        personCount,
        apparelCount,
        avgConfidence,
        detectionsJson: frame.detections,
      });
    }
    memoryState.latestDetections.set(frame.storeId, frame);
    return frame;
  },

  async getLatestDetections(storeId: number): Promise<DetectionFrame> {
    if (usingPostgres && db) {
      const [row] = await db
        .select()
        .from(schema.detectionFrames)
        .where(eq(schema.detectionFrames.storeId, storeId))
        .orderBy(desc(schema.detectionFrames.id))
        .limit(1);
      if (row) {
        return {
          storeId: row.storeId,
          cameraId: row.cameraId,
          frameTimestamp: row.frameTimestamp,
          imageWidth: row.imageWidth,
          imageHeight: row.imageHeight,
          sourceEngine: row.sourceEngine,
          detections: row.detectionsJson,
        };
      }
    }
    return (
      memoryState.latestDetections.get(storeId) ?? {
        storeId,
        cameraId: 'CAM-01',
        frameTimestamp: '--',
        imageWidth: 1280,
        imageHeight: 720,
        sourceEngine: 'awaiting-yolo-stream',
        detections: [],
      }
    );
  },

  async acknowledgeAlert(alertId: number): Promise<AttentionAlertRecord | null> {
    if (usingPostgres && db) {
      const [updated] = await db
        .update(schema.attentionAlerts)
        .set({ acknowledged: true })
        .where(eq(schema.attentionAlerts.id, alertId))
        .returning();
      return updated ? { ...updated, createdAt: updated.createdAt.toISOString() } : null;
    }
    const alert = memoryState.alerts.find((a) => a.id === alertId);
    if (!alert) return null;
    alert.acknowledged = true;
    return { ...alert };
  },

  async acknowledgeZoneAlert(storeId: number): Promise<void> {
    if (usingPostgres && db) {
      await db
        .update(schema.zoneAlerts)
        .set({ acknowledged: true })
        .where(eq(schema.zoneAlerts.storeId, storeId));
      return;
    }
    for (const z of memoryState.zoneAlerts) {
      if (z.storeId === storeId) {
        z.acknowledged = true;
      }
    }
  },

  async getDashboardPayload(activeStoreId = 3): Promise<DashboardPayload> {
    if (!usingPostgres || !db || !pool) {
      return computeAggregatedDashboardFromMemory(activeStoreId);
    }

    // 1. Fetch store master records
    const baseStores = await db.select().from(schema.stores);

    // 2. Query distinct dates from footfall_transactions (real SQL)
    const datesResult = await pool.query<{ recorded_date: string }>(
      `SELECT DISTINCT recorded_date FROM footfall_transactions ORDER BY recorded_date DESC LIMIT 2`
    );
    const latestDate = datesResult.rows[0]?.recorded_date ?? null;
    const prevDate = datesResult.rows[1]?.recorded_date ?? null;

    // 3. Aggregate per-store metrics from footfall_transactions for latestDate
    type StoreAggRow = {
      store_id: number;
      total_footfall: string;
      total_converted: string;
      weighted_dwell: string;
      total_female: string;
      total_male: string;
    };
    const storeAggMap = new Map<number, StoreAggRow>();
    const topAgeMap = new Map<number, string>();

    if (latestDate) {
      const storeAggRes = await pool.query<StoreAggRow>(
        `
        SELECT
          store_id,
          COALESCE(SUM(footfall_count), 0) AS total_footfall,
          COALESCE(SUM(converted_count), 0) AS total_converted,
          COALESCE(SUM(dwell_minutes * footfall_count), 0) AS weighted_dwell,
          COALESCE(SUM(female_count), 0) AS total_female,
          COALESCE(SUM(male_count), 0) AS total_male
        FROM footfall_transactions
        WHERE recorded_date = $1
        GROUP BY store_id
        `,
        [latestDate]
      );
      for (const r of storeAggRes.rows) {
        storeAggMap.set(r.store_id, r);
      }

      const ageAggRes = await pool.query<{ store_id: number; age_group: string }>(
        `
        SELECT DISTINCT ON (store_id)
          store_id,
          age_group
        FROM footfall_transactions
        WHERE recorded_date = $1
        GROUP BY store_id, age_group
        ORDER BY store_id, SUM(footfall_count) DESC
        `,
        [latestDate]
      );
      for (const r of ageAggRes.rows) {
        topAgeMap.set(r.store_id, r.age_group);
      }
    }

    const enrichedStores: StoreRecord[] = baseStores.map((s) => {
      const agg = storeAggMap.get(s.id);
      const footfall = agg ? Number(agg.total_footfall) : 0;
      const converted = agg ? Number(agg.total_converted) : 0;
      const weightedDwell = agg ? Number(agg.weighted_dwell) : 0;
      const femaleCount = agg ? Number(agg.total_female) : 0;
      const maleCount = agg ? Number(agg.total_male) : 0;

      const conversionRate =
        footfall > 0 ? Number(((converted / footfall) * 100).toFixed(1)) : 0;
      const avgDwellMin =
        footfall > 0 ? Number((weightedDwell / footfall).toFixed(1)) : 0;

      return {
        ...s,
        footfall,
        conversionRate,
        avgDwellMin,
        femaleCount,
        maleCount,
        topAgeRange: topAgeMap.get(s.id) ?? '-',
        status: conversionRate > 0 && conversionRate < 20 ? 'Critical' : 'Good',
        updatedAt: s.updatedAt.toISOString(),
      };
    });

    enrichedStores.sort((a, b) => b.footfall - a.footfall);
    const selectedStore =
      enrichedStores.find((s) => s.id === activeStoreId) ?? enrichedStores[0];

    // 4. Overall Today vs Yesterday SQL aggregations
    let totalFootfall = 0;
    let totalConverted = 0;
    let avgDwellMin = 0;
    let avgQueueMin = 0;
    let prevFootfall = 0;

    if (latestDate) {
      const overallRes = await pool.query<{
        total_footfall: string;
        total_converted: string;
        weighted_dwell: string;
        weighted_queue: string;
      }>(
        `
        SELECT
          COALESCE(SUM(footfall_count), 0) AS total_footfall,
          COALESCE(SUM(converted_count), 0) AS total_converted,
          COALESCE(SUM(dwell_minutes * footfall_count), 0) AS weighted_dwell,
          COALESCE(SUM(queue_minutes * footfall_count), 0) AS weighted_queue
        FROM footfall_transactions
        WHERE recorded_date = $1
        `,
        [latestDate]
      );
      const o = overallRes.rows[0];
      if (o) {
        totalFootfall = Number(o.total_footfall);
        totalConverted = Number(o.total_converted);
        avgDwellMin =
          totalFootfall > 0
            ? Number((Number(o.weighted_dwell) / totalFootfall).toFixed(1))
            : 0;
        avgQueueMin =
          totalFootfall > 0
            ? Number((Number(o.weighted_queue) / totalFootfall).toFixed(1))
            : 0;
      }
    }

    if (prevDate) {
      const prevRes = await pool.query<{ prev_footfall: string }>(
        `SELECT COALESCE(SUM(footfall_count), 0) AS prev_footfall FROM footfall_transactions WHERE recorded_date = $1`,
        [prevDate]
      );
      prevFootfall = Number(prevRes.rows[0]?.prev_footfall ?? 0);
    }

    const footfallDeltaPct =
      prevFootfall > 0
        ? Number((((totalFootfall - prevFootfall) / prevFootfall) * 100).toFixed(2))
        : 0;
    const conversionPct =
      totalFootfall > 0
        ? Number(((totalConverted / totalFootfall) * 100).toFixed(1))
        : 0;

    // 5. Interval aggregation (09:00 .. 24:00) via GROUP BY interval_index
    const intervalMap = new Map<number, { footfall: number; converted: number }>();
    if (latestDate) {
      const ivRes = await pool.query<{
        interval_index: number;
        iv_footfall: string;
        iv_converted: string;
      }>(
        `
        SELECT
          interval_index,
          COALESCE(SUM(footfall_count), 0) AS iv_footfall,
          COALESCE(SUM(converted_count), 0) AS iv_converted
        FROM footfall_transactions
        WHERE recorded_date = $1
        GROUP BY interval_index
        ORDER BY interval_index ASC
        `,
        [latestDate]
      );
      for (const r of ivRes.rows) {
        intervalMap.set(r.interval_index, {
          footfall: Number(r.iv_footfall),
          converted: Number(r.iv_converted),
        });
      }
    }

    const intervals: HourlyIntervalRecord[] = INTERVAL_META.map((meta, idx) => {
      const agg = intervalMap.get(idx);
      const f = agg?.footfall ?? 0;
      const c = agg?.converted ?? 0;
      return {
        id: idx + 1,
        storeId: selectedStore.id,
        intervalIndex: idx,
        label: meta.label,
        rangeLabel: meta.rangeLabel,
        footfall: f,
        conversionRate: f > 0 ? Number(((c / f) * 100).toFixed(0)) : 0,
      };
    });

    // 6. Staffing network ratio from live store occupancy / queue counts
    const totalInStore = enrichedStores.reduce((acc, s) => acc + s.inStoreNow, 0);
    const totalWaiting = enrichedStores.reduce((acc, s) => acc + s.customerWaiting, 0);
    const networkRatio =
      totalInStore > 0
        ? Number((1 + (totalWaiting / totalInStore) * 0.79).toFixed(2))
        : 1.0;

    const staffing: StaffingMetricsRecord = {
      id: 1,
      avgDwellMin,
      avgQueueMin,
      statusLabel: avgQueueMin > 15 ? 'High queue' : 'All good',
      networkRatio,
      updatedAt: new Date().toISOString(),
    };

    // 7. Alerts & Zone Alert queried directly from DB
    const dbAlerts = await db
      .select()
      .from(schema.attentionAlerts)
      .orderBy(asc(schema.attentionAlerts.id));

    const alerts: AttentionAlertRecord[] = dbAlerts.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
    }));

    const [dbZoneAlert] = await db
      .select()
      .from(schema.zoneAlerts)
      .where(
        sql`${schema.zoneAlerts.storeId} = ${selectedStore.id} AND ${schema.zoneAlerts.acknowledged} = false`
      )
      .orderBy(desc(schema.zoneAlerts.id))
      .limit(1);

    const zoneAlert: ZoneOverlayAlert | null = dbZoneAlert
      ? {
          id: `zone-${dbZoneAlert.id}`,
          zone: dbZoneAlert.zone,
          messagePrefix: dbZoneAlert.messagePrefix,
          messageHighlight: dbZoneAlert.messageHighlight,
          messageSuffix: dbZoneAlert.messageSuffix,
          actionLabel: dbZoneAlert.actionLabel,
          anchorX: dbZoneAlert.anchorX,
          anchorY: dbZoneAlert.anchorY,
          acknowledged: dbZoneAlert.acknowledged,
        }
      : null;

    // 8. Latest YOLO Detection Frame from DB
    const latestDetections = await this.getLatestDetections(selectedStore.id);

    return {
      stores: enrichedStores,
      activeStoreId: selectedStore.id,
      summary: {
        dateLabel: latestDate ? formatDateLabel(latestDate) : 'No data yet',
        totalFootfall,
        footfallDeltaPct,
        conversionPct,
        estimatedBuyers: totalConverted,
      },
      intervals,
      staffing,
      alerts,
      zoneAlert,
      latestDetections,
      dbBackend: 'postgresql',
    };
  },
};
