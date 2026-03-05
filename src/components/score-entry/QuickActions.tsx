import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface QuickActionsProps {
  showScorecard: boolean;
  showSave: boolean;
  isLastHole: boolean;
  onOpenScorecard: () => void;
  onSave: () => void;
  styles: Record<string, any>;
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  showScorecard,
  showSave,
  isLastHole,
  onOpenScorecard,
  onSave,
  styles,
}) => (
  <>
    {showScorecard && (
      <TouchableOpacity
        style={styles.fullScorecardButton}
        onPress={onOpenScorecard}
        accessibilityRole="button"
        accessibilityLabel="View full scorecard"
      >
        <Ionicons name="grid" size={20} color="#10B981" />
        <Text style={styles.fullScorecardButtonText}>View Full Scorecard</Text>
      </TouchableOpacity>
    )}

    {showSave && (
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.saveButton}
          onPress={onSave}
          accessibilityRole="button"
          accessibilityLabel={isLastHole ? 'Save round' : 'Save hole'}
        >
          <Ionicons name={isLastHole ? 'flag' : 'arrow-forward-circle'} size={24} color="#fff" />
          <Text style={styles.saveButtonText}>{isLastHole ? 'Save Round' : 'Save Hole'}</Text>
        </TouchableOpacity>
      </View>
    )}
  </>
);
