import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface MiniScorecardHole {
  hole: number;
  par: number;
  score: number | null;
  isSaved?: boolean;
}

interface MiniScorecardProps {
  holes: MiniScorecardHole[];
  expanded: boolean;
  onToggle: () => void;
  onSelectHole: (index: number) => void;
  styles: Record<string, any>;
}

const buildTotalLabel = (holes: MiniScorecardHole[]) => {
  const completed = holes.filter(h => h.isSaved || (h.score !== null && h.score > 0));
  if (completed.length === 0) return '—';
  const total = completed.reduce((sum, h) => sum + (h.score ?? h.par), 0);
  return total.toString();
};

export const MiniScorecard: React.FC<MiniScorecardProps> = ({
  holes,
  expanded,
  onToggle,
  onSelectHole,
  styles,
}) => {
  const frontHoles = holes.slice(0, 9);
  const backHoles = holes.slice(9, 18);
  const frontTotalLabel = buildTotalLabel(frontHoles);
  const backTotalLabel = buildTotalLabel(backHoles);

  const renderScoreCell = (hole: MiniScorecardHole) => {
    if (!hole.isSaved && (!hole.score || hole.score <= 0)) {
      return (
        <View style={[styles.miniScoreCell, styles.miniScoreCellEmpty]}>
          <Text style={styles.miniScoreCellTextMuted}>—</Text>
        </View>
      );
    }

    const effectiveScore = hole.score ?? hole.par;
    const diff = effectiveScore - hole.par;
    const scoreStyle =
      diff <= -1
        ? styles.miniScoreCellBirdie
        : diff === 0
          ? styles.miniScoreCellPar
          : styles.miniScoreCellBogey;

    return (
      <View style={[styles.miniScoreCell, scoreStyle]}>
        <Text style={styles.miniScoreCellText}>{effectiveScore}</Text>
      </View>
    );
  };

  return (
    <View style={styles.miniScorecard}>
      <TouchableOpacity
        style={styles.miniScorecardHeader}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Collapse scorecard' : 'Expand scorecard'}
      >
        <Text style={styles.miniScorecardTitle}>Scorecard</Text>
        <Text style={styles.miniScorecardChevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.miniScorecardGrid}>
          <View style={styles.miniScoreRow}>
            {frontHoles.map((hole, index) => (
              <TouchableOpacity
                key={`front-hole-${hole.hole}`}
                style={styles.miniScoreCell}
                onPress={() => onSelectHole(index)}
              >
                <Text style={styles.miniScoreCellTextMuted}>{hole.hole}</Text>
              </TouchableOpacity>
            ))}
            <View style={[styles.miniScoreCell, styles.miniScoreTotalCell]}>
              <Text style={styles.miniScoreTotalLabel}>OUT</Text>
            </View>
          </View>
          <View style={styles.miniScoreRow}>
            {frontHoles.map(hole => (
              <View key={`front-score-${hole.hole}`} style={styles.miniScoreCellWrap}>
                {renderScoreCell(hole)}
              </View>
            ))}
            <View style={[styles.miniScoreCell, styles.miniScoreTotalCell]}>
              <Text style={styles.miniScoreTotalValue}>{frontTotalLabel}</Text>
            </View>
          </View>

          {backHoles.length > 0 && (
            <>
              <View style={styles.miniScoreDivider} />
              <View style={styles.miniScoreRow}>
                {backHoles.map((hole, index) => (
                  <TouchableOpacity
                    key={`back-hole-${hole.hole}`}
                    style={styles.miniScoreCell}
                    onPress={() => onSelectHole(index + 9)}
                  >
                    <Text style={styles.miniScoreCellTextMuted}>{hole.hole}</Text>
                  </TouchableOpacity>
                ))}
                <View style={[styles.miniScoreCell, styles.miniScoreTotalCell]}>
                  <Text style={styles.miniScoreTotalLabel}>IN</Text>
                </View>
              </View>
              <View style={styles.miniScoreRow}>
                {backHoles.map(hole => (
                  <View key={`back-score-${hole.hole}`} style={styles.miniScoreCellWrap}>
                    {renderScoreCell(hole)}
                  </View>
                ))}
                <View style={[styles.miniScoreCell, styles.miniScoreTotalCell]}>
                  <Text style={styles.miniScoreTotalValue}>{backTotalLabel}</Text>
                </View>
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
};
