import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { HoleDetail, TeeBox } from '../../services/golfCourseApiService';

export interface CourseRouteOption {
  id: string;
  label: string;
  holes: HoleDetail[];
}

interface CourseRoutingModalProps {
  visible: boolean;
  teeBox: TeeBox | null;
  routes: CourseRouteOption[];
  onClose: () => void;
  onSelectRoute: (route: CourseRouteOption) => void;
  styles: any;
}

const routeYardage = (holes: HoleDetail[]) => holes.reduce((sum, h) => sum + (h.yardage || 0), 0);
const routePar = (holes: HoleDetail[]) => holes.reduce((sum, h) => sum + (h.par || 0), 0);

export const CourseRoutingModal: React.FC<CourseRoutingModalProps> = ({
  visible,
  teeBox,
  routes,
  onClose,
  onSelectRoute,
  styles,
}) => {
  if (!visible || !teeBox) return null;

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.routingModalContent}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Choose 9s / Routing</Text>
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close routing picker"
          >
            <Ionicons name="close" size={24} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
        <Text style={styles.routingSubtitle}>
          {teeBox.name} has {teeBox.holes.length} holes. Pick the 9-hole or 18-hole routing for this round.
        </Text>
        <ScrollView>
          {routes.map((route) => (
            <TouchableOpacity
              key={route.id}
              style={styles.routingOption}
              onPress={() => onSelectRoute(route)}
              accessibilityRole="button"
              accessibilityLabel={`Select routing ${route.label}`}
            >
              <View style={styles.routingOptionRow}>
                <Text style={styles.routingOptionTitle}>{route.label}</Text>
                <Ionicons name="chevron-forward" size={16} color="#6B7280" />
              </View>
              <Text style={styles.routingOptionMeta}>
                {route.holes.length} holes • Par {routePar(route.holes)} • {routeYardage(route.holes)} yds
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
};

