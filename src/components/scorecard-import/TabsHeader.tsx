import React from 'react';
import type { ScrollView } from 'react-native';
import { SectionTabs } from './SectionTabs';
import type { ImportSection } from './types';
import type { ImportSectionTab } from './hooks/useImportSectionTabs';

interface Props {
  sectionTabsRef: React.RefObject<ScrollView | null>;
  sectionTabs: ImportSectionTab[];
  activeSection: ImportSection;
  goToSection: (next: ImportSection) => void;
  setSectionTabsWidth: (width: number) => void;
  sectionTabLayouts: React.MutableRefObject<Record<string, { x: number; width: number }>>;
}

export const TabsHeader: React.FC<Props> = ({
  sectionTabsRef,
  sectionTabs,
  activeSection,
  goToSection,
  setSectionTabsWidth,
  sectionTabLayouts,
}) => {
  return (
    <SectionTabs
      ref={sectionTabsRef}
      tabs={sectionTabs}
      activeKey={activeSection}
      onSelect={goToSection}
      onTabsLayout={setSectionTabsWidth}
      onTabLayout={(key, layout) => {
        sectionTabLayouts.current[key] = layout;
      }}
    />
  );
};
