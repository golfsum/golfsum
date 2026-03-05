import { UI_COPY } from '../../../constants/uiCopy';
import { YARDAGE_COLUMN_GAP, YARDAGE_DIVIDER_WIDTH } from '../../ScorecardImportScreen.styles';
import { useDeferredHandlers } from './useDeferredHandlers';
import { useImportCallbacks } from './useImportCallbacks';
import { useImportMainSectionsProps } from './useImportMainSectionsProps';
import { useImportOverlayProps } from './useImportOverlayProps';
import { useImportLayoutProps } from './useImportLayoutProps';
import { useImportMainSectionsArgs } from './useImportMainSectionsArgs';
import { useImportOverlayArgs } from './useImportOverlayArgs';
import type { ScorecardImportLayoutModelParams } from './useScorecardImportLayoutModel.types';

export function useScorecardImportLayoutModel(params: ScorecardImportLayoutModelParams) {
  const deferredHandlers = useDeferredHandlers({
    isCompletedMode: params.isCompletedMode,
    roundHoleCount: params.roundHoleCount,
    activeTeeIndex: params.activeTeeIndex,
    teeBoxes: params.teeBoxes,
    setActiveSection: params.setActiveSection,
    setCourseSearchQuery: params.setCourseSearchQuery,
    setCourseName: params.setCourseName,
    setShowCourseSuggestions: params.setShowCourseSuggestions,
    setCity: params.setCity,
    setState: params.setState,
    setCountry: params.setCountry,
    setTeeBoxes: params.setTeeBoxes,
    setActiveTeeIndex: params.setActiveTeeIndex,
    setYardageColumnWidth: (value: number) => params.setYardageColumnWidth(value),
    lockScalarField: params.lockScalarField,
    lockTeeField: params.lockTeeField,
    yardageDividerWidth: YARDAGE_DIVIDER_WIDTH,
    yardageColumnGap: YARDAGE_COLUMN_GAP,
  });

  const importCallbacks = useImportCallbacks({
    lockScalarField: (field) => params.lockScalarField(field),
    setPlayerName: params.setPlayerName,
    roundHoleCount: params.roundHoleCount,
    setPlayerNineView: params.setPlayerNineView,
    setScanSide: params.setScanSide,
    setShowPlayerNamePicker: params.setShowPlayerNamePicker,
    setShowAllStatsColumns: params.setShowAllStatsColumns,
    goToSection: params.goToSection,
    openDatePicker: params.openDatePicker,
    onNavigateToProfile: params.onNavigateToProfile,
    inTrial: params.inTrial,
    openNumericEditor: params.openNumericEditor,
  });

  const { playerStatsPanelProps, deferredSectionsProps } = useImportMainSectionsProps(
    useImportMainSectionsArgs(params, deferredHandlers, importCallbacks)
  );

  const { topSummaryProps, importModalsProps } = useImportOverlayProps(
    useImportOverlayArgs(params, importCallbacks)
  );

  return useImportLayoutProps({
    title: params.isCompletedMode ? UI_COPY.scorecardImport.titleImportCompleted : UI_COPY.scorecardImport.titleUpload,
    onBack: params.onBack,
    topSummaryProps,
    sectionTabsRef: params.sectionTabsRef,
    sectionTabs: params.sectionTabs,
    activeSection: params.activeSection,
    goToSection: params.goToSection,
    setSectionTabsWidth: params.setSectionTabsWidth,
    sectionTabLayouts: params.sectionTabLayouts,
    playerStatsPanelProps,
    deferredSectionsProps,
    stickySaveBarProps: params.stickySaveBarProps,
    importModalsProps,
  });
}
