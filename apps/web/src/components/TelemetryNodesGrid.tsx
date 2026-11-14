import React from 'react';
import { Home, Satellite } from 'lucide-react';
import { isStale, NodeRecord, SatelliteData, StationData } from '@martian/shared';

interface TelemetryNodesGridProps {
  station?: NodeRecord<StationData>;
  satellite?: NodeRecord<SatelliteData>;
}

export const TelemetryNodesGrid: React.FC<TelemetryNodesGridProps> = ({
  station,
  satellite,
}) => {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 420px))',
        gap: '16px',
      }}
    >
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
          <h3 style={{ margin: 0, color: '#facc15', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Home size={18} /> Estación Base (ESP32 #2)
          </h3>
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
          <h3 style={{ margin: 0, color: '#34d399', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Satellite size={18} /> Satélite (ESP32 #1)
          </h3>
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

