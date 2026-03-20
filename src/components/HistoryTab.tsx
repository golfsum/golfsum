import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  RefreshControl,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SavedRound } from '../types';
import { getRounds, deleteRound, dismissSampleRound } from '../services/roundsService';
import { getHandicapCalculationDetails } from '../services/whsCalculations';
import { RoundCard } from './history/RoundCard';
import { RoundComparisonSheet } from './history/RoundComparisonSheet';
import { logger } from '../utils/logger';
import { colors, spacing, typography, radius } from '../theme/tokens';
import { DatePickerModal } from './scorecard-import/DatePickerModal';
import { UI_COPY } from '../constants/uiCopy';
import { EMPTY_STATE_COPY } from '../constants/emptyStateCopy';
import { FEEDBACK_COPY } from '../constants/feedbackCopy';

interface Props {
  onSelectRound: (round: SavedRound) => void;
  refreshTrigger?: number;
  onDataChanged?: () => void;
  onScanScorecard?: () => void;
  onManualEntry?: () => void;
  onPlayAgain?: (round: SavedRound) => void;
  onViewCourseStats?: (courseName: string) => void;
}

export const HistoryTab: React.FC<Props> = ({
  onSelectRound,
  refreshTrigger,
  onDataChanged,
  onScanScorecard,
  onManualEntry,
  onPlayAgain,
  onViewCourseStats,
}) => {
  const [rounds, setRounds] = useState<SavedRound[]>([]);
  const [filteredRounds, setFilteredRounds] = useState<SavedRound[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [roundToDelete, setRoundToDelete] = useState<SavedRound | null>(null);
  const [roundIdsUsedForHandicap, setRoundIdsUsedForHandicap] = useState<string[]>([]);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  const [compareModalVisible, setCompareModalVisible] = useState(false);
  const [compareLimitHintVisible, setCompareLimitHintVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [eligibilityRound, setEligibilityRound] = useState<SavedRound | null>(null);
  const [dateRangeModalOpen, setDateRangeModalOpen] = useState(false);
  const [dateRangeStart, setDateRangeStart] = useState<Date | null>(null);
  const [dateRangeEnd, setDateRangeEnd] = useState<Date | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [activeDateField, setActiveDateField] = useState<'start' | 'end' | null>(null);
  const [datePickerValue, setDatePickerValue] = useState<Date>(new Date());
  const hasSampleRound = rounds.some(round => round.isSample);

  useEffect(() => {
    loadRounds();
  }, [refreshTrigger]);

  useEffect(() => {
    filterRounds();
  }, [rounds, searchQuery, selectedCourse]);

  const loadRounds = async () => {
    setLoading(true);
    try {
      const allRounds = await getRounds();
      setRounds(allRounds);
      
      // Calculate which rounds are used for player rating
      const handicapDetails = getHandicapCalculationDetails(allRounds);
      setRoundIdsUsedForHandicap(handicapDetails.roundIdsUsed);
    } catch (error) {
      logger.error('Error loading rounds:', error);
    }
    setLoading(false);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadRounds();
    setRefreshing(false);
  }, []);

  const keyExtractor = useCallback((round: SavedRound) => round.id, []);

  const toggleCompareMode = () => {
    setCompareMode(prev => !prev);
    setCompareSelection([]);
    setCompareModalVisible(false);
  };

  const toggleCompareSelection = (roundId: string) => {
    setCompareSelection(prev => {
      if (prev.includes(roundId)) {
        return prev.filter(id => id != roundId);
      }
      if (prev.length >= 4) {
        setCompareLimitHintVisible(true);
        setTimeout(() => setCompareLimitHintVisible(false), 1500);
        return prev;
      }
      return [...prev, roundId];
    });
  };

  const openCompareModal = () => {
    if (compareSelection.length < 2) return;
    setCompareModalVisible(true);
  };

  const closeCompareModal = () => {
    setCompareModalVisible(false);
  };

  const handleDeletePress = (round: SavedRound, e?: any) => {
    if (e) {
      e.stopPropagation();
    }
    setRoundToDelete(round);
    setDeleteModalVisible(true);
  };

  const confirmDelete = async () => {
    if (!roundToDelete) return;
    
    try {
      await deleteRound(roundToDelete.id);
      // Remove from local state
      setRounds(prev => prev.filter(r => r.id !== roundToDelete.id));
      logger.debug('Round deleted:', roundToDelete.id);
      
      // Notify parent to refresh insights/trends
      if (onDataChanged) {
        onDataChanged();
      }
    } catch (error) {
      logger.error('Error deleting round:', error);
    } finally {
      setDeleteModalVisible(false);
      setRoundToDelete(null);
    }
  };

  const cancelDelete = () => {
    setDeleteModalVisible(false);
    setRoundToDelete(null);
  };

  const filterRounds = () => {
    let filtered = [...rounds];
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(r => 
        r.courseName?.toLowerCase().includes(query) ||
        r.notes?.toLowerCase().includes(query) ||
        new Date(r.date).toLocaleDateString().includes(query)
      );
    }
    
    if (selectedCourse) {
      filtered = filtered.filter(r => r.courseName === selectedCourse);
    }

    if (dateRangeStart || dateRangeEnd) {
      const startTime = dateRangeStart ? new Date(dateRangeStart) : null;
      const endTime = dateRangeEnd ? new Date(dateRangeEnd) : null;

      if (startTime) {
        startTime.setHours(0, 0, 0, 0);
      }
      if (endTime) {
        endTime.setHours(23, 59, 59, 999);
      }

      filtered = filtered.filter(r => {
        const roundDate = new Date(r.date).getTime();
        const afterStart = startTime ? roundDate >= startTime.getTime() : true;
        const beforeEnd = endTime ? roundDate <= endTime.getTime() : true;
        return afterStart && beforeEnd;
      });
    }
    
    setFilteredRounds(filtered);
  };

  const handleShareHistory = async () => {
    const roundsToShare = filteredRounds.length > 0 ? filteredRounds : rounds;
    const scoredRounds = roundsToShare.filter(r => typeof r.score === 'number' && r.score > 0);
    const averageScore = scoredRounds.length > 0
      ? (scoredRounds.reduce((sum, r) => sum + r.score, 0) / scoredRounds.length).toFixed(1)
      : '—';
    const bestScore = scoredRounds.length > 0
      ? String(Math.min(...scoredRounds.map(r => r.score)))
      : '—';

    const dateRangeLabel = (() => {
      if (!dateRangeStart && !dateRangeEnd) return null;
      const start = dateRangeStart ? dateRangeStart.toLocaleDateString() : 'Any';
      const end = dateRangeEnd ? dateRangeEnd.toLocaleDateString() : 'Any';
      return `${start} - ${end}`;
    })();

    const recentRounds = roundsToShare.slice(0, 5).map(r => {
      const dateLabel = new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const scoreLabel = typeof r.score === 'number' && r.score > 0 ? String(r.score) : '—';
      return `• ${r.courseName || 'Unknown Course'} | ${dateLabel} | ${scoreLabel}`;
    });

    const message = [
      'GolfSum Round History',
      `Rounds: ${roundsToShare.length}`,
      `Average Score: ${averageScore}`,
      `Best Score: ${bestScore}`,
      dateRangeLabel ? `Date Range: ${dateRangeLabel}` : null,
      '',
      'Recent Rounds:',
      ...recentRounds,
    ].filter(Boolean).join('\n');

    try {
      await Share.share({ message });
    } catch (error) {
      logger.error('Error sharing history:', error);
    }
  };

  const openDatePicker = (field: 'start' | 'end') => {
    setActiveDateField(field);
    const current = field === 'start' ? dateRangeStart : dateRangeEnd;
    setDatePickerValue(current ?? new Date());
    setDatePickerOpen(true);
  };

  const handleDatePickerDone = (selected: Date) => {
    if (activeDateField === 'start') {
      setDateRangeStart(selected);
      if (dateRangeEnd && selected > dateRangeEnd) {
        setDateRangeEnd(selected);
      }
    }
    if (activeDateField === 'end') {
      setDateRangeEnd(selected);
      if (dateRangeStart && selected < dateRangeStart) {
        setDateRangeStart(selected);
      }
    }
    setDatePickerOpen(false);
    setActiveDateField(null);
  };

  const handleDatePickerChange = (event: { type: string; nativeEvent?: { timestamp?: number } }, nextDate?: Date) => {
    if (event.type === 'dismissed') {
      setDatePickerOpen(false);
      setActiveDateField(null);
      return;
    }
    if (nextDate) {
      setDatePickerValue(nextDate);
    }
  };

  const clearDateRange = () => {
    setDateRangeStart(null);
    setDateRangeEnd(null);
    setDateRangeModalOpen(false);
  };

  const buildEligibilityInfo = (round: SavedRound): { title: string; message: string; action?: string } => {
    if (round.isAcceptableForHandicap !== false) {
      return {
        title: 'Rating eligible',
        message: 'This round counts toward your GolfSum Player Rating.',
      };
    }

    if (round.isNineHoleRound && round.needsPairing) {
      return {
        title: 'Needs pairing',
        message:
          'Nine-hole rounds must be paired with another 9-hole round before they count toward your GolfSum Player Rating.',
        action: 'Play another 9-hole round to complete the pair.',
      };
    }

    if (round.isIncomplete) {
      const played = round.holeCount || round.holesPlayed?.length || 0;
      const planned = round.plannedHoles || 18;
      const minRequired = planned <= 9 ? 9 : 10;
      return {
        title: `Incomplete Round: ${played} of ${planned} holes`,
        message:
          `You played ${played} of ${planned} holes. GolfSum requires a minimum of ${minRequired} holes on ${planned <= 9 ? 'a 9' : 'an 18'}-hole course for rating.`,
        action: `Play at least ${minRequired} holes next time to qualify.`,
      };
    }

    if (round.handicapStatus) {
      return {
        title: 'Unrated',
        message: round.handicapStatus,
        action: 'Open the round to review rating details.',
      };
    }

    return {
      title: 'Unrated',
      message:
        'This round is not eligible for player rating calculations.',
      action: 'Edit the round to verify round details.',
    };
  };

  // Calculate overview stats
  const scoredRounds = rounds.filter(r => typeof r.score === 'number' && r.score > 0);
  const stats = {
    totalRounds: rounds.length,
    bestScore: scoredRounds.length > 0 ? Math.min(...scoredRounds.map(r => r.score)) : null,
    avgScore: scoredRounds.length > 0
      ? (scoredRounds.reduce((sum, r) => sum + r.score, 0) / scoredRounds.length).toFixed(1)
      : '—',
    improvement: rounds.length >= 2
      ? (rounds[rounds.length - 1].score - rounds[0].score).toFixed(1)
      : '—',
  };

  // Get unique courses for filter
  const courses = [...new Set(rounds.map(r => r.courseName || 'Unknown Course'))];
  const coursesCounts = courses.map(c => ({
    name: c,
    count: rounds.filter(r => (r.courseName || 'Unknown Course') === c).length
  }));

  // Find best round
  const bestRoundId = rounds.length > 0 
    ? rounds.reduce((best, r) => r.score < best.score ? r : best, rounds[0]).id
    : null;
  const hasActiveFilters = Boolean(searchQuery || selectedCourse || dateRangeStart || dateRangeEnd);

  const renderRoundItem = useCallback(({ item }: { item: SavedRound }) => {
    const rawCourseName = typeof item.courseName === 'string' ? item.courseName.trim() : '';
    const isCourseMissing = rawCourseName.length === 0 || rawCourseName.toLowerCase() === 'test';
    return (
      <RoundCard
        round={item}
        isBest={item.id === bestRoundId}
        isUsedForHandicap={roundIdsUsedForHandicap.includes(item.id)}
        allRounds={rounds}
        onPress={() => onSelectRound(item)}
        onCoursePress={!isCourseMissing && onViewCourseStats ? () => onViewCourseStats(rawCourseName) : undefined}
        onDelete={(e) => handleDeletePress(item, e)}
        onPlayAgain={onPlayAgain ? () => onPlayAgain(item) : undefined}
        compareMode={compareMode}
        compareSelected={compareSelection.includes(item.id)}
        compareDisabled={compareMode && compareSelection.length >= 4 && !compareSelection.includes(item.id)}
        onCompareDisabledPress={() => {
          setCompareLimitHintVisible(true);
          setTimeout(() => setCompareLimitHintVisible(false), 1500);
        }}
        onCompareToggle={() => toggleCompareSelection(item.id)}
        onShowEligibilityInfo={(round) => setEligibilityRound(round)}
        styles={styles}
      />
    );
  }, [
    bestRoundId,
    roundIdsUsedForHandicap,
    rounds,
    onSelectRound,
    onPlayAgain,
    compareMode,
    compareSelection,
    toggleCompareSelection,
    handleDeletePress,
    setEligibilityRound,
    onViewCourseStats,
  ]);

  if (loading) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="hourglass-outline" size={48} color={colors.text.tertiary} />
        <Text style={styles.emptyText}>Loading rounds</Text>
      </View>
    );
  }

  if (rounds.length === 0) {
    return (
      <View style={styles.emptyContainerTop}>
        <Ionicons name="time-outline" size={64} color={colors.brand.primary} />
        <Text style={styles.emptyTitle}>Your Round History</Text>
        <Text style={styles.emptyText}>
          Every round you play or import will appear here.{'\n'}
          Add a few rounds and your stats will show here.
        </Text>
        <View style={styles.emptyActions}>
          <TouchableOpacity
            style={styles.emptyPrimaryButton}
            onPress={() => onScanScorecard?.()}
            disabled={!onScanScorecard}
          >
            <Ionicons name="camera" size={20} color={colors.text.inverse} />
            <Text style={styles.emptyPrimaryButtonText}>Scan Scorecard</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.emptySecondaryButton}
            onPress={() => onManualEntry?.()}
            disabled={!onManualEntry}
          >
            <Ionicons name="create" size={20} color={colors.brand.primary} />
            <Text style={styles.emptySecondaryButtonText}>Manual Entry</Text>
          </TouchableOpacity>
        </View>
        {/* Preview of what populated history looks like */}
        <View style={styles.emptyPreviewCard}>
          <Text style={styles.emptyPreviewTitle}>WHAT SHOWS HERE</Text>
          <View style={styles.emptyPreviewItem}>
            <Ionicons name="golf-outline" size={14} color={colors.text.tertiary} />
            <Text style={styles.emptyPreviewItemText}>Every hole, every stat, every round</Text>
          </View>
          <View style={styles.emptyPreviewItem}>
            <Ionicons name="search-outline" size={14} color={colors.text.tertiary} />
            <Text style={styles.emptyPreviewItemText}>Search and filter your rounds</Text>
          </View>
          <View style={styles.emptyPreviewItem}>
            <Ionicons name="swap-horizontal-outline" size={14} color={colors.text.tertiary} />
            <Text style={styles.emptyPreviewItemText}>Compare rounds side by side</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredRounds}
        keyExtractor={keyExtractor}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={7}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.brand.primary}
            colors={[colors.brand.primary]}
            progressBackgroundColor={colors.bg.secondary}
          />
        }
        ListHeaderComponent={(
          <>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerTop}>
                <View>
                  <Text style={styles.headerTitle}>Round History</Text>
                  <Text style={styles.headerSubtitle}>
                    {stats.totalRounds} rounds played
                  </Text>
                </View>
                <View style={styles.headerActions}>
                  <TouchableOpacity
                    style={[styles.importButton, !onScanScorecard && styles.importButtonDisabled]}
                    onPress={() => onScanScorecard?.()}
                    disabled={!onScanScorecard}
                  >
                    <Ionicons
                      name="camera"
                      size={16}
                      color={onScanScorecard ? colors.text.inverse : colors.text.tertiary}
                    />
                    <Text style={[styles.importButtonText, !onScanScorecard && styles.importButtonTextDisabled]}>
                      Import
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.compareToggle} onPress={toggleCompareMode}>
                    <Ionicons
                      name="git-compare-outline"
                      size={20}
                      color={compareMode ? colors.brand.primary : colors.text.secondary}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.exportButton} onPress={handleShareHistory}>
                    <Ionicons name="download-outline" size={20} color={colors.text.secondary} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Search & Filter */}
              <View style={styles.searchRow}>
                <View style={styles.searchContainer}>
                  <Ionicons name="search" size={18} color={colors.text.tertiary} style={styles.searchIcon} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search by course, date, or notes"
                    placeholderTextColor={colors.text.tertiary}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                </View>
                <TouchableOpacity 
                  style={[styles.filterButton, filterOpen && styles.filterButtonActive]}
                  onPress={() => setFilterOpen(!filterOpen)}
                >
                  <Ionicons
                    name="filter"
                    size={18}
                    color={filterOpen ? colors.brand.primary : colors.text.secondary}
                  />
                  <Text style={[styles.filterButtonText, filterOpen && styles.filterButtonTextActive]}>Filter</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.filterButton} onPress={() => setDateRangeModalOpen(true)}>
                  <Ionicons name="calendar" size={18} color={colors.text.secondary} />
                  <Text style={styles.filterButtonText}>Date Range</Text>
                </TouchableOpacity>
              </View>

              {/* Filter Panel */}
              {filterOpen && (
                <View style={styles.filterPanel}>
                  <Text style={styles.filterTitle}>Course</Text>
                  <TouchableOpacity 
                    style={[styles.filterOption, !selectedCourse && styles.filterOptionActive]}
                    onPress={() => setSelectedCourse(null)}
                  >
                    <Text style={[styles.filterOptionText, !selectedCourse && styles.filterOptionTextActive]}>
                      All Courses
                    </Text>
                  </TouchableOpacity>
                  {coursesCounts.map(c => (
                    <TouchableOpacity 
                      key={c.name}
                      style={[styles.filterOption, selectedCourse === c.name && styles.filterOptionActive]}
                      onPress={() => setSelectedCourse(c.name)}
                    >
                      <Text style={[styles.filterOptionText, selectedCourse === c.name && styles.filterOptionTextActive]}>
                        {c.name} ({c.count})
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {compareMode && (
              <View style={styles.compareBanner}>
                <View>
                  <Text style={styles.compareTitle}>Compare rounds</Text>
                  <Text style={styles.compareSubtitle}>Select 2-4 rounds to compare</Text>
                  {compareLimitHintVisible && (
                    <Text style={styles.compareLimitHint}>Maximum 4 rounds</Text>
                  )}
                </View>
                <TouchableOpacity
                  style={[
                    styles.compareAction,
                    compareSelection.length < 2 && styles.compareActionDisabled,
                  ]}
                  onPress={openCompareModal}
                  disabled={compareSelection.length < 2}
                >
                  <Text style={styles.compareActionText}>Compare ({compareSelection.length})</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
        renderItem={renderRoundItem}
        ListEmptyComponent={(
          <View style={styles.noResults}>
            <Text style={styles.noResultsText}>{EMPTY_STATE_COPY.titles.noRoundsMatchSearch}</Text>
            {hasActiveFilters && (
              <View style={styles.noResultsActions}>
                <TouchableOpacity
                  style={styles.noResultsClearButton}
                  onPress={() => {
                    setSearchQuery('');
                    setSelectedCourse(null);
                    setDateRangeStart(null);
                    setDateRangeEnd(null);
                    setFilterOpen(false);
                  }}
                >
                  <Text style={styles.noResultsClearButtonText}>Clear Filters</Text>
                </TouchableOpacity>
                {onScanScorecard && (
                  <TouchableOpacity style={styles.noResultsImportButton} onPress={onScanScorecard}>
                    <Text style={styles.noResultsImportButtonText}>{UI_COPY.actions.importScorecard}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}
      />
      <RoundComparisonSheet
        visible={compareModalVisible}
        rounds={rounds.filter((r) => compareSelection.includes(r.id))}
        onClose={closeCompareModal}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={cancelDelete}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.deleteModal}>
            <View style={styles.deleteModalIcon}>
              <Ionicons name="trash" size={32} color={colors.semantic.error} />
            </View>
            <Text style={styles.deleteModalTitle}>{FEEDBACK_COPY.modals.deleteRoundTitle}</Text>
            <Text style={styles.deleteModalMessage}>
              Are you sure you want to delete this round from{' '}
              <Text style={styles.deleteModalCourse}>{roundToDelete?.courseName || 'Unknown Course'}</Text>
              {' '}on {roundToDelete ? new Date(roundToDelete.date).toLocaleDateString() : ''}?
            </Text>
            <Text style={styles.deleteModalWarning}>{FEEDBACK_COPY.modals.deleteRoundWarning}</Text>
            <View style={styles.deleteModalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={cancelDelete}>
                <Text style={styles.cancelButtonText}>{FEEDBACK_COPY.actions.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmDeleteButton} onPress={confirmDelete}>
                <Ionicons name="trash" size={16} color={colors.text.inverse} />
                <Text style={styles.confirmDeleteText}>{FEEDBACK_COPY.actions.delete}</Text>
              </TouchableOpacity>
                </View>
              </View>
            </View>

            {hasSampleRound && (
              <View style={styles.sampleBanner}>
                <View style={styles.sampleBannerText}>
                  <Text style={styles.sampleBannerTitle}>Sample data</Text>
                  <Text style={styles.sampleBannerSubtitle}>
                    This is demo content. Play your first round to see your own history.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.sampleBannerAction}
                  onPress={async () => {
                    await dismissSampleRound();
                    await loadRounds();
                  }}
                >
                  <Text style={styles.sampleBannerActionText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            )}
      </Modal>

      <Modal
        visible={eligibilityRound !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEligibilityRound(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.eligibilityModal}>
            <View style={styles.eligibilityHeader}>
              <Ionicons name="information-circle-outline" size={24} color={colors.semantic.warning} />
              <Text style={styles.eligibilityTitle}>
                {eligibilityRound ? buildEligibilityInfo(eligibilityRound).title : 'Not eligible'}
              </Text>
              <TouchableOpacity onPress={() => setEligibilityRound(null)}>
                <Ionicons name="close" size={20} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.eligibilityMessage}>
              {eligibilityRound ? buildEligibilityInfo(eligibilityRound).message : ''}
            </Text>
            {eligibilityRound && buildEligibilityInfo(eligibilityRound).action && (
              <Text style={styles.eligibilityAction}>
                {buildEligibilityInfo(eligibilityRound).action}
              </Text>
            )}
            <TouchableOpacity
              style={styles.eligibilityButton}
              onPress={() => setEligibilityRound(null)}
            >
              <Text style={styles.eligibilityButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={dateRangeModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDateRangeModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.dateRangeModal}>
            <View style={styles.dateRangeHeader}>
              <Text style={styles.dateRangeTitle}>Date Range</Text>
              <TouchableOpacity onPress={() => setDateRangeModalOpen(false)}>
                <Ionicons name="close" size={20} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.dateRangeRow}>
              <TouchableOpacity style={styles.dateRangeInput} onPress={() => openDatePicker('start')}>
                <Text style={styles.dateRangeLabel}>Start</Text>
                <Text style={styles.dateRangeValue}>
                  {dateRangeStart ? dateRangeStart.toLocaleDateString() : 'Any'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dateRangeInput} onPress={() => openDatePicker('end')}>
                <Text style={styles.dateRangeLabel}>End</Text>
                <Text style={styles.dateRangeValue}>
                  {dateRangeEnd ? dateRangeEnd.toLocaleDateString() : 'Any'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.dateRangeActions}>
              <TouchableOpacity style={styles.dateRangeClear} onPress={clearDateRange}>
                <Text style={styles.dateRangeClearText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dateRangeApply} onPress={() => setDateRangeModalOpen(false)}>
                <Text style={styles.dateRangeApplyText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <DatePickerModal
        visible={datePickerOpen}
        date={datePickerValue}
        onChange={handleDatePickerChange}
        onClose={() => {
          setDatePickerOpen(false);
          setActiveDateField(null);
        }}
        onDone={handleDatePickerDone}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg.primary,
    padding: spacing.xxl,
  },
  emptyContainerTop: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    backgroundColor: colors.bg.primary,
    padding: spacing.xxl,
    paddingTop: 40,
  },
  emptyTitle: {
    ...typography.headingLg,
    color: colors.text.primary,
    marginTop: spacing.lg,
  },
  emptyText: {
    ...typography.bodyMd,
    color: colors.text.tertiary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  emptyActions: {
    width: '100%',
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  emptyPrimaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.brand.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
  },
  emptyPrimaryButtonText: {
    ...typography.labelLg,
    color: colors.text.inverse,
  },
  emptySecondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.brand.primaryMuted,
    borderWidth: 1,
    borderColor: colors.brand.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
  },
  emptySecondaryButtonText: {
    ...typography.labelLg,
    color: colors.brand.primary,
  },
  emptyPreviewCard: {
    width: '100%',
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  emptyPreviewTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brand.primary,
    marginBottom: spacing.sm,
  },
  emptyPreviewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 6,
  },
  emptyPreviewItemText: {
    fontSize: 12,
    color: colors.text.secondary,
  },

  // Header
  header: {
    padding: spacing.lg,
    paddingBottom: 0,
  },
  sampleBanner: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sampleBannerText: {
    flex: 1,
  },
  sampleBannerTitle: {
    ...typography.labelMd,
    color: colors.brand.primary,
    marginBottom: 4,
  },
  sampleBannerSubtitle: {
    ...typography.bodySm,
    color: colors.text.secondary,
  },
  sampleBannerAction: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.bg.tertiary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  sampleBannerActionText: {
    ...typography.labelSm,
    color: colors.text.primary,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  headerTitle: {
    ...typography.displaySm,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  headerSubtitle: {
    ...typography.bodySm,
    color: colors.text.secondary,
  },
  exportButton: {
    padding: spacing.sm,
  },

  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.bg.tertiary,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.bg.elevated,
  },
  statBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  statBoxLabel: {
    ...typography.labelSm,
    color: colors.text.secondary,
  },
  statBoxValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text.primary,
  },
  statBoxValueHighlight: {
    color: colors.brand.primary,
  },

  // Search & Filter
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.tertiary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.bg.elevated,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.text.primary,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bg.tertiary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.bg.elevated,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  filterButtonActive: {
    borderColor: colors.brand.primary,
    backgroundColor: colors.brand.primaryMuted,
  },
  filterButtonText: {
    fontSize: 13,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: colors.brand.primary,
  },

  // Filter Panel
  filterPanel: {
    backgroundColor: colors.bg.tertiary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.bg.elevated,
    padding: 16,
    marginBottom: 12,
  },
  filterTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 8,
  },
  filterOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  filterOptionActive: {
    backgroundColor: colors.brand.primaryMuted,
  },
  filterOptionText: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  filterOptionTextActive: {
    color: colors.brand.primary,
    fontWeight: '500',
  },

  // List
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 100,
  },
  noResults: {
    padding: 32,
    alignItems: 'center',
  },
  noResultsText: {
    fontSize: 14,
    color: colors.text.tertiary,
  },
  noResultsActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  noResultsClearButton: {
    backgroundColor: colors.bg.tertiary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  noResultsClearButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  noResultsImportButton: {
    backgroundColor: colors.brand.primaryMuted,
    borderWidth: 1,
    borderColor: colors.brand.primaryBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  noResultsImportButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brand.primary,
  },

  // Round Card
  roundCard: {
    backgroundColor: colors.bg.tertiary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.bg.elevated,
  },
  roundCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  roundCardLeft: {
    flex: 1,
    minWidth: 0,
  },
  roundCardBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    marginBottom: 6,
    flexWrap: 'wrap',
    rowGap: 6,
  },
  roundCardCourse: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
  },
  roundCardCoursePlaceholder: {
    color: colors.text.tertiary,
    fontStyle: 'italic',
  },
  customCourseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: `${colors.semantic.info}33`,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    flexShrink: 0,
  },
  shotgunBadge: {
    backgroundColor: `${colors.semantic.warning}33`,
  },
  nineHoleBadge: {
    backgroundColor: `${colors.semantic.warning}33`,
  },
  incompleteBadge: {
    backgroundColor: `${colors.text.secondary}33`,
  },
  customCourseBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.semantic.info,
  },
  shotgunBadgeText: {
    color: colors.semantic.warning,
  },
  nineHoleBadgeText: {
    color: colors.semantic.warning,
  },
  incompleteBadgeText: {
    color: colors.text.secondary,
  },
  bestBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: `${colors.semantic.warning}33`,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    flexShrink: 0,
  },
  bestBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.semantic.warning,
  },
  whsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: `${colors.brand.primary}33`,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    flexShrink: 0,
  },
  whsBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.brand.primary,
  },
  sampleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: `${colors.brand.primary}22`,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    flexShrink: 0,
  },
  sampleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.brand.primary,
  },
  notEligibleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: `${colors.semantic.warning}33`,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    flexShrink: 0,
  },
  notEligibleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.semantic.warning,
  },
  roundCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: colors.text.tertiary,
  },
  roundCardRight: {
    alignItems: 'flex-end',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  scoreValue: {
    fontSize: 42,
    fontWeight: '800',
    color: colors.text.primary,
    lineHeight: 42,
  },
  scoreDiff: {
    alignItems: 'flex-end',
    marginTop: 4,
  },
  scoreDiffText: {
    fontSize: 14,
    fontWeight: '600',
  },
  scoreDiffLabel: {
    fontSize: 10,
    color: colors.text.tertiary,
  },
  performanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeIcon: {
    fontSize: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Quick Stats Grid
  quickStatsGrid: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.bg.elevated,
    marginBottom: 12,
  },
  statsNotTrackedContainer: {
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.bg.elevated,
    marginBottom: 12,
    alignItems: 'center',
  },
  statsNotTrackedText: {
    fontSize: 13,
    color: colors.text.tertiary,
    fontStyle: 'italic',
  },
  quickStat: {
    flex: 1,
    alignItems: 'center',
  },
  quickStatValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 2,
  },
  quickStatSubValue: {
    fontSize: 10,
    color: colors.text.tertiary,
    marginBottom: 2,
  },
  quickStatLabel: {
    fontSize: 10,
    color: colors.text.tertiary,
  },
  gpsGreenRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: -2,
    marginBottom: 12,
  },
  gpsGreenPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.bg.tertiary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  gpsGreenPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  quickStatScoring: {
    flex: 1,
    alignItems: 'center',
  },
  scoringIcons: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 2,
  },
  birdieText: {
    fontSize: 11,
    color: colors.score.birdie,
  },
  parText: {
    fontSize: 11,
    color: colors.text.secondary,
  },
  bogeyText: {
    fontSize: 11,
    color: colors.semantic.error,
  },

  // Bottom Row
  roundCardBottom: {
    gap: 10,
  },
  notesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  importedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: `${colors.text.secondary}22`,
    borderWidth: 1,
    borderColor: `${colors.text.secondary}44`,
  },
  importedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  notesText: {
    fontSize: 13,
    color: colors.text.secondary,
    fontStyle: 'italic',
    flex: 1,
  },
  notesPlaceholder: {
    fontSize: 13,
    color: colors.text.tertiary,
    fontStyle: 'italic',
  },
  viewDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  playAgainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: `${colors.brand.primary}1F`,
  },
  playAgainText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.brand.primary,
  },
  swipeActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginVertical: 8,
  },
  swipeAction: {
    width: 84,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
  },
  swipePlay: {
    backgroundColor: colors.brand.primary,
  },
  swipeDelete: {
    backgroundColor: colors.semantic.error,
  },
  swipeActionText: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.inverse,
    textAlign: 'center',
  },
  viewDetailsText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.brand.primary,
  },

  // Action Row (delete + view details)
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  actionRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  deleteButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: `${colors.semantic.error}1A`,
  },

  // Delete Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  deleteModal: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.bg.secondary,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.bg.elevated,
  },
  deleteModalIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${colors.semantic.error}26`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  deleteModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 12,
  },
  deleteModalMessage: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  deleteModalCourse: {
    color: colors.text.primary,
    fontWeight: '600',
  },
  deleteModalWarning: {
    fontSize: 12,
    color: colors.semantic.error,
    marginBottom: 24,
  },
  deleteModalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.bg.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  confirmDeleteButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.semantic.error,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmDeleteText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.inverse,
  },
  eligibilityModal: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.bg.secondary,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.bg.elevated,
  },
  dateRangeModal: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.bg.secondary,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.bg.elevated,
  },
  dateRangeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateRangeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  dateRangeRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  dateRangeInput: {
    flex: 1,
    backgroundColor: colors.bg.tertiary,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.bg.elevated,
  },
  dateRangeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.tertiary,
    marginBottom: 6,
  },
  dateRangeValue: {
    fontSize: 14,
    color: colors.text.primary,
  },
  dateRangeActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  dateRangeClear: {
    flex: 1,
    backgroundColor: colors.bg.tertiary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dateRangeClearText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  dateRangeApply: {
    flex: 1,
    backgroundColor: colors.brand.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dateRangeApplyText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.inverse,
  },
  eligibilityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  eligibilityTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  eligibilityMessage: {
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 18,
    marginBottom: 10,
  },
  eligibilityAction: {
    fontSize: 12,
    color: colors.text.tertiary,
    marginBottom: 16,
  },
  eligibilityButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brand.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  eligibilityButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.inverse,
  },

  // Common
  textGreen: {
    color: colors.brand.primary,
  },
  textRed: {
    color: colors.semantic.error,
  },
  textGray: {
    color: colors.text.secondary,
  },

  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: colors.brand.primary,
  },
  importButtonDisabled: {
    backgroundColor: colors.bg.tertiary,
  },
  importButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.inverse,
  },
  importButtonTextDisabled: {
    color: colors.text.tertiary,
  },
  compareToggle: {
    padding: 8,
  },
  compareBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.brand.primaryMuted,
    borderWidth: 1,
    borderColor: colors.brand.primaryBorder,
  },
  compareTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.brand.primary,
    marginBottom: 4,
  },
  compareSubtitle: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  compareLimitHint: {
    marginTop: 4,
    fontSize: 11,
    color: '#F59E0B',
    fontWeight: '600',
  },
  compareAction: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.brand.primary,
  },
  compareActionDisabled: {
    backgroundColor: colors.bg.elevated,
  },
  compareActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.inverse,
  },
  compareCheck: {
    marginTop: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: `${colors.text.primary}1A`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compareCheckSelected: {
    borderColor: colors.brand.primary,
    backgroundColor: colors.brand.primaryMuted,
  },
});
