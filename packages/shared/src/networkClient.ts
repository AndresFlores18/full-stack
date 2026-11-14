/**
 * Puertos dedicados para separar el tráfico de ENTRADA (Sensores/ESP32/Raspi)
 * y SALIDA (Clientes Web/iPad) evitando congestión de datos.
 */
export const OUTBOUND_PORT = 8765; // Puerto exclusivo de SALIDA (Server -> Web / iPad)
export const INBOUND_PORT = 8766;  // Puerto exclusivo de ENTRADA (ESP32 / Raspi / D415 -> Server)

export interface ServerEndpoints {
  /** WebSocket de SALIDA para clientes (Dashboard Web / iPad) - Puerto 8765 */
  wsUrl: string;
  /** HTTP Base de SALIDA para descargar mapas/snapshots - Puerto 8765 */
  httpBaseUrl: string;
  /** WebSocket de ENTRADA para que sensores/Raspi inyecten datos - Puerto 8766 */
  ingestWsUrl: string;
  /** HTTP Endpoint de ENTRADA (POST /api/ingest) para sensores - Puerto 8766 */
  ingestHttpUrl: string;
}

/**
 * Resuelve cualquier IP o URL ingresada por el usuario a los dos puertos separados:
 * - Salida (Lectura/Suscripción): 8765
 * - Entrada (Ingesta/Sensores): 8766
 */
export function resolveServerEndpoints(rawInput: string): ServerEndpoints {
  const trimmed = (rawInput || `ws://localhost:${OUTBOUND_PORT}`).trim().replace(/\/+$/, '');

  let hostOnly = 'localhost';
  let outPort = OUTBOUND_PORT;
  let isSecure = false;

  const withoutProto = trimmed.replace(/^(wss?|https?):\/\//, (match) => {
    if (match === 'wss://' || match === 'https://') isSecure = true;
    return '';
  });

  const hostPortPart = withoutProto.split('/')[0] || 'localhost';
  const colonIdx = hostPortPart.lastIndexOf(':');
  if (colonIdx !== -1 && /^\d+$/.test(hostPortPart.slice(colonIdx + 1))) {
    hostOnly = hostPortPart.slice(0, colonIdx) || 'localhost';
    outPort = Number(hostPortPart.slice(colonIdx + 1)) || OUTBOUND_PORT;
  } else {
    hostOnly = hostPortPart;
  }

  const wsProto = isSecure ? 'wss' : 'ws';
  const httpProto = isSecure ? 'https' : 'http';
  const inPort = outPort === OUTBOUND_PORT ? INBOUND_PORT : outPort + 1;

  return {
    wsUrl: `${wsProto}://${hostOnly}:${outPort}`,
    httpBaseUrl: `${httpProto}://${hostOnly}:${outPort}`,
    ingestWsUrl: `${wsProto}://${hostOnly}:${inPort}`,
    ingestHttpUrl: `${httpProto}://${hostOnly}:${inPort}/api/ingest`,
  };
}

/**
 * Envía un paquete de telemetría o mapa al puerto exclusivo de ENTRADA (8766)
 * para no congestionar el canal de salida (8765).
 */
export async function pushToInboundPort(
  payload: Record<string, any>,
  serverInputUrl?: string
): Promise<boolean> {
  if (typeof fetch === 'undefined') return false;
  const { ingestHttpUrl } = resolveServerEndpoints(serverInputUrl || `ws://localhost:${OUTBOUND_PORT}`);
  try {
    const res = await fetch(ingestHttpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}
