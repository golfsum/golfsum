import React from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ReportIssueSectionProps {
  expanded: boolean;
  onToggle: () => void;
  message: string;
  isSubmitting: boolean;
  error: string | null;
  success: string | null;
  issues: Array<{
    id?: string;
    status?: 'open' | 'completed';
    adminNote?: string | null;
    completedAt?: string | null;
    message?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    thread?: Array<{ from: 'user' | 'admin'; message: string; createdAt: string }> | null;
  }>;
  selectedIssueId: string | null;
  onSelectIssue: (id: string | null) => void;
  seenMap: Record<string, string>;
  replyMessage: string;
  replyError: string | null;
  replySuccess: string | null;
  isSendingReply: boolean;
  onReplyChange: (value: string) => void;
  onSendReply: () => void;
  isRefreshing: boolean;
  onRefresh: () => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
  styles: any;
}

export const ReportIssueSection: React.FC<ReportIssueSectionProps> = ({
  expanded,
  onToggle,
  message,
  isSubmitting,
  error,
  success,
  issues,
  selectedIssueId,
  onSelectIssue,
  seenMap,
  replyMessage,
  replyError,
  replySuccess,
  isSendingReply,
  onReplyChange,
  onSendReply,
  isRefreshing,
  onRefresh,
  onChange,
  onSubmit,
  styles,
}) => {
  const selectedIssue = issues.find((issue) => issue.id === selectedIssueId) || null;

  return (
    <View style={styles.section}>
      <TouchableOpacity style={styles.sectionHeader} onPress={onToggle} activeOpacity={0.8}>
        <View style={styles.headerLeft}>
          <Ionicons name="alert-circle" size={20} color="#F59E0B" />
          <Text style={styles.sectionTitle}>REPORTED ISSUES</Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color="#9CA3AF"
        />
      </TouchableOpacity>
      {expanded && (
        <View style={styles.sectionContent}>
          <View style={styles.reportIssueHeaderRow}>
            <Text style={styles.syncLabel}>Report an issue</Text>
            <TouchableOpacity
              onPress={onRefresh}
              disabled={isRefreshing}
              style={[styles.reportIssueRefreshButton, isRefreshing && styles.syncButtonDisabled]}
            >
              <Text style={styles.reportIssueRefreshText}>{isRefreshing ? 'Refreshing...' : 'Refresh Status'}</Text>
            </TouchableOpacity>
          </View>

          {issues.length > 0 ? (
            <View style={styles.reportIssueList}>
              {issues.map((issue) => {
                const isSelected = issue.id && issue.id === selectedIssueId;
                const issueDate = issue.createdAt ? new Date(issue.createdAt).toLocaleDateString() : 'Unknown';
                const issueStamp = issue.updatedAt || issue.createdAt || '';
                const seenStamp = issue.id ? seenMap[issue.id] : null;
                const hasAdminReply = (issue.thread || []).some((entry) => entry.from === 'admin');
                const isNew = Boolean(
                  issue.id &&
                  issueStamp &&
                  hasAdminReply &&
                  (!seenStamp || new Date(issueStamp).getTime() > new Date(seenStamp).getTime()) &&
                  issue.id !== selectedIssueId
                );
                return (
                  <TouchableOpacity
                    key={issue.id || issue.createdAt || issue.message}
                    onPress={() => onSelectIssue(issue.id ?? null)}
                    style={[styles.reportIssueListItem, isSelected && styles.reportIssueListItemActive]}
                  >
                    <View style={styles.reportIssueListBody}>
                      <Text style={styles.reportIssueListMessage} numberOfLines={2}>
                        {issue.message || 'No message'}
                      </Text>
                      <Text style={styles.reportIssueListMeta}>{issueDate}</Text>
                    </View>
                    {isNew && (
                      <View style={styles.reportIssueNewBadge}>
                        <Text style={styles.reportIssueNewBadgeText}>NEW</Text>
                      </View>
                    )}
                    <View
                      style={[
                        styles.reportIssueStatusBadge,
                        issue.status === 'completed'
                          ? styles.reportIssueStatusBadgeCompleted
                          : styles.reportIssueStatusBadgeOpen,
                      ]}
                    >
                      <Text style={styles.reportIssueStatusText}>
                        {issue.status === 'completed' ? 'Completed' : 'Open'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <Text style={styles.syncValue}>No reported issues yet.</Text>
          )}

          {selectedIssue && (
            <View style={styles.reportIssueDetail}>
              <View style={styles.reportIssueStatusRow}>
                <View
                  style={[
                    styles.reportIssueStatusBadge,
                    selectedIssue.status === 'completed'
                      ? styles.reportIssueStatusBadgeCompleted
                      : styles.reportIssueStatusBadgeOpen,
                  ]}
                >
                  <Text style={styles.reportIssueStatusText}>
                    {selectedIssue.status === 'completed' ? 'Completed' : 'Open'}
                  </Text>
                </View>
                {selectedIssue.completedAt && (
                  <Text style={styles.reportIssueStatusMeta}>
                    Completed {new Date(selectedIssue.completedAt).toLocaleDateString()}
                  </Text>
                )}
              </View>
              <View style={styles.reportIssueLatestBox}>
                <Text style={styles.reportIssueLatestLabel}>Latest Update</Text>
                <Text style={styles.reportIssueLatestMessage}>
                  {selectedIssue.adminNote || 'No admin response yet.'}
                </Text>
                {(selectedIssue.updatedAt || selectedIssue.createdAt) && (
                  <Text style={styles.reportIssueLatestMeta}>
                    {new Date(selectedIssue.updatedAt || selectedIssue.createdAt || '').toLocaleDateString()}
                  </Text>
                )}
              </View>
            </View>
          )}

          <Text style={styles.syncValue}>
            Tell us what happened and we will attach your login time and recent errors.
          </Text>
          <TextInput
            style={styles.reportIssueInput}
            value={message}
            onChangeText={onChange}
            placeholder="Describe the issue..."
            placeholderTextColor="#6B7280"
            multiline
            textAlignVertical="top"
          />
          {error && <Text style={styles.syncErrorText}>{error}</Text>}
          {success && <Text style={styles.reportIssueSuccessText}>{success}</Text>}
          <TouchableOpacity
            style={[styles.reportIssueButton, isSubmitting && styles.syncButtonDisabled]}
            onPress={onSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#0f1419" />
            ) : (
              <Text style={styles.reportIssueButtonText}>Submit Issue</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};
