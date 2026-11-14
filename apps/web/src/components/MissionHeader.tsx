import React from 'react';
import { fetchMapStateFromServer } from '@martian/shared';
import { CONNECTION_MODES, OperationMode } from '../config/connectionConfig';

interface MissionHeaderProps {
  mode: OperationMode;
  isConnected: boolean;
  customUrls: Record<OperationMode, string>;
  onSwitchMode: (newMode: OperationMode) => void;
  onChangeUrl: (newUrl: string) => void;
  onApplyUrl: () => void;
}

export const MissionHeader: React.FC<MissionHeaderProps> = ({
  mode,
  isConnected,
  customUrls,
  onSwitchMode,
  onChangeUrl,
  onApplyUrl,
}) => {
  const activeModeConfig = CONNECTION_MODES[mode];

  return (
    <header
      style={{
        borderBottom: '1px solid #374151',
        paddingBottom: '14px',
        marginBottom: '16px',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
      }}
    >
      <div>
        <h1 style={{ margin: 0, color: '#f97316', fontSize: '22px' }}>
          🔴 NASA Space Apps: Martian Map - Mission Control
        </h1>
        <p style={{ margin: '6px 0 0 0', color: '#9ca3af', fontSize: '13px' }}>
          Dashboard Web (Andrés) • Enlace ({activeModeConfig.shortName}):{' '}
          <span style={{ color: isConnected ? '#22c55e' : '#ef4444', fontWeight: 'bold' }}>
            {isConnected ? 'EN VIVO (CONECTADO)' : 'SIN CONEXIÓN'}
          </span>
        </p>
      </div>

      <div
        style={{
          background: '#111827',
          border: '1px solid #374151',
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

