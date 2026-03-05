import { logger } from '../utils/logger';

export type AnalyticsEventName =
  | 'upgrade_sheet_shown'
  | 'upgrade_sheet_converted'
  | 'upgrade_sheet_dismissed'
  | 'upgrade_screen_viewed'
  | 'plan_selected'
  | 'purchase_initiated'
  | 'purchase_completed'
  | 'purchase_cancelled'
  | 'restore_attempted'
  | 'restore_result';

const SESSION_ID = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

export function logEvent(name: AnalyticsEventName, params?: Record<string, unknown>): void {
  logger.debug(`📈 ${name}`, {
    session_id: SESSION_ID,
    ...params,
  });
}
