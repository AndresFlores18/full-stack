import React from 'react';
import { Text, View } from 'react-native';
import { DroneData, EvaData } from '@martian/shared';
import { tacticalStyles as styles } from '../styles/tacticalStyles';

interface SuitImuAndDronePanelProps {
  evaData?: EvaData;
  droneData?: DroneData;
}

export const SuitImuAndDronePanel: React.FC<SuitImuAndDronePanelProps> = ({
  evaData,
  droneData,
}) => {
  return (
    <View style={styles.secondarySection}>
      <View style={styles.panelBox}>
        <Text style={styles.panelTitle}>🧭 ORIENTACIÓN TRAJE (IMU)</Text>
        <View style={styles.imuRow}>
          <View style={styles.imuCol}>
            <Text style={styles.imuLabel}>YAW</Text>
            <Text style={styles.imuVal}>
              {evaData?.imu?.yaw ? `${evaData.imu.yaw}°` : '0.0°'}
            </Text>
          </View>
          <View style={styles.imuCol}>
            <Text style={styles.imuLabel}>PITCH</Text>
            <Text style={styles.imuVal}>
              {evaData?.imu?.pitch ? `${evaData.imu.pitch}°` : '0.0°'}
            </Text>
          </View>
          <View style={styles.imuCol}>
            <Text style={styles.imuLabel}>ROLL</Text>
            <Text style={styles.imuVal}>
              {evaData?.imu?.roll ? `${evaData.imu.roll}°` : '0.0°'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.panelBox}>
        <Text style={styles.panelTitle}>🚁 TERRENO / DRON CV (D415)</Text>
        <View style={{ marginTop: 8 }}>
          <Text style={{ color: '#d1d5db', fontSize: 16 }}>
            Corredor Seguro:{' '}
            <Text
              style={{
                fontWeight: 'bold',
                color: droneData?.safe_path ? '#22c55e' : '#ef4444',
              }}
            >
              {droneData
                ? droneData.safe_path
                  ? 'HABILITADO'
                  : 'EVASIÓN ACTIVA'
                : 'DESCONOCIDO'}
            </Text>
          </Text>
          <Text style={{ color: '#d1d5db', fontSize: 16, marginTop: 4 }}>
            Inclinación Máx:{' '}
            <Text style={{ fontWeight: 'bold', color: '#f3f4f6' }}>
              {droneData?.max_slope_deg ?? 0}°
            </Text>
            {'  '}• Altitud:{' '}
            <Text style={{ fontWeight: 'bold', color: '#f3f4f6' }}>
              {droneData?.altitude_m ?? droneData?.drone_pos?.[2] ?? 0}m
            </Text>
          </Text>
          <Text style={{ color: '#d1d5db', fontSize: 16, marginTop: 4 }}>
            Obstáculos:{' '}
            <Text style={{ fontWeight: 'bold', color: '#f3f4f6' }}>
              {droneData?.obstacles?.length ?? 0}
            </Text>
            {droneData?.navigation?.recommended_heading_deg !== undefined && (
              <Text style={{ color: '#4ade80', fontWeight: 'bold' }}>
                {'  '}• Rumbo:{' '}
                {droneData.navigation.recommended_heading_deg > 0
                  ? `+${droneData.navigation.recommended_heading_deg}`
                  : droneData.navigation.recommended_heading_deg}
                °
              </Text>
            )}
          </Text>
          {droneData?.navigation && (
            <Text style={{ color: '#9ca3af', fontSize: 13, marginTop: 4 }}>
              Área: {droneData.navigation.explored_area_m2}m² • A* (
              {droneData.navigation.astar?.explored_nodes ?? '--'}) vs Dijkstra (
              {droneData.navigation.dijkstra?.explored_nodes ?? '--'})
            </Text>
          )}
        </View>
      </View>
    </View>
  );
};

