/**
 * Utilidades de resolución de IP externa y endpoints WebSocket / HTTP para el servidor de mapas.
 */
export function resolveServerEndpoints(rawInput: string): {
  wsUrl: string;
  httpBaseUrl: string;
} {
  const trimmed = (rawInput || 'ws://localhost:8765').trim().replace(/\/+$/, '');
  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
    const httpBaseUrl = trimmed.replace(/^wss?:\/\//, (m) =>
      m === 'wss://' ? 'https://' : 'http://'
    );
    return { wsUrl: trimmed, httpBaseUrl };
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const wsUrl = trimmed.replace(/^https?:\/\//, (m) =>
      m === 'https://' ? 'wss://' : 'ws://'
    );
    return { wsUrl, httpBaseUrl: trimmed };
  }
  const hasPort = /:\d+$/.test(trimmed);
  const hostPort = hasPort ? trimmed : `${trimmed}:8765`;
  return {
    wsUrl: `ws://${hostPort}`,
    httpBaseUrl: `http://${hostPort}`,
  };
}

