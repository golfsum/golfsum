import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { PurchasesPackage } from 'react-native-purchases';
import { GolfSumLogo } from '../components/ui/GolfSumLogo';
import { PlanCard } from '../components/subscription/PlanCard';
import { getOfferings, purchasePackage, restorePurchases } from '../services/billingService';
import { logEvent } from '../services/analyticsEventsService';

type PlanType = 'annual' | 'monthly';

interface ProUpgradeScreenProps {
  source?: string;
  onBack: () => void;
  onPurchased?: () => void;
}

const FEATURES = [
  'Fairway and green tracking with miss direction',
  'Driving and approach misses by club',
  'Club-by-club performance',
  'Scrambling and short game stats',
  'Round tips from your stats',
  'Penalty strokes and where they cost you',
];

export const ProUpgradeScreen: React.FC<ProUpgradeScreenProps> = ({
  source = 'unknown',
  onBack,
  onPurchased,
}) => {
  const [monthlyPackage, setMonthlyPackage] = useState<PurchasesPackage | null>(null);
  const [annualPackage, setAnnualPackage] = useState<PurchasesPackage | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('annual');
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOfferings = async () => {
    try {
      setLoading(true);
      setError(null);
      const offerings = await getOfferings();
      setMonthlyPackage(offerings.monthly);
      setAnnualPackage(offerings.annual);

      if (!offerings.annual && offerings.monthly) {
        setSelectedPlan('monthly');
      }
      if (!offerings.monthly && offerings.annual) {
        setSelectedPlan('annual');
      }

      if (!offerings.monthly && !offerings.annual) {
        setError('No plans available right now.');
      }
    } catch (e: any) {
      const message = String(e?.message || '');
      setError(message || 'Could not load pricing.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    logEvent('upgrade_screen_viewed', { source });
    loadOfferings();
  }, [source]);

  const selectedPackage = useMemo(() => {
    return selectedPlan === 'annual' ? annualPackage : monthlyPackage;
  }, [selectedPlan, annualPackage, monthlyPackage]);

  const annualMonthlyEquivalent = useMemo(() => {
    if (!annualPackage) return null;
    const yearly = Number(annualPackage.product.price);
    if (!Number.isFinite(yearly) || yearly <= 0) return null;
    return `$${(yearly / 12).toFixed(2)}/mo`;
  }, [annualPackage]);

  const handlePurchase = async () => {
    if (!selectedPackage) return;
    try {
      setPurchasing(true);
      logEvent('purchase_initiated', { source, plan: selectedPlan });
      const result = await purchasePackage(selectedPackage);
      if (result.success) {
        logEvent('purchase_completed', { source, plan: selectedPlan });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        Alert.alert('Pro is active', 'Your subscription is active.');
        onPurchased?.();
        onBack();
        return;
      }
      if (__DEV__ && result.customerInfo) {
        const active = Object.keys(result.customerInfo.entitlements.active || {});
        Alert.alert('Purchase Debug', `Active entitlements: ${active.join(', ') || 'none'}`);
      }
      logEvent('purchase_cancelled', { source, plan: selectedPlan });
    } catch (e: any) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      const message = String(e?.message || '');
      if (/network|fetch|internet|offline/i.test(message)) {
        Alert.alert('No internet connection', 'Try again when you have signal.');
      } else {
        Alert.alert('Purchase did not go through', 'Check your payment method in Settings.');
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    try {
      setRestoring(true);
      logEvent('restore_attempted', { source: 'upgrade_screen' });
      const result = await restorePurchases();
      logEvent('restore_result', { found: result.success });
      if (result.success) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        Alert.alert('Purchase restored', 'Your subscription is active.');
        onPurchased?.();
        onBack();
      } else {
        Alert.alert('No purchase found', 'Make sure you are signed in with the right Apple ID.');
      }
    } catch {
      Alert.alert('Restore did not work', 'Try again.');
    } finally {
      setRestoring(false);
    }
  };

  const openTerms = () => Linking.openURL('https://golfsum.com/terms');
  const openPrivacy = () => Linking.openURL('https://golfsum.com/privacy');

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color="#E5E7EB" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <GolfSumLogo variant="header" />
        <Text style={styles.heading}>See More Of Your Game</Text>

        <View style={styles.featureCard}>
          {FEATURES.map((feature) => (
            <View key={feature} style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={18} color="#10B981" />
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>CHOOSE PLAN</Text>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color="#10B981" />
            <Text style={styles.loadingText}>Loading pricing</Text>
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Could not load pricing</Text>
            <Text style={styles.errorBody}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadOfferings}>
              <Text style={styles.retryButtonText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.planRow}>
            {annualPackage ? (
              <PlanCard
                label="Yearly"
                price={annualPackage.product.priceString}
                period="/year"
                subtitle={annualMonthlyEquivalent ?? undefined}
                badge="BEST PRICE"
                selected={selectedPlan === 'annual'}
                onPress={() => {
                  setSelectedPlan('annual');
                  logEvent('plan_selected', { source, plan: 'annual' });
                }}
              />
            ) : null}
            {monthlyPackage ? (
              <PlanCard
                label="Monthly"
                price={monthlyPackage.product.priceString}
                period="/month"
                selected={selectedPlan === 'monthly'}
                onPress={() => {
                  setSelectedPlan('monthly');
                  logEvent('plan_selected', { source, plan: 'monthly' });
                }}
              />
            ) : null}
          </View>
        )}

        <TouchableOpacity
          style={[styles.ctaButton, (!selectedPackage || purchasing || restoring) && styles.ctaButtonDisabled]}
          disabled={!selectedPackage || purchasing || restoring}
          onPress={handlePurchase}
        >
          {purchasing ? (
            <ActivityIndicator color="#0f1419" />
          ) : (
            <Text style={styles.ctaButtonText}>
              {selectedPlan === 'annual' ? 'Choose Yearly Plan' : 'Choose Monthly Plan'}
            </Text>
          )}
        </TouchableOpacity>

        <Text style={styles.disclosure}>
          Payment charged to your Apple ID. Cancel anytime in Settings.
        </Text>

        <TouchableOpacity style={styles.linkButton} onPress={handleRestore} disabled={restoring || purchasing}>
          <Text style={styles.linkText}>{restoring ? 'Restoring' : 'Restore Purchase'}</Text>
        </TouchableOpacity>

        <View style={styles.legalRow}>
          <TouchableOpacity onPress={openTerms}>
            <Text style={styles.legalLink}>Terms of Use</Text>
          </TouchableOpacity>
          <Text style={styles.legalDivider}>|</Text>
          <TouchableOpacity onPress={openPrivacy}>
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1419',
  },
  topBar: {
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#252d38',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#E5E7EB',
    marginTop: 12,
    marginBottom: 14,
  },
  featureCard: {
    backgroundColor: '#1a2028',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a3038',
    padding: 14,
    gap: 10,
    marginBottom: 18,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    color: '#E5E7EB',
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 10,
  },
  planRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  ctaButton: {
    height: 52,
    borderRadius: 12,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButtonDisabled: {
    opacity: 0.6,
  },
  ctaButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f1419',
  },
  disclosure: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 10,
  },
  linkButton: {
    alignItems: 'center',
    marginTop: 12,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  legalRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  legalLink: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  legalDivider: {
    fontSize: 12,
    color: '#6B7280',
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a2028',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a3038',
    paddingVertical: 24,
    marginBottom: 16,
  },
  loadingText: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 8,
  },
  errorCard: {
    backgroundColor: '#1a2028',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a3038',
    padding: 16,
    marginBottom: 16,
  },
  errorTitle: {
    color: '#E5E7EB',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  errorBody: {
    color: '#9CA3AF',
    fontSize: 13,
    marginBottom: 12,
  },
  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  retryButtonText: {
    color: '#0f1419',
    fontSize: 13,
    fontWeight: '700',
  },
});
