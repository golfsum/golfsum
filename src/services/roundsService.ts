import { SavedRound, RoundStats, AverageStats, RoundHole, StatState } from '../types';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentUser } from './firebaseAuthService';
import { 
  saveRoundToFirestore, 
  getRoundsFromFirestore, 
  deleteRoundFromFirestore,
  updateRoundInFirestore,
  saveAverageStats,
  getAverageStatsFromFirestore,
} from './userService';
import { 
  uploadScorecardImage, 
  uploadThumbnail, 
  deleteScorecardImage,
  compressImage,
  createThumbnail,
} from './storageService';
import { 
  calculateHandicapIndex as calculateWHSHandicapIndex,
  calculateScoreDifferential,
  updateRoundWithWHSCalculations,
  isRoundAcceptableForHandicap,
  getHandicapCalculationDetails,
} from './whsCalculations';
import { calculateRoundRating, getRoundCoursePar } from './playerRatingService';
import { getElevationFeet } from './weatherService';
import { logger } from '../utils/logger';
import { incrementTrialRound } from './trialService';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { updateCourseStatsAfterRound } = require('./courseStatsService');

const STORAGE_KEY = 'golf_rounds';
const SAMPLE_ROUND_KEY = '@GolfSum:SampleRound';
const SAMPLE_DISMISSED_KEY = '@GolfSum:SampleRoundDismissed';
export const SAMPLE_ROUND_ID = 'sample_round_1';
const HANDICAP_WINDOW = 20; // Last 20 rounds (WHS standard)
const HANDICAP_BEST = 8; // Best 8 of 20 (WHS standard)

const getErrorMessage = (error: unknown): string => {
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message?: unknown }).message;
    return typeof msg === 'string' ? msg : '';
  }
  return '';
};

function shouldCountAsAdvancedTrialRound(round: SavedRound): boolean {
  if (round.isSample) return false;
  const inferredSource: 'manual' | 'import' =
    round.roundSource ?? (round.imageUri ? 'import' : 'manual');
  const hasSavedHole =
    (round.holes?.some(h => h.isSaved || (h.score ?? 0) > 0) ?? false) || round.score > 0;
  return inferredSource === 'manual' && round.entryMode === 'advanced' && hasSavedHole;
}

// Track Firestore availability to reduce error spam
let firestoreAvailable = true;
let firestoreWarningShown = false;

// ── Async mutex for local storage writes ────────────────────────────────────
// Prevents race conditions when concurrent operations (e.g., save + handicap
// flag update) read-then-write the same rounds array.
let _storageLock: Promise<void> = Promise.resolve();

function withStorageLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = _storageLock;
  let releaseLock: () => void;
  _storageLock = new Promise<void>(resolve => { releaseLock = resolve; });

  return prev.then(async () => {
    try {
      return await fn();
    } finally {
      releaseLock!();
    }
  });
}

const buildSampleRounds = (): SavedRound[] => {
  const baseHoles: RoundHole[] = [
    { number: 1, par: 4, score: 4, putts: 2, fairwayHit: true, greenHit: true, teeClub: 'Driver', approachClub: '8i', approachDistance: '125-150' },
    { number: 2, par: 4, score: 5, putts: 1, fairwayHit: 'right', greenHit: 'short', upDown: true, teeClub: 'Driver', approachClub: '7i', approachDistance: '150-175' },
    { number: 3, par: 3, score: 3, putts: 1, greenHit: true, teeClub: '6i', approachClub: '6i', approachDistance: '175-200' },
    { number: 4, par: 5, score: 6, putts: 2, fairwayHit: true, greenHit: 'left', upDown: false, teeClub: 'Driver', approachClub: '4i', approachDistance: '200-225' },
    { number: 5, par: 4, score: 4, putts: 2, fairwayHit: 'left', greenHit: true, teeClub: '3w', approachClub: '9i', approachDistance: '100-125' },
    { number: 6, par: 4, score: 4, putts: 2, fairwayHit: true, greenHit: true, teeClub: 'Driver', approachClub: 'PW', approachDistance: '75-100' },
    { number: 7, par: 3, score: 4, putts: 2, greenHit: 'right', upDown: false, teeClub: '7i', approachClub: '7i', approachDistance: '150-175' },
    { number: 8, par: 5, score: 5, putts: 1, fairwayHit: true, greenHit: true, teeClub: 'Driver', approachClub: '5i', approachDistance: '175-200' },
    { number: 9, par: 4, score: 5, putts: 2, fairwayHit: 'right', greenHit: 'short', upDown: true, teeClub: 'Driver', approachClub: '8i', approachDistance: '125-150' },
    { number: 10, par: 4, score: 4, putts: 2, fairwayHit: true, greenHit: true, teeClub: 'Driver', approachClub: '9i', approachDistance: '100-125' },
    { number: 11, par: 5, score: 5, putts: 2, fairwayHit: 'left', greenHit: 'left', upDown: true, teeClub: 'Driver', approachClub: '5i', approachDistance: '175-200' },
    { number: 12, par: 3, score: 3, putts: 1, greenHit: true, teeClub: '8i', approachClub: '8i', approachDistance: '125-150' },
    { number: 13, par: 4, score: 5, putts: 2, fairwayHit: true, greenHit: 'right', upDown: false, teeClub: 'Driver', approachClub: '7i', approachDistance: '150-175' },
    { number: 14, par: 4, score: 4, putts: 2, fairwayHit: 'right', greenHit: true, teeClub: '3w', approachClub: 'PW', approachDistance: '75-100' },
    { number: 15, par: 3, score: 3, putts: 1, greenHit: true, teeClub: '9i', approachClub: '9i', approachDistance: '100-125' },
    { number: 16, par: 5, score: 6, putts: 2, fairwayHit: true, greenHit: 'long', upDown: false, teeClub: 'Driver', approachClub: '4i', approachDistance: '200-225' },
    { number: 17, par: 4, score: 4, putts: 2, fairwayHit: 'left', greenHit: true, teeClub: 'Driver', approachClub: '8i', approachDistance: '125-150' },
    { number: 18, par: 4, score: 4, putts: 2, fairwayHit: true, greenHit: true, teeClub: 'Driver', approachClub: '9i', approachDistance: '100-125' },
  ];
  const yardages = [420, 402, 176, 528, 410, 382, 189, 540, 401, 410, 512, 176, 418, 392, 158, 545, 405, 398];
  const baseDate = new Date();
  const samples = [
    {
      id: SAMPLE_ROUND_ID,
      courseName: 'Pebble Beach GL',
      courseId: 'sample_pebble_beach',
      city: 'Pebble Beach',
      state: 'CA',
      score: 82,
      putts: 33,
      fairways: 8,
      greens: 9,
      upDownMade: 3,
      upDownAttempts: 7,
      daysAgo: 3,
    },
    {
      id: 'sample_round_2',
      courseName: 'TPC San Antonio GC',
      courseId: 'sample_tpc_san_antonio',
      city: 'San Antonio',
      state: 'TX',
      score: 84,
      putts: 34,
      fairways: 7,
      greens: 8,
      upDownMade: 2,
      upDownAttempts: 7,
      daysAgo: 2,
    },
    {
      id: 'sample_round_3',
      courseName: 'Bethpage Black GC',
      courseId: 'sample_bethpage_black',
      city: 'Farmingdale',
      state: 'NY',
      score: 81,
      putts: 32,
      fairways: 9,
      greens: 10,
      upDownMade: 4,
      upDownAttempts: 6,
      daysAgo: 1,
    },
  ];

  return samples.map((sample) => {
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() - sample.daysAgo);
    const holes = baseHoles.map((hole) => ({ ...hole }));
    return {
      id: sample.id,
      date,
      courseName: sample.courseName,
      courseId: sample.courseId,
      score: sample.score,
      stats: {
        score: sample.score,
        putts: sample.putts,
        fairways: sample.fairways,
        fairwaysPossible: 14,
        greens: sample.greens,
        greensPossible: 18,
        upDownMade: sample.upDownMade,
        upDownAttempts: sample.upDownAttempts,
        teeBox: 'Blue',
      },
      html: '',
      imageUri: '',
      isAcceptableForHandicap: false,
      handicapStatus: 'Sample data',
      teeName: 'Blue',
      weather: {
        temp: '76F',
        conditions: 'Clear',
        wind: 'Light',
      },
      holes,
      holeCount: 18,
      courseSnapshot: {
        courseId: sample.courseId,
        name: sample.courseName,
        location: {
          city: sample.city,
          state: sample.state,
          country: 'USA',
          latitude: 33.3943,
          longitude: -111.984,
        },
        holesCount: 18,
        tee: {
          name: 'Blue',
          yardageTotal: 6704,
        },
        holes: holes.map((hole, idx) => ({
          number: hole.number,
          par: hole.par,
          yardage: yardages[idx],
          handicapIndex: idx + 1,
        })),
      },
      notes: 'Sample Round',
      roundSource: 'manual',
      entryMode: 'advanced',
      isSample: true,
    } as SavedRound;
  });
};

export async function loadSampleRound(): Promise<SavedRound> {
  const samples = buildSampleRounds();
  await setSampleRoundRaw(JSON.stringify(samples));
  await setSampleDismissedFlag(false);
  return samples[0];
}

export async function loadSampleRounds(): Promise<SavedRound[]> {
  const samples = buildSampleRounds();
  await setSampleRoundRaw(JSON.stringify(samples));
  await setSampleDismissedFlag(false);
  return samples;
}

export async function dismissSampleRound(): Promise<void> {
  await removeSampleRoundRaw();
  await setSampleDismissedFlag(true);
}

export async function getSampleRound(): Promise<SavedRound | null> {
  const rounds = await getSampleRounds();
  return rounds[0] ?? null;
}

export async function getSampleRounds(): Promise<SavedRound[]> {
  const dismissed = await getSampleDismissedFlag();
  if (dismissed) return [];
  const raw = await getSampleRoundRaw();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SavedRound | SavedRound[];
    const asArray = Array.isArray(parsed) ? parsed : [parsed];
    return asArray.map((round) => ({ ...round, date: new Date(round.date) }));
  } catch (error) {
    logger.error('Failed to parse sample round:', error);
    return [];
  }
}

// Reset Firestore availability (call after fixing Firebase rules)
export function resetFirestoreConnection() {
  logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.debug('🔄 RESETTING FIRESTORE CONNECTION');
  logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  firestoreAvailable = true;
  firestoreWarningShown = false;
  logger.debug('✅ Firestore connection reset.');
  logger.debug(`   Authenticated: ${isAuthenticated()}`);
  logger.debug('   Try saving a round now.');
  logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// Check if user is authenticated
function isAuthenticated(): boolean {
  return getCurrentUser() !== null;
}

// Show Firestore warning once
function showFirestoreWarning() {
  if (!firestoreWarningShown) {
    logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.warn('⚠️  FIRESTORE PERMISSION DENIED (403)');
    logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.warn('✅ Your rounds ARE being saved locally on this device');
    logger.warn('❌ Cloud sync is disabled until you fix Firebase rules');
    logger.warn('');
    logger.warn('📋 TO FIX:');
    logger.warn('   1. Go to Firebase Console → Firestore → Rules');
    logger.warn('   2. Update security rules (see FIRESTORE_PERMISSION_FIX.md)');
    logger.warn('   3. Click "Publish"');
    logger.warn('   4. Refresh this app');
    logger.warn('');
    logger.warn('📖 See FIRESTORE_PERMISSION_FIX.md for full instructions');
    logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    firestoreWarningShown = true;
    firestoreAvailable = false;
  }
}

// Platform-safe local storage helpers
async function getLocalRoundsRaw(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(STORAGE_KEY);
  }
  return await AsyncStorage.getItem(STORAGE_KEY);
}

async function setLocalRoundsRaw(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(STORAGE_KEY, value);
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEY, value);
}

export async function clearLocalRounds(): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SAMPLE_ROUND_KEY);
    localStorage.removeItem(SAMPLE_DISMISSED_KEY);
    return;
  }
  await AsyncStorage.multiRemove([STORAGE_KEY, SAMPLE_ROUND_KEY, SAMPLE_DISMISSED_KEY]);
}

async function getSampleRoundRaw(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(SAMPLE_ROUND_KEY);
  }
  return await AsyncStorage.getItem(SAMPLE_ROUND_KEY);
}

async function setSampleRoundRaw(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(SAMPLE_ROUND_KEY, value);
    return;
  }
  await AsyncStorage.setItem(SAMPLE_ROUND_KEY, value);
}

async function removeSampleRoundRaw(): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(SAMPLE_ROUND_KEY);
    return;
  }
  await AsyncStorage.removeItem(SAMPLE_ROUND_KEY);
}

async function getSampleDismissedFlag(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(SAMPLE_DISMISSED_KEY) === 'true';
  }
  return (await AsyncStorage.getItem(SAMPLE_DISMISSED_KEY)) === 'true';
}

async function setSampleDismissedFlag(value: boolean): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(SAMPLE_DISMISSED_KEY, value ? 'true' : 'false');
    return;
  }
  await AsyncStorage.setItem(SAMPLE_DISMISSED_KEY, value ? 'true' : 'false');
}

function getStorageLabel(): string {
  return Platform.OS === 'web' ? 'localStorage' : 'AsyncStorage';
}

// Get all saved rounds (from Firestore if authenticated, AsyncStorage/localStorage otherwise)
/**
 * Migrates old rounds to include WHS data if missing
 */
async function migrateRoundsToWHS(rounds: SavedRound[]): Promise<SavedRound[]> {
  let needsMigration = false;
  const roundsNeedingRemoteUpdate: SavedRound[] = [];
  
  const normalizedRounds = rounds.map(round => {
    let normalizedRound = round;

    const inferredHoleCount = normalizedRound.holeCount
      || normalizedRound.holes?.length
      || (normalizedRound.isNineHoleRound ? 9 : normalizedRound.courseSnapshot?.holesCount)
      || undefined;
    if (!normalizedRound.holeCount && inferredHoleCount) {
      normalizedRound = { ...normalizedRound, holeCount: inferredHoleCount };
      needsMigration = true;
    }

    const canRecalcEligibility =
      getRoundCoursePar(normalizedRound) !== null &&
      (normalizedRound.holeCount || normalizedRound.holes?.length);

    // Check if round needs migration
    if (
      (normalizedRound.differential === undefined ||
        normalizedRound.isAcceptableForHandicap === undefined ||
        normalizedRound.adjustedGrossScore === undefined ||
        (normalizedRound.isAcceptableForHandicap === false && canRecalcEligibility)) &&
      getRoundCoursePar(normalizedRound) !== null
    ) {
      needsMigration = true;
      
      // Create holes array if missing (assume par 4 for all holes if we don't have data)
      const holes = normalizedRound.holes || Array.from({ length: 18 }, (_, i) => ({
        number: i + 1,
        par: 4, // Default assumption
        score: Math.round(normalizedRound.score / 18), // Distribute score evenly
      }));
      
      // Apply WHS calculations
      const updatedRound = { ...normalizedRound, holes };
      return updateRoundWithWHSCalculations(updatedRound, 0); // Pass 0 handicap for initial calculation
    }
    
    return normalizedRound;
  });

  const elevationKeyForRound = (round: SavedRound): string | null => {
    const location = round.courseSnapshot?.location;
    if (location?.latitude === undefined || location?.longitude === undefined) return null;
    return `${location.latitude},${location.longitude}`;
  };

  const elevationLookups = new Map<string, { lat: number; lon: number }>();
  normalizedRounds.forEach(round => {
    const location = round.courseSnapshot?.location;
    if (!location || location.elevationFt !== undefined) return;
    if (location.latitude === undefined || location.longitude === undefined) return;
    const key = elevationKeyForRound(round);
    if (key && !elevationLookups.has(key)) {
      elevationLookups.set(key, { lat: location.latitude, lon: location.longitude });
    }
  });

  const elevationCache = new Map<string, number | null>();
  if (elevationLookups.size > 0) {
    await Promise.all(
      Array.from(elevationLookups.entries()).map(async ([key, coords]) => {
        const elevation = await getElevationFeet(coords.lat, coords.lon);
        elevationCache.set(key, elevation);
      })
    );
  }

  const migratedRounds = normalizedRounds.map(round => {
    const key = elevationKeyForRound(round);
    if (!key) return round;
    const location = round.courseSnapshot?.location;
    if (!location || location.elevationFt !== undefined) return round;
    const elevation = elevationCache.get(key);
    if (typeof elevation !== 'number') return round;
    needsMigration = true;
    const updatedRound = {
      ...round,
      courseSnapshot: {
        ...round.courseSnapshot!,
        location: {
          ...location,
          elevationFt: elevation,
        },
      },
    };
    roundsNeedingRemoteUpdate.push(updatedRound);
    return updatedRound;
  });
  
  if (needsMigration) {
    logger.debug('🔄 Migrated rounds to WHS format or course metadata');
    // Save the migrated rounds
    try {
      await setLocalRoundsRaw(JSON.stringify(migratedRounds));
    } catch (error) {
      logger.error('Error saving migrated rounds:', error);
    }

    if (roundsNeedingRemoteUpdate.length > 0 && isAuthenticated() && firestoreAvailable) {
      try {
        await Promise.all(
          roundsNeedingRemoteUpdate.map(round =>
            updateRoundInFirestore(round.id, {
              courseSnapshot: round.courseSnapshot,
            })
          )
        );
        logger.debug(`✅ Backfilled elevation for ${roundsNeedingRemoteUpdate.length} rounds in Firestore`);
      } catch (error) {
        logger.error('Error backfilling elevation to Firestore:', error);
      }
    }
  }
  
  return migratedRounds;
}

export async function getRounds(): Promise<SavedRound[]> {
  // Try Firestore first if authenticated and it's available
  if (isAuthenticated() && firestoreAvailable) {
    try {
      const firestoreRounds = await getRoundsFromFirestore();
      logger.debug(`✓ Loaded ${firestoreRounds.length} rounds from Firestore`);
      const migrated = await migrateRoundsToWHS(firestoreRounds);
      const sorted = migrated.sort((a, b) => b.date.getTime() - a.date.getTime());
      const sampleRounds = await getSampleRounds();
      if (sampleRounds.length > 0 && sorted.length === 0) {
        return sampleRounds;
      }
      if (sampleRounds.length > 0 && sorted.length > 0) {
        await dismissSampleRound();
      }
      return sorted;
  } catch (error: unknown) {
      const message = getErrorMessage(error);
      if (message.includes('403') || message.includes('permission') || message.includes('Failed to fetch')) {
        showFirestoreWarning();
      } else {
        logger.debug('ℹ️ Firestore not available, using local storage');
      }
    }
  }
  
  // Fallback to AsyncStorage (native) or localStorage (web)
  try {
    const data = await getLocalRoundsRaw();
    logger.debug(`📂 Checking ${getStorageLabel()} for key: ${STORAGE_KEY}`);
    if (data) {
      logger.debug(`📂 Found ${getStorageLabel()} data, length: ${data.length} characters`);
    } else {
      logger.debug(`📂 No data found in ${getStorageLabel()}`);
    }
    
    if (!data) {
      logger.debug('📂 No saved rounds found');
      const sampleRounds = await getSampleRounds();
      if (sampleRounds.length > 0) {
        return sampleRounds;
      }
      return [];
    }
    
    const rounds = JSON.parse(data) as SavedRound[];
    logger.debug(`✅ Loaded ${rounds.length} rounds from ${getStorageLabel()}`);
    
    // Convert date strings back to Date objects
    const roundsWithDates = rounds.map(r => ({
      ...r,
      date: new Date(r.date)
    }));
    
    // Migrate rounds to WHS if needed
    const migrated = await migrateRoundsToWHS(roundsWithDates);
    const sorted = migrated.sort((a, b) => b.date.getTime() - a.date.getTime());
    const sampleRounds = await getSampleRounds();
    if (sampleRounds.length > 0 && sorted.length === 0) {
      return sampleRounds;
    }
    if (sampleRounds.length > 0 && sorted.length > 0) {
      await dismissSampleRound();
    }
    return sorted;
  } catch (error) {
    logger.error('❌ Error loading rounds:', error);
    logger.error(`❌ This could mean corrupted data in ${getStorageLabel()}`);
    return [];
  }
}

// Save a new round (to Firestore + Storage if authenticated, AsyncStorage/localStorage otherwise)
export function saveRound(round: Omit<SavedRound, 'id'>): Promise<SavedRound> {
  return withStorageLock(() => _saveRound(round));
}

async function _saveRound(round: Omit<SavedRound, 'id'>): Promise<SavedRound> {
  const existingSample = await getSampleRound();
  if (existingSample) {
    await dismissSampleRound();
  }
  let newRound: SavedRound = {
    ...round,
    id: `round_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  };
  
  // WHS Compliance: Calculate differential and acceptability
  const currentHandicap = await calculateHandicapIndex();
  newRound = updateRoundWithWHSCalculations(newRound, currentHandicap);
  
  logger.debug('📊 WHS Calculations:', {
    acceptable: newRound.isAcceptableForHandicap,
    differential: newRound.differential,
    adjusted: newRound.adjustedGrossScore
  });
  
  try {
    // If authenticated and Firestore is available, save to Firestore + Storage
    if (isAuthenticated() && firestoreAvailable) {
      logger.debug('💾 Attempting to save round to Firestore...');
      
      // Upload images to Firebase Storage (skip if no image)
      let cloudImageUri = newRound.imageUri;
      let cloudThumbnailUri = newRound.thumbnailUri;
      
      if (newRound.imageUri && newRound.imageUri.trim() !== '') {
        try {
          // Compress and upload main image
          const compressedImage = await compressImage(newRound.imageUri, 1600, 0.85);
          cloudImageUri = await uploadScorecardImage(compressedImage, newRound.id);
          logger.debug('✓ Scorecard image uploaded');
          
          // Create and upload thumbnail
          if (!newRound.thumbnailUri) {
            const thumbnail = await createThumbnail(newRound.imageUri, 200);
            cloudThumbnailUri = await uploadThumbnail(thumbnail, newRound.id);
            logger.debug('✓ Thumbnail uploaded');
          } else {
            cloudThumbnailUri = await uploadThumbnail(newRound.thumbnailUri, newRound.id);
          }
        } catch (error) {
          logger.error('Image upload error (continuing with save):', error);
        }
      } else {
        logger.debug('ℹ️ No scorecard image to upload (manual entry)');
      }
      
      // Save round with cloud image URLs
      const cloudRound: SavedRound = {
        ...newRound,
        imageUri: cloudImageUri,
        thumbnailUri: cloudThumbnailUri,
      };
      
      try {
        await saveRoundToFirestore(cloudRound);
        logger.debug('✅ SUCCESS! Round saved to Firestore');
        logger.debug('   Round ID:', cloudRound.id);
        logger.debug('   Course:', cloudRound.courseName);
        logger.debug('   Score:', cloudRound.score);
        
        // Also save to local cache
        const rounds = await getRounds();
        rounds.unshift(cloudRound);
        await setLocalRoundsRaw(JSON.stringify(rounds));
        
        await _updateHandicapFlags();
        if (shouldCountAsAdvancedTrialRound(cloudRound)) {
          // Count one trial round once the first hole has been saved in advanced mode.
          await incrementTrialRound();
        }
        // Update per-hole tee club history for GPS rounds (fire-and-forget)
        if (cloudRound.gpsShots?.length && cloudRound.holes?.length) {
          updateCourseStatsAfterRound(cloudRound).catch(() => {});
        }
        return cloudRound;
      } catch (firestoreError: unknown) {
        if (getErrorMessage(firestoreError).includes('403')) {
          showFirestoreWarning();
        } else {
          logger.debug('ℹ Firestore save failed, falling back to local storage only');
        }
        // Continue to local storage fallback below
      }
    } else {
      // Log why we're not attempting Firestore
      if (!isAuthenticated()) {
        logger.debug('ℹ️ Skipping Firestore (not authenticated)');
      } else if (!firestoreAvailable) {
        logger.debug('⚠️ Skipping Firestore (connection disabled due to previous errors)');
        logger.debug('💡 Run window.resetFirestore() in console to re-enable after fixing Firebase rules');
      }
    }
    
    // Fallback: save to AsyncStorage (native) or localStorage (web)
    const rounds = await getRounds();
    rounds.unshift(newRound);
    
    const serialized = JSON.stringify(rounds);
    
    await setLocalRoundsRaw(serialized);
    
    await _updateHandicapFlags();
    if (shouldCountAsAdvancedTrialRound(newRound)) {
      // Count one trial round once the first hole has been saved in advanced mode.
      await incrementTrialRound();
    }
    
    logger.debug(`✅ Round saved to ${getStorageLabel()}:`, newRound.id);
    return newRound;
  } catch (error) {
    logger.error('❌ Error saving round:', error);
    throw error;
  }
}

// Delete a round (from Firestore + Storage if authenticated, AsyncStorage/localStorage otherwise)
export function deleteRound(roundId: string): Promise<void> {
  return withStorageLock(() => _deleteRound(roundId));
}

async function _deleteRound(roundId: string): Promise<void> {
  try {
    if (roundId.startsWith('sample_round')) {
      await dismissSampleRound();
      logger.debug('✅ Sample round dismissed');
      return;
    }
    // Delete from Firestore + Storage if authenticated and available
    if (isAuthenticated() && firestoreAvailable) {
      await deleteRoundFromFirestore(roundId);
      await deleteScorecardImage(roundId);
      logger.debug('✓ Round deleted from cloud');
    }
    
    // Delete from AsyncStorage/localStorage
    const rounds = await getRounds();
    const filtered = rounds.filter(r => r.id !== roundId);
    
    const serialized = JSON.stringify(filtered);
    
    await setLocalRoundsRaw(serialized);
    
    // Recalculate handicap after deleting
    await _updateHandicapFlags();
    
    logger.debug('✅ Round deleted:', roundId);
  } catch (error) {
    logger.error('❌ Error deleting round:', error);
    throw error;
  }
}

// Get a single round by ID
export async function getRound(roundId: string): Promise<SavedRound | null> {
  const rounds = await getRounds();
  return rounds.find(r => r.id === roundId) || null;
}

// Update an existing round (in Firestore if authenticated, AsyncStorage/localStorage otherwise)
export function updateRound(roundId: string, updates: Partial<SavedRound>): Promise<SavedRound | null> {
  return withStorageLock(() => _updateRound(roundId, updates));
}

async function _updateRound(roundId: string, updates: Partial<SavedRound>): Promise<SavedRound | null> {
  try {
    const rounds = await getRounds();
    const index = rounds.findIndex(r => r.id === roundId);
    
    if (index === -1) {
      logger.error('Round not found:', roundId);
      return null;
    }
    
    // Merge updates
    const updatedRound = {
      ...rounds[index],
      ...updates,
      // Preserve ID and date
      id: rounds[index].id,
      date: rounds[index].date,
    };
    
    // Update in Firestore if authenticated and available
    if (isAuthenticated() && firestoreAvailable) {
      await updateRoundInFirestore(roundId, updates);
      logger.debug('✓ Round updated in Firestore');
    }
    
    // Update in AsyncStorage/localStorage
    rounds[index] = updatedRound;
    
    const serialized = JSON.stringify(rounds);
    
    await setLocalRoundsRaw(serialized);
    
    // Recalculate handicap flags after update
    await _updateHandicapFlags();
    
    logger.debug('✅ Round updated:', roundId);
    return updatedRound;
  } catch (error) {
    logger.error('❌ Error updating round:', error);
    throw error;
  }
}

// Calculate round rating (legacy function name preserved)
export function calculateDifferential(score: number, coursePar: number = 72, _legacySlopeRating: number = 113): number {
  return calculateRoundRating(score, coursePar);
}

// Calculate handicap index using WHS-compliant calculations
export async function calculateHandicapIndex(): Promise<number | null> {
  const rounds = await getRounds();
  
  if (rounds.length === 0) return null;
  
  // Use WHS calculation (includes fallback table for fewer than 20 rounds)
  return calculateWHSHandicapIndex(rounds);
}

// Update which rounds are used for handicap
export function updateHandicapFlags(): Promise<void> {
  return withStorageLock(() => _updateHandicapFlags());
}

async function _updateHandicapFlags(): Promise<void> {
  try {
    const rounds = await getRounds();
    
    if (rounds.length === 0) return;
    
    const details = getHandicapCalculationDetails(rounds);
    const bestIds = new Set(details.roundIdsUsed);

    const updatedRounds = rounds.map(r => {
      const adjustedScore = r.adjustedGrossScore ?? r.score;
      const coursePar = getRoundCoursePar(r);
      const differential = r.isNineHoleRound
        ? undefined
        : coursePar == null
        ? undefined
        : calculateScoreDifferential(
            adjustedScore,
            coursePar,
            113
          ) || undefined;
      return {
        ...r,
        usedForHandicap: bestIds.has(r.id),
        differential,
      };
    });
    
    const serialized = JSON.stringify(updatedRounds);
    
    await setLocalRoundsRaw(serialized);
    
    logger.debug(`✅ Updated handicap flags for ${updatedRounds.length} rounds`);
  } catch (error) {
    logger.error('❌ Error updating handicap flags:', error);
  }
}

// Get average stats from best 8 of last 20 rounds
export async function getAverageStats(): Promise<AverageStats | null> {
  const rounds = await getRounds();
  
  if (rounds.length === 0) return null;
  
  // Get rounds used for handicap
  const handicapRounds = rounds.filter(r => r.usedForHandicap);
  
  if (handicapRounds.length === 0) {
    // If no flags set, use best 8 of available
    const sortedByScore = [...rounds].sort((a, b) => a.score - b.score);
    const best = sortedByScore.slice(0, Math.min(HANDICAP_BEST, sortedByScore.length));
    const averages = calculateAverages(best, rounds.length);
    
    // Save to Firestore if authenticated
    if (isAuthenticated()) {
      await saveAverageStats(averages);
    }
    
    return averages;
  }
  
  const averages = calculateAverages(handicapRounds, rounds.length);
  
  // Save to Firestore if authenticated
  if (isAuthenticated()) {
    await saveAverageStats(averages);
  }
  
  return averages;
}

function calculateAverages(rounds: SavedRound[], totalRounds: number): AverageStats {
  const count = rounds.length;
  
  const sumScore = rounds.reduce((sum, r) => sum + r.score, 0);
  const sumPutts = rounds.reduce((sum, r) => sum + (r.stats.putts || 0), 0);
  const sumFairways = rounds.reduce((sum, r) => sum + (r.stats.fairways || 0), 0);
  const sumGreens = rounds.reduce((sum, r) => sum + (r.stats.greens || 0), 0);
  
  // Calculate scrambling: total up-downs made / total attempts
  let totalUpDownMade = 0;
  let totalUpDownAttempts = 0;
  let totalMissedGreens = 0;
  
  rounds.forEach(r => {
    if (r.stats.upDownMade !== undefined && r.stats.upDownAttempts) {
      totalUpDownMade += r.stats.upDownMade;
      totalUpDownAttempts += r.stats.upDownAttempts;
    }
    // Track missed greens for fallback calculation
    const missedGreens = (r.stats.greensPossible || 18) - (r.stats.greens || 0);
    totalMissedGreens += missedGreens;
  });
  
  // Calculate scrambling percentage properly
  let scramblePercentage = 0;
  if (totalUpDownAttempts > 0) {
    // Use actual up-down data
    scramblePercentage = Math.round((totalUpDownMade / totalUpDownAttempts) * 100);
  } else if (totalMissedGreens > 0) {
    // Fallback: estimate based on score vs GIR correlation
    // Players with lower handicaps typically have higher scrambling
    // Estimate ~45-55% for average players
    const avgHandicap = rounds.reduce((sum, r) => sum + (r.differential || 10), 0) / count;
    if (avgHandicap <= 5) {
      scramblePercentage = 58;
    } else if (avgHandicap <= 10) {
      scramblePercentage = 50;
    } else if (avgHandicap <= 15) {
      scramblePercentage = 42;
    } else {
      scramblePercentage = 35;
    }
  }
  
  // Calculate handicap index (average of best 8 differentials)
  const avgDifferential = rounds.reduce((sum, r) => {
    const coursePar = getRoundCoursePar(r) ?? 72;
    const diff = r.differential || calculateDifferential(r.score, coursePar, 113);
    return sum + diff;
  }, 0) / count;

  const safeAvgScore = Math.round((sumScore / count) * 10) / 10;
  const safeAvgPutts = Math.round((sumPutts / count) * 10) / 10;
  const fairwaysPossible = rounds.reduce((sum, r) => sum + (r.stats.fairwaysPossible || 0), 0);
  const greensPossible = rounds.reduce((sum, r) => sum + (r.stats.greensPossible || 0), 0);
  const fairwaysPct = fairwaysPossible > 0 ? Math.round((sumFairways / fairwaysPossible) * 1000) / 10 : 0;
  const greensPct = greensPossible > 0 ? Math.round((sumGreens / greensPossible) * 1000) / 10 : 0;
  const seasonRounds = rounds.filter(r => new Date(r.date).getFullYear() === new Date().getFullYear());
  const recentRounds = rounds.slice(0, Math.min(5, rounds.length));
  const seasonAvg = seasonRounds.length
    ? Math.round((seasonRounds.reduce((sum, r) => sum + r.score, 0) / seasonRounds.length) * 10) / 10
    : safeAvgScore;
  const recentAvg = recentRounds.length
    ? Math.round((recentRounds.reduce((sum, r) => sum + r.score, 0) / recentRounds.length) * 10) / 10
    : safeAvgScore;
  const parsByRound = rounds.map(r => (r.holes?.length ? r.holes.reduce((sum, h) => sum + (h.par || 0), 0) : 72));
  const scoresVsPar = rounds.map((r, idx) => r.score - (parsByRound[idx] || 72));
  const minScore = Math.min(...rounds.map(r => r.score));
  const maxScore = Math.max(...rounds.map(r => r.score));
  const minVsPar = Math.min(...scoresVsPar);
  const maxVsPar = Math.max(...scoresVsPar);

  const allHoles = rounds.flatMap(r => r.holes || []);
  const byPar = (par: number) => allHoles.filter(h => h.par === par);
  const par3Holes = byPar(3);
  const par4Holes = byPar(4);
  const par5Holes = byPar(5);
  const holeAvg = (holes: RoundHole[], fallbackPar: number) => holes.length
    ? Math.round((holes.reduce((sum, h) => sum + h.score, 0) / holes.length) * 100) / 100
    : fallbackPar;
  const par3Avg = holeAvg(par3Holes, 3);
  const par4Avg = holeAvg(par4Holes, 4);
  const par5Avg = holeAvg(par5Holes, 5);
  const totalHoles = allHoles.length || 1;
  const birdieOrBetter = allHoles.filter(h => h.score <= h.par - 1).length;
  const bogeyPlus = allHoles.filter(h => h.score >= h.par + 1).length;

  const mkTracked = (value: number | string) => ({
    value,
    state: StatState.TRACKED as const,
    roundsUsed: count,
  });

  return {
    typicalScore: {
      typical: safeAvgScore,
      mean: safeAvgScore,
      range: { min: minScore, max: maxScore },
    },
    typicalScoreVsPar: {
      typical: Math.round((scoresVsPar.reduce((sum, v) => sum + v, 0) / scoresVsPar.length) * 100) / 100,
      mean: Math.round((scoresVsPar.reduce((sum, v) => sum + v, 0) / scoresVsPar.length) * 100) / 100,
      range: { min: minVsPar, max: maxVsPar },
    },
    rollingScore: {
      recent: recentAvg,
      season: seasonAvg,
      career: safeAvgScore,
    },
    avgPutts: mkTracked(safeAvgPutts),
    avgFairways: mkTracked(fairwaysPct),
    avgGreens: mkTracked(greensPct),
    avgScrambling: mkTracked(scramblePercentage),
    avgUpDown: mkTracked(scramblePercentage),
    par3Avg,
    par4Avg,
    par5Avg,
    birdieRate: Math.round((birdieOrBetter / totalHoles) * 1000) / 10,
    bogeyPlusRate: Math.round((bogeyPlus / totalHoles) * 1000) / 10,
    roundsUsed: count,
    totalRounds,
    handicapIndex: Math.round(avgDifferential * 10) / 10,
  };
}

// Parse HTML table to extract stats
// Debug logger that works on mobile
let debugLogger: ((level: 'info' | 'success' | 'warning' | 'error', message: string, details?: unknown) => void) | null = null;

export function setDebugLogger(logger: typeof debugLogger) {
  debugLogger = logger;
}

export function parseHtmlForStats(html: string): Partial<RoundStats> {
  const stats: Partial<RoundStats> = {};
  
  debugLogger?.('info', '📊 Starting stats parsing...');
  debugLogger?.('info', `HTML length: ${html.length} chars`);
  
  // Log first 500 chars of HTML to see structure
  if (html.length > 0) {
    const preview = html.substring(0, 500).replace(/\s+/g, ' ');
    debugLogger?.('info', `HTML preview: ${preview}...`);
  } else {
    debugLogger?.('error', '❌ HTML is empty!');
    return stats;
  }
  
  try {
    // Create a temporary DOM element to parse HTML
    if (typeof document !== 'undefined') {
      const div = document.createElement('div');
      div.innerHTML = html;
      
      const rows = div.querySelectorAll('tr');
      debugLogger?.('info', `Found ${rows.length} rows in HTML`);
      
      if (rows.length === 0) {
        debugLogger?.('error', '❌ No <tr> rows found! HTML may be malformed.');
        return stats;
      }
      
      // Log all row labels so we can see what's available
      const allLabels: string[] = [];
      rows.forEach(row => {
        const cells = row.querySelectorAll('td, th');
        if (cells.length > 0) {
          const label = cells[0].textContent?.trim().toUpperCase() || '';
          if (label) allLabels.push(label);
        }
      });
      
      if (allLabels.length > 0) {
        debugLogger?.('info', `📋 Found ${allLabels.length} row labels:`, allLabels.join(', '));
      } else {
        debugLogger?.('error', '❌ No row labels found in HTML!');
      }
      
      rows.forEach(row => {
        const cells = row.querySelectorAll('td, th');
        if (cells.length < 2) return;
        
        const label = cells[0].textContent?.trim().toUpperCase() || '';
        
        // Skip header row and rows with no label
        if (!label || label === 'HOLE') return;
        
        // TOT column should be the LAST column (index 22 in 23-column layout)
        const totColumnIndex = cells.length - 1;
        const totCell = cells[totColumnIndex];
        const totValue = totCell?.textContent?.trim() || '';
        
        logger.debug(`🔍 Parsing row "${label}": ${cells.length} cells, TOT column = "${totValue}"`);
        
        // Helper: Get numeric value from cell
        const getNumeric = (cell: Element | null | undefined): number | null => {
          const text = cell?.textContent?.trim();
          if (!text) return null;
          const num = parseInt(text);
          return isNaN(num) ? null : num;
        };
        
        // Helper: Get fraction from cell (like "5/7")
        const getFraction = (cell: Element | null | undefined): { made: number; attempts: number } | null => {
          const text = cell?.textContent?.trim();
          const match = text?.match(/(\d+)\/(\d+)/);
          if (match) {
            return {
              made: parseInt(match[1]),
              attempts: parseInt(match[2])
            };
          }
          return null;
        };
        
        // Parse SCORE row (player's total score)
        const isScoreRow = !label.includes('PAR') && 
                          !label.includes('HANDICAP') && 
                          !label.includes('BLACK') && 
                          !label.includes('WHITE') && 
                          !label.includes('GRAY') && 
                          !label.includes('GREEN') &&
                          !label.includes('BLUE') &&
                          !label.includes('GOLD') &&
                          !label.includes('RED') &&
                          !label.includes('CHAMPION') &&
                          !label.includes('WINTER') && // Added WINTERUSH
                          !label.includes('PUTT') && 
                          !label.includes('FAIRWAY') &&
                          !label.includes('GIR') && 
                          !label.includes('HOLE') &&
                          !label.includes('APPROACH') && 
                          !label.includes('CHIP') &&
                          !label.includes('TEE') && 
                          !label.includes('UP') && 
                          !label.includes('DOWN') &&
                          !label.includes('SAVE') && 
                          !label.includes('DIST') &&
                          !label.includes('ATTEST') &&
                          label !== 'P' && 
                          label !== 'F' && 
                          label !== 'G';
        
        if (isScoreRow && !stats.score) {
          const score = getNumeric(totCell);
          logger.debug(`   → Checking "${label}" as SCORE row: TOT="${totValue}", parsed=${score}`);
          debugLogger?.('info', `🎯 Checking "${label}" as score row`, `TOT value: "${totValue}", Parsed: ${score}`);
          if (score && score >= 60 && score <= 130) {
            stats.score = score;
            logger.debug(`   ✅ Found SCORE: ${score}`);
            debugLogger?.('success', `✅ Score: ${score}`, `From row "${label}"`);
          } else if (score) {
            debugLogger?.('warning', `⚠️ Score ${score} out of range (60-130)`, `From row "${label}"`);
          } else {
            debugLogger?.('warning', `⚠️ No valid score in TOT column`, `Row "${label}", TOT="${totValue}"`);
          }
        } else if (!isScoreRow) {
          logger.debug(`   → Skipping "${label}" (not a score row)`);
        }
        
        // Parse PUTTS row
        if ((label.includes('PUTT') || label === 'P') && !stats.putts) {
          const putts = getNumeric(totCell);
          logger.debug(`   → Checking as PUTTS row: ${putts}`);
          debugLogger?.('info', `🏌️ Checking "${label}" as putts row`, `TOT value: "${totValue}", Parsed: ${putts}`);
          if (putts && putts >= 10 && putts <= 60) {
            stats.putts = putts;
            logger.debug(`   ✅ Found PUTTS: ${putts}`);
            debugLogger?.('success', `✅ Putts: ${putts}`, `From row "${label}"`);
          } else if (putts) {
            debugLogger?.('warning', `⚠️ Putts ${putts} out of range (10-60)`, `From row "${label}"`);
          } else {
            debugLogger?.('warning', `⚠️ No valid putts in TOT column`, `Row "${label}", TOT="${totValue}"`);
          }
        }
        
        // Parse FAIRWAYS row (can be number or fraction)
        if ((label.includes('FAIRWAY') || label === 'F' || label === 'FIR') && !stats.fairways) {
          debugLogger?.('info', `⛳ Checking "${label}" as fairways row`, `TOT value: "${totValue}"`);
          // Try fraction first (like "5/7")
          const fraction = getFraction(totCell);
          if (fraction) {
            stats.fairways = fraction.made;
            stats.fairwaysPossible = fraction.attempts;
            logger.debug(`   ✅ Found FAIRWAYS: ${fraction.made}/${fraction.attempts}`);
            debugLogger?.('success', `✅ Fairways: ${fraction.made}/${fraction.attempts}`, `From row "${label}"`);
          } else {
            // Try plain number
            const fairways = getNumeric(totCell);
            if (fairways !== null && fairways >= 0 && fairways <= 14) {
              stats.fairways = fairways;
              stats.fairwaysPossible = 14;
              logger.debug(`   ✅ Found FAIRWAYS: ${fairways}`);
              debugLogger?.('success', `✅ Fairways: ${fairways}/14`, `From row "${label}"`);
            } else {
              debugLogger?.('warning', `⚠️ No valid fairways data`, `Row "${label}", TOT="${totValue}"`);
            }
          }
        }
        
        // Parse GREENS row (can be number or fraction)
        if ((label.includes('GREEN') || label === 'G' || label === 'GIR') && !stats.greens) {
          debugLogger?.('info', `🎯 Checking "${label}" as greens row`, `TOT value: "${totValue}"`);
          // Try fraction first
          const fraction = getFraction(totCell);
          if (fraction) {
            stats.greens = fraction.made;
            stats.greensPossible = fraction.attempts;
            logger.debug(`   ✅ Found GREENS: ${fraction.made}/${fraction.attempts}`);
            debugLogger?.('success', `✅ Greens: ${fraction.made}/${fraction.attempts}`, `From row "${label}"`);
          } else {
            // Try plain number
            const greens = getNumeric(totCell);
            if (greens !== null && greens >= 0 && greens <= 18) {
              stats.greens = greens;
              stats.greensPossible = 18;
              logger.debug(`   ✅ Found GREENS: ${greens}`);
              debugLogger?.('success', `✅ Greens: ${greens}/18`, `From row "${label}"`);
            } else {
              debugLogger?.('warning', `⚠️ No valid greens data`, `Row "${label}", TOT="${totValue}"`);
            }
          }
        }
        
        // Parse UP/DOWN row (always a fraction)
        if ((label.includes('UP') || label.includes('DOWN') || label.includes('SAVE')) && !stats.upDownMade) {
          const fraction = getFraction(totCell);
          if (fraction) {
            stats.upDownMade = fraction.made;
            stats.upDownAttempts = fraction.attempts;
            logger.debug(`   ✅ Found UP/DOWN: ${fraction.made}/${fraction.attempts}`);
          } else {
            // Fallback: count checkmarks if no fraction in TOT column
            let checks = 0;
            let attempts = 0;
            Array.from(cells).forEach((cell, idx) => {
              if (idx > 0 && idx < cells.length - 3) { // Skip label and summary columns
                const text = cell.textContent?.trim() || '';
                if (text === '✓' || text === 'Y') checks++;
                if (text === '✓' || text === 'X' || text === 'Y' || text === 'N') attempts++;
              }
            });
            if (attempts > 0) {
              stats.upDownMade = checks;
              stats.upDownAttempts = attempts;
              logger.debug(`   ✅ Counted UP/DOWN from marks: ${checks}/${attempts}`);
            }
          }
        }
        
        // Ignore course rating/slope style values for compliance.
      });
      
      // Summary of what was found
      debugLogger?.('info', '📋 Parsing complete:', 
        `Score: ${stats.score || 'NOT FOUND'}\n` +
        `Putts: ${stats.putts || 'NOT FOUND'}\n` +
        `Fairways: ${stats.fairways}/${stats.fairwaysPossible || 'NOT FOUND'}\n` +
        `Greens: ${stats.greens}/${stats.greensPossible || 'NOT FOUND'}\n` +
        `Up/Down: ${stats.upDownMade}/${stats.upDownAttempts || 'NOT FOUND'}`
      );
    }
  } catch (error) {
    logger.error('Error parsing HTML for stats:', error);
    debugLogger?.('error', 'Failed to parse stats', error instanceof Error ? error.message : String(error));
  }
  
  return stats;
}

// Sync local data to Firestore (call this after sign-in)
export async function syncLocalDataToFirestore(): Promise<void> {
  if (!isAuthenticated() || !firestoreAvailable) return;
  
  try {
    logger.debug('🔄 Syncing local data to Firestore...');
    
    // Get all rounds from local storage (web or native)
    const localData = await getLocalRoundsRaw();
    if (!localData) {
      logger.debug('No local data to sync');
      return;
    }
    
    const localRounds = JSON.parse(localData) as SavedRound[];
    
    // Get existing rounds from Firestore
    const firestoreRounds = await getRoundsFromFirestore();
    const existingIds = new Set(firestoreRounds.map(r => r.id));
    
    // Upload only new rounds
    const newRounds = localRounds.filter(r => !existingIds.has(r.id) && !r.isSample);
    
    if (newRounds.length === 0) {
      logger.debug('✓ All data already synced');
      return;
    }
    
    logger.debug(`Uploading ${newRounds.length} new rounds...`);
    
    // Upload each new round
    for (const round of newRounds) {
      try {
        // Upload images if they exist and are not empty
        let cloudImageUri = round.imageUri;
        let cloudThumbnailUri = round.thumbnailUri;
        
        if (round.imageUri && round.imageUri.trim() !== '' && !round.imageUri.startsWith('http')) {
          try {
            const compressedImage = await compressImage(round.imageUri, 1600, 0.85);
            cloudImageUri = await uploadScorecardImage(compressedImage, round.id);
            
            if (round.thumbnailUri && !round.thumbnailUri.startsWith('http')) {
              cloudThumbnailUri = await uploadThumbnail(round.thumbnailUri, round.id);
            }
            logger.debug(`  ✓ Images uploaded for ${round.courseName}`);
          } catch (imgError) {
            logger.debug(`  ℹ️ Skipping image upload (manual entry)`);
          }
        }
        
        // Save round to Firestore
        const cloudRound: SavedRound = {
          ...round,
          imageUri: cloudImageUri || '',
          thumbnailUri: cloudThumbnailUri || '',
        };
        
        await saveRoundToFirestore(cloudRound);
        logger.debug(`  ✅ Synced: ${round.courseName} (${round.score})`);
      } catch (error) {
        logger.error(`  ❌ Error syncing ${round.courseName}:`, error);
      }
    }
    
    logger.debug(`✓ Sync complete: ${newRounds.length} rounds uploaded`);
  } catch (error) {
    logger.error('Sync error:', error);
  }
}
