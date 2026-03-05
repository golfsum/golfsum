import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScrollView } from 'react-native';
import type { ImportSection, ScanState } from '../types';

interface Params {
  activeSection: ImportSection;
  setActiveSection: React.Dispatch<React.SetStateAction<ImportSection>>;
  setShowDeferredSections: React.Dispatch<React.SetStateAction<boolean>>;
  sectionTabs: Array<{ key: ImportSection }>;
  scanState: ScanState;
  reviewKind: 'ok' | 'score_missing' | 'course_missing' | 'tee_missing' | 'low_confidence';
  isCompletedMode: boolean;
  roundHoleCount: 9 | 18;
  playerNineView: 'front' | 'back';
  scanSide: 'front' | 'back';
  setPlayerNineView: React.Dispatch<React.SetStateAction<'front' | 'back'>>;
}

export function useImportUiFlow(params: Params) {
  const {
    activeSection,
    setActiveSection,
    setShowDeferredSections,
    sectionTabs,
    scanState,
    reviewKind,
    isCompletedMode,
    roundHoleCount,
    playerNineView,
    scanSide,
    setPlayerNineView,
  } = params;

  const sectionTabsRef = useRef<ScrollView>(null);
  const sectionTabLayouts = useRef<Record<string, { x: number; width: number }>>({});
  const [sectionTabsWidth, setSectionTabsWidth] = useState(0);

  const scrollToActiveTab = useCallback((key: ImportSection) => {
    const layout = sectionTabLayouts.current[key];
    if (!layout || !sectionTabsRef.current || sectionTabsWidth === 0) return;
    const targetX = Math.max(0, layout.x - (sectionTabsWidth - layout.width) / 2);
    sectionTabsRef.current.scrollTo({ x: targetX, animated: true });
  }, [sectionTabsWidth]);

  const goToSection = useCallback((next: ImportSection) => {
    setActiveSection(next);
    requestAnimationFrame(() => scrollToActiveTab(next));
  }, [setActiveSection, scrollToActiveTab]);

  useEffect(() => {
    const timer = setTimeout(() => setShowDeferredSections(true), 200);
    return () => clearTimeout(timer);
  }, [setShowDeferredSections]);

  useEffect(() => {
    setActiveSection('photo');
    requestAnimationFrame(() => scrollToActiveTab('photo'));
  }, [setActiveSection, scrollToActiveTab]);

  useEffect(() => {
    const shouldAutoNavigate = scanState === 'complete' || scanState === 'error';
    if (!shouldAutoNavigate) return;

    if (reviewKind === 'course_missing' || reviewKind === 'tee_missing') {
      goToSection('course');
      return;
    }
    if (reviewKind === 'score_missing' && isCompletedMode) {
      goToSection('player');
    }
  }, [goToSection, isCompletedMode, reviewKind, scanState]);

  useEffect(() => {
    if (!sectionTabsWidth) return;
    scrollToActiveTab(activeSection);
  }, [activeSection, sectionTabsWidth, scrollToActiveTab]);

  useEffect(() => {
    if (roundHoleCount === 9 && playerNineView !== scanSide) {
      setPlayerNineView(scanSide);
    }
  }, [playerNineView, roundHoleCount, scanSide, setPlayerNineView]);

  const activeTabIndex = sectionTabs.findIndex(tab => tab.key === activeSection);

  return {
    sectionTabsRef,
    sectionTabLayouts,
    sectionTabsWidth,
    setSectionTabsWidth,
    activeTabIndex,
    goToSection,
  };
}
