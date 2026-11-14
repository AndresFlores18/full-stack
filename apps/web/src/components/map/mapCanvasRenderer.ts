import { DroneData, RealMapStatePayload } from '@martian/shared';
import { MartianTerrainDataset } from '../../config/connectionModes';
import { d415MetersToMapMeters, ImageVisionAnalysis } from '../../utils/imageVision';
import { SafeRouteResult } from '../../utils/pathfinderAStar';

export type MapLayerMode =
  | 'fusion_mars_d415'
  | 'pure_d415_grid'
  | 'live_server_cam'
  | 'topo_lines';

export interface MapCanvasRenderParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  gridCols: number;
  gridRows: number;
  dataset: MartianTerrainDataset;
  visionData: ImageVisionAnalysis;
  activeMapState: RealMapStatePayload | null;
  droneData?: DroneData | null;
  loadedImg: HTMLImageElement | null;
  mapLayerMode: MapLayerMode;
  showContours: boolean;
  showDetectedZones: boolean;
  showD415GridOverlay: boolean;
  showServerPaths: boolean;
  safeRoute: SafeRouteResult;
  targetPoint: [number, number];
  basePos: [number, number];
  dronePadPos: [number, number];
  evaPos: [number, number];
}

export function renderTopographicMapCanvas(params: MapCanvasRenderParams): void {
  const {
    ctx,
    width,
    height,
    gridCols,
    gridRows,
    dataset,
    visionData,
    activeMapState,
    droneData,
    loadedImg,
    mapLayerMode,
    showContours,
    showDetectedZones,
    showD415GridOverlay,
    showServerPaths,
    safeRoute,
    targetPoint,
    basePos,
    dronePadPos,
    evaPos,
  } = params;

  // 1. Dibujar el fondo activo
  ctx.clearRect(0, 0, width, height);
  if (mapLayerMode === 'pure_d415_grid') {
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(55, 65, 81, 0.35)';
    ctx.lineWidth = 1;
    for (let xm = 1; xm < 10; xm++) {
      const gx = (xm / 10) * width;
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, height);
      ctx.stroke();
    }
    for (let ym = 1; ym < 10; ym++) {
      const gy = (ym / 10) * height;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(width, gy);
      ctx.stroke();
    }
  } else if (loadedImg) {
    ctx.drawImage(loadedImg, 0, 0, width, height);
    ctx.fillStyle = visionData.isLineMap
      ? 'rgba(15, 23, 42, 0.10)'
      : 'rgba(8, 12, 22, 0.22)';
    ctx.fillRect(0, 0, width, height);
  }

  const cellW = width / gridCols;
  const cellH = height / gridRows;

  // 2. Grid de Ocupación Real D415 (120x80)
  if ((showD415GridOverlay || mapLayerMode === 'pure_d415_grid') && activeMapState?.occupancy_grid) {
    const occ = activeMapState.occupancy_grid;
    const rows = occ.length;
    const cols = occ[0]?.length ?? 80;
    const step = mapLayerMode === 'pure_d415_grid' ? 1 : 2;
    const blockW = Math.max(3, ((0.05 * 1.45 * step) / dataset.widthMeters) * width + 1);
    const blockH = Math.max(3, ((0.05 * 1.45 * step) / dataset.heightMeters) * height + 1);

    ctx.save();
    for (let r = 0; r < rows; r += step) {
      for (let c = 0; c < cols; c += step) {
        const val = occ[r][c];
        if (val === 255) continue;

        const x_m = -2.0 + c * 0.05;
        const y_m = r * 0.05;
        const [mapX, mapY] = d415MetersToMapMeters(x_m, y_m);
        const px = (mapX / dataset.widthMeters) * width;
        const py = (mapY / dataset.heightMeters) * height;

        if (val === 0) {
          ctx.fillStyle =
            mapLayerMode === 'pure_d415_grid'
              ? 'rgba(34, 64, 48, 0.72)'
              : 'rgba(34, 197, 94, 0.09)';
        } else if (val === 1) {
          ctx.fillStyle =
            mapLayerMode === 'pure_d415_grid'
              ? 'rgba(120, 83, 40, 0.80)'
              : 'rgba(217, 119, 6, 0.26)';
        } else if (val === 2) {
          ctx.fillStyle =
            mapLayerMode === 'pure_d415_grid'
              ? 'rgba(234, 88, 12, 0.95)'
              : 'rgba(249, 115, 22, 0.65)';
        } else if (val === 3) {
          ctx.fillStyle =
            mapLayerMode === 'pure_d415_grid'
              ? 'rgba(6, 182, 212, 0.95)'
              : 'rgba(56, 189, 248, 0.65)';
        }
        ctx.fillRect(px - blockW / 2, py - blockH / 2, blockW, blockH);
      }
    }
    ctx.restore();
  }

  // 3. Curvas Topográficas (Marching Squares)
  if (showContours && mapLayerMode !== 'pure_d415_grid') {
    const levels: number[] = [];
    for (
      let lvl = Math.ceil(dataset.minElevation);
      lvl <= Math.floor(dataset.maxElevation);
      lvl += dataset.contourStep
    ) {
      levels.push(Number(lvl.toFixed(1)));
    }

    const interpolate = (val1: number, val2: number, target: number) => {
      if (Math.abs(val2 - val1) < 1e-5) return 0.5;
      return (target - val1) / (val2 - val1);
    };

    levels.forEach((level, levelIdx) => {
      const isMajorContour = Math.round(level) % 5 === 0 || levelIdx % 3 === 0;

      ctx.beginPath();
      ctx.strokeStyle = visionData.isLineMap
        ? isMajorContour
          ? 'rgba(234, 88, 12, 0.78)'
          : 'rgba(249, 115, 22, 0.42)'
        : isMajorContour
        ? 'rgba(253, 186, 116, 0.78)'
        : 'rgba(254, 215, 170, 0.40)';
      ctx.lineWidth = isMajorContour ? 1.5 : 0.85;

      let labelPlacedForLevel = false;

      for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
          const zTL = visionData.elevationGrid[r][c];
          const zTR = visionData.elevationGrid[r][c + 1];
          const zBR = visionData.elevationGrid[r + 1][c + 1];
          const zBL = visionData.elevationGrid[r + 1][c];

          let mask = 0;
          if (zTL >= level) mask |= 8;
          if (zTR >= level) mask |= 4;
          if (zBR >= level) mask |= 2;
          if (zBL >= level) mask |= 1;

          if (mask === 0 || mask === 15) continue;

          const x0 = c * cellW;
          const y0 = r * cellH;

          const top = { x: x0 + interpolate(zTL, zTR, level) * cellW, y: y0 };
          const right = { x: x0 + cellW, y: y0 + interpolate(zTR, zBR, level) * cellH };
          const bottom = { x: x0 + interpolate(zBL, zBR, level) * cellW, y: y0 + cellH };
          const left = { x: x0, y: y0 + interpolate(zTL, zBL, level) * cellH };

          const drawSeg = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);

            if (
              !labelPlacedForLevel &&
              isMajorContour &&
              c > 12 &&
              c < gridCols - 12 &&
              r > 6 &&
              r < gridRows - 6 &&
              (c + r) % 23 === 0
            ) {
              labelPlacedForLevel = true;
              ctx.save();
              ctx.font = 'bold 10px monospace';
              ctx.fillStyle = visionData.isLineMap ? '#9a3412' : '#ffedd5';
              ctx.fillText(`${Math.round(level)}m`, p1.x + 2, p1.y - 2);
              ctx.restore();
            }
          };

          switch (mask) {
            case 1:
            case 14:
              drawSeg(left, bottom);
              break;
            case 2:
            case 13:
              drawSeg(bottom, right);
              break;
            case 3:
            case 12:
              drawSeg(left, right);
              break;
            case 4:
            case 11:
              drawSeg(top, right);
              break;
            case 5:
              drawSeg(left, top);
              drawSeg(bottom, right);
              break;
            case 6:
            case 9:
              drawSeg(top, bottom);
              break;
            case 7:
            case 8:
              drawSeg(left, top);
              break;
            case 10:
              drawSeg(left, bottom);
              drawSeg(top, right);
              break;
          }
        }
      }
      ctx.stroke();
    });
  }

  // 4. Radio de Escaneo Aéreo del Dron Fijo de Berni
  const dronePx = (dronePadPos[0] / dataset.widthMeters) * width;
  const dronePy = (dronePadPos[1] / dataset.heightMeters) * height;
  const scanRadiusPx = (dataset.droneScanRadius / dataset.widthMeters) * width;

  ctx.save();
  ctx.beginPath();
  ctx.setLineDash([6, 4]);
  ctx.arc(dronePx, dronePy, scanRadiusPx, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(168, 85, 247, 0.05)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(192, 132, 252, 0.80)';
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.restore();

  // 5. Obstáculos Reales (Cráteres de la imagen + BOULDER / CREVICE del servidor D415)
  if (showDetectedZones) {
    visionData.detectedObstacles.forEach((haz) => {
      const isD415Obstacle = haz.id.startsWith('d415-');
      const distFromDrone = Math.hypot(haz.x - dronePadPos[0], haz.y - dronePadPos[1]);
      if (!isD415Obstacle && distFromDrone > dataset.droneScanRadius) return;

      const px = (haz.x / dataset.widthMeters) * width;
      const py = (haz.y / dataset.heightMeters) * height;
      const pr = (haz.radius / dataset.widthMeters) * width;

      ctx.save();
      ctx.beginPath();
      if (!isD415Obstacle) ctx.setLineDash([3, 3]);
      ctx.arc(px, py, pr, 0, Math.PI * 2);

      // Cualquier complicación detectada (cráter de la foto o BOULDER/CREVICE de la D415)
      // se marca igual: un círculo rojo de alerta.
      ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
      ctx.strokeStyle = 'rgba(248, 113, 113, 0.85)';
      ctx.lineWidth = isD415Obstacle ? 1.8 : 1.5;

      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });
  }

  // 6. Rutas Precalculadas por el Servidor D415 (A* y Dijkstra)
  if (showServerPaths && droneData?.navigation) {
    const drawServerWaypoints = (
      wps: [number, number][] | undefined,
      color: string,
      lineWidth: number,
      dashed: boolean
    ) => {
      if (!wps || wps.length < 2) return;
      ctx.save();
      ctx.beginPath();
      if (dashed) ctx.setLineDash([5, 4]);
      wps.forEach(([wx, wy], i) => {
        const [mapX, mapY] = d415MetersToMapMeters(wx, wy);
        const px = (mapX / dataset.widthMeters) * width;
        const py = (mapY / dataset.heightMeters) * height;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();
    };

    drawServerWaypoints(
      droneData.navigation.dijkstra?.waypoints_xy_m,
      'rgba(56, 189, 248, 0.85)',
      3,
      true
    );
    drawServerWaypoints(
      droneData.navigation.astar?.waypoints_xy_m ?? droneData.navigation.route_waypoints_xy_m,
      '#a3e635',
      3.5,
      false
    );
  }

  // 7. Camino Seguro Interactivo (A* hacia donde haces clic)
  if (safeRoute.points.length > 1) {
    ctx.save();

    ctx.beginPath();
    safeRoute.points.forEach(([rx, ry], idx) => {
      const px = (rx / dataset.widthMeters) * width;
      const py = (ry / dataset.heightMeters) * height;
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.70)';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.beginPath();
    safeRoute.points.forEach(([rx, ry], idx) => {
      const px = (rx / dataset.widthMeters) * width;
      const py = (ry / dataset.heightMeters) * height;
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 4;
    ctx.stroke();

    safeRoute.points.forEach(([rx, ry], idx) => {
      if (idx % 4 !== 0 || idx === 0 || idx === safeRoute.points.length - 1) return;
      const px = (rx / dataset.widthMeters) * width;
      const py = (ry / dataset.heightMeters) * height;
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    });

    ctx.restore();
  }

  type BadgeIcon = 'target' | 'home' | 'drone' | 'person';

  const drawBadgeIcon = (kind: BadgeIcon, cx: number, cy: number, color: string) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    switch (kind) {
      case 'target':
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx - 7, cy);
        ctx.lineTo(cx - 3.5, cy);
        ctx.moveTo(cx + 3.5, cy);
        ctx.lineTo(cx + 7, cy);
        ctx.moveTo(cx, cy - 7);
        ctx.lineTo(cx, cy - 3.5);
        ctx.moveTo(cx, cy + 3.5);
        ctx.lineTo(cx, cy + 7);
        ctx.stroke();
        break;
      case 'home':
        ctx.beginPath();
        ctx.moveTo(cx - 6, cy + 1);
        ctx.lineTo(cx, cy - 6);
        ctx.lineTo(cx + 6, cy + 1);
        ctx.stroke();
        ctx.strokeRect(cx - 4, cy + 1, 8, 5.5);
        break;
      case 'drone':
        ctx.beginPath();
        ctx.moveTo(cx - 6, cy - 6);
        ctx.lineTo(cx + 6, cy + 6);
        ctx.moveTo(cx + 6, cy - 6);
        ctx.lineTo(cx - 6, cy + 6);
        ctx.stroke();
        [
          [-6, -6],
          [6, -6],
          [-6, 6],
          [6, 6],
        ].forEach(([dx, dy]) => {
          ctx.beginPath();
          ctx.arc(cx + dx, cy + dy, 2, 0, Math.PI * 2);
          ctx.stroke();
        });
        ctx.beginPath();
        ctx.arc(cx, cy, 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'person':
        ctx.beginPath();
        ctx.arc(cx, cy - 4, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx - 4, cy + 6);
        ctx.quadraticCurveTo(cx, cy - 1, cx + 4, cy + 6);
        ctx.stroke();
        break;
    }
    ctx.restore();
  };

  const drawBadge = (
    px: number,
    py: number,
    text: string,
    color: string,
    offsetY: number = 0,
    icon?: BadgeIcon
  ) => {
    ctx.save();
    ctx.font = 'bold 11px monospace';
    const textWidth = ctx.measureText(text).width;
    const iconW = icon ? 16 : 0;
    const boxW = textWidth + 10 + iconW;
    const bx = Math.min(width - boxW - 6, Math.max(6, px + 10));
    const by = Math.min(height - 24, Math.max(6, py - 9 + offsetY));
    ctx.fillStyle = 'rgba(17, 24, 39, 0.88)';
    ctx.fillRect(bx, by, boxW, 18);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, boxW, 18);
    if (icon) {
      drawBadgeIcon(icon, bx + 9, by + 9, color);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, bx + 5 + iconW, by + 13);
    ctx.restore();
  };

  // 8. Marcadores de Destino, Base, Dron y EVA
  const endPt = safeRoute.points[safeRoute.points.length - 1] ?? targetPoint;
  const targetPx = (endPt[0] / dataset.widthMeters) * width;
  const targetPy = (endPt[1] / dataset.heightMeters) * height;
  ctx.save();
  ctx.beginPath();
  ctx.arc(targetPx, targetPy, 12, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(34, 197, 94, 0.28)';
  ctx.fill();
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(targetPx, targetPy, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#22c55e';
  ctx.fill();
  ctx.restore();
  drawBadge(targetPx, targetPy, `META [${endPt[0]}, ${endPt[1]}]`, '#4ade80', 0, 'target');

  const basePx = (basePos[0] / dataset.widthMeters) * width;
  const basePy = (basePos[1] / dataset.heightMeters) * height;
  ctx.save();
  ctx.fillStyle = '#facc15';
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 2;
  ctx.fillRect(basePx - 7, basePy - 7, 14, 14);
  ctx.strokeRect(basePx - 7, basePy - 7, 14, 14);
  ctx.restore();
  drawBadge(basePx - 36, basePy + 22, 'BASE', '#fef08a', 0, 'home');

  ctx.save();
  ctx.beginPath();
  ctx.arc(dronePx, dronePy, 8, 0, Math.PI * 2);
  ctx.fillStyle = '#a855f7';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.restore();
  drawBadge(
    dronePx - 20,
    dronePy - 22,
    `D415 / DRON (Alt Z: ${dataset.dronePos[2]}m)`,
    '#e9d5ff',
    0,
    'drone'
  );

  const evaPx = (evaPos[0] / dataset.widthMeters) * width;
  const evaPy = (evaPos[1] / dataset.heightMeters) * height;
  ctx.save();
  ctx.beginPath();
  ctx.arc(evaPx, evaPy, 8, 0, Math.PI * 2);
  ctx.fillStyle = '#38bdf8';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.restore();
  drawBadge(evaPx, evaPy + 6, 'EVA (Alan)', '#7dd3fc', 0, 'person');
}

