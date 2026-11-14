import React, { useEffect, useState } from 'react';
import {
  connectBackbone,
  evaluateRisk,
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
import { MissionHeader } from './components/MissionHeader';
import { DroneVerticalControlPanel } from './components/DroneVerticalControlPanel';
import { RealSenseD415Panel } from './components/RealSenseD415Panel';
import { TelemetryNodesGrid } from './components/TelemetryNodesGrid';

export default function App() {
  const { isConnected, getEva, getDrone, getStation, getSatellite, ingestEnvelope } = useBackbone();

  const [mode, setMode] = useState<OperationMode>('local_esp');
  const [customUrls, setCustomUrls] = useState<Record<OperationMode, string>>({
    local_esp: CONNECTION_MODES.local_esp.defaultWsUrl,
    online_raspi: CONNECTION_MODES.online_raspi.defaultWsUrl,
  });
  const [contourStep, setContourStep] = useState<number>(1.5);
  const [utcTime, setUtcTime] = useState<string>('');

  const [useManualBerniOverride, setUseManualBerniOverride] = useState<boolean>(false);
  const [manualBerniData, setManualBerniData] = useState<BerniTopographyInput>({
    drone_pos: [FIXED_DRONE_PAD_POS[0], FIXED_DRONE_PAD_POS[1], 2.2],
    safe_path: true,
    max_slope_deg: 12.5,
    obstacles: [
      { x: 1.7, y: 2.0, radius: 0.3, severity: 'medium' },
      { x: 2.3, y: 1.4, radius: 0.35, severity: 'high' },
    ],
    elevation_points: [{ x: 5.5, y: 4.8, z: 4.0 }],
  });

  useEffect(() => {
    connectBackbone(customUrls[mode]);

    fetch('/data/latest_expo_payload.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (payload && !getDrone()) {
          ingestEnvelope(payload);
        }
      })
      .catch(() => {});
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

  return (
    <div
      style={{
        padding: '20px',
        fontFamily: 'monospace',
        color: '#f3f4f6',
        maxWidth: '1440px',
        margin: '0 auto',
      }}
    >
      <MissionHeader
        mode={mode}
        isConnected={isConnected}
        customUrls={customUrls}
        utcTime={utcTime}
        onSwitchMode={handleSwitchMode}
        onChangeUrl={(newUrl) => setCustomUrls({ ...customUrls, [mode]: newUrl })}
        onApplyUrl={handleApplyUrl}
      />

      {/* El riesgo (EVALUACIÓN DE RIESGO) ahora se muestra dentro del panel "Obstáculos & Pendientes"
          del propio mapa, para no duplicar la misma información en dos lugares de la pantalla. */}

      {/* El mapa ya incluye su propio panel interno de Obstáculos & Pendientes + Elevación,
          así que ocupa todo el ancho y el control del dron va en su propia fila debajo. */}
      <div style={{ marginBottom: '16px' }}>
        <TopographicMap2D
          dataset={terrainDataset}
          droneData={activeDroneSource as any}
          serverUrl={customUrls[mode]}
          mode={mode}
          isConnected={isConnected}
          evaYaw={eva?.data?.imu?.yaw ?? 0}
          eva={eva?.data ?? null}
          risk={risk}
          utcTime={utcTime}
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <DroneVerticalControlPanel
          terrainDataset={terrainDataset}
          contourStep={contourStep}
          onChangeContourStep={setContourStep}
          useManualBerniOverride={useManualBerniOverride}
          onToggleManualOverride={setUseManualBerniOverride}
          manualBerniData={manualBerniData}
          onChangeManualBerniData={setManualBerniData}
          activeDroneSource={activeDroneSource}
        />
      </div>

      <RealSenseD415Panel drone={drone} />

      <TelemetryNodesGrid
        eva={eva}
        drone={drone}
        station={station}
        satellite={satellite}
        terrainDataset={terrainDataset}
      />
    </div>
  );
}
