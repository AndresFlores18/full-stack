import { DroneData, RealMapStatePayload } from '@martian/shared';
import { MartianTerrainDataset } from '../config/connectionModes';

export interface DetectedTerrainObstacle {
  id: string;
  x: number; // 0..10m
  y: number; // 0..10m
  radius: number; // metros
  slopeDeg: number;
  kind: 'crater_wall' | 'steep_cliff' | 'rock_obstacle';
}

export interface ImageVisionAnalysis {
  elevationGrid: number[][]; // Altura real extraída (19m..40m)
  slopeGrid: number[][]; // Pendiente real en grados calculada de qué tan juntas están las curvas de nivel
  costGrid: number[][]; // Mapa de riesgo por celda (únicamente donde la pendiente/borde es alto)
  detectedObstacles: DetectedTerrainObstacle[]; // Puntos exactos donde las curvas de nivel se juntan (paredes de cráteres)
  isLineMap: boolean;
}

/**
 * Convierte coordenadas del Grid Real D415 (x_m en [-2.0..+2.0], y_m en [0.0..6.0])
 * al sistema de coordenadas del Mapa Táctico (0..10m x 0..10m),
 * ubicando el origen del rover/dron en [1.5, 5.4] y proyectando el cono hacia el centro-derecha del mapa.
 */
export function d415MetersToMapMeters(x_m: number, y_m: number): [number, number] {
  const mapX = Number(Math.max(0.3, Math.min(9.7, 1.5 + y_m * 1.45)).toFixed(2));
  const mapY = Number(Math.max(0.3, Math.min(9.7, 5.4 + x_m * 1.45)).toFixed(2));
  return [mapX, mapY];
}

/**
 * VISIÓN POR COMPUTADORA REAL SOBRE CUALQUIER IMAGEN:
 * Mide el gradiente espacial (Sobel + derivada topográfica) para detectar cráteres y pendientes reales.
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

  const smoothLum = gaussianSmooth(lumGrid, 2, 2);
  const backgroundTint = gaussianSmooth(lumGrid, 4, 5);
  const smoothEdges = gaussianSmooth(rawEdgeGrid, 2, 2);

  const localReliefGrid: number[][] = [];
  const allRelief: number[] = [];
  const allEdge: number[] = [];

  for (let r = 0; r <= rows; r++) {
    const rowVals: number[] = [];
    for (let c = 0; c <= cols; c++) {
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

  const edgeMin = allEdge[Math.floor(allEdge.length * 0.1)] ?? 0;
  const edgeMax = allEdge[Math.floor(allEdge.length * 0.97)] ?? 1;
  const edgeSpan = Math.max(0.05, edgeMax - edgeMin);

  const elevationGrid: number[][] = [];
  for (let r = 0; r <= rows; r++) {
    const elevRow: number[] = [];
    for (let c = 0; c <= cols; c++) {
      const normRel = Math.max(0, Math.min(1, (localReliefGrid[r][c] - relMin) / relSpan));
      const normEdge = Math.max(0, Math.min(1, (smoothEdges[r][c] - edgeMin) / edgeSpan));
      const elev = isLineMap ? 19 + normRel * 21 : 19 + normRel * 21 - normEdge * 3.0;
      elevRow.push(elev);
    }
    elevationGrid.push(elevRow);
  }

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

      const dzdx = (elevationGrid[r][cNext] - elevationGrid[r][cPrev]) / 2;
      const dzdy = (elevationGrid[rNext][c] - elevationGrid[rPrev][c]) / 2;
      const topoGrad = Math.hypot(dzdx, dzdy);

      const normEdge = Math.max(0, Math.min(1, (smoothEdges[r][c] - edgeMin) / edgeSpan));
      const slopeDeg = Number(Math.min(36, topoGrad * 11.5 + normEdge * 18.0).toFixed(1));

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

  const detectedObstacles: DetectedTerrainObstacle[] = [];
  for (let r = 4; r <= rows - 4; r += 4) {
    for (let c = 5; c <= cols - 5; c += 5) {
      const slope = slopeGrid[r][c];
      if (slope < 19.5) continue;

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
    detectedObstacles: clusterObstacles(detectedObstacles),
    isLineMap,
  };
}

/**
 * Fusiona el análisis de visión de la imagen con las matrices reales de la RealSense D415
 * (`occupancy_grid` 120x80 y `obstacles` BOULDER/CREVICE).
 */
export function fuseVisionWithD415Data(
  baseVisionData: ImageVisionAnalysis | null,
  activeMapState: RealMapStatePayload | null,
  droneData: DroneData | null | undefined,
  dataset: MartianTerrainDataset,
  gridCols: number,
  gridRows: number
): ImageVisionAnalysis | null {
  if (!baseVisionData) return null;

  const elevationGrid = baseVisionData.elevationGrid.map((r) => [...r]);
  const slopeGrid = baseVisionData.slopeGrid.map((r) => [...r]);
  const costGrid = baseVisionData.costGrid.map((r) => [...r]);
  const detectedObstacles = [...baseVisionData.detectedObstacles];

  if (activeMapState?.occupancy_grid) {
    const occ = activeMapState.occupancy_grid;
    const rows = occ.length;
    const cols = occ[0]?.length ?? 80;

    for (let r = 0; r < rows; r += 2) {
      for (let c = 0; c < cols; c += 2) {
        const val = occ[r][c];
        if (val === 255 || val === 0) continue;

        const x_m = -2.0 + c * 0.05;
        const y_m = r * 0.05;
        const [mapX, mapY] = d415MetersToMapMeters(x_m, y_m);

        const gc = Math.min(gridCols, Math.max(0, Math.round((mapX / 10) * gridCols)));
        const gr = Math.min(gridRows, Math.max(0, Math.round((mapY / 10) * gridRows)));

        if (val === 2) {
          costGrid[gr][gc] = Math.max(costGrid[gr][gc], 140);
          slopeGrid[gr][gc] = Math.max(slopeGrid[gr][gc], 29.5);
          elevationGrid[gr][gc] = Math.min(40, elevationGrid[gr][gc] + 3.2);
        } else if (val === 3) {
          costGrid[gr][gc] = Math.max(costGrid[gr][gc], 165);
          slopeGrid[gr][gc] = Math.max(slopeGrid[gr][gc], 33.0);
          elevationGrid[gr][gc] = Math.max(19, elevationGrid[gr][gc] - 3.8);
        } else if (val === 1) {
          costGrid[gr][gc] = Math.max(costGrid[gr][gc], 45);
          slopeGrid[gr][gc] = Math.max(slopeGrid[gr][gc], 18.5);
        }
      }
    }
  }

  const realObstacles = droneData?.obstacles ?? dataset.obstacles ?? [];
  realObstacles.forEach((obs, idx) => {
    let ox = obs.x;
    let oy = obs.y;
    if (typeof obs.distance_m === 'number' && typeof obs.bearing_deg === 'number') {
      const rad = (obs.bearing_deg * Math.PI) / 180;
      const x_m = obs.distance_m * Math.sin(rad);
      const y_m = obs.distance_m * Math.cos(rad);
      [ox, oy] = d415MetersToMapMeters(x_m, y_m);
    }

    const gc = Math.min(gridCols, Math.max(0, Math.round((ox / 10) * gridCols)));
    const gr = Math.min(gridRows, Math.max(0, Math.round((oy / 10) * gridRows)));

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = Math.min(gridRows, Math.max(0, gr + dr));
        const nc = Math.min(gridCols, Math.max(0, gc + dc));
        costGrid[nr][nc] = Math.max(costGrid[nr][nc], dr === 0 && dc === 0 ? 160 : 75);
        slopeGrid[nr][nc] = Math.max(slopeGrid[nr][nc], 26.0);
      }
    }

    if (idx < 35) {
      detectedObstacles.push({
        id: `d415-${obs.id ?? idx}`,
        x: ox,
        y: oy,
        radius: obs.radius || 0.22,
        slopeDeg: obs.type === 'CREVICE' ? 31 : 25,
        kind: obs.type === 'CREVICE' ? 'steep_cliff' : 'rock_obstacle',
      });
    }
  });

  return {
    elevationGrid,
    slopeGrid,
    costGrid,
    detectedObstacles: clusterObstacles(detectedObstacles),
    isLineMap: baseVisionData.isLineMap,
  };
}

/**
 * Agrupa detecciones de riesgo muy cercanas entre sí en una sola (la de mayor pendiente),
 * para que un mismo cráter/grieta no se dibuje como un racimo de círculos pegados.
 */
function clusterObstacles(
  obstacles: DetectedTerrainObstacle[],
  minSeparationMeters: number = 0.55
): DetectedTerrainObstacle[] {
  const sorted = [...obstacles].sort((a, b) => b.slopeDeg - a.slopeDeg);
  const accepted: DetectedTerrainObstacle[] = [];

  for (const candidate of sorted) {
    const tooClose = accepted.some(
      (a) => Math.hypot(a.x - candidate.x, a.y - candidate.y) < minSeparationMeters
    );
    if (!tooClose) accepted.push(candidate);
  }

  return accepted;
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

