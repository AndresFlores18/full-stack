import React, { useState } from 'react';
import {
  BerniTopographyInput,
  FIXED_DRONE_PAD_POS,
  MartianTerrainDataset,
} from '../config/connectionConfig';

interface DroneVerticalControlPanelProps {
  terrainDataset: MartianTerrainDataset;
  contourStep: number;
  onChangeContourStep: (step: number) => void;
  useManualBerniOverride: boolean;
  onToggleManualOverride: (val: boolean) => void;
  manualBerniData: BerniTopographyInput;
  onChangeManualBerniData: (data: BerniTopographyInput) => void;
  activeDroneSource: any;
}

export const DroneVerticalControlPanel: React.FC<DroneVerticalControlPanelProps> = ({
  terrainDataset,
  contourStep,
  onChangeContourStep,
  useManualBerniOverride,
  onToggleManualOverride,
  manualBerniData,
  onChangeManualBerniData,
  activeDroneSource,
}) => {
  const [showRawJson, setShowRawJson] = useState<boolean>(false);
  const customPeak = manualBerniData.elevation_points?.[0] ?? { x: 5.5, y: 4.8, z: 4.0 };

  return (
    <div
      style={{
        background: '#111827',
        border: '1px solid #374151',
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

        <div style={{ marginBottom: '12px' }}>
          <label
            style={{ display: 'block', fontSize: '12px', color: '#d1d5db', marginBottom: '4px' }}
          >
            Separación de curvas topográficas:
          </label>
          <select
            value={contourStep}
            onChange={(e) => onChangeContourStep(Number(e.target.value))}
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
          onClick={() => onToggleManualOverride(!useManualBerniOverride)}
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
                onToggleManualOverride(true);
                onChangeManualBerniData({
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
                  onToggleManualOverride(true);
                  onChangeManualBerniData({
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
                  onToggleManualOverride(true);
                  onChangeManualBerniData({
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
                onToggleManualOverride(true);
                onChangeManualBerniData({
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
                onToggleManualOverride(true);
                onChangeManualBerniData({
                  ...manualBerniData,
                  safe_path: e.target.checked,
                });
              }}
            />
            <span>Ruta despejada según Dron (`safe_path`)</span>
          </label>
        </div>
      </div>

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
  );
};

