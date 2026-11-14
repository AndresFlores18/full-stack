import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Dimensions,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  connectBackbone,
  evaluateRisk,
  getBackboneUrl,
  isStale,
  setBackboneUrl,
  useBackbone,
} from '@martian/shared';

export default function App() {
  const { nodes, isConnected, getEva, getDrone } = useBackbone();
  const [customIp, setCustomIp] = useState('');
  const [showConfig, setShowConfig] = useState(false);

  // Conectar al backbone
  useEffect(() => {
    connectBackbone();
  }, []);

  const eva = getEva();
  const drone = getDrone();
  const evaData = eva?.data;
  const droneData = drone?.data;

  const stale = isStale(eva);
  const risk = evaluateRisk(evaData, droneData);

  // Log de datos vivos para validar Fase 0
  useEffect(() => {
    if (Object.keys(nodes).length > 0) {
      console.log('📱 [iPad Tactical Terminal] Datos vivos recibidos:', {
        eva: evaData,
        drone: droneData,
      });
    }
  }, [nodes]);

  // Vibración táctica en caso de riesgo crítico o advertencia
  useEffect(() => {
    if (risk.level === 'red') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } else if (risk.level === 'yellow') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
  }, [risk.level]);

  const handleUpdateIp = () => {
    if (customIp.trim()) {
      const url = customIp.startsWith('ws://') ? customIp.trim() : `ws://${customIp.trim()}:8765`;
      setBackboneUrl(url);
      setShowConfig(false);
    }
  };

  const getRiskBg = () => {
    if (stale) return '#374151';
    if (risk.level === 'red') return '#dc2626';
    if (risk.level === 'yellow') return '#d97706';
    return '#16a34a';
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0b0f19" />

      {/* HEADER TÁCTICO */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>MARTIAN TACTICAL TERMINAL</Text>
          <Text style={styles.subtitle}>EVA-03 ASTRONAUT HUD • ALAN</Text>
        </View>

        {/* Indicador de Conexión */}
        <TouchableOpacity
          style={[styles.connBadge, { backgroundColor: stale || !isConnected ? '#7f1d1d' : '#14532d' }]}
          onPress={() => setShowConfig(!showConfig)}
        >
          <View style={[styles.dot, { backgroundColor: stale || !isConnected ? '#ef4444' : '#22c55e' }]} />
          <Text style={styles.connText}>
            {stale || !isConnected ? 'SIN ENLACE' : 'ENLACE ACTIVO'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* MODAL CONFIGURACIÓN IP RÁPIDA (PARA EL ROUTER DE MACÍAS) */}
      {showConfig && (
        <View style={styles.configBox}>
          <Text style={styles.configTitle}>Configurar IP del Backbone de Macías:</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput
              style={styles.input}
              placeholder="Ej: 192.168.10.100 o ws://..."
              placeholderTextColor="#9ca3af"
              value={customIp}
              onChangeText={setCustomIp}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.btnSave} onPress={handleUpdateIp}>
              <Text style={styles.btnText}>Conectar</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ color: '#9ca3af', fontSize: 12, marginTop: 4 }}>
            URL actual: {getBackboneUrl()}
          </Text>
        </View>
      )}

      {/* BANNER DE ALERTA DE RIESGO CRÍTICO */}
      <View style={[styles.riskBanner, { backgroundColor: getRiskBg() }]}>
        <Text style={styles.riskTitle}>
          {stale ? '⚠️ PÉRDIDA DE TELEMETRÍA (ÚLTIMO ESTADO GUARDADO)' : `ESTADO DE RIESGO: ${risk.level.toUpperCase()}`}
        </Text>
        {risk.reasons.length > 0 ? (
          <Text style={styles.riskDesc}>{risk.reasons.join(' • ')}</Text>
        ) : (
          <Text style={styles.riskDesc}>Sistemas nominales. Ruta segura verificada por dron.</Text>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* GRID DE TARJETAS GRANDES PARA GUANTES */}
        <View style={styles.grid}>
          {/* Tarjeta 1: Oxígeno */}
          <View style={styles.bigCard}>
            <Text style={styles.cardLabel}>OXÍGENO TRAJE</Text>
            <Text style={[styles.cardValue, { color: (evaData?.suit_o2 ?? 100) < 80 ? '#ef4444' : '#38bdf8' }]}>
              {evaData?.suit_o2 ? `${evaData.suit_o2.toFixed(1)}%` : '--'}
            </Text>
            <Text style={styles.cardSub}>Presión O2 primaria</Text>
          </View>

          {/* Tarjeta 2: Pulso / Ritmo Cardíaco */}
          <View style={styles.bigCard}>
            <Text style={styles.cardLabel}>RITMO CARDÍACO</Text>
            <Text style={[styles.cardValue, { color: (evaData?.heart_rate ?? 75) > 110 ? '#f59e0b' : '#34d399' }]}>
              {evaData?.heart_rate ? `${evaData.heart_rate} bpm` : '--'}
            </Text>
            <Text style={styles.cardSub}>BPM en tiempo real</Text>
          </View>

          {/* Tarjeta 3: Radiación */}
          <View style={styles.bigCard}>
            <Text style={styles.cardLabel}>RADIACIÓN</Text>
            <Text style={[styles.cardValue, { color: (evaData?.radiation_msv ?? 0) > 0.25 ? '#ef4444' : '#eab308' }]}>
              {evaData?.radiation_msv ? `${evaData.radiation_msv.toFixed(2)}` : '--'}
            </Text>
            <Text style={styles.cardSub}>mSv/h ambiental</Text>
          </View>

          {/* Tarjeta 4: Batería */}
          <View style={styles.bigCard}>
            <Text style={styles.cardLabel}>BATERÍA TRAJE</Text>
            <Text style={[styles.cardValue, { color: (evaData?.battery ?? 100) < 20 ? '#ef4444' : '#a855f7' }]}>
              {evaData?.battery ? `${evaData.battery.toFixed(1)}%` : '--'}
            </Text>
            <Text style={styles.cardSub}>Autonomía estimada</Text>
          </View>
        </View>

        {/* SECCIÓN SECUNDARIA: IMU + DRON TERRENO */}
        <View style={styles.secondarySection}>
          {/* IMU Traje */}
          <View style={styles.panelBox}>
            <Text style={styles.panelTitle}>🧭 ORIENTACIÓN TRAJE (IMU)</Text>
            <View style={styles.imuRow}>
              <View style={styles.imuCol}>
                <Text style={styles.imuLabel}>YAW</Text>
                <Text style={styles.imuVal}>{evaData?.imu?.yaw ? `${evaData.imu.yaw}°` : '0.0°'}</Text>
              </View>
              <View style={styles.imuCol}>
                <Text style={styles.imuLabel}>PITCH</Text>
                <Text style={styles.imuVal}>{evaData?.imu?.pitch ? `${evaData.imu.pitch}°` : '0.0°'}</Text>
              </View>
              <View style={styles.imuCol}>
                <Text style={styles.imuLabel}>ROLL</Text>
                <Text style={styles.imuVal}>{evaData?.imu?.roll ? `${evaData.imu.roll}°` : '0.0°'}</Text>
              </View>
            </View>
          </View>

          {/* Estado de Ruta Dron */}
          <View style={styles.panelBox}>
            <Text style={styles.panelTitle}>🚁 TERRENO / DRON CV</Text>
            <View style={{ marginTop: 8 }}>
              <Text style={{ color: '#d1d5db', fontSize: 16 }}>
                Ruta Segura:{' '}
                <Text style={{ fontWeight: 'bold', color: droneData?.safe_path ? '#22c55e' : '#ef4444' }}>
                  {droneData ? (droneData.safe_path ? 'HABILITADA' : 'OBSTÁCULO / BLOQUEADA') : 'DESCONOCIDA'}
                </Text>
              </Text>
              <Text style={{ color: '#d1d5db', fontSize: 16, marginTop: 4 }}>
                Pendiente Máx: <Text style={{ fontWeight: 'bold', color: '#f3f4f6' }}>{droneData?.max_slope_deg ?? 0}°</Text>
              </Text>
              <Text style={{ color: '#d1d5db', fontSize: 16, marginTop: 4 }}>
                Obstáculos Dron: <Text style={{ fontWeight: 'bold', color: '#f3f4f6' }}>{droneData?.obstacles?.length ?? 0}</Text>
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0f19',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: '#f97316',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  connBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  connText: {
    color: '#f3f4f6',
    fontWeight: '700',
    fontSize: 13,
  },
  configBox: {
    backgroundColor: '#1f2937',
    padding: 14,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 8,
  },
  configTitle: {
    color: '#f3f4f6',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#4b5563',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    color: '#f9fafb',
  },
  btnSave: {
    backgroundColor: '#f97316',
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 6,
  },
  btnText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  riskBanner: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
  },
  riskTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
  },
  riskDesc: {
    color: '#f3f4f6',
    fontSize: 14,
    marginTop: 4,
    fontWeight: '600',
  },
  content: {
    padding: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  bigCard: {
    flex: 1,
    minWidth: 180,
    backgroundColor: '#111827',
    padding: 22,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#374151',
  },
  cardLabel: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  cardValue: {
    fontSize: 40,
    fontWeight: '900',
    marginVertical: 10,
  },
  cardSub: {
    color: '#6b7280',
    fontSize: 12,
  },
  secondarySection: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 14,
  },
  panelBox: {
    flex: 1,
    backgroundColor: '#111827',
    padding: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  panelTitle: {
    color: '#f97316',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
  },
  imuRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
  imuCol: {
    alignItems: 'center',
  },
  imuLabel: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '700',
  },
  imuVal: {
    color: '#f3f4f6',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 4,
  },
});

