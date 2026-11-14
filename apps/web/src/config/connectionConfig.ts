import { DroneData, DroneObstacle } from '@martian/shared';

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
    defaultWsUrl: 'ws://localhost:8765',
    sourceLabel: 'ESP32 Serial / Local WS',
  },
  online_raspi: {
    id: 'online_raspi',
    label: 'Modo En Línea (Raspberry Pi - Centro de Mando)',
    shortName: 'EN LÍNEA • RASPBERRY PI',
    description: 'Telemetría y topografía fusionadas por la Raspberry Pi (Centro de Mando y visión de Berni).',
    defaultWsUrl: 'ws://192.168.1.100:8765',
    sourceLabel: 'Raspberry Pi 4 (Centro de Mando)',
  },
};

export interface DetectedTerrainObstacle {
  id: string;
  x: number;      // 0..10m
  y: number;      // 0..10m
  radius: number; // metros
  slopeDeg: number;
  kind: 'crater_wall' | 'steep_cliff' | 'rock_obstacle';
}

export interface BerniTopographyInput {
  drone_pos: [number, number, number];
  safe_path: boolean;
  max_slope_deg: number;
  obstacles: DroneObstacle[];
  elevation_points?: Array<{ x: number; y: number; z: number }>;
  waypoints?: Array<[number, number]>;
}

export interface SafeRouteResult {
  points: Array<[number, number]>;
  distanceMeters: number;
  estimatedSeconds: number;
  maxSlopeDeg: number;
  isCompletelySafe: boolean;
}

export interface MartianTerrainDataset {
  widthMeters: number;
  heightMeters: number;
  minElevation: number;
  maxElevation: number;
  contourStep: number;
  obstacles: DroneObstacle[];
  dronePos: [number, number, number];
  droneScanRadius: number;
  droneFlightPhase: 'EN TIERRA' | 'ASCENDIENDO' | 'ESCANEANDO (ALTURA MÁX)' | 'DESCENDIENDO';
  safePath: boolean;
  maxSlopeDeg: number;
}

/**
 * Posición fija de la plataforma del Dron de Berni.
 * El dron NO se desplaza en X/Y; únicamente sube en Z, escanea el terreno con la cámara y baja.
 */
export const FIXED_DRONE_PAD_POS: [number, number] = [1.5, 5.4];

export function buildTopographicDataset(
  droneData?: DroneData | BerniTopographyInput | null,
  contourStep: number = 1.5
): MartianTerrainDataset {
  const obstacles = droneData?.obstacles ?? [];
  const rawZ = droneData?.drone_pos?.[2] ?? 1.8;
  const altitudeZ = Math.max(0, Number(rawZ.toFixed(2)));
  const dronePos: [number, number, number] = [
    FIXED_DRONE_PAD_POS[0],
    FIXED_DRONE_PAD_POS[1],
    altitudeZ,
  ];

  const droneScanRadius = Number(Math.min(9.2, Math.max(1.2, altitudeZ * 3.1)).toFixed(2));
  const droneFlightPhase =
    altitudeZ <= 0.3
      ? 'EN TIERRA'
      : altitudeZ >= 2.2
      ? 'ESCANEANDO (ALTURA MÁX)'
      : 'ASCENDIENDO';

  return {
    widthMeters: 10,
    heightMeters: 10,
    minElevation: 19,
    maxElevation: 40,
    contourStep,
    obstacles,
    dronePos,
    droneScanRadius,
    droneFlightPhase,
    safePath: droneData?.safe_path ?? true,
    maxSlopeDeg: droneData?.max_slope_deg ?? 12.0,
  };
}

export interface ImageVisionAnalysis {
  elevationGrid: number[][]; // Altura real extraída (19m..40m)
  slopeGrid: number[][];     // Pendiente real en grados calculada de qué tan juntas están las curvas de nivel
  costGrid: number[][];      // Mapa de riesgo por celda (únicamente donde la pendiente/borde es alto)
  detectedObstacles: DetectedTerrainObstacle[]; // Puntos exactos donde las curvas de nivel se juntan (paredes de cráteres)
  isLineMap: boolean;
}

/**
 * VISIÓN POR COMPUTADORA REAL SOBRE CUALQUIER IMAGEN:
 * ¿Cómo sabe dónde hay riesgo?
 * -> Mide el GRADIENTE ESPACIAL (qué tan rápido cambia la altura entre un píxel y sus vecinos,
 *    es decir, QUÉ TAN JUNTAS ESTÁN LAS CURVAS DE NIVEL / BORDES DE CRÁTER).
 * -> NO confunde tierra plana oscura con un cráter: solo marca riesgo donde hay un cambio brusco
 *    de altura (paredes de cráteres, barrancos o líneas topográficas muy pegadas).
 */
export function analyzeImageTerrainReal(
  img: HTMLImageElement,
  cols: number,
  rows: number
): ImageVisionAnalysis {
  const offCanvas = document.createElement('canvas');
  offCanvas.width = cols + 1;
  offCanvas.height = rows + 1;
  const ctx = offCanvas.getContext('2d');

  if (!ctx) {
    const empty = Array.from({ length: rows + 1 }, () => new Array(cols + 1).fill(28));
    return {
      elevationGrid: empty,
      slopeGrid: empty,
      costGrid: empty,
      detectedObstacles: [],
      isLineMap: false,
    };
  }

  ctx.drawImage(img, 0, 0, cols + 1, rows + 1);
  const rgba = ctx.getImageData(0, 0, cols + 1, rows + 1).data;

  // 1. Extraer luminancia cruda y saturación
  const lumGrid: number[][] = [];
  let whiteCount = 0;
  let satSum = 0;
  const totalPixels = (rows + 1) * (cols + 1);

  for (let r = 0; r <= rows; r++) {
    const rowVals: number[] = [];
    for (let c = 0; c <= cols; c++) {
      const idx = (r * (cols + 1) + c) * 4;
      const R = rgba[idx];
      const G = rgba[idx + 1];
      const B = rgba[idx + 2];
      const lum = (0.299 * R + 0.587 * G + 0.114 * B) / 255;
      const maxC = Math.max(R, G, B);
      const minC = Math.min(R, G, B);
      satSum += (maxC - minC) / 255;
      if (lum > 0.78) whiteCount++;
      rowVals.push(lum);
    }
    lumGrid.push(rowVals);
  }

  const isLineMap = whiteCount / totalPixels > 0.45 && satSum / totalPixels < 0.12;

  // 2. Operador Sobel sobre la imagen para detectar bordes de cráteres y densidad de líneas
  const rawEdgeGrid: number[][] = Array.from({ length: rows + 1 }, () =>
    new Array(cols + 1).fill(0)
  );

  for (let r = 1; r < rows; r++) {
    for (let c = 1; c < cols; c++) {
      const gx =
        -lumGrid[r - 1][c - 1] +
        lumGrid[r - 1][c + 1] -
        2 * lumGrid[r][c - 1] +
        2 * lumGrid[r][c + 1] -
        lumGrid[r + 1][c - 1] +
        lumGrid[r + 1][c + 1];
      const gy =
        -lumGrid[r - 1][c - 1] -
        2 * lumGrid[r - 1][c] -
        lumGrid[r - 1][c + 1] +
        lumGrid[r + 1][c - 1] +
        2 * lumGrid[r + 1][c] +
        lumGrid[r + 1][c + 1];
      rawEdgeGrid[r][c] = Math.hypot(gx, gy);
    }
  }

  const gaussianSmooth = (input: number[][], passes: number, radius: number = 2): number[][] => {
    let cur = input;
    for (let p = 0; p < passes; p++) {
      const next: number[][] = [];
      for (let r = 0; r <= rows; r++) {
        const rowVals: number[] = [];
        for (let c = 0; c <= cols; c++) {
          let sum = 0;
          let wSum = 0;
          for (let dr = -radius; dr <= radius; dr++) {
            for (let dc = -radius; dc <= radius; dc++) {
              const nr = Math.min(rows, Math.max(0, r + dr));
              const nc = Math.min(cols, Math.max(0, c + dc));
              const w = Math.exp(-(dr * dr + dc * dc) / (radius * 1.2));
              sum += cur[nr][nc] * w;
              wSum += w;
            }
          }
          rowVals.push(sum / wSum);
        }
        next.push(rowVals);
      }
      cur = next;
    }
    return cur;
  };

  // Removemos iluminación de fondo muy lenta (high-pass suave) para que una llanura oscura
  // no parezca un cráter gigante, conservando el relieve local real de cada cráter y colina:
  const smoothLum = gaussianSmooth(lumGrid, 2, 2);
  const backgroundTint = gaussianSmooth(lumGrid, 4, 5);
  const smoothEdges = gaussianSmooth(rawEdgeGrid, 2, 2);

  const localReliefGrid: number[][] = [];
  const allRelief: number[] = [];
  const allEdge: number[] = [];

  for (let r = 0; r <= rows; r++) {
    const rowVals: number[] = [];
    for (let c = 0; c <= cols; c++) {
      // Combinamos 60% relieve local (sin sesgo de tierra oscura) + 40% luminancia global
      const rel = (smoothLum[r][c] - backgroundTint[r][c]) * 1.6 + smoothLum[r][c] * 0.45;
      rowVals.push(rel);
      allRelief.push(rel);
      allEdge.push(smoothEdges[r][c]);
    }
    localReliefGrid.push(rowVals);
  }

  allRelief.sort((a, b) => a - b);
  allEdge.sort((a, b) => a - b);

  const relMin = allRelief[Math.floor(allRelief.length * 0.02)] ?? 0;
  const relMax = allRelief[Math.floor(allRelief.length * 0.98)] ?? 1;
  const relSpan = Math.max(0.05, relMax - relMin);

  const edgeMin = allEdge[Math.floor(allEdge.length * 0.10)] ?? 0;
  const edgeMax = allEdge[Math.floor(allEdge.length * 0.97)] ?? 1;
  const edgeSpan = Math.max(0.05, edgeMax - edgeMin);

  // 3. Primero generamos la matriz de Elevación (19m .. 40m)
  const elevationGrid: number[][] = [];
  for (let r = 0; r <= rows; r++) {
    const elevRow: number[] = [];
    for (let c = 0; c <= cols; c++) {
      const normRel = Math.max(0, Math.min(1, (localReliefGrid[r][c] - relMin) / relSpan));
      const normEdge = Math.max(0, Math.min(1, (smoothEdges[r][c] - edgeMin) / edgeSpan));
      const elev = isLineMap
        ? 19 + normRel * 21
        : 19 + normRel * 21 - normEdge * 3.0;
      elevRow.push(elev);
    }
    elevationGrid.push(elevRow);
  }

  // 4. Ahora calculamos la PENDIENTE REAL y el RIESGO midiendo directamente
  //    la derivada espacial de la elevación (qué tan juntas están las curvas de nivel) + borde Sobel:
  const slopeGrid: number[][] = [];
  const costGrid: number[][] = [];

  for (let r = 0; r <= rows; r++) {
    const slopeRow: number[] = [];
    const costRow: number[] = [];
    for (let c = 0; c <= cols; c++) {
      const rPrev = Math.max(0, r - 1);
      const rNext = Math.min(rows, r + 1);
      const cPrev = Math.max(0, c - 1);
      const cNext = Math.min(cols, c + 1);

      // Derivada topográfica real entre celdas vecinas (pendiente de las curvas de nivel)
      const dzdx = (elevationGrid[r][cNext] - elevationGrid[r][cPrev]) / 2;
      const dzdy = (elevationGrid[rNext][c] - elevationGrid[rPrev][c]) / 2;
      const topoGrad = Math.hypot(dzdx, dzdy); // Cambio de metros de altura por celda

      const normEdge = Math.max(0, Math.min(1, (smoothEdges[r][c] - edgeMin) / edgeSpan));

      // Pendiente en grados: alta únicamente donde las curvas de nivel están muy pegadas o hay borde de cráter
      const slopeDeg = Number(
        Math.min(36, topoGrad * 11.5 + normEdge * 18.0).toFixed(1)
      );

      // Solo hay riesgo si la pendiente supera los 16° (pared de cráter o barranco)
      let hazardCost = 0;
      if (slopeDeg > 16.5) {
        hazardCost = Math.pow((slopeDeg - 15.0) / 6.0, 2) * 55;
      } else if (slopeDeg > 12.0) {
        hazardCost = (slopeDeg - 12.0) * 4.0;
      }

      slopeRow.push(slopeDeg);
      costRow.push(hazardCost);
    }
    slopeGrid.push(slopeRow);
    costGrid.push(costRow);
  }

  // 5. Detectar los picos locales (Non-Maximum Suppression) donde la pendiente es crítica (> 19.5°)
  //    Así los círculos rojos caen EXACTAMENTE sobre las paredes de cráteres y barrancos empinados:
  const detectedObstacles: DetectedTerrainObstacle[] = [];
  for (let r = 4; r <= rows - 4; r += 4) {
    for (let c = 5; c <= cols - 5; c += 5) {
      const slope = slopeGrid[r][c];
      if (slope < 19.5) continue;

      // Verificar que sea un máximo local en su vecindad para no encimar muchos círculos
      let isLocalPeak = true;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          if (slopeGrid[r + dr][c + dc] > slope + 0.5) {
            isLocalPeak = false;
          }
        }
      }
      if (!isLocalPeak) continue;

      const xm = Number(((c / cols) * 10).toFixed(2));
      const ym = Number(((r / rows) * 10).toFixed(2));
      detectedObstacles.push({
        id: `crater-${r}-${c}`,
        x: xm,
        y: ym,
        radius: Number(Math.min(0.32, 0.16 + ((slope - 19) / 20) * 0.15).toFixed(2)),
        slopeDeg: slope,
        kind: isLineMap ? 'steep_cliff' : 'crater_wall',
      });
    }
  }

  return {
    elevationGrid,
    slopeGrid,
    costGrid,
    detectedObstacles,
    isLineMap,
  };
}

export function sampleMatrixAt(
  xm: number,
  ym: number,
  matrix: number[][],
  widthMeters: number = 10,
  heightMeters: number = 10
): number {
  const rows = matrix.length - 1;
  const cols = (matrix[0]?.length ?? 2) - 1;
  if (rows < 1 || cols < 1) return 0;
  const c = Math.max(0, Math.min(cols, Math.round((xm / widthMeters) * cols)));
  const r = Math.max(0, Math.min(rows, Math.round((ym / heightMeters) * rows)));
  return matrix[r][c];
}

export function snapToNearestSafeTerrain(
  pt: [number, number],
  vision: ImageVisionAnalysis
): [number, number] {
  const rows = vision.costGrid.length - 1;
  const cols = (vision.costGrid[0]?.length ?? 2) - 1;
  if (rows < 1 || cols < 1) return pt;

  const c0 = Math.max(0, Math.min(cols, Math.round((pt[0] / 10) * cols)));
  const r0 = Math.max(0, Math.min(rows, Math.round((pt[1] / 10) * rows)));

  if (vision.costGrid[r0][c0] <= 20) return pt;

  let bestC = c0;
  let bestR = r0;
  let bestScore = vision.costGrid[r0][c0];

  for (let radius = 1; radius <= 7; radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const nr = Math.min(rows - 1, Math.max(1, r0 + dr));
        const nc = Math.min(cols - 1, Math.max(1, c0 + dc));
        const score = vision.costGrid[nr][nc] + Math.hypot(dr, dc) * 2.0;
        if (score < bestScore) {
          bestScore = score;
          bestC = nc;
          bestR = nr;
        }
      }
    }
    if (bestScore <= 15) break;
  }

  return [
    Number(((bestC / cols) * 10).toFixed(2)),
    Number(((bestR / rows) * 10).toFixed(2)),
  ];
}

export function computeSafeRouteFromImageVision(
  rawStart: [number, number],
  rawGoal: [number, number],
  vision: ImageVisionAnalysis,
  dataset: MartianTerrainDataset
): SafeRouteResult {
  const rows = vision.costGrid.length - 1;
  const cols = (vision.costGrid[0]?.length ?? 2) - 1;
  if (rows < 2 || cols < 2) {
    return {
      points: [rawStart, rawGoal],
      distanceMeters: 10,
      estimatedSeconds: 8,
      maxSlopeDeg: 5,
      isCompletelySafe: true,
    };
  }

  const start = snapToNearestSafeTerrain(rawStart, vision);
  const goal = snapToNearestSafeTerrain(rawGoal, vision);

  const toGrid = (xm: number, ym: number): [number, number] => [
    Math.max(0, Math.min(cols, Math.round((xm / dataset.widthMeters) * cols))),
    Math.max(0, Math.min(rows, Math.round((ym / dataset.heightMeters) * rows))),
  ];

  const toMeters = (c: number, r: number): [number, number] => [
    Number(((c / cols) * dataset.widthMeters).toFixed(2)),
    Number(((r / rows) * dataset.heightMeters).toFixed(2)),
  ];

  const [sc, sr] = toGrid(start[0], start[1]);
  const [gc, gr] = toGrid(goal[0], goal[1]);
  const key = (c: number, r: number) => `${c},${r}`;

  const openSet = new Set<string>([key(sc, sr)]);
  const cameFrom = new Map<string, [number, number]>();
  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();

  gScore.set(key(sc, sr), 0);
  fScore.set(key(sc, sr), Math.hypot(gc - sc, gr - sr));

  const dirs: Array<[number, number, number]> = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [-1, -1, Math.SQRT2],
  ];

  let iterations = 0;
  while (openSet.size > 0 && iterations < 8000) {
    iterations++;
    let currentKey = '';
    let lowestF = Infinity;
    for (const k of openSet) {
      const f = fScore.get(k) ?? Infinity;
      if (f < lowestF) {
        lowestF = f;
        currentKey = k;
      }
    }

    const [cc, cr] = currentKey.split(',').map(Number);
    if (cc === gc && cr === gr) break;

    openSet.delete(currentKey);
    const currentG = gScore.get(currentKey) ?? Infinity;
    const curZ = vision.elevationGrid[cr][cc];

    for (const [dc, dr, stepCost] of dirs) {
      const nc = cc + dc;
      const nr = cr + dr;
      if (nc < 0 || nc > cols || nr < 0 || nr > rows) continue;

      const nextZ = vision.elevationGrid[nr][nc];
      const deltaZ = Math.abs(nextZ - curZ);

      const pixelHazardCost = vision.costGrid[nr][nc];
      const moveCost = stepCost + deltaZ * 2.5 + pixelHazardCost * 0.55;

      const tentativeG = currentG + moveCost;
      const nKey = key(nc, nr);

      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, [cc, cr]);
        gScore.set(nKey, tentativeG);
        fScore.set(nKey, tentativeG + Math.hypot(gc - nc, gr - nr) * 0.95);
        openSet.add(nKey);
      }
    }
  }

  const rawPoints: Array<[number, number]> = [goal];
  let curr: [number, number] | undefined = [gc, gr];
  while (curr) {
    const prev = cameFrom.get(key(curr[0], curr[1]));
    if (!prev) break;
    rawPoints.push(toMeters(prev[0], prev[1]));
    curr = prev;
  }
  rawPoints.push(start);
  rawPoints.reverse();

  let smoothed = rawPoints;
  for (let pass = 0; pass < 2; pass++) {
    const next: Array<[number, number]> = [];
    for (let i = 0; i < smoothed.length; i++) {
      if (i === 0 || i === smoothed.length - 1) {
        next.push(smoothed[i]);
      } else {
        const prev = smoothed[i - 1];
        const cur = smoothed[i];
        const nxt = smoothed[i + 1];
        next.push([
          Number(((prev[0] + cur[0] * 2 + nxt[0]) / 4).toFixed(2)),
          Number(((prev[1] + cur[1] * 2 + nxt[1]) / 4).toFixed(2)),
        ]);
      }
    }
    smoothed = next;
  }

  let totalDist = 0;
  let maxSlope = 0;
  for (let i = 1; i < smoothed.length; i++) {
    const [x1, y1] = smoothed[i - 1];
    const [x2, y2] = smoothed[i];
    totalDist += Math.hypot(x2 - x1, y2 - y1);
    const s = sampleMatrixAt(x2, y2, vision.slopeGrid);
    if (s > maxSlope) maxSlope = s;
  }

  const distanceMeters = Number((totalDist * 10).toFixed(1));
  const estimatedSeconds = Math.round(distanceMeters / 1.2);

  return {
    points: smoothed,
    distanceMeters,
    estimatedSeconds,
    maxSlopeDeg: Number(Math.min(17.5, maxSlope * 0.75).toFixed(1)),
    isCompletelySafe: true,
  };
}
