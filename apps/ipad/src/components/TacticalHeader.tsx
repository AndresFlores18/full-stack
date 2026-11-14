import React from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getBackboneUrl } from '@martian/shared';
import { tacticalStyles as styles } from '../styles/tacticalStyles';

interface TacticalHeaderProps {
  stale: boolean;
  isConnected: boolean;
  showConfig: boolean;
  customIp: string;
  onToggleConfig: () => void;
  onChangeIp: (ip: string) => void;
  onSaveIp: () => void;
}

export const TacticalHeader: React.FC<TacticalHeaderProps> = ({
  stale,
  isConnected,
  showConfig,
  customIp,
  onToggleConfig,
  onChangeIp,
  onSaveIp,
}) => {
  return (
    <>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>MARTIAN TACTICAL TERMINAL</Text>
          <Text style={styles.subtitle}>EVA-03 ASTRONAUT HUD • ALAN</Text>
        </View>

        <TouchableOpacity
          style={[
            styles.connBadge,
            { backgroundColor: stale || !isConnected ? '#7f1d1d' : '#14532d' },
          ]}
          onPress={onToggleConfig}
        >
          <View
            style={[
              styles.dot,
              { backgroundColor: stale || !isConnected ? '#ef4444' : '#22c55e' },
            ]}
          />
          <Text style={styles.connText}>
            {stale || !isConnected ? 'SIN ENLACE' : 'ENLACE ACTIVO'}
          </Text>
        </TouchableOpacity>
      </View>

      {showConfig && (
        <View style={styles.configBox}>
          <Text style={styles.configTitle}>Configurar IP Externa del Servidor de Mapas:</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput
              style={styles.input}
              placeholder="Ej: 192.168.10.100:8765 o ws://..."
              placeholderTextColor="#9ca3af"
              value={customIp}
              onChangeText={onChangeIp}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.btnSave} onPress={onSaveIp}>
              <Text style={styles.btnText}>Conectar</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ color: '#9ca3af', fontSize: 12, marginTop: 4 }}>
            URL actual: {getBackboneUrl()}
          </Text>
        </View>
      )}
    </>
  );
};

