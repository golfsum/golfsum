import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatCourseName } from '../../utils/courseName';
import type { GolfCourse } from '../../services/golfCourseApiService';

interface PreferencesSectionProps {
  expanded: boolean;
  distanceUnit: 'yards' | 'meters';
  dateFormat: string;
  defaultTee: string;
  homeCourseName: string;
  favoriteCourses: GolfCourse[];
  onToggle: () => void;
  onDistanceChange: (value: 'yards' | 'meters') => void;
  onDateFormatChange: (value: string) => void;
  onDefaultTeeChange: (value: string) => void;
  onHomeCourseChange: (value: string) => void;
  styles: any;
}

export const PreferencesSection: React.FC<PreferencesSectionProps> = ({
  expanded,
  distanceUnit,
  dateFormat,
  defaultTee,
  homeCourseName,
  favoriteCourses,
  onToggle,
  onDistanceChange,
  onDateFormatChange,
  onDefaultTeeChange,
  onHomeCourseChange,
  styles,
}) => (
  <View style={styles.section}>
    <TouchableOpacity style={styles.sectionHeader} onPress={onToggle}>
      <View style={styles.headerLeft}>
        <Ionicons name="settings" size={20} color="#10B981" />
        <Text style={styles.sectionTitle}>PREFERENCES</Text>
      </View>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color="#6B7280" />
    </TouchableOpacity>
    {expanded && (
      <View style={styles.sectionContent}>
        <View style={styles.preferenceItem}>
          <Text style={styles.preferenceLabel}>Distance Units</Text>
          <View style={styles.segmentedControl}>
            <TouchableOpacity
              style={[styles.segmentButton, distanceUnit === 'yards' && styles.segmentButtonActive]}
              onPress={() => onDistanceChange('yards')}
            >
              <Text style={[styles.segmentText, distanceUnit === 'yards' && styles.segmentTextActive]}>Yards</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentButton, distanceUnit === 'meters' && styles.segmentButtonActive]}
              onPress={() => onDistanceChange('meters')}
            >
              <Text style={[styles.segmentText, distanceUnit === 'meters' && styles.segmentTextActive]}>Meters</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.preferenceItem}>
          <View style={styles.preferenceRow}>
            <Text style={styles.preferenceLabel}>Date Format</Text>
            <Text style={styles.preferenceValue}>
              {dateFormat === 'auto' ? 'Auto' : dateFormat}
            </Text>
          </View>
          <View style={styles.segmentedControl}>
            {['auto', 'MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'].map((format) => (
              <TouchableOpacity
                key={format}
                style={[styles.segmentButton, dateFormat === format && styles.segmentButtonActive]}
                onPress={() => onDateFormatChange(format)}
              >
                <Text style={[styles.segmentText, dateFormat === format && styles.segmentTextActive]}>
                  {format === 'auto' ? 'Auto' : format}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.preferenceHint}>Auto uses device settings</Text>
        </View>
        <View style={styles.preferenceItem}>
          <Text style={styles.preferenceLabel}>Default Tees</Text>
          <View style={styles.segmentedControl}>
            {[
              { value: 'Always Ask', label: 'Ask' },
              { value: 'Black', label: 'Black' },
              { value: 'Blue', label: 'Blue' },
              { value: 'White', label: 'White' },
              { value: 'Gold', label: 'Gold' },
              { value: 'Red', label: 'Red' },
              { value: 'Green', label: 'Green' },
            ].map((tee) => (
              <TouchableOpacity
                key={tee.value}
                style={[styles.segmentButton, defaultTee === tee.value && styles.segmentButtonActive]}
                onPress={() => onDefaultTeeChange(tee.value)}
              >
                <Text style={[styles.segmentText, defaultTee === tee.value && styles.segmentTextActive]}>
                  {tee.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.preferenceHint}>Pre-selects matching tees when available</Text>
        </View>
        <View style={styles.preferenceItem}>
          <View style={styles.preferenceRow}>
            <Text style={styles.preferenceLabel}>Home Course</Text>
            <Text style={styles.preferenceValue}>
              {homeCourseName ? formatCourseName(homeCourseName) : 'Not set'}
            </Text>
          </View>
          {favoriteCourses.length > 0 ? (
            <View style={styles.homeCourseChips}>
              {favoriteCourses.map((course) => {
                const active = course.name === homeCourseName;
                return (
                  <TouchableOpacity
                    key={course.id}
                    style={[styles.homeCourseChip, active && styles.homeCourseChipActive]}
                    onPress={() => onHomeCourseChange(course.name)}
                  >
                    <Text style={[styles.homeCourseChipText, active && styles.homeCourseChipTextActive]}>
                      {formatCourseName(course.name)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <Text style={styles.preferenceHint}>
              Home course auto-fills from your most-played course. Favorite a course to override it.
            </Text>
          )}
          {homeCourseName ? (
            <TouchableOpacity
              style={styles.homeCourseClear}
              onPress={() => onHomeCourseChange('')}
            >
              <Ionicons name="close-circle" size={16} color="#6B7280" />
              <Text style={styles.homeCourseClearText}>Clear Home Course</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    )}
  </View>
);
