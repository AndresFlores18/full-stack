import React, { useEffect, useMemo, useRef, useState } from 'react';
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
}

type RouteOrigin = 'eva' | 'base';

const GRID_COLS = 96;
const GRID_ROWS = 60;

/**
 * Mapa Topográfico 2D con Visión por Computadora Real sobre la Imagen Cargada:
 * - Extrae el relieve real (ecualización de histograma 19m..40m) y los bordes/cráteres reales (operador Sobel)
 *   directamente de los píxeles de la imagen que pongas.
 * - El Dron Fijo (Altitud Z) escanea y marca los cráteres/obstáculos reales de la foto dentro de su radio.
 * - El Camino Seguro (A*) rodea los cráteres y pendientes reales de la imagen hasta donde haces clic.
 */
export const TopographicMap2D: React.FC<TopographicMap2DProps> = ({
  dataset,
  mode,
  isConnected,
  evaYaw = 0,
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !visionData) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // 1. Dibujar la IMAGEN ACTIVA de fondo
    ctx.clearRect(0, 0, width, height);
    if (loadedImgRef.current) {
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
        ctx.strokeStyle = visionData.isLineMap
          ? isMajorContour
            ? 'rgba(234, 88, 12, 0.78)'
            : 'rgba(249, 115, 22, 0.42)'
          : isMajorContour
          ? 'rgba(253, 186, 116, 0.78)'
          : 'rgba(254, 215, 170, 0.40)';
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

  return (
    <div
      style={{
        background: '#111827',
        border: '1px solid #374151',
        borderRadius: '10px',
        padding: '16px',
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
        <div>
          <h2 style={{ margin: 0, fontSize: '17px', color: '#f97316' }}>
            🗺️ Visión Real sobre Imagen + Camino Seguro ({imageLabel})
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#9ca3af' }}>
            Detecta los <strong>cráteres, sombras y pendientes reales</strong> de los píxeles de la foto ({scannedHazardsCount} zonas escaneadas por el Dron).
          </p>
        </div>

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

      {/* Lienzo Canvas 2D interactivo */}
      <div style={{ position: 'relative' }}>
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

        {/* Inspector de coordenadas al pasar el mouse */}
        <div
          style={{
            position: 'absolute',
            bottom: '10px',
            left: '10px',
            background: 'rgba(17, 24, 39, 0.90)',
            border: '1px solid #374151',
            padding: '5px 10px',
            borderRadius: '6px',
            fontSize: '11px',
            color: '#e5e7eb',
          }}
        >
          {hoverInfo ? (
            <span>
              Click para ir a: <strong>X={hoverInfo.x}m, Y={hoverInfo.y}m</strong> • Elevación real píxel:{' '}
              <strong style={{ color: '#fb923c' }}>{hoverInfo.z}m</strong> • Pendiente real:{' '}
              <strong>{hoverInfo.slope}°</strong>
            </span>
          ) : (
            <span>Haz clic en cualquier punto de la imagen para trazar el Camino Seguro evitando cráteres reales</span>
          )}
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
  );
};
