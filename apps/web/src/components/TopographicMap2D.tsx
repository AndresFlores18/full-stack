import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BatteryWarning,
  CheckCircle2,
  Eye,
  LucideIcon,
  Mountain,
  Radiation,
  TrendingUp,
  TriangleAlert,
  Upload,
  Wind,
} from 'lucide-react';
import { DroneData, EvaData, RealMapStatePayload, RiskAssessment } from '@martian/shared';
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
  mode: OperationMode;
  evaYaw?: number;
  eva?: EvaData | null;
  risk: RiskAssessment;
}

type RouteOrigin = 'eva' | 'base';

const GRID_COLS = 96;
const GRID_ROWS = 60;

// Las razones "fuertes" del evaluador de riesgo van siempre en MAYÚSCULAS (CRÍTICO/BLOQUEADA/EXTREMA);
// las de advertencia van en minúsculas. Reutilizamos esa convención para colorear cada tarjeta.
const RED_MARKERS = /CRÍTIC|BLOQUEADA|INSEGURA|EXTREMA/i;
function classifyReason(reason: string): 'red' | 'yellow' {
  return RED_MARKERS.test(reason) ? 'red' : 'yellow';
}

// Semáforo único para cualquier barra de porcentaje del panel: verde (>=65%), amarillo (45-64%), rojo (<45%).
function pctColor(value: number): string {
  return value >= 65 ? '#22c55e' : value >= 45 ? '#f59e0b' : '#ef4444';
}

const TelemetryBar: React.FC<{
  label: string;
  value: number;
  unit: string;
}> = ({ label, value, unit }) => {
  const color = pctColor(value);
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span>{label}</span>
        <strong style={{ color }}>
          {value.toFixed(1)}
          {unit}
          {value < 45 ? ' - CRÍTICO' : ''}
        </strong>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '999px', height: '8px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: '999px', background: color }} />
      </div>
    </div>
  );
};

const ECG_POINTS =
  '0,12 20,12 26,3 32,21 38,12 70,12 90,12 96,3 102,21 108,12 140,12 160,12 166,3 172,21 178,12 200,12';

const SEVERITY_COLOR: Record<'red' | 'yellow' | 'green', string> = {
  red: '#ef4444',
  yellow: '#f59e0b',
  green: '#22c55e',
};

const StatusDot: React.FC<{ level: 'red' | 'yellow' | 'green' }> = ({ level }) => {
  const color = SEVERITY_COLOR[level];
  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '13px',
        height: '13px',
        flexShrink: 0,
      }}
    >
      {level === 'red' && (
        <span
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: color,
            animation: 'statusDotPulse 1.6s ease-out infinite',
          }}
        />
      )}
      <span
        style={{
          position: 'relative',
          width: '9px',
          height: '9px',
          borderRadius: '50%',
          background: `radial-gradient(circle at 35% 30%, #ffffff80, ${color} 70%)`,
          boxShadow: `0 0 6px ${color}, 0 0 2px ${color}`,
          border: '1px solid rgba(255,255,255,0.3)',
        }}
      />
    </span>
  );
};

interface ElevPoint {
  dist: number;
  elev: number;
  slope: number;
}

// Convierte una serie de puntos en una curva suave (cardinal spline → Bézier cúbica),
// para que el perfil de elevación se vea como una curva real y no una línea quebrada.
function buildSmoothPath(pts: Array<[number, number]>): string {
  if (pts.length < 2) return '';
  if (pts.length === 2) return `M${pts[0][0]},${pts[0][1]} L${pts[1][0]},${pts[1][1]}`;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

const ElevationChart: React.FC<{ profile: ElevPoint[] }> = ({ profile }) => {
  if (profile.length < 2) return null;

  const W = 240;
  const H = 110;
  const padL = 30;
  const padR = 10;
  const padT = 14;
  const padB = 18;

  const maxDist = profile[profile.length - 1].dist || 1;
  const elevs = profile.map((p) => p.elev);
  const minE = Math.min(...elevs);
  const maxE = Math.max(...elevs);
  const span = Math.max(0.5, maxE - minE);

  const toX = (d: number) => padL + (d / maxDist) * (W - padL - padR);
  const toY = (e: number) => H - padB - ((e - minE) / span) * (H - padT - padB);

  const points: Array<[number, number]> = profile.map((p) => [toX(p.dist), toY(p.elev)]);
  const linePath = buildSmoothPath(points);
  const last = points[points.length - 1];
  const first = points[0];
  const areaPath = `${linePath} L${last[0]},${H - padB} L${first[0]},${H - padB} Z`;

  let peakIdx = 0;
  profile.forEach((p, i) => {
    if (p.slope > profile[peakIdx].slope) peakIdx = i;
  });
  const peak = profile[peakIdx];
  const peakColor = peak.slope >= 28 ? '#ef4444' : peak.slope >= 18 ? '#f59e0b' : '#4ade80';
  const peakPt = points[peakIdx];
  const peakLabelX = Math.min(W - padR - 10, Math.max(padL + 10, peakPt[0]));
  const peakLabelY = Math.max(padT - 2, peakPt[1] - 8);

  const gridLevels = [maxE, (minE + maxE) / 2, minE];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '110px', display: 'block' }}>
      <defs>
        <linearGradient id="elevFillGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {gridLevels.map((lvl, i) => (
        <g key={i}>
          <line
            x1={padL}
            x2={W - padR}
            y1={toY(lvl)}
            y2={toY(lvl)}
            stroke="rgba(255,255,255,0.09)"
            strokeDasharray="2,3"
          />
          <text x={0} y={toY(lvl) + 3} fontSize="7.5" fill="#6b7280">
            {lvl.toFixed(0)}m
          </text>
        </g>
      ))}

      <path d={areaPath} fill="url(#elevFillGradient)" stroke="none" />
      <path d={linePath} fill="none" stroke="#38bdf8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />

      <circle cx={first[0]} cy={first[1]} r="2.6" fill="#38bdf8" stroke="#0b1220" strokeWidth="1" />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill="#4ade80" stroke="#0b1220" strokeWidth="1" />

      {peak.slope >= 15 && (
        <>
          <circle cx={peakPt[0]} cy={peakPt[1]} r="3.4" fill={peakColor} stroke="#0b1220" strokeWidth="1" />
          <text x={peakLabelX} y={peakLabelY} fontSize="8" fontWeight="bold" fill={peakColor} textAnchor="middle">
            {peak.slope.toFixed(0)}°
          </text>
        </>
      )}

      <text x={padL} y={H - 4} fontSize="7.5" fill="#6b7280">
        0m
      </text>
      <text x={W - padR} y={H - 4} fontSize="7.5" fill="#6b7280" textAnchor="end">
        {maxDist.toFixed(0)}m
      </text>
    </svg>
  );
};

const EcgLine: React.FC<{ color?: string }> = ({ color = '#f87171' }) => (
  <div style={{ width: '100%', height: '20px', overflow: 'hidden' }}>
    <style>{`
      @keyframes ecgScroll {
        from { transform: translateX(0); }
        to { transform: translateX(-50%); }
      }
    `}</style>
    <div style={{ display: 'flex', width: '200%', animation: 'ecgScroll 1.4s linear infinite' }}>
      <svg viewBox="0 0 200 24" preserveAspectRatio="none" style={{ width: '50%', height: '20px', display: 'block', flexShrink: 0 }}>
        <polyline points={ECG_POINTS} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <svg viewBox="0 0 200 24" preserveAspectRatio="none" style={{ width: '50%', height: '20px', display: 'block', flexShrink: 0 }}>
        <polyline points={ECG_POINTS} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  </div>
);

const BatteryIcon: React.FC<{ level: number }> = ({ level }) => {
  const color = pctColor(level);
  const pct = Math.max(0, Math.min(100, level));
  return (
    <svg viewBox="0 0 24 14" width="18" height="11">
      <rect x="1" y="1" width="19" height="12" rx="2" fill="none" stroke="#9ca3af" strokeWidth="1.4" />
      <rect x="21.5" y="4.5" width="2" height="5" rx="1" fill="#9ca3af" />
      <rect x="3" y="3" width={Math.max(1, (pct / 100) * 15)} height="8" rx="1" fill={color} />
    </svg>
  );
};

// lucide-react no trae un ícono de astronauta, así que dibujamos uno simple a mano
// (casco + visor + torso) para el botón que abre la telemetría del traje.
const AstronautIcon: React.FC<{ size?: number; color: string }> = ({ size = 18, color }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8.3" r="4.8" />
    <ellipse cx="12" cy="8.6" rx="2.7" ry="2.2" fill={color} fillOpacity="0.28" stroke={color} strokeWidth="1.1" />
    <path d="M6.4 14.2c0-1 .9-1.7 2-2a9 9 0 0 1 7.2 0c1.1.3 2 1 2 2V19.5H6.4v-5.3Z" />
    <line x1="6.4" y1="15.8" x2="4.6" y2="16.5" />
    <line x1="17.6" y1="15.8" x2="19.4" y2="16.5" />
  </svg>
);

// Ícono decorativo según el tipo de riesgo detectado, a partir de palabras clave del texto.
function pickRiskIcon(text: string): LucideIcon {
  const t = text.toUpperCase();
  if (t.includes('RADIACI')) return Radiation;
  if (t.includes('O2') || t.includes('OXÍGENO') || t.includes('OXIGENO')) return Wind;
  if (t.includes('BATER')) return BatteryWarning;
  if (t.includes('PENDIENTE') || t.includes('CRÁTER') || t.includes('CRATER')) return Mountain;
  if (t.includes('RUTA') || t.includes('BLOQUEA') || t.includes('INSEGURA') || t.includes('OBSTÁCULO') || t.includes('OBSTACULO')) {
    return TriangleAlert;
  }
  return AlertTriangle;
}

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
  evaYaw = 0,
  eva = null,
  risk,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const loadedImgRef = useRef<HTMLImageElement | null>(null);

  const [mapLayerMode, setMapLayerMode] = useState<MapLayerMode>('fusion_mars_d415');
  const [imageSrc, setImageSrc] = useState<string>('/mars-terrain.jpg');

  const [baseVisionData, setBaseVisionData] = useState<ImageVisionAnalysis | null>(null);
  const [localMapState, setLocalMapState] = useState<RealMapStatePayload | null>(null);

  // Las curvas de nivel calculadas ahora las controla el ojo: se activan solo en la vista
  // topográfica (que ya trae sus propias líneas impresas) y quedan apagadas en la vista normal.
  const showContours = mapLayerMode === 'topo_lines';
  const [showDetectedZones] = useState<boolean>(true);
  const showD415GridOverlay = false;
  const showServerPaths = false;
  const [routeOrigin] = useState<RouteOrigin>('eva');
  const [targetPoint, setTargetPoint] = useState<[number, number]>([7.8, 3.2]);

  const [showTelemetry, setShowTelemetry] = useState<boolean>(false);

  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    z: number;
    slope: number;
    d415Cell?: { label: string; color: string };
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
    const profile: ElevPoint[] = [];
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
        slope: sampleMatrixAt(x, y, visionData.slopeGrid),
      });
    }
    return profile;
  }, [visionData, safeRoute]);

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

    let d415Cell: { label: string; color: string } | undefined;
    if (activeMapState?.occupancy_grid) {
      const y_m = (xm - 1.5) / 1.45;
      const x_m = (ym - 5.4) / 1.45;
      const r = Math.round(y_m / 0.05);
      const c = Math.round((x_m + 2.0) / 0.05);
      if (r >= 0 && r < activeMapState.grid_rows && c >= 0 && c < activeMapState.grid_cols) {
        const val = activeMapState.occupancy_grid[r]?.[c];
        if (val === 2) d415Cell = { label: 'BOULDER (Roca D415)', color: '#fb923c' };
        else if (val === 3) d415Cell = { label: 'CREVICE (Grieta D415)', color: '#38bdf8' };
        else if (val === 1) d415Cell = { label: 'INFLATED (Margen D415)', color: '#a8745c' };
        else if (val === 0) d415Cell = { label: 'FREE (Explorado D415)', color: '#4ade80' };
      }
    }

    setHoverInfo({ x: xm, y: ym, z: zm, slope, d415Cell });
  };

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
    setMapLayerMode(mapLayerMode === 'topo_lines' ? 'fusion_mars_d415' : 'topo_lines');
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

      <div style={{ padding: '16px' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '12px',
          }}
        >
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
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
              <Upload size={13} /> Subir Imagen...
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
              <span style={{ color: '#4ade80', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <CheckCircle2 size={14} /> RUTA SEGURA
              </span>
              <span>
                Distancia: <strong>{safeRoute.distanceMeters} m</strong>
              </span>
              <span>
                Pendiente Máx: <strong>{safeRoute.maxSlopeDeg}°</strong>
              </span>
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
                      • Celda del grid:{' '}
                      <span
                        style={{
                          display: 'inline-block',
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: hoverInfo.d415Cell.color,
                          marginRight: '4px',
                        }}
                      />
                      <strong>{hoverInfo.d415Cell.label}</strong>
                    </span>
                  )}
                </span>
              ) : (
                <span>
                  Haz clic en cualquier punto del mapa para calcular la ruta segura evitando los
                  obstáculos BOULDER y CREVICE del servidor
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
                boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                zIndex: 5,
                padding: 0,
              }}
            >
              <AstronautIcon size={18} color={showTelemetry ? '#ffffff' : '#0c4a6e'} />
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
                boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                zIndex: 5,
                padding: 0,
              }}
            >
              <Eye size={18} color="#0c4a6e" />
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div style={{ lineHeight: 1.3 }}>
                    <div style={{ fontWeight: 'bold', color: '#f3f4f6' }}>Telemetría del traje</div>
                    <div style={{ fontWeight: 'bold', color: '#f3f4f6' }}>EVA-01</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingTop: '2px' }}>
                    <BatteryIcon level={eva?.battery ?? 0} />
                  </div>
                </div>
                {eva ? (
                  <>
                    <TelemetryBar label="O2 en depósito" value={eva.suit_o2} unit="%" />
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span>Pulso cardiaco</span>
                        <strong style={{ color: '#f87171' }}>{eva.heart_rate} BPM</strong>
                      </div>
                      <EcgLine />
                    </div>
                    <TelemetryBar label="Batería" value={eva.battery} unit="%" />
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
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <AlertTriangle size={14} /> Obstáculos &amp; Pendientes
              </div>
              <style>{`
                @keyframes statusDotPulse {
                  0% { transform: scale(1); opacity: 0.6; }
                  100% { transform: scale(2.2); opacity: 0; }
                }
              `}</style>
              <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                {riskCards.map((c, i) => {
                  const RiskIcon = pickRiskIcon(c.text);
                  return (
                    <div
                      key={i}
                      style={{
                        background: c.level === 'red' ? '#7f1d1d' : c.level === 'yellow' ? '#78350f' : '#14532d',
                        border: `1px solid ${SEVERITY_COLOR[c.level]}`,
                        borderRadius: '6px',
                        padding: '8px 10px',
                        fontSize: '11px',
                      }}
                    >
                      <div style={{ fontWeight: 'bold', marginBottom: '3px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '7px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                          <StatusDot level={c.level} />
                          {c.title}
                        </span>
                        <RiskIcon size={14} color={SEVERITY_COLOR[c.level]} />
                      </div>
                      <div style={{ color: '#e5e7eb' }}>{c.text}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: '8px', padding: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '12px', marginBottom: '6px' }}>
                <strong style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <TrendingUp size={14} /> Elevación
                </strong>
                <span style={{ color: '#9ca3af', fontSize: '11px' }}>
                  Distancia: <strong style={{ color: '#e5e7eb' }}>{safeRoute.distanceMeters}m</strong> • Pendiente máx:{' '}
                  <strong style={{ color: '#fb923c' }}>{safeRoute.maxSlopeDeg}°</strong>
                </span>
              </div>
              {elevationProfile.length >= 2 ? (
                <ElevationChart profile={elevationProfile} />
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
        </div>
      </div>
    </div>
  );
};
