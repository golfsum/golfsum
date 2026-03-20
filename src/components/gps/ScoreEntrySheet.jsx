import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getScoreColor } from '../../utils/scoreColors';

export default function ScoreEntrySheet({ visible, holeNumber, par, currentScore, onSave, onClose }) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = React.useState(currentScore);

  React.useEffect(() => {
    if (visible) setSelected(currentScore);
  }, [visible, currentScore]);

  const scoreColor = selected != null ? getScoreColor(selected, par) : 'rgba(255,255,255,0.3)';
  const diff = selected != null ? selected - par : null;
  const diffLabel = diff === 0 ? 'E' : diff != null ? (diff > 0 ? `+${diff}` : `${diff}`) : '';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.scrim} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.header}>
            <Text style={styles.headerText}>
              Hole {holeNumber}  ·  Par {par}
            </Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.chipRow}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => {
              const active = selected === num;
              const chipColor = getScoreColor(num, par);
              return (
                <TouchableOpacity
                  key={num}
                  style={[styles.chip, active && [styles.chipActive, { borderColor: chipColor + '80' }]]}
                  onPress={() => setSelected(num)}
                >
                  <Text style={[styles.chipText, active && { color: chipColor }]}>{num}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {selected != null && (
            <Text style={[styles.diffLabel, { color: scoreColor }]}>{diffLabel}</Text>
          )}

          <TouchableOpacity
            style={[styles.saveBtn, selected == null && styles.saveBtnDisabled]}
            onPress={() => { if (selected != null) { onSave(selected); onClose(); } }}
            disabled={selected == null}
          >
            <Text style={[styles.saveBtnText, selected == null && styles.saveBtnTextDisabled]}>Save score</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: 'rgba(12,12,12,0.96)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  chipRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  chip: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: 'rgba(26,200,85,0.15)',
    borderWidth: 1,
  },
  chipText: {
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
  },
  diffLabel: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 8,
  },
  saveBtn: {
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(18,110,45,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(26,200,75,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    color: '#3ddb72',
    fontSize: 13,
    fontWeight: '700',
  },
  saveBtnTextDisabled: {
    color: 'rgba(255,255,255,0.3)',
  },
});
