import React from 'react';
import { View, Text, StyleSheet, Platform, Image } from 'react-native';

interface GolfSumLogoProps {
  /** 'header' = compact row for top bar, 'splash' = large centered for onboarding/splash */
  variant?: 'header' | 'splash' | 'about';
  /** Override the main text color (default: white) */
  color?: string;
  /** Show tagline (default: true) */
  showTagline?: boolean;
}

/**
 * GolfSum branded logo matching the official wordmark.
 * Renders "GOLFSUM" in a bold serif-style + "Capture · Analyze · Improve" tagline.
 * White on the dark app background for maximum contrast and polish.
 */
export const GolfSumLogo: React.FC<GolfSumLogoProps> = ({
  variant = 'header',
  color,
  showTagline = true,
}) => {
  const isHeader = variant === 'header';
  const isSplash = variant === 'splash';
  const isAbout = variant === 'about';

  const mainColor = color ?? '#FFFFFF';
  const accentColor = '#10B981';

  if (isAbout) {
    return (
      <View style={aboutStyles.container}>
        <View style={aboutStyles.iconBox}>
          <Image
            source={require('../../../assets/icon.png')}
            style={aboutStyles.iconImage}
            resizeMode="cover"
            accessibilityLabel="GolfSum"
          />
        </View>
        <View style={aboutStyles.textColumn}>
          <Text style={[aboutStyles.wordmark, { color: mainColor }]}>
            GOLF<Text style={{ color: accentColor }}>SUM</Text>
          </Text>
          <Text style={aboutStyles.tagline}>CAPTURE • ANALYZE • IMPROVE</Text>
        </View>
      </View>
    );
  }

  if (isSplash) {
    return (
      <View style={splashStyles.container}>
        <View style={splashStyles.iconRow}>
          <View style={splashStyles.accentBar} />
        </View>
        <Text style={[splashStyles.wordmark, { color: mainColor }]}>
          GOLF<Text style={{ color: accentColor }}>SUM</Text>
        </Text>
        {showTagline && (
          <>
            <Text style={splashStyles.tagline}>CAPTURE • ANALYZE • IMPROVE</Text>
            <View style={splashStyles.bottomAccentBar} />
          </>
        )}
      </View>
    );
  }

  // Header variant (compact)
  return (
    <View style={headerStyles.container}>
      <View style={headerStyles.iconBox}>
        <Image
          source={require('../../../assets/icon.png')}
          style={headerStyles.iconImage}
          resizeMode="cover"
          accessibilityLabel="GolfSum"
        />
      </View>
      <View style={headerStyles.textColumn}>
        <Text style={[headerStyles.wordmark, { color: mainColor }]}>
          GOLF<Text style={{ color: accentColor }}>SUM</Text>
        </Text>
        {showTagline && (
          <Text style={headerStyles.tagline}>CAPTURE • ANALYZE • IMPROVE</Text>
        )}
      </View>
    </View>
  );
};

const fontFamily = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const sansFontFamily = Platform.OS === 'ios' ? 'System' : 'sans-serif';

const headerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#0f1419',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  iconImage: {
    width: '100%',
    height: '100%',
  },
  textColumn: {
    justifyContent: 'center',
  },
  wordmark: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: 2.5,
    fontFamily,
    color: '#FFFFFF',
  },
  tagline: {
    fontSize: 8.5,
    fontWeight: '500',
    color: '#10B981',
    letterSpacing: 2,
    marginTop: 1,
    fontFamily: sansFontFamily,
  },
});

const splashStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginBottom: 24,
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
  },
  iconRow: {
    marginBottom: 16,
    width: '100%',
    alignItems: 'center',
  },
  accentBar: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: '#10B981',
  },
  wordmark: {
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: 5,
    fontFamily,
    color: '#FFFFFF',
  },
  tagline: {
    fontSize: 13,
    fontWeight: '500',
    color: '#10B981',
    letterSpacing: 3,
    marginTop: 8,
    marginBottom: 8,
    fontFamily: sansFontFamily,
  },
  bottomAccentBar: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: '#10B981',
  },
});

const aboutStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: '#0f1419',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  iconImage: {
    width: '100%',
    height: '100%',
  },
  textColumn: {
    justifyContent: 'center',
  },
  wordmark: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
    fontFamily,
  },
  tagline: {
    fontSize: 9,
    fontWeight: '500',
    color: '#10B981',
    letterSpacing: 1.3,
    marginTop: 1,
    fontFamily: sansFontFamily
  },
});
