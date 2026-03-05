import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScorecardResult, UserProfile } from '../types';
import { CellEditorModal } from './CellEditorModal';
import Storage from '../services/storage';
import { logger } from '../utils/logger';

interface ScorecardViewerProps {
  result: ScorecardResult;
  onBack: () => void;
}

interface EditTracker {
  originalValue: string;
  startTime: number;
  rowLabel: string;
  rowIndex: number;
  columnIndex: number;
}

interface CellEditState {
  visible: boolean;
  value: string;
  rowLabel: string;
  columnIndex: number;
  rowIndex: number;
  cellElement: HTMLElement | null;
}

export const ScorecardViewer: React.FC<ScorecardViewerProps> = ({
  result,
  onBack,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const webViewRef = useRef<any>(null);
  const editTrackerRef = useRef<EditTracker | null>(null);
  const [correctionCount, setCorrectionCount] = useState(0);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [cellEdit, setCellEdit] = useState<CellEditState>({
    visible: false,
    value: '',
    rowLabel: '',
    columnIndex: 0,
    rowIndex: 0,
    cellElement: null,
  });
  const injectedCellTapScript = `
    (function() {
      if (window.__golfsumCellHandler) return;
      window.__golfsumCellHandler = true;

      function tagRowAndCells(table) {
        var rows = table.querySelectorAll('tr');
        rows.forEach(function(row, rowIndex) {
          row.setAttribute('data-row-index', String(rowIndex));
          var cells = row.querySelectorAll('th, td');
          cells.forEach(function(cell, colIndex) {
            cell.setAttribute('data-col-index', String(colIndex));
          });
        });
      }

      function pruneColumns(table, keepCols) {
        var rows = table.querySelectorAll('tr');
        rows.forEach(function(row) {
          var cells = Array.prototype.slice.call(row.querySelectorAll('th, td'));
          cells.forEach(function(cell) {
            var colAttr = cell.getAttribute('data-col-index');
            var colIndex = colAttr ? parseInt(colAttr, 10) : cell.cellIndex;
            if (keepCols.indexOf(colIndex) === -1) {
              cell.remove();
            }
          });
        });
      }

      function splitScorecardTable() {
        if (document.body && document.body.getAttribute('data-golfsum-split') === '1') return;
        var table = document.querySelector('table');
        if (!table) return;

        tagRowAndCells(table);

        var table2 = table.cloneNode(true);

        var keepFront = [];
        for (var i = 0; i <= 10; i++) keepFront.push(i);
        var keepBack = [0];
        for (var j = 12; j <= 22; j++) keepBack.push(j);

        pruneColumns(table, keepFront);
        pruneColumns(table2, keepBack);

        var container = document.createElement('div');
        container.className = 'scorecard-split';
        var titleFront = document.createElement('div');
        titleFront.className = 'scorecard-split-title';
        titleFront.textContent = 'Front 9';
        var titleBack = document.createElement('div');
        titleBack.className = 'scorecard-split-title';
        titleBack.textContent = 'Back 9';

        var parent = table.parentNode;
        if (parent) {
          parent.replaceChild(container, table);
          container.appendChild(titleFront);
          container.appendChild(table);
          container.appendChild(titleBack);
          container.appendChild(table2);
          document.body.setAttribute('data-golfsum-split', '1');
        }

        var style = document.createElement('style');
        style.textContent = '.scorecard-split { display: flex; flex-direction: column; gap: 16px; padding: 12px; }
' +
          '.scorecard-split-title { color: #10B981; font-weight: 700; font-size: 14px; letter-spacing: 0.5px; }';
        document.head.appendChild(style);
      }

      function applyScoreStyles() {
        var table = document.querySelector('table');
        if (!table) return;

        var rows = table.querySelectorAll('tr');
        var parRow = null;
        var scoreRow = null;

        rows.forEach(function(row) {
          var firstCell = row.querySelector('td:first-child, th:first-child');
          var label = firstCell ? (firstCell.textContent || '').toLowerCase() : '';
          if (label.includes('par')) parRow = row;
          if (label.includes('score')) scoreRow = row;
        });

        if (!parRow || !scoreRow) return;

        var parCells = parRow.querySelectorAll('td');
        var scoreCells = scoreRow.querySelectorAll('td');
        var minLen = Math.min(parCells.length, scoreCells.length);

        for (var i = 1; i < minLen; i++) {
          var parVal = parseInt((parCells[i].textContent || '').trim(), 10);
          var scoreVal = parseInt((scoreCells[i].textContent || '').trim(), 10);
          if (!isFinite(parVal) || !isFinite(scoreVal)) continue;
          var diff = scoreVal - parVal;
          scoreCells[i].classList.remove('score-par','score-birdie','score-eagle','score-bogey','score-double','score-triple');
          if (diff <= -2) scoreCells[i].classList.add('score-eagle');
          else if (diff === -1) scoreCells[i].classList.add('score-birdie');
          else if (diff === 0) scoreCells[i].classList.add('score-par');
          else if (diff === 1) scoreCells[i].classList.add('score-bogey');
          else if (diff === 2) scoreCells[i].classList.add('score-double');
          else if (diff > 2) scoreCells[i].classList.add('score-triple');
        }
      }

      splitScorecardTable();
      applyScoreStyles();

      var scoreStyle = document.createElement('style');
      scoreStyle.textContent = '.score-par{color:#E5E7EB;font-weight:700}'+
        '.score-birdie{color:#EF4444;border:2px solid #EF4444;border-radius:999px;font-weight:700}'+
        '.score-eagle{color:#EF4444;border:2px solid #EF4444;border-radius:999px;font-weight:700;box-shadow:0 0 0 2px #EF4444 inset}'+
        '.score-bogey{color:#1D4ED8;border:2px solid #1D4ED8;border-radius:4px;font-weight:700}'+
        '.score-double{color:#6B7280;border:2px solid #6B7280;border-radius:4px;font-weight:700;box-shadow:0 0 0 2px #6B7280 inset}'+
        '.score-triple{color:#6B7280;border:2px solid #6B7280;border-radius:4px;font-weight:700;box-shadow:0 0 0 2px #6B7280 inset}';
      document.head.appendChild(scoreStyle);

      document.addEventListener('click', function(e) {
        var target = e.target;
        if (!target || !target.getAttribute) return;
        if (target.getAttribute('contenteditable') === 'true') {
          e.preventDefault();
          var cell = target.closest('td');
          if (!cell) return;
          var row = cell.closest('tr');
          if (!row) return;
          var rowLabelCell = row.querySelector('td:first-child');
          var rowLabel = rowLabelCell ? rowLabelCell.textContent || '' : '';
          var colAttr = cell.getAttribute('data-col-index');
          var rowAttr = row.getAttribute('data-row-index');
          var columnIndex = colAttr ? parseInt(colAttr, 10) : cell.cellIndex;
          var rowIndex = rowAttr ? parseInt(rowAttr, 10) : 0;
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'cellTap',
              value: target.textContent || '',
              rowLabel: rowLabel,
              columnIndex: columnIndex,
              rowIndex: rowIndex
            }));
          }
        }
      }, true);
    })();
    true;
  `;

  // Load user profile on mount
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const stored = await Storage.getItem('@GolfSum:UserProfile');
        if (stored) {
          setUserProfile(JSON.parse(stored));
        }
      } catch (error) {
        logger.debug('Could not load user profile');
      }
    };
    
    loadProfile();
  }, []);

  // Set up edit tracking for web
  useEffect(() => {
    if (Platform.OS !== 'web' || !iframeRef.current) return;

    const setupEditTracking = () => {
      const iframe = iframeRef.current;
      if (!iframe?.contentDocument) return;

      const doc = iframe.contentDocument;

      // Track when user starts editing a cell
      doc.addEventListener('focusin', (e: FocusEvent) => {
        const target = e.target as HTMLElement;
        if (target.getAttribute('contenteditable') === 'true') {
          const cell = target.closest('td');
          const row = cell?.closest('tr');
          const table = row?.closest('table');
          const rowLabel = row?.querySelector('td:first-child')?.textContent || '';
          const cells = Array.from(row?.querySelectorAll('td') || []);
          const columnIndex = cells.indexOf(cell as HTMLTableCellElement);
          
          // Get row index within table
          const allRows = Array.from(table?.querySelectorAll('tr') || []);
          const rowIndex = allRows.indexOf(row as HTMLTableRowElement);

          editTrackerRef.current = {
            originalValue: target.textContent || '',
            startTime: Date.now(),
            rowLabel,
            rowIndex,
            columnIndex,
          };
        }
      });
      
      // Mobile: Open modal on cell click (touch devices and small screens)
      doc.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const isMobile = Platform.OS !== 'web' || window.innerWidth <= 768;
        
        if (target.getAttribute('contenteditable') === 'true' && isMobile) {
          e.preventDefault(); // Prevent contenteditable focus on mobile
          
          const cell = target.closest('td');
          const row = cell?.closest('tr');
          const table = row?.closest('table');
          const rowLabel = row?.querySelector('td:first-child')?.textContent || '';
          const cells = Array.from(row?.querySelectorAll('td') || []);
          const columnIndex = cells.indexOf(cell as HTMLTableCellElement);
          const allRows = Array.from(table?.querySelectorAll('tr') || []);
          const rowIndex = allRows.indexOf(row as HTMLTableRowElement);
          
          // Open modal for editing
          setCellEdit({
            visible: true,
            value: target.textContent || '',
            rowLabel,
            columnIndex,
            rowIndex,
            cellElement: target,
          });
        }
      });

      // Track when user finishes editing
      doc.addEventListener('focusout', async (e: FocusEvent) => {
        const target = e.target as HTMLElement;
        if (target.getAttribute('contenteditable') === 'true' && editTrackerRef.current) {
          const newValue = target.textContent || '';
          const { originalValue, startTime, rowLabel, rowIndex, columnIndex } = editTrackerRef.current;

          if (originalValue !== newValue && originalValue.trim() !== '' && newValue.trim() !== '') {
            setCorrectionCount((prev) => prev + 1);
            
            // Visual feedback - GREEN FLASH for all edits including OUT/IN/TOT
            target.style.backgroundColor = '#10B981';
            target.style.color = '#fff';
            setTimeout(() => {
              target.style.backgroundColor = '';
              target.style.color = '';
            }, 1000);
          }

          editTrackerRef.current = null;
        }
      });
    };

    // Wait for iframe to load
    const iframe = iframeRef.current;
    iframe.addEventListener('load', setupEditTracking);

    return () => {
      iframe.removeEventListener('load', setupEditTracking);
    };
  }, [result.html]);

  const handleShare = async () => {
    if (Platform.OS === 'web') {
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'Golf Scorecard',
            text: 'Check out my golf scorecard!',
          });
        } catch (err) {
          // User cancelled or share failed
        }
      } else {
        navigator.clipboard.writeText(result.html);
        alert('Scorecard HTML copied to clipboard!');
      }
    } else {
      try {
        await Share.share({
          message: 'Check out my golf scorecard!',
          title: 'Golf Scorecard',
        });
      } catch (err) {
        // Share failed
      }
    }
  };

  const handleDownload = () => {
    if (Platform.OS === 'web') {
      const blob = new Blob([result.html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scorecard-${new Date().toISOString().split('T')[0]}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const renderHtml = () => {
    if (Platform.OS === 'web') {
      return (
        <div style={webStyles.iframeContainer}>
          <iframe
            ref={iframeRef as any}
            srcDoc={result.html}
            style={webStyles.iframe}
            title="Scorecard"
            sandbox="allow-same-origin allow-scripts allow-forms"
          />
        </div>
      );
    }

    // For native, we'll use a WebView
    const WebView = require('react-native-webview').WebView;
    return (
      <WebView
        ref={webViewRef}
        source={{ html: result.html }}
        style={styles.webView}
        scalesPageToFit={true}
        scrollEnabled={true}
        showsVerticalScrollIndicator={true}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        injectedJavaScript={injectedCellTapScript}
        onMessage={(event: any) => {
          try {
            const payload = JSON.parse(event.nativeEvent?.data || '{}');
            if (payload.type === 'cellTap') {
              setCellEdit({
                visible: true,
                value: payload.value || '',
                rowLabel: payload.rowLabel || '',
                columnIndex: Number(payload.columnIndex) || 0,
                rowIndex: Number(payload.rowIndex) || 0,
                cellElement: null,
              });
            }
          } catch (error) {
            // Ignore malformed messages
          }
        }}
      />
    );
  };

  // Handle modal save
  const handleCellEditSave = async (newValue: string) => {
    const { value: originalValue, rowLabel, columnIndex, rowIndex, cellElement } = cellEdit;
    
    if (Platform.OS !== 'web' && webViewRef.current) {
      const updatePayload = JSON.stringify({
        rowIndex,
        columnIndex,
        value: newValue,
      });
      const updateScript = `
        (function() {
          var data = ${updatePayload};
          var rows = document.querySelectorAll('tr[data-row-index="' + data.rowIndex + '"]');
          rows.forEach(function(row) {
            var cell = row.querySelector('td[data-col-index="' + data.columnIndex + '"]');
            if (!cell) return;
            cell.textContent = data.value;
            cell.style.backgroundColor = '#10B981';
            cell.style.color = '#fff';
            setTimeout(function() {
              cell.style.backgroundColor = '';
              cell.style.color = '';
            }, 800);
          });
        })();
        true;
      `;
      webViewRef.current.injectJavaScript(updateScript);
    } else if (cellElement) {
      cellElement.textContent = newValue;
    }

    if (originalValue !== newValue && originalValue.trim() !== '' && newValue.trim() !== '') {
      setCorrectionCount(prev => prev + 1);
    }
    
    // Close modal
    setCellEdit({ ...cellEdit, visible: false });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Scorecard</Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
            <Ionicons name="share-outline" size={20} color="#10B981" />
          </TouchableOpacity>
          {Platform.OS === 'web' && (
            <TouchableOpacity style={styles.actionButton} onPress={handleDownload}>
              <Ionicons name="download-outline" size={20} color="#10B981" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Status Bar */}
      <View style={styles.statusBar}>
        <View style={styles.statusItem}>
          <Ionicons name="checkmark-circle" size={16} color="#10B981" />
          <Text style={styles.statusText}>Round saved</Text>
        </View>
        {correctionCount > 0 && (
          <View style={styles.statusItem}>
            <Ionicons name="create" size={16} color="#F59E0B" />
            <Text style={styles.statusText}>
              {correctionCount} edit{correctionCount !== 1 ? 's' : ''}
            </Text>
          </View>
        )}
      </View>

      {/* Edit Hint */}
      <View style={styles.editHint}>
        <Text style={styles.editHintText}>
          Tap cells to edit
        </Text>
      </View>

      {/* Scorecard Content */}
      <View style={styles.contentContainer}>
        {renderHtml()}
      </View>

      {/* Close Button */}
      <TouchableOpacity style={styles.closeButton} onPress={onBack}>
        <Ionicons name="close" size={20} color="#FFFFFF" />
      </TouchableOpacity>
      
      {/* Cell Editor Modal (Mobile) */}
      <CellEditorModal
        visible={cellEdit.visible}
        initialValue={cellEdit.value}
        rowLabel={cellEdit.rowLabel}
        columnIndex={cellEdit.columnIndex}
        userProfile={userProfile}
        onSave={handleCellEditSave}
        onCancel={() => setCellEdit({ ...cellEdit, visible: false })}
      />
    </View>
  );
};

const webStyles: { [key: string]: React.CSSProperties } = {
  iframeContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  iframe: {
    width: '100%',
    height: '100%',
    border: 'none',
    minHeight: 500,
  },
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1419',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'ios' ? 48 : 12,
    backgroundColor: '#1a2028',
    borderBottomWidth: 1,
    borderBottomColor: '#2a3038',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#252d38',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    paddingVertical: 10,
    backgroundColor: '#1a2028',
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  editHint: {
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: '#252d38',
  },
  editHintText: {
    fontSize: 12,
    color: '#6B7280',
  },
  contentContainer: {
    flex: 1,
    margin: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  webView: {
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 52 : 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    display: 'none', // Hidden since we have back button
  },
});
