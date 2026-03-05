import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { GolfCourse } from '../../services/golfCourseApiService';
import { colors } from '../../theme/tokens';
import { UI_COPY } from '../../constants/uiCopy';
import type { ScorecardImportStyles } from '../ScorecardImportScreen.styles';

interface TeeBoxShape {
  id: string;
  name: string;
  ratingMen: string;
  slopeMen: string;
  ratingWomen: string;
  slopeWomen: string;
}

interface CourseSectionProps {
  styles: ScorecardImportStyles;
  isCompletedMode: boolean;
  hasValidRating: boolean;
  courseSearchQuery: string;
  courseSearchLoading: boolean;
  showCourseSuggestions: boolean;
  courseSearchResults: GolfCourse[];
  city: string;
  state: string;
  country: string;
  roundHoleCount: 9 | 18;
  teeBoxes: TeeBoxShape[];
  activeTeeIndex: number;
  onAddRating: () => void;
  onCourseSearchChange: (value: string) => void;
  onCourseSearchFocus: () => void;
  onFindNearby: () => void;
  onSelectCourseSuggestion: (course: GolfCourse) => void;
  onCityChange: (value: string) => void;
  onStateChange: (value: string) => void;
  onCountryChange: (value: string) => void;
  onRoundHoleCountChange: (value: 9 | 18) => void;
  onSelectTee: (index: number) => void;
  onAddTee: () => void;
  onRemoveTee: () => void;
  onTeeNameChange: (value: string) => void;
  onOpenNumeric: (field: 'ratingMen' | 'slopeMen' | 'ratingWomen' | 'slopeWomen', value: string) => void;
}

export const CourseSection: React.FC<CourseSectionProps> = ({
  styles,
  isCompletedMode,
  hasValidRating,
  courseSearchQuery,
  courseSearchLoading,
  showCourseSuggestions,
  courseSearchResults,
  city,
  state,
  country,
  roundHoleCount,
  teeBoxes,
  activeTeeIndex,
  onAddRating,
  onCourseSearchChange,
  onCourseSearchFocus,
  onFindNearby,
  onSelectCourseSuggestion,
  onCityChange,
  onStateChange,
  onCountryChange,
  onRoundHoleCountChange,
  onSelectTee,
  onAddTee,
  onRemoveTee,
  onTeeNameChange,
  onOpenNumeric,
}) => {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{UI_COPY.scorecardImport.courseDetailsTitle}</Text>
      <TextInput
        style={styles.input}
        placeholder={UI_COPY.scorecardImport.courseNamePlaceholderShort}
        placeholderTextColor={colors.text.tertiary}
        value={courseSearchQuery}
        keyboardAppearance="dark"
        onChangeText={onCourseSearchChange}
        onFocus={onCourseSearchFocus}
        accessibilityLabel="Course name"
      />
      <View style={styles.courseSearchRow}>
        <TouchableOpacity
          style={styles.courseSearchButton}
          onPress={onFindNearby}
          disabled={courseSearchLoading}
          accessibilityRole="button"
          accessibilityLabel="Find nearby courses"
        >
          <Ionicons name="location" size={14} color={colors.brand.primary} />
          <Text style={styles.courseSearchButtonText}>
            {courseSearchLoading ? UI_COPY.scorecardImport.findingNearby : UI_COPY.scorecardImport.findNearby}
          </Text>
        </TouchableOpacity>
        <Text style={styles.courseSearchHint}>{UI_COPY.scorecardImport.searchHint}</Text>
      </View>
      {showCourseSuggestions && courseSearchResults.length > 0 && (
        <View style={styles.courseSuggestions}>
          {courseSearchResults.map((course) => (
            <TouchableOpacity
              key={course.id || course.name}
              style={styles.courseSuggestionItem}
              onPress={() => onSelectCourseSuggestion(course)}
              accessibilityRole="button"
              accessibilityLabel={`Select course ${course.name || 'course'}`}
            >
              <Text style={styles.courseSuggestionName}>
                {course.name}
              </Text>
              <Text style={styles.courseSuggestionMeta}>
                {[course.city, course.state].filter(Boolean).join(', ')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.inputHalf]}
          placeholder={UI_COPY.scorecardImport.cityPlaceholderShort}
          placeholderTextColor={colors.text.tertiary}
          value={city}
          keyboardAppearance="dark"
          onChangeText={onCityChange}
          accessibilityLabel="City"
        />
        <TextInput
          style={[styles.input, styles.inputHalf]}
          placeholder={UI_COPY.scorecardImport.statePlaceholderShort}
          placeholderTextColor={colors.text.tertiary}
          value={state}
          keyboardAppearance="dark"
          onChangeText={onStateChange}
          accessibilityLabel="State"
        />
      </View>
      <TextInput
        style={styles.input}
        placeholder={UI_COPY.scorecardImport.countryPlaceholder}
        placeholderTextColor={colors.text.tertiary}
        value={country}
        keyboardAppearance="dark"
        onChangeText={onCountryChange}
        accessibilityLabel="Country"
      />
      <Text style={styles.sectionTitleAlt}>{UI_COPY.scorecardImport.roundLengthTitle}</Text>
      <View style={styles.nineToggle}>
        <TouchableOpacity
          style={[styles.nineButton, roundHoleCount === 9 && styles.nineButtonActive]}
          onPress={() => onRoundHoleCountChange(9)}
          accessibilityRole="button"
          accessibilityLabel="Select 9 holes"
          accessibilityState={{ selected: roundHoleCount === 9 }}
        >
          <Text style={[styles.nineButtonText, roundHoleCount === 9 && styles.nineButtonTextActive]}>
            {UI_COPY.scorecardImport.holes9}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.nineButton, roundHoleCount === 18 && styles.nineButtonActive]}
          onPress={() => onRoundHoleCountChange(18)}
          accessibilityRole="button"
          accessibilityLabel="Select 18 holes"
          accessibilityState={{ selected: roundHoleCount === 18 }}
        >
          <Text style={[styles.nineButtonText, roundHoleCount === 18 && styles.nineButtonTextActive]}>
            {UI_COPY.scorecardImport.holes18}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitleAlt}>{UI_COPY.scorecardImport.teeBoxesTitle}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.teeTabRow}>
        {teeBoxes.map((tee, index) => (
          <TouchableOpacity
            key={tee.id}
            style={[
              styles.teeTab,
              index === activeTeeIndex && styles.teeTabActive,
            ]}
            onPress={() => onSelectTee(index)}
            accessibilityRole="button"
            accessibilityLabel={`Select tee ${tee.name || `Tee ${index + 1}`}`}
            accessibilityState={{ selected: index === activeTeeIndex }}
          >
            <Text
              style={[
                styles.teeTabText,
                index === activeTeeIndex && styles.teeTabTextActive,
              ]}
            >
              {tee.name || `Tee ${index + 1}`}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={styles.teeTabAdd}
          onPress={onAddTee}
          accessibilityRole="button"
          accessibilityLabel="Add tee box"
        >
          <Ionicons name="add" size={16} color={colors.brand.primary} />
          <Text style={styles.teeTabAddText}>{UI_COPY.scorecardImport.addTee}</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.teeBoxFields}>
        <TextInput
          style={styles.input}
          placeholder={UI_COPY.scorecardImport.teeBoxNamePlaceholder}
          placeholderTextColor={colors.text.tertiary}
          value={teeBoxes[activeTeeIndex]?.name || ''}
          keyboardAppearance="dark"
          onChangeText={onTeeNameChange}
          accessibilityLabel="Tee box name"
        />
        {teeBoxes.length > 1 && (
          <TouchableOpacity
          style={styles.removeTeeButton}
          onPress={onRemoveTee}
          accessibilityRole="button"
          accessibilityLabel="Remove tee box"
        >
          <Ionicons name="trash-outline" size={16} color={colors.semantic.error} />
          <Text style={styles.removeTeeButtonText}>{UI_COPY.scorecardImport.removeTee}</Text>
        </TouchableOpacity>
      )}
      </View>
    </View>
  );
};
