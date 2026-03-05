import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { ImportSection } from '../types';
import { UI_COPY } from '../../../constants/uiCopy';

export interface ImportSectionTab {
  key: ImportSection;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export function useImportSectionTabs(isCompletedMode: boolean): ImportSectionTab[] {
  return useMemo(() => {
    const tabs: ImportSectionTab[] = [
      {
        key: 'photo',
        label: UI_COPY.scorecardImport.sectionTabPhoto,
        icon: 'camera-outline',
      },
      ...(isCompletedMode
        ? [
            {
              key: 'player' as const,
              label: UI_COPY.scorecardImport.sectionTabStats,
              icon: 'stats-chart-outline' as const,
            },
          ]
        : []),
      {
        key: 'course',
        label: UI_COPY.scorecardImport.sectionTabCourse,
        icon: 'golf-outline',
      },
      {
        key: 'yardages',
        label: UI_COPY.scorecardImport.sectionTabYardage,
        icon: 'resize-outline',
      },
    ];
    return tabs;
  }, [isCompletedMode]);
}

