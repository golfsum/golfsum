import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { colors, spacing, typography, radius } from '../../theme/tokens';
import { UI_COPY } from '../../constants/uiCopy';

type ReviewStateKind = 'ok' | 'score_missing' | 'course_missing' | 'tee_missing' | 'low_confidence';

interface ReviewHeaderProps {
  title: string;
  subtitle: string;
  reviewKind: ReviewStateKind;
}

const toRgba = (hex: string, alpha: number) => {
  const sanitized = hex.replace('#', '');
  const bigint = parseInt(
    sanitized.length === 3
      ? sanitized.split('').map(c => c + c).join('')
      : sanitized,
    16
  );
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const ReviewHeader: React.FC<ReviewHeaderProps> = ({ title, subtitle, reviewKind }) => {
  const pillStyle =
    reviewKind === 'ok'
      ? styles.statusPillOk
      : reviewKind === 'score_missing'
      ? styles.statusPillNeeds
      : styles.statusPillWarn;

  const label = reviewKind === 'ok' ? UI_COPY.scorecardImport.reviewStatusComplete : UI_COPY.scorecardImport.reviewStatusNeedsReview;
  const reviewDetailByKind: Record<Exclude<ReviewStateKind, 'ok'>, string> = {
    score_missing: 'Add or correct hole scores in Stats before saving.',
    course_missing: 'Set a course name and select a matched course if available.',
    tee_missing: 'Add at least one tee box before saving.',
    low_confidence: 'Double-check OCR extracted values before saving.',
  };

  return (
    <View style={styles.reviewHeader}>
      <View style={styles.reviewHeaderText}>
        <Text style={styles.reviewTitle}>{title}</Text>
        <Text style={styles.reviewSubtitle}>{subtitle}</Text>
      </View>
      <TouchableOpacity
        style={[styles.statusPill, pillStyle]}
        disabled={reviewKind === 'ok'}
        onPress={() => {
          if (reviewKind === 'ok') return;
          Alert.alert('Needs Review', reviewDetailByKind[reviewKind]);
        }}
        accessibilityRole={reviewKind === 'ok' ? undefined : 'button'}
        accessibilityLabel={reviewKind === 'ok' ? label : `${label}. Tap for details`}
      >
        <Text style={styles.statusPillText}>{label}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  reviewHeaderText: {
    flex: 1,
  },
  reviewTitle: {
    ...typography.headingLg,
    color: colors.text.primary,
  },
  reviewSubtitle: {
    ...typography.bodySm,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  statusPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    marginLeft: spacing.md,
  },
  statusPillOk: {
    backgroundColor: toRgba(colors.brand.primary, 0.2),
  },
  statusPillNeeds: {
    backgroundColor: toRgba(colors.semantic.warning, 0.2),
  },
  statusPillWarn: {
    backgroundColor: toRgba(colors.semantic.error, 0.2),
  },
  statusPillText: {
    ...typography.labelSm,
    color: colors.text.primary,
  },
});
