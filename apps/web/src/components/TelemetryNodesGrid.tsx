import React from 'react';
import {
  DroneData,
  EvaData,
  isStale,
  NodeRecord,
  SatelliteData,
  StationData,
} from '@martian/shared';
import { MartianTerrainDataset } from '../config/connectionConfig';

interface TelemetryNodesGridProps {
  eva?: NodeRecord<EvaData>;
  drone?: NodeRecord<DroneData>;
  station?: NodeRecord<StationData>;
  satellite?: NodeRecord<SatelliteData>;
  terrainDataset: MartianTerrainDataset;
}

export const TelemetryNodesGrid: React.FC<TelemetryNodesGridProps> = ({
  eva,
  drone,
  station,
  satellite,
  terrainDataset,
}) => {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '16px',
      }}
    >
      {/* EVA Astronauta */}
      <div
        style={{
          background: '#111827',
          padding: '16px',
          borderRadius: '8px',
          border: '1px solid #374151',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, color: '#38bdf8' }}>👨‍🚀 EVA Traje (Alan)</h3>
          <span style={{ color: isStale(eva) ? '#ef4444' : '#22c55e', fontSize: '12px' }}>
            {isStale(eva) ? 'SIN SEÑAL' : '● ACTIVO'}
          </span>
        </div>
        {eva ? (
          <div style={{ marginTop: '12px', fontSize: '14px', lineHeight: 1.6 }}>
            <div>
              O2 Traje: <strong>{eva.data.suit_o2}%</strong>
            </div>
            <div>
              Pulso: <strong>{eva.data.heart_rate} bpm</strong>
            </div>
            <div>
              Radiación: <strong>{eva.data.radiation_msv} mSv/h</strong>
            </div>
            <div>
              Batería: <strong>{eva.data.battery}%</strong>
            </div>
            <div>
              IMU Yaw/Pitch/Roll:{' '}
              <strong>
                {eva.data.imu.yaw}° / {eva.data.imu.pitch}° / {eva.data.imu.roll}°
              </strong>
            </div>
          </div>
        ) : (
          <p style={{ color: '#6b7280' }}>Esperando telemetría de ESP32 #3...</p>
        )}
      </div>

      {/* Dron CV */}
      <div
        style={{
          background: '#111827',
          padding: '16px',
          borderRadius: '8px',
          border: '1px solid #374151',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, color: '#a855f7' }}>🚁 Dron CV (Bernardo)</h3>
          <span style={{ color: isStale(drone) ? '#ef4444' : '#22c55e', fontSize: '12px' }}>
            {isStale(drone) ? 'SIN SEÑAL' : '● ACTIVO'}
          </span>
        </div>
        {drone ? (
          <div style={{ marginTop: '12px', fontSize: '14px', lineHeight: 1.6 }}>
            <div>
              Altitud Escaneo Z: <strong>{drone.data.drone_pos[2]} m</strong> (
              {terrainDataset.droneFlightPhase})
            </div>
            <div>
              Ruta segura:{' '}
              <strong style={{ color: drone.data.safe_path ? '#22c55e' : '#ef4444' }}>
                {drone.data.safe_path ? 'SÍ (DESPEJADO)' : 'NO (BLOQUEO)'}
              </strong>
            </div>
            <div>
              Pendiente Máx: <strong>{drone.data.max_slope_deg}°</strong>
            </div>
            <div>
              Obstáculos detectados: <strong>{drone.data.obstacles.length}</strong>
            </div>
          </div>
        ) : (
          <p style={{ color: '#6b7280' }}>Esperando telemetría de RPi + D415...</p>
        )}
      </div>

      {/* Estación Base */}
      <div
        style={{
          background: '#111827',
          padding: '16px',
          borderRadius: '8px',
          border: '1px solid #374151',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, color: '#facc15' }}>🏠 Estación Base (ESP32 #2)</h3>
          <span style={{ color: isStale(station) ? '#ef4444' : '#22c55e', fontSize: '12px' }}>
            {isStale(station) ? 'SIN SEÑAL' : '● ACTIVO'}
          </span>
        </div>
        {station ? (
          <div style={{ marginTop: '12px', fontSize: '14px', lineHeight: 1.6 }}>
            <div>
              Hábitat O2: <strong>{station.data.habitat_o2}%</strong>
            </div>
            <div>
              Potencia Hábitat: <strong>{station.data.habitat_power}%</strong>
            </div>
            <div>
              Nodos Mesh Activos: <strong>{station.data.mesh_nodes_active}</strong>
            </div>
          </div>
        ) : (
          <p style={{ color: '#6b7280' }}>Esperando telemetría de ESP32 #2...</p>
        )}
      </div>

      {/* Satélite Orbital */}
      <div
        style={{
          background: '#111827',
          padding: '16px',
          borderRadius: '8px',
          border: '1px solid #374151',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, color: '#34d399' }}>🛰️ Satélite (ESP32 #1)</h3>
          <span style={{ color: isStale(satellite) ? '#ef4444' : '#22c55e', fontSize: '12px' }}>
            {isStale(satellite) ? 'SIN SEÑAL' : '● ACTIVO'}
          </span>
        </div>
        {satellite ? (
          <div style={{ marginTop: '12px', fontSize: '14px', lineHeight: 1.6 }}>
            <div>
              Órbita [x, y, z]: <strong>[{satellite.data.orbit_pos.join(', ')}]</strong>
            </div>
            <div>
              Señal: <strong>{satellite.data.signal_dbm} dBm</strong>
            </div>
            <div>
              Latencia: <strong>{satellite.data.latency_ms} ms</strong>
            </div>
          </div>
        ) : (
          <p style={{ color: '#6b7280' }}>Esperando telemetría de ESP32 #1...</p>
        )}
      </div>
    </div>
  );
};

