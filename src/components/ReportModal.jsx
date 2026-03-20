import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  REPORT_CATEGORY_LABELS,
  buildReportSummaryParts,
  submitReport,
} from '../services/ReportService';

const MANUAL_CATEGORIES = [
  ['wrong_course_data', 'Course data'],
  ['wrong_gps_distance', 'GPS issue'],
  ['app_bug', 'App bug'],
  ['other', 'Other'],
];

export function ReportModal({
  visible,
  context = null,
  onClose,
}) {
  const [notes, setNotes] = useState('');
  const [courseName, setCourseName] = useState('');
  const [manualCategory, setManualCategory] = useState('wrong_course_data');
  const [selectedTeeName, setSelectedTeeName] = useState('');
  const [teePickerOpen, setTeePickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const isManual = context?.source === 'profile_manual';
  const teeOptions = useMemo(() => {
    const seen = new Set();
    const items = [];
    const pushOption = (value) => {
      const next = String(value || '').trim();
      if (!next) return;
      const key = next.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      items.push(next);
    };

    (context?.teeOptions || []).forEach((entry) => {
      if (typeof entry === 'string') {
        pushOption(entry);
        return;
      }
      pushOption(entry?.name);
    });
    pushOption(context?.teeName);
    pushOption('Other');
    return items;
  }, [context?.teeName, context?.teeOptions]);
  const showTeePicker = teeOptions.length > 1 || (!!context?.teeName && !isManual);

  useEffect(() => {
    if (!visible) return;
    setNotes('');
    setSubmitted(false);
    setSubmitting(false);
    setError(null);
    setCourseName(context?.courseName || '');
    setManualCategory(context?.category || 'wrong_course_data');
    setSelectedTeeName(context?.teeName || '');
    setTeePickerOpen(false);
  }, [context, visible]);

  useEffect(() => {
    if (!submitted) return undefined;
    const timeoutId = setTimeout(() => {
      onClose?.();
    }, 2000);
    return () => clearTimeout(timeoutId);
  }, [onClose, submitted]);

  const summaryParts = useMemo(() => buildReportSummaryParts({
    ...context,
    category: isManual ? manualCategory : context?.category,
    courseName: isManual ? courseName : context?.courseName,
    teeName: isManual ? context?.teeName : selectedTeeName || context?.teeName,
  }), [context, courseName, isManual, manualCategory, selectedTeeName]);

  const canSubmit = isManual
    ? Boolean(String(notes || '').trim().length && manualCategory)
    : !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitReport({
        ...context,
        category: isManual ? manualCategory : context?.category,
        courseName: isManual ? courseName : context?.courseName,
        teeName: selectedTeeName || context?.teeName,
        notes,
      });
      setSubmitted(true);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not send the report.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Report an issue</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={18} color="#E5E7EB" />
            </TouchableOpacity>
          </View>

          {submitted ? (
            <View style={styles.confirmWrap}>
              <Ionicons name="checkmark-circle" size={26} color="#4CAF7D" />
              <Text style={styles.confirmText}>Report sent. Thanks for helping improve GolfSum.</Text>
            </View>
          ) : (
            <>
              <View style={styles.summaryRow}>
                {summaryParts.map((part) => (
                  <View key={part} style={styles.summaryChip}>
                    <Text style={styles.summaryChipText}>{part}</Text>
                  </View>
                ))}
              </View>

              {showTeePicker ? (
                <>
                  <Text style={styles.label}>TEE</Text>
                  <Pressable
                    onPress={() => setTeePickerOpen((prev) => !prev)}
                    style={styles.dropdownButton}
                  >
                    <Text style={styles.dropdownButtonText}>{selectedTeeName || context?.teeName || 'Other'}</Text>
                    <Ionicons
                      name={teePickerOpen ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color="#CBD5E1"
                    />
                  </Pressable>
                  {teePickerOpen ? (
                    <View style={styles.dropdownMenu}>
                      {teeOptions.map((tee) => {
                        const active = (selectedTeeName || context?.teeName || 'Other') === tee;
                        return (
                          <Pressable
                            key={tee}
                            onPress={() => {
                              setSelectedTeeName(tee);
                              setTeePickerOpen(false);
                            }}
                            style={[styles.dropdownOption, active && styles.dropdownOptionActive]}
                          >
                            <Text style={[styles.dropdownOptionText, active && styles.dropdownOptionTextActive]}>
                              {tee}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </>
              ) : null}

              {isManual ? (
                <>
                  <Text style={styles.label}>ISSUE TYPE</Text>
                  <View style={styles.categoryGrid}>
                    {MANUAL_CATEGORIES.map(([value, label]) => {
                      const active = manualCategory === value;
                      return (
                        <Pressable
                          key={value}
                          onPress={() => setManualCategory(value)}
                          style={[styles.categoryButton, active && styles.categoryButtonActive]}
                        >
                          <Text style={[styles.categoryButtonText, active && styles.categoryButtonTextActive]}>
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={styles.label}>COURSE NAME</Text>
                  <TextInput
                    style={styles.input}
                    value={courseName}
                    onChangeText={setCourseName}
                    placeholder="Course name (optional)"
                    placeholderTextColor="#64748B"
                  />
                </>
              ) : (
                <>
                  <Text style={styles.label}>ISSUE</Text>
                  <View style={styles.readOnlyField}>
                    <Text style={styles.readOnlyText}>
                      {REPORT_CATEGORY_LABELS[context?.category] || 'Other'}
                    </Text>
                  </View>
                </>
              )}

              <Text style={styles.label}>NOTES</Text>
              <TextInput
                multiline
                style={[styles.input, styles.notesInput]}
                value={notes}
                onChangeText={setNotes}
                placeholder={isManual ? 'Describe the issue.' : 'Anything else to add? (optional)'}
                placeholderTextColor="#64748B"
                maxLength={500}
                textAlignVertical="top"
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <TouchableOpacity
                style={[styles.submitButton, (!canSubmit || submitting) && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={!canSubmit || submitting}
              >
                {submitting ? <ActivityIndicator size="small" color="#03251A" /> : <Text style={styles.submitButtonText}>Send Report</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

export default ReportModal;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(3, 7, 18, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  card: {
    width: '100%',
    maxWidth: 430,
    borderRadius: 20,
    backgroundColor: '#132031',
    borderWidth: 1,
    borderColor: '#263244',
    padding: 18,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  summaryChip: {
    borderRadius: 999,
    backgroundColor: '#1A2332',
    borderWidth: 1,
    borderColor: '#233247',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  summaryChipText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '700',
  },
  label: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 4,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  categoryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#1A2332',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  categoryButtonActive: {
    borderColor: '#4CAF7D',
    backgroundColor: 'rgba(76,175,125,0.12)',
  },
  categoryButtonText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '700',
  },
  categoryButtonTextActive: {
    color: '#FFFFFF',
  },
  readOnlyField: {
    borderRadius: 12,
    backgroundColor: '#1A2332',
    borderWidth: 1,
    borderColor: '#233247',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },
  readOnlyText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  dropdownButton: {
    borderRadius: 12,
    backgroundColor: '#1A2332',
    borderWidth: 1,
    borderColor: '#233247',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownButtonText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  dropdownMenu: {
    borderRadius: 12,
    backgroundColor: '#1A2332',
    borderWidth: 1,
    borderColor: '#233247',
    marginTop: -6,
    marginBottom: 12,
    overflow: 'hidden',
  },
  dropdownOption: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: '#233247',
  },
  dropdownOptionActive: {
    backgroundColor: 'rgba(76,175,125,0.12)',
  },
  dropdownOptionText: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '600',
  },
  dropdownOptionTextActive: {
    color: '#FFFFFF',
  },
  input: {
    borderRadius: 12,
    backgroundColor: '#1A2332',
    borderWidth: 1,
    borderColor: '#233247',
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#F8FAFC',
    fontSize: 14,
    marginBottom: 12,
  },
  notesInput: {
    minHeight: 108,
  },
  submitButton: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#03251A',
    fontSize: 14,
    fontWeight: '800',
  },
  confirmWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 180,
    gap: 12,
  },
  confirmText: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 22,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 12,
    marginBottom: 10,
  },
});
