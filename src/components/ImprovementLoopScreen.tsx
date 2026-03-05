import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polyline } from 'react-native-svg';
import ViewShot from 'react-native-view-shot';
import { ImprovementLoopData, StatTimeline } from '../services/improvementLoopService';

const TimelineRow: React.FC<{ timeline: StatTimeline }> = ({ timeline }) => {
  const width = 240;
  const height = 42;
  const values = timeline.periods.map((p) => p.value);
  const plotValues =
    timeline.direction === 'lower_is_better'
      ? values.map((v) => -v)
      : values;
  const min = Math.min(...plotValues);
  const max = Math.max(...plotValues);
  const range = max - min || 1;
  const points = plotValues
    .map((v, i) => {
      const x = (i / (values.length - 1 || 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const improved = timeline.direction === 'higher_is_better' ? timeline.totalDelta > 0 : timeline.totalDelta < 0;
  const deltaColor = improved ? '#10B981' : '#F87171';
  const changeAmount = Math.abs(timeline.totalDelta).toFixed(1);
  const deltaLabel = improved
    ? `Improved ${changeAmount} ${timeline.unit}`
    : `Worsened ${changeAmount} ${timeline.unit}`;

  return (
    <View style={styles.timelineCard}>
      <Text style={styles.timelineTitle}>{timeline.label}</Text>
      <Svg width={width} height={height}>
        <Polyline points={points} stroke="#64748B" strokeWidth="1.5" fill="none" />
      </Svg>
      <Text style={[styles.timelineDelta, { color: deltaColor }]}>
        {deltaLabel}
      </Text>
      <Text style={styles.timelineSentence}>{timeline.trendSentence}</Text>
    </View>
  );
};

export const ImprovementLoopScreen: React.FC<{
  data: ImprovementLoopData;
  onClose: () => void;
}> = ({ data, onClose }) => {
  const shotRef = React.useRef<ViewShot>(null);

  const handleShare = async () => {
    const top = data.topImprovement;
    if (!top) return;
    const uri = await shotRef.current?.capture?.();
    if (!uri) return;
    await Share.share({ url: uri, message: `${top.label}: ${top.trendSentence}` });
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="arrow-back" size={20} color="#E5E7EB" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Your Improvement</Text>
        <View style={{ width: 20 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.meta}>{data.firstRoundDate} - {data.latestRoundDate} · {data.totalRounds} rounds</Text>
        <View style={styles.storyCard}>
          <Text style={styles.story}>{data.overallStory}</Text>
        </View>

        {data.timelines.map((timeline) => (
          <TimelineRow key={timeline.stat} timeline={timeline} />
        ))}

        {data.topImprovement && (
          <ViewShot ref={shotRef} options={{ format: 'png', quality: 1 }}>
            <View style={styles.shareCard}>
              <Text style={styles.shareTitle}>{data.topImprovement.label}</Text>
              <Text style={styles.shareBody}>{data.topImprovement.trendSentence}</Text>
              <Text style={styles.shareSub}>{data.totalRounds} rounds tracked with GolfSum</Text>
            </View>
          </ViewShot>
        )}

        {data.topImprovement && (
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
            <Ionicons name="share-outline" size={16} color="#0f1419" />
            <Text style={styles.shareBtnText}>Share Top Improvement</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0f1419' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: '#1F2937' },
  headerTitle: { color: '#F9FAFB', fontSize: 17, fontWeight: '700' },
  content: { padding: 14, paddingBottom: 30 },
  meta: { color: '#9CA3AF', fontSize: 12, marginBottom: 10 },
  storyCard: { backgroundColor: '#131A23', borderRadius: 12, borderWidth: 1, borderColor: '#1F2937', padding: 12, marginBottom: 12 },
  story: { color: '#D1D5DB', fontSize: 13, lineHeight: 19 },
  timelineCard: { backgroundColor: '#131A23', borderRadius: 12, borderWidth: 1, borderColor: '#1F2937', padding: 12, marginBottom: 10 },
  timelineTitle: { color: '#F8FAFC', fontWeight: '700', marginBottom: 6 },
  timelineDelta: { fontSize: 13, fontWeight: '700', marginTop: 6 },
  timelineSentence: { color: '#9CA3AF', fontSize: 12, marginTop: 4 },
  shareCard: { backgroundColor: '#131A23', borderRadius: 12, borderWidth: 1, borderColor: '#1F2937', padding: 14, marginTop: 12 },
  shareTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '800', marginBottom: 8 },
  shareBody: { color: '#D1D5DB', fontSize: 13, lineHeight: 19, marginBottom: 8 },
  shareSub: { color: '#9CA3AF', fontSize: 12 },
  shareBtn: { marginTop: 10, backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 11, flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center' },
  shareBtnText: { color: '#0f1419', fontSize: 13, fontWeight: '700' },
});
