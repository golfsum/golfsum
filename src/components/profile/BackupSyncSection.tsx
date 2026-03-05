import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface BackupSyncSectionProps {
  lastSyncLabel: string;
  lastSyncAgeDays: number | null;
  pendingSyncCount: number;
  isSyncing: boolean;
  syncError: string | null;
  onSync: () => void;
  styles: any;
}

export const BackupSyncSection: React.FC<BackupSyncSectionProps> = ({
  lastSyncLabel,
  lastSyncAgeDays,
  pendingSyncCount,
  isSyncing,
  syncError,
  onSync,
  styles,
}) => {
  const isStale = lastSyncAgeDays !== null && lastSyncAgeDays >= 1;
  const isCritical = lastSyncAgeDays !== null && lastSyncAgeDays >= 7;
  const warningText = lastSyncAgeDays !== null && lastSyncAgeDays >= 1
    ? `Your data hasn't been backed up in ${lastSyncAgeDays} day${lastSyncAgeDays === 1 ? '' : 's'}.`
    : null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderNoPress}>
        <View style={styles.headerLeft}>
          <Ionicons name="cloud" size={20} color="#10B981" />
          <Text style={styles.sectionTitle}>BACKUP AND SYNC</Text>
        </View>
      </View>
      <View style={styles.sectionContent}>
        <View style={styles.syncRow}>
          <View style={styles.syncInfo}>
            <Text style={styles.syncLabel}>Cloud backup</Text>
            <View style={styles.syncValueRow}>
              {isStale && (
                <Ionicons name="warning" size={12} color={isCritical ? '#EF4444' : '#F59E0B'} />
              )}
              <Text
                style={[
                  styles.syncValue,
                  isCritical ? styles.syncValueCritical : isStale ? styles.syncValueStale : null,
                ]}
              >
                Last sync: {lastSyncLabel}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]}
            onPress={onSync}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <ActivityIndicator size="small" color="#0f1419" />
            ) : (
              <Text style={styles.syncButtonText}>Sync Now</Text>
            )}
          </TouchableOpacity>
        </View>
        {warningText && (
          <Text style={[styles.syncWarningText, isCritical && styles.syncWarningTextCritical]}>
            {isCritical ? `${warningText} Sync now to avoid data loss.` : warningText}
          </Text>
        )}
        {syncError && <Text style={styles.syncErrorText}>{syncError}</Text>}
        {pendingSyncCount > 0 && (
          <Text style={styles.syncWarningText}>
            {pendingSyncCount} pending sync task{pendingSyncCount === 1 ? '' : 's'}.
          </Text>
        )}
        <Text style={styles.syncHint}>
          Backups run when you are signed in. Keep this device online to sync.
        </Text>
      </View>
    </View>
  );
};
