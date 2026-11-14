import { create } from 'zustand';
import {
  DroneData,
  EvaData,
  NodeRecord,
  SatelliteData,
  StationData,
  TelemetryEnvelope,
} from './types';

declare const process: any;
declare const window: any;

export const STALE_TIMEOUT_MS = 5000; // > 5 segundos sin señal = "SIN ENLACE"

/**
 * Helper isStale:
 * Marca verdadero si han transcurrido más de 5 segundos desde el último paquete recibido.
 */
export function isStale(
  node?: { lastSeen: number } | null,
  now: number = Date.now()
): boolean {
  if (!node || !node.lastSeen) return true;
  return now - node.lastSeen > STALE_TIMEOUT_MS;
}

/**
 * Normaliza el payload extraído según el Contrato v1.0:
 * Soporta tanto `{ payload: { [node_id]: { ... } } }` como `{ payload: { ... } }`.
 */
function extractDataFromEnvelope(envelope: TelemetryEnvelope): any {
  if (!envelope || !envelope.payload) return envelope;
  const p = envelope.payload;
  const nodeId = envelope.node_id;

  if (p[nodeId]) {
    return p[nodeId];
  }
  return p;
}

export interface BackboneStoreState {
  nodes: Record<string, NodeRecord>;
  isConnected: boolean;
  lastConnected: number | null;
  error: string | null;

  // Acciones
  ingestEnvelope: (envelope: TelemetryEnvelope) => void;
  setConnectionStatus: (connected: boolean, error?: string | null) => void;
  clearNodes: () => void;

  // Selectores tipados de conveniencia
  getNode: <T = any>(node_id: string) => NodeRecord<T> | undefined;
  getEva: () => NodeRecord<EvaData> | undefined;
  getDrone: () => NodeRecord<DroneData> | undefined;
  getStation: () => NodeRecord<StationData> | undefined;
  getSatellite: () => NodeRecord<SatelliteData> | undefined;
}

export const useBackboneStore = create<BackboneStoreState>((set, get) => ({
  nodes: {},
  isConnected: false,
  lastConnected: null,
  error: null,

  ingestEnvelope: (envelope: TelemetryEnvelope) => {
    if (!envelope || !envelope.node_id) return;
    const now = Date.now();
    const data = extractDataFromEnvelope(envelope);

    set((state) => ({
      nodes: {
        ...state.nodes,
        [envelope.node_id]: {
          node_id: envelope.node_id,
          lastSeen: now,
          data,
          raw: envelope,
        },
      },
    }));
  },

  setConnectionStatus: (connected: boolean, error: string | null = null) => {
    set({
      isConnected: connected,
      lastConnected: connected ? Date.now() : get().lastConnected,
      error,
    });
  },

  clearNodes: () => set({ nodes: {} }),

  getNode: <T = any>(node_id: string) => {
    return get().nodes[node_id] as NodeRecord<T> | undefined;
  },

  getEva: () => {
    return get().nodes['eva_esp32'] as NodeRecord<EvaData> | undefined;
  },

  getDrone: () => {
    return get().nodes['drone_cv'] as NodeRecord<DroneData> | undefined;
  },

  getStation: () => {
    return get().nodes['station_esp32'] as NodeRecord<StationData> | undefined;
  },

  getSatellite: () => {
    return get().nodes['satellite_esp32'] as NodeRecord<SatelliteData> | undefined;
  },
}));

/**
 * Conexión WebSocket a BACKBONE_URL con reconexión automática y backoff
 */
let activeSocket: WebSocket | null = null;
let reconnectTimer: any = null;
let currentDelay = 1000;
const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 10000;
const BACKOFF_MULTIPLIER = 1.5;

let configuredUrl: string = 'ws://localhost:8765';

export function getBackboneUrl(): string {
  if (configuredUrl) return configuredUrl;

  if (typeof process !== 'undefined' && process.env) {
    if (process.env.EXPO_PUBLIC_BACKBONE_URL) return process.env.EXPO_PUBLIC_BACKBONE_URL;
    if (process.env.VITE_BACKBONE_URL) return process.env.VITE_BACKBONE_URL;
    if (process.env.BACKBONE_URL) return process.env.BACKBONE_URL;
  }

  if (typeof window !== 'undefined') {
    const host = window.location.hostname || 'localhost';
    return `ws://${host}:8765`;
  }

  return 'ws://localhost:8765';
}

export function setBackboneUrl(url: string) {
  configuredUrl = url;
  if (activeSocket) {
    disconnectBackbone();
    connectBackbone(url);
  }
}

export function connectBackbone(customUrl?: string) {
  if (customUrl) {
    configuredUrl = customUrl;
  }
  const url = getBackboneUrl();

  if (activeSocket && (activeSocket.readyState === WebSocket.OPEN || activeSocket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  try {
    const ws = new WebSocket(url);
    activeSocket = ws;

    ws.onopen = () => {
      currentDelay = INITIAL_RECONNECT_DELAY_MS;
      useBackboneStore.getState().setConnectionStatus(true, null);
      console.log(`[Backbone WS] Enlace establecido con éxito en ${url}`);
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            useBackboneStore.getState().ingestEnvelope(item as TelemetryEnvelope);
          }
        } else if (parsed && parsed.node_id) {
          useBackboneStore.getState().ingestEnvelope(parsed as TelemetryEnvelope);
        }
      } catch (err) {
        console.warn('[Backbone WS] Error procesando paquete:', err, event.data);
      }
    };

    ws.onerror = (err) => {
      console.warn('[Backbone WS] Error en socket:', err);
      useBackboneStore.getState().setConnectionStatus(false, 'Fallo de enlace');
    };

    ws.onclose = () => {
      useBackboneStore.getState().setConnectionStatus(false, 'Desconectado');
      activeSocket = null;
      scheduleReconnect();
    };
  } catch (error: any) {
    useBackboneStore.getState().setConnectionStatus(false, error?.message || 'Error de conexión');
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  console.log(`[Backbone WS] Reintentando conexión en ${Math.round(currentDelay)}ms...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    currentDelay = Math.min(currentDelay * BACKOFF_MULTIPLIER, MAX_RECONNECT_DELAY_MS);
    connectBackbone();
  }, currentDelay);
}

export function disconnectBackbone() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (activeSocket) {
    activeSocket.onclose = null;
    activeSocket.close();
    activeSocket = null;
  }
  useBackboneStore.getState().setConnectionStatus(false, null);
}

export function useBackbone() {
  return useBackboneStore();
}
