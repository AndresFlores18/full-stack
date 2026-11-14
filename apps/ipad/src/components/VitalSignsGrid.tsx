import React from 'react';
import { Text, View } from 'react-native';
import { EvaData } from '@martian/shared';
import { tacticalStyles as styles } from '../styles/tacticalStyles';

interface VitalSignsGridProps {
  evaData?: EvaData;
}

export const VitalSignsGrid: React.FC<VitalSignsGridProps> = ({ evaData }) => {
  return (
    <View style={styles.grid}>
      <View style={styles.bigCard}>
        <Text style={styles.cardLabel}>OXÍGENO TRAJE</Text>
        <Text
          style={[
            styles.cardValue,
            { color: (evaData?.suit_o2 ?? 100) < 80 ? '#ef4444' : '#38bdf8' },
          ]}
        >
          {evaData?.suit_o2 ? `${evaData.suit_o2.toFixed(1)}%` : '--'}
        </Text>
        <Text style={styles.cardSub}>Presión O2 primaria</Text>
      </View>

      <View style={styles.bigCard}>
        <Text style={styles.cardLabel}>RITMO CARDÍACO</Text>
        <Text
          style={[
            styles.cardValue,
            { color: (evaData?.heart_rate ?? 75) > 110 ? '#f59e0b' : '#34d399' },
          ]}
        >
          {evaData?.heart_rate ? `${evaData.heart_rate} bpm` : '--'}
        </Text>
        <Text style={styles.cardSub}>BPM en tiempo real</Text>
      </View>

      <View style={styles.bigCard}>
        <Text style={styles.cardLabel}>RADIACIÓN</Text>
        <Text
          style={[
            styles.cardValue,
            { color: (evaData?.radiation_msv ?? 0) > 0.25 ? '#ef4444' : '#eab308' },
          ]}
        >
          {evaData?.radiation_msv ? `${evaData.radiation_msv.toFixed(2)}` : '--'}
        </Text>
        <Text style={styles.cardSub}>mSv/h ambiental</Text>
      </View>

      <View style={styles.bigCard}>
        <Text style={styles.cardLabel}>BATERÍA TRAJE</Text>
        <Text
          style={[
            styles.cardValue,
            { color: (evaData?.battery ?? 100) < 20 ? '#ef4444' : '#a855f7' },
          ]}
        >
          {evaData?.battery ? `${evaData.battery.toFixed(1)}%` : '--'}
        </Text>
        <Text style={styles.cardSub}>Autonomía estimada</Text>
      </View>
    </View>
  );
};

