import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface LeaveRoundModalProps {
  visible: boolean;
  currentHole: number;
  courseName?: string | null;
  holes: Array<{ score: number | null; isSaved?: boolean }>;
  onContinue: () => void;
  onEndRound: () => void;
  onAbandon: () => void;
  styles: any;
}

export const LeaveRoundModal: React.FC<LeaveRoundModalProps> = ({
  visible,
  currentHole,
  courseName,
  holes,
  onContinue,
  onEndRound,
  onAbandon,
  styles,
}) => {
  if (!visible) return null;

  const holesWithScores = holes.filter(h => h.isSaved || (h.score !== null && h.score > 0)).length;

  return (
    <View style={styles.modalOverlayDark}>
      <View style={styles.confirmModal}>
        <Text style={styles.confirmModalTitle}>Leave Round?</Text>
        <Text style={styles.confirmModalMessage}>
          You're currently on Hole {currentHole + 1} at {courseName}.
          {holesWithScores > 0
            ? `\n\nYou have ${holesWithScores} hole${holesWithScores === 1 ? '' : 's'} scored.`
            : `\n\nNo holes saved yet.`
          }
        </Text>

        <TouchableOpacity
          style={[styles.confirmModalButton, styles.confirmModalButtonPrimary]}
          onPress={onContinue}
        >
          <Text style={styles.confirmModalButtonText}>Continue Round</Text>
        </TouchableOpacity>

        {holesWithScores > 0 && (
          <TouchableOpacity
            style={styles.confirmModalButton}
            onPress={onEndRound}
          >
            <Text style={[styles.confirmModalButtonText, styles.confirmModalButtonTextSecondary]}>
              End Round
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.confirmModalButton, styles.confirmModalButtonDestructive]}
          onPress={onAbandon}
        >
          <Text style={[styles.confirmModalButtonText, styles.confirmModalButtonTextDestructive]}>
            Abandon Round
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
