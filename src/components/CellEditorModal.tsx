// Mobile-friendly cell editor with smart input methods
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UserProfile } from '../types';

interface CellEditorModalProps {
  visible: boolean;
  initialValue: string;
  rowLabel: string;
  columnIndex: number;
  userProfile?: UserProfile | null;
  onSave: (value: string) => void;
  onCancel: () => void;
}

type InputType = 'number' | 'score' | 'putts' | 'par' | 'distance' | 'fairway' | 'green' | 'updown' | 'club' | 'text';

export const CellEditorModal: React.FC<CellEditorModalProps> = ({
  visible,
  initialValue,
  rowLabel,
  columnIndex,
  userProfile,
  onSave,
  onCancel,
}) => {
  const [value, setValue] = useState(initialValue);
  const [inputType, setInputType] = useState<InputType>('text');

  // Detect input type based on row label
  useEffect(() => {
    const label = rowLabel.toUpperCase();
    const isHoleColumn = (columnIndex >= 1 && columnIndex <= 9) || (columnIndex >= 12 && columnIndex <= 20);
    const isTeeRow = /^(CHAMPIONSHIP|TOURNAMENT|TIPS|BLACK|BLUE|WHITE|GOLD|RED|GREEN|GRAY|GREY|SILVER)\b/.test(label);
    const isHeaderRow = label === 'HOLE' || label === 'HANDICAP';
    
    // Summary columns (OUT, IN, TOT)
    if (columnIndex === 10 || columnIndex === 21 || columnIndex === 22) {
      setInputType('number');
    }
    // Par row
    else if (label === 'PAR') {
      setInputType('par');
    }
    // Score rows
    else if (label === '' || label.match(/^\d/) || label === 'SCORE') {
      setInputType('score');
    }
    // Putts
    else if (label === 'P' || label.includes('PUTT')) {
      setInputType('putts');
    }
    // Approach distance
    else if (label.includes('APPROACH') && label.includes('DIST')) {
      setInputType('distance');
    }
    // Fairways
    else if (label === 'F' || label === 'FIR' || label.includes('FAIRWAY')) {
      setInputType('fairway');
    }
    // Greens
    else if (label === 'G' || label === 'GIR' || label.includes('GREEN')) {
      setInputType('green');
    }
    // Up/Down
    else if (label.includes('UP') || label.includes('DOWN') || label.includes('SAVE')) {
      setInputType('updown');
    }
    // Club selection rows
    else if (label === 'TEE' || label.includes('APPROACH') || label === 'CHIP') {
      setInputType('club');
    }
    // Default to text
    else {
      if (isHoleColumn && !isHeaderRow && !isTeeRow) {
        setInputType('score');
      } else {
        setInputType('text');
      }
    }
    
    setValue(initialValue);
  }, [rowLabel, columnIndex, initialValue]);

  const handleSave = () => {
    onSave(value);
  };

  const saveAndClose = (nextValue: string) => {
    setValue(nextValue);
    onSave(nextValue);
  };

  // Get club options from user's bag
  const getClubOptions = (): string[] => {
    const clubs: string[] = [];
    
    if (!userProfile) {
      // Default club list
      return ['D', '3W', '5W', '7W', '3H', '4H', '5H', '4i', '5i', '6i', '7i', '8i', '9i', 'PW', 'GW', 'SW', 'LW', 'P'];
    }
    
    if (userProfile.bag.driver) clubs.push('D');
    clubs.push(...userProfile.bag.woods);
    clubs.push(...userProfile.bag.hybrids);
    clubs.push(...userProfile.bag.irons);
    clubs.push(...userProfile.bag.wedges);
    if (userProfile.bag.putter) clubs.push('P');
    
    return clubs;
  };

  // Render number button grid (quick pick)
  const renderNumberGrid = () => {
    let options: string[] = [];
    
    if (inputType === 'par') {
      options = ['3', '4', '5', '6', '7'];
    } else if (inputType === 'putts') {
      options = ['0', '1', '2', '3', '4', '5'];
    } else if (inputType === 'score') {
      options = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'];
    } else if (inputType === 'distance') {
      options = ['50', '75', '100', '125', '150', '175', '200', '225', '250', '275', '300'];
    } else {
      options = [
        '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40',
        '41', '42', '43', '44', '45', '46', '47', '48', '49', '50',
        '60', '61', '62', '63', '64', '65', '66', '67', '68', '69',
        '70', '71', '72', '73', '74', '75', '76', '77', '78', '79', '80',
      ];
    }

    return (
      <ScrollView contentContainerStyle={styles.numberGrid} showsVerticalScrollIndicator={false}>
        {options.map((option) => (
          <TouchableOpacity
            key={option}
            style={[
              styles.numberGridButton,
              value === option && styles.numberGridButtonActive,
            ]}
            onPress={() => saveAndClose(option)}
          >
            <Text
              style={[
                styles.numberGridText,
                value === option && styles.numberGridTextActive,
              ]}
            >
              {option}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  // Render symbol selector (fairways, greens, up/down)
  const renderSymbolSelector = () => {
    let options: Array<{ value: string; label: string; icon?: string }> = [];
    const prefs = userProfile?.scoringPreferences;

    if (inputType === 'fairway') {
      const useYesNo = prefs ? !prefs.trackFairways : false;
      if (useYesNo) {
        options = [
          { value: prefs?.fairwaySymbols.hit || 'û', label: 'Yes', icon: 'checkmark' },
          { value: 'X', label: 'No', icon: 'close' },
          { value: prefs?.fairwaySymbols.notApplicable || '', label: '—', icon: 'remove' },
        ];
      } else {
        options = [
          { value: prefs?.fairwaySymbols.hit || 'û', label: 'Hit', icon: 'checkmark' },
          { value: 'X', label: 'Miss', icon: 'close' },
          { value: prefs?.fairwaySymbols.missRight || '', label: 'Right', icon: 'arrow-forward' },
          { value: prefs?.fairwaySymbols.missLeft || '', label: 'Left', icon: 'arrow-back' },
          { value: prefs?.fairwaySymbols.notApplicable || '', label: '—', icon: 'remove' },
        ];
      }
    } else if (inputType === 'green') {
      const useYesNo = prefs ? !prefs.trackGreens : false;
      if (useYesNo) {
        options = [
          { value: prefs?.greenSymbols.hit || 'û', label: 'Yes', icon: 'checkmark' },
          { value: 'X', label: 'No', icon: 'close' },
          { value: '', label: '—', icon: 'remove' },
        ];
      } else {
        options = [
          { value: prefs?.greenSymbols.hit || 'û', label: 'Hit', icon: 'checkmark' },
          { value: 'X', label: 'Miss', icon: 'close' },
          { value: prefs?.greenSymbols.missRight || '', label: 'Right', icon: 'arrow-forward' },
          { value: prefs?.greenSymbols.missLeft || '', label: 'Left', icon: 'arrow-back' },
          { value: prefs?.greenSymbols.missLong || '', label: 'Long', icon: 'arrow-up' },
          { value: prefs?.greenSymbols.missShort || '', label: 'Short', icon: 'arrow-down' },
          { value: '', label: '—', icon: 'remove' },
        ];
      }
    } else if (inputType === 'updown') {
      const useYesNo = prefs ? !prefs.trackUpDown : false;
      if (useYesNo) {
        options = [
          { value: 'û', label: 'Yes', icon: 'checkmark' },
          { value: 'X', label: 'No', icon: 'close' },
          { value: '', label: '—', icon: 'remove' },
        ];
      } else {
        options = [
          { value: 'û', label: 'Made', icon: 'checkmark-circle' },
          { value: 'X', label: 'Missed', icon: 'close-circle' },
          { value: '', label: '—', icon: 'remove' },
        ];
      }
    }

    return (
      <View style={styles.symbolGrid}>
        {options.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.symbolButton,
              value === option.value && styles.symbolButtonActive
            ]}
            onPress={() => saveAndClose(option.value)}
          >
            {option.icon && (
              <Ionicons 
                name={option.icon as any} 
                size={32} 
                color={value === option.value ? '#FFFFFF' : '#10B981'} 
              />
            )}
            <Text style={[
              styles.symbolLabel,
              value === option.value && styles.symbolLabelActive
            ]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  // Render club selector
  const renderClubSelector = () => {
    const clubs = getClubOptions();
    
    return (
      <ScrollView style={styles.clubScroll} contentContainerStyle={styles.clubGrid}>
        <TouchableOpacity
          style={[styles.clubButton, value === '' && styles.clubButtonActive]}
          onPress={() => saveAndClose('')}
        >
          <Text style={[styles.clubText, value === '' && styles.clubTextActive]}>
            —
          </Text>
        </TouchableOpacity>
        
        {clubs.map((club) => (
          <TouchableOpacity
            key={club}
            style={[styles.clubButton, value === club && styles.clubButtonActive]}
            onPress={() => saveAndClose(club)}
          >
            <Text style={[styles.clubText, value === club && styles.clubTextActive]}>
              {club}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  // Render appropriate input based on type
  const renderInput = () => {
    switch (inputType) {
      case 'score':
      case 'putts':
      case 'par':
      case 'distance':
      case 'number':
        return renderNumberGrid();
      case 'fairway':
      case 'green':
      case 'updown':
        return renderSymbolSelector();
      case 'club':
        return renderClubSelector();
      default:
        // For text/other, use default contenteditable (desktop)
        return (
          <View style={styles.textInputContainer}>
            <Text style={styles.textInputLabel}>Tap cell to edit (desktop mode)</Text>
          </View>
        );
    }
  };

  const getTitle = () => {
    if (inputType === 'score') return 'Select Score';
    if (inputType === 'par') return 'Select Par';
    if (inputType === 'putts') return 'Select Putts';
    if (inputType === 'distance') return 'Approach Distance';
    if (inputType === 'fairway') return 'Fairway Result';
    if (inputType === 'green') return 'Green in Regulation';
    if (inputType === 'updown') return 'Up & Down';
    if (inputType === 'club') return 'Select Club';
    return 'Edit Cell';
  };

  const getRowName = () => {
    const trimmed = rowLabel.trim();
    return trimmed.length > 0 ? trimmed : 'Score';
  };

  const getColumnLabel = () => {
    if (columnIndex === 0) return 'Row Label';
    if (columnIndex >= 1 && columnIndex <= 9) return `Hole ${columnIndex}`;
    if (columnIndex === 10) return 'OUT';
    if (columnIndex === 11) return 'INITIAL';
    if (columnIndex >= 12 && columnIndex <= 20) return `Hole ${columnIndex - 2}`;
    if (columnIndex === 21) return 'IN';
    if (columnIndex === 22) return 'TOT';
    return `Column ${columnIndex}`;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onCancel}>
              <Ionicons name="close" size={24} color="#9CA3AF" />
            </TouchableOpacity>
            <Text style={styles.title}>{getTitle()}</Text>
            <TouchableOpacity onPress={handleSave}>
              <Ionicons name="checkmark" size={24} color="#10B981" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View style={styles.content}>
            <View style={styles.context}>
              <Text style={styles.contextTitle}>
                Edit {getColumnLabel()} - {getRowName()}
              </Text>
              <Text style={styles.contextSubtitle}>
                Current value: {initialValue?.trim() ? initialValue : 'Blank'}
              </Text>
            </View>
            {renderInput()}
          </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity 
              style={styles.cancelButton} 
              onPress={onCancel}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.saveButton} 
              onPress={handleSave}
            >
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#1a2028',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a3038',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  content: {
    padding: 20,
    minHeight: 200,
  },
  context: {
    alignItems: 'center',
    marginBottom: 16,
  },
  contextTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  contextSubtitle: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 4,
  },
  
  // Number Grid
  numberGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    paddingBottom: 12,
  },
  numberGridButton: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: '#252d38',
    borderWidth: 2,
    borderColor: '#2a3038',
    justifyContent: 'center',
    alignItems: 'center',
  },
  numberGridButtonActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  numberGridText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  numberGridTextActive: {
    color: '#FFFFFF',
  },
  
  // Symbol Selector
  symbolGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  symbolButton: {
    width: 100,
    height: 100,
    borderRadius: 12,
    backgroundColor: '#252d38',
    borderWidth: 2,
    borderColor: '#2a3038',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  symbolButtonActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  symbolLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  symbolLabelActive: {
    color: '#FFFFFF',
  },
  
  // Club Selector
  clubScroll: {
    maxHeight: 300,
  },
  clubGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingBottom: 20,
  },
  clubButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#252d38',
    borderWidth: 2,
    borderColor: '#2a3038',
    minWidth: 70,
    alignItems: 'center',
  },
  clubButtonActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  clubText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  clubTextActive: {
    color: '#FFFFFF',
  },
  
  // Text Input
  textInputContainer: {
    padding: 20,
    alignItems: 'center',
  },
  textInputLabel: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  
  // Actions
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#252d38',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#10B981',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
