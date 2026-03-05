import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GolfSumLogo } from '../ui/GolfSumLogo';

interface AboutSectionProps {
  expanded: boolean;
  onToggle: () => void;
  onOpenUrl: (url: string) => void;
  onShare: () => void;
  styles: any;
}

export const AboutSection: React.FC<AboutSectionProps> = ({
  expanded,
  onToggle,
  onOpenUrl,
  onShare,
  styles,
}) => (
  <View style={styles.section}>
    <TouchableOpacity style={styles.sectionHeader} onPress={onToggle}>
      <View style={styles.headerLeft}>
        <Ionicons name="information-circle" size={20} color="#10B981" />
        <Text style={styles.sectionTitle}>ABOUT</Text>
      </View>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color="#6B7280" />
    </TouchableOpacity>
    {expanded && (
      <View style={styles.sectionContent}>
        <View style={styles.appInfoRow}>
          <GolfSumLogo variant="about" />
          <Text style={styles.appVersion}>v1.0.0</Text>
        </View>
        <View style={styles.linkList}>
          <TouchableOpacity style={styles.linkItem} onPress={() => onOpenUrl('https://golfsum.app/tutorial')}>
            <Ionicons name="play-circle" size={20} color="#10B981" />
            <Text style={styles.linkText}>Tutorial and Help</Text>
            <Ionicons name="open-outline" size={16} color="#6B7280" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkItem} onPress={() => onOpenUrl('mailto:support@golfsum.com')}>
            <Ionicons name="mail" size={20} color="#10B981" />
            <Text style={styles.linkText}>Contact Support</Text>
            <Ionicons name="open-outline" size={16} color="#6B7280" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkItem} onPress={() => onOpenUrl('https://golfsum.com/privacy')}>
            <Ionicons name="shield-checkmark" size={20} color="#10B981" />
            <Text style={styles.linkText}>Privacy Policy</Text>
            <Ionicons name="open-outline" size={16} color="#6B7280" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkItem} onPress={() => onOpenUrl('https://golfsum.com/terms')}>
            <Ionicons name="document-text" size={20} color="#10B981" />
            <Text style={styles.linkText}>Terms of Service</Text>
            <Ionicons name="open-outline" size={16} color="#6B7280" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkItem} onPress={onShare}>
            <Ionicons name="share-social" size={20} color="#10B981" />
            <Text style={styles.linkText}>Share GolfSum</Text>
            <Ionicons name="chevron-forward" size={16} color="#6B7280" />
          </TouchableOpacity>
        </View>
        <Text style={[styles.creditsText, { marginTop: 10, color: '#9CA3AF' }]}>
          GolfSum Player Rating is a proprietary performance metric calculated by GolfSum. It is independent of the World Handicap System™ and is not a USGA Handicap Index®. GolfSum is not affiliated with, authorized by, or endorsed by the USGA or The R&A. GolfSum Player Rating cannot be used as an official handicap for competition purposes. For an official Handicap Index, register with a USGA-affiliated golf club.
        </Text>
        <Text style={styles.creditsText}>Made for golfers.</Text>
      </View>
    )}
  </View>
);
