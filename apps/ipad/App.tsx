import React, { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StatusBar, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  connectBackbone,
  evaluateRisk,
  isStale,
  setBackboneUrl,
  useBackbone,
} from '@martian/shared';
import { tacticalStyles as styles } from './src/styles/tacticalStyles';
import { TacticalHeader } from './src/components/TacticalHeader';
import { VitalSignsGrid } from './src/components/VitalSignsGrid';
import { SuitImuAndDronePanel } from './src/components/SuitImuAndDronePanel';
import { RealSenseFeedCard } from './src/components/RealSenseFeedCard';

export default function App() {
  const { nodes, isConnected, getEva, getDrone } = useBackbone();
  const [customIp, setCustomIp] = useState('');
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    connectBackbone();
  }, []);

  const eva = getEva();
  const drone = getDrone();
  const evaData = eva?.data;
  const droneData = drone?.data;

  const stale = isStale(eva);
  const risk = evaluateRisk(evaData, droneData);

  useEffect(() => {
    if (Object.keys(nodes).length > 0) {
      console.log('[iPad Tactical Terminal] Datos vivos recibidos:', {
        eva: evaData,
        drone: droneData,
      });
    }
  }, [nodes]);

  useEffect(() => {
    if (risk.level === 'red') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } else if (risk.level === 'yellow') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
  }, [risk.level]);

  const handleUpdateIp = () => {
    if (customIp.trim()) {
      setBackboneUrl(customIp.trim());
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

      <TacticalHeader
        stale={stale}
        isConnected={isConnected}
        showConfig={showConfig}
        customIp={customIp}
        onToggleConfig={() => setShowConfig(!showConfig)}
        onChangeIp={setCustomIp}
        onSaveIp={handleUpdateIp}
      />

      <View style={[styles.riskBanner, { backgroundColor: getRiskBg() }]}>
        <Text style={styles.riskTitle}>
          {stale
            ? 'PÉRDIDA DE TELEMETRÍA (ÚLTIMO ESTADO GUARDADO)'
            : `ESTADO DE RIESGO: ${risk.level.toUpperCase()}`}
        </Text>
        {risk.reasons.length > 0 ? (
          <Text style={styles.riskDesc}>{risk.reasons.join(' • ')}</Text>
        ) : (
          <Text style={styles.riskDesc}>
            Sistemas nominales. Ruta segura verificada por dron.
          </Text>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <VitalSignsGrid evaData={evaData} />
        <SuitImuAndDronePanel evaData={evaData} droneData={droneData} />
        <RealSenseFeedCard droneData={droneData} />
      </ScrollView>
    </SafeAreaView>
  );
}
