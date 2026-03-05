import React from 'react';
import { View, ScrollView } from 'react-native';
import { styles } from '../ScorecardImportScreen.styles';
import { ImportHeader } from './ImportHeader';
import { TopSummarySection } from './TopSummarySection';
import { TabsHeader } from './TabsHeader';
import { PlayerStatsPanel } from './PlayerStatsPanel';
import { DeferredSections } from './DeferredSections';
import { StickySaveBar } from './StickySaveBar';
import { ImportModals } from './ImportModals';

export interface ImportScreenLayoutProps {
  title: string;
  onBack: () => void;
  topSummaryProps: React.ComponentProps<typeof TopSummarySection>;
  tabsHeaderProps: React.ComponentProps<typeof TabsHeader>;
  playerStatsPanelProps: React.ComponentProps<typeof PlayerStatsPanel>;
  deferredSectionsProps: React.ComponentProps<typeof DeferredSections>;
  stickySaveBarProps: React.ComponentProps<typeof StickySaveBar>;
  importModalsProps: React.ComponentProps<typeof ImportModals>;
}

export const ImportScreenLayout: React.FC<ImportScreenLayoutProps> = (props) => {
  return (
    <View style={styles.container}>
      <ImportHeader title={props.title} onBack={props.onBack} />

      <ScrollView contentContainerStyle={styles.contentWithStickyBar}>
        <TopSummarySection {...props.topSummaryProps} />
        <TabsHeader {...props.tabsHeaderProps} />
        <PlayerStatsPanel {...props.playerStatsPanelProps} />
        <DeferredSections {...props.deferredSectionsProps} />
      </ScrollView>

      <StickySaveBar {...props.stickySaveBarProps} />
      <ImportModals {...props.importModalsProps} />
    </View>
  );
};
