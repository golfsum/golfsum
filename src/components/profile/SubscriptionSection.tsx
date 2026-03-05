import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SubscriptionSectionProps {
  styles: any;
  isPro: boolean;
  inTrial: boolean;
  trialRoundsUsed: number;
  trialLimit: number;
  renewalDateLabel?: string | null;
  willRenew?: boolean;
  isLoading?: boolean;
  onSeePlans: () => void;
  onRestore: () => void;
  onManage: () => void;
}

export const SubscriptionSection: React.FC<SubscriptionSectionProps> = ({
  styles,
  isPro,
  inTrial,
  trialRoundsUsed,
  trialLimit,
  renewalDateLabel,
  willRenew = true,
  isLoading = false,
  onSeePlans,
  onRestore,
  onManage,
}) => {
  const freeView = !isPro && !inTrial;
  const trialRemaining = Math.max(0, trialLimit - trialRoundsUsed);

  return (
    <View style={styles.subscriptionCard}>
      <View style={styles.subscriptionHeader}>
        <Ionicons name="card-outline" size={16} color="#10B981" />
        <Text style={styles.subscriptionTitle}>SUBSCRIPTION</Text>
      </View>

      {isLoading ? (
        <Text style={styles.subscriptionStatusText}>Loading subscription status...</Text>
      ) : freeView ? (
        <>
          <Text style={styles.subscriptionPlan}>GolfSum Free</Text>
          <Text style={styles.subscriptionRenewalText}>
            Track fairways, greens, and get targeted coaching with GolfSum Pro.
          </Text>
          <TouchableOpacity
            style={{
              borderWidth: 1,
              borderColor: '#10B981',
              borderRadius: 10,
              paddingVertical: 10,
              alignItems: 'center',
              marginBottom: 10,
            }}
            onPress={onSeePlans}
          >
            <Text style={{ color: '#10B981', fontWeight: '700', fontSize: 13 }}>See Pro Plans</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onRestore}>
            <Text style={styles.subscriptionManageText}>Restore Purchase</Text>
          </TouchableOpacity>
        </>
      ) : inTrial ? (
        <>
          <Text style={styles.subscriptionPlan}>Advanced Trial</Text>
          <Text style={styles.subscriptionRenewalText}>
            {trialRemaining} of {trialLimit} advanced rounds remaining. All Pro features are active.
          </Text>
          <TouchableOpacity
            style={{
              borderWidth: 1,
              borderColor: '#10B981',
              borderRadius: 10,
              paddingVertical: 10,
              alignItems: 'center',
            }}
            onPress={onSeePlans}
          >
            <Text style={{ color: '#10B981', fontWeight: '700', fontSize: 13 }}>See Pro Plans</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.subscriptionPlan}>GolfSum Pro</Text>
          <Text style={styles.subscriptionRenewalText}>
            {renewalDateLabel
              ? willRenew
                ? `Renews ${renewalDateLabel}`
                : `Active until ${renewalDateLabel} · Will not renew`
              : 'Subscription active'}
          </Text>
          <TouchableOpacity style={styles.subscriptionManageButton} onPress={onManage}>
            <Text style={styles.subscriptionManageText}>Manage Subscription</Text>
            <Ionicons name="chevron-forward" size={14} color="#10B981" />
          </TouchableOpacity>
        </>
      )}
    </View>
  );
};

