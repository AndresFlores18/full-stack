import { DroneData, TelemetryEnvelope } from './types';

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
 * Normaliza los datos de drone_cv provenientes del formato RealSense D415 (carpeta data/)
 * o del formato Contrato v1.0, garantizando compatibilidad total en Web e iPad.
 */
export function normalizeDronePayload(
  raw: any,
  topLevelImages?: any,
  topLevelMapState?: any,
  existingMapState?: any
): DroneData {
  if (!raw || typeof raw !== 'object') {
    return {
      drone_pos: [1.5, 5.4, 0.3],
      safe_path: false,
      max_slope_deg: 0,
      imu: { yaw: 0, pitch: 0, roll: 0 },
      obstacles: [],
    };
  }

  const altitude =
    typeof raw.altitude_m === 'number'
      ? raw.altitude_m
      : Array.isArray(raw.drone_pos) && typeof raw.drone_pos[2] === 'number'
      ? raw.drone_pos[2]
      : 0.3;

  const poseX =
    raw.navigation?.rover_pose?.x_m ??
    (Array.isArray(raw.drone_pos) ? raw.drone_pos[0] : 1.5);
  const poseY =
    raw.navigation?.rover_pose?.y_m ??
    (Array.isArray(raw.drone_pos) ? raw.drone_pos[1] : 5.4);

  const safePath =
    typeof raw.safe_path === 'boolean'
      ? raw.safe_path
      : typeof raw.safe_corridor === 'boolean'
      ? raw.safe_corridor
      : false;

  const maxSlope =
    typeof raw.max_slope_deg === 'number'
      ? raw.max_slope_deg
      : typeof raw.max_incline_deg === 'number'
      ? raw.max_incline_deg
      : 0;

  const rawObstacles = Array.isArray(raw.obstacles) ? raw.obstacles : [];
  const normalizedObstacles = rawObstacles.map((obs: any, idx: number) => {
    const dist = typeof obs.distance_m === 'number' ? obs.distance_m : 1.0;
    const bearingRad =
      ((typeof obs.bearing_deg === 'number' ? obs.bearing_deg : 0) * Math.PI) / 180;

    // Proyección de coordenadas polares (distance_m, bearing_deg) desde la cámara RealSense D415
    // al plano del mapa táctico (10x10m) con origen en la posición del dron/rover [1.5, 5.4]
    const x =
      typeof obs.x === 'number'
        ? obs.x
        : Number(
            Math.max(0.4, Math.min(9.6, 1.5 + dist * Math.cos(bearingRad) * 1.6)).toFixed(2)
          );
    const y =
      typeof obs.y === 'number'
        ? obs.y
        : Number(
            Math.max(0.4, Math.min(9.6, 5.4 + dist * Math.sin(bearingRad) * 1.6)).toFixed(2)
          );

    const mag = obs.height_m ?? obs.depth_m ?? 0.25;
    const radius =
      typeof obs.radius === 'number'
        ? obs.radius
        : Number(Math.max(0.18, Math.min(0.45, 0.16 + mag * 0.22)).toFixed(2));

    let severity = obs.severity;
    if (!severity) {
      if (dist < 0.7 || mag > 0.6) severity = 'critical';
      else if (dist < 1.5 || mag > 0.3) severity = 'high';
      else severity = 'medium';
    }

    return {
      ...obs,
      id: obs.id ?? idx + 1,
      x,
      y,
      radius,
      severity,
    };
  });

  return {
    ...raw,
    drone_pos: [
      Number(poseX.toFixed(2)),
      Number(poseY.toFixed(2)),
      Number(altitude.toFixed(2)),
    ],
    altitude_m: Number(altitude.toFixed(2)),
    safe_path: safePath,
    safe_corridor: safePath,
    max_slope_deg: Number(maxSlope.toFixed(1)),
    max_incline_deg: Number(maxSlope.toFixed(1)),
    imu: raw.imu ?? { yaw: 0, pitch: 0, roll: 0 },
    obstacles: normalizedObstacles,
    edge_fps: raw.edge_fps,
    navigation: raw.navigation,
    images: raw.images ?? topLevelImages,
    map_state: raw.map_state ?? topLevelMapState ?? existingMapState,
  };
}

/**
 * Extrae y normaliza el payload según el Contrato v1.0 y el formato RealSense D415 (data/).
 */
export function extractDataFromEnvelope(
  envelope: TelemetryEnvelope,
  existingMapState?: any
): any {
  if (!envelope) return envelope;
  const nodeId = envelope.node_id ?? envelope.node;

  let extracted: any = envelope;
  if (envelope.payload) {
    const p = envelope.payload;
    extracted = nodeId && p[nodeId] ? p[nodeId] : p;
  } else if (envelope.data) {
    extracted = envelope.data;
  }

  if (nodeId === 'drone_cv') {
    return normalizeDronePayload(
      extracted,
      envelope.images ?? envelope.payload?.images,
      envelope.map_state ?? envelope.payload?.map_state,
      existingMapState
    );
  }

  return extracted;
}

