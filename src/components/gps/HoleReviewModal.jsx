import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { MAPBOX_PUBLIC_TOKEN } from '../../config/mapbox';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAP_WIDTH = SCREEN_WIDTH - spacing.lg * 2 - spacing.lg * 2; // sheet padding + modal padding
const MAP_HEIGHT = Math.round(MAP_WIDTH * (9 / 16));

// ─── Score helpers ───────────────────────────────────────────────────
function getScoreLabel(score, par) {
  if (score == null || par == null) return null;
  const diff = score - par;
  if (diff <= -2) return 'eagle';
  if (diff === -1) return 'birdie';
  if (diff === 0) return 'par';
  if (diff === 1) return 'bogey';
  return 'double';
}

function getScoreName(label) {
  switch (label) {
    case 'eagle': return 'Eagle';
    case 'birdie': return 'Birdie';
    case 'par': return 'Par';
    case 'bogey': return 'Bogey';
    case 'double': return 'Double Bogey+';
    default: return '';
  }
}

function getScoreColor(label) {
  switch (label) {
    case 'eagle': return colors.score.eagle;
    case 'birdie': return colors.score.birdie;
    case 'par': return colors.score.par;
    case 'bogey': return colors.score.bogey;
    case 'double': return colors.score.double;
    default: return colors.text.secondary;
  }
}

// ─── Mapbox Static Image URL ─────────────────────────────────────────
export function getHoleSnapshotUrl(greenLat, greenLon, teeLat, teeLon, shots) {
  if (!MAPBOX_PUBLIC_TOKEN) return null;

  const centerLat = (greenLat + teeLat) / 2;
  const centerLon = (greenLon + teeLon) / 2;

  // Shot markers
  const markers = shots.map((shot, i) => {
    const color = i === 0 ? 'ffffff' : '4CAF7D';
    return `pin-s+${color}(${shot.startCoords.lon},${shot.startCoords.lat})`;
  }).join(',');

  // Shot line as GeoJSON
  const coords = shots.map(s => [s.startCoords.lon, s.startCoords.lat]);
  coords.push([greenLon, greenLat]);
  const geojson = encodeURIComponent(JSON.stringify({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coords },
    properties: { stroke: '#4CAF7D', 'stroke-width': 2 },
  }));

  return `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/` +
    `geojson(${geojson}),${markers}/${centerLon},${centerLat},15/` +
    `375x210@2x?access_token=${MAPBOX_PUBLIC_TOKEN}`;
}

// ─── Lie colors ──────────────────────────────────────────────────────
const LIE_COLORS = {
  tee: '#60A5FA',
  fairway: '#4CAF7D',
  'light rough': '#A3E635',
  rough: '#A3E635',
  sand: '#FBBF24',
  trees: '#86EFAC',
  penalty: '#F87171',
  green: '#34D399',
};

function getLieColor(lie) {
  return LIE_COLORS[String(lie || '').toLowerCase()] || colors.text.secondary;
}

// ─── Club / Lie picker options ───────────────────────────────────────
const LIE_OPTIONS = ['Tee', 'Fairway', 'Light Rough', 'Rough', 'Sand', 'Trees', 'Penalty'];

// ─── Shot Row ────────────────────────────────────────────────────────
function ShotRow({ shot, index, isEditable, onEditClub, onEditLie, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const isPutt = String(shot.club || '').toLowerCase() === 'putter';

  return (
    <View>
      <TouchableOpacity
        style={styles.shotRow}
        onPress={() => isEditable && setExpanded(!expanded)}
        activeOpacity={isEditable ? 0.7 : 1}
      >
        <View style={styles.shotNumBadge}>
          <Text style={styles.shotNumText}>{shot.shotNumber}</Text>
        </View>
        <View style={styles.shotInfo}>
          <Text style={styles.shotClub}>{String(shot.club || '').toUpperCase()}</Text>
          <View style={[styles.lieDot, { backgroundColor: getLieColor(shot.lie) }]} />
          <Text style={styles.shotLie}>{shot.lie || '–'}</Text>
        </View>
        <Text style={styles.shotDistance}>
          {shot.distanceYards != null ? `${Math.round(shot.distanceYards)} yds` : '–'}
        </Text>
        {shot.addedRetrospectively && (
          <View style={styles.retroBadge}>
            <Text style={styles.retroBadgeText}>Added</Text>
          </View>
        )}
      </TouchableOpacity>

      {expanded && isEditable && (
        <View style={styles.shotActions}>
          <TouchableOpacity style={styles.shotActionBtn} onPress={() => { setExpanded(false); onEditClub?.(shot); }}>
            <Ionicons name="golf-outline" size={14} color={colors.text.primary} />
            <Text style={styles.shotActionText}>Edit Club</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shotActionBtn} onPress={() => { setExpanded(false); onEditLie?.(shot); }}>
            <Ionicons name="leaf-outline" size={14} color={colors.text.primary} />
            <Text style={styles.shotActionText}>Edit Lie</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shotActionBtnDanger} onPress={() => { setExpanded(false); onDelete?.(shot); }}>
            <Ionicons name="trash-outline" size={14} color={colors.score.double} />
            <Text style={[styles.shotActionText, { color: colors.score.double }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Lie Picker Inline ───────────────────────────────────────────────
function LiePicker({ currentLie, onSelect, onCancel }) {
  return (
    <View style={styles.pickerWrap}>
      <Text style={styles.pickerTitle}>Select Lie</Text>
      <View style={styles.pickerOptions}>
        {LIE_OPTIONS.map(lie => (
          <TouchableOpacity
            key={lie}
            style={[styles.pickerOption, currentLie === lie && styles.pickerOptionActive]}
            onPress={() => onSelect(lie)}
          >
            <View style={[styles.lieDot, { backgroundColor: getLieColor(lie) }]} />
            <Text style={[styles.pickerOptionText, currentLie === lie && styles.pickerOptionTextActive]}>
              {lie}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={styles.pickerCancel} onPress={onCancel}>
        <Text style={styles.pickerCancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main HoleReviewModal ────────────────────────────────────────────
export default function HoleReviewModal({
  visible,
  onClose,
  hole,           // { hole, par, hcp, score, putts, shots, conditions, playingYardage, gpsDistance, windAdj, tempAdj, elevAdj, mapSnapshotUrl, flags }
  courseName,
  isEditable = true,  // false after 24h or when read-only
  onScoreChange,
  onPuttsChange,
  onEditClub,     // (shot) => open club picker
  onEditLie,      // (shot, newLie) => update
  onDeleteShot,   // (shot) => confirm + delete
  onAddShot,      // () => open add shot form
}) {
  const [editingLieShot, setEditingLieShot] = useState(null);

  if (!hole) return null;

  const scoreLabel = getScoreLabel(hole.score, hole.par);
  const scoreName = getScoreName(scoreLabel);
  const scoreColor = getScoreColor(scoreLabel);

  const nonPutts = (hole.shots || []).filter(s => String(s.club || '').toLowerCase() !== 'putter');
  const putts = (hole.shots || []).filter(s => String(s.club || '').toLowerCase() === 'putter');

  const handleDeleteShot = (shot) => {
    Alert.alert(
      `Remove this shot from hole ${hole.hole}?`,
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDeleteShot?.(shot) },
      ],
    );
  };

  const handleLieSelect = (newLie) => {
    if (editingLieShot) {
      onEditLie?.(editingLieShot, newLie);
      setEditingLieShot(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modal} onPress={() => undefined}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Text style={styles.headerHole}>Hole {hole.hole}</Text>
                <Text style={styles.headerMeta}>Par {hole.par}  HCP {hole.hcp}</Text>
                {courseName ? <Text style={styles.headerCourse}>{courseName}</Text> : null}
              </View>
              <View style={styles.headerRight}>
                {hole.score != null && (
                  <View style={[styles.scoreBadge, { backgroundColor: scoreColor }]}>
                    <Text style={styles.scoreBadgeText}>{scoreName} ({hole.score})</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                <Ionicons name="close" size={20} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>

            {/* Satellite map snapshot */}
            {hole.mapSnapshotUrl ? (
              <View style={styles.mapWrap}>
                <Image
                  source={{ uri: hole.mapSnapshotUrl }}
                  style={styles.mapImage}
                  resizeMode="cover"
                />
              </View>
            ) : (
              <View style={[styles.mapWrap, styles.mapPlaceholder]}>
                <Ionicons name="map-outline" size={32} color={colors.text.tertiary} />
                <Text style={styles.mapPlaceholderText}>Map not available</Text>
              </View>
            )}

            {/* Shot list */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Shots</Text>
              {nonPutts.length === 0 && putts.length === 0 ? (
                <Text style={styles.emptyText}>No shots logged</Text>
              ) : (
                <>
                  {nonPutts.map((shot, i) => (
                    <ShotRow
                      key={`shot-${shot.shotNumber}`}
                      shot={shot}
                      index={i}
                      isEditable={isEditable}
                      onEditClub={onEditClub}
                      onEditLie={(shot) => setEditingLieShot(shot)}
                      onDelete={handleDeleteShot}
                    />
                  ))}
                  {putts.length > 0 && (
                    <View style={styles.puttsSection}>
                      <Text style={styles.puttsLabel}>Putts</Text>
                      {putts.map((shot) => (
                        <ShotRow
                          key={`putt-${shot.shotNumber}`}
                          shot={shot}
                          isEditable={isEditable}
                          onEditClub={onEditClub}
                          onEditLie={(shot) => setEditingLieShot(shot)}
                          onDelete={handleDeleteShot}
                        />
                      ))}
                    </View>
                  )}
                </>
              )}

              {/* Lie picker (inline) */}
              {editingLieShot && (
                <LiePicker
                  currentLie={editingLieShot.lie}
                  onSelect={handleLieSelect}
                  onCancel={() => setEditingLieShot(null)}
                />
              )}
            </View>

            {/* Score + Putts editor */}
            {hole.score != null && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Score</Text>
                <View style={styles.scoreEditRow}>
                  <View style={styles.scoreEditGroup}>
                    <Text style={styles.scoreEditLabel}>Score</Text>
                    <View style={styles.stepperRow}>
                      <TouchableOpacity
                        style={[styles.stepperBtn, !isEditable && styles.stepperBtnDisabled]}
                        disabled={!isEditable}
                        onPress={() => onScoreChange?.(Math.max(1, hole.score - 1))}
                      >
                        <Text style={styles.stepperBtnText}>−</Text>
                      </TouchableOpacity>
                      <Text style={styles.stepperValue}>{hole.score}</Text>
                      <TouchableOpacity
                        style={[styles.stepperBtn, !isEditable && styles.stepperBtnDisabled]}
                        disabled={!isEditable}
                        onPress={() => onScoreChange?.(Math.min(hole.par + 6, hole.score + 1))}
                      >
                        <Text style={styles.stepperBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.scoreEditGroup}>
                    <Text style={styles.scoreEditLabel}>Putts</Text>
                    <View style={styles.stepperRow}>
                      <TouchableOpacity
                        style={[styles.stepperBtn, !isEditable && styles.stepperBtnDisabled]}
                        disabled={!isEditable}
                        onPress={() => onPuttsChange?.(Math.max(0, hole.putts - 1))}
                      >
                        <Text style={styles.stepperBtnText}>−</Text>
                      </TouchableOpacity>
                      <Text style={styles.stepperValue}>{hole.putts}</Text>
                      <TouchableOpacity
                        style={[styles.stepperBtn, !isEditable && styles.stepperBtnDisabled]}
                        disabled={!isEditable}
                        onPress={() => onPuttsChange?.(Math.min(hole.score, hole.putts + 1))}
                      >
                        <Text style={styles.stepperBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* Conditions */}
            {hole.conditions && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Conditions</Text>
                <View style={styles.conditionsRow}>
                  {Number.isFinite(hole.conditions.windSpeed) && (
                    <View style={styles.conditionChip}>
                      <Ionicons name="flag-outline" size={12} color={colors.text.secondary} />
                      <Text style={styles.conditionText}>
                        {Math.round(hole.conditions.windSpeed)} mph {hole.conditions.windDir || ''}
                      </Text>
                    </View>
                  )}
                  {Number.isFinite(hole.conditions.tempF) && (
                    <View style={styles.conditionChip}>
                      <Ionicons name="thermometer-outline" size={12} color={colors.text.secondary} />
                      <Text style={styles.conditionText}>{Math.round(hole.conditions.tempF)}°F</Text>
                    </View>
                  )}
                  {Number.isFinite(hole.conditions.humidity) && (
                    <View style={styles.conditionChip}>
                      <Ionicons name="water-outline" size={12} color={colors.text.secondary} />
                      <Text style={styles.conditionText}>{Math.round(hole.conditions.humidity)}%</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Playing yardage */}
            {(hole.gpsDistance != null || hole.playingYardage != null) && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Yardage</Text>
                <View style={styles.yardageRow}>
                  {hole.gpsDistance != null && (
                    <View style={styles.yardageItem}>
                      <Text style={styles.yardageLabel}>GPS</Text>
                      <Text style={styles.yardageValue}>{Math.round(hole.gpsDistance)}</Text>
                    </View>
                  )}
                  {hole.playingYardage != null && (
                    <View style={styles.yardageItem}>
                      <Text style={styles.yardageLabel}>Playing</Text>
                      <Text style={styles.yardageValue}>{Math.round(hole.playingYardage)}</Text>
                    </View>
                  )}
                  {hole.windAdj != null && hole.windAdj !== 0 && (
                    <View style={styles.yardageItem}>
                      <Text style={styles.yardageLabel}>Wind</Text>
                      <Text style={styles.yardageValue}>{hole.windAdj > 0 ? '+' : ''}{hole.windAdj}</Text>
                    </View>
                  )}
                  {hole.tempAdj != null && hole.tempAdj !== 0 && (
                    <View style={styles.yardageItem}>
                      <Text style={styles.yardageLabel}>Temp</Text>
                      <Text style={styles.yardageValue}>{hole.tempAdj > 0 ? '+' : ''}{hole.tempAdj}</Text>
                    </View>
                  )}
                  {hole.elevAdj != null && hole.elevAdj !== 0 && (
                    <View style={styles.yardageItem}>
                      <Text style={styles.yardageLabel}>Elev</Text>
                      <Text style={styles.yardageValue}>{hole.elevAdj > 0 ? '+' : ''}{hole.elevAdj}</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Add missed shot button */}
            {isEditable && (
              <TouchableOpacity style={styles.addShotBtn} onPress={onAddShot}>
                <Ionicons name="add-circle-outline" size={18} color={colors.brand.primary} />
                <Text style={styles.addShotBtnText}>Add a shot to this hole</Text>
              </TouchableOpacity>
            )}

            <View style={{ height: spacing.xl }} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: spacing.lg,
  },
  modal: {
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: '85%',
    width: '100%',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  headerLeft: {
    flex: 1,
  },
  headerHole: {
    ...typography.headingLg,
    color: colors.text.primary,
  },
  headerMeta: {
    ...typography.bodyMd,
    color: colors.text.secondary,
    marginTop: 2,
  },
  headerCourse: {
    ...typography.bodySm,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  headerRight: {
    marginLeft: spacing.md,
    marginRight: spacing.xl,
  },
  scoreBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  scoreBadgeText: {
    ...typography.labelMd,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  closeBtn: {
    position: 'absolute',
    top: 0,
    right: 0,
    padding: spacing.xs,
  },

  // Map
  mapWrap: {
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  mapImage: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  mapPlaceholder: {
    height: MAP_HEIGHT,
    backgroundColor: colors.bg.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPlaceholderText: {
    ...typography.bodySm,
    color: colors.text.tertiary,
    marginTop: spacing.xs,
  },

  // Sections
  section: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.labelMd,
    color: colors.text.tertiary,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },

  // Shot row
  shotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  shotNumBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.bg.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  shotNumText: {
    ...typography.labelSm,
    color: colors.text.secondary,
  },
  shotInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  shotClub: {
    ...typography.labelMd,
    color: colors.text.primary,
    marginRight: spacing.sm,
  },
  lieDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  shotLie: {
    ...typography.bodySm,
    color: colors.text.secondary,
  },
  shotDistance: {
    ...typography.bodyMd,
    color: colors.text.primary,
    fontVariant: ['tabular-nums'],
  },
  retroBadge: {
    backgroundColor: colors.brand.primaryMuted,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginLeft: spacing.sm,
  },
  retroBadgeText: {
    ...typography.labelSm,
    color: colors.brand.primary,
  },

  // Shot actions
  shotActions: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    paddingLeft: 36,
    gap: spacing.sm,
  },
  shotActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.tertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    gap: 4,
  },
  shotActionBtnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    gap: 4,
  },
  shotActionText: {
    ...typography.labelSm,
    color: colors.text.primary,
  },

  // Putts section
  puttsSection: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  puttsLabel: {
    ...typography.labelSm,
    color: colors.text.tertiary,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },

  // Lie picker
  pickerWrap: {
    backgroundColor: colors.bg.tertiary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  pickerTitle: {
    ...typography.labelMd,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  pickerOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.elevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    gap: 6,
  },
  pickerOptionActive: {
    backgroundColor: colors.brand.primaryMuted,
    borderWidth: 1,
    borderColor: colors.brand.primaryBorder,
  },
  pickerOptionText: {
    ...typography.bodySm,
    color: colors.text.primary,
  },
  pickerOptionTextActive: {
    color: colors.brand.primary,
    fontWeight: '600',
  },
  pickerCancel: {
    marginTop: spacing.sm,
    alignSelf: 'flex-end',
  },
  pickerCancelText: {
    ...typography.labelSm,
    color: colors.text.tertiary,
  },

  // Score edit
  scoreEditRow: {
    flexDirection: 'row',
    gap: spacing.xxl,
  },
  scoreEditGroup: {
    alignItems: 'center',
  },
  scoreEditLabel: {
    ...typography.labelSm,
    color: colors.text.tertiary,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.bg.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnDisabled: {
    opacity: 0.3,
  },
  stepperBtnText: {
    fontSize: 18,
    color: colors.text.primary,
    fontWeight: '600',
  },
  stepperValue: {
    ...typography.headingSm,
    color: colors.text.primary,
    minWidth: 28,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },

  // Conditions
  conditionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  conditionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.tertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    gap: 4,
  },
  conditionText: {
    ...typography.bodySm,
    color: colors.text.secondary,
  },

  // Yardage
  yardageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  yardageItem: {
    alignItems: 'center',
  },
  yardageLabel: {
    ...typography.labelSm,
    color: colors.text.tertiary,
    textTransform: 'uppercase',
  },
  yardageValue: {
    ...typography.headingSm,
    color: colors.text.primary,
    fontVariant: ['tabular-nums'],
  },

  // Add shot button
  addShotBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.brand.primaryBorder,
    borderRadius: radius.md,
    borderStyle: 'dashed',
  },
  addShotBtnText: {
    ...typography.labelMd,
    color: colors.brand.primary,
  },

  // Empty
  emptyText: {
    ...typography.bodyMd,
    color: colors.text.tertiary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});
