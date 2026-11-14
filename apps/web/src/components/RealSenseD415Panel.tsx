import React, { useState } from 'react';
import { DroneData, NodeRecord } from '@martian/shared';

interface RealSenseD415PanelProps {
  drone?: NodeRecord<DroneData>;
}

export const RealSenseD415Panel: React.FC<RealSenseD415PanelProps> = ({ drone }) => {
  const [selectedHudSnapshot, setSelectedHudSnapshot] = useState<'live' | 'hud1' | 'hud2'>('live');
  const droneData = drone?.data;

  return (
    <div
      style={{
        background: '#111827',
        border: '1px solid #374151',
        borderRadius: '10px',
        padding: '16px',
        marginBottom: '20px',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '14px',
          borderBottom: '1px solid #1f2937',
          paddingBottom: '10px',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '17px', color: '#f97316' }}>
            Intel RealSense D415 Tactical Feed & Persistent Global Map (Dataset `data/`)
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#9ca3af' }}>
            Pipeline en tiempo real: Filters → RANSAC → DBSCAN → Visual Odometry → A* & Dijkstra
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setSelectedHudSnapshot('live')}
            style={{
              background: selectedHudSnapshot === 'live' ? '#ea580c' : '#1f2937',
              color: '#fff',
              border: '1px solid #f97316',
              borderRadius: '6px',
              padding: '6px 10px',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: '12px',
              fontWeight: 'bold',
            }}
          >
            3 Cámaras D415 (Base64 Stream)
          </button>
          <button
            onClick={() => setSelectedHudSnapshot('hud2')}
            style={{
              background: selectedHudSnapshot === 'hud2' ? '#0284c7' : '#1f2937',
              color: '#fff',
              border: '1px solid #38bdf8',
              borderRadius: '6px',
              padding: '6px 10px',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: '12px',
            }}
          >
            Snapshot HUD Global (A* vs Dijkstra)
          </button>
          <button
            onClick={() => setSelectedHudSnapshot('hud1')}
            style={{
              background: selectedHudSnapshot === 'hud1' ? '#0284c7' : '#1f2937',
              color: '#fff',
              border: '1px solid #38bdf8',
              borderRadius: '6px',
              padding: '6px 10px',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: '12px',
            }}
          >
            Snapshot HUD Local (v1)
          </button>
        </div>
      </div>

      {selectedHudSnapshot === 'live' ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '14px',
            marginBottom: '14px',
          }}
        >
          <div
            style={{
              background: '#030712',
              border: '1px solid #1f2937',
              borderRadius: '8px',
              padding: '10px',
            }}
          >
            <div
              style={{
                fontSize: '12px',
                fontWeight: 'bold',
                color: '#fb923c',
                marginBottom: '6px',
              }}
            >
              1. RGB TACTICAL FEED + 3D OBSTACLE & PATH OVERLAY
            </div>
            {droneData?.images?.rgb ? (
              <img
                src={droneData.images.rgb}
                alt="D415 RGB Tactical Feed"
                style={{
                  width: '100%',
                  borderRadius: '6px',
                  display: 'block',
                  border: '1px solid #374151',
                }}
              />
            ) : (
              <div
                style={{
                  height: '180px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#6b7280',
                }}
              >
                Sin imagen RGB en el paquete actual
              </div>
            )}
          </div>

          <div
            style={{
              background: '#030712',
              border: '1px solid #1f2937',
              borderRadius: '8px',
              padding: '10px',
            }}
          >
            <div
              style={{
                fontSize: '12px',
                fontWeight: 'bold',
                color: '#38bdf8',
                marginBottom: '6px',
              }}
            >
              2. PREPROCESSED DEPTH & MORPHOLOGICAL SEGMENTATION
            </div>
            {droneData?.images?.depth ? (
              <img
                src={droneData.images.depth}
                alt="D415 Depth Segmentation"
                style={{
                  width: '100%',
                  borderRadius: '6px',
                  display: 'block',
                  border: '1px solid #374151',
                }}
              />
            ) : (
              <div
                style={{
                  height: '180px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#6b7280',
                }}
              >
                Sin mapa de profundidad en el paquete actual
              </div>
            )}
          </div>

          <div
            style={{
              background: '#030712',
              border: '1px solid #1f2937',
              borderRadius: '8px',
              padding: '10px',
            }}
          >
            <div
              style={{
                fontSize: '12px',
                fontWeight: 'bold',
                color: '#4ade80',
                marginBottom: '6px',
              }}
            >
              3. PERSISTENT GLOBAL MAP (A* & DIJKSTRA ROUTE MAP)
            </div>
            {droneData?.images?.route_map ? (
              <img
                src={droneData.images.route_map}
                alt="D415 Route Map"
                style={{
                  width: '100%',
                  borderRadius: '6px',
                  display: 'block',
                  border: '1px solid #374151',
                }}
              />
            ) : (
              <div
                style={{
                  height: '180px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#6b7280',
                }}
              >
                Sin route_map en el paquete actual
              </div>
            )}
          </div>
        </div>
      ) : (
        <div
          style={{
            marginBottom: '14px',
            background: '#030712',
            padding: '10px',
            borderRadius: '8px',
            border: '1px solid #1f2937',
          }}
        >
          <img
            src={
              selectedHudSnapshot === 'hud2'
                ? '/data/hud_1794682184211.png'
                : '/data/hud_1794676723547.png'
            }
            alt="RealSense D415 HUD Snapshot"
            style={{ width: '100%', borderRadius: '6px', display: 'block' }}
          />
        </div>
      )}

      {droneData && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '14px',
          }}
        >
          <div
            style={{
              background: '#030712',
              border: '1px solid #1f2937',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '13px',
              lineHeight: 1.7,
            }}
          >
            <div style={{ fontWeight: 'bold', color: '#facc15', marginBottom: '6px' }}>
              ROVER / DRONE D415 NAVIGATION METRICS
            </div>
            <div>
              Corredor Seguro (`safe_corridor`):{' '}
              <strong style={{ color: droneData.safe_path ? '#22c55e' : '#ef4444' }}>
                {droneData.safe_path ? 'TRUE (DESPEJADO)' : 'FALSE (EVASIÓN ACTIVA)'}
              </strong>
            </div>
            <div>
              Edge Processing FPS: <strong>{droneData.edge_fps ?? '--'} FPS</strong> • Altitud
              Cámara: <strong>{droneData.altitude_m ?? droneData.drone_pos[2]} m</strong>
            </div>
            <div>
              Inclinación Máx (`max_incline_deg`): <strong>{droneData.max_slope_deg}°</strong> • IMU
              Pitch/Roll:{' '}
              <strong>
                {droneData.imu?.pitch ?? 0}° / {droneData.imu?.roll ?? 0}°
              </strong>
            </div>
            {droneData.navigation && (
              <>
                <div>
                  Modo Nav:{' '}
                  <strong style={{ color: '#38bdf8' }}>{droneData.navigation.mode}</strong> • Rumbo
                  Recomendado:{' '}
                  <strong style={{ color: '#4ade80' }}>
                    {droneData.navigation.recommended_heading_deg > 0
                      ? `+${droneData.navigation.recommended_heading_deg}`
                      : droneData.navigation.recommended_heading_deg}
                    °
                  </strong>
                </div>
                <div>
                  Pose Global (X, Y):{' '}
                  <strong>
                    ({droneData.navigation.rover_pose?.x_m ?? 0} m,{' '}
                    {droneData.navigation.rover_pose?.y_m ?? 0} m)
                  </strong>{' '}
                  • Recorrido:{' '}
                  <strong>{droneData.navigation.rover_pose?.traversed_distance_m ?? 0} m</strong>
                </div>
                <div>
                  Área Explorada: <strong>{droneData.navigation.explored_area_m2} m²</strong> •
                  Grid: <strong>{droneData.navigation.grid_shape?.join('×')}</strong>
                </div>
                <div>
                  Nodos Explorados (A* vs Dijkstra):{' '}
                  <strong style={{ color: '#4ade80' }}>
                    {droneData.navigation.astar?.explored_nodes ?? '--'} (A*)
                  </strong>{' '}
                  vs{' '}
                  <strong style={{ color: '#38bdf8' }}>
                    {droneData.navigation.dijkstra?.explored_nodes ?? '--'} (Dijkstra)
                  </strong>{' '}
                  • Waypoints Ruta:{' '}
                  <strong>{droneData.navigation.route_waypoints_xy_m?.length ?? 0} pts</strong>
                </div>
              </>
            )}
          </div>

          <div
            style={{
              background: '#030712',
              border: '1px solid #1f2937',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '12px',
            }}
          >
            <div style={{ fontWeight: 'bold', color: '#f97316', marginBottom: '6px' }}>
              DETECTED OBSTACLES (`drone_cv` • Total: {droneData.obstacles?.length ?? 0})
            </div>
            <div
              style={{
                maxHeight: '155px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              {(droneData.obstacles ?? []).slice(0, 18).map((obs, idx) => {
                const isCrevice = obs.type === 'CREVICE';
                return (
                  <div
                    key={obs.id ?? idx}
                    style={{
                      color: isCrevice ? '#38bdf8' : '#fb923c',
                      fontFamily: 'monospace',
                      borderBottom: '1px solid #111827',
                      paddingBottom: '2px',
                    }}
                  >
                    #{obs.id ?? idx + 1} <strong>{obs.type ?? 'OBSTACLE'}</strong>{' '}
                    {obs.distance_m !== undefined
                      ? `d=${obs.distance_m}m`
                      : `x=${obs.x}m, y=${obs.y}m`}{' '}
                    {obs.bearing_deg !== undefined
                      ? `ang=${obs.bearing_deg > 0 ? `+${obs.bearing_deg}` : obs.bearing_deg}deg`
                      : ''}{' '}
                    {obs.height_m !== undefined ? `H=${obs.height_m}m` : ''}{' '}
                    {obs.depth_m !== undefined ? `D=${obs.depth_m}m` : ''}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

