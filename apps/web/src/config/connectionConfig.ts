import { DroneData, DroneObstacle } from '@martian/shared';

/**
 * PASO 1: Configuración Modular de Modos de Conexión
 * - 'local_esp': Información proporcionada directamente por el ESP32 (o simulador local).
 * - 'online_raspi': Información centralizada por la Raspberry Pi (Centro de Mando / Backbone).
 */
export type OperationMode = 'local_esp' | 'online_raspi';

export interface ModeEndpointConfig {
  id: OperationMode;
  label: string;
  shortName: string;
  description: string;
  defaultWsUrl: string;
  sourceLabel: string;
}

export const CONNECTION_MODES: Record<OperationMode, ModeEndpointConfig> = {
  local_esp: {
    id: 'local_esp',
    label: 'Modo Local (ESP32 Directo)',
    shortName: 'LOCAL • ESP32',
    description: 'Lectura directa desde red local AP del ESP32 o emulador local sin pasar por servidor central.',
    defaultWsUrl: 'ws://localhost:8765', // Editable en UI (ej. ws://192.168.4.1:81 para ESP32 AP)
    sourceLabel: 'ESP32 Serial / Local WS',
  },
  online_raspi: {
    id: 'online_raspi',
    label: 'Modo En Línea (Raspberry Pi - Centro de Mando)',
    shortName: 'EN LÍNEA • RASPBERRY PI',
    description: 'Telemetría y topografía fusionadas por la Raspberry Pi (Centro de Mando y visión de Berni).',
    defaultWsUrl: 'ws://192.168.1.100:8765', // Editable en UI a la IP de la Raspberry Pi
    sourceLabel: 'Raspberry Pi 4 (Centro de Mando)',
  },
};

/**
 * PASO 2: Definición del Dataset Topográfico y Adaptador para los datos de Bernardo (Berni)
 * Define qué estructura de datos alimenta al Mapa Topográfico 2D y cómo se normaliza
 * lo que envía Berni desde la cámara RealSense D415 / Raspberry Pi.
 */
export interface TopographicPeakOrPit {
  id: string;
  x: number;         // Coordenada X en metros (mapa local 0..10m)
  y: number;         // Coordenada Y en metros (mapa local 0..10m)
  elevation: number; // Altura/nivel topográfico (ej. 18m a 42m como en el plano topográfico)
  spread: number;    // Radio de influencia de la colina o cráter en metros
}

export interface BerniTopographyInput {
  drone_pos: [number, number, number];
  safe_path: boolean;
  max_slope_deg: number;
  obstacles: DroneObstacle[];
  /**
   * Opcional: Si Berni envía una matriz de elevación (DEM / Depth Grid) o puntos [x, y, z]
   * desde la cámara de profundidad RealSense D415:
   */
  elevation_points?: Array<{ x: number; y: number; z: number }>;
  waypoints?: Array<[number, number]>;
}

export interface MartianTerrainDataset {
  widthMeters: number;
  heightMeters: number;
  minElevation: number;
  maxElevation: number;
  contourStep: number; // Cada cuántos metros dibujar una línea topográfica (ej. cada 1m o 2m)
  features: TopographicPeakOrPit[];
  obstacles: DroneObstacle[];
  dronePos: [number, number, number];
  safePath: boolean;
  maxSlopeDeg: number;
  waypoints: Array<[number, number]>;
}

/**
 * Topología base del terreno marciano (inspirada en las curvas de nivel 19..40 del plano de referencia).
 * Se combina dinámicamente con los obstáculos y lecturas en tiempo real que manda Berni.
 */
export const BASE_MARTIAN_FEATURES: TopographicPeakOrPit[] = [
  // Colina principal noroeste (niveles 30 -> 40)
  { id: 'hill-main', x: 3.8, y: 3.4, elevation: 14.5, spread: 2.3 },
  // Meseta secundaria sureste (niveles 35 -> 39.9)
  { id: 'ridge-east', x: 7.0, y: 5.8, elevation: 11.5, spread: 1.9 },
  // Elevación noreste (niveles 32 -> 34)
  { id: 'hill-ne', x: 9.2, y: 4.2, elevation: 8.0, spread: 1.7 },
  // Cráter / depresión sur (niveles 24 -> 19)
  { id: 'crater-south', x: 4.3, y: 8.6, elevation: -9.5, spread: 1.3 },
  // Valle norte
  { id: 'valley-north', x: 7.2, y: 0.9, elevation: -6.0, spread: 1.6 },
];

/**
 * Función generadora que convierte los datos crudos de `drone_cv` (Berni) + topología base
 * en un Dataset unificado listo para graficar las líneas topográficas 2D.
 */
export function buildTopographicDataset(
  droneData?: DroneData | BerniTopographyInput | null,
  contourStep: number = 1.5
): MartianTerrainDataset {
  const dynamicFeatures: TopographicPeakOrPit[] = [...BASE_MARTIAN_FEATURES];

  const obstacles = droneData?.obstacles ?? [];
  const dronePos: [number, number, number] = droneData?.drone_pos ?? [1.5, 1.5, 1.5];
  const safePath = droneData?.safe_path ?? true;
  const maxSlopeDeg = droneData?.max_slope_deg ?? 12.0;

  // Si Berni envía obstáculos detectados por visión artificial, también deforman
  // ligeramente la topología local (rocas/montículos) además de marcarse como alertas:
  obstacles.forEach((obs, idx) => {
    const heightBoost =
      obs.severity === 'critical' || obs.severity === 'high' ? 4.5 : 2.5;
    dynamicFeatures.push({
      id: `berni-obs-${idx}`,
      // Escalamos coordenadas locales del dron (0..4m) al lienzo topográfico (0..10m)
      x: Math.min(9.5, Math.max(0.5, obs.x * 2.2)),
      y: Math.min(9.5, Math.max(0.5, obs.y * 2.2)),
      elevation: heightBoost,
      spread: Math.max(0.45, obs.radius * 2.0),
    });
  });

  // Si Berni envía puntos de elevación directos (elevation_points), los agregamos al dataset:
  const customInput = droneData as BerniTopographyInput | undefined;
  if (customInput?.elevation_points && Array.isArray(customInput.elevation_points)) {
    customInput.elevation_points.forEach((pt, idx) => {
      dynamicFeatures.push({
        id: `berni-pt-${idx}`,
        x: pt.x,
        y: pt.y,
        elevation: pt.z,
        spread: 0.8,
      });
    });
  }

  return {
    widthMeters: 10,
    heightMeters: 10,
    minElevation: 18,
    maxElevation: 41,
    contourStep,
    features: dynamicFeatures,
    obstacles,
    dronePos,
    safePath,
    maxSlopeDeg,
    waypoints: customInput?.waypoints ?? [
      [1.2, 3.5],
      [3.8, 4.1],
      [6.8, 6.2],
      [9.0, 5.8],
    ],
  };
}

/**
 * Calcula la elevación Z (en metros, rango ~19 a ~40) para cualquier coordenada (x, y) en metros.
 */
export function sampleElevationAt(x: number, y: number, dataset: MartianTerrainDataset): number {
  // Nivel base marciano (26m) + gradiente suave
  let z = 26.5 + 1.2 * Math.sin(x * 0.45) + 1.0 * Math.cos(y * 0.4);

  for (const feat of dataset.features) {
    const dx = x - feat.x;
    const dy = y - feat.y;
    const distSq = dx * dx + dy * dy;
    const sigmaSq = feat.spread * feat.spread;
    z += feat.elevation * Math.exp(-distSq / (2 * sigmaSq));
  }

  return z;
}

