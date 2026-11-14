import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EvaData, RiskAssessment, THRESHOLDS } from '@martian/shared';
import {
  analyzeImageTerrainReal,
  computeSafeRouteFromImageVision,
  FIXED_DRONE_PAD_POS,
  ImageVisionAnalysis,
  MartianTerrainDataset,
  OperationMode,
  sampleMatrixAt,
} from '../config/connectionConfig';

interface TopographicMap2DProps {
  dataset: MartianTerrainDataset;
  mode: OperationMode;
  isConnected: boolean;
  evaYaw?: number;
  eva?: EvaData | null;
  risk: RiskAssessment;
  utcTime?: string;
}

type RouteOrigin = 'eva' | 'base';
type MapVisualStyle = 'satellite' | 'topo_neon';

const GRID_COLS = 96;
const GRID_ROWS = 60;

// Las razones "fuertes" del evaluador de riesgo van siempre en MAYÚSCULAS (CRÍTICO/BLOQUEADA/EXTREMA);
// las de advertencia van en minúsculas. Reutilizamos esa convención para colorear cada tarjeta.
const RED_MARKERS = /CRÍTIC|BLOQUEADA|INSEGURA|EXTREMA/i;
function classifyReason(reason: string): 'red' | 'yellow' {
  return RED_MARKERS.test(reason) ? 'red' : 'yellow';
}

const TelemetryBar: React.FC<{
  label: string;
  value: number;
  unit: string;
  critical: number;
  warning: number;
}> = ({ label, value, unit, critical, warning }) => {
  const color = value <= critical ? '#ef4444' : value <= warning ? '#f59e0b' : '#22c55e';
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
        <span>{label}</span>
        <strong style={{ color }}>
          {value.toFixed(1)}
          {unit}
          {value <= critical ? ' - CRÍTICO' : ''}
        </strong>
      </div>
      <div style={{ background: '#1f2937', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color }} />
      </div>
    </div>
  );
};

/**
 * Mapa Topográfico 2D con Visión por Computadora Real sobre la Imagen Cargada:
 * - Extrae el relieve real (ecualización de histograma 19m..40m) y los bordes/cráteres reales (operador Sobel)
 *   directamente de los píxeles de la imagen que pongas.
 * - El Dron Fijo (Altitud Z) escanea y marca los cráteres/obstáculos reales de la foto dentro de su radio.
 * - El Camino Seguro (A*) rodea los cráteres y pendientes reales de la imagen hasta donde haces clic.
 * - Ícono de astronauta: abre/cierra el panel flotante de telemetría del traje EVA-01.
 * - Ícono de ojo: alterna el estilo visual del mapa (satélite vs. topográfico neón).
 */
export const TopographicMap2D: React.FC<TopographicMap2DProps> = ({
  dataset,
  mode,
  isConnected,
  evaYaw = 0,
  eva = null,
  risk,
  utcTime,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const loadedImgRef = useRef<HTMLImageElement | null>(null);

  const [imageSrc, setImageSrc] = useState<string>('/mars-terrain.jpg');
  const [imageLabel, setImageLabel] = useState<string>('Satélite Marte (Cráteres)');

  const [visionData, setVisionData] = useState<ImageVisionAnalysis | null>(null);
  const [showContours, setShowContours] = useState<boolean>(true);
  const [showDetectedZones, setShowDetectedZones] = useState<boolean>(true);
  const [routeOrigin, setRouteOrigin] = useState<RouteOrigin>('eva');
  const [targetPoint, setTargetPoint] = useState<[number, number]>([6.4, 6.8]);

  const [mapStyle, setMapStyle] = useState<MapVisualStyle>('satellite');
  const [showTelemetry, setShowTelemetry] = useState<boolean>(false);

  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    z: number;
    slope: number;
  } | null>(null);

  // Analizar con Visión por Computadora Real cada vez que se carga o cambia la imagen
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageSrc;
    img.onload = () => {
      loadedImgRef.current = img;
      const analysis = analyzeImageTerrainReal(img, GRID_COLS, GRID_ROWS);
      setVisionData(analysis);
    };
  }, [imageSrc]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setImageSrc(objectUrl);
    setImageLabel(`Imagen Real: ${file.name}`);
  };

  // Posiciones en el mapa (0..10m)
  const basePos: [number, number] = [1.1, 5.8];
  const dronePadPos: [number, number] = FIXED_DRONE_PAD_POS; // [1.5, 5.4] fijo
  const evaPos: [number, number] = [
    Number((2.15 + Math.sin((evaYaw * Math.PI) / 180) * 0.1).toFixed(2)),
    Number((5.55 + Math.cos((evaYaw * Math.PI) / 180) * 0.1).toFixed(2)),
  ];

  const startPoint: [number, number] = routeOrigin === 'eva' ? evaPos : basePos;

  // Calcular el Camino Seguro real usando la matriz de visión de la imagen activa
  const safeRoute = useMemo(() => {
    if (!visionData) {
      return {
        points: [startPoint, targetPoint],
        distanceMeters: 40,
        estimatedSeconds: 33,
        maxSlopeDeg: 6.5,
        isCompletelySafe: true,
      };
    }
    return computeSafeRouteFromImageVision(startPoint, targetPoint, visionData, dataset);
  }, [startPoint[0], startPoint[1], targetPoint[0], targetPoint[1], visionData, dataset]);

  // Perfil de elevación real a lo largo del Camino Seguro, muestreado de la matriz de visión
  const elevationProfile = useMemo(() => {
    if (!visionData || safeRoute.points.length < 2) return [];
    const pts = safeRoute.points;
    const segLens: number[] = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      segLens.push(d);
      total += d;
    }
    if (total === 0) return [];

    const SAMPLES = 28;
    const profile: Array<{ dist: number; elev: number }> = [];
    for (let s = 0; s <= SAMPLES; s++) {
      const targetDist = (s / SAMPLES) * total;
      let acc = 0;
      let idx = 0;
      while (idx < segLens.length - 1 && acc + segLens[idx] < targetDist) {
        acc += segLens[idx];
        idx++;
      }
      const segLen = segLens[idx] || 0.0001;
      const t = Math.max(0, Math.min(1, (targetDist - acc) / segLen));
      const p0 = pts[idx];
      const p1 = pts[idx + 1] ?? pts[idx];
      const x = p0[0] + (p1[0] - p0[0]) * t;
      const y = p0[1] + (p1[1] - p0[1]) * t;
      profile.push({
        dist: Number((targetDist * 10).toFixed(1)),
        elev: sampleMatrixAt(x, y, visionData.elevationGrid),
      });
    }
    return profile;
  }, [visionData, safeRoute]);

  const elevationChart = useMemo(() => {
    if (elevationProfile.length < 2) return null;
    const W = 220;
    const H = 70;
    const PAD = 4;
    const maxDist = elevationProfile[elevationProfile.length - 1].dist || 1;
    const elevs = elevationProfile.map((p) => p.elev);
    const minE = Math.min(...elevs);
    const maxE = Math.max(...elevs);
    const span = Math.max(0.5, maxE - minE);
    const toX = (d: number) => PAD + (d / maxDist) * (W - PAD * 2);
    const toY = (e: number) => H - PAD - ((e - minE) / span) * (H - PAD * 2);
    const linePts = elevationProfile.map((p) => `${toX(p.dist)},${toY(p.elev)}`).join(' ');
    const areaPts = `${PAD},${H - PAD} ${linePts} ${W - PAD},${H - PAD}`;
    return { W, H, linePts, areaPts, minE: minE.toFixed(1), maxE: maxE.toFixed(1) };
  }, [elevationProfile]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !visionData) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // 1. Fondo: imagen real (modo Satélite) o fondo oscuro estilizado (modo Topográfico Neón)
    ctx.clearRect(0, 0, width, height);
    if (mapStyle === 'topo_neon') {
      ctx.fillStyle = '#05020a';
      ctx.fillRect(0, 0, width, height);
    } else if (loadedImgRef.current) {
      ctx.drawImage(loadedImgRef.current, 0, 0, width, height);
      ctx.fillStyle = visionData.isLineMap
        ? 'rgba(15, 23, 42, 0.10)'
        : 'rgba(8, 12, 22, 0.18)';
      ctx.fillRect(0, 0, width, height);
    }

    const cellW = width / GRID_COLS;
    const cellH = height / GRID_ROWS;

    // 2. LÍNEAS TOPOGRÁFICAS REALES (extraídas del relieve real de la imagen con ecualización 19m..40m)
    if (showContours) {
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
        if (mapStyle === 'topo_neon') {
          ctx.strokeStyle = isMajorContour
            ? 'rgba(244, 63, 177, 0.88)'
            : 'rgba(244, 63, 177, 0.46)';
        } else {
          ctx.strokeStyle = visionData.isLineMap
            ? isMajorContour
              ? 'rgba(234, 88, 12, 0.78)'
              : 'rgba(249, 115, 22, 0.42)'
            : isMajorContour
            ? 'rgba(253, 186, 116, 0.78)'
            : 'rgba(254, 215, 170, 0.40)';
        }
        ctx.lineWidth = isMajorContour ? 1.5 : 0.85;

        let labelPlacedForLevel = false;

        for (let r = 0; r < GRID_ROWS; r++) {
          for (let c = 0; c < GRID_COLS; c++) {
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
                c < GRID_COLS - 12 &&
                r > 6 &&
                r < GRID_ROWS - 6 &&
                (c + r) % 23 === 0
              ) {
                labelPlacedForLevel = true;
                ctx.save();
                ctx.font = 'bold 10px monospace';
                ctx.fillStyle =
                  mapStyle === 'topo_neon' ? '#f9a8d4' : visionData.isLineMap ? '#9a3412' : '#ffedd5';
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

    // 3. Radio de Escaneo Aéreo del Dron Fijo de Berni (crece según la altitud Z)
    const dronePx = (dronePadPos[0] / dataset.widthMeters) * width;
    const dronePy = (dronePadPos[1] / dataset.heightMeters) * height;
    const scanRadiusPx = (dataset.droneScanRadius / dataset.widthMeters) * width;

    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([6, 4]);
    ctx.arc(dronePx, dronePy, scanRadiusPx, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(168, 85, 247, 0.06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(192, 132, 252, 0.80)';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();

    // 4. Cráteres / Pendientes Reales detectados en los píxeles de la imagen dentro del escaneo del Dron
    if (showDetectedZones) {
      visionData.detectedObstacles.forEach((haz) => {
        const distFromDrone = Math.hypot(
          haz.x - dronePadPos[0],
          haz.y - dronePadPos[1]
        );
        // El dron descubre los cráteres/obstáculos reales que están dentro de su radio de visión Z
        const isScannedByDrone = distFromDrone <= dataset.droneScanRadius;
        if (!isScannedByDrone) return;

        const px = (haz.x / dataset.widthMeters) * width;
        const py = (haz.y / dataset.heightMeters) * height;
        const pr = (haz.radius / dataset.widthMeters) * width;

        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([3, 3]);
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(248, 113, 113, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.fillStyle = '#fca5a5';
        ctx.font = 'bold 9px monospace';
        ctx.fillText(`${Math.round(haz.slopeDeg)}°`, px - 8, py + 3);
        ctx.restore();
      });
    }

    // 5. DIBUJAR EL CAMINO SEGURO REAL (A* que rodea los cráteres y pendientes reales de la imagen)
    if (safeRoute.points.length > 1) {
      ctx.save();

      // Borde oscuro exterior para máximo contraste sobre cualquier imagen
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

      // Línea principal verde brillante del Camino Seguro
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

      // Puntos guía blancos a lo largo del camino
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

    const drawBadge = (px: number, py: number, text: string, color: string, offsetY: number = 0) => {
      ctx.save();
      ctx.font = 'bold 11px monospace';
      const textWidth = ctx.measureText(text).width;
      const bx = Math.min(width - textWidth - 16, Math.max(6, px + 10));
      const by = Math.min(height - 24, Math.max(6, py - 9 + offsetY));
      ctx.fillStyle = 'rgba(17, 24, 39, 0.88)';
      ctx.fillRect(bx, by, textWidth + 10, 18);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, textWidth + 10, 18);
      ctx.fillStyle = color;
      ctx.fillText(text, bx + 5, by + 13);
      ctx.restore();
    };

    // 6. Marcador del DESTINO
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
    drawBadge(targetPx, targetPy, `🎯 META [${endPt[0]}, ${endPt[1]}]`, '#4ade80');

    // 7. Estación Base
    const basePx = (basePos[0] / dataset.widthMeters) * width;
    const basePy = (basePos[1] / dataset.heightMeters) * height;
    ctx.save();
    ctx.fillStyle = '#facc15';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.fillRect(basePx - 7, basePy - 7, 14, 14);
    ctx.strokeRect(basePx - 7, basePy - 7, 14, 14);
    ctx.restore();
    drawBadge(basePx - 36, basePy + 22, '🏠 BASE', '#fef08a');

    // 8. Plataforma Fija del Dron de Berni
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
      `🚁 DRON FIJO (Alt Z: ${dataset.dronePos[2]}m)`,
      '#e9d5ff'
    );

    // 9. EVA Astronauta (Alan)
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
    drawBadge(evaPx, evaPy + 6, '👨‍🚀 EVA (Alan)', '#7dd3fc');
  }, [
    dataset,
    visionData,
    showContours,
    showDetectedZones,
    evaYaw,
    targetPoint,
    safeRoute,
    routeOrigin,
    mapStyle,
  ]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const relX = Math.max(0.03, Math.min(0.97, (e.clientX - rect.left) / rect.width));
    const relY = Math.max(0.03, Math.min(0.97, (e.clientY - rect.top) / rect.height));
    const xm = Number((relX * dataset.widthMeters).toFixed(2));
    const ym = Number((relY * dataset.heightMeters).toFixed(2));
    setTargetPoint([xm, ym]);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !visionData) return;
    const rect = canvas.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    const xm = Number((relX * dataset.widthMeters).toFixed(2));
    const ym = Number((relY * dataset.heightMeters).toFixed(2));
    const zm = Number(sampleMatrixAt(xm, ym, visionData.elevationGrid).toFixed(1));
    const slope = Number(sampleMatrixAt(xm, ym, visionData.slopeGrid).toFixed(1));
    setHoverInfo({ x: xm, y: ym, z: zm, slope });
  };

  const scannedHazardsCount = useMemo(() => {
    if (!visionData) return 0;
    return visionData.detectedObstacles.filter(
      (h) => Math.hypot(h.x - dronePadPos[0], h.y - dronePadPos[1]) <= dataset.droneScanRadius
    ).length;
  }, [visionData, dataset.droneScanRadius]);

  // Tarjetas de "Obstáculos & Pendientes" a partir del riesgo real evaluado (EVA + Dron)
  // y de los cráteres/pendientes reales detectados por visión dentro del radio de escaneo.
  const riskCards = useMemo(() => {
    const cards: Array<{ level: 'red' | 'yellow' | 'green'; title: string; text: string }> = [];

    risk.reasons.forEach((reason) => {
      const level = classifyReason(reason);
      cards.push({
        level,
        title: level === 'red' ? 'Riesgo detectado: ALTO' : 'Riesgo detectado: MEDIO',
        text: reason,
      });
    });

    if (scannedHazardsCount > 0) {
      cards.push({
        level: 'green',
        title: 'Riesgo detectado: BAJO',
        text: `Zona con ${scannedHazardsCount} cráter(es)/pendiente(s) reales dentro del escaneo del dron`,
      });
    }

    if (cards.length === 0) {
      cards.push({
        level: 'green',
        title: 'Todo nominal',
        text: 'Sin anomalías relevantes detectadas en este momento.',
      });
    }

    return cards;
  }, [risk, scannedHazardsCount]);

  const viewLabel = mapStyle === 'topo_neon' ? 'Vista Topográfica (Escaneo Dron)' : imageLabel;

  const latLon = useMemo(() => {
    const lat = -11.9 - targetPoint[1] * 0.012;
    const lon = 6.2 + targetPoint[0] * 0.012;
    return { lat: lat.toFixed(4), lon: lon.toFixed(4) };
  }, [targetPoint]);

  return (
    <div
      style={{
        background: '#0b1220',
        border: '1px solid #1e3a8a',
        borderRadius: '10px',
        overflow: 'hidden',
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        style={{ display: 'none' }}
      />

      {/* Cabecera de Misión estilo HUD: nombre de operación + reloj UTC */}
      <div
        style={{
          background: 'linear-gradient(90deg, #1e3a8a, #0c4a6e)',
          borderBottom: '2px solid #38bdf8',
          padding: '10px 16px',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <div>
          <div style={{ fontSize: '10px', color: '#bae6fd', letterSpacing: '0.5px' }}>
            MISIÓN: OPERACIONES SUPERFICIE ARES-IV
          </div>
          <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#ffffff' }}>
            🗺️ {viewLabel}
          </div>
        </div>
        {utcTime && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '10px', color: '#93c5fd' }}>UTC</div>
            <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#ffffff', fontFamily: 'monospace' }}>
              {utcTime}
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '16px' }}>
        {/* Cabecera de controles del Mapa y Selector de Imagen */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '12px',
          }}
        >
          <p style={{ margin: 0, fontSize: '12px', color: '#9ca3af' }}>
            Detecta los <strong>cráteres, sombras y pendientes reales</strong> de los píxeles de la foto ({scannedHazardsCount} zonas escaneadas por el Dron).
          </p>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                if (imageSrc === '/mars-terrain.jpg') {
                  setImageSrc('/topo-reference.jpg');
                  setImageLabel('Plano Topográfico Curvas');
                } else {
                  setImageSrc('/mars-terrain.jpg');
                  setImageLabel('Satélite Marte (Cráteres)');
                }
              }}
              style={{
                background: '#1e3a8a',
                color: '#bfdbfe',
                border: '1px solid #3b82f6',
                borderRadius: '6px',
                padding: '5px 10px',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '12px',
                fontWeight: 'bold',
              }}
            >
              🔄 Cambiar Imagen ({imageSrc === '/mars-terrain.jpg' ? 'Ver Plano B/N' : 'Ver Marte Satélite'})
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                background: '#065f46',
                color: '#d1fae5',
                border: '1px solid #10b981',
                borderRadius: '6px',
                padding: '5px 10px',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '12px',
                fontWeight: 'bold',
              }}
            >
              📂 Subir Otra Imagen...
            </button>

            <button
              onClick={() => setShowDetectedZones(!showDetectedZones)}
              style={{
                background: showDetectedZones ? '#7f1d1d' : '#1f2937',
                color: '#fecaca',
                border: '1px solid #ef4444',
                borderRadius: '6px',
                padding: '5px 10px',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '12px',
              }}
            >
              {showDetectedZones ? 'Cráteres Detectados: ON' : 'Cráteres Detectados: OFF'}
            </button>

            <button
              onClick={() => setShowContours(!showContours)}
              style={{
                background: showContours ? '#7c2d12' : '#1f2937',
                color: '#fed7aa',
                border: '1px solid #9a3412',
                borderRadius: '6px',
                padding: '5px 10px',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '12px',
              }}
            >
              {showContours ? 'Curvas Nivel: ON' : 'Curvas Nivel: OFF'}
            </button>
          </div>
        </div>

        {/* Fila principal: Mapa (izquierda) + Panel de Obstáculos y Elevación (derecha) */}
        <div style={{ display: 'flex', gap: '14px', alignItems: 'stretch', flexWrap: 'wrap' }}>
          {/* Lienzo Canvas 2D interactivo */}
          <div style={{ position: 'relative', flex: '2 1 560px', minWidth: '320px' }}>
            <canvas
              ref={canvasRef}
              width={920}
              height={440}
              onClick={handleCanvasClick}
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoverInfo(null)}
              style={{
                width: '100%',
                height: 'auto',
                borderRadius: '8px',
                border: '2px solid #374151',
                cursor: 'pointer',
                display: 'block',
              }}
            />

            {/* Barra flotante con métricas del Camino Seguro calculado */}
            <div
              style={{
                position: 'absolute',
                top: '10px',
                left: '10px',
                background: 'rgba(17, 24, 39, 0.92)',
                border: '1px solid #22c55e',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#f3f4f6',
                display: 'flex',
                gap: '14px',
                flexWrap: 'wrap',
                maxWidth: 'calc(100% - 70px)',
              }}
            >
              <span style={{ color: '#4ade80', fontWeight: 'bold' }}>
                ✅ CAMINO SEGURO TRAZADO
              </span>
              <span>
                Distancia: <strong>{safeRoute.distanceMeters} m</strong>
              </span>
              <span>
                Pendiente Máx: <strong>{safeRoute.maxSlopeDeg}°</strong>
              </span>
              <span>
                Tiempo Est.: <strong>{safeRoute.estimatedSeconds} s</strong>
              </span>
            </div>

            {/* Brújula decorativa (aguja orientada según el yaw real del EVA) */}
            <div
              style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                background: 'rgba(17, 24, 39, 0.85)',
                border: '1px solid #38bdf8',
                zIndex: 4,
              }}
            >
              <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                <span style={{ position: 'absolute', top: '2px', left: '50%', transform: 'translateX(-50%)', fontSize: '9px', color: '#93c5fd', fontWeight: 'bold' }}>N</span>
                <span style={{ position: 'absolute', bottom: '1px', left: '50%', transform: 'translateX(-50%)', fontSize: '8px', color: '#64748b' }}>S</span>
                <span style={{ position: 'absolute', left: '2px', top: '50%', transform: 'translateY(-50%)', fontSize: '8px', color: '#64748b' }}>O</span>
                <span style={{ position: 'absolute', right: '2px', top: '50%', transform: 'translateY(-50%)', fontSize: '8px', color: '#64748b' }}>E</span>
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: '2px',
                    height: '15px',
                    background: '#f97316',
                    transform: `translate(-50%, -100%) rotate(${evaYaw}deg)`,
                    transformOrigin: 'bottom center',
                  }}
                />
              </div>
            </div>

            {/* Inspector de coordenadas al pasar el mouse (centrado, abajo) */}
            <div
              style={{
                position: 'absolute',
                bottom: '10px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(17, 24, 39, 0.90)',
                border: '1px solid #374151',
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                color: '#e5e7eb',
                maxWidth: 'calc(100% - 110px)',
                textAlign: 'center',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {hoverInfo ? (
                <span>
                  Click para ir a: <strong>X={hoverInfo.x}m, Y={hoverInfo.y}m</strong> • Elevación real píxel:{' '}
                  <strong style={{ color: '#fb923c' }}>{hoverInfo.z}m</strong> • Pendiente real:{' '}
                  <strong>{hoverInfo.slope}°</strong>
                </span>
              ) : (
                <span>Haz clic en cualquier punto de la imagen para trazar el Camino Seguro</span>
              )}
            </div>

            {/* Escala + Lat/Lon simulada, arriba del ícono del ojo */}
            <div
              style={{
                position: 'absolute',
                right: '54px',
                bottom: '10px',
                textAlign: 'right',
                fontSize: '9px',
                color: '#9ca3af',
                background: 'rgba(17, 24, 39, 0.75)',
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid #374151',
                zIndex: 4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                <span style={{ width: '22px', height: '2px', background: '#e5e7eb', display: 'inline-block' }} />
                {dataset.widthMeters} m
              </div>
              <div>Lat {latLon.lat}° Lon {latLon.lon}°</div>
            </div>

            {/* Ícono Astronauta: abre/cierra la telemetría del traje EVA-01 */}
            <button
              onClick={() => setShowTelemetry(!showTelemetry)}
              title="Telemetría del traje EVA-01"
              style={{
                position: 'absolute',
                left: '10px',
                bottom: '10px',
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                background: showTelemetry ? '#38bdf8' : '#ffffff',
                border: '2px solid #0c4a6e',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                zIndex: 5,
                padding: 0,
              }}
            >
              🧑‍🚀
            </button>

            {/* Ícono Ojo: alterna el estilo visual del mapa (Satélite ↔ Topográfico Neón) */}
            <button
              onClick={() => setMapStyle(mapStyle === 'satellite' ? 'topo_neon' : 'satellite')}
              title="Cambiar vista del mapa"
              style={{
                position: 'absolute',
                right: '10px',
                bottom: '10px',
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                background: '#ffffff',
                border: '2px solid #0c4a6e',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                zIndex: 5,
                padding: 0,
              }}
            >
              👁️
            </button>

            {/* Panel flotante de Telemetría del traje EVA-01 */}
            {showTelemetry && (
              <div
                style={{
                  position: 'absolute',
                  left: '10px',
                  bottom: '56px',
                  width: '230px',
                  background: 'rgba(6, 20, 15, 0.96)',
                  border: '1px solid #22c55e',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  fontSize: '11px',
                  color: '#e5e7eb',
                  zIndex: 6,
                  boxShadow: '0 4px 14px rgba(0,0,0,0.6)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ color: '#4ade80' }}>Telemetría del traje EVA-01</strong>
                  <span style={{ fontSize: '12px' }}>
                    📶 {isConnected ? '🟢' : '⚪'} 🔋
                  </span>
                </div>
                {eva ? (
                  <>
                    <TelemetryBar
                      label="O2 en depósito"
                      value={eva.suit_o2}
                      unit="%"
                      critical={THRESHOLDS.O2.CRITICAL}
                      warning={THRESHOLDS.O2.WARNING}
                    />
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span>Pulso cardiaco</span>
                        <strong style={{ color: '#f87171' }}>{eva.heart_rate} BPM</strong>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '14px' }}>
                        {Array.from({ length: 14 }).map((_, i) => {
                          const h = 4 + Math.abs(Math.sin(i * 0.9 + eva.heart_rate)) * 10;
                          return (
                            <div
                              key={i}
                              style={{ width: '3px', height: `${h}px`, background: '#f87171', borderRadius: '1px' }}
                            />
                          );
                        })}
                      </div>
                    </div>
                    <TelemetryBar
                      label="Batería"
                      value={eva.battery}
                      unit="%"
                      critical={THRESHOLDS.BATTERY.CRITICAL}
                      warning={THRESHOLDS.BATTERY.WARNING}
                    />
                  </>
                ) : (
                  <p style={{ color: '#6b7280', margin: 0 }}>Esperando telemetría de ESP32 #3...</p>
                )}
              </div>
            )}
          </div>

          {/* Panel lateral: Obstáculos & Pendientes + Elevación */}
          <div style={{ flex: '1 1 230px', minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: '8px', overflow: 'hidden' }}>
              <div
                style={{
                  background: '#facc15',
                  color: '#1f2937',
                  fontWeight: 'bold',
                  fontSize: '12px',
                  padding: '6px 10px',
                }}
              >
                ⚠️ Obstáculos &amp; Pendientes
              </div>
              <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                {riskCards.map((c, i) => (
                  <div
                    key={i}
                    style={{
                      background: c.level === 'red' ? '#7f1d1d' : c.level === 'yellow' ? '#78350f' : '#14532d',
                      border: `1px solid ${c.level === 'red' ? '#ef4444' : c.level === 'yellow' ? '#f59e0b' : '#22c55e'}`,
                      borderRadius: '6px',
                      padding: '8px 10px',
                      fontSize: '11px',
                    }}
                  >
                    <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>
                      {c.level === 'red' ? '🔴' : c.level === 'yellow' ? '🟡' : '🟢'} {c.title}
                    </div>
                    <div style={{ color: '#e5e7eb' }}>{c.text}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: '8px', padding: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '12px', marginBottom: '6px' }}>
                <strong style={{ color: '#38bdf8' }}>📈 Elevación</strong>
                <span style={{ color: '#9ca3af', fontSize: '11px' }}>
                  Pendiente máx: <strong style={{ color: '#fb923c' }}>{safeRoute.maxSlopeDeg}°</strong>
                </span>
              </div>
              {elevationChart ? (
                <>
                  <svg viewBox={`0 0 ${elevationChart.W} ${elevationChart.H}`} style={{ width: '100%', height: '70px', display: 'block' }}>
                    <polygon points={elevationChart.areaPts} fill="rgba(56,189,248,0.18)" />
                    <polyline points={elevationChart.linePts} fill="none" stroke="#38bdf8" strokeWidth={1.6} />
                  </svg>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>
                    <span>{elevationChart.minE}m</span>
                    <span>Distancia: {safeRoute.distanceMeters}m</span>
                    <span>{elevationChart.maxE}m</span>
                  </div>
                </>
              ) : (
                <p style={{ fontSize: '11px', color: '#6b7280', margin: 0 }}>
                  Traza una ruta (clic en el mapa) para ver el perfil de elevación.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Leyenda inferior */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '14px',
            marginTop: '10px',
            fontSize: '12px',
            color: '#9ca3af',
          }}
        >
          <span style={{ color: '#4ade80', fontWeight: 'bold' }}>━━ Camino Seguro (Evita cráteres reales de la foto)</span>
          <span style={{ color: '#f87171' }}>◌ Cráteres / Barrancos Reales Detectados en la Imagen</span>
          <span style={{ color: '#c084fc' }}>◌ Cono de Escaneo Dron Fijo (Altitud Z)</span>
          <span style={{ color: '#38bdf8' }}>● EVA (Alan)</span>
        </div>
      </div>
    </div>
  );
};
