import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DroneData, RealMapStatePayload } from '@martian/shared';
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
}

type RouteOrigin = 'eva' | 'base';

const GRID_COLS = 96;
const GRID_ROWS = 60;

export const TopographicMap2D: React.FC<TopographicMap2DProps> = ({
  dataset,
  droneData,
  serverUrl = 'ws://localhost:8765',
  evaYaw = 0,
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
            🗺️ Mapa Táctico Alimentado por `data/` y Servidor IP ({imageLabel})
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#9ca3af' }}>
            Fusión activa:{' '}
            <strong>
              Grid Ocupación 120×80 (`latest_map_state.npz`) + {d415ObstacleCount} Obstáculos D415
              (`BOULDER`/`CREVICE`) + {scannedHazardsCount} Zonas Escaneadas
            </strong>{' '}
            • Servidor: <code>{serverUrl}</code>
          </p>
        </div>

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
            left: '10px',
            background: 'rgba(17, 24, 39, 0.92)',
            border: '1px solid #374151',
            padding: '5px 10px',
            borderRadius: '6px',
            fontSize: '11px',
            color: '#e5e7eb',
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
      </div>

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
  );
};
