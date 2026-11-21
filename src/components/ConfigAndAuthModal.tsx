import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  KeyRound,
  Lock,
  Radio,
  ShieldCheck,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import type {
  ApiKeySummary,
  AuthUser,
  StoreRecord,
  StreamType,
} from '../types/retail.ts';

export type ModalTab = 'stream' | 'api' | 'auth';

interface ConfigAndAuthModalProps {
  isOpen: boolean;
  initialTab: ModalTab;
  onClose: () => void;
  activeStore: StoreRecord;
  authToken: string | null;
  currentUser: AuthUser | null;
  hasAdminUser: boolean;
  hasEnvPasscode: boolean;
  wsConnected: boolean;
  dbBackend: 'postgresql' | 'memory-fallback';
  onAuthSuccess: (token: string, user: AuthUser) => void;
  onLogout: () => void;
  onStreamUpdated: () => Promise<void>;
}

const STREAM_PRESETS: Array<{ label: string; type: StreamType; url: string }> = [
  {
    label: 'Dummy WebRTC Producer (WHEP Proxy)',
    type: 'webrtc_whep',
    url: '/api/webrtc/dummy/whep',
  },
  {
    label: 'Dummy WebRTC Producer (Local :8889)',
    type: 'webrtc_whep',
    url: 'http://localhost:8889/dummy/whep',
  },
  {
    label: 'Public WebRTC Live (Janus Opus/VP8)',
    type: 'webrtc_public',
    url: 'https://janus.conf.meetecho.com/janus#mountpoint=1',
  },
  {
    label: 'Public HLS Live Test (Mux)',
    type: 'hls',
    url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  },
  {
    label: 'Built-in Retail Demo Fallback',
    type: 'webrtc_demo',
    url: 'webrtc://demo/store-3-westfield',
  },
];

export function ConfigAndAuthModal({
  isOpen,
  initialTab,
  onClose,
  activeStore,
  authToken,
  currentUser,
  hasAdminUser,
  hasEnvPasscode,
  wsConnected,
  dbBackend,
  onAuthSuccess,
  onLogout,
  onStreamUpdated,
}: ConfigAndAuthModalProps) {
  const [tab, setTab] = useState<ModalTab>(initialTab);
  const [streamType, setStreamType] = useState<StreamType>(activeStore.streamType);
  const [streamUrl, setStreamUrl] = useState(activeStore.streamUrl);
  const [cameraLocation, setCameraLocation] = useState(activeStore.cameraLocation);
  const [cameraModel, setCameraModel] = useState(activeStore.cameraModel);

  const [email, setEmail] = useState('riana@uniqlo.jp');
  const [name, setName] = useState('Riana davidson');
  const [password, setPassword] = useState('');

  const [apiKeys, setApiKeys] = useState<ApiKeySummary[]>([]);
  const [newKeyName, setNewKeyName] = useState('yolo-engine-westfield');
  const [createdPlaintextKey, setCreatedPlaintextKey] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab, isOpen]);

  useEffect(() => {
    setStreamType(activeStore.streamType);
    setStreamUrl(activeStore.streamUrl);
    setCameraLocation(activeStore.cameraLocation);
    setCameraModel(activeStore.cameraModel);
  }, [activeStore]);

  useEffect(() => {
    if (!isOpen || !authToken || tab !== 'api') return;
    fetch('/api/api-keys', {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { apiKeys: ApiKeySummary[] }) => setApiKeys(d.apiKeys || []))
      .catch(() => {});
  }, [isOpen, authToken, tab]);

  if (!isOpen) return null;

  async function handleSaveStream(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    if (!authToken) {
      setErrorMsg('Please sign in under Operator Auth first to update stream settings.');
      setTab('auth');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/config/stream/${activeStore.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          streamType,
          streamUrl,
          cameraLocation,
          cameraModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update stream config');
      await onStreamUpdated();
      setStatusMsg('Stream configuration saved and broadcast to active clients.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save stream config');
    } finally {
      setBusy(false);
    }
  }

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    setBusy(true);
    try {
      const isBootstrap = !hasAdminUser && !hasEnvPasscode;
      const endpoint = isBootstrap ? '/api/auth/bootstrap-admin' : '/api/auth/login';
      const body = isBootstrap ? { email, name, password } : { email, password };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');
      onAuthSuccess(data.token, data.user);
      setPassword('');
      setStatusMsg('Authenticated! Operator Bearer token stored in memory.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateApiKey(e: React.FormEvent) {
    e.preventDefault();
    if (!authToken) return;
    setErrorMsg(null);
    setBusy(true);
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ name: newKeyName, scopes: 'ingest,detections' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create API key');
      setCreatedPlaintextKey(data.plaintextKey);
      setApiKeys((prev) => [data.apiKey, ...prev]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create API key');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteKey(id: number) {
    if (!authToken) return;
    const res = await fetch(`/api/api-keys/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (res.ok) {
      setApiKeys((prev) => prev.filter((k) => k.id !== id));
    }
  }

  function copyText(id: string, text: string) {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1600);
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="bg-white rounded-[18px] border border-[#E5E7EB] shadow-2xl w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#F1F5F9]">
          <div>
            <h2 className="text-[16px] font-semibold text-[#111827]">
              Retail Insight Configuration
            </h2>
            <p className="text-[12px] text-[#6B7280] mt-0.5">
              {activeStore.code} {activeStore.name} · DB: {dbBackend} · WebSocket:{' '}
              {wsConnected ? 'Connected' : 'Reconnecting'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#6B7280] hover:text-[#111827] hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-[#F1F5F9] bg-[#F8FAFC]">
          <button
            type="button"
            onClick={() => setTab('stream')}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-[12.5px] font-medium rounded-t-lg border-b-2 transition-colors ${
              tab === 'stream'
                ? 'border-[#2563EB] text-[#2563EB] bg-white'
                : 'border-transparent text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>Live Video &amp; WebRTC</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('api')}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-[12.5px] font-medium rounded-t-lg border-b-2 transition-colors ${
              tab === 'api'
                ? 'border-[#2563EB] text-[#2563EB] bg-white'
                : 'border-transparent text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>YOLO &amp; Ingest APIs</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('auth')}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-[12.5px] font-medium rounded-t-lg border-b-2 transition-colors ${
              tab === 'auth'
                ? 'border-[#2563EB] text-[#2563EB] bg-white'
                : 'border-transparent text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Operator Auth</span>
          </button>
        </div>

        <div className="p-6 max-h-[75vh] overflow-y-auto">
          {statusMsg && (
            <div className="mb-4 px-3.5 py-2.5 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] text-[12px] text-[#065F46]">
              {statusMsg}
            </div>
          )}
          {errorMsg && (
            <div className="mb-4 px-3.5 py-2.5 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-[12px] text-[#991B1B]">
              {errorMsg}
            </div>
          )}

          {/* TAB 1: STREAM CONFIG */}
          {tab === 'stream' && (
            <form onSubmit={handleSaveStream} className="space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-[#374151] mb-1.5">
                  Quick Stream Presets
                </label>
                <div className="flex flex-wrap gap-2">
                  {STREAM_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        setStreamType(p.type);
                        setStreamUrl(p.url);
                      }}
                      className="px-2.5 py-1.5 text-[11.5px] font-medium rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] hover:bg-[#EFF6FF] hover:border-[#BFDBFE] text-[#374151] transition-colors"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[12px] font-medium text-[#374151] mb-1">
                    Stream Protocol
                  </label>
                  <select
                    value={streamType}
                    onChange={(e) => setStreamType(e.target.value as StreamType)}
                    className="w-full h-9 px-3 rounded-lg border border-[#D1D5DB] text-[13px] bg-white focus:outline-none focus:border-[#2563EB]"
                  >
                    <option value="webrtc_public">Public WebRTC Stream (Janus)</option>
                    <option value="webrtc_whep">WebRTC (WHEP Endpoint)</option>
                    <option value="hls">HLS Live Stream (.m3u8)</option>
                    <option value="mp4">Direct Video (.mp4 / .webm)</option>
                    <option value="webrtc_demo">Built-in Retail Demo Fallback</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#374151] mb-1">
                    Camera Location
                  </label>
                  <input
                    type="text"
                    value={cameraLocation}
                    onChange={(e) => setCameraLocation(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[#D1D5DB] text-[13px] focus:outline-none focus:border-[#2563EB]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#374151] mb-1">
                  Stream URL (WebRTC WHEP / HLS / Video)
                </label>
                <input
                  type="text"
                  value={streamUrl}
                  onChange={(e) => setStreamUrl(e.target.value)}
                  placeholder="https://your-media-server/mystream/whep"
                  className="w-full h-9 px-3 rounded-lg border border-[#D1D5DB] text-[13px] font-mono focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-[11.5px] text-[#6B7280]">
                  Saved per store in PostgreSQL &amp; pushed live via WebSocket.
                </span>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[12.5px] font-medium disabled:opacity-60"
                >
                  {busy ? 'Saving...' : 'Save Stream Config'}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: YOLO & INGEST API */}
          {tab === 'api' && (
            <div className="space-y-5">
              <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                <div className="text-[13px] font-semibold text-[#111827]">
                  External API Ingestion &amp; WebSocket Pipeline
                </div>
                <div className="text-[11.5px] text-[#6B7280] mt-0.5">
                  All dashboard metrics and YOLO bounding boxes flow strictly through authenticated APIs into PostgreSQL and broadcast over <code className="font-mono">/ws</code>. Generate an API key below, then run <code className="font-mono bg-white px-1 py-0.5 rounded border border-[#E2E8F0]">npm run producer:dummy -- --api-key=YOUR_KEY --seed-metrics</code> to stream the dummy store image via WebRTC WHEP &amp; inject matched YOLO pose detections.
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between text-[12px] font-medium text-[#111827] mb-1">
                    <span>1. YOLO Object Detection Receiver (BBox, Confidence, Pose Keypoints → WebSocket)</span>
                    <button
                      type="button"
                      onClick={() =>
                        copyText(
                          'yolo',
                          `curl -X POST ${origin}/api/detections/ingest -H "Content-Type: application/json" -H "x-api-key: YOUR_API_KEY" -d '{"storeId":${activeStore.id},"cameraId":"${activeStore.cameraId}","imageWidth":1280,"imageHeight":720,"detections":[{"label":"person","confidence":0.92,"bbox":[0.2,0.3,0.1,0.35],"keypoints":[{"x":0.25,"y":0.33},{"x":0.25,"y":0.4}]}]}'`
                        )
                      }
                      className="text-[11px] text-[#2563EB] flex items-center gap-1"
                    >
                      {copiedId === 'yolo' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedId === 'yolo' ? 'Copied' : 'Copy cURL'}</span>
                    </button>
                  </div>
                  <pre className="p-3 rounded-lg bg-[#0F172A] text-[#E2E8F0] text-[11px] font-mono overflow-x-auto">
{`POST ${origin}/api/detections/ingest
Header: x-api-key: <YOUR_INGEST_API_KEY>
Body: { "storeId": ${activeStore.id}, "imageWidth": 1280, "imageHeight": 720,
  "detections": [{ "label": "person", "confidence": 0.92, "bbox": [0.2, 0.3, 0.1, 0.35],
    "keypoints": [{ "x": 0.25, "y": 0.33 }, { "x": 0.25, "y": 0.40 }] }] }`}
                  </pre>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[12px] font-medium text-[#111827] mb-1">
                    <span>2. Retail Transactions Ingestion (Footfall, Dwell, Queue, Demographics → SQL Aggregation)</span>
                    <button
                      type="button"
                      onClick={() =>
                        copyText(
                          'tx',
                          `curl -X POST ${origin}/api/ingest/transactions -H "Content-Type: application/json" -H "x-api-key: YOUR_API_KEY" -d '{"transactions":[{"storeId":${activeStore.id},"recordedDate":"2026-08-08","intervalIndex":2,"footfallCount":1,"convertedCount":1,"dwellMinutes":11.5,"queueMinutes":9.2,"ageGroup":"23-35 yo","femaleCount":1,"maleCount":0}]}'`
                        )
                      }
                      className="text-[11px] text-[#2563EB] flex items-center gap-1"
                    >
                      {copiedId === 'tx' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedId === 'tx' ? 'Copied' : 'Copy cURL'}</span>
                    </button>
                  </div>
                  <pre className="p-3 rounded-lg bg-[#0F172A] text-[#E2E8F0] text-[11px] font-mono overflow-x-auto">
{`POST ${origin}/api/ingest/transactions
Header: x-api-key: <YOUR_INGEST_API_KEY>
Body: { "transactions": [{ "storeId": ${activeStore.id}, "recordedDate": "2026-08-08",
  "intervalIndex": 2, "footfallCount": 1, "convertedCount": 1, "dwellMinutes": 11.5,
  "queueMinutes": 9.2, "ageGroup": "23-35 yo", "femaleCount": 1, "maleCount": 0 }] }`}
                  </pre>
                </div>
              </div>

              {/* API Key Management */}
              <div className="border-t border-[#F1F5F9] pt-4">
                <div className="text-[13px] font-semibold text-[#111827] mb-2">
                  Engine API Keys
                </div>
                {!authToken ? (
                  <p className="text-[12px] text-[#6B7280]">
                    Sign in under{' '}
                    <button
                      type="button"
                      onClick={() => setTab('auth')}
                      className="text-[#2563EB] font-medium underline"
                    >
                      Operator Auth
                    </button>{' '}
                    to create or revoke external engine API keys.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <form onSubmit={handleCreateApiKey} className="flex gap-2">
                      <input
                        type="text"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        placeholder="Engine name (e.g. yolo-gpu-node-1)"
                        className="flex-1 h-9 px-3 rounded-lg border border-[#D1D5DB] text-[12.5px]"
                      />
                      <button
                        type="submit"
                        disabled={busy}
                        className="px-3.5 h-9 rounded-lg bg-[#111827] hover:bg-[#1F2937] text-white text-[12px] font-medium flex items-center gap-1.5"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Generate Key</span>
                      </button>
                    </form>

                    {createdPlaintextKey && (
                      <div className="p-3 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold text-[#1E40AF]">
                            Copy your new API key now (shown once):
                          </div>
                          <code className="text-[12px] font-mono text-[#1E3A8A] break-all">
                            {createdPlaintextKey}
                          </code>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyText('newkey', createdPlaintextKey)}
                          className="px-2.5 py-1 rounded bg-white border border-[#BFDBFE] text-[11px] font-medium text-[#1D4ED8] shrink-0"
                        >
                          {copiedId === 'newkey' ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      {apiKeys.map((k) => (
                        <div
                          key={k.id}
                          className="flex items-center justify-between px-3 py-2 rounded-lg border border-[#E5E7EB] text-[12px]"
                        >
                          <div>
                            <span className="font-medium text-[#111827]">{k.name}</span>
                            <span className="ml-2 font-mono text-[#6B7280]">
                              {k.keyPrefix}•••
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteKey(k.id)}
                            className="text-[#9CA3AF] hover:text-[#DC2626] p-1"
                            title="Revoke Key"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: OPERATOR AUTH */}
          {tab === 'auth' && (
            <div>
              {currentUser ? (
                <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#DBEAFE] text-[#2563EB] flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-[14px] font-semibold text-[#111827]">
                        {currentUser.name}
                      </div>
                      <div className="text-[12px] text-[#6B7280]">
                        {currentUser.email} · Role: {currentUser.role}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onLogout}
                    className="px-3.5 py-1.5 rounded-lg border border-[#D1D5DB] bg-white hover:bg-gray-50 text-[12.5px] font-medium text-[#374151]"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <form onSubmit={handleAuthSubmit} className="space-y-3.5">
                  <div className="text-[12.5px] text-[#4B5563]">
                    {!hasAdminUser && !hasEnvPasscode
                      ? 'First-run setup: Create the initial Admin operator password (stored hashed with scrypt on the server).'
                      : 'Sign in to obtain a signed Bearer session token for stream configuration and API key management.'}
                  </div>

                  {!hasAdminUser && !hasEnvPasscode && (
                    <div>
                      <label className="block text-[12px] font-medium text-[#374151] mb-1">
                        Operator Name
                      </label>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-[#D1D5DB] text-[13px]"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-[12px] font-medium text-[#374151] mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-[#D1D5DB] text-[13px]"
                    />
                  </div>

                  <div>
                    <label className="block text-[12px] font-medium text-[#374151] mb-1">
                      Password
                    </label>
                    <input
                      type="password"
                      required
                      minLength={hasAdminUser ? 1 : 8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={
                        !hasAdminUser && !hasEnvPasscode
                          ? 'Choose a password (min 8 characters)'
                          : 'Enter operator password'
                      }
                      className="w-full h-9 px-3 rounded-lg border border-[#D1D5DB] text-[13px]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full h-9 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[13px] font-medium"
                  >
                    {busy
                      ? 'Verifying...'
                      : !hasAdminUser && !hasEnvPasscode
                        ? 'Claim Admin Account'
                        : 'Sign In'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
