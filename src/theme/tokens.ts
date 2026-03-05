export const colors = {
  bg: {
    primary: '#0f1419',
    secondary: '#1a2028',
    tertiary: '#242d38',
    elevated: '#2a3442',
  },
  border: {
    subtle: 'rgba(255, 255, 255, 0.12)',
    default: 'rgba(255, 255, 255, 0.2)',
  },
  brand: {
    primary: '#10B981',
    primaryMuted: 'rgba(16, 185, 129, 0.15)',
    primaryBorder: 'rgba(16, 185, 129, 0.3)',
  },
  text: {
    primary: '#E5E7EB',
    secondary: '#9CA3AF',
    tertiary: '#7B8291',
    inverse: '#0f1419',
  },
  semantic: {
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
  },
  score: {
    eagle: '#8B5CF6',
    birdie: '#10B981',
    par: '#E5E7EB',
    bogey: '#F59E0B',
    double: '#EF4444',
    triple: '#DC2626',
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
};

export const typography = {
  displayLg: { fontSize: 32, fontWeight: '700' as const, lineHeight: 40 },
  displayMd: { fontSize: 28, fontWeight: '700' as const, lineHeight: 36 },
  displaySm: { fontSize: 24, fontWeight: '700' as const, lineHeight: 32 },

  headingLg: { fontSize: 20, fontWeight: '600' as const, lineHeight: 28 },
  headingMd: { fontSize: 18, fontWeight: '600' as const, lineHeight: 26 },
  headingSm: { fontSize: 16, fontWeight: '600' as const, lineHeight: 24 },

  bodyLg: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  bodyMd: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  bodySm: { fontSize: 12, fontWeight: '400' as const, lineHeight: 16 },

  labelLg: { fontSize: 14, fontWeight: '600' as const, lineHeight: 20 },
  labelMd: { fontSize: 12, fontWeight: '600' as const, lineHeight: 16 },
  labelSm: { fontSize: 10, fontWeight: '600' as const, lineHeight: 14, letterSpacing: 0.5 },

  statLg: { fontSize: 36, fontWeight: '700' as const, lineHeight: 44, fontVariant: ['tabular-nums'] as const },
  statMd: { fontSize: 28, fontWeight: '700' as const, lineHeight: 36, fontVariant: ['tabular-nums'] as const },
  statSm: { fontSize: 20, fontWeight: '600' as const, lineHeight: 28, fontVariant: ['tabular-nums'] as const },
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
};
