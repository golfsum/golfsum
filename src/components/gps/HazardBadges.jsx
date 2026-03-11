import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const LABELS = {
  water: 'Water',
  fairwayBunker: 'FW Bunker',
  greenBunker: 'Green Bunker',
  dogleg: 'Dogleg',
};

export function HazardBadges({ flags }) {
  const entries = Object.entries(flags || {}).filter(([, value]) => !!value);
  if (!entries.length) return null;
  return (
    <View style={styles.row}>
      {entries.map(([key]) => (
        <View key={key} style={styles.badge}>
          <Text style={styles.text}>{LABELS[key] || key}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  badge: {
    backgroundColor: '#1F2937',
    borderColor: '#374151',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  text: { color: '#9CA3AF', fontSize: 11, fontWeight: '600' },
});

