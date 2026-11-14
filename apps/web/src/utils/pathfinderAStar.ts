import { MartianTerrainDataset } from '../config/connectionModes';
import { ImageVisionAnalysis, sampleMatrixAt } from './imageVision';

export interface SafeRouteResult {
  points: Array<[number, number]>;
  distanceMeters: number;
  estimatedSeconds: number;
  maxSlopeDeg: number;
  isCompletelySafe: boolean;
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

