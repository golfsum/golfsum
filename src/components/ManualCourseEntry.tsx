/**
 * Manual Course Entry - Missing Course Fallback
 * 
 * CORE PRINCIPLE:
 * "Never block a round because a course is missing. Manual entry > OCR for accuracy."
 * 
 * This component implements clean, WHS-safe scorecard entry for courses not in the API.
 * NO OCR. NO GUESSING. Manual entry only.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UserDefinedCourse, RoundHole, CourseSource } from '../types';
import { FEEDBACK_COPY } from '../constants/feedbackCopy';
import { UI_COPY } from '../constants/uiCopy';

interface Props {
  onBack: () => void;
  onCourseCreated: (course: UserDefinedCourse) => void;
}

export const ManualCourseEntry: React.FC<Props> = ({ onBack, onCourseCreated }) => {
  // Step 1: Course Identification
  const [courseName, setCourseName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [teeName, setTeeName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  
  // Step 2: Rating & Slope (optional but critical)
  const [showRatingPrompt, setShowRatingPrompt] = useState(false);
  const [hasRating, setHasRating] = useState<boolean | null>(null);
  const [courseRating, setCourseRating] = useState('');
  const [slopeRating, setSlopeRating] = useState('');

  const sanitizeText = (value: string) =>
    value
      .replace(/<[^>]*>/g, ' ')
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const getSanitizedInputs = () => {
    const safeCourseName = sanitizeText(courseName).slice(0, 80);
    const safeCity = sanitizeText(city).slice(0, 60);
    const safeState = sanitizeText(state).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
    const safeTeeName = sanitizeText(teeName).slice(0, 40);
    return { safeCourseName, safeCity, safeState, safeTeeName };
  };
  
  const handleContinue = () => {
    const { safeCourseName, safeCity, safeState, safeTeeName } = getSanitizedInputs();

    // Validation
    if (!safeCourseName) {
      Alert.alert(FEEDBACK_COPY.alerts.requiredTitle, FEEDBACK_COPY.alerts.requiredCourseNameBody);
      return;
    }
    if (!safeCity || safeState.length !== 2) {
      Alert.alert(FEEDBACK_COPY.alerts.requiredTitle, FEEDBACK_COPY.alerts.requiredCityStateBody);
      return;
    }
    if (!safeTeeName) {
      Alert.alert(FEEDBACK_COPY.alerts.requiredTitle, FEEDBACK_COPY.alerts.requiredTeeNameBody);
      return;
    }
    
    // Show rating/slope prompt
    setShowRatingPrompt(true);
  };
  
  const handleRatingResponse = (hasIt: boolean) => {
    setHasRating(hasIt);
    if (!hasIt) {
      // No rating - create course and proceed
      createCourseWithoutRating();
    }
  };
  
  const createCourseWithoutRating = () => {
    const { safeCourseName, safeCity, safeState, safeTeeName } = getSanitizedInputs();
    const course: UserDefinedCourse = {
      id: `user_course_${Date.now()}`,
      name: safeCourseName,
      city: safeCity,
      state: safeState,
      teeName: safeTeeName,
      isPrivate,
      isRated: false,
      isWHSEligible: false,
      source: CourseSource.USER_DEFINED,
      createdDate: new Date(),
    };
    
    Alert.alert(
      FEEDBACK_COPY.alerts.courseSavedTitle,
      FEEDBACK_COPY.alerts.courseSavedNoHandicapBody,
      [{ text: FEEDBACK_COPY.actions.ok, onPress: () => onCourseCreated(course) }]
    );
  };
  
  const handleSaveWithRating = () => {
    const { safeCourseName, safeCity, safeState, safeTeeName } = getSanitizedInputs();

    // Validate rating and slope
    const rating = parseFloat(courseRating);
    const slope = parseInt(slopeRating, 10);
    
    if (isNaN(rating) || rating < 60 || rating > 80) {
      Alert.alert(FEEDBACK_COPY.alerts.invalidRatingTitle, FEEDBACK_COPY.alerts.invalidRatingRangeBody);
      return;
    }
    
    if (isNaN(slope) || slope < 55 || slope > 155) {
      Alert.alert(FEEDBACK_COPY.alerts.invalidSlopeTitle, FEEDBACK_COPY.alerts.invalidSlopeRangeBody);
      return;
    }
    
    const course: UserDefinedCourse = {
      id: `user_course_${Date.now()}`,
      name: safeCourseName,
      city: safeCity,
      state: safeState,
      teeName: safeTeeName,
      isPrivate,
      isRated: true,
      isWHSEligible: true,
      courseRating: rating,
      slopeRating: slope,
      source: CourseSource.USER_ENTERED_RATING,
      createdDate: new Date(),
    };
    
    onCourseCreated(course);
  };
  
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#E5E7EB" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{UI_COPY.manualCourseEntry.headerTitle}</Text>
        <View style={{ width: 40 }} />
      </View>
      
      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={20} color="#3B82F6" />
          <Text style={styles.infoBannerText}>
            {UI_COPY.manualCourseEntry.infoBanner}
          </Text>
        </View>
        
        {/* Course Identification */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{UI_COPY.manualCourseEntry.sectionTitle}</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{UI_COPY.manualCourseEntry.courseNameLabel}</Text>
            <TextInput
              style={styles.input}
              placeholder={UI_COPY.manualCourseEntry.courseNamePlaceholder}
              placeholderTextColor="#6B7280"
              value={courseName}
              onChangeText={setCourseName}
              autoCapitalize="words"
            />
          </View>
          
          <View style={styles.inputRow}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>{UI_COPY.manualCourseEntry.cityLabel}</Text>
              <TextInput
                style={styles.input}
                placeholder={UI_COPY.manualCourseEntry.cityPlaceholder}
                placeholderTextColor="#6B7280"
                value={city}
                onChangeText={setCity}
                autoCapitalize="words"
              />
            </View>
            
            <View style={[styles.inputGroup, { flex: 1, marginLeft: 12 }]}>
              <Text style={styles.inputLabel}>{UI_COPY.manualCourseEntry.stateLabel}</Text>
              <TextInput
                style={styles.input}
                placeholder={UI_COPY.manualCourseEntry.statePlaceholder}
                placeholderTextColor="#6B7280"
                value={state}
                onChangeText={setState}
                autoCapitalize="characters"
                maxLength={2}
              />
            </View>
          </View>
          
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{UI_COPY.manualCourseEntry.teeNameLabel}</Text>
            <TextInput
              style={styles.input}
              placeholder={UI_COPY.manualCourseEntry.teeNamePlaceholder}
              placeholderTextColor="#6B7280"
              value={teeName}
              onChangeText={setTeeName}
              autoCapitalize="words"
            />
          </View>
          
          <TouchableOpacity 
            style={styles.privateToggle}
            onPress={() => setIsPrivate(!isPrivate)}
          >
            <View style={[styles.checkbox, isPrivate && styles.checkboxActive]}>
              {isPrivate && <Ionicons name="checkmark" size={16} color="#fff" />}
            </View>
            <Text style={styles.privateToggleText}>{UI_COPY.manualCourseEntry.privateCourse}</Text>
          </TouchableOpacity>
        </View>
        
        {/* Warning Box */}
        <View style={styles.warningBox}>
          <Ionicons name="shield-checkmark" size={20} color="#F59E0B" />
          <View style={{ flex: 1 }}>
            <Text style={styles.warningTitle}>{UI_COPY.manualCourseEntry.whsTitle}</Text>
            <Text style={styles.warningText}>
              {UI_COPY.manualCourseEntry.whsBody}
            </Text>
          </View>
        </View>
        
        {/* Continue Button */}
        <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
          <Text style={styles.continueButtonText}>{UI_COPY.manualCourseEntry.continue}</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>
      </ScrollView>
      
      {/* Rating & Slope Prompt Modal */}
      <Modal
        visible={showRatingPrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRatingPrompt(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {hasRating === null ? (
              // Initial Question
              <>
                <Text style={styles.modalTitle}>{UI_COPY.manualCourseEntry.ratingTitle}</Text>
                <Text style={styles.modalText}>
                  {UI_COPY.manualCourseEntry.ratingPrompt.replace('{teeName}', teeName)}
                </Text>
                <Text style={styles.modalHint}>
                  {UI_COPY.manualCourseEntry.ratingHint}
                </Text>
                
                <View style={styles.modalButtons}>
                  <TouchableOpacity 
                    style={[styles.modalButton, styles.modalButtonSecondary]}
                    onPress={() => handleRatingResponse(false)}
                  >
                    <Text style={styles.modalButtonTextSecondary}>{FEEDBACK_COPY.actions.noDontHaveThem}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.modalButton, styles.modalButtonPrimary]}
                    onPress={() => handleRatingResponse(true)}
                  >
                    <Text style={styles.modalButtonTextPrimary}>{FEEDBACK_COPY.actions.yesEnterThem}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              // Rating Entry Form
              <>
                <Text style={styles.modalTitle}>{UI_COPY.manualCourseEntry.enterRatingTitle}</Text>
                
                <View style={styles.ratingInputGroup}>
                  <Text style={styles.ratingLabel}>{UI_COPY.manualCourseEntry.courseRatingLabel}</Text>
                  <TextInput
                    style={styles.ratingInput}
                    placeholder={UI_COPY.manualCourseEntry.courseRatingPlaceholder}
                    placeholderTextColor="#6B7280"
                    value={courseRating}
                    onChangeText={setCourseRating}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.ratingHint}>{UI_COPY.manualCourseEntry.courseRatingRange}</Text>
                </View>
                
                <View style={styles.ratingInputGroup}>
                  <Text style={styles.ratingLabel}>{UI_COPY.manualCourseEntry.slopeRatingLabel}</Text>
                  <TextInput
                    style={styles.ratingInput}
                    placeholder={UI_COPY.manualCourseEntry.slopeRatingPlaceholder}
                    placeholderTextColor="#6B7280"
                    value={slopeRating}
                    onChangeText={setSlopeRating}
                    keyboardType="number-pad"
                  />
                  <Text style={styles.ratingHint}>{UI_COPY.manualCourseEntry.slopeRatingRange}</Text>
                </View>
                
                <View style={styles.disclaimerBox}>
                  <Text style={styles.disclaimerText}>
                    {UI_COPY.manualCourseEntry.disclaimer}
                  </Text>
                </View>
                
                <View style={styles.modalButtons}>
                  <TouchableOpacity 
                    style={[styles.modalButton, styles.modalButtonSecondary]}
                    onPress={() => {
                      setHasRating(null);
                      setShowRatingPrompt(false);
                    }}
                  >
                    <Text style={styles.modalButtonTextSecondary}>{FEEDBACK_COPY.actions.cancel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.modalButton, styles.modalButtonPrimary]}
                    onPress={handleSaveWithRating}
                  >
                    <Text style={styles.modalButtonTextPrimary}>{FEEDBACK_COPY.actions.saveAndContinue}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#1a1f25',
    borderBottomWidth: 1,
    borderBottomColor: '#2a3038',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#E5E7EB',
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 16,
  },
  infoBanner: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    marginBottom: 24,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 14,
    color: '#93C5FD',
    lineHeight: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E5E7EB',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#E5E7EB',
  },
  inputRow: {
    flexDirection: 'row',
  },
  privateToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#6B7280',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  privateToggleText: {
    fontSize: 14,
    color: '#D1D5DB',
  },
  warningBox: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    marginBottom: 24,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FCD34D',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 13,
    color: '#FCD34D',
    lineHeight: 18,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 12,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#E5E7EB',
    marginBottom: 12,
  },
  modalText: {
    fontSize: 15,
    color: '#D1D5DB',
    lineHeight: 22,
    marginBottom: 8,
  },
  modalHint: {
    fontSize: 13,
    color: '#9CA3AF',
    lineHeight: 18,
    marginBottom: 24,
  },
  modalButtons: {
    gap: 12,
  },
  modalButton: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: '#3B82F6',
  },
  modalButtonSecondary: {
    backgroundColor: '#374151',
  },
  modalButtonTextPrimary: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  modalButtonTextSecondary: {
    fontSize: 15,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  ratingInputGroup: {
    marginBottom: 20,
  },
  ratingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E5E7EB',
    marginBottom: 8,
  },
  ratingInput: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: '#E5E7EB',
  },
  ratingHint: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 6,
  },
  disclaimerBox: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  disclaimerText: {
    fontSize: 12,
    color: '#FCD34D',
    lineHeight: 16,
  },
});
