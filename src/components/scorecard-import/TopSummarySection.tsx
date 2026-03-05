import React from 'react';
import { Text, View } from 'react-native';
import { colors, radius } from '../../theme/tokens';
import { ReviewHeader } from './ReviewHeader';
import { ReviewChips } from './ReviewChips';
import { RoundSummaryCard } from './RoundSummaryCard';
import { UI_COPY } from '../../constants/uiCopy';
import type { ReviewState, RoundSummary } from './types';

interface Props {
  courseName: string;
  reviewState: ReviewState;
  activeTeeName?: string;
  roundHoleCount: 9 | 18;
  playerDate: string;
  isCompletedMode: boolean;
  scanState: 'empty' | 'ready' | 'scanning' | 'complete' | 'error';
  isPremium: boolean;
  inTrial: boolean;
  trialRoundsUsed: number;
  trialLimit: number;
  roundSummary: RoundSummary | null;
  onPressTee: () => void;
  onPressHoles: () => void;
  onPressDate: () => void;
  onUpgradeTrial: () => void;
}

export const TopSummarySection: React.FC<Props> = (props) => {
  return (
    <>
      <ReviewHeader
        title={UI_COPY.scorecardImport.reviewRoundTitle}
        subtitle={
          props.courseName.trim()
            || (props.reviewState.kind === 'course_missing'
              ? UI_COPY.scorecardImport.unknownCourse
              : 'Course selected')
        }
        reviewKind={props.reviewState.kind}
      />
      <ReviewChips
        teeLabel={props.activeTeeName || UI_COPY.scorecardImport.teeFallback}
        holeCount={props.roundHoleCount}
        dateLabel={props.playerDate || UI_COPY.scorecardImport.dateFallback}
        onPressTee={props.onPressTee}
        onPressHoles={props.onPressHoles}
        onPressDate={props.onPressDate}
      />
      {props.isCompletedMode && props.scanState === 'complete' && (
        <View
          style={{
            marginTop: 12,
            marginBottom: 8,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: radius.md,
            backgroundColor: colors.bg.tertiary,
            borderWidth: 1,
            borderColor: colors.border.subtle,
          }}
        >
          <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600', marginBottom: 4 }}>
            {UI_COPY.scorecardImport.reviewCardTitle}
          </Text>
          <Text style={{ color: colors.text.secondary, fontSize: 12, lineHeight: 16 }}>
            {UI_COPY.scorecardImport.reviewCardBody}
          </Text>
        </View>
      )}
      {props.isCompletedMode && props.roundSummary && (
        <RoundSummaryCard
          summary={props.roundSummary}
          showAdvancedStats={
            props.isPremium ||
            (props.roundSummary.fairwaysPossible > 0 || props.roundSummary.greensPossible > 0)
          }
          showAdvancedDataHint={
            !props.isPremium &&
            (props.roundSummary.fairwaysPossible > 0 || props.roundSummary.greensPossible > 0)
          }
        />
      )}
    </>
  );
};
