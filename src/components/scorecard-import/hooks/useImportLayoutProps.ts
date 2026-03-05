import { useMemo } from 'react';
import type { ImportSection } from '../types';
import type { ImportScreenLayoutProps } from '../ImportScreenLayout';

interface Params {
  title: ImportScreenLayoutProps['title'];
  onBack: ImportScreenLayoutProps['onBack'];
  topSummaryProps: ImportScreenLayoutProps['topSummaryProps'];
  sectionTabsRef: ImportScreenLayoutProps['tabsHeaderProps']['sectionTabsRef'];
  sectionTabs: ImportScreenLayoutProps['tabsHeaderProps']['sectionTabs'];
  activeSection: ImportSection;
  goToSection: ImportScreenLayoutProps['tabsHeaderProps']['goToSection'];
  setSectionTabsWidth: ImportScreenLayoutProps['tabsHeaderProps']['setSectionTabsWidth'];
  sectionTabLayouts: ImportScreenLayoutProps['tabsHeaderProps']['sectionTabLayouts'];
  playerStatsPanelProps: ImportScreenLayoutProps['playerStatsPanelProps'];
  deferredSectionsProps: ImportScreenLayoutProps['deferredSectionsProps'];
  stickySaveBarProps: ImportScreenLayoutProps['stickySaveBarProps'];
  importModalsProps: ImportScreenLayoutProps['importModalsProps'];
}

export function useImportLayoutProps(params: Params) {
  return useMemo<ImportScreenLayoutProps>(
    () => ({
      title: params.title,
      onBack: params.onBack,
      topSummaryProps: params.topSummaryProps,
      tabsHeaderProps: {
        sectionTabsRef: params.sectionTabsRef,
        sectionTabs: params.sectionTabs,
        activeSection: params.activeSection,
        goToSection: params.goToSection,
        setSectionTabsWidth: params.setSectionTabsWidth,
        sectionTabLayouts: params.sectionTabLayouts,
      },
      playerStatsPanelProps: params.playerStatsPanelProps,
      deferredSectionsProps: params.deferredSectionsProps,
      stickySaveBarProps: params.stickySaveBarProps,
      importModalsProps: params.importModalsProps,
    }),
    [params]
  );
}
