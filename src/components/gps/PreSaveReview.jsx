import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../../theme/tokens';

/**
 * PreSaveReview — shown before saving a round when flagged holes exist.
 *
 * Props:
 *   visible         – boolean
 *   onClose         – dismiss without saving
 *   flaggedHoles    – array of { hole, par, shotCount, reason }
 *   onReviewHole    – (holeNumber) => open HoleReviewModal
 *   onSave          – save the round regardless of flags
 */
export default function PreSaveReview({ visible, onClose, flaggedHoles = [], onReviewHole, onSave }) {
  const count = flaggedHoles.length;
  if (count === 0) return null;

  const subtitle = count === 1
    ? 'One hole looks short on shots. You can check it now or save as is.'
    : `${count} holes look short on shots. Review them now or save as is.`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modal} onPress={() => undefined}>
          {/* Header */}
          <Text style={styles.title}>Before you save</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          {/* Flagged hole list */}
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {flaggedHoles.map((fh) => (
              <View key={fh.hole} style={styles.flagRow}>
                <View style={styles.flagDot} />
                <View style={styles.flagInfo}>
                  <Text style={styles.flagHole}>Hole {fh.hole}</Text>
                  <Text style={styles.flagMeta}>
                    Par {fh.par}  •  {fh.shotCount} shot{fh.shotCount === 1 ? '' : 's'} logged
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.reviewLink}
                  onPress={() => onReviewHole?.(fh.hole)}
                >
                  <Text style={styles.reviewLinkText}>Review</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          {/* Partial data note */}
          <Text style={styles.note}>
            Holes saved with partial data are not used in distance calculations.
          </Text>

          {/* Save button — always available */}
          <TouchableOpacity style={styles.saveBtn} onPress={onSave}>
            <Text style={styles.saveBtnText}>Save round</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: spacing.lg,
  },
  modal: {
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.lg,
    padding: spacing.xl,
    width: '100%',
    maxHeight: '80%',
  },

  title: {
    ...typography.headingLg,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.bodyMd,
    color: colors.text.secondary,
    marginBottom: spacing.lg,
  },

  list: {
    maxHeight: 280,
    marginBottom: spacing.lg,
  },

  flagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  flagDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.semantic.warning,
    marginRight: spacing.md,
  },
  flagInfo: {
    flex: 1,
  },
  flagHole: {
    ...typography.labelLg,
    color: colors.text.primary,
  },
  flagMeta: {
    ...typography.bodySm,
    color: colors.text.secondary,
    marginTop: 2,
  },
  reviewLink: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  reviewLinkText: {
    ...typography.labelMd,
    color: colors.semantic.warning,
  },

  note: {
    ...typography.bodySm,
    color: colors.text.tertiary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },

  saveBtn: {
    backgroundColor: colors.brand.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveBtnText: {
    ...typography.labelLg,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
