import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  AlertCircle,
  ChevronDown,
  Crosshair,
  Maximize2,
  Minimize2,
  Minus,
  MoreHorizontal,
  Plus,
  Wifi,
  X,
} from 'lucide-react';
import type {
  DetectionBox,
  DetectionFrame,
  StoreRecord,
  ZoneOverlayAlert,
} from '../types/retail.ts';

interface LiveDetectionPlayerProps {
  stores: StoreRecord[];
  activeStore: StoreRecord;
  detectionFrame: DetectionFrame;
  zoneAlert: ZoneOverlayAlert | null;
  onSelectStore: (storeId: number) => void;
  onAckZoneAlert: () => void;
  onOpenStreamConfig: () => void;
}

const BOX_PALETTE = {
  blue: {
    stroke: '#2563EB',
    fill: 'rgba(37, 99, 235, 0.06)',
    badge: '#2563EB',
    skeleton: '#38BDF8',
  },
  green: {
    stroke: '#34D399',
    fill: 'rgba(16, 185, 129, 0.05)',
    badge: '#34D399',
    skeleton: '#34D399',
  },
  purple: {
    stroke: '#6366F1',
    fill: 'rgba(99, 102, 241, 0.06)',
    badge: '#6366F1',
    skeleton: '#818CF8',
  },
  amber: {
    stroke: '#F59E0B',
    fill: 'rgba(245, 158, 11, 0.07)',
    badge: '#D97706',
    skeleton: '#FBBF24',
  },
};

function drawStoreFramePlaceholder(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
) {
  ctx.fillStyle = '#E8EEF5';
  ctx.fillRect(0, 0, w, h);
}

export function LiveDetectionPlayer({
  stores,
  activeStore,
  detectionFrame,
  zoneAlert,
  onSelectStore,
  onAckZoneAlert,
  onOpenStreamConfig,
}: LiveDetectionPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [storeMenuOpen, setStoreMenuOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  // Manage live video feed (Public Janus WebRTC, WebRTC WHEP, HLS, MP4, or demo loopback)
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    let cancelled = false;
    let rafId = 0;
    let pcSender: RTCPeerConnection | null = null;
    let pcReceiver: RTCPeerConnection | null = null;
    let hlsInstance: Hls | null = null;
    let localStream: MediaStream | null = null;
    let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
    let iceFallbackTimer: ReturnType<typeof setTimeout> | null = null;

    let mjpegImg: HTMLImageElement | null = null;
    setStreamError(null);

    async function setupDemoWebRtc(preferHttpStream = true) {
      const demoCanvas = document.createElement('canvas');
      demoCanvas.width = 1440;
      demoCanvas.height = 800;
      const ctx = demoCanvas.getContext('2d');
      if (!ctx) return;

      drawStoreFramePlaceholder(ctx, 1440, 800);

      // Load live producer MJPEG relay when available, falling back to static store asset
      const img = new Image();
      img.crossOrigin = 'anonymous';
      mjpegImg = img;
      let usingStaticFallback = false;

      img.onerror = () => {
        if (!cancelled && !usingStaticFallback) {
          usingStaticFallback = true;
          img.src = '/assets/aistudio/template_dummy_webrtc_b8bc220d.jpg';
        }
      };
      img.src = preferHttpStream
        ? '/api/webrtc/dummy/stream'
        : '/assets/aistudio/template_dummy_webrtc_b8bc220d.jpg';

      const renderLoop = () => {
        if (cancelled) return;
        if (img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, 0, 0, 1440, 800);
        }
        rafId = requestAnimationFrame(renderLoop);
      };
      rafId = requestAnimationFrame(renderLoop);

      // Bind canvas MediaStream immediately so <video> never shows blank white, then attach WebRTC loopback
      if (demoCanvas.captureStream) {
        localStream = demoCanvas.captureStream(15);
        if (videoEl) {
          videoEl.srcObject = localStream;
          videoEl.play().catch(() => {});
        }
        if (typeof RTCPeerConnection !== 'undefined') {
          try {
            pcSender = new RTCPeerConnection();
            pcReceiver = new RTCPeerConnection();

            pcSender.onicecandidate = (e) => {
              if (e.candidate && pcReceiver) {
                pcReceiver.addIceCandidate(e.candidate).catch(() => {});
              }
            };
            pcReceiver.onicecandidate = (e) => {
              if (e.candidate && pcSender) {
                pcSender.addIceCandidate(e.candidate).catch(() => {});
              }
            };
            pcReceiver.ontrack = (e) => {
              if (!cancelled && videoEl && e.streams[0]) {
                videoEl.srcObject = e.streams[0];
                videoEl.play().catch(() => {});
              }
            };

            localStream.getTracks().forEach((track) => {
              pcSender?.addTrack(track, localStream!);
            });

            const offer = await pcSender.createOffer();
            await pcSender.setLocalDescription(offer);
            await pcReceiver.setRemoteDescription(offer);
            const answer = await pcReceiver.createAnswer();
            await pcReceiver.setLocalDescription(answer);
            await pcSender.setRemoteDescription(answer);
          } catch {
            // Keep direct canvas MediaStream bound to <video>
          }
        }
      }
    }

    async function setupPublicJanusWebRtc(rawUrl: string) {
      try {
        const parsed = new URL(rawUrl);
        const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
        const mountpointId = Number(hashParams.get('mountpoint') || '1');
        const baseEndpoint = `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '');

        const tx = () => Math.random().toString(36).slice(2, 12);

        // 1. Create Janus session
        const createRes = await fetch(baseEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ janus: 'create', transaction: tx() }),
        });
        const createJson = (await createRes.json()) as { data?: { id: number } };
        const sessionId = createJson.data?.id;
        if (!sessionId || cancelled) throw new Error('Failed to create WebRTC session');

        // 2. Attach streaming plugin
        const attachRes = await fetch(`${baseEndpoint}/${sessionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            janus: 'attach',
            plugin: 'janus.plugin.streaming',
            transaction: tx(),
          }),
        });
        const attachJson = (await attachRes.json()) as { data?: { id: number } };
        const handleId = attachJson.data?.id;
        if (!handleId || cancelled) throw new Error('Failed to attach streaming plugin');

        // 3. Request watch on live mountpoint
        await fetch(`${baseEndpoint}/${sessionId}/${handleId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            janus: 'message',
            body: { request: 'watch', id: mountpointId },
            transaction: tx(),
          }),
        });

        // 4. Poll long-poll queue for JSEP offer
        let jsepOffer: RTCSessionDescriptionInit | null = null;
        for (let attempt = 0; attempt < 8 && !cancelled; attempt++) {
          const pollRes = await fetch(
            `${baseEndpoint}/${sessionId}?maxev=5&_=${Date.now()}`
          );
          const events = (await pollRes.json()) as Array<{
            jsep?: RTCSessionDescriptionInit;
          }>;
          const list = Array.isArray(events) ? events : [events];
          const found = list.find((ev) => ev?.jsep?.type === 'offer');
          if (found?.jsep) {
            jsepOffer = found.jsep;
            break;
          }
        }
        if (!jsepOffer || cancelled) {
          throw new Error('Timed out waiting for WebRTC SDP offer');
        }

        // 5. Establish RTCPeerConnection & bind remote video track
        pcReceiver = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });

        const remoteMediaStream = new MediaStream();
        let gotVideoFrame = false;

        pcReceiver.ontrack = (event) => {
          if (cancelled || !videoEl) return;
          if (event.track.kind === 'video') {
            remoteMediaStream.addTrack(event.track);
            videoEl.srcObject = remoteMediaStream;
            videoEl.play().catch(() => {});
            gotVideoFrame = true;
            if (iceFallbackTimer) {
              clearTimeout(iceFallbackTimer);
              iceFallbackTimer = null;
            }
          }
        };

        pcReceiver.onicecandidate = (event) => {
          if (cancelled) return;
          fetch(`${baseEndpoint}/${sessionId}/${handleId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              janus: 'trickle',
              candidate: event.candidate ? event.candidate : { completed: true },
              transaction: tx(),
            }),
          }).catch(() => {});
        };

        await pcReceiver.setRemoteDescription(jsepOffer);
        const answer = await pcReceiver.createAnswer();
        await pcReceiver.setLocalDescription(answer);

        // 6. Send SDP answer to start WebRTC media flow
        await fetch(`${baseEndpoint}/${sessionId}/${handleId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            janus: 'message',
            body: { request: 'start' },
            jsep: { type: answer.type, sdp: answer.sdp },
            transaction: tx(),
          }),
        });

        keepaliveTimer = setInterval(() => {
          fetch(`${baseEndpoint}/${sessionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ janus: 'keepalive', transaction: tx() }),
          }).catch(() => {});
        }, 25000);

        // If UDP/ICE is blocked by strict firewall after 5s, switch cleanly
        iceFallbackTimer = setTimeout(() => {
          if (!cancelled && !gotVideoFrame) {
            setStreamError('WebRTC ICE media blocked by network firewall. Showing fallback.');
            setupDemoWebRtc(false);
          }
        }, 5000);
      } catch (err) {
        if (!cancelled) {
          setStreamError(
            err instanceof Error
              ? `Public WebRTC unavailable (${err.message}). Showing fallback.`
              : 'Public WebRTC unavailable.'
          );
          await setupDemoWebRtc(false);
        }
      }
    }

    async function setupWhepWebRtc(whepUrl: string) {
      const isDummyProducerUrl = whepUrl.includes('/api/webrtc/dummy/');
      let whepResourceUrl: string | null = null;
      let switchedToRelay = false;

      const switchToDummyRelay = () => {
        if (cancelled || switchedToRelay) return;
        switchedToRelay = true;
        if (iceFallbackTimer) {
          clearTimeout(iceFallbackTimer);
          iceFallbackTimer = null;
        }
        pcReceiver?.close();
        pcReceiver = null;
        if (whepResourceUrl) {
          fetch(whepResourceUrl, { method: 'DELETE' }).catch(() => {});
          whepResourceUrl = null;
        }
        setupDemoWebRtc(true);
      };

      try {
        pcReceiver = new RTCPeerConnection({
          iceServers: isDummyProducerUrl ? [] : [{ urls: 'stun:stun.l.google.com:19302' }],
        });
        pcReceiver.addTransceiver('video', { direction: 'recvonly' });
        pcReceiver.addTransceiver('audio', { direction: 'recvonly' });

        const remoteMediaStream = new MediaStream();
        let gotFirstDecodedFrame = false;

        const onPlayingOrMetadata = () => {
          if (videoEl && videoEl.videoWidth > 0) {
            gotFirstDecodedFrame = true;
            if (iceFallbackTimer) {
              clearTimeout(iceFallbackTimer);
              iceFallbackTimer = null;
            }
          }
        };
        videoEl?.addEventListener('loadeddata', onPlayingOrMetadata, { once: true });

        pcReceiver.ontrack = (event) => {
          if (cancelled || !videoEl) return;
          if (event.track.kind === 'video') {
            if (event.streams[0]) {
              videoEl.srcObject = event.streams[0];
            } else {
              remoteMediaStream.addTrack(event.track);
              videoEl.srcObject = remoteMediaStream;
            }
            videoEl.play().catch(() => {});
          }
        };

        pcReceiver.oniceconnectionstatechange = () => {
          const state = pcReceiver?.iceConnectionState;
          if ((state === 'failed' || state === 'disconnected') && !gotFirstDecodedFrame) {
            if (isDummyProducerUrl) {
              switchToDummyRelay();
            }
          }
        };

        const offer = await pcReceiver.createOffer();
        await pcReceiver.setLocalDescription(offer);

        // Wait briefly for host + STUN ICE candidates before sending WHEP offer
        if (pcReceiver.iceGatheringState !== 'complete') {
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(resolve, 450);
            pcReceiver?.addEventListener('icegatheringstatechange', () => {
              if (pcReceiver?.iceGatheringState === 'complete') {
                clearTimeout(timeout);
                resolve();
              }
            });
          });
        }

        const offerSdp = pcReceiver.localDescription?.sdp || offer.sdp || '';
        const res = await fetch(whepUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: offerSdp,
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(errText || `WHEP endpoint returned ${res.status}`);
        }
        const loc = res.headers.get('location');
        if (loc) {
          whepResourceUrl = loc;
        }
        const answerSdp = await res.text();
        await pcReceiver.setRemoteDescription({ type: 'answer', sdp: answerSdp });

        // If Cloud Run / firewall blocks WebRTC UDP ICE within 2.5s, seamlessly relay producer stream over HTTP
        iceFallbackTimer = setTimeout(() => {
          if (!cancelled && !gotFirstDecodedFrame) {
            if (isDummyProducerUrl) {
              switchToDummyRelay();
            } else {
              setStreamError('WebRTC WHEP media timed out. Showing fallback preview.');
              setupDemoWebRtc(false);
            }
          }
        }, isDummyProducerUrl ? 2500 : 6500);
      } catch (err) {
        if (whepResourceUrl) {
          fetch(whepResourceUrl, { method: 'DELETE' }).catch(() => {});
        }
        if (!cancelled) {
          if (isDummyProducerUrl) {
            switchToDummyRelay();
          } else {
            setStreamError(
              err instanceof Error
                ? `${err.message} (showing fallback preview)`
                : 'WebRTC WHEP unreachable.'
            );
            await setupDemoWebRtc(false);
          }
        }
      }
    }

    if (activeStore.streamType === 'webrtc_public') {
      setupPublicJanusWebRtc(activeStore.streamUrl);
    } else if (activeStore.streamType === 'webrtc_whep') {
      setupWhepWebRtc(activeStore.streamUrl);
    } else if (activeStore.streamType === 'hls') {
      if (Hls.isSupported()) {
        hlsInstance = new Hls();
        hlsInstance.loadSource(activeStore.streamUrl);
        hlsInstance.attachMedia(videoEl);
        hlsInstance.on(Hls.Events.ERROR, () => {
          if (!cancelled) {
            setStreamError('HLS stream unavailable. Falling back to demo feed.');
            setupDemoWebRtc(false);
          }
        });
      } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.src = activeStore.streamUrl;
        videoEl.play().catch(() => {});
      }
    } else if (activeStore.streamType === 'mp4') {
      videoEl.srcObject = null;
      videoEl.src = activeStore.streamUrl;
      videoEl.play().catch(() => {
        if (!cancelled) {
          setStreamError('Video URL unavailable. Falling back to demo feed.');
          setupDemoWebRtc(false);
        }
      });
    } else {
      setupDemoWebRtc(true);
    }

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (keepaliveTimer) clearInterval(keepaliveTimer);
      if (iceFallbackTimer) clearTimeout(iceFallbackTimer);
      if (mjpegImg) {
        mjpegImg.src = '';
        mjpegImg = null;
      }
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }
      pcSender?.close();
      pcReceiver?.close();
      hlsInstance?.destroy();
      if (videoEl) {
        videoEl.srcObject = null;
        videoEl.removeAttribute('src');
      }
    };
  }, [activeStore.id, activeStore.streamType, activeStore.streamUrl]);

  // Draw UI-level YOLO Bounding Boxes & Pose Keypoints received via WebSocket
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    const videoEl = videoRef.current;
    if (!canvas) return;

    function drawDetections() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.scale(dpr, dpr);

      const viewW = rect.width;
      const viewH = rect.height;

      // Match video element's object-cover transform so bboxes & keypoints stay pixel-aligned
      const vidW = videoEl?.videoWidth || detectionFrame.imageWidth || 0;
      const vidH = videoEl?.videoHeight || detectionFrame.imageHeight || 0;
      let drawW = viewW;
      let drawH = viewH;
      let offX = 0;
      let offY = 0;
      if (vidW > 0 && vidH > 0) {
        const scale = Math.max(viewW / vidW, viewH / vidH);
        drawW = vidW * scale;
        drawH = vidH * scale;
        offX = (viewW - drawW) / 2;
        offY = (viewH - drawH) / 2;
      }

      for (const box of detectionFrame.detections) {
        drawSingleBox(ctx, box, drawW, drawH, offX, offY);
      }
      ctx.restore();
    }

    drawDetections();
    const observer = new ResizeObserver(drawDetections);
    observer.observe(canvas);
    videoEl?.addEventListener('loadedmetadata', drawDetections);
    videoEl?.addEventListener('resize', drawDetections);
    return () => {
      observer.disconnect();
      videoEl?.removeEventListener('loadedmetadata', drawDetections);
      videoEl?.removeEventListener('resize', drawDetections);
    };
  }, [detectionFrame, zoom]);

  function drawSingleBox(
    ctx: CanvasRenderingContext2D,
    box: DetectionBox,
    drawW: number,
    drawH: number,
    offX: number,
    offY: number
  ) {
    const [nx, ny, nw, nh] = box.bbox;
    const x = offX + nx * drawW;
    const y = offY + ny * drawH;
    const w = nw * drawW;
    const h = nh * drawH;

    const palette = BOX_PALETTE[box.color || 'blue'];

    // Box fill + crisp 1.5px stroke
    ctx.fillStyle = palette.fill;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = palette.stroke;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(x, y, w, h);

    // Pose skeleton lines & keypoints when provided
    if (box.keypoints && box.keypoints.length >= 9) {
      const kp = box.keypoints.map((p) => ({
        px: offX + p.x * drawW,
        py: offY + p.y * drawH,
      }));
      const bones: Array<[number, number]> = [
        [0, 1],
        [1, 2],
        [1, 3],
        [2, 4],
        [3, 5],
        [1, 6],
        [6, 7],
        [6, 8],
      ];
      if (kp.length >= 11) {
        bones.push([7, 9], [8, 10]);
      }

      ctx.strokeStyle = palette.skeleton;
      ctx.lineWidth = 1.6;
      for (const [a, b] of bones) {
        if (kp[a] && kp[b]) {
          ctx.beginPath();
          ctx.moveTo(kp[a].px, kp[a].py);
          ctx.lineTo(kp[b].px, kp[b].py);
          ctx.stroke();
        }
      }
      for (const pt of kp) {
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(pt.px, pt.py, 2.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = palette.stroke;
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
    }

    // Top-left solid label tag
    const pct = (box.confidence <= 1 ? box.confidence * 100 : box.confidence).toFixed(1);
    const labelText = box.label.endsWith('%') ? box.label : `${box.label} - ${pct}%`;

    ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
    const textMetrics = ctx.measureText(labelText);
    const padX = 5;
    const tagH = 16;
    const tagW = textMetrics.width + padX * 2;
    const tagY = Math.max(0, y - tagH);

    ctx.fillStyle = palette.badge;
    ctx.beginPath();
    ctx.roundRect(x, tagY, tagW, tagH, [3, 3, 0, 0]);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, x + padX, tagY + tagH / 2 + 0.5);
  }

  function handleToggleFullscreen() {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  }

  const totalGender = Math.max(1, activeStore.femaleCount + activeStore.maleCount);
  const femalePct = Math.round((activeStore.femaleCount / totalGender) * 100);
  const malePct = 100 - femalePct;

  return (
    <div
      ref={containerRef}
      className="bg-white rounded-[18px] border border-[#EAECEF] shadow-[0_2px_12px_rgba(15,23,42,0.03)] overflow-hidden flex flex-col"
    >
      {/* Live Video + WebSocket Bounding Box Viewport */}
      <div className="relative h-[370px] w-full bg-[#E8EEF5] overflow-hidden select-none">
        <div
          className="w-full h-full transition-transform duration-200 ease-out origin-center relative"
          style={{ transform: `scale(${zoom})` }}
        >
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            loop
            poster={
              activeStore.streamUrl.includes('/api/webrtc/dummy/')
                ? '/assets/aistudio/template_dummy_webrtc_b8bc220d.jpg'
                : undefined
            }
            className="w-full h-full object-cover"
          />
          <canvas
            ref={overlayCanvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />
        </div>

        {/* Top-Left Live & Store Selector Pill */}
        <div className="absolute top-3.5 left-3.5 z-20">
          <div className="relative">
            <div className="bg-white/95 backdrop-blur-sm rounded-[10px] shadow-[0_2px_8px_rgba(15,23,42,0.08)] border border-white/80 px-3 py-1.5 flex items-center gap-2.5 text-[12px]">
              <span className="flex items-center gap-1.5 font-medium text-[#111827]">
                <span className="w-2 h-2 rounded-full bg-[#EF4444]" />
                Live
              </span>
              <span className="h-3.5 w-[1px] bg-[#E5E7EB]" />
              <button
                type="button"
                onClick={() => setStoreMenuOpen((v) => !v)}
                className="flex items-center gap-1.5 font-medium text-[#111827] hover:text-[#2563EB] transition-colors whitespace-nowrap"
              >
                <span>
                  {activeStore.code} {activeStore.name}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-[#6B7280]" />
              </button>
            </div>

            {storeMenuOpen && (
              <div className="absolute left-0 mt-1.5 w-48 bg-white rounded-[12px] shadow-lg border border-[#EAECEF] py-1 z-30">
                {stores.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      onSelectStore(s.id);
                      setStoreMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-[12px] flex items-center justify-between hover:bg-[#F8FAFC] ${
                      s.id === activeStore.id
                        ? 'text-[#2563EB] font-semibold bg-[#EFF6FF]/60'
                        : 'text-[#374151]'
                    }`}
                  >
                    <span>
                      {s.code} {s.name}
                    </span>
                    <span className="text-[10.5px] text-[#9CA3AF]">{s.cameraModel}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Top-Right Frame Timestamp */}
        <div className="absolute top-4 right-4 z-20 text-[11px] font-medium text-white/95 drop-shadow-[0_1px_3px_rgba(15,23,42,0.55)] tabular-nums tracking-wide">
          {detectionFrame.frameTimestamp}
        </div>

        {/* Subtle Stream Fallback Notice (only when external stream failed) */}
        {streamError && (
          <div className="absolute bottom-3 left-3.5 z-20 bg-white/90 backdrop-blur-sm text-[11px] text-[#4B5563] px-2.5 py-1 rounded-md border border-[#E5E7EB] shadow-sm">
            {streamError}
          </div>
        )}

        {/* Floating Understaffed Zone Alert Card */}
        {zoneAlert && !alertDismissed && !zoneAlert.acknowledged && (
          <>
            <div
              className="absolute z-20 w-2.5 h-2.5 rounded-full bg-[#F59E0B] ring-4 ring-[#F59E0B]/25 pointer-events-none"
              style={{
                left: `${zoneAlert.anchorX * 100}%`,
                top: `${zoneAlert.anchorY * 100}%`,
                transform: 'translate(-50%, -50%)',
              }}
            />
            <div
              className="absolute z-20 w-[200px] bg-white/95 backdrop-blur-md rounded-[12px] shadow-[0_10px_28px_rgba(15,23,42,0.12)] border border-white p-3"
              style={{
                left: '58%',
                top: '44%',
              }}
            >
              <div className="flex items-start justify-between">
                <div className="w-6 h-6 rounded-[6px] bg-[#FEF3C7] text-[#D97706] flex items-center justify-center">
                  <AlertCircle className="w-3.5 h-3.5" />
                </div>
                <button
                  type="button"
                  onClick={() => setAlertDismissed(true)}
                  className="text-[#9CA3AF] hover:text-[#4B5563] p-0.5 rounded"
                  aria-label="Dismiss zone alert"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11.5px] leading-[1.45] text-[#374151] text-center my-2.5 px-1">
                {zoneAlert.messagePrefix}
                <span className="text-[#D97706] font-medium">
                  {zoneAlert.messageHighlight}
                </span>
                {zoneAlert.messageSuffix}
              </p>
              <button
                type="button"
                onClick={onAckZoneAlert}
                className="w-full py-1.5 rounded-[8px] border border-[#E5E7EB] bg-white hover:bg-[#F9FAFB] text-[11.5px] font-medium text-[#111827] transition-colors"
              >
                {zoneAlert.actionLabel}
              </button>
            </div>
          </>
        )}

        {/* Right-Side Vertical Camera Control Stack */}
        <div className="absolute right-3.5 bottom-3.5 z-20 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setZoom(1)}
            title="Reset Camera View"
            className="w-8 h-8 rounded-[9px] bg-white/95 backdrop-blur-sm border border-[#E5E7EB]/80 shadow-sm flex items-center justify-center text-[#374151] hover:text-[#111827] hover:bg-white transition-colors"
          >
            <Crosshair className="w-4 h-4" strokeWidth={1.75} />
          </button>

          <div className="rounded-[9px] bg-white/95 backdrop-blur-sm border border-[#E5E7EB]/80 shadow-sm flex flex-col divide-y divide-[#F1F5F9] overflow-hidden">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.2, Number((z + 0.2).toFixed(1))))}
              title="Zoom In"
              className="w-8 h-8 flex items-center justify-center text-[#374151] hover:text-[#111827] hover:bg-white transition-colors"
            >
              <Plus className="w-4 h-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(1, Number((z - 0.2).toFixed(1))))}
              title="Zoom Out"
              className="w-8 h-8 flex items-center justify-center text-[#374151] hover:text-[#111827] hover:bg-white transition-colors"
            >
              <Minus className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>

          <button
            type="button"
            onClick={handleToggleFullscreen}
            title="Toggle Fullscreen"
            className="w-8 h-8 rounded-[9px] bg-white/95 backdrop-blur-sm border border-[#E5E7EB]/80 shadow-sm flex items-center justify-center text-[#374151] hover:text-[#111827] hover:bg-white transition-colors"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" strokeWidth={1.75} />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" strokeWidth={1.75} />
            )}
          </button>
        </div>
      </div>

      {/* Camera & Floor Telemetry Strip */}
      <div className="grid grid-cols-1 md:grid-cols-[1.08fr_1fr_1.32fr] items-stretch px-5 py-4 bg-white border-t border-[#F1F3F5] gap-4">
        {/* Col 1: Camera Identity */}
        <div className="flex flex-col justify-between">
          <div className="flex items-start justify-between">
            {/* Clean CCTV Camera Line Illustration matching reference */}
            <svg
              width="52"
              height="34"
              viewBox="0 0 60 38"
              fill="none"
              aria-hidden="true"
              className="text-[#4B5563]"
            >
              <path
                d="M14 10 L42 6 L50 15 L22 20 Z"
                stroke="#4B5563"
                strokeWidth="1.3"
                fill="#F8FAFC"
                strokeLinejoin="round"
              />
              <path
                d="M14 10 L14 19 L22 24 L22 20"
                stroke="#4B5563"
                strokeWidth="1.3"
                fill="#E2E8F0"
                strokeLinejoin="round"
              />
              <path
                d="M50 15 L44 21 L22 24"
                stroke="#4B5563"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
              <path
                d="M12 22 L12 31 M12 27 L25 27 L31 23"
                stroke="#64748B"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <rect x="8" y="20" width="6" height="13" rx="1.5" stroke="#4B5563" strokeWidth="1.2" fill="#FFFFFF" />
            </svg>

            <button
              type="button"
              onClick={onOpenStreamConfig}
              title="Configure Stream URL & Detection API"
              className="text-[#6B7280] hover:text-[#111827] p-1 rounded-md hover:bg-gray-100 transition-colors"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-2">
            <div className="text-[15px] font-semibold text-[#111827] leading-tight">
              {activeStore.cameraLocation}
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-[#6B7280]">
              <span>
                model.{' '}
                <strong className="font-semibold text-[#111827]">
                  {activeStore.cameraModel}
                </strong>
              </span>
              <span className="flex items-center gap-1">
                signal.{' '}
                <strong className="font-semibold text-[#111827]">
                  {activeStore.signalStrength}
                </strong>
                <Wifi className="w-3.5 h-3.5 text-[#3B82F6] ml-0.5" />
              </span>
            </div>
          </div>
        </div>

        {/* Col 2: In store now & Staffing floor counts */}
        <div className="md:border-l md:border-[#F1F3F5] md:pl-5 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11.5px] text-[#6B7280]">In store now</div>
              <div className="text-[19px] font-semibold text-[#111827] tabular-nums leading-tight mt-0.5">
                {activeStore.inStoreNow}
              </div>
            </div>
            {/* Dotted Crowd Matrix Icon */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              {[
                [12, 4],
                [10, 7], [12, 7], [14, 7],
                [7, 10], [10, 10], [12, 10], [14, 10], [17, 10],
                [7, 13], [10, 13], [12, 13], [14, 13], [17, 13],
                [9, 16], [12, 16], [15, 16],
                [9, 19], [15, 19],
              ].map(([cx, cy], idx) => (
                <circle key={idx} cx={cx} cy={cy} r="1.15" fill="#2563EB" />
              ))}
            </svg>
          </div>

          <div className="mt-3 space-y-1.5 text-[11.5px]">
            <div className="flex items-center justify-between">
              <span className="text-[#6B7280]">Staff on floor</span>
              <span className="font-semibold text-[#111827] tabular-nums">
                {activeStore.staffOnFloor}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#6B7280]">Customer waiting</span>
              <span className="font-semibold text-[#111827] tabular-nums">
                {activeStore.customerWaiting}
              </span>
            </div>
          </div>
        </div>

        {/* Col 3: Top age range & Female/Male bar */}
        <div className="md:border-l md:border-[#F1F3F5] md:pl-5 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11.5px] text-[#6B7280]">
                Top age range customer
              </div>
              <div className="text-[19px] font-semibold text-[#111827] tabular-nums leading-tight mt-0.5">
                {activeStore.topAgeRange}
              </div>
            </div>
            {/* Dotted Target Ring Matrix Icon */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, idx) => {
                const rad = (deg * Math.PI) / 180;
                return (
                  <circle
                    key={idx}
                    cx={12 + Math.cos(rad) * 7.5}
                    cy={12 + Math.sin(rad) * 7.5}
                    r="1.1"
                    fill="#2563EB"
                  />
                );
              })}
              {[0, 90, 180, 270].map((deg, idx) => {
                const rad = (deg * Math.PI) / 180;
                return (
                  <circle
                    key={`in-${idx}`}
                    cx={12 + Math.cos(rad) * 3.8}
                    cy={12 + Math.sin(rad) * 3.8}
                    r="1"
                    fill="#60A5FA"
                  />
                );
              })}
              <circle cx="12" cy="12" r="1.2" fill="#2563EB" />
            </svg>
          </div>

          <div className="mt-3">
            <div className="flex items-center gap-[3px] h-[20px]">
              <div
                className="h-full bg-[#7C3AED] rounded-l-[4px] flex items-center pl-2 text-[10.5px] font-medium text-white tabular-nums transition-all duration-300"
                style={{ width: `${femalePct}%` }}
              >
                {activeStore.femaleCount}
              </div>
              <div
                className="h-full bg-[#3B82F6] rounded-r-[4px] flex items-center pl-2 text-[10.5px] font-medium text-white tabular-nums transition-all duration-300"
                style={{ width: `${malePct}%` }}
              >
                {activeStore.maleCount}
              </div>
            </div>
            <div className="flex items-center justify-between mt-1.5 text-[11px] text-[#6B7280]">
              <span className="flex items-center gap-1">
                <span className="text-[#7C3AED] font-semibold">♀</span>
                <span>Female</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="text-[#3B82F6] font-semibold">♂</span>
                <span>Male</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
