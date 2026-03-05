import React from 'react';
import { View } from 'react-native';
import type { GolfCourse } from '../../services/golfCourseApiService';
import type { EditableTeeBox, ImportSection, InputType, ScanState, ScanStep } from './types';
import type { ScorecardImportStyles } from '../ScorecardImportScreen.styles';
import { PhotoSection } from './PhotoSection';
import { CourseSection } from './CourseSection';
import { YardagesSection } from './YardagesSection';
import type { CardConfigState } from './hooks/useImportScanState';

interface Props {
  showDeferredSections: boolean;
  activeSection: ImportSection;
  styles: ScorecardImportStyles;
  isCompletedMode: boolean;
  hasValidRating: boolean;
  roundHoleCount: 9 | 18;
  scanState: ScanState;
  scanProgress: number;
  scanSteps: ScanStep[];
  hasScanWarnings: boolean;
  isProcessing: boolean;
  scanSide: 'front' | 'back';
  cardConfig: CardConfigState;
  imageUri: string | null;
  backImageUri: string | null;
  courseSearchQuery: string;
  courseSearchLoading: boolean;
  showCourseSuggestions: boolean;
  courseSearchResults: GolfCourse[];
  city: string;
  state: string;
  country: string;
  teeBoxes: EditableTeeBox[];
  activeTeeIndex: number;
  pars: string[];
  hcpMen: string[];
  yardageWidths: { hole: number; par: number; hcp: number; yds: number };
  onSelectImage: () => void;
  onTakePhoto: () => void;
  onChangePhoto: () => void;
  onRunOcr: () => void;
  onEnterManual: () => void;
  onReviewStats: () => void;
  onAddBackSide: () => void;
  onTakeBackPhoto: () => void;
  onSetCoverage: (coverage: CardConfigState['coverage']) => void;
  onSetPlayedFull: (playedFull: boolean) => void;
  onSetRoundHoleCount: (value: 9 | 18) => void;
  onAddRating: () => void;
  onCourseSearchChange: (value: string) => void;
  onCourseSearchFocus: () => void;
  onFindNearby: () => void;
  onSelectCourseSuggestion: (course: GolfCourse) => void;
  onCityChange: (value: string) => void;
  onStateChange: (value: string) => void;
  onCountryChange: (value: string) => void;
  onSelectTee: (index: number) => void;
  onAddTee: () => void;
  onRemoveTee: () => void;
  onTeeNameChange: (value: string) => void;
  onOpenNumeric: (field: InputType, value: string, index?: number) => void;
  onYardageLayout: (width: number) => void;
}

export const DeferredSections: React.FC<Props> = (props) => {
  if (!props.showDeferredSections) {
    return (
      <View style={props.styles.sectionSkeleton}>
        <View style={props.styles.skeletonLine} />
        <View style={props.styles.skeletonLine} />
        <View style={props.styles.skeletonLineShort} />
      </View>
    );
  }

  return (
    <>
      {props.activeSection === 'photo' && (
        <PhotoSection
          styles={props.styles}
          imageUri={props.imageUri}
          backImageUri={props.backImageUri}
          scanState={props.scanState}
          scanProgress={props.scanProgress}
          scanSteps={props.scanSteps}
          hasScanWarnings={props.hasScanWarnings}
          isProcessing={props.isProcessing}
          scanSide={props.scanSide}
          cardConfig={props.cardConfig}
          isCompletedMode={props.isCompletedMode}
          onSelectImage={props.onSelectImage}
          onTakePhoto={props.onTakePhoto}
          onChangePhoto={props.onChangePhoto}
          onRunOcr={props.onRunOcr}
          onEnterManual={props.onEnterManual}
          onReviewStats={props.onReviewStats}
          onAddBackSide={props.onAddBackSide}
          onTakeBackPhoto={props.onTakeBackPhoto}
          onSetCoverage={props.onSetCoverage}
          onSetPlayedFull={props.onSetPlayedFull}
        />
      )}
      {props.activeSection === 'course' && (
        <CourseSection
          styles={props.styles}
          isCompletedMode={props.isCompletedMode}
          hasValidRating={props.hasValidRating}
          courseSearchQuery={props.courseSearchQuery}
          courseSearchLoading={props.courseSearchLoading}
          showCourseSuggestions={props.showCourseSuggestions}
          courseSearchResults={props.courseSearchResults}
          city={props.city}
          state={props.state}
          country={props.country}
          roundHoleCount={props.roundHoleCount}
          teeBoxes={props.teeBoxes}
          activeTeeIndex={props.activeTeeIndex}
          onAddRating={props.onAddRating}
          onCourseSearchChange={props.onCourseSearchChange}
          onCourseSearchFocus={props.onCourseSearchFocus}
          onFindNearby={props.onFindNearby}
          onSelectCourseSuggestion={props.onSelectCourseSuggestion}
          onCityChange={props.onCityChange}
          onStateChange={props.onStateChange}
          onCountryChange={props.onCountryChange}
          onRoundHoleCountChange={props.onSetRoundHoleCount}
          onSelectTee={props.onSelectTee}
          onAddTee={props.onAddTee}
          onRemoveTee={props.onRemoveTee}
          onTeeNameChange={props.onTeeNameChange}
          onOpenNumeric={(field, value) => props.onOpenNumeric(field, value)}
        />
      )}
      {props.activeSection === 'yardages' && (
        <YardagesSection
          styles={props.styles}
          roundHoleCount={props.roundHoleCount}
          pars={props.pars}
          hcpMen={props.hcpMen}
          teeBoxes={props.teeBoxes}
          activeTeeIndex={props.activeTeeIndex}
          yardageWidths={props.yardageWidths}
          onLayout={props.onYardageLayout}
          onOpenNumeric={(field, value, index) => props.onOpenNumeric(field, value, index)}
        />
      )}
    </>
  );
};
