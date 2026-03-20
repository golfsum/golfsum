import React from 'react';
import {
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { getScoreColor, getScoreBackgroundColor } from '../../utils/scoreColors';
import { rs } from '../../utils/responsive';

type HoleScoreEntry = { score: number; par: number };

type Props = {
  totalHoles?: number;
  holeOffset?: number;
  holeNumbers?: number[];
  selectedHole?: number;
  onSelect?: (hole: number) => void;
  holesWithData?: number[];
  holeScores?: Record<number, HoleScoreEntry>;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export function HoleSelectorBar({
  totalHoles = 18,
  holeOffset = 0,
  holeNumbers,
  selectedHole,
  onSelect,
  holesWithData = [],
  holeScores = {},
  style,
  contentContainerStyle,
}: Props) {
  const dataSet = new Set((holesWithData || []).map((value) => Number(value)).filter(Number.isFinite));
  const holes = Array.isArray(holeNumbers) && holeNumbers.length > 0
    ? holeNumbers.map((holeNumber, index) => ({
        value: index + 1,
        label: holeNumber,
        dataKey: holeNumber,
      }))
    : Array.from({ length: Math.max(1, totalHoles) }, (_, index) => {
        const holeNumber = index + 1 + holeOffset;
        return {
          value: holeNumber,
          label: holeNumber,
          dataKey: holeNumber,
        };
      });

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={style}
      contentContainerStyle={[styles.row, contentContainerStyle]}
    >
      {holes.map((hole) => {
        const active = hole.value === selectedHole;
        const hasData = dataSet.has(hole.dataKey);
        const scoreEntry = holeScores[hole.dataKey];
        const scored = scoreEntry != null;
        const scoreColor = scored ? getScoreColor(scoreEntry.score, scoreEntry.par) : null;
        const scoreBg = scored ? getScoreBackgroundColor(scoreEntry.score, scoreEntry.par) : null;
        return (
          <TouchableOpacity
            key={`${hole.value}-${hole.label}`}
            onPress={() => onSelect?.(hole.value)}
            style={[
              styles.holeBtn,
              active && styles.holeBtnActive,
              scored && !active && { backgroundColor: scoreBg || 'rgba(255,255,255,0.14)', borderColor: scoreColor ? scoreColor + '80' : 'rgba(255,255,255,0.10)' },
            ]}
          >
            {hasData && !scored ? <View style={styles.dataDot} /> : null}
            <Text style={[
              styles.holeText,
              active && styles.holeTextActive,
              scored && !active && scoreColor ? { color: scoreColor, fontWeight: '700' } : null,
            ]}>{hole.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 4,
    paddingRight: 4,
    paddingLeft: 4,
  },
  holeBtn: {
    width: rs(30),
    height: rs(30),
    borderRadius: rs(15),
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 7,
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  holeBtnActive: {
    backgroundColor: '#1a8a3a',
    borderColor: 'rgba(26,200,85,0.5)',
  },
  holeText: {
    fontSize: rs(10),
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
  },
  holeTextActive: {
    color: '#FFFFFF',
  },
  dataDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#1ac855',
    position: 'absolute',
    top: 2,
  },
});

export default HoleSelectorBar;
