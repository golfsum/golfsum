import React from 'react';
import { Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AveragesTab } from '../components/AveragesTab';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { CoachingNudgeCarousel } from '../components/CoachingNudgeCarousel';
import { CourseAnalyticsScreen } from '../components/CourseAnalyticsScreen';
import { CourseSearchScreen } from '../components/CourseSearchScreen';
import { HistoryTab } from '../components/HistoryTab';
import { InsightsTab } from '../components/InsightsTab';
import { HandicapSparkLine } from '../components/HandicapSparkLine';
import { ManualScoreEntry } from '../components/ManualScoreEntry';
import { ProfileTab } from '../components/ProfileTab';
import { RoundAnalysisScreen } from '../components/RoundAnalysisScreen';
import RoundDetailScreen from '../components/RoundDetailScreen';
import { ScorecardImportScreen } from '../components/ScorecardImportScreen';
import { ScorecardViewer } from '../components/ScorecardViewer';
import { ProUpgradeScreen } from '../screens/ProUpgradeScreen';

import { clearInProgressRound, InProgressRoundDraft } from '../services/inProgressRoundService';
import { OSMGolfCourse } from '../services/openStreetMapService';
import { CourseDetails } from '../services/golfCourseApiService';
import { PendingGpsRoundData, SavedRound, ScorecardResult, TabName, WeatherData } from '../types';
import { PersonalBest } from '../services/personalBestService';
import { UI_COPY } from '../constants/uiCopy';
import { appStyles as styles } from './appStyles';
import { AppScreen } from './appTypes';
import { UpgradeTrigger } from '../components/UpgradeSheet';
import { logger } from '../utils/logger';
import { MilestoneEvent } from '../services/milestoneDetector';
import { getCurrentUser } from '../services/firebaseAuthService';
import { NativeCoursePlanningScreen, NativeGpsRoundReviewScreen } from './nativeScreens';
import { GpsRoundReviewScreen } from '../screens/GpsRoundReviewScreen';

type AppMainContentProps = {
  currentScreen: AppScreen;
  activeTab: TabName;
  selectedRound: SavedRound | null;
  selectedCourseId: string | null;
  selectedCourseData: CourseDetails | null;
  selectedScorecard: ScorecardResult | null;
  selectedCourseName: string | null;
  rounds: SavedRound[];
  handicapIndex: number | null;
  inProgressRound: InProgressRoundDraft | null;
  isOffline: boolean;
  refreshTrigger: number;
  personalBests: PersonalBest[];
  milestoneEvent: MilestoneEvent | null;
  upgradeTrigger: UpgradeTrigger;
  scorecardCourseSeed: OSMGolfCourse | null;
  scorecardImportMode: 'course' | 'completed';
  quickStartSettings: { teeName?: string; startingHole?: number; endingHole?: number; roundLength?: '18' | 'front9' | 'back9'; routeHoleNumbers?: number[]; routeLabel?: string };
  resumeDraft: InProgressRoundDraft | null;
  pendingGpsRoundData: PendingGpsRoundData | null;
  onSetActiveTab: (tab: TabName) => void;
  onSetCurrentScreen: (screen: AppScreen) => void;
  onSetSelectedCourseData: (course: CourseDetails) => void;
  onSetSelectedCourseId: (courseId: string) => void;
  onSetSelectedRound: (round: SavedRound) => void;
  onSetRefreshTrigger: (updater: (current: number) => number) => void;
  onSetPersonalBests: (bests: PersonalBest[]) => void;
  onDismissMilestone: () => void;
  onSetInProgressRound: (value: InProgressRoundDraft | null) => void;
  onSetResumeDraft: (value: InProgressRoundDraft | null) => void;
  onCourseSelected: (courseId: string) => void;
  onBack: () => void;
  onUploadScorecard: (courseSeed?: OSMGolfCourse) => void;
  onCommunityCourseSelected: (course: CourseDetails) => void;
  onQuickStart: (courseId: string, teeName?: string) => void;
  onResumeRound: (draft: InProgressRoundDraft) => void;
  isNewRound?: boolean;
  onClearNewRound?: () => void;
  onRoundSaved: (round: SavedRound) => void;
  onCourseStatsPress: (courseName: string) => void;
  onRoundPress: (round: SavedRound) => void;
  onPlayAgain: (round: SavedRound) => void;
  onStartNewRound: () => void;
  onImportCompletedScorecard: () => void;
  onUpgrade: (source: UpgradeTrigger) => void;
  onSyncSubscriptionEntitlement: () => Promise<void>;
  gpsRoundCourse: {
    courseId: string;
    courseName?: string;
    teeColor?: string;
    startingHole?: number;
    endingHole?: number;
    roundLength?: '18' | 'front9' | 'back9';
    routeHoleNumbers?: number[];
    routeLabel?: string;
    tournamentMode?: boolean;
  } | null;
  onStartGpsRound: (
    courseId: string,
    courseName?: string,
    settings?: { teeName?: string; startingHole?: number; endingHole?: number; roundLength?: '18' | 'front9' | 'back9'; tournamentMode?: boolean; routeHoleNumbers?: number[]; routeLabel?: string }
  ) => void;
  onFinishGpsRound: (data: PendingGpsRoundData) => void;
  planningCourse: { courseId: string; courseName?: string; teeColor?: string; latitude?: number; longitude?: number } | null;
  onStartPlanning: (courseId: string, courseName?: string, teeColor?: string, latitude?: number, longitude?: number) => void;
};

export function AppMainContent(props: AppMainContentProps): React.ReactNode {
  const showCourseSearch = props.currentScreen === 'course-search';

  if (props.currentScreen === 'course-search' || props.currentScreen === 'score-entry') {
    return (
      <>
        <View style={{ display: showCourseSearch ? 'flex' : 'none', flex: 1 }}>
          <CourseSearchScreen
            onCourseSelected={props.onCourseSelected}
            onGpsRoundStart={props.onStartGpsRound}
            onPlanCourse={props.onStartPlanning}
            onBack={props.onBack}
            onUploadScorecard={props.onUploadScorecard}
            onCommunityCourseSelected={props.onCommunityCourseSelected}
            onQuickStart={props.onQuickStart}
            inProgressRound={props.inProgressRound}
            onResumeRound={props.onResumeRound}
            onAbandonRound={async () => {
              await clearInProgressRound();
              props.onSetInProgressRound(null);
              props.onSetResumeDraft(null);
            }}
            isOffline={props.isOffline}
          />
        </View>

        {props.currentScreen === 'score-entry' && props.selectedCourseId && (
          <View style={{ flex: 1 }}>
            <ManualScoreEntry
              courseId={props.selectedCourseId}
              courseOverride={props.selectedCourseData || props.pendingGpsRoundData?.courseOverride || undefined}
              onBack={props.onBack}
              onRoundSaved={props.onRoundSaved}
              quickStart={props.quickStartSettings}
              resumeDraft={props.resumeDraft}
              gpsRoundData={props.pendingGpsRoundData}
              onNavigateToProfile={() => props.onUpgrade('score_entry_lock')}
            />
          </View>
        )}
      </>
    );
  }

  if (props.currentScreen === 'scorecard-import') {
    return (
      <ScorecardImportScreen
        onBack={props.onBack}
        courseSeed={props.scorecardCourseSeed || undefined}
        mode={props.scorecardImportMode}
        onCourseReady={(course) => {
          props.onSetSelectedCourseData(course);
          props.onSetSelectedCourseId(course.id);
          props.onSetCurrentScreen('score-entry');
        }}
        onRoundSaved={props.onRoundSaved}
        onNavigateToProfile={() => props.onUpgrade('scorecard_import')}
      />
    );
  }

  if (props.currentScreen === 'round-detail' && props.selectedRound) {
    logger.debug('🎬 Rendering RoundDetailScreen');
    return (
      <RoundDetailScreen
        round={props.selectedRound}
        onBack={() => {
          props.onClearNewRound?.();
          props.onBack();
        }}
        onPlayAgain={() => props.onPlayAgain(props.selectedRound!)}
        onReviewShots={() => props.onSetCurrentScreen('gps-round-review')}
        isNewRound={props.isNewRound || false}
        allRounds={props.rounds}
      />
    );
  }

  if (props.currentScreen === 'gps-round-review' && props.selectedRound) {
    if (Platform.OS === 'web' || !NativeGpsRoundReviewScreen) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f1419' }}>
          <Text style={{ color: '#9CA3AF', fontSize: 14, textAlign: 'center' }}>
            Shot review requires a native device.
          </Text>
          <TouchableOpacity onPress={props.onBack} style={{ marginTop: 12, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, backgroundColor: '#1E293B' }}>
            <Text style={{ color: '#E5E7EB', fontSize: 14, fontWeight: '600' }}>Back</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <NativeGpsRoundReviewScreen
        round={props.selectedRound}
        onBack={() => props.onSetCurrentScreen('round-detail')}
      />
    );
  }

  if (props.currentScreen === 'gps-round-summary' && props.selectedRound) {
    return (
      <GpsRoundReviewScreen
        round={props.selectedRound}
        courseData={undefined}
        onBack={() => props.onSetCurrentScreen('tabs')}
      />
    );
  }

  if (props.currentScreen === 'scorecard-view' && props.selectedScorecard) {
    return <ScorecardViewer result={props.selectedScorecard} onBack={props.onBack} />;
  }

  if (props.currentScreen === 'course-analytics' && props.selectedCourseName) {
    return (
      <CourseAnalyticsScreen
        courseName={props.selectedCourseName}
        onBack={props.onBack}
        onSelectRound={props.onRoundPress}
      />
    );
  }

  if (props.currentScreen === 'pro-upgrade') {
    return (
      <ProUpgradeScreen
        source={props.upgradeTrigger}
        onBack={props.onBack}
        onPurchased={async () => {
          await props.onSyncSubscriptionEntitlement();
          props.onSetRefreshTrigger(prev => prev + 1);
        }}
      />
    );
  }

  if (props.currentScreen === 'course-planning' && props.planningCourse) {
    if (Platform.OS === 'web' || !NativeCoursePlanningScreen) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f1419' }}>
          <Text style={{ color: '#9CA3AF', fontSize: 14, textAlign: 'center' }}>
            Course planning requires a native device.
          </Text>
          <TouchableOpacity onPress={props.onBack} style={{ marginTop: 12, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, backgroundColor: '#1E293B' }}>
            <Text style={{ color: '#E5E7EB', fontSize: 14, fontWeight: '600' }}>Back</Text>
          </TouchableOpacity>
        </View>
      );
    }
    const uid = getCurrentUser()?.uid || null;
    return (
      <NativeCoursePlanningScreen
        courseId={props.planningCourse.courseId}
        courseName={props.planningCourse.courseName}
        teeColor={props.planningCourse.teeColor}
        uid={uid}
        latitude={props.planningCourse.latitude}
        longitude={props.planningCourse.longitude}
        onBack={props.onBack}
        onStartGpsRound={(cId, cName, tee) => {
          props.onStartGpsRound(cId, cName, { teeName: tee });
        }}
      />
    );
  }

  // GPS round is now rendered as a full-screen absolute overlay in AppRoot.tsx

  switch (props.activeTab) {
    case 'averages':
      return (
        <ErrorBoundary>
          <AveragesTab
            refreshTrigger={props.refreshTrigger}
            onNavigateToInsights={() => props.onSetActiveTab('insights')}
            onNavigateToPlay={() => props.onSetActiveTab('upload')}
            onNavigateToCourseStats={props.onCourseStatsPress}
            onImportScorecard={props.onImportCompletedScorecard}
            onNavigateToProfile={() => props.onUpgrade('averages_tab')}
          />
        </ErrorBoundary>
      );
    case 'history':
      return (
        <HistoryTab
          onSelectRound={props.onRoundPress}
          refreshTrigger={props.refreshTrigger}
          onDataChanged={() => props.onSetRefreshTrigger(prev => prev + 1)}
          onScanScorecard={props.onImportCompletedScorecard}
          onManualEntry={props.onStartNewRound}
          onPlayAgain={props.onPlayAgain}
          onViewCourseStats={props.onCourseStatsPress}
        />
      );
    case 'upload': {
      const currentWeatherForNudge: Partial<WeatherData> | null = (() => {
        const recent = props.rounds
          .filter(round => !!round.weather?.temp)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        if (!recent?.weather) return null;
        const roundDate = recent.date instanceof Date ? recent.date : new Date(recent.date);
        const hoursSince = (Date.now() - roundDate.getTime()) / 3_600_000;
        return hoursSince <= 36 ? recent.weather : null;
      })();

      return (
        <View style={styles.uploadTab}>
          <ScrollView
            contentContainerStyle={styles.uploadScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.uploadContent}>
              <CoachingNudgeCarousel
                rounds={props.rounds}
                plannedCourseName={props.inProgressRound?.courseName || null}
                currentWeather={currentWeatherForNudge}
                onStartRound={props.onStartNewRound}
                onImportScorecard={props.onImportCompletedScorecard}
              />
              {props.rounds.length >= 3 && props.handicapIndex !== null && (
                <HandicapSparkLine rounds={props.rounds} handicap={props.handicapIndex} />
              )}

              <Text style={styles.uploadTitle}>{UI_COPY.actions.startNewRound}</Text>
              <Text style={styles.uploadDescription}>
                Enter your scores manually with professional{'\n'}
                course data, yardages, and ratings.
              </Text>
              {props.isOffline && (
                <View style={styles.offlineRoundBanner}>
                  <Text style={styles.offlineRoundBannerText}>
                    Offline mode — your round is saved locally
                  </Text>
                </View>
              )}

              {props.inProgressRound && (
                <View style={styles.resumeBanner}>
                  <View style={styles.resumeBannerText}>
                    <Text style={styles.resumeBannerTitle}>Resume Round</Text>
                    <Text style={styles.resumeBannerSubtitle}>
                      {props.inProgressRound.courseName} · Hole {(props.inProgressRound.currentHole ?? 0) + 1} of 18
                    </Text>
                  </View>
                  <View style={styles.resumeBannerActions}>
                    <TouchableOpacity
                      style={styles.resumeBannerSecondary}
                      onPress={async () => {
                        await clearInProgressRound();
                        props.onSetInProgressRound(null);
                        props.onSetResumeDraft(null);
                      }}
                    >
                      <Text style={styles.resumeBannerSecondaryText}>Start New</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.resumeBannerPrimary}
                      onPress={() => props.inProgressRound && props.onResumeRound(props.inProgressRound)}
                    >
                      <Text style={styles.resumeBannerPrimaryText}>Resume Round</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={styles.startButton}
                onPress={props.onStartNewRound}
              >
                <Ionicons name="add-circle" size={22} color="#0f1419" />
                <Text style={styles.startButtonText}>Start New Round</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.importScorecardButton}
                onPress={props.onImportCompletedScorecard}
              >
                <Ionicons name="scan" size={22} color="#10B981" />
                <Text style={styles.importScorecardText}>{UI_COPY.actions.importScorecards}</Text>
              </TouchableOpacity>
              <Text style={styles.importHint}>
                Already have scorecards? Import 3 rounds and your stats will show here.
              </Text>

              {props.rounds.length === 0 ? (
                <View style={styles.featuresList}>
                  <View style={styles.featureItem}>
                    <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                    <Text style={styles.featureText}>42,000 Courses Worldwide</Text>
                  </View>
                  <View style={styles.featureItem}>
                    <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                    <Text style={styles.featureText}>GPS scoring with live yardages</Text>
                  </View>
                  <View style={styles.featureItem}>
                    <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                    <Text style={styles.featureText}>Directional miss tracking</Text>
                  </View>
                  <View style={styles.featureItem}>
                    <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                    <Text style={styles.featureText}>Scan scorecards to import instantly</Text>
                  </View>
                  <View style={styles.featureItem}>
                    <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                    <Text style={styles.featureText}>GolfSum Player Rating calculation</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.roundsAlreadyCard}>
                  <Text style={styles.roundsAlreadyText}>You already have rounds. Start a new one or review history.</Text>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      );
    }
    case 'insights':
      return (
        <InsightsTab
          refreshTrigger={props.refreshTrigger}
          onNavigateToPlay={() => props.onSetActiveTab('upload')}
          onNavigateToProfile={() => props.onUpgrade('insights_card')}
          onImportScorecard={props.onImportCompletedScorecard}
        />
      );
    case 'profile':
      return (
        <ProfileTab
          onAuthChange={(user) => {
            logger.debug('Auth changed:', user?.email || 'signed out');
          }}
          onNavigateToAverages={() => props.onSetActiveTab('averages')}
          onNavigateToPlay={() => props.onSetActiveTab('upload')}
          onNavigateToRoundDetail={props.onRoundPress}
          onOpenUpgrade={(source) => props.onUpgrade((source as UpgradeTrigger) || 'profile')}
          isActive={props.currentScreen === 'tabs' && props.activeTab === 'profile'}
          suppressReportPopup={props.currentScreen !== 'tabs'}
        />
      );
    default:
      return null;
  }
}
