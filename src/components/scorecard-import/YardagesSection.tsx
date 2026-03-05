import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { UI_COPY } from '../../constants/uiCopy';
import type { ScorecardImportStyles } from '../ScorecardImportScreen.styles';

interface YardagesSectionProps {
  styles: ScorecardImportStyles;
  roundHoleCount: 9 | 18;
  pars: string[];
  hcpMen: string[];
  teeBoxes: { yardages: string[] }[];
  activeTeeIndex: number;
  yardageWidths: { hole: number; par: number; hcp: number; yds: number };
  onLayout: (width: number) => void;
  onOpenNumeric: (field: 'par' | 'hcpMen' | 'yardage', value: string, index?: number) => void;
}

export const YardagesSection: React.FC<YardagesSectionProps> = ({
  styles,
  roundHoleCount,
  pars,
  hcpMen,
  teeBoxes,
  activeTeeIndex,
  yardageWidths,
  onLayout,
  onOpenNumeric,
}) => {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{UI_COPY.scorecardImport.yardagesParTitle}</Text>
      <View
        style={styles.yardageColumns}
        onLayout={(event) => onLayout(event.nativeEvent.layout.width)}
      >
        <View style={styles.yardageColumn}>
          <Text style={styles.sectionSubtitle}>{UI_COPY.scorecardImport.front9Title}</Text>
          <View style={styles.yardageHeaderRow}>
            <Text style={[styles.yardageHeaderText, styles.yardageHoleCell, { width: yardageWidths.hole }]}>#</Text>
            <Text style={[styles.yardageHeaderText, styles.yardageParCell, { width: yardageWidths.par }]}>{UI_COPY.scorecardImport.yardageHeaderPar}</Text>
            <Text style={[styles.yardageHeaderText, styles.yardageHcpCell, { width: yardageWidths.hcp }]}>{UI_COPY.scorecardImport.yardageHeaderHcp}</Text>
            <Text style={[styles.yardageHeaderText, styles.yardageYardCell, { width: yardageWidths.yds }]}>{UI_COPY.scorecardImport.yardageHeaderYds}</Text>
          </View>
          {Array.from({ length: Math.min(9, roundHoleCount) }, (_, offset) => {
            const index = offset;
            return (
              <View key={index} style={styles.yardageRow}>
                <Text style={[styles.yardageHoleText, styles.yardageHoleCell, { width: yardageWidths.hole }]}>
                  {index + 1}
                </Text>
                <TouchableOpacity
                  style={[styles.yardageCell, styles.yardageParCell, { width: yardageWidths.par }]}
                  onPress={() => onOpenNumeric('par', pars[index], index)}
                  accessibilityRole="button"
                  accessibilityLabel={`Hole ${index + 1} par`}
                >
                  <Text style={styles.yardageCellText}>{pars[index] || '—'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.yardageCell, styles.yardageHcpCell, { width: yardageWidths.hcp }]}
                  onPress={() => onOpenNumeric('hcpMen', hcpMen[index], index)}
                  accessibilityRole="button"
                  accessibilityLabel={`Hole ${index + 1} handicap`}
                >
                  <Text style={styles.yardageCellText}>{hcpMen[index] || '—'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.yardageCell, styles.yardageYardCell, { width: yardageWidths.yds }]}
                  onPress={() =>
                    onOpenNumeric(
                      'yardage',
                      teeBoxes[activeTeeIndex]?.yardages[index] || '',
                      index
                    )
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Hole ${index + 1} yardage`}
                >
                  <Text style={styles.yardageCellText}>
                    {teeBoxes[activeTeeIndex]?.yardages[index] || '—'}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
          <View style={styles.nineTotalsColumn}>
            {(() => {
              const parTotal = pars
                .slice(0, Math.min(9, roundHoleCount))
                .reduce((sum, value) => sum + (parseInt(value, 10) || 0), 0);
              const yardageTotal = teeBoxes[activeTeeIndex]?.yardages
                .slice(0, Math.min(9, roundHoleCount))
                .reduce((sum, value) => sum + (parseInt(value, 10) || 0), 0) || 0;
              return (
                <>
                  <Text style={styles.nineTotalsLabel}>{UI_COPY.scorecardImport.yardageOut}</Text>
                  <Text style={styles.nineTotalsScore}>{UI_COPY.scorecardImport.yardageParPrefix.replace('{par}', String(parTotal))}</Text>
                  <Text style={styles.nineTotalsPutts}>{UI_COPY.scorecardImport.yardageYdsSuffix.replace('{yds}', yardageTotal.toLocaleString())}</Text>
                </>
              );
            })()}
          </View>
        </View>

        {roundHoleCount === 18 && (
          <View style={styles.yardageDivider} />
        )}

        {roundHoleCount === 18 && (
          <View style={styles.yardageColumn}>
            <Text style={styles.sectionSubtitle}>{UI_COPY.scorecardImport.back9Title}</Text>
            <View style={styles.yardageHeaderRow}>
              <Text style={[styles.yardageHeaderText, styles.yardageHoleCell, { width: yardageWidths.hole }]}>#</Text>
              <Text style={[styles.yardageHeaderText, styles.yardageParCell, { width: yardageWidths.par }]}>{UI_COPY.scorecardImport.yardageHeaderPar}</Text>
              <Text style={[styles.yardageHeaderText, styles.yardageHcpCell, { width: yardageWidths.hcp }]}>{UI_COPY.scorecardImport.yardageHeaderHcp}</Text>
              <Text style={[styles.yardageHeaderText, styles.yardageYardCell, { width: yardageWidths.yds }]}>{UI_COPY.scorecardImport.yardageHeaderYds}</Text>
            </View>
            {Array.from({ length: 9 }, (_, offset) => {
              const index = 9 + offset;
              return (
                <View key={index} style={styles.yardageRow}>
                  <Text style={[styles.yardageHoleText, styles.yardageHoleCell, { width: yardageWidths.hole }]}>
                    {index + 1}
                  </Text>
                  <TouchableOpacity
                    style={[styles.yardageCell, styles.yardageParCell, { width: yardageWidths.par }]}
                    onPress={() => onOpenNumeric('par', pars[index], index)}
                    accessibilityRole="button"
                    accessibilityLabel={`Hole ${index + 1} par`}
                  >
                    <Text style={styles.yardageCellText}>{pars[index] || '—'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.yardageCell, styles.yardageHcpCell, { width: yardageWidths.hcp }]}
                    onPress={() => onOpenNumeric('hcpMen', hcpMen[index], index)}
                    accessibilityRole="button"
                    accessibilityLabel={`Hole ${index + 1} handicap`}
                  >
                    <Text style={styles.yardageCellText}>{hcpMen[index] || '—'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.yardageCell, styles.yardageYardCell, { width: yardageWidths.yds }]}
                    onPress={() =>
                      onOpenNumeric(
                        'yardage',
                        teeBoxes[activeTeeIndex]?.yardages[index] || '',
                        index
                      )
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Hole ${index + 1} yardage`}
                  >
                    <Text style={styles.yardageCellText}>
                      {teeBoxes[activeTeeIndex]?.yardages[index] || '—'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
            <View style={styles.nineTotalsColumn}>
              {(() => {
                const parTotal = pars
                  .slice(9, 18)
                  .reduce((sum, value) => sum + (parseInt(value, 10) || 0), 0);
                const yardageTotal = teeBoxes[activeTeeIndex]?.yardages
                  .slice(9, 18)
                  .reduce((sum, value) => sum + (parseInt(value, 10) || 0), 0) || 0;
                return (
                  <>
                    <Text style={styles.nineTotalsLabel}>{UI_COPY.scorecardImport.yardageIn}</Text>
                    <Text style={styles.nineTotalsScore}>{UI_COPY.scorecardImport.yardageParPrefix.replace('{par}', String(parTotal))}</Text>
                    <Text style={styles.nineTotalsPutts}>{UI_COPY.scorecardImport.yardageYdsSuffix.replace('{yds}', yardageTotal.toLocaleString())}</Text>
                  </>
                );
              })()}
            </View>
          </View>
        )}
      </View>
    </View>
  );
};
