import type { ComponentType } from 'react';
import type { SavedRound } from '../types';

/**
 * Web stubs — Metro resolves `nativeScreens.native.ts` on iOS/Android.
 * These must stay assignable to the real components so `tsc` and web builds agree.
 */

export type NativeGpsRoundReviewScreenProps = {
  round: SavedRound;
  onBack: () => void;
};

export const NativeGpsRoundReviewScreen: ComponentType<NativeGpsRoundReviewScreenProps> | null =
  null;

export type NativeCoursePlanningScreenProps = {
  courseId: string;
  courseName?: string;
  teeColor?: string;
  uid: string | null;
  latitude?: number;
  longitude?: number;
  onBack: () => void;
  onStartGpsRound: (courseId: string, courseName?: string, teeColor?: string) => void;
};

export const NativeCoursePlanningScreen: ComponentType<NativeCoursePlanningScreenProps> | null =
  null;

/** Reserved for parity with `nativeScreens.native.ts` (GPS overlay may use AppRoot path). */
export const NativeGpsRoundScreen: ComponentType<Record<string, unknown>> | null = null;
