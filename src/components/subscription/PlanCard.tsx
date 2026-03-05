import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface PlanCardProps {
  label: string;
  price: string;
  period: string;
  subtitle?: string;
  badge?: string;
  selected: boolean;
  onPress: () => void;
}

export const PlanCard: React.FC<PlanCardProps> = ({
  label,
  price,
  period,
  subtitle,
  badge,
  selected,
  onPress,
}) => {
  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.cardSelected]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${label} plan`}
    >
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.price}>
        {price}
        <Text style={styles.period}>{period}</Text>
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 120,
    backgroundColor: '#1a2028',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a3038',
    padding: 14,
  },
  cardSelected: {
    borderColor: '#10B981',
  },
  badge: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 10,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#10B981',
    letterSpacing: 0.4,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: '#E5E7EB',
    marginBottom: 8,
  },
  price: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  period: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  subtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 8,
  },
});

