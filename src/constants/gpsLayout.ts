/**
 * In-game GPS round layout — single source of truth for bar sizes, offsets, and z-index.
 * Prefer importing from here instead of scattering literals across GpsRoundScreen / HUD / chrome.
 */

/** Bottom bar + yardage strip heights (native round). */
export const GPS_BAR = {
  BOTTOM_ACTION: 48,
  YARDAGE: 0,
} as const;

/** Stacking order for GPS overlays. */
export const GPS_Z = {
  TOP_CHROME: 10,
  /** Right column in glass chrome (weather / FCB) */
  CHROME_COLUMN: 10,
  MAP_WEATHER_STRIP: 10,
  MAP_DISTANCE_BADGE: 10,
  MISSED_SHOT_BANNER: 11,
  /** Unused duplicate nudge styles kept for parity */
  MAP_LEGACY_NUDGE: 10,
  HUD_WRAP: 20,
  HUD_OVERLAY: 20,
  HUD_LINK_STACK: 11,
  HUD_NUDGE_CARD: 12,
  RIGHT_MAP_STACK: 25,
  LIE_TOAST: 25,
  PLACEMENT_MARKER: 20,
} as const;

/** Gaps measured upward from the top of the bottom action bar (same coordinate space as `bottom` on map overlays). */
export const GPS_ABOVE_BAR = {
  WORDMARK: 8,
  RIGHT_MAP_STACK: 12,
  /** Fallback when style omits safe-area (static StyleSheet row) */
  WORDMARK_STATIC: 6,
} as const;

/** Mapbox MapView logo / attribution corner offset. */
export const GPS_MAPBOX = {
  LOGO_ATTRIBUTION_EDGE: 8,
} as const;

/** Coaching nudge card sits above the HUD bottom bar by this amount. */
export const GPS_COACHING = {
  NUDGE_GAP_ABOVE_BAR: 14,
} as const;

/** Below this effective viewport height (after safe area), use compact spacing. */
export const GPS_VIEWPORT = {
  COMPACT_MAX_HEIGHT: 860,
} as const;

export const GPS_COMPACT = {
  toastBottom: { compact: 14, regular: 16 },
} as const;

export function getGpsCompactToastBottom(effectiveViewportHeight: number): number {
  const compact = effectiveViewportHeight <= GPS_VIEWPORT.COMPACT_MAX_HEIGHT;
  return compact ? GPS_COMPACT.toastBottom.compact : GPS_COMPACT.toastBottom.regular;
}

/** Floating HUD: gaps and insets (not typography). */
export const GPS_HUD = {
  /** Applied when `bottomInset` is provided by parent (trim inside padded safe area). */
  BOTTOM_INSET_TRIM: 8,
  /** Instruction banner / quiet links sit this many px above the bar + inset. */
  FLOAT_GAP: 8,
  NUDGE_HORIZONTAL_INSET: 14,
  INSTRUCTION_BANNER_INSET: 12,
} as const;

/** Glass chrome: spacing between measured sections */
export const GPS_CHROME = {
  WEATHER_BELOW_HEADER_GAP: 4,
  RIGHT_COLUMN_BELOW_CHROME_GAP: 4,
  RIGHT_COLUMN_EDGE: 10,
  HEADER_FALLBACK_HEIGHT: 88,
} as const;

/** Map overlay chips (plan / compare) — bottom offset from map view bottom. */
export const GPS_MAP_OVERLAY = {
  PLAN_NOTE_CHIP_BOTTOM: 60,
  PLAN_COMPARE_CHIP_BOTTOM: 100,
  PLAYING_DETAILS_TOP: 112,
  PLAYING_DETAILS_RIGHT: 10,
  /** Legacy shot pill row (if re-enabled): inset from map bottom */
  SHOT_ROW_GAP_ABOVE_BAR: 4,
  SHOT_ROW_LEFT: 10,
  SHOT_ROW_RIGHT_CLEAR: 84,
  /**
   * Floating panels above the bottom HUD (target card, duplicate nudge block, etc.).
   * Keep in sync with `GpsOverlay` / map chrome.
   */
  FLOATING_PANEL_BOTTOM_OFFSET: 76,
  LEGACY_NUDGE_INSET: 102,
} as const;

/** Right edge stack (green / plan pills). */
export const GPS_RIGHT_STACK = {
  EDGE: 12,
  GAP: 8,
} as const;

/**
 * Web `WebGpsRoundPreview` — static map preview; bar heights mirror native where possible.
 */
export const GPS_WEB_PREVIEW = {
  NAV: 52,
  HOLE_META: 32,
  HOLE_SELECTOR: 52,
  BOTTOM_BAR: 48,
  YARDAGE: 0,
  /** Wordmark offset above bottom bar (web uses a taller chrome stack). */
  WORDMARK_ABOVE_BAR: 22,
} as const;
