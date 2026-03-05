import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface MissPattern {
  left: number;
  right: number;
  long?: number;
  short?: number;
  totalMisses: number;
}

interface ShotPatternHeatmapProps {
  par: 3 | 4 | 5;
  fairwayPattern?: MissPattern;
  greenPattern?: MissPattern;
}

export const ShotPatternHeatmap = ({
  par,
  fairwayPattern,
  greenPattern,
}: ShotPatternHeatmapProps) => {
  if (par === 3 && greenPattern) {
    return <GreenPatternVisualization pattern={greenPattern} />;
  }

  if ((par === 4 || par === 5) && (fairwayPattern || greenPattern)) {
    return (
      <View style={styles.dualPattern}>
        {fairwayPattern && (
          <View style={styles.patternColumn}>
            <Text style={styles.columnTitle}>Tee Shot</Text>
            <FairwayPatternVisualization pattern={fairwayPattern} />
          </View>
        )}
        
        {greenPattern && (
          <View style={styles.patternColumn}>
            <Text style={styles.columnTitle}>Approach</Text>
            <GreenPatternVisualization pattern={greenPattern} compact />
          </View>
        )}
      </View>
    );
  }

  return null;
};

// COMPLETELY REWRITTEN: Green pattern using flex layout
const GreenPatternVisualization = ({
  pattern,
  compact = false,
}: {
  pattern: MissPattern;
  compact?: boolean;
}) => {
  const { left, right, long = 0, short = 0 } = pattern;

  // Circle sizes
  const getDotSize = (percent: number) => {
    if (percent === 0) return 0;
    if (percent > 50) return compact ? 24 : 34;
    if (percent > 35) return compact ? 20 : 28;
    if (percent > 20) return compact ? 16 : 24;
    return compact ? 14 : 20;
  };

  const getDotColor = (percent: number) => {
    if (percent === 0) return 'transparent';
    if (percent > 50) return '#EF4444';
    if (percent > 35) return '#F59E0B';
    if (percent > 20) return '#FBBF24';
    return '#9CA3AF';
  };

  const getFontSize = (percent: number) => {
    if (percent === 0) return 0;
    if (compact) {
      if (percent > 50) return 13;
      if (percent > 35) return 12;
      return 11;
    } else {
      if (percent > 50) return 17;
      if (percent > 35) return 16;
      if (percent > 20) return 15;
      return 14;
    }
  };

  const targetSize = compact ? 14 : 18;

  return (
    <View style={styles.gridContainer}>
      {/* ROW 1: Top (Long) */}
      <View style={styles.gridRow}>
        <View style={styles.gridCell} />
        <View style={styles.gridCell}>
          {long > 0 && (
            <DotCircle
              size={getDotSize(long)}
              color={getDotColor(long)}
              fontSize={getFontSize(long)}
              percent={long}
            />
          )}
        </View>
        <View style={styles.gridCell} />
      </View>

      {/* ROW 2: Middle (Left, Center, Right) */}
      <View style={styles.gridRow}>
        {/* Left */}
        <View style={styles.gridCell}>
          {left > 0 && (
            <DotCircle
              size={getDotSize(left)}
              color={getDotColor(left)}
              fontSize={getFontSize(left)}
              percent={left}
            />
          )}
        </View>

        {/* Center target */}
        <View style={styles.gridCell}>
          <View style={[styles.centerTarget, { 
            width: targetSize, 
            height: targetSize,
            borderRadius: targetSize / 2,
          }]} />
        </View>

        {/* Right */}
        <View style={styles.gridCell}>
          {right > 0 && (
            <DotCircle
              size={getDotSize(right)}
              color={getDotColor(right)}
              fontSize={getFontSize(right)}
              percent={right}
            />
          )}
        </View>
      </View>

      {/* ROW 3: Bottom (Short) */}
      <View style={styles.gridRow}>
        <View style={styles.gridCell} />
        <View style={styles.gridCell}>
          {short > 0 && (
            <DotCircle
              size={getDotSize(short)}
              color={getDotColor(short)}
              fontSize={getFontSize(short)}
              percent={short}
            />
          )}
        </View>
        <View style={styles.gridCell} />
      </View>

      {/* Crosshair lines - OVERLAY on top of grid */}
      <View style={styles.crosshairContainer}>
        <View style={styles.crosshairHorizontal} />
        <View style={styles.crosshairVertical} />
      </View>

      {/* Labels */}
      {!compact && (
        <>
          <Text style={[styles.labelTop]}>Long</Text>
          <Text style={[styles.labelBottom]}>Short</Text>
          <Text style={[styles.labelLeft]}>Left</Text>
          <Text style={[styles.labelRight]}>Right</Text>
          <Text style={styles.labelCenter}>Center</Text>
        </>
      )}
    </View>
  );
};

// COMPLETELY REWRITTEN: Fairway pattern using flex layout
const FairwayPatternVisualization = ({
  pattern,
}: {
  pattern: MissPattern;
}) => {
  const { left, right } = pattern;
  const closeMagnitudes = left > 0 && right > 0 && Math.abs(left - right) <= 15;

  const getDotSize = (percent: number) => {
    if (percent === 0) return 0;
    const base =
      percent > 60 ? 28 :
      percent > 40 ? 24 :
      percent > 25 ? 20 :
      18;
    if (!closeMagnitudes) return base;
    return Math.max(14, base - 4);
  };

  const getDotColor = (percent: number) => {
    if (percent === 0) return 'transparent';
    if (percent > 60) return '#EF4444';
    if (percent > 40) return '#F59E0B';
    if (percent > 25) return '#FBBF24';
    return '#9CA3AF';
  };

  const getFontSize = (percent: number) => {
    if (percent === 0) return 0;
    if (percent > 60) return 16;
    if (percent > 40) return 15;
    return 14;
  };

  return (
    <View style={styles.fairwayContainer}>
      {/* Single row with 3 cells */}
      <View style={styles.fairwayRow}>
        {/* Left */}
        <View style={styles.fairwayCell}>
          {left > 0 && (
            <DotCircle
              size={getDotSize(left)}
              color={getDotColor(left)}
              fontSize={getFontSize(left)}
              percent={left}
            />
          )}
        </View>

        {/* Center target */}
        <View style={styles.fairwayCell}>
          <View style={[styles.centerTarget, { 
            width: 18, 
            height: 18,
            borderRadius: 9,
          }]} />
        </View>

        {/* Right */}
        <View style={styles.fairwayCell}>
          {right > 0 && (
            <DotCircle
              size={getDotSize(right)}
              color={getDotColor(right)}
              fontSize={getFontSize(right)}
              percent={right}
            />
          )}
        </View>
      </View>

      {/* Horizontal line - OVERLAY */}
      <View style={styles.fairwayLine} />

      {/* Labels */}
      <Text style={styles.fairwayLabelLeft}>Left</Text>
      <Text style={styles.fairwayLabelRight}>Right</Text>
      <Text style={styles.fairwayLabelCenter}>Center</Text>
    </View>
  );
};

// Simple reusable circle component
const DotCircle = ({
  size,
  color,
  fontSize,
  percent,
}: {
  size: number;
  color: string;
  fontSize: number;
  percent: number;
}) => {
  if (size === 0 || percent === 0) return null;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.3)',
      }}
    >
      <Text
        style={{
          fontSize,
          fontWeight: '700',
          color: '#FFFFFF',
          textAlign: 'center',
        }}
      >
        {percent}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  dualPattern: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 20,
    paddingHorizontal: 8,
  },
  patternColumn: {
    flex: 1,
    alignItems: 'center',
  },
  columnTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 16,
    textAlign: 'center',
  },

  // GREEN PATTERN (3x3 grid)
  gridContainer: {
    width: 140,
    height: 140,
    position: 'relative',
  },
  gridRow: {
    flex: 1,
    flexDirection: 'row',
  },
  gridCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerTarget: {
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },

  // Crosshairs for green pattern - absolute positioned OVER the grid
  crosshairContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none', // Allow touches to pass through
  },
  crosshairHorizontal: {
    position: 'absolute',
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
    top: '50%',
  },
  crosshairVertical: {
    position: 'absolute',
    height: '100%',
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
    left: '50%',
  },

  // Labels for green pattern
  labelTop: {
    position: 'absolute',
    top: 2,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
  },
  labelBottom: {
    position: 'absolute',
    bottom: 2,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
  },
  labelLeft: {
    position: 'absolute',
    left: 2,
    top: '50%',
    marginTop: -8,
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
  },
  labelRight: {
    position: 'absolute',
    right: 2,
    top: '50%',
    marginTop: -8,
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
  },
  labelCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    marginTop: 10,
    textAlign: 'center',
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '500',
  },

  // FAIRWAY PATTERN (1x3 grid)
  fairwayContainer: {
    width: 130,
    height: 70,
    position: 'relative',
  },
  fairwayRow: {
    flex: 1,
    flexDirection: 'row',
  },
  fairwayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Horizontal line for fairway - absolute positioned OVER the grid
  fairwayLine: {
    position: 'absolute',
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
    top: '50%',
  },

  // Labels for fairway
  fairwayLabelLeft: {
    position: 'absolute',
    left: 2,
    top: '50%',
    marginTop: -8,
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
  },
  fairwayLabelRight: {
    position: 'absolute',
    right: 2,
    top: '50%',
    marginTop: -8,
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
  },
  fairwayLabelCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    marginTop: 10,
    textAlign: 'center',
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '500',
  },
});
