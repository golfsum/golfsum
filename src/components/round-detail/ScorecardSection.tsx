import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Image, ScrollView, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/tokens';

interface ScorecardSectionProps {
  isWeb: boolean;
  currentHtml: string;
  scorecardImageUri?: string;
  iframeRef?: React.RefObject<any>;
  onExpand: () => void;
  WebView?: any;
  scorecardInjectedScript: string;
  scorecardView: 'holes' | 'summary' | 'grid';
  onScorecardViewChange: (view: 'holes' | 'summary' | 'grid') => void;
  holeFilter: 'front' | 'back' | null;
  onHoleFilterChange: (filter: 'front' | 'back' | null) => void;
  buildSummary: (side: 'front' | 'back') => {
    totalScore: number | null;
    totalPutts: number | null;
    firHit: number;
    firPossible: number;
    girHit: number;
    girPossible: number;
    holesCount: number;
  };
  frontNumbers: number[];
  backNumbers: number[];
  frontHasPlayed: boolean;
  backHasPlayed: boolean;
  statPreferences: {
    putts?: boolean;
    fir?: boolean;
    gir?: boolean;
    approachDistance?: boolean;
  };
  holeNumbers: number[];
  holesByNumber: Map<number, any>;
  getHolePlayed: (holeNumber: number, hole?: any) => boolean;
  expandedHoles: Set<number>;
  toggleHoleExpanded: (holeNumber: number) => void;
  renderScoreBadge: (score?: number, par?: number) => React.ReactNode;
  formatFairway: (value: any) => string;
  formatGreen: (value: any) => string;
  formatApproachDistance: (value: any) => string;
  puttColorResolver: (putts: number, gir?: boolean) => string;
  isLandscape: boolean;
  height: number;
}

export const ScorecardSection: React.FC<ScorecardSectionProps> = ({
  isWeb,
  currentHtml,
  scorecardImageUri,
  iframeRef,
  onExpand,
  WebView,
  scorecardInjectedScript,
  scorecardView,
  onScorecardViewChange,
  holeFilter,
  onHoleFilterChange,
  buildSummary,
  frontNumbers,
  backNumbers,
  frontHasPlayed,
  backHasPlayed,
  statPreferences,
  holeNumbers,
  holesByNumber,
  getHolePlayed,
  expandedHoles,
  toggleHoleExpanded,
  renderScoreBadge,
  formatFairway,
  formatGreen,
  formatApproachDistance,
  puttColorResolver,
  isLandscape,
  height,
}) => {
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null);
  const hasScorecardHtml = Boolean(currentHtml && currentHtml.trim().length > 0);
  const hasScorecardImage = Boolean(scorecardImageUri && scorecardImageUri.trim().length > 0);

  useEffect(() => {
    if (!hasScorecardImage || !scorecardImageUri) {
      setImageAspectRatio(null);
      return;
    }
    Image.getSize(
      scorecardImageUri,
      (width, imageHeight) => {
        if (width > 0 && imageHeight > 0) {
          setImageAspectRatio(width / imageHeight);
        }
      },
      () => setImageAspectRatio(null)
    );
  }, [hasScorecardImage, scorecardImageUri]);
  if (isWeb) {
    return (
      <View style={styles.scorecardSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Scorecard</Text>
          <TouchableOpacity
            style={styles.expandButton}
            onPress={onExpand}
            accessibilityRole="button"
            accessibilityLabel="Expand scorecard"
          >
            <Ionicons name="expand-outline" size={18} color="#10B981" />
            <Text style={styles.expandButtonText}>Expand</Text>
          </TouchableOpacity>
        </View>

        {hasScorecardHtml ? (
          <>
            <TouchableOpacity
              style={styles.scorecardPreview}
              onPress={onExpand}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel="Scorecard preview"
              accessibilityHint="Opens full scorecard"
            >
              <iframe
                ref={iframeRef as any}
                srcDoc={currentHtml}
                style={webStyles.iframe}
                title="Scorecard"
                sandbox="allow-same-origin allow-scripts allow-forms"
              />

              <View style={styles.scorecardOverlay}>
                <View style={styles.overlayHint}>
                  <Ionicons name="expand" size={20} color="#FFFFFF" />
                  <Text style={styles.overlayHintText}>Tap to expand & edit</Text>
                </View>
              </View>
            </TouchableOpacity>
            <Text style={styles.editHint}>Click cells to edit • Changes auto-save</Text>
          </>
        ) : (
          <View style={styles.webviewNote}>
            <Text style={styles.webviewNoteText}>Scorecard preview not available.</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.scorecardSection}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Scorecard</Text>
      </View>

      <View style={styles.scorecardTabs}>
        <TouchableOpacity
          style={[styles.scorecardTab, scorecardView === 'summary' && styles.scorecardTabActive]}
          onPress={() => {
            onScorecardViewChange('summary');
            onHoleFilterChange(null);
          }}
          accessibilityRole="tab"
          accessibilityLabel="Front and back summary"
          accessibilityState={{ selected: scorecardView === 'summary' }}
        >
          <Text style={[styles.scorecardTabText, scorecardView === 'summary' && styles.scorecardTabTextActive]}>
            Front/Back
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.scorecardTab, scorecardView === 'holes' && styles.scorecardTabActive]}
          onPress={() => {
            onScorecardViewChange('holes');
            onHoleFilterChange(null);
          }}
          accessibilityRole="tab"
          accessibilityLabel="Hole list"
          accessibilityState={{ selected: scorecardView === 'holes' }}
        >
          <Text style={[styles.scorecardTabText, scorecardView === 'holes' && styles.scorecardTabTextActive]}>
            Hole List
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.scorecardTab, scorecardView === 'grid' && styles.scorecardTabActive]}
          onPress={() => {
            onScorecardViewChange('grid');
            onHoleFilterChange(null);
          }}
          accessibilityRole="tab"
          accessibilityLabel="Full scorecard"
          accessibilityState={{ selected: scorecardView === 'grid' }}
        >
          <Text
            style={[
              styles.scorecardTabText,
              scorecardView === 'grid' ? styles.scorecardTabTextActive : styles.scorecardTabTextSecondary,
            ]}
          >
            Full Scorecard
          </Text>
        </TouchableOpacity>
      </View>

      {scorecardView === 'summary' && (
        <View style={styles.summaryList}>
          {(() => {
            const front = buildSummary('front');
            const showFrontStats =
              front.totalScore !== null || front.totalPutts !== null || front.firPossible > 0 || front.girPossible > 0;
            if (!frontHasPlayed) {
              return null;
            }
            const frontLabel = frontNumbers.length >= 9 ? 'Front 9' : `Front ${frontNumbers.length}`;
            return (
              <TouchableOpacity
                style={styles.summaryCard}
                onPress={() => {
                  onScorecardViewChange('holes');
                  onHoleFilterChange('front');
                }}
                accessibilityRole="button"
                accessibilityLabel="View front nine holes"
              >
                <Text style={styles.summaryTitle}>{frontLabel}</Text>
                {showFrontStats ? (
                  <View style={styles.summaryStatsRow}>
                    {front.totalScore !== null && <Text style={styles.summaryStatText}>Score: {front.totalScore}</Text>}
                    {statPreferences.putts && front.totalPutts !== null && (
                      <Text style={styles.summaryStatText}>Putts: {front.totalPutts}</Text>
                    )}
                    {statPreferences.fir && front.firPossible > 0 && (
                      <Text style={styles.summaryStatText}>FIR: {front.firHit}/{front.firPossible}</Text>
                    )}
                    {statPreferences.gir && front.girPossible > 0 && (
                      <Text style={styles.summaryStatText}>GIR: {front.girHit}/{front.girPossible}</Text>
                    )}
                  </View>
                ) : (
                  <Text style={styles.summaryEmptyText}>No tracked stats</Text>
                )}
              </TouchableOpacity>
            );
          })()}
          {backNumbers.length > 0 &&
            (() => {
              const back = buildSummary('back');
              const showBackStats =
                back.totalScore !== null || back.totalPutts !== null || back.firPossible > 0 || back.girPossible > 0;
              if (!backHasPlayed) {
                return null;
              }
              const backLabel = backNumbers.length >= 9 ? 'Back 9' : `Back ${backNumbers.length}`;
              return (
                <TouchableOpacity
                  style={styles.summaryCard}
                  onPress={() => {
                    onScorecardViewChange('holes');
                    onHoleFilterChange('back');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="View back nine holes"
                >
                  <Text style={styles.summaryTitle}>{backLabel}</Text>
                  {showBackStats ? (
                    <View style={styles.summaryStatsRow}>
                      {back.totalScore !== null && <Text style={styles.summaryStatText}>Score: {back.totalScore}</Text>}
                      {statPreferences.putts && back.totalPutts !== null && (
                        <Text style={styles.summaryStatText}>Putts: {back.totalPutts}</Text>
                      )}
                      {statPreferences.fir && back.firPossible > 0 && (
                        <Text style={styles.summaryStatText}>FIR: {back.firHit}/{back.firPossible}</Text>
                      )}
                      {statPreferences.gir && back.girPossible > 0 && (
                        <Text style={styles.summaryStatText}>GIR: {back.girHit}/{back.girPossible}</Text>
                      )}
                    </View>
                  ) : (
                    <Text style={styles.summaryEmptyText}>No tracked stats</Text>
                  )}
                </TouchableOpacity>
              );
            })()}
        </View>
      )}

      {scorecardView === 'grid' && (
        <View style={styles.gridContainer}>
          {!isLandscape && <Text style={styles.gridHint}>Best viewed in landscape</Text>}
          {hasScorecardHtml && WebView && (
            <WebView
              source={{ html: currentHtml }}
              style={[styles.gridWebView, { height: Math.max(320, height - 220) }]}
              originWhitelist={['*']}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              injectedJavaScript={scorecardInjectedScript}
              scalesPageToFit={true}
              scrollEnabled={true}
            />
          )}
          {!hasScorecardHtml && hasScorecardImage && (
            <View style={styles.imageContainer}>
              <View style={styles.imageActions}>
                <TouchableOpacity
                  style={styles.imageActionButton}
                  onPress={async () => {
                    try {
                      await Share.share({
                        url: scorecardImageUri as string,
                        message: 'GolfSum scorecard image',
                      });
                    } catch {
                      // ignore share failures
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Save scorecard image"
                >
                  <Ionicons name="download-outline" size={16} color="#10B981" />
                  <Text style={styles.imageActionText}>Save image</Text>
                </TouchableOpacity>
                <Text style={styles.imageActionHint}>Pinch to zoom</Text>
              </View>
              <ScrollView
                style={styles.imageScroll}
                contentContainerStyle={styles.imageScrollContent}
                minimumZoomScale={1}
                maximumZoomScale={3}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                bouncesZoom={true}
              >
                <Image
                  source={{ uri: scorecardImageUri as string }}
                  style={[
                    styles.scorecardImage,
                    imageAspectRatio
                      ? { aspectRatio: imageAspectRatio }
                      : { height: Math.max(240, Math.min(420, height - 260)) },
                  ]}
                  resizeMode="contain"
                />
              </ScrollView>
            </View>
          )}
          {!hasScorecardHtml && !hasScorecardImage && (
            <Text style={styles.summaryEmptyText}>No scorecard preview available.</Text>
          )}
        </View>
      )}

      {scorecardView === 'holes' && (
        <View style={styles.holeList}>
          {holeFilter && (
            <View style={styles.holeFilterRow}>
              <Text style={styles.holeFilterText}>{holeFilter === 'front' ? 'Front 9' : 'Back 9'}</Text>
              <View style={styles.holeFilterActions}>
                {holeFilter === 'front' && (
                  <TouchableOpacity onPress={() => onHoleFilterChange('back')}>
                    <Text style={styles.holeFilterClear}>Show Back 9</Text>
                  </TouchableOpacity>
                )}
                {holeFilter === 'back' && (
                  <TouchableOpacity onPress={() => onHoleFilterChange('front')}>
                    <Text style={styles.holeFilterClear}>Show Front 9</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => onHoleFilterChange(null)}>
                  <Text style={styles.holeFilterClear}>Show All</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          {holeNumbers
            .filter((num) => {
              if (holeFilter === 'front') return num <= 9;
              if (holeFilter === 'back') return num >= 10;
              return true;
            })
            .map((holeNumber) => {
              const hole = holesByNumber.get(holeNumber) as any;
              const played = getHolePlayed(holeNumber, hole);
              const par = hole?.par;
              const yardage = hole?.yardage;
              const isPar3 = par === 3;
              const expanded = expandedHoles.has(holeNumber);
              const headerText = played
                ? `Hole ${holeNumber}`
                : `Hole ${holeNumber} • Not Played`;

              return (
                <TouchableOpacity
                  key={holeNumber}
                  style={[styles.holeRow, !played && styles.holeRowMuted]}
                  onPress={() => played && toggleHoleExpanded(holeNumber)}
                  activeOpacity={played ? 0.8 : 1}
                >
                  <Text style={styles.holeHeader}>
                    {headerText}
                    {played && (
                      <Text style={styles.holeMeta}>
                        {` • Par ${par ?? '—'}${yardage ? ` • ${yardage} yds` : ''}`}
                      </Text>
                    )}
                  </Text>
                  {played && (
                    <>
                      <View style={styles.holeStatsRow}>
                        <View style={styles.holeStatBlock}>
                          <Text style={styles.holeStatLabel}>Score</Text>
                          <View style={styles.holeStatValueWrap}>
                            {renderScoreBadge(hole?.score, par)}
                          </View>
                        </View>
                        {statPreferences.putts && hole?.putts !== undefined && (
                          <View style={styles.holeStatBlock}>
                            <Text style={styles.holeStatLabel}>Putts</Text>
                            <View style={styles.holeStatValueWrap}>
                              <Text
                                style={[
                                  styles.holeStatValue,
                                  hole?.putts != null ? { color: puttColorResolver(hole.putts, hole?.greenHit === true || hole?.greenHit === 'hit') } : null,
                                ]}
                              >
                                {hole?.putts ?? '—'}
                              </Text>
                            </View>
                          </View>
                        )}
                        {statPreferences.fir && (
                          <View style={styles.holeStatBlock}>
                            <Text style={styles.holeStatLabel}>FIR</Text>
                            <View style={styles.holeStatValueWrap}>
                              <Text style={styles.holeStatValue}>
                                {isPar3 ? '—' : formatFairway(hole?.fairwayHit)}
                              </Text>
                            </View>
                          </View>
                        )}
                        {statPreferences.gir && hole?.greenHit !== undefined && hole?.greenHit !== null && (
                          <View style={styles.holeStatBlock}>
                            <Text style={styles.holeStatLabel}>GIR</Text>
                            <View style={styles.holeStatValueWrap}>
                              <Text style={styles.holeStatValue}>{formatGreen(hole?.greenHit)}</Text>
                            </View>
                          </View>
                        )}
                      </View>
                      {expanded && (
                        <View style={styles.holeExpanded}>
                          <View style={styles.holeExpandedRow}>
                            <Text style={styles.holeExpandedLabel}>Score</Text>
                            {renderScoreBadge(hole?.score, par)}
                          </View>
                          {statPreferences.putts && hole?.putts !== undefined && (
                            <View style={styles.holeExpandedRow}>
                              <Text style={styles.holeExpandedLabel}>Putts</Text>
                              <Text
                                style={[
                                  styles.holeExpandedValue,
                                  hole?.putts != null ? { color: puttColorResolver(hole.putts, hole?.greenHit === true || hole?.greenHit === 'hit') } : null,
                                ]}
                              >
                                {hole?.putts ?? '—'}
                              </Text>
                            </View>
                          )}
                          {statPreferences.fir && !isPar3 && hole?.fairwayHit !== undefined && hole?.fairwayHit !== null && (
                            <View style={styles.holeExpandedRow}>
                              <Text style={styles.holeExpandedLabel}>FIR</Text>
                              <Text style={styles.holeExpandedValue}>{formatFairway(hole?.fairwayHit)}</Text>
                            </View>
                          )}
                          {statPreferences.gir && hole?.greenHit !== undefined && hole?.greenHit !== null && (
                            <View style={styles.holeExpandedRow}>
                              <Text style={styles.holeExpandedLabel}>GIR</Text>
                              <Text style={styles.holeExpandedValue}>{formatGreen(hole?.greenHit)}</Text>
                            </View>
                          )}
                          {statPreferences.approachDistance && hole?.approachDistance && (
                            <View style={styles.holeExpandedRow}>
                              <Text style={styles.holeExpandedLabel}>{isPar3 ? 'Tee Shot' : 'Approach Dist'}</Text>
                              <Text style={styles.holeExpandedValue}>
                                {formatApproachDistance(hole?.approachDistance)}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}
                    </>
                  )}
                </TouchableOpacity>
              );
            })}
        </View>
      )}
    </View>
  );
};

const webStyles: { [key: string]: React.CSSProperties } = {
  iframe: {
    width: '100%',
    height: 280,
    border: 'none',
    backgroundColor: '#fff',
    borderRadius: 8,
    pointerEvents: 'auto',
  },
};

const styles = StyleSheet.create({
  scorecardSection: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  scorecardTabs: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginBottom: 12,
  },
  scorecardTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#1a2028',
    alignItems: 'center',
  },
  scorecardTabActive: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  scorecardTabText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  scorecardTabTextActive: {
    color: '#10B981',
  },
  scorecardTabTextSecondary: {
    color: '#6B7280',
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
  },
  expandButtonText: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '500',
  },
  scorecardPreview: {
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 12,
  },
  scorecardOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  overlayHintText: {
    fontSize: 13,
    color: '#FFFFFF',
  },
  editHint: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 10,
  },
  summaryList: {
    gap: 12,
    marginTop: 4,
  },
  summaryCard: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E5E7EB',
    marginBottom: 8,
  },
  summaryStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryStatText: {
    fontSize: 12,
    color: '#D1D5DB',
  },
  summaryEmptyText: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  webviewNote: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webviewNoteText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
  },
  gridContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    marginTop: 4,
    opacity: 0.8,
  },
  imageContainer: {
    backgroundColor: '#0f1419',
  },
  imageActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  imageActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  imageActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
  },
  imageActionHint: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  imageScroll: {
    width: '100%',
  },
  imageScrollContent: {
    alignItems: 'stretch',
    justifyContent: 'flex-start',
  },
  scorecardImage: {
    width: '100%',
    backgroundColor: '#0f1419',
  },
  gridHint: {
    fontSize: 12,
    color: '#9CA3AF',
    padding: 12,
  },
  gridWebView: {
    width: '100%',
    height: 420,
    backgroundColor: '#fff',
  },
  holeList: {
    marginTop: 4,
    gap: 8,
  },
  holeFilterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  holeFilterActions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  holeFilterText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#D1D5DB',
  },
  holeFilterClear: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
  },
  holeRow: {
    backgroundColor: '#111827',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 64,
    borderWidth: 1,
    borderColor: '#374151',
  },
  holeRowMuted: {
    backgroundColor: '#141a23',
    borderColor: '#2f3642',
  },
  holeHeader: {
    fontSize: 16,
    color: colors.text.primary,
    fontWeight: '700',
    marginBottom: 6,
  },
  holeMeta: {
    fontSize: 15,
    color: colors.text.primary,
    fontWeight: '600',
  },
  holeStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  holeStatBlock: {
    minWidth: '22%',
  },
  holeStatLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  holeStatValueWrap: {
    height: 28,
    justifyContent: 'center',
  },
  holeStatValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  holeExpanded: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2f3642',
    gap: 8,
  },
  holeExpandedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  holeExpandedLabel: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  holeExpandedValue: {
    fontSize: 14,
    color: '#E5E7EB',
    fontWeight: '600',
  },
});
