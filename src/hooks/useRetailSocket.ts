import { useEffect, useRef, useState } from 'react';
import type { DashboardPayload, DetectionFrame } from '../types/retail.ts';

interface SocketMessage {
  type: 'detections:frame' | 'metrics:updated';
  storeId: number;
  payload: unknown;
}

export function useRetailSocket(
  activeStoreId: number,
  onMetricsUpdated?: (payload: DashboardPayload) => void
) {
  const [latestFrame, setLatestFrame] = useState<DetectionFrame | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const onMetricsRef = useRef(onMetricsUpdated);
  onMetricsRef.current = onMetricsUpdated;

  const activeStoreRef = useRef(activeStoreId);
  activeStoreRef.current = activeStoreId;

  useEffect(() => {
    let closedByCleanup = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    function connect() {
      if (closedByCleanup) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/ws?storeId=${activeStoreRef.current}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setWsConnected(true);
        ws.send(
          JSON.stringify({
            type: 'subscribe',
            storeId: activeStoreRef.current,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as SocketMessage;
          if (msg.type === 'detections:frame') {
            const frame = msg.payload as DetectionFrame;
            if (frame.storeId === activeStoreRef.current) {
              setLatestFrame(frame);
            }
          } else if (msg.type === 'metrics:updated') {
            const payload = msg.payload as DashboardPayload;
            onMetricsRef.current?.(payload);
          }
        } catch {
          // ignore malformed socket frame
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!closedByCleanup) {
          const delay = Math.min(5000, 600 * Math.pow(1.5, attempt++));
          reconnectTimer = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      closedByCleanup = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  useEffect(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'subscribe', storeId: activeStoreId }));
    }
  }, [activeStoreId]);

  return { latestFrame, wsConnected };
}
