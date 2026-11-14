import React, { useEffect, useState } from 'react';
import {
  connectBackbone,
  evaluateRisk,
  setBackboneUrl,
  useBackbone,
} from '@martian/shared';
import { buildTopographicDataset, CONNECTION_MODES, OperationMode } from './config/connectionConfig';
import { TopographicMap2D } from './components/TopographicMap2D';
import { MissionHeader } from './components/MissionHeader';

export default function App() {
  const { isConnected, getEva, getDrone, ingestEnvelope } = useBackbone();

  const [mode, setMode] = useState<OperationMode>('local_esp');
  const [customUrls, setCustomUrls] = useState<Record<OperationMode, string>>({
    local_esp: CONNECTION_MODES.local_esp.defaultWsUrl,
    online_raspi: CONNECTION_MODES.online_raspi.defaultWsUrl,
  });
  const [utcTime, setUtcTime] = useState<string>('');

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

  const activeDroneSource = drone?.data;
  const terrainDataset = buildTopographicDataset(activeDroneSource);
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

      {/* El mapa incluye su propio panel interno de Obstáculos & Pendientes (reemplaza el banner de riesgo)
          y de Elevación, por eso ocupa todo el ancho. */}
      <div style={{ marginBottom: '16px' }}>
        <TopographicMap2D
          dataset={terrainDataset}
          droneData={activeDroneSource as any}
          mode={mode}
          evaYaw={eva?.data?.imu?.yaw ?? 0}
          eva={eva?.data ?? null}
          risk={risk}
        />
      </div>
    </div>
  );
}
