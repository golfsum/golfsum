import React, { useCallback, useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = Math.round(SCREEN_HEIGHT * 0.65);

// ─── Score colour helpers ────────────────────────────────────────────
function getScoreLabel(score, par) {
  if (score == null || par == null) return null;
  const diff = score - par;
  if (diff <= -2) return 'eagle';
  if (diff === -1) return 'birdie';
  if (diff === 0) return 'par';
  if (diff === 1) return 'bogey';
  return 'double';
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

function shouldShowCircle(label) {
  return label === 'eagle' || label === 'birdie';
}

function getFirDisplay(hole) {
  if (hole?.fairwayHit === true) return 'Y';
  if (hole?.fairwayHit === false) {
    if (hole?.fairwayMiss === 'left') return 'L';
    if (hole?.fairwayMiss === 'right') return 'R';
    if (hole?.fairwayMiss === 'bunker') return 'B';
    return 'N';
  }
  return '–';
}

function getGirDisplay(hole) {
  if (hole?.girAchieved === true) return 'Y';
  if (hole?.girAchieved === false) return 'N';
  return '–';
}

// ─── Subtotal helpers ────────────────────────────────────────────────
function sumScores(holes, start, end) {
  let total = 0;
  let count = 0;
  for (let i = start; i <= end && i < holes.length; i++) {
    if (holes[i].score != null) {
      total += holes[i].score;
      count++;
    }
  }
  return { total, count };
}

function sumPar(holes, start, end) {
  let total = 0;
  for (let i = start; i <= end && i < holes.length; i++) {
    total += holes[i].par;
  }
  return total;
}

// ─── Mock data for layout development ────────────────────────────────
const MOCK_HOLES = [
  { hole: 1, par: 4, hcp: 7,  score: 5, putts: 2, flagged: false },
  { hole: 2, par: 3, hcp: 15, score: 3, putts: 2, flagged: false },
  { hole: 3, par: 5, hcp: 1,  score: 6, putts: 2, flagged: false },
  { hole: 4, par: 4, hcp: 11, score: 4, putts: 1, flagged: false },
  { hole: 5, par: 4, hcp: 3,  score: 5, putts: 2, flagged: true },
  { hole: 6, par: 3, hcp: 17, score: 2, putts: 1, flagged: false },
  { hole: 7, par: 4, hcp: 9,  score: 4, putts: 2, flagged: false },
  { hole: 8, par: 5, hcp: 5,  score: 7, putts: 3, flagged: false },
  { hole: 9, par: 4, hcp: 13, score: 5, putts: 2, flagged: false },
  // Current hole (10) — score/putts live-updating
  { hole: 10, par: 4, hcp: 8,  score: null, putts: 0, flagged: false },
  // Future holes
  { hole: 11, par: 3, hcp: 16, score: null, putts: null, flagged: false },
  { hole: 12, par: 5, hcp: 2,  score: null, putts: null, flagged: false },
  { hole: 13, par: 4, hcp: 10, score: null, putts: null, flagged: false },
  { hole: 14, par: 4, hcp: 4,  score: null, putts: null, flagged: false },
  { hole: 15, par: 3, hcp: 18, score: null, putts: null, flagged: false },
  { hole: 16, par: 4, hcp: 12, score: null, putts: null, flagged: false },
  { hole: 17, par: 4, hcp: 6,  score: null, putts: null, flagged: false },
  { hole: 18, par: 5, hcp: 14, score: null, putts: null, flagged: false },
];

const MOCK_CURRENT_HOLE = 10;
const MOCK_COURSE_NAME = 'Pine Valley Golf Club';
const MOCK_TEE = 'Blue';
const MOCK_DATE = 'Mar 16, 2026';

// ─── Inline Score Editor ─────────────────────────────────────────────
function InlineScoreEditor({ hole, onDone, onReview, onScoreChange, onPuttsChange }) {
  return (
    <View style={styles.editorRow}>
      <View style={styles.editorHoleLabel}>
        <Text style={styles.editorHoleText}>Hole {hole.hole}</Text>
        <Text style={styles.editorParText}>Par {hole.par}  HCP {hole.hcp}</Text>
      </View>
      <View style={styles.editorControls}>
        <View style={styles.editorGroup}>
          <Text style={styles.editorLabel}>Score</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => onScoreChange(Math.max(1, hole.score - 1))}
            >
              <Text style={styles.stepperBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{hole.score}</Text>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => onScoreChange(Math.min(hole.par + 6, hole.score + 1))}
            >
              <Text style={styles.stepperBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.editorGroup}>
          <Text style={styles.editorLabel}>Putts</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => onPuttsChange(Math.max(0, hole.putts - 1))}
            >
              <Text style={styles.stepperBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{hole.putts}</Text>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => onPuttsChange(Math.min(hole.score, hole.putts + 1))}
            >
              <Text style={styles.stepperBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity style={styles.doneBtn} onPress={onDone}>
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
      {onReview && (
        <TouchableOpacity style={styles.reviewLink} onPress={onReview}>
          <Text style={styles.reviewLinkText}>Full hole review</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Hole Row ────────────────────────────────────────────────────────
function HoleRow({ hole, isCurrent, isFuture, isFlagged, onPress }) {
  const scoreLabel = getScoreLabel(hole.score, hole.par);
  const scoreColor = getScoreColor(scoreLabel);
  const circle = shouldShowCircle(scoreLabel);

  return (
    <TouchableOpacity
      style={[
        styles.row,
        isCurrent && styles.rowCurrent,
        isFuture && styles.rowFuture,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Hole number + flag */}
      <View style={styles.cellHole}>
        {isFlagged && <View style={styles.flagDot} />}
        <Text style={[styles.cellText, isCurrent && styles.cellTextCurrent, isFuture && styles.cellTextFuture]}>
          {hole.hole}
        </Text>
      </View>

      {/* Par */}
      <View style={styles.cellPar}>
        <Text style={[styles.cellText, isFuture && styles.cellTextFuture]}>
          {hole.par}
        </Text>
      </View>

      {/* HCP */}
      <View style={styles.cellHcp}>
        <Text style={[styles.cellTextSmall, isFuture && styles.cellTextFuture]}>
          {hole.hcp}
        </Text>
      </View>

      {/* Score */}
      <View style={styles.cellScore}>
        {hole.score != null ? (
          circle ? (
            <View style={[styles.scoreCircle, { backgroundColor: scoreColor }]}>
              <Text style={styles.scoreCircleText}>{hole.score}</Text>
            </View>
          ) : (
            <Text style={[styles.cellText, { color: scoreColor }]}>{hole.score}</Text>
          )
        ) : (
          <Text style={[styles.cellText, styles.cellTextDash]}>–</Text>
        )}
      </View>

      {/* Putts */}
      <View style={styles.cellPutts}>
        {hole.putts != null && hole.score != null ? (
          <Text style={[styles.cellText, isFuture && styles.cellTextFuture]}>{hole.putts}</Text>
        ) : (
          <Text style={[styles.cellText, styles.cellTextDash]}>–</Text>
        )}
      </View>

      <View style={styles.cellFir}>
        <Text style={[styles.cellTextSmall, isFuture && styles.cellTextFuture]}>{getFirDisplay(hole)}</Text>
      </View>

      <View style={styles.cellGir}>
        <Text style={[styles.cellTextSmall, isFuture && styles.cellTextFuture]}>{getGirDisplay(hole)}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Subtotal Row ────────────────────────────────────────────────────
function SubtotalRow({ label, scoreSub, parSub, count }) {
  const diff = scoreSub - parSub;
  const diffText = count > 0
    ? diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`
    : '';

  return (
    <View style={styles.subtotalRow}>
      <View style={styles.cellHole}>
        <Text style={styles.subtotalLabel}>{label}</Text>
      </View>
      <View style={styles.cellPar}>
        <Text style={styles.subtotalValue}>{parSub}</Text>
      </View>
      <View style={styles.cellHcp} />
      <View style={styles.cellScore}>
        <Text style={styles.subtotalValue}>{count > 0 ? scoreSub : '–'}</Text>
      </View>
      <View style={styles.cellPutts}>
        <Text style={[styles.subtotalDiff, diff > 0 && styles.subtotalOver, diff < 0 && styles.subtotalUnder]}>
          {diffText}
        </Text>
      </View>
      <View style={styles.cellFir} />
      <View style={styles.cellGir} />
    </View>
  );
}

// ─── Main ScorecardSheet ─────────────────────────────────────────────
export default function ScorecardSheet({
  visible,
  onClose,
  holes = MOCK_HOLES,
  currentHole = MOCK_CURRENT_HOLE,
  courseName = MOCK_COURSE_NAME,
  teeName = MOCK_TEE,
  dateLabel = MOCK_DATE,
  onHolePress,
  onReviewHole,
  onScoreChange,
  onPuttsChange,
}) {
  const [editingHole, setEditingHole] = useState(null);
  const scrollRef = useRef(null);

  const is18 = holes.length > 9;
  const front9 = holes.slice(0, 9);
  const back9 = is18 ? holes.slice(9, 18) : [];

  // Totals
  const frontScore = sumScores(holes, 0, 8);
  const frontPar = sumPar(holes, 0, 8);
  const backScore = is18 ? sumScores(holes, 9, 17) : { total: 0, count: 0 };
  const backPar = is18 ? sumPar(holes, 9, 17) : 0;
  const totalScore = frontScore.total + backScore.total;
  const totalPar = frontPar + backPar;
  const totalCount = frontScore.count + backScore.count;
  const totalDiff = totalScore - totalPar;

  // Header score display
  const headerScore = totalCount > 0
    ? totalDiff === 0 ? 'E' : totalDiff > 0 ? `+${totalDiff}` : `${totalDiff}`
    : '–';

  const handleRowPress = useCallback((hole, index) => {
    const holeNum = hole.hole;
    if (holeNum === currentHole) {
      // Current hole: dismiss scorecard, return to GPS screen
      onClose?.();
    } else if (hole.score != null) {
      // Completed hole: toggle inline score editor
      setEditingHole(editingHole === holeNum ? null : holeNum);
    } else {
      // Future hole: delegate to parent for navigation prompt
      onHolePress?.(holeNum);
    }
  }, [currentHole, editingHole, onClose, onHolePress]);

  const handleScoreChange = useCallback((holeNum, newScore) => {
    onScoreChange?.(holeNum, newScore);
  }, [onScoreChange]);

  const handlePuttsChange = useCallback((holeNum, newPutts) => {
    onPuttsChange?.(holeNum, newPutts);
  }, [onPuttsChange]);

  const renderHoleRow = (hole, index) => {
    const holeNum = hole.hole;
    const isCurrent = holeNum === currentHole;
    const isFuture = hole.score == null && !isCurrent;
    const isEditing = editingHole === holeNum && hole.score != null;

    if (isEditing) {
      return (
        <InlineScoreEditor
          key={holeNum}
          hole={hole}
          onDone={() => setEditingHole(null)}
          onReview={() => {
            setEditingHole(null);
            onReviewHole?.(holeNum);
          }}
          onScoreChange={(val) => handleScoreChange(holeNum, val)}
          onPuttsChange={(val) => handlePuttsChange(holeNum, val)}
        />
      );
    }

    return (
      <HoleRow
        key={holeNum}
        hole={hole}
        isCurrent={isCurrent}
        isFuture={isFuture}
        isFlagged={hole.flagged}
        onPress={() => handleRowPress(hole, index)}
      />
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.sheet, { height: SHEET_HEIGHT }]} onPress={() => undefined}>
          {/* Drag handle */}
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerCourse} numberOfLines={1}>{courseName}</Text>
              <Text style={styles.headerMeta}>{teeName} Tees  •  {dateLabel}</Text>
            </View>
            <View style={styles.headerRight}>
              <Text style={styles.headerScoreLabel}>Score</Text>
              <Text style={[
                styles.headerScoreValue,
                totalDiff > 0 && { color: colors.score.bogey },
                totalDiff < 0 && { color: colors.score.birdie },
              ]}>
                {headerScore}
              </Text>
              <Text style={styles.headerThru}>thru {totalCount}</Text>
            </View>
          </View>

          {/* Column headers */}
          <View style={styles.colHeaders}>
            <View style={styles.cellHole}><Text style={styles.colHeaderText}>HOLE</Text></View>
            <View style={styles.cellPar}><Text style={styles.colHeaderText}>PAR</Text></View>
            <View style={styles.cellHcp}><Text style={styles.colHeaderText}>HCP</Text></View>
            <View style={styles.cellScore}><Text style={styles.colHeaderText}>SCORE</Text></View>
            <View style={styles.cellPutts}><Text style={styles.colHeaderText}>PUTTS</Text></View>
            <View style={styles.cellFir}><Text style={styles.colHeaderText}>FIR</Text></View>
            <View style={styles.cellGir}><Text style={styles.colHeaderText}>GIR</Text></View>
          </View>

          {/* Scrollable hole list */}
          <ScrollView
            ref={scrollRef}
            style={styles.scrollArea}
            showsVerticalScrollIndicator={false}
          >
            {/* Front 9 */}
            {front9.map((h, i) => renderHoleRow(h, i))}

            {/* Front 9 subtotal */}
            <SubtotalRow
              label="OUT"
              scoreSub={frontScore.total}
              parSub={frontPar}
              count={frontScore.count}
            />

            {/* Back 9 */}
            {back9.map((h, i) => renderHoleRow(h, i + 9))}

            {/* Back 9 subtotal */}
            {is18 && (
              <SubtotalRow
                label="IN"
                scoreSub={backScore.total}
                parSub={backPar}
                count={backScore.count}
              />
            )}

            {/* Total row */}
            <View style={styles.totalRow}>
              <View style={styles.cellHole}>
                <Text style={styles.totalLabel}>TOT</Text>
              </View>
              <View style={styles.cellPar}>
                <Text style={styles.totalValue}>{totalPar}</Text>
              </View>
              <View style={styles.cellHcp} />
              <View style={styles.cellScore}>
                <Text style={styles.totalValue}>{totalCount > 0 ? totalScore : '–'}</Text>
              </View>
              <View style={styles.cellPutts}>
                <Text style={[
                  styles.totalDiff,
                  totalDiff > 0 && styles.subtotalOver,
                  totalDiff < 0 && styles.subtotalUnder,
                ]}>
                  {totalCount > 0
                    ? totalDiff === 0 ? 'E' : totalDiff > 0 ? `+${totalDiff}` : `${totalDiff}`
                    : ''}
                </Text>
              </View>
              <View style={styles.cellFir} />
              <View style={styles.cellGir} />
            </View>

            {/* Bottom spacing */}
            <View style={{ height: spacing.xl }} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────
const ROW_HEIGHT = 38;
const CELL_HOLE_WIDTH = 52;
const CELL_PAR_WIDTH = 44;
const CELL_HCP_WIDTH = 40;
const CELL_SCORE_WIDTH = 56;
const CELL_PUTTS_WIDTH = 48;
const CELL_FIR_WIDTH = 34;
const CELL_GIR_WIDTH = 34;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: colors.bg.secondary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },

  // Drag handle
  handleWrap: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  handle: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  headerLeft: {
    flex: 1,
    marginRight: spacing.md,
  },
  headerCourse: {
    ...typography.headingSm,
    color: colors.text.primary,
  },
  headerMeta: {
    ...typography.bodySm,
    color: colors.text.secondary,
    marginTop: 2,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  headerScoreLabel: {
    ...typography.labelSm,
    color: colors.text.tertiary,
    textTransform: 'uppercase',
  },
  headerScoreValue: {
    ...typography.statSm,
    color: colors.text.primary,
  },
  headerThru: {
    ...typography.bodySm,
    color: colors.text.tertiary,
    marginTop: -2,
  },

  // Column headers
  colHeaders: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 28,
    marginTop: spacing.sm,
  },
  colHeaderText: {
    ...typography.labelSm,
    color: colors.text.tertiary,
    textTransform: 'uppercase',
  },

  // Scroll area
  scrollArea: {
    flex: 1,
  },

  // Hole row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rowCurrent: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderRadius: radius.sm,
    borderBottomColor: 'transparent',
  },
  rowFuture: {
    opacity: 0.45,
  },

  // Cells
  cellHole: {
    width: CELL_HOLE_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cellPar: {
    width: CELL_PAR_WIDTH,
    alignItems: 'center',
  },
  cellHcp: {
    width: CELL_HCP_WIDTH,
    alignItems: 'center',
  },
  cellScore: {
    width: CELL_SCORE_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellPutts: {
    flex: 1,
    alignItems: 'center',
  },
  cellFir: {
    width: CELL_FIR_WIDTH,
    alignItems: 'center',
  },
  cellGir: {
    width: CELL_GIR_WIDTH,
    alignItems: 'center',
  },

  cellText: {
    ...typography.bodyMd,
    color: colors.text.primary,
    fontVariant: ['tabular-nums'],
  },
  cellTextSmall: {
    ...typography.bodySm,
    color: colors.text.secondary,
    fontVariant: ['tabular-nums'],
  },
  cellTextCurrent: {
    color: colors.brand.primary,
    fontWeight: '600',
  },
  cellTextFuture: {
    color: colors.text.tertiary,
  },
  cellTextDash: {
    color: colors.text.tertiary,
  },

  // Score circle (eagle/birdie)
  scoreCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreCircleText: {
    ...typography.labelMd,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },

  // Flagged hole amber dot
  flagDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.semantic.warning,
    marginRight: 4,
  },

  // Subtotal row
  subtotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW_HEIGHT,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: radius.sm,
    marginVertical: 2,
  },
  subtotalLabel: {
    ...typography.labelMd,
    color: colors.text.secondary,
  },
  subtotalValue: {
    ...typography.labelMd,
    color: colors.text.primary,
    fontVariant: ['tabular-nums'],
  },
  subtotalDiff: {
    ...typography.labelMd,
    color: colors.text.secondary,
    fontVariant: ['tabular-nums'],
  },
  subtotalOver: {
    color: colors.score.bogey,
  },
  subtotalUnder: {
    color: colors.score.birdie,
  },

  // Total row
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW_HEIGHT + 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.sm,
    marginTop: 2,
  },
  totalLabel: {
    ...typography.labelLg,
    color: colors.text.primary,
    fontWeight: '700',
  },
  totalValue: {
    ...typography.labelLg,
    color: colors.text.primary,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  totalDiff: {
    ...typography.labelLg,
    color: colors.text.secondary,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },

  // ─── Inline score editor ───────────────────────────────────────────
  editorRow: {
    backgroundColor: colors.bg.tertiary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginVertical: 2,
  },
  editorHoleLabel: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: spacing.sm,
  },
  editorHoleText: {
    ...typography.labelLg,
    color: colors.text.primary,
    marginRight: spacing.sm,
  },
  editorParText: {
    ...typography.bodySm,
    color: colors.text.secondary,
  },
  editorControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editorGroup: {
    alignItems: 'center',
    marginRight: spacing.xl,
  },
  editorLabel: {
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
  doneBtn: {
    backgroundColor: colors.brand.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    marginLeft: 'auto',
  },
  doneBtnText: {
    ...typography.labelMd,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  reviewLink: {
    marginTop: spacing.sm,
    alignSelf: 'flex-end',
  },
  reviewLinkText: {
    ...typography.labelSm,
    color: colors.brand.primary,
  },
});
