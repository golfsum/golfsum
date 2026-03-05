import { TabName } from '../types';

export type AppScreen =
  | 'tabs'
  | 'course-search'
  | 'score-entry'
  | 'round-detail'
  | 'scorecard-view'
  | 'scorecard-import'
  | 'course-analytics'
  | 'pro-upgrade';

export type ActiveTab = TabName;

