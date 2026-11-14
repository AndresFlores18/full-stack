import React, { useEffect, useState } from 'react';
import {
  connectBackbone,
  evaluateRisk,
  isStale,
  setBackboneUrl,
  useBackbone,
} from '@martian/shared';
import {
  BerniTopographyInput,
  buildTopographicDataset,
  CONNECTION_MODES,
  FIXED_DRONE_PAD_POS,
  OperationMode,
} from './config/connectionConfig';
import { TopographicMap2D } from './components/TopographicMap2D';

export default function App() {
  const { isConnected, getEva, getDrone, getStation, getSatellite } = useBackbone();

  // 1. Estado del Modo de Operación: 'local_esp' (ESP32) vs 'online_raspi' (Raspberry Pi Centro de Mando)
  const [mode, setMode] = useState<OperationMode>('local_esp');
  const [customUrls, setCustomUrls] = useState<Record<OperationMode, string>>({
    local_esp: CONNECTION_MODES.local_esp.defaultWsUrl,
    online_raspi: CONNECTION_MODES.online_raspi.defaultWsUrl,
  });
  const [contourStep, setContourStep] = useState<number>(1.5);
  const [showRawJson, setShowRawJson] = useState<boolean>(false);
  const [utcTime, setUtcTime] = useState<string>('');

  // 2. Generador / Simulador manual del Dataset de Berni (Dron fijo en X/Y; solo sube en Z, escanea y baja)
  const [useManualBerniOverride, setUseManualBerniOverride] = useState<boolean>(false);
  const [manualBerniData, setManualBerniData] = useState<BerniTopographyInput>({
    drone_pos: [FIXED_DRONE_PAD_POS[0], FIXED_DRONE_PAD_POS[1], 2.2],
    safe_path: true,
    max_slope_deg: 12.5,
    obstacles: [
      { x: 1.7, y: 2.0, radius: 0.30, severity: 'medium' },
      { x: 2.3, y: 1.4, radius: 0.35, severity: 'high' },
    ],
    elevation_points: [{ x: 5.5, y: 4.8, z: 4.0 }],
  });

  useEffect(() => {
    connectBackbone(customUrls[mode]);
  }, []);

  useEffect(() => {
    const tick = () => setUtcTime(new Date().toISOString().substring(11, 19));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const handleSwitchMode = (newMode: OperationMode) => {
    setMode(newMode);
    setBackboneUrl(customUrls[newMode]);
  };

  const handleApplyUrl = () => {
    setBackboneUrl(customUrls[mode]);
  };

  const eva = getEva();
  const drone = getDrone();
  const station = getStation();
  const satellite = getSatellite();

  const activeDroneSource = useManualBerniOverride ? manualBerniData : drone?.data;
  const terrainDataset = buildTopographicDataset(activeDroneSource, contourStep);

  const risk = evaluateRisk(eva?.data, activeDroneSource as any);
  const activeModeConfig = CONNECTION_MODES[mode];

  const customPeak = manualBerniData.elevation_points?.[0] ?? { x: 5.5, y: 4.8, z: 4.0 };

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', color: '#f3f4f6', maxWidth: '1440px', margin: '0 auto' }}>
      {/* CABECERA PRINCIPAL ESTILO HUD DE MISIÓN + SELECTOR DE MODO (LOCAL ESP32 vs EN LÍNEA RASPBERRY PI) */}
      <header
        style={{
          background: 'linear-gradient(90deg, #1e3a8a, #0c4a6e)',
          border: '1px solid #1e3a8a',
          borderBottom: '2px solid #38bdf8',
          borderRadius: '10px',
          padding: '14px 18px',
          marginBottom: '16px',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ fontSize: '10px', color: '#bae6fd', letterSpacing: '0.5px' }}>
            MISIÓN: OPERACIONES SUPERFICIE ARES-IV
          </div>
          <h1 style={{ margin: '2px 0 0 0', color: '#ffffff', fontSize: '22px' }}>
            🔴 NASA Space Apps: Martian Map - Mission Control
          </h1>
          <p style={{ margin: '6px 0 0 0', color: '#bae6fd', fontSize: '13px' }}>
            Dashboard Web (Andrés) • Enlace ({activeModeConfig.shortName}):{' '}
            <span style={{ color: isConnected ? '#4ade80' : '#fca5a5', fontWeight: 'bold' }}>
              {isConnected ? 'EN VIVO (CONECTADO)' : 'SIN CONEXIÓN'}
            </span>
          </p>
        </div>

        {/* Reloj UTC en vivo */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '10px', color: '#93c5fd' }}>UTC</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#ffffff', fontFamily: 'monospace' }}>
            {utcTime}
          </div>
        </div>

        {/* Selector Modular de los 2 Modos: Local (ESP32) y En Línea (Raspberry Pi) */}
        <div
          style={{
            background: '#030712',
            border: '1px solid #1e3a8a',
            borderRadius: '8px',
            padding: '10px 12px',
            minWidth: '340px',
          }}
        >
          <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px' }}>
            MODO DE RECEPCIÓN DE DATOS:
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <button
              onClick={() => handleSwitchMode('local_esp')}
              style={{
                flex: 1,
                padding: '6px 10px',
                borderRadius: '6px',
                border: mode === 'local_esp' ? '2px solid #38bdf8' : '1px solid #374151',
                background: mode === 'local_esp' ? '#0c4a6e' : '#1f2937',
                color: '#f9fafb',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                fontSize: '12px',
              }}
            >
              📡 LOCAL (ESP32)
            </button>
            <button
              onClick={() => handleSwitchMode('online_raspi')}
              style={{
                flex: 1,
                padding: '6px 10px',
                borderRadius: '6px',
                border: mode === 'online_raspi' ? '2px solid #a855f7' : '1px solid #374151',
                background: mode === 'online_raspi' ? '#4c1d95' : '#1f2937',
                color: '#f9fafb',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                fontSize: '12px',
              }}
            >
              🍓 EN LÍNEA (RASPBERRY)
            </button>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              type="text"
              value={customUrls[mode]}
              onChange={(e) =>
                setCustomUrls({
                  ...customUrls,
                  [mode]: e.target.value,
                })
              }
              style={{
                flex: 1,
                background: '#030712',
                border: '1px solid #374151',
                borderRadius: '4px',
                color: '#e5e7eb',
                padding: '4px 8px',
                fontFamily: 'monospace',
                fontSize: '12px',
              }}
            />
            <button
              onClick={handleApplyUrl}
              style={{
                background: '#374151',
                color: '#f9fafb',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 10px',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '12px',
              }}
            >
              Conectar
            </button>
          </div>
        </div>
      </header>

      {/* MAPA TOPOGRÁFICO 2D: incluye su propio panel de Obstáculos & Pendientes (riesgo real) y Elevación */}
      <div style={{ marginBottom: '16px' }}>
        <TopographicMap2D
          dataset={terrainDataset}
          mode={mode}
          isConnected={isConnected}
          evaYaw={eva?.data?.imu?.yaw ?? 0}
          eva={eva?.data ?? null}
          risk={risk}
          utcTime={utcTime}
        />
      </div>

      {/* CONTROL VERTICAL DEL DRON BERNI (Subir, Escanear y Bajar) + Dataset */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: '16px',
          marginBottom: '20px',
        }}
      >
        <div
          style={{
            background: '#111827',
            border: '1px solid #1e3a8a',
            borderRadius: '10px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div>
            <h3 style={{ margin: '0 0 6px 0', color: '#a855f7', fontSize: '16px' }}>
              🚁 Escaneo Vertical Dron (Berni)
            </h3>
            <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#9ca3af' }}>
              El dron no se desplaza en X/Y: <strong>solo sube en Z, escanea el terreno y baja</strong>.
            </p>

            {/* Estado actual del vuelo vertical */}
            <div
              style={{
                background: '#030712',
                border: '1px solid #374151',
                borderRadius: '6px',
                padding: '8px 10px',
                marginBottom: '12px',
                fontSize: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>Fase Dron:</span>
              <strong style={{ color: '#c084fc' }}>{terrainDataset.droneFlightPhase}</strong>
            </div>

            {/* Selector de densidad de curvas */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#d1d5db', marginBottom: '4px' }}>
                Separación de curvas topográficas:
              </label>
              <select
                value={contourStep}
                onChange={(e) => setContourStep(Number(e.target.value))}
                style={{
                  width: '100%',
                  background: '#1f2937',
                  color: '#fff',
                  border: '1px solid #4b5563',
                  borderRadius: '6px',
                  padding: '6px 8px',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                }}
              >
                <option value={1}>Cada 1.0 m (Alta densidad)</option>
                <option value={1.5}>Cada 1.5 m (Estándar)</option>
                <option value={2}>Cada 2.0 m (Ligero)</option>
              </select>
            </div>

            <button
              onClick={() => setUseManualBerniOverride(!useManualBerniOverride)}
              style={{
                width: '100%',
                background: useManualBerniOverride ? '#a855f7' : '#1f2937',
                color: '#ffffff',
                border: '1px solid #a855f7',
                borderRadius: '6px',
                padding: '8px 12px',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '12px',
                fontWeight: 'bold',
                marginBottom: '12px',
              }}
            >
              {useManualBerniOverride
                ? '🧪 Modo Manual Activo (Sliders)'
                : '📡 Stream en Vivo (Click para controlar altura Z)'}
            </button>

            {/* Controles de Altitud Z (Subir / Escanear / Bajar) */}
            <div
              style={{
                background: '#1f2937',
                padding: '12px',
                borderRadius: '8px',
                opacity: useManualBerniOverride ? 1 : 0.75,
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                fontSize: '12px',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>⬆️ Altitud Dron (Z - Subir/Bajar):</span>
                  <strong style={{ color: '#c084fc' }}>{terrainDataset.dronePos[2]} m</strong>
                </div>
                <input
                  type="range"
                  min={0.0}
                  max={3.0}
                  step={0.1}
                  value={manualBerniData.drone_pos[2]}
                  onChange={(e) => {
                    setUseManualBerniOverride(true);
                    setManualBerniData({
                      ...manualBerniData,
                      drone_pos: [
                        FIXED_DRONE_PAD_POS[0],
                        FIXED_DRONE_PAD_POS[1],
                        Number(e.target.value),
                      ],
                    });
                  }}
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  <button
                    onClick={() => {
                      setUseManualBerniOverride(true);
                      setManualBerniData({
                        ...manualBerniData,
                        drone_pos: [FIXED_DRONE_PAD_POS[0], FIXED_DRONE_PAD_POS[1], 0.1],
                      });
                    }}
                    style={{
                      flex: 1,
                      background: '#374151',
                      color: '#e5e7eb',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '5px',
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      fontSize: '11px',
                    }}
                  >
                    ⬇️ Bajar (0.1m)
                  </button>
                  <button
                    onClick={() => {
                      setUseManualBerniOverride(true);
                      setManualBerniData({
                        ...manualBerniData,
                        drone_pos: [FIXED_DRONE_PAD_POS[0], FIXED_DRONE_PAD_POS[1], 2.6],
                      });
                    }}
                    style={{
                      flex: 1,
                      background: '#6b21a8',
                      color: '#f3e8ff',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '5px',
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      fontWeight: 'bold',
                    }}
                  >
                    ⬆️ Subir y Escanear (2.6m)
                  </button>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Relieve detectado D415:</span>
                  <strong style={{ color: '#fb923c' }}>{customPeak.z} m</strong>
                </div>
                <input
                  type="range"
                  min={-10}
                  max={15}
                  step={0.5}
                  value={customPeak.z}
                  onChange={(e) => {
                    setUseManualBerniOverride(true);
                    setManualBerniData({
                      ...manualBerniData,
                      elevation_points: [{ ...customPeak, z: Number(e.target.value) }],
                    });
                  }}
                  style={{ width: '100%' }}
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={manualBerniData.safe_path}
                  onChange={(e) => {
                    setUseManualBerniOverride(true);
                    setManualBerniData({
                      ...manualBerniData,
                      safe_path: e.target.checked,
                    });
                  }}
                />
                <span>Ruta despejada según Dron (`safe_path`)</span>
              </label>
            </div>
          </div>

          {/* Botón para mostrar/ocultar el JSON del contrato con Berni */}
          <div>
            <button
              onClick={() => setShowRawJson(!showRawJson)}
              style={{
                width: '100%',
                background: '#030712',
                color: '#9ca3af',
                border: '1px solid #374151',
                borderRadius: '6px',
                padding: '6px 10px',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '11px',
              }}
            >
              {showRawJson ? '▲ Ocultar JSON del Dataset' : '▼ Ver JSON de Berni / Dataset'}
            </button>

            {showRawJson && (
              <pre
                style={{
                  marginTop: '8px',
                  marginBottom: 0,
                  background: '#030712',
                  border: '1px solid #1f2937',
                  borderRadius: '6px',
                  padding: '8px',
                  fontSize: '10px',
                  maxHeight: '140px',
                  overflowY: 'auto',
                  color: '#d1d5db',
                }}
              >
                {JSON.stringify(activeDroneSource, null, 2)}
              </pre>
            )}
          </div>
        </div>
      </div>

      {/* GRID DE LOS 4 NODOS DE TELEMETRÍA */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        {/* EVA Astronauta */}
        <div style={{ background: '#111827', padding: '16px', borderRadius: '8px', border: '1px solid #1e3a8a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, color: '#38bdf8' }}>👨‍🚀 EVA Traje (Alan)</h3>
            <span style={{ color: isStale(eva) ? '#ef4444' : '#22c55e', fontSize: '12px' }}>
              {isStale(eva) ? 'SIN SEÑAL' : '● ACTIVO'}
            </span>
          </div>
          {eva ? (
            <div style={{ marginTop: '12px', fontSize: '14px', lineHeight: 1.6 }}>
              <div>O2 Traje: <strong>{eva.data.suit_o2}%</strong></div>
              <div>Pulso: <strong>{eva.data.heart_rate} bpm</strong></div>
              <div>Radiación: <strong>{eva.data.radiation_msv} mSv/h</strong></div>
              <div>Batería: <strong>{eva.data.battery}%</strong></div>
              <div>IMU Yaw/Pitch/Roll: <strong>{eva.data.imu.yaw}° / {eva.data.imu.pitch}° / {eva.data.imu.roll}°</strong></div>
            </div>
          ) : (
            <p style={{ color: '#6b7280' }}>Esperando telemetría de ESP32 #3...</p>
          )}
        </div>

        {/* Dron CV */}
        <div style={{ background: '#111827', padding: '16px', borderRadius: '8px', border: '1px solid #1e3a8a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, color: '#a855f7' }}>🚁 Dron CV (Bernardo)</h3>
            <span style={{ color: isStale(drone) ? '#ef4444' : '#22c55e', fontSize: '12px' }}>
              {isStale(drone) ? 'SIN SEÑAL' : '● ACTIVO'}
            </span>
          </div>
          {drone ? (
            <div style={{ marginTop: '12px', fontSize: '14px', lineHeight: 1.6 }}>
              <div>Altitud Escaneo Z: <strong>{drone.data.drone_pos[2]} m</strong> ({terrainDataset.droneFlightPhase})</div>
              <div>Ruta segura: <strong style={{ color: drone.data.safe_path ? '#22c55e' : '#ef4444' }}>{drone.data.safe_path ? 'SÍ (DESPEJADO)' : 'NO (BLOQUEO)'}</strong></div>
              <div>Pendiente Máx: <strong>{drone.data.max_slope_deg}°</strong></div>
              <div>Obstáculos detectados: <strong>{drone.data.obstacles.length}</strong></div>
            </div>
          ) : (
            <p style={{ color: '#6b7280' }}>Esperando telemetría de RPi + D415...</p>
          )}
        </div>

        {/* Estación Base */}
        <div style={{ background: '#111827', padding: '16px', borderRadius: '8px', border: '1px solid #1e3a8a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, color: '#facc15' }}>🏠 Estación Base (ESP32 #2)</h3>
            <span style={{ color: isStale(station) ? '#ef4444' : '#22c55e', fontSize: '12px' }}>
              {isStale(station) ? 'SIN SEÑAL' : '● ACTIVO'}
            </span>
          </div>
          {station ? (
            <div style={{ marginTop: '12px', fontSize: '14px', lineHeight: 1.6 }}>
              <div>Hábitat O2: <strong>{station.data.habitat_o2}%</strong></div>
              <div>Potencia Hábitat: <strong>{station.data.habitat_power}%</strong></div>
              <div>Nodos Mesh Activos: <strong>{station.data.mesh_nodes_active}</strong></div>
            </div>
          ) : (
            <p style={{ color: '#6b7280' }}>Esperando telemetría de ESP32 #2...</p>
          )}
        </div>

        {/* Satélite Orbital */}
        <div style={{ background: '#111827', padding: '16px', borderRadius: '8px', border: '1px solid #1e3a8a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, color: '#34d399' }}>🛰️ Satélite (ESP32 #1)</h3>
            <span style={{ color: isStale(satellite) ? '#ef4444' : '#22c55e', fontSize: '12px' }}>
              {isStale(satellite) ? 'SIN SEÑAL' : '● ACTIVO'}
            </span>
          </div>
          {satellite ? (
            <div style={{ marginTop: '12px', fontSize: '14px', lineHeight: 1.6 }}>
              <div>Órbita [x, y, z]: <strong>[{satellite.data.orbit_pos.join(', ')}]</strong></div>
              <div>Señal: <strong>{satellite.data.signal_dbm} dBm</strong></div>
              <div>Latencia: <strong>{satellite.data.latency_ms} ms</strong></div>
            </div>
          ) : (
            <p style={{ color: '#6b7280' }}>Esperando telemetría de ESP32 #1...</p>
          )}
        </div>
      </div>
    </div>
  );
}
