import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, radius, spacing, typography } from '../../theme/tokens';

interface TooltipProps {
  id: string;
  text: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom';
}

export const Tooltip: React.FC<TooltipProps> = ({
  id,
  text,
  children,
  position = 'bottom',
}) => {
  const [visible, setVisible] = useState(false);
  const storageKey = `@GolfSum:tooltip_${id}`;

  useEffect(() => {
    const check = async () => {
      const seen = await AsyncStorage.getItem(storageKey);
      if (!seen) setVisible(true);
    };
    check();
  }, [storageKey]);

  const dismiss = async () => {
    await AsyncStorage.setItem(storageKey, 'true');
    setVisible(false);
  };

  return (
    <View>
      {children}
      {visible && (
        <View
          style={[
            styles.tooltip,
            position === 'top' ? styles.tooltipTop : styles.tooltipBottom,
          ]}
        >
          <Text style={styles.tooltipText}>{text}</Text>
          <TouchableOpacity onPress={dismiss} style={styles.dismissButton}>
            <Text style={styles.dismissText}>Got it</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  tooltip: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.brand.primary,
    padding: spacing.md,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 100,
  },
  tooltipTop: {
    bottom: '100%',
    marginBottom: spacing.sm,
  },
  tooltipBottom: {
    top: '100%',
    marginTop: spacing.sm,
  },
  tooltipText: {
    ...typography.bodyMd,
    color: colors.text.inverse,
    flex: 1,
  },
  dismissButton: {
    marginLeft: spacing.md,
  },
  dismissText: {
    ...typography.labelMd,
    color: colors.text.inverse,
  },
});
