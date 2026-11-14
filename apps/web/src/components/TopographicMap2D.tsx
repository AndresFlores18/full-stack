import React, { useEffect, useRef, useState } from 'react';
import {
  MartianTerrainDataset,
  OperationMode,
  sampleElevationAt,
} from '../config/connectionConfig';

interface TopographicMap2DProps {
  dataset: MartianTerrainDataset;
  mode: OperationMode;
  isConnected: boolean;
  evaYaw?: number;
}

type VisualTheme = 'tactical_mars' | 'blueprint_paper';

/**
 * Componente Modular: Mapa Topográfico 2D de Marte con Curvas de Nivel (Marching Squares)
 * Dibuja isolíneas topográficas reales con cotas numéricas (19..40), senderos punteados,
 * obstáculos detectados por Berni (Dron CV) y posición de las unidades.
 */
export const TopographicMap2D: React.FC<TopographicMap2DProps> = ({
  dataset,
  mode,
  isConnected,
  evaYaw = 0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [theme, setTheme] = useState<VisualTheme>('tactical_mars');
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);
  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    z: number;
  } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const isPaper = theme === 'blueprint_paper';

    // 1. Fondo base
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = isPaper ? '#faf8f5' : '#0b1120';
    ctx.fillRect(0, 0, width, height);

    // 2. Muestreo de la grilla de elevación (Grid DEM)
    const cols = 90;
    const rows = 58;
    const cellW = width / cols;
    const cellH = height / rows;

    const grid: number[][] = [];
    for (let r = 0; r <= rows; r++) {
      const rowVals: number[] = [];
      const yMeters = (r / rows) * dataset.heightMeters;
      for (let c = 0; c <= cols; c++) {
        const xMeters = (c / cols) * dataset.widthMeters;
        rowVals.push(sampleElevationAt(xMeters, yMeters, dataset));
      }
      grid.push(rowVals);
    }

    // 3. Capa opcional de sombreado hipsométrico (elevación por color)
    if (showHeatmap && !isPaper) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const z = grid[r][c];
          const norm = Math.max(
            0,
            Math.min(1, (z - dataset.minElevation) / (dataset.maxElevation - dataset.minElevation))
          );
          // Gradiente marciano oscuro: de cañón profundo a cumbre ocre/naranja
          const red = Math.round(20 + norm * 165);
          const green = Math.round(28 + norm * 65);
          const blue = Math.round(45 - norm * 25);
          ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, 0.28)`;
          ctx.fillRect(c * cellW, r * cellH, Math.ceil(cellW), Math.ceil(cellH));
        }
      }
    }

    // 4. Cuadrícula métrica sutil
    ctx.strokeStyle = isPaper ? 'rgba(0, 0, 0, 0.06)' : 'rgba(148, 163, 184, 0.08)';
    ctx.lineWidth = 1;
    for (let m = 1; m < dataset.widthMeters; m++) {
      const px = (m / dataset.widthMeters) * width;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
      ctx.stroke();
    }
    for (let m = 1; m < dataset.heightMeters; m++) {
      const py = (m / dataset.heightMeters) * height;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(width, py);
      ctx.stroke();
    }

    // 5. Algoritmo Marching Squares para trazar las LÍNEAS TOPOGRÁFICAS (Curvas de Nivel)
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
      // Cada 4 niveles hacemos una curva maestra más gruesa (como en el plano topográfico de referencia)
      const isMajorContour = Math.round(level) % 5 === 0 || levelIdx % 3 === 0;

      ctx.beginPath();
      ctx.strokeStyle = isPaper
        ? isMajorContour
          ? '#111827'
          : '#4b5563'
        : isMajorContour
        ? 'rgba(251, 146, 60, 0.88)'
        : 'rgba(253, 186, 116, 0.42)';
      ctx.lineWidth = isMajorContour ? 2.0 : 1.0;

      let labelPlacedForLevel = false;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const zTL = grid[r][c];
          const zTR = grid[r][c + 1];
          const zBR = grid[r + 1][c + 1];
          const zBL = grid[r + 1][c];

          let mask = 0;
          if (zTL >= level) mask |= 8;
          if (zTR >= level) mask |= 4;
          if (zBR >= level) mask |= 2;
          if (zBL >= level) mask |= 1;

          if (mask === 0 || mask === 15) continue;

          const x0 = c * cellW;
          const y0 = r * cellH;

          const top = {
            x: x0 + interpolate(zTL, zTR, level) * cellW,
            y: y0,
          };
          const right = {
            x: x0 + cellW,
            y: y0 + interpolate(zTR, zBR, level) * cellH,
          };
          const bottom = {
            x: x0 + interpolate(zBL, zBR, level) * cellW,
            y: y0 + cellH,
          };
          const left = {
            x: x0,
            y: y0 + interpolate(zTL, zBL, level) * cellH,
          };

          const drawSeg = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);

            // Etiqueta numérica de cota sobre la curva (ej. 28, 30, 35, 40)
            if (
              !labelPlacedForLevel &&
              c > 18 &&
              c < cols - 18 &&
              r > 6 &&
              r < rows - 6 &&
              (c + r) % 17 === 0
            ) {
              labelPlacedForLevel = true;
              ctx.save();
              ctx.font = isMajorContour ? 'bold 10px monospace' : '9px monospace';
              ctx.fillStyle = isPaper ? '#111827' : '#fed7aa';
              ctx.fillText(`${Math.round(level)}`, p1.x + 2, p1.y - 2);
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

    // 6. Sendero de exploración punteado (como en el plano topográfico de referencia)
    if (dataset.waypoints.length > 1) {
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([4, 5]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = dataset.safePath
        ? isPaper
          ? '#1f2937'
          : '#38bdf8'
        : '#ef4444';

      dataset.waypoints.forEach(([wx, wy], idx) => {
        const px = (wx / dataset.widthMeters) * width;
        const py = (wy / dataset.heightMeters) * height;
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.restore();
    }

    // 7. Obstáculos enviados por Bernardo (Dron CV)
    dataset.obstacles.forEach((obs, idx) => {
      const ox = Math.min(9.5, Math.max(0.5, obs.x * 2.2));
      const oy = Math.min(9.5, Math.max(0.5, obs.y * 2.2));
      const px = (ox / dataset.widthMeters) * width;
      const py = (oy / dataset.heightMeters) * height;
      const pr = Math.max(12, (obs.radius * 2.0 / dataset.widthMeters) * width);

      const isHigh = obs.severity === 'high' || obs.severity === 'critical';

      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fillStyle = isHigh ? 'rgba(239, 68, 68, 0.22)' : 'rgba(245, 158, 11, 0.18)';
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = isHigh ? '#ef4444' : '#f59e0b';
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = isHigh ? '#fca5a5' : isPaper ? '#92400e' : '#fde68a';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`OBS#${idx + 1} (${obs.severity.toUpperCase()})`, px + pr + 4, py + 3);
      ctx.restore();
    });

    // 8. Posición de Estación Base (fija en [1.2m, 3.5m])
    const basePx = (1.2 / dataset.widthMeters) * width;
    const basePy = (3.5 / dataset.heightMeters) * height;
    ctx.save();
    ctx.fillStyle = '#facc15';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.fillRect(basePx - 7, basePy - 7, 14, 14);
    ctx.strokeRect(basePx - 7, basePy - 7, 14, 14);
    ctx.fillStyle = isPaper ? '#111827' : '#fef08a';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('BASE HABITAT', basePx + 10, basePy + 4);
    ctx.restore();

    // 9. Posición de EVA Astronauta (Alan)
    const evaX = 2.8 + Math.sin((evaYaw * Math.PI) / 180) * 0.4;
    const evaY = 4.2 + Math.cos((evaYaw * Math.PI) / 180) * 0.4;
    const evaPx = (evaX / dataset.widthMeters) * width;
    const evaPy = (evaY / dataset.heightMeters) * height;

    ctx.save();
    ctx.beginPath();
    ctx.arc(evaPx, evaPy, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.fillStyle = isPaper ? '#0369a1' : '#7dd3fc';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('EVA (Alan)', evaPx + 10, evaPy + 4);
    ctx.restore();

    // 10. Posición en Tiempo Real del Dron CV de Bernardo (Berni)
    const droneX = Math.min(9.4, Math.max(0.6, dataset.dronePos[0] * 2.2));
    const droneY = Math.min(9.4, Math.max(0.6, dataset.dronePos[1] * 2.2));
    const dronePx = (droneX / dataset.widthMeters) * width;
    const dronePy = (droneY / dataset.heightMeters) * height;

    ctx.save();
    // Cono/radio de escaneo de la cámara RealSense D415
    ctx.beginPath();
    ctx.arc(dronePx, dronePy, 36, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(dronePx, dronePy, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#a855f7';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.fillStyle = isPaper ? '#6b21a8' : '#e9d5ff';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(
      `DRON BERNI [z=${dataset.dronePos[2]}m]`,
      dronePx + 12,
      dronePy - 4
    );
    ctx.restore();
  }, [dataset, theme, showHeatmap, evaYaw]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    const xm = Number((relX * dataset.widthMeters).toFixed(2));
    const ym = Number((relY * dataset.heightMeters).toFixed(2));
    const zm = Number(sampleElevationAt(xm, ym, dataset).toFixed(1));
    setHoverInfo({ x: xm, y: ym, z: zm });
  };

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
      {/* Cabecera de controles del Mapa Topográfico 2D */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '12px',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', color: '#f97316' }}>
            🗺️ Mapa Topográfico 2D de Marte (Curvas de Nivel + Visión Dron Berni)
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#9ca3af' }}>
            Fuente activa:{' '}
            <strong style={{ color: mode === 'local_esp' ? '#38bdf8' : '#a855f7' }}>
              {mode === 'local_esp'
                ? 'MODO LOCAL (ESP32 Directo)'
                : 'MODO EN LÍNEA (Raspberry Pi - Centro de Mando)'}
            </strong>{' '}
            • Estado: {isConnected ? 'Recibiendo telemetría' : 'Usando topología base en caché'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() =>
              setTheme(theme === 'tactical_mars' ? 'blueprint_paper' : 'tactical_mars')
            }
            style={{
              background: theme === 'blueprint_paper' ? '#f3f4f6' : '#1f2937',
              color: theme === 'blueprint_paper' ? '#111827' : '#e5e7eb',
              border: '1px solid #4b5563',
              borderRadius: '6px',
              padding: '6px 12px',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: '12px',
              fontWeight: 'bold',
            }}
          >
            {theme === 'blueprint_paper'
              ? '📄 Vista: Plano Clásico (B/N)'
              : '🌑 Vista: Táctica Marte'}
          </button>

          {theme === 'tactical_mars' && (
            <button
              onClick={() => setShowHeatmap(!showHeatmap)}
              style={{
                background: showHeatmap ? '#7c2d12' : '#1f2937',
                color: '#fed7aa',
                border: '1px solid #9a3412',
                borderRadius: '6px',
                padding: '6px 12px',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '12px',
              }}
            >
              {showHeatmap ? 'Relieve Color: ON' : 'Relieve Color: OFF'}
            </button>
          )}
        </div>
      </div>

      {/* Lienzo Canvas 2D */}
      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          width={920}
          height={440}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverInfo(null)}
          style={{
            width: '100%',
            height: 'auto',
            borderRadius: '8px',
            border: '1px solid #374151',
            cursor: 'crosshair',
            display: 'block',
          }}
        />

        {/* Inspector de coordenadas al pasar el mouse */}
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            left: '12px',
            background: 'rgba(17, 24, 39, 0.88)',
            border: '1px solid #374151',
            padding: '6px 10px',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#e5e7eb',
          }}
        >
          {hoverInfo ? (
            <span>
              Cursor: <strong>X={hoverInfo.x}m, Y={hoverInfo.y}m</strong> • Cota Elevación:{' '}
              <strong style={{ color: '#fb923c' }}>{hoverInfo.z} m</strong>
            </span>
          ) : (
            <span>Pasa el cursor sobre el mapa para inspeccionar la cota topográfica (m)</span>
          )}
        </div>
      </div>

      {/* Leyenda inferior del mapa */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
          marginTop: '10px',
          fontSize: '12px',
          color: '#9ca3af',
        }}
      >
        <span>━ Curvas de nivel (cota en metros 19m..40m)</span>
        <span style={{ color: '#38bdf8' }}>● EVA Traje (Alan)</span>
        <span style={{ color: '#a855f7' }}>● Dron CV (Berni) + Radio Escaneo D415</span>
        <span style={{ color: '#facc15' }}>■ Estación Base</span>
        <span style={{ color: '#ef4444' }}>◌ Obstáculos / Pendiente Crítica</span>
      </div>
    </div>
  );
};

