import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  REPORT_CATEGORY_LABELS,
  clearCourseCache,
  getAdminReportGroups,
  updateReportStatus,
} from '../services/ReportService';

const STATUS_OPTIONS = ['open', 'in_review', 'resolved', 'wont_fix'];

export function AdminReportsScreen({ visible, onClose }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [notesById, setNotesById] = useState({});
  const [error, setError] = useState(null);

  const loadGroups = async () => {
    setLoading(true);
    setError(null);
    try {
      const nextGroups = await getAdminReportGroups();
      setGroups(nextGroups);
      setNotesById(
        Object.fromEntries(
          nextGroups.map((group) => [group.latestReportId, group.latestReport?.adminNotes || ''])
        )
      );
    } catch (nextError) {
      setGroups([]);
      setError(nextError instanceof Error ? nextError.message : 'Could not load reports.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!visible) return;
    loadGroups();
  }, [visible]);

  const handleStatusChange = async (group, status) => {
    setSavingId(group.latestReportId);
    try {
      await updateReportStatus(group.latestReportId, status, notesById[group.latestReportId] || '');
      if (status === 'resolved' && group.courseId) {
        await clearCourseCache(group.courseId);
      }
      await loadGroups();
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>Reports</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={20} color="#E5E7EB" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="small" color="#10B981" />
            <Text style={styles.loadingText}>Loading reports</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {!error && groups.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No open reports</Text>
                <Text style={styles.emptyText}>New reports will show here.</Text>
              </View>
            ) : null}
            {groups.map((group) => {
              const latest = group.latestReport || {};
              const countTone = group.count >= 5 ? styles.badgeHot : group.count >= 3 ? styles.badgeWarm : styles.badgeBase;
              return (
                <View key={group.key} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={[styles.countBadge, countTone]}>
                      <Text style={styles.countBadgeText}>{group.count} reports</Text>
                    </View>
                    <Text style={styles.category}>{REPORT_CATEGORY_LABELS[group.category] || 'Other'}</Text>
                  </View>
                  <Text style={styles.contextText}>
                    {[group.courseName, group.layoutName, group.teeName, group.holeNumber ? `Hole ${group.holeNumber}` : null].filter(Boolean).join(' · ')}
                  </Text>
                  {group.reports.map((report) => (
                    report.notes ? (
                      <Text key={report.id} style={styles.noteText}>
                        {report.notes}
                      </Text>
                    ) : null
                  ))}
                  <TextInput
                    style={styles.notesInput}
                    value={notesById[group.latestReportId] || ''}
                    onChangeText={(value) => setNotesById((prev) => ({ ...prev, [group.latestReportId]: value }))}
                    placeholder="Admin notes"
                    placeholderTextColor="#64748B"
                    multiline
                  />
                  <View style={styles.statusRow}>
                    {STATUS_OPTIONS.map((status) => {
                      const active = latest.status === status;
                      return (
                        <TouchableOpacity
                          key={status}
                          style={[styles.statusButton, active && styles.statusButtonActive]}
                          onPress={() => handleStatusChange(group, status)}
                          disabled={savingId === group.latestReportId}
                        >
                          <Text style={[styles.statusButtonText, active && styles.statusButtonTextActive]}>
                            {status.replace('_', ' ')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

export default AdminReportsScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0B1120',
    paddingTop: 52,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#CBD5E1',
    fontSize: 13,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 13,
    marginBottom: 10,
  },
  emptyState: {
    borderRadius: 16,
    backgroundColor: '#132031',
    borderWidth: 1,
    borderColor: '#243041',
    padding: 18,
  },
  emptyTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyText: {
    color: '#A5B4C7',
    fontSize: 13,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  card: {
    borderRadius: 16,
    backgroundColor: '#132031',
    borderWidth: 1,
    borderColor: '#243041',
    padding: 14,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  countBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeBase: {
    backgroundColor: '#1E293B',
  },
  badgeWarm: {
    backgroundColor: '#A16207',
  },
  badgeHot: {
    backgroundColor: '#B91C1C',
  },
  countBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  category: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  contextText: {
    color: '#A5B4C7',
    fontSize: 12,
    marginBottom: 10,
  },
  noteText: {
    color: '#E2E8F0',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 6,
  },
  notesInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0F172A',
    color: '#F8FAFC',
    minHeight: 72,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginTop: 6,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  statusButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  statusButtonActive: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16,185,129,0.16)',
  },
  statusButtonText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '700',
  },
  statusButtonTextActive: {
    color: '#FFFFFF',
  },
});
