import { TabName } from '../types';

export type AppScreen =
  | 'tabs'
  | 'course-search'
  | 'score-entry'
  | 'round-detail'
  | 'scorecard-view'
  | 'scorecard-import'
  | 'course-analytics'
  | 'pro-upgrade'
  | 'gps-round';

export type ActiveTab = TabName;
