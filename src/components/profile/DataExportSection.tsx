import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface DataExportSectionProps {
  isExporting: boolean;
  exportError: string | null;
  onReportIssue?: () => void;
  onExportCsv: () => void;
  onExportExcel: () => void;
  onExportJson: () => void;
  styles: any;
}

export const DataExportSection: React.FC<DataExportSectionProps> = ({
  isExporting,
  exportError,
  onReportIssue,
  onExportCsv,
  onExportExcel,
  onExportJson,
  styles,
}) => (
  <View style={styles.section}>
    <View style={styles.sectionHeaderNoPress}>
      <View style={styles.headerLeft}>
        <Ionicons name="download" size={20} color="#10B981" />
        <Text style={styles.sectionTitle}>DATA EXPORT</Text>
      </View>
    </View>
    <View style={styles.sectionContent}>
      <View style={styles.syncRow}>
        <View style={styles.syncInfo}>
          <Text style={styles.syncLabel}>Export your rounds</Text>
          <Text style={styles.syncValue}>CSV, Excel, or JSON with round and hole data.</Text>
        </View>
        <View style={styles.exportButtonGroup}>
          <TouchableOpacity
            style={[styles.exportButton, isExporting && styles.syncButtonDisabled]}
            onPress={onExportCsv}
            disabled={isExporting}
          >
            {isExporting ? (
              <ActivityIndicator size="small" color="#0f1419" />
            ) : (
              <Text style={styles.exportButtonText}>CSV</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.exportButtonSecondary, isExporting && styles.syncButtonDisabled]}
            onPress={onExportExcel}
            disabled={isExporting}
          >
            <Text style={styles.exportButtonTextSecondary}>Excel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.exportButtonSecondary, isExporting && styles.syncButtonDisabled]}
            onPress={onExportJson}
            disabled={isExporting}
          >
            <Text style={styles.exportButtonTextSecondary}>JSON</Text>
          </TouchableOpacity>
        </View>
      </View>
      {exportError && (
        <View>
          <Text style={styles.syncErrorText}>{exportError}</Text>
          {onReportIssue && (
            <TouchableOpacity onPress={onReportIssue} accessibilityRole="button">
              <Text style={styles.reportIssueText}>Report Issue</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      <Text style={styles.syncHint}>
        Use this file for backups or importing into spreadsheets.
      </Text>
    </View>
  </View>
);
