import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface GuestViewProps {
  onSignIn: () => void;
  onExport: () => void;
  isExporting: boolean;
  exportError: string | null;
  styles: any;
}

export const GuestView: React.FC<GuestViewProps> = ({
  onSignIn,
  onExport,
  isExporting,
  exportError,
  styles,
}) => {
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={24} color="#6B7280" />
          </View>
          <View style={styles.profileHeaderText}>
            <Text style={styles.guestText}>Guest User</Text>
            <Text style={styles.subText}>Sign in to sync your rounds across devices</Text>
          </View>
        </View>

        {/* Locked preview: Player Rating */}
        <View style={lockedStyles.card}>
          <View style={lockedStyles.header}>
            <View style={lockedStyles.lockIcon}>
              <Ionicons name="lock-closed" size={14} color="#6B7280" />
            </View>
            <Text style={lockedStyles.title}>GolfSum Player Rating</Text>
          </View>
          <Text style={lockedStyles.description}>
            Track 3 rated rounds to calculate your GolfSum Player Rating.
          </Text>
          <View style={lockedStyles.previewRow}>
            <Text style={lockedStyles.previewValue}>—</Text>
            <Text style={lockedStyles.previewLabel}>Player Rating</Text>
          </View>
        </View>

        {/* Locked preview: Your Game */}
        <View style={lockedStyles.card}>
          <View style={lockedStyles.header}>
            <View style={lockedStyles.lockIcon}>
              <Ionicons name="lock-closed" size={14} color="#6B7280" />
            </View>
            <Text style={lockedStyles.title}>Your Game</Text>
          </View>
          <Text style={lockedStyles.description}>
            Your goals, scoring trends, and game preferences in one place.
          </Text>
          <View style={lockedStyles.previewItems}>
            <View style={lockedStyles.previewItem}>
              <Ionicons name="trophy-outline" size={16} color="#6B7280" />
              <Text style={lockedStyles.previewItemText}>Set goals and track your progress</Text>
            </View>
            <View style={lockedStyles.previewItem}>
              <Ionicons name="stats-chart-outline" size={16} color="#6B7280" />
              <Text style={lockedStyles.previewItemText}>See your rounds at a glance</Text>
            </View>
            <View style={lockedStyles.previewItem}>
              <Ionicons name="settings-outline" size={16} color="#6B7280" />
              <Text style={lockedStyles.previewItemText}>Customize what stats you track</Text>
            </View>
          </View>
        </View>

        {/* Sign In CTA — positioned below locked cards */}
        <TouchableOpacity style={styles.signInButton} onPress={onSignIn}>
          <Ionicons name="log-in-outline" size={20} color="#FFFFFF" />
          <Text style={styles.signInButtonText}>Sign In or Create Account</Text>
        </TouchableOpacity>

        {/* Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SETTINGS</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingIcon}>
              <Ionicons name="cloud-offline-outline" size={22} color="#6B7280" />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Cloud Sync</Text>
              <Text style={styles.settingValue}>Sign in to enable</Text>
            </View>
          </View>
        </View>

        {/* Data */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DATA</Text>
          <View style={styles.sectionContent}>
            <View style={styles.syncRow}>
              <View style={styles.syncInfo}>
                <Text style={styles.syncLabel}>Export your rounds</Text>
                <Text style={styles.syncValue}>CSV format with round and hole data.</Text>
              </View>
              <TouchableOpacity
                style={[styles.exportButton, isExporting && styles.syncButtonDisabled]}
                onPress={onExport}
                disabled={isExporting}
              >
                {isExporting ? (
                  <ActivityIndicator size="small" color="#0f1419" />
                ) : (
                  <Text style={styles.exportButtonText}>Export</Text>
                )}
              </TouchableOpacity>
            </View>
            {exportError && <Text style={styles.syncErrorText}>{exportError}</Text>}
            <Text style={styles.syncHint}>
              Keep this file for backups or spreadsheets.
            </Text>
          </View>
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ABOUT</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingIcon}>
              <Ionicons name="golf" size={22} color="#10B981" />
            </View>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>GolfSum</Text>
              <Text style={styles.settingValue}>Version 1.0.0</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 80 }} />
      </ScrollView>
    </View>
  );
};

const lockedStyles = StyleSheet.create({
  card: {
    backgroundColor: '#1a2028',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2a3442',
    borderStyle: 'dashed',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  lockIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(107, 114, 128, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  description: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
    marginBottom: 12,
  },
  previewRow: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  previewValue: {
    fontSize: 28,
    fontWeight: '700',
    color: 'rgba(229, 231, 235, 0.25)',
  },
  previewLabel: {
    fontSize: 12,
    color: 'rgba(156, 163, 175, 0.4)',
    marginTop: 4,
  },
  previewItems: {
    gap: 8,
  },
  previewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  previewItemText: {
    fontSize: 13,
    color: '#6B7280',
  },
});
