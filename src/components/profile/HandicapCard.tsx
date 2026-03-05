import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface HandicapCardProps {
  handicapValue: string;
  statusText?: string;
  eligibleRounds: number;
  notEligibleRounds: number;
  handicapChange: number | null;
  handicapImproving: boolean;
  lastUpdated: string;
  showFallbackBadge: boolean;
  fallbackRoundsUsed: number | null;
  onInfoPress: () => void;
  styles: any;
}

export const HandicapCard: React.FC<HandicapCardProps> = ({
  handicapValue,
  statusText,
  eligibleRounds,
  notEligibleRounds,
  handicapChange,
  handicapImproving,
  lastUpdated,
  showFallbackBadge,
  fallbackRoundsUsed,
  onInfoPress,
  styles,
}) => {
  const eligibleLabel = `${eligibleRounds} rated round${eligibleRounds !== 1 ? 's' : ''}`;
  const notEligibleLabel = `${notEligibleRounds} unrated round${notEligibleRounds !== 1 ? 's' : ''}`;

  return (
    <View style={styles.handicapCard}>
      <TouchableOpacity style={styles.handicapHeader} onPress={onInfoPress}>
        <Ionicons name="trophy" size={16} color="#10B981" />
        <Text style={styles.handicapLabel}>GOLFSUM PLAYER RATING</Text>
        <Ionicons name="information-circle-outline" size={14} color="#6B7280" />
      </TouchableOpacity>
      <Text style={styles.handicapValue}>{handicapValue}</Text>
      {statusText ? (
        <Text style={styles.handicapStatus}>{statusText}</Text>
      ) : null}
      <View style={styles.handicapDetails}>
        <Text style={styles.handicapDetail}>
          {eligibleLabel} · {notEligibleLabel}
        </Text>
        {handicapChange !== null && Math.abs(handicapChange) > 0.1 && (
          <View style={styles.handicapChange}>
            <Ionicons
              name={handicapImproving ? 'trending-down' : 'trending-up'}
              size={12}
              color={handicapImproving ? '#10B981' : '#EF4444'}
            />
            <Text style={[
              styles.handicapChangeText,
              { color: handicapImproving ? '#10B981' : '#EF4444' }
            ]}>
              {handicapImproving ? '' : '+'}{handicapChange.toFixed(1)} this week
            </Text>
          </View>
        )}
        <Text style={styles.handicapDate}>Last updated: {lastUpdated}</Text>
        {showFallbackBadge && fallbackRoundsUsed !== null && (
          <View style={styles.fallbackBadge}>
            <Ionicons name="information-circle" size={12} color="#F59E0B" />
            <Text style={styles.fallbackText}>
              Using best {fallbackRoundsUsed} round{fallbackRoundsUsed === 1 ? '' : 's'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};
