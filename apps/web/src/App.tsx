import React, { useEffect } from 'react';
import {
  connectBackbone,
  evaluateRisk,
  isStale,
  useBackbone,
} from '@martian/shared';

export default function App() {
  const { nodes, isConnected, getEva, getDrone, getStation, getSatellite } = useBackbone();

  useEffect(() => {
    connectBackbone();
  }, []);

  const eva = getEva();
  const drone = getDrone();
  const station = getStation();
  const satellite = getSatellite();

  useEffect(() => {
    if (Object.keys(nodes).length > 0) {
      console.log('📡 [Web Dashboard] Datos vivos del Backbone recibidos:', nodes);
    }
  }, [nodes]);

  const risk = evaluateRisk(eva?.data, drone?.data);

  return (
    <div style={{ padding: '24px', fontFamily: 'monospace' }}>
      <header style={{ borderBottom: '1px solid #374151', paddingBottom: '16px', marginBottom: '24px' }}>
        <h1 style={{ margin: 0, color: '#f97316' }}>🔴 NASA Space Apps: Martian Map - Mission Control</h1>
        <p style={{ margin: '8px 0 0 0', color: '#9ca3af' }}>
          Dashboard Web (Andrés) • Estado Enlace:{' '}
          <span style={{ color: isConnected ? '#22c55e' : '#ef4444', fontWeight: 'bold' }}>
            {isConnected ? 'EN VIVO (CONECTADO)' : 'SIN CONEXIÓN'}
          </span>
        </p>
      </header>

      {/* Alerta de Riesgo General */}
      <div
        style={{
          padding: '16px',
          borderRadius: '8px',
          marginBottom: '24px',
          backgroundColor:
            risk.level === 'red' ? '#7f1d1d' : risk.level === 'yellow' ? '#78350f' : '#14532d',
          border: `1px solid ${risk.level === 'red' ? '#ef4444' : risk.level === 'yellow' ? '#f59e0b' : '#22c55e'
            }`,
        }}
      >
        <h3 style={{ margin: '0 0 8px 0' }}>
          EVALUACIÓN DE RIESGO: {risk.level.toUpperCase()}
        </h3>
        {risk.reasons.length > 0 ? (
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            {risk.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        ) : (
          <p style={{ margin: 0 }}>Todos los subsistemas en rango nominal.</p>
        )}
      </div>

      {/* Grid de 4 Nodos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        {/* EVA Astronauta */}
        <div style={{ background: '#111827', padding: '16px', borderRadius: '8px', border: '1px solid #374151' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, color: '#38bdf8' }}> EVA Traje (Alan)</h3>
            <span style={{ color: isStale(eva) ? '#ef4444' : '#22c55e', fontSize: '12px' }}>
              {isStale(eva) ? ' SIN SEÑAL' : '● ACTIVO'}
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
        <div style={{ background: '#111827', padding: '16px', borderRadius: '8px', border: '1px solid #374151' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, color: '#a855f7' }}>🚁 Dron CV (Bernardo)</h3>
            <span style={{ color: isStale(drone) ? '#ef4444' : '#22c55e', fontSize: '12px' }}>
              {isStale(drone) ? 'SIN SEÑAL' : '● ACTIVO'}
            </span>
          </div>
          {drone ? (
            <div style={{ marginTop: '12px', fontSize: '14px', lineHeight: 1.6 }}>
              <div>Posición [x, y, z]: <strong>[{drone.data.drone_pos.join(', ')}]</strong></div>
              <div>Ruta segura: <strong style={{ color: drone.data.safe_path ? '#22c55e' : '#ef4444' }}>{drone.data.safe_path ? 'SÍ (DESPEJADO)' : 'NO (BLOQUEO)'}</strong></div>
              <div>Pendiente Máx: <strong>{drone.data.max_slope_deg}°</strong></div>
              <div>Obstáculos detectados: <strong>{drone.data.obstacles.length}</strong></div>
            </div>
          ) : (
            <p style={{ color: '#6b7280' }}>Esperando telemetría de RPi + D415...</p>
          )}
        </div>

        {/* Estación Base */}
        <div style={{ background: '#111827', padding: '16px', borderRadius: '8px', border: '1px solid #374151' }}>
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
        <div style={{ background: '#111827', padding: '16px', borderRadius: '8px', border: '1px solid #374151' }}>
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

