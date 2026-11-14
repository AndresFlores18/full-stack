import React, { useState } from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { DroneData } from '@martian/shared';
import { tacticalStyles as styles } from '../styles/tacticalStyles';

interface RealSenseFeedCardProps {
  droneData?: DroneData;
}

export const RealSenseFeedCard: React.FC<RealSenseFeedCardProps> = ({ droneData }) => {
  const [activeCamFeed, setActiveCamFeed] = useState<'route_map' | 'rgb' | 'depth'>('route_map');

  if (!droneData?.images) return null;

  return (
    <View style={[styles.panelBox, { marginTop: 14 }]}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <Text style={styles.panelTitle}>📷 CÁMARA REALSENSE D415 EN VIVO</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['route_map', 'rgb', 'depth'] as const).map((feedKey) => (
            <TouchableOpacity
              key={feedKey}
              onPress={() => setActiveCamFeed(feedKey)}
              style={{
                backgroundColor: activeCamFeed === feedKey ? '#f97316' : '#1f2937',
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: '#374151',
              }}
            >
              <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 12 }}>
                {feedKey === 'route_map'
                  ? 'MAPA RUTA (A*)'
                  : feedKey === 'rgb'
                  ? 'RGB 3D'
                  : 'DEPTH RANSAC'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Image
        source={{ uri: droneData.images[activeCamFeed] }}
        style={{ width: '100%', height: 260, borderRadius: 8, backgroundColor: '#030712' }}
        resizeMode="contain"
      />
    </View>
  );
};

