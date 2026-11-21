import {
  pgTable,
  serial,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';
import type { DetectionBox, StreamType } from '../types/retail.ts';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: text('role').$type<'admin' | 'operator'>().notNull().default('operator'),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const apiKeys = pgTable('api_keys', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  keyPrefix: text('key_prefix').notNull(),
  keyHash: text('key_hash').notNull(),
  scopes: text('scopes').notNull().default('ingest,detections'),
  createdBy: integer('created_by'),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const stores = pgTable('stores', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  area: text('area').notNull(),
  footfall: integer('footfall').notNull().default(0),
  conversionRate: doublePrecision('conversion_rate').notNull().default(0),
  avgDwellMin: doublePrecision('avg_dwell_min').notNull().default(0),
  rankDelta: integer('rank_delta').notNull().default(0),
  status: text('status').$type<'Good' | 'Critical'>().notNull().default('Good'),
  cameraId: text('camera_id').notNull(),
  cameraLocation: text('camera_location').notNull(),
  cameraModel: text('camera_model').notNull(),
  signalStrength: text('signal_strength').notNull().default('High'),
  streamType: text('stream_type').$type<StreamType>().notNull().default('webrtc_whep'),
  streamUrl: text('stream_url').notNull().default('/api/webrtc/dummy/whep'),
  inStoreNow: integer('in_store_now').notNull().default(120),
  staffOnFloor: integer('staff_on_floor').notNull().default(8),
  customerWaiting: integer('customer_waiting').notNull().default(23),
  topAgeRange: text('top_age_range').notNull().default('23-35 yo'),
  femaleCount: integer('female_count').notNull().default(80),
  maleCount: integer('male_count').notNull().default(40),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const hourlyIntervals = pgTable('hourly_intervals', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id').notNull(),
  intervalIndex: integer('interval_index').notNull(),
  label: text('label').notNull(),
  rangeLabel: text('range_label').notNull(),
  footfall: integer('footfall').notNull().default(0),
  conversionRate: doublePrecision('conversion_rate').notNull().default(0),
});

export const staffingMetrics = pgTable('staffing_metrics', {
  id: serial('id').primaryKey(),
  avgDwellMin: doublePrecision('avg_dwell_min').notNull().default(4.2),
  avgQueueMin: doublePrecision('avg_queue_min').notNull().default(11.4),
  statusLabel: text('status_label').notNull().default('All good'),
  networkRatio: doublePrecision('network_ratio').notNull().default(1.17),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const attentionAlerts = pgTable('attention_alerts', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id').notNull(),
  storeCode: text('store_code').notNull(),
  severity: text('severity').$type<'Medium' | 'High' | 'Critical'>().notNull().default('Medium'),
  title: text('title').notNull(),
  description: text('description').notNull(),
  actionLabel: text('action_label').notNull(),
  acknowledged: boolean('acknowledged').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const detectionFrames = pgTable('detection_frames', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id').notNull(),
  cameraId: text('camera_id').notNull(),
  frameTimestamp: text('frame_timestamp').notNull(),
  imageWidth: integer('image_width').notNull().default(1280),
  imageHeight: integer('image_height').notNull().default(720),
  sourceEngine: text('source_engine').notNull().default('yolo-external-engine'),
  personCount: integer('person_count').notNull().default(0),
  apparelCount: integer('apparel_count').notNull().default(0),
  avgConfidence: doublePrecision('avg_confidence').notNull().default(0),
  detectionsJson: jsonb('detections_json').$type<DetectionBox[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const footfallTransactions = pgTable('footfall_transactions', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id').notNull(),
  recordedDate: text('recorded_date').notNull(),
  intervalIndex: integer('interval_index').notNull(),
  footfallCount: integer('footfall_count').notNull().default(1),
  convertedCount: integer('converted_count').notNull().default(0),
  dwellMinutes: doublePrecision('dwell_minutes').notNull().default(0),
  queueMinutes: doublePrecision('queue_minutes').notNull().default(0),
  ageGroup: text('age_group').notNull().default('23-35 yo'),
  femaleCount: integer('female_count').notNull().default(0),
  maleCount: integer('male_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const zoneAlerts = pgTable('zone_alerts', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id').notNull(),
  zone: text('zone').notNull(),
  messagePrefix: text('message_prefix').notNull(),
  messageHighlight: text('message_highlight').notNull(),
  messageSuffix: text('message_suffix').notNull(),
  actionLabel: text('action_label').notNull(),
  anchorX: doublePrecision('anchor_x').notNull().default(0.615),
  anchorY: doublePrecision('anchor_y').notNull().default(0.65),
  acknowledged: boolean('acknowledged').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
