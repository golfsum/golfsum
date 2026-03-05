import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

interface ExpandedScorecardModalProps {
  visible: boolean;
  currentHtml: string;
  onClose: () => void;
  styles: Record<string, any>;
  iframeRef: React.MutableRefObject<HTMLIFrameElement | null>;
  webStyles: Record<string, React.CSSProperties>;
}

export const ExpandedScorecardModal: React.FC<ExpandedScorecardModalProps> = ({
  visible,
  currentHtml,
  onClose,
  styles,
  iframeRef,
  webStyles,
}) => {
  if (!visible) return null;

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Scorecard</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close scorecard"
          >
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.modalContent}>
          <iframe
            ref={iframeRef as any}
            srcDoc={currentHtml}
            style={webStyles.expandedIframe}
            title="Scorecard Expanded"
            sandbox="allow-same-origin allow-scripts allow-forms"
          />
        </View>

        <View style={styles.modalFooter}>
          <Text style={styles.modalHint}>
            Click any cell to edit • Changes save automatically
          </Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
};
