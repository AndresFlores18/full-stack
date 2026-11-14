import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DroneData, EvaData, RealMapStatePayload, RiskAssessment, THRESHOLDS } from '@martian/shared';
import {
  analyzeImageTerrainReal,
  computeSafeRouteFromImageVision,
  FIXED_DRONE_PAD_POS,
  fuseVisionWithD415Data,
  ImageVisionAnalysis,
  MartianTerrainDataset,
  OperationMode,
  sampleMatrixAt,
} from '../config/connectionConfig';
import { MapLayerMode, renderTopographicMapCanvas } from './map/mapCanvasRenderer';

interface TopographicMap2DProps {
  dataset: MartianTerrainDataset;
  droneData?: DroneData | null;
  serverUrl?: string;
  mode: OperationMode;
  isConnected: boolean;
  evaYaw?: number;
  eva?: EvaData | null;
  risk: RiskAssessment;
  utcTime?: string;
}

type RouteOrigin = 'eva' | 'base';

const GRID_COLS = 96;
const GRID_ROWS = 60;

const MAP_LAYER_ORDER: MapLayerMode[] = [
  'fusion_mars_d415',
  'pure_d415_grid',
  'live_server_cam',
  'topo_lines',
];

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
 * Mapa Táctico 2D alimentado por `data/` y el Servidor IP (RealSense D415):
 * - Fusiona la Visión por Computadora sobre la imagen (cráteres/pendientes reales de los píxeles)
 *   con el Grid de Ocupación 120×80 y los obstáculos BOULDER/CREVICE reportados por la D415.
 * - 4 vistas de capa real (Fusión Marte+D415, Grid Ocupación puro, Cámara en vivo del servidor, Plano B/N).
 * - Ícono de astronauta: abre/cierra el panel flotante de telemetría del traje EVA-01.
 * - Ícono de ojo: atajo rápido que recorre las 4 vistas de capa real.
 */
export const TopographicMap2D: React.FC<TopographicMap2DProps> = ({
  dataset,
  droneData,
  serverUrl = 'ws://localhost:8765',
  isConnected,
  evaYaw = 0,
  eva = null,
  risk,
  utcTime,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const loadedImgRef = useRef<HTMLImageElement | null>(null);

  const [mapLayerMode, setMapLayerMode] = useState<MapLayerMode>('fusion_mars_d415');
  const [imageSrc, setImageSrc] = useState<string>('/mars-terrain.jpg');
  const [imageLabel, setImageLabel] = useState<string>(
    'Fusión Marte + Telemetría D415 (Servidor/data)'
  );

  const [baseVisionData, setBaseVisionData] = useState<ImageVisionAnalysis | null>(null);
  const [localMapState, setLocalMapState] = useState<RealMapStatePayload | null>(null);

  const [showContours, setShowContours] = useState<boolean>(true);
  const [showDetectedZones] = useState<boolean>(true);
  const [showD415GridOverlay, setShowD415GridOverlay] = useState<boolean>(true);
  const [showServerPaths, setShowServerPaths] = useState<boolean>(true);
  const [routeOrigin] = useState<RouteOrigin>('eva');
  const [targetPoint, setTargetPoint] = useState<[number, number]>([7.8, 3.2]);

  const [showTelemetry, setShowTelemetry] = useState<boolean>(false);

  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    z: number;
    slope: number;
    d415Cell?: string;
  } | null>(null);

  useEffect(() => {
    fetch('/data/real_map_state.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.occupancy_grid) {
          setLocalMapState(d);
        }
      })
      .catch(() => {});
  }, []);

  const activeMapState: RealMapStatePayload | null = droneData?.map_state ?? localMapState;

  useEffect(() => {
    if (mapLayerMode === 'live_server_cam' && droneData?.images?.rgb) {
      setImageSrc(droneData.images.rgb);
      setImageLabel('Stream RGB RealSense D415 (Servidor IP)');
    } else if (mapLayerMode === 'topo_lines') {
      setImageSrc('/topo-reference.jpg');
      setImageLabel('Plano Topográfico Curvas + Datos D415');
    } else if (mapLayerMode === 'fusion_mars_d415' && imageSrc.startsWith('data:image')) {
      setImageSrc('/mars-terrain.jpg');
      setImageLabel('Fusión Marte + Telemetría D415');
    }
  }, [mapLayerMode, droneData?.images?.rgb]);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageSrc;
    img.onload = () => {
      loadedImgRef.current = img;
      const analysis = analyzeImageTerrainReal(img, GRID_COLS, GRID_ROWS);
      setBaseVisionData(analysis);
    };
  }, [imageSrc]);

  const visionData = useMemo(
    () =>
      fuseVisionWithD415Data(
        baseVisionData,
        activeMapState,
        droneData,
        dataset,
        GRID_COLS,
        GRID_ROWS
      ),
    [baseVisionData, activeMapState, droneData, dataset]
  );

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setImageSrc(objectUrl);
    setImageLabel(`Imagen Real: ${file.name}`);
  };

  const basePos: [number, number] = [1.1, 5.8];
  const dronePadPos: [number, number] = FIXED_DRONE_PAD_POS;
  const evaPos: [number, number] = [
    Number((2.15 + Math.sin((evaYaw * Math.PI) / 180) * 0.1).toFixed(2)),
    Number((5.55 + Math.cos((evaYaw * Math.PI) / 180) * 0.1).toFixed(2)),
  ];

  const startPoint: [number, number] = routeOrigin === 'eva' ? evaPos : basePos;

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

  // Perfil de elevación real a lo largo del Camino Seguro, muestreado de la matriz de visión fusionada
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

    renderTopographicMapCanvas({
      ctx,
      width: canvas.width,
      height: canvas.height,
      gridCols: GRID_COLS,
      gridRows: GRID_ROWS,
      dataset,
      visionData,
      activeMapState,
      droneData,
      loadedImg: loadedImgRef.current,
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
    });
  }, [
    dataset,
    visionData,
    activeMapState,
    droneData,
    mapLayerMode,
    showContours,
    showDetectedZones,
    showD415GridOverlay,
    showServerPaths,
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

    let d415Cell: string | undefined;
    if (activeMapState?.occupancy_grid) {
      const y_m = (xm - 1.5) / 1.45;
      const x_m = (ym - 5.4) / 1.45;
      const r = Math.round(y_m / 0.05);
      const c = Math.round((x_m + 2.0) / 0.05);
      if (r >= 0 && r < activeMapState.grid_rows && c >= 0 && c < activeMapState.grid_cols) {
        const val = activeMapState.occupancy_grid[r]?.[c];
        if (val === 2) d415Cell = '🟠 BOULDER (Roca D415)';
        else if (val === 3) d415Cell = '🔵 CREVICE (Grieta D415)';
        else if (val === 1) d415Cell = '🟤 INFLATED (Margen D415)';
        else if (val === 0) d415Cell = '🟢 FREE (Explorado D415)';
      }
    }

    setHoverInfo({ x: xm, y: ym, z: zm, slope, d415Cell });
  };

  const d415ObstacleCount = droneData?.obstacles?.length ?? 0;
  const scannedHazardsCount = useMemo(() => {
    if (!visionData) return 0;
    return visionData.detectedObstacles.filter(
      (h) => Math.hypot(h.x - dronePadPos[0], h.y - dronePadPos[1]) <= dataset.droneScanRadius
    ).length;
  }, [visionData, dataset.droneScanRadius]);

  // Tarjetas de "Obstáculos & Pendientes" a partir del riesgo real evaluado (EVA + Dron)
  // y de los cráteres/pendientes ya fusionados con los obstáculos reales BOULDER/CREVICE de la D415.
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
        text: `Zona con ${scannedHazardsCount} cráter(es)/pendiente(s) y obstáculo(s) D415 dentro del escaneo`,
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

  const cycleMapLayerMode = () => {
    const idx = MAP_LAYER_ORDER.indexOf(mapLayerMode);
    setMapLayerMode(MAP_LAYER_ORDER[(idx + 1) % MAP_LAYER_ORDER.length]);
  };

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
            🗺️ {imageLabel}
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
            Fusión activa:{' '}
            <strong>
              Grid Ocupación 120×80 (`latest_map_state.npz`) + {d415ObstacleCount} Obstáculos D415
              (`BOULDER`/`CREVICE`) + {scannedHazardsCount} Zonas Escaneadas
            </strong>{' '}
            • Servidor: <code>{serverUrl}</code>
          </p>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setMapLayerMode('fusion_mars_d415')}
              style={{
                background: mapLayerMode === 'fusion_mars_d415' ? '#ea580c' : '#1f2937',
                color: '#fff',
                border: '1px solid #f97316',
                borderRadius: '6px',
                padding: '5px 10px',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '11px',
                fontWeight: 'bold',
              }}
            >
              🌐 Fusión Marte + D415
            </button>

            <button
              onClick={() => setMapLayerMode('pure_d415_grid')}
              style={{
                background: mapLayerMode === 'pure_d415_grid' ? '#0284c7' : '#1f2937',
                color: '#e0f2fe',
                border: '1px solid #38bdf8',
                borderRadius: '6px',
                padding: '5px 10px',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '11px',
                fontWeight: 'bold',
              }}
            >
              📡 Grid Ocupación 120×80 (Puro D415)
            </button>

            <button
              onClick={() => setMapLayerMode('live_server_cam')}
              style={{
                background: mapLayerMode === 'live_server_cam' ? '#7c3aed' : '#1f2937',
                color: '#ede9fe',
                border: '1px solid #a855f7',
                borderRadius: '6px',
                padding: '5px 10px',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '11px',
                fontWeight: 'bold',
              }}
            >
              📷 Cámara Servidor en Mapa
            </button>

            <button
              onClick={() => setMapLayerMode('topo_lines')}
              style={{
                background: mapLayerMode === 'topo_lines' ? '#1e3a8a' : '#1f2937',
                color: '#bfdbfe',
                border: '1px solid #3b82f6',
                borderRadius: '6px',
                padding: '5px 10px',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '11px',
              }}
            >
              🗺️ Plano B/N + D415
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
                fontSize: '11px',
              }}
            >
              📂 Subir Imagen...
            </button>

            <button
              onClick={() => setShowD415GridOverlay(!showD415GridOverlay)}
              style={{
                background: showD415GridOverlay ? '#0e7490' : '#1f2937',
                color: '#cffafe',
                border: '1px solid #06b6d4',
                borderRadius: '6px',
                padding: '5px 10px',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '11px',
              }}
            >
              {showD415GridOverlay ? 'Grid D415: ON' : 'Grid D415: OFF'}
            </button>

            <button
              onClick={() => setShowServerPaths(!showServerPaths)}
              style={{
                background: showServerPaths ? '#3f6212' : '#1f2937',
                color: '#ecfccb',
                border: '1px solid #84cc16',
                borderRadius: '6px',
                padding: '5px 10px',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '11px',
              }}
            >
              {showServerPaths ? 'Rutas Servidor (A*/Dijkstra): ON' : 'Rutas Servidor: OFF'}
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
                fontSize: '11px',
              }}
            >
              {showContours ? 'Curvas: ON' : 'Curvas: OFF'}
            </button>
          </div>
        </div>

        {/* Fila principal: Mapa (izquierda) + Panel de Obstáculos y Elevación (derecha) */}
        <div style={{ display: 'flex', gap: '14px', alignItems: 'stretch', flexWrap: 'wrap' }}>
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
                maxWidth: 'calc(100% - 20px)',
              }}
            >
              <span style={{ color: '#4ade80', fontWeight: 'bold' }}>
                ✅ RUTA SEGURA (FUSIÓN D415 + TOPOGRAFÍA)
              </span>
              <span>
                Distancia: <strong>{safeRoute.distanceMeters} m</strong>
              </span>
              <span>
                Pendiente Máx: <strong>{safeRoute.maxSlopeDeg}°</strong>
              </span>
              {droneData?.navigation && (
                <span>
                  Rumbo D415:{' '}
                  <strong style={{ color: '#a3e635' }}>
                    {droneData.navigation.recommended_heading_deg > 0
                      ? `+${droneData.navigation.recommended_heading_deg}`
                      : droneData.navigation.recommended_heading_deg}
                    °
                  </strong>
                </span>
              )}
            </div>

            <div
              style={{
                position: 'absolute',
                bottom: '10px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(17, 24, 39, 0.92)',
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
                  Click para trazar ruta a: <strong>X={hoverInfo.x}m, Y={hoverInfo.y}m</strong> •
                  Elevación: <strong style={{ color: '#fb923c' }}>{hoverInfo.z}m</strong> • Pendiente:{' '}
                  <strong>{hoverInfo.slope}°</strong>
                  {hoverInfo.d415Cell && (
                    <span>
                      {' '}
                      • Celda `data/`: <strong>{hoverInfo.d415Cell}</strong>
                    </span>
                  )}
                </span>
              ) : (
                <span>
                  Haz clic en cualquier punto del mapa para calcular la ruta segura evitando los
                  obstáculos `BOULDER` y `CREVICE` del servidor
                </span>
              )}
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

            {/* Ícono Ojo: recorre rápidamente las 4 vistas de capa real del mapa */}
            <button
              onClick={cycleMapLayerMode}
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
          <span style={{ color: '#22c55e', fontWeight: 'bold' }}>
            ━━ Ruta Segura A* (Click en Mapa)
          </span>
          <span style={{ color: '#a3e635', fontWeight: 'bold' }}>━━ Ruta A* Servidor D415</span>
          <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>
            ┈┈ Ruta Dijkstra Servidor D415
          </span>
          <span style={{ color: '#fb923c', fontWeight: 'bold' }}>■ BOULDER (Roca D415)</span>
          <span style={{ color: '#06b6d4', fontWeight: 'bold' }}>■ CREVICE (Grieta D415)</span>
          <span style={{ color: '#d97706' }}>■ INFLATED (Margen D415)</span>
        </div>
      </div>
    </div>
  );
};
