import React from 'react';
import { fetchMapStateFromServer } from '@martian/shared';
import { CONNECTION_MODES, OperationMode } from '../config/connectionConfig';

interface MissionHeaderProps {
  mode: OperationMode;
  isConnected: boolean;
  customUrls: Record<OperationMode, string>;
  utcTime?: string;
  onSwitchMode: (newMode: OperationMode) => void;
  onChangeUrl: (newUrl: string) => void;
  onApplyUrl: () => void;
}

export const MissionHeader: React.FC<MissionHeaderProps> = ({
  mode,
  isConnected,
  customUrls,
  utcTime,
  onSwitchMode,
  onChangeUrl,
  onApplyUrl,
}) => {
  const activeModeConfig = CONNECTION_MODES[mode];

  return (
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

      {utcTime && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '10px', color: '#93c5fd' }}>UTC</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#ffffff', fontFamily: 'monospace' }}>
            {utcTime}
          </div>
        </div>
      )}

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
          MODO DE RECEPCIÓN DE DATOS / IP SERVIDOR EXTERNO:
        </div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <button
            onClick={() => onSwitchMode('local_esp')}
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
            onClick={() => onSwitchMode('online_raspi')}
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
            placeholder="Ej: 192.168.1.100:8765 o ws://..."
            value={customUrls[mode]}
            onChange={(e) => onChangeUrl(e.target.value)}
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
            onClick={onApplyUrl}
            style={{
              background: '#ea580c',
              color: '#f9fafb',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 10px',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: '12px',
              fontWeight: 'bold',
            }}
          >
            Conectar IP
          </button>
          <button
            onClick={() => fetchMapStateFromServer(customUrls[mode])}
            title="Descargar occupancy_grid (120x80) y payload desde el servidor HTTP/WS de esa IP"
            style={{
              background: '#1e3a8a',
              color: '#bfdbfe',
              border: '1px solid #3b82f6',
              borderRadius: '4px',
              padding: '4px 8px',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: '11px',
            }}
          >
            🔄 Sync Mapa
          </button>
        </div>
      </div>
    </header>
  );
};

