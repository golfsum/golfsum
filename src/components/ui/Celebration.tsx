import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/tokens';

interface CelebrationProps {
  type: 'birdie' | 'eagle' | 'personal-best';
  onComplete?: () => void;
}

export const Celebration: React.FC<CelebrationProps> = ({ type, onComplete }) => {
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1.1, useNativeDriver: true }),
      ]),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
      Animated.delay(1400),
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => {
      if (onComplete) onComplete();
    });
  }, [opacity, scale, onComplete]);

  const config = {
    birdie: { icon: 'flash', color: colors.score.birdie },
    eagle: { icon: 'star', color: colors.score.eagle },
    'personal-best': { icon: 'trophy', color: colors.brand.primary },
  }[type];

  return (
    <Animated.View style={[styles.container, { opacity, transform: [{ scale }] }]}> 
      <View style={[styles.badge, { backgroundColor: config.color }]}> 
        <Ionicons name={config.icon as any} size={32} color="#fff" />
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: '40%',
    alignSelf: 'center',
    zIndex: 100,
  },
  badge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
