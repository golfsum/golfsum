import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/tokens';
import type { ScanState, ScanStep } from './types';
import { UI_COPY } from '../../constants/uiCopy';
import type { ScorecardImportStyles } from '../ScorecardImportScreen.styles';
import type { CardConfigState } from './hooks/useImportScanState';

interface PhotoSectionProps {
  styles: ScorecardImportStyles;
  imageUri: string | null;
  backImageUri: string | null;
  cardConfig: CardConfigState;
  scanState: ScanState;
  scanProgress: number;
  scanSteps: ScanStep[];
  hasScanWarnings: boolean;
  isProcessing: boolean;
  scanSide: 'front' | 'back';
  isCompletedMode: boolean;
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
}

export const PhotoSection: React.FC<PhotoSectionProps> = ({
  styles,
  imageUri,
  backImageUri,
  cardConfig,
  scanState,
  scanProgress,
  scanSteps,
  hasScanWarnings,
  isProcessing,
  scanSide,
  isCompletedMode,
  onSelectImage,
  onTakePhoto,
  onChangePhoto,
  onRunOcr,
  onEnterManual,
  onReviewStats,
  onAddBackSide,
  onTakeBackPhoto,
  onSetCoverage,
  onSetPlayedFull,
}) => {
  const isFlowComplete = !!cardConfig.photoFront
    && !!cardConfig.coverage
    && (
      cardConfig.coverage === 'full18'
      || cardConfig.playedFull === false
      || (cardConfig.playedFull === true && !!cardConfig.photoBack)
    );
  const needsSecondCard = !!cardConfig.photoFront
    && cardConfig.coverage !== 'full18'
    && cardConfig.coverage !== null
    && cardConfig.playedFull === true;

  const secondCardPrompt = cardConfig.coverage === 'front9'
    ? UI_COPY.scorecardImport.addBackCardPrompt
    : UI_COPY.scorecardImport.addFrontCardPrompt;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{UI_COPY.scorecardImport.photoSectionTitle}</Text>
      <View style={styles.photoArea}>
        {!imageUri ? (
          <View style={styles.placeholder}>
            <Ionicons name="image-outline" size={48} color={colors.text.tertiary} />
            <Text style={styles.placeholderText}>{UI_COPY.scorecardImport.photoPlaceholder}</Text>
          </View>
        ) : (
          <View style={styles.thumbnailContainer}>
            <Image
              source={{ uri: scanSide === 'back' && backImageUri ? backImageUri : imageUri }}
              style={[
                styles.thumbnail,
                scanState === 'scanning' && styles.thumbnailDimmed,
              ]}
            />
            {scanState === 'scanning' && (
              <View style={styles.scanningOverlay}>
                <ActivityIndicator size="large" color={colors.brand.primary} />
              </View>
            )}
          </View>
        )}
      </View>

      {isCompletedMode && (
        <View style={{ gap: 10, marginBottom: 12 }}>
          {!!cardConfig.photoFront && (
            <View>
              <Text style={{ color: colors.text.secondary, fontSize: 12, marginBottom: 6 }}>
                {UI_COPY.scorecardImport.photoShowsLabel}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[
                  { label: UI_COPY.scorecardImport.all18Holes, value: 'full18' as const },
                  { label: UI_COPY.scorecardImport.front9, value: 'front9' as const },
                  { label: UI_COPY.scorecardImport.back9, value: 'back9' as const },
                ].map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: cardConfig.coverage === option.value ? colors.brand.primary : 'rgba(255,255,255,0.12)',
                      backgroundColor: cardConfig.coverage === option.value ? 'rgba(16,185,129,0.12)' : 'transparent',
                      alignItems: 'center',
                    }}
                    onPress={() => onSetCoverage(option.value)}
                    accessibilityRole="button"
                  >
                    <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600' }}>{option.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          {!!cardConfig.photoFront && cardConfig.coverage !== null && cardConfig.coverage !== 'full18' && (
            <View>
              <Text style={{ color: colors.text.secondary, fontSize: 12, marginBottom: 6 }}>
                {UI_COPY.scorecardImport.playedFullLabel}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[
                  { label: UI_COPY.scorecardImport.yesAddOtherNine, value: true },
                  { label: UI_COPY.scorecardImport.noNineHoleRound, value: false },
                ].map((option) => (
                  <TouchableOpacity
                    key={String(option.value)}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: cardConfig.playedFull === option.value ? colors.brand.primary : 'rgba(255,255,255,0.12)',
                      backgroundColor: cardConfig.playedFull === option.value ? 'rgba(16,185,129,0.12)' : 'transparent',
                      alignItems: 'center',
                    }}
                    onPress={() => onSetPlayedFull(option.value)}
                    accessibilityRole="button"
                  >
                    <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600' }}>{option.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          {needsSecondCard && (
            <View style={{ marginTop: 2 }}>
              <Text style={{ color: colors.text.secondary, fontSize: 12, marginBottom: 6 }}>
                {secondCardPrompt}
              </Text>
              <View style={styles.photoActions}>
                <TouchableOpacity
                  style={styles.selectButton}
                  onPress={onAddBackSide}
                  accessibilityRole="button"
                >
                  <Ionicons name="images-outline" size={20} color={colors.brand.primary} />
                  <Text style={styles.selectButtonText}>{UI_COPY.scorecardImport.actionSelectFromPhotos}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cameraButton}
                  onPress={onTakeBackPhoto}
                  accessibilityRole="button"
                >
                  <Ionicons name="camera-outline" size={20} color={colors.brand.primary} />
                  <Text style={styles.cameraButtonText}>{UI_COPY.scorecardImport.actionTakePhoto}</Text>
                </TouchableOpacity>
              </View>
              {!!cardConfig.photoBack && (
                <View style={{ marginTop: 8, borderRadius: 10, overflow: 'hidden' }}>
                  <Image source={{ uri: cardConfig.photoBack }} style={[styles.thumbnail, { height: 150 }]} />
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {(scanState === 'empty' || !imageUri) && (
        <View style={styles.photoActions}>
          <TouchableOpacity
            style={styles.selectButton}
            onPress={onSelectImage}
            accessibilityRole="button"
            accessibilityLabel="Select scorecard from photos"
            accessibilityHint="Opens the photo library"
          >
            <Ionicons name="images-outline" size={20} color={colors.brand.primary} />
            <Text style={styles.selectButtonText}>{UI_COPY.scorecardImport.actionSelectFromPhotos}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cameraButton}
            onPress={onTakePhoto}
            accessibilityRole="button"
            accessibilityLabel="Take scorecard photo"
            accessibilityHint="Opens the camera"
          >
            <Ionicons name="camera-outline" size={20} color={colors.brand.primary} />
            <Text style={styles.cameraButtonText}>{UI_COPY.scorecardImport.actionTakePhoto}</Text>
          </TouchableOpacity>
        </View>
      )}

      {(scanState === 'ready' || scanState === 'error') && imageUri && (
        <View style={styles.photoActions}>
          <TouchableOpacity
            style={styles.changeButton}
            onPress={scanSide === 'back' ? onAddBackSide : onChangePhoto}
            accessibilityRole="button"
            accessibilityLabel={scanSide === 'back' ? 'Change back photo' : 'Change scorecard photo'}
          >
            <Ionicons name={scanSide === 'back' ? 'images-outline' : 'refresh-outline'} size={20} color={colors.brand.primary} />
            <Text style={styles.changeButtonText}>
              {scanSide === 'back' ? UI_COPY.scorecardImport.actionSelectBackPhoto : UI_COPY.scorecardImport.actionChangePhoto}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.scanButton, (isProcessing || !isFlowComplete) && styles.buttonDisabled]}
            onPress={onRunOcr}
            disabled={isProcessing || !isFlowComplete}
            accessibilityRole="button"
            accessibilityLabel="Scan scorecard"
            accessibilityHint="Runs OCR to extract scores and stats"
          >
            {isProcessing ? (
              <ActivityIndicator color={colors.text.inverse} />
            ) : (
              <>
                <Ionicons name="scan-outline" size={18} color={colors.text.inverse} />
                <Text style={styles.scanButtonText}>{UI_COPY.scorecardImport.actionScanScorecard}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {scanState === 'complete' && imageUri && (
        <View style={styles.photoActions}>
          <TouchableOpacity
            style={styles.changeButton}
            onPress={scanSide === 'back' ? onAddBackSide : onChangePhoto}
            accessibilityRole="button"
            accessibilityLabel={scanSide === 'back' ? 'Select another scorecard photo' : 'Change scorecard photo'}
          >
            <Ionicons name={scanSide === 'back' ? 'images-outline' : 'refresh-outline'} size={20} color={colors.brand.primary} />
            <Text style={styles.changeButtonText}>
              {scanSide === 'back' ? UI_COPY.scorecardImport.actionSelectAnotherPhoto : UI_COPY.scorecardImport.actionChangePhoto}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {scanState === 'scanning' && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${scanProgress}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {UI_COPY.scorecardImport.progressExtracting.replace('{progress}', String(scanProgress))}
          </Text>
        </View>
      )}

      <View style={styles.stepsContainer}>
        <View style={styles.stepsDivider} />
        <Text style={styles.stepsHeader}>
          {scanState === 'empty' && UI_COPY.scorecardImport.stepsAfterSelectingPhoto}
          {scanState === 'ready' && UI_COPY.scorecardImport.stepsReadyToExtract}
          {scanState === 'scanning' && UI_COPY.scorecardImport.stepsExtracting}
          {scanState === 'complete' && (hasScanWarnings ? UI_COPY.scorecardImport.stepsExtractionCompleteWarnings : UI_COPY.scorecardImport.stepsExtractionComplete)}
          {scanState === 'error' && UI_COPY.scorecardImport.stepsExtractionFailed}
        </Text>
        {scanSteps.map(step => (
          <View key={step.id} style={styles.stepRow}>
            <View style={styles.stepIcon}>
              {step.status === 'pending' && <View style={styles.emptyCircle} />}
              {step.status === 'active' && (
                <ActivityIndicator size="small" color={colors.brand.primary} />
              )}
              {step.status === 'complete' && (
                <Ionicons name="checkmark-circle" size={20} color={colors.brand.primary} />
              )}
              {step.status === 'warning' && (
                <Ionicons name="alert-circle" size={20} color={colors.semantic.warning} />
              )}
              {step.status === 'error' && (
                <Ionicons name="close-circle" size={20} color={colors.semantic.error} />
              )}
            </View>
            <Text
              style={[
                styles.stepLabel,
                step.status === 'complete' && styles.stepLabelComplete,
              ]}
            >
              {step.label}
            </Text>
            {step.detail && <Text style={styles.stepDetail}>{step.detail}</Text>}
          </View>
        ))}
        {scanState === 'error' && (
          <View style={styles.scanErrorBox}>
            <Text style={styles.scanErrorTitle}>{UI_COPY.scorecardImport.scanErrorTitle}</Text>
            <Text style={styles.scanErrorHint}>{UI_COPY.scorecardImport.scanErrorTry}</Text>
            <Text style={styles.scanErrorBullet}>{UI_COPY.scorecardImport.scanErrorBulletLighting}</Text>
            <Text style={styles.scanErrorBullet}>{UI_COPY.scorecardImport.scanErrorBulletFlatten}</Text>
            <Text style={styles.scanErrorBullet}>{UI_COPY.scorecardImport.scanErrorBulletCrop}</Text>
            <View style={styles.scanErrorActions}>
              <TouchableOpacity
                style={styles.scanErrorPrimary}
                onPress={onRunOcr}
                accessibilityRole="button"
                accessibilityLabel="Retry scan"
              >
                <Text style={styles.scanErrorPrimaryText}>{UI_COPY.scorecardImport.retryScan}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.scanErrorSecondary}
                onPress={onEnterManual}
                accessibilityRole="button"
                accessibilityLabel="Enter manually"
              >
                <Text style={styles.scanErrorSecondaryText}>{UI_COPY.scorecardImport.enterManually}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {backImageUri && scanState === 'complete' && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <View style={{
            flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
            backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 8, padding: 10,
          }}>
            <Ionicons name="checkmark-circle" size={16} color={colors.brand.primary} />
            <Text style={{ color: colors.text.secondary, fontSize: 12 }}>{UI_COPY.scorecardImport.statusFrontScanned}</Text>
          </View>
          <View style={{
            flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
            backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 8, padding: 10,
          }}>
            <Ionicons name="checkmark-circle" size={16} color={colors.brand.primary} />
            <Text style={{ color: colors.text.secondary, fontSize: 12 }}>{UI_COPY.scorecardImport.statusBackScanned}</Text>
          </View>
        </View>
      )}

      {scanState === 'complete' && (
        <TouchableOpacity
          style={styles.reviewButton}
          onPress={onReviewStats}
          accessibilityRole="button"
          accessibilityLabel="Review in stats tab"
        >
          <Text style={styles.reviewButtonText}>{UI_COPY.scorecardImport.reviewInStatsTab}</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.brand.primary} />
        </TouchableOpacity>
      )}
    </View>
  );
};
