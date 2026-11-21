import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { repository } from '../db/repository.ts';
import type { AuthUser } from '../types/retail.ts';

const JWT_SECRET =
  process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 16
    ? process.env.JWT_SECRET.trim()
    : crypto.randomBytes(32).toString('hex');

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derived = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derived.length) return false;
  return crypto.timingSafeEqual(keyBuf, derived);
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function base64UrlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const normalized = input.replaceAll('-', '+').replaceAll('_', '/') + pad;
  return Buffer.from(normalized, 'base64').toString('utf8');
}

export function signToken(user: AuthUser, ttlSeconds = 60 * 60 * 12): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      iat: now,
      exp: now + ttlSeconds,
    })
  );
  const signature = base64UrlEncode(
    crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest()
  );
  return `${header}.${payload}.${signature}`;
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    const expectedSig = base64UrlEncode(
      crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest()
    );
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const decoded = JSON.parse(base64UrlDecode(payload)) as {
      sub: number;
      email: string;
      name: string;
      role: 'admin' | 'operator';
      exp: number;
    };
    if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return {
      id: decoded.sub,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
    };
  } catch {
    return null;
  }
}

export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

export function generateApiKey(): { rawKey: string; keyPrefix: string; keyHash: string } {
  const secretPart = crypto.randomBytes(24).toString('base64url');
  const rawKey = `ri_live_${secretPart}`;
  return {
    rawKey,
    keyPrefix: rawKey.slice(0, 14),
    keyHash: hashApiKey(rawKey),
  };
}

export function extractBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim() || null;
}

export async function requireUserAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  const verified = verifyToken(token);
  if (!verified) {
    res.status(401).json({ error: 'Session expired or invalid token.' });
    return;
  }
  req.user = verified;
  next();
}

export async function requireApiKey(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const headerKey =
    (typeof req.headers['x-api-key'] === 'string' && req.headers['x-api-key'].trim()) ||
    extractBearerToken(req);

  if (!headerKey) {
    res.status(401).json({
      error: 'Missing ingestion API key. Provide x-api-key or Authorization: Bearer header.',
    });
    return;
  }

  // 1. Check process.env.INGEST_API_KEY via timing-safe comparison
  const envKey = process.env.INGEST_API_KEY?.trim();
  if (envKey && envKey.length > 0) {
    const providedBuf = Buffer.from(headerKey);
    const expectedBuf = Buffer.from(envKey);
    if (
      providedBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(providedBuf, expectedBuf)
    ) {
      next();
      return;
    }
  }

  // 2. Check SHA-256 hashed API key stored in PostgreSQL api_keys table
  const keyHash = hashApiKey(headerKey);
  const validStored = await repository.verifyStoredApiKeyHash(keyHash);
  if (validStored) {
    next();
    return;
  }

  // 3. Also accept a valid signed admin JWT when called by logged-in operator
  const user = verifyToken(headerKey);
  if (user && (user.role === 'admin' || user.role === 'operator')) {
    req.user = user;
    next();
    return;
  }

  res.status(403).json({ error: 'Invalid or revoked API key.' });
}
