import React from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator, FlatList } from 'react-native';

interface CourseSearchModalProps {
  visible: boolean;
  query: string;
  loading: boolean;
  results: Array<{ id: string; name: string; city?: string; state?: string }>;
  onQueryChange: (value: string) => void;
  onSelect: (courseId: string) => void;
  onClose: () => void;
  styles: Record<string, any>;
}

export const CourseSearchModal: React.FC<CourseSearchModalProps> = ({
  visible,
  query,
  loading,
  results,
  onQueryChange,
  onSelect,
  onClose,
  styles,
}) => {
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.courseModal}>
          <Text style={styles.modalTitleText}>Find course</Text>
          <TextInput
            value={query}
            onChangeText={onQueryChange}
            placeholder="Search course name"
            placeholderTextColor="#6B7280"
            style={styles.modalInput}
            accessibilityLabel="Search course name"
          />
          {loading ? (
            <ActivityIndicator color="#10B981" style={{ marginTop: 12 }} />
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.courseResult}
                  onPress={() => onSelect(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Select course ${item.name}`}
                >
                  <Text style={styles.courseResultName}>{item.name}</Text>
                  <Text style={styles.courseResultMeta}>
                    {[item.city, item.state].filter(Boolean).join(', ')}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                query.trim().length >= 3 ? (
                  <Text style={styles.emptyResults}>No courses found.</Text>
                ) : null
              }
              style={{ maxHeight: 280 }}
            />
          )}
          <TouchableOpacity
            onPress={onClose}
            style={styles.modalButtonSecondary}
            accessibilityRole="button"
            accessibilityLabel="Close course search"
          >
            <Text style={styles.modalButtonSecondaryText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};
