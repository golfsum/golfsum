import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SavedRound, WeatherData } from '../types';
import { CoachingNudgeCard, NudgeCategory, getPlayTabNudges } from '../services/coachingNudgesService';
import { CaddieBriefCard } from './CaddieBriefCard';
import { useFeatureGate } from '../hooks/useFeatureGate';
import Storage from '../services/storage';
import { logger } from '../utils/logger';
import { getUserProfile } from '../services/userService';

interface Props {
  rounds: SavedRound[];
  plannedCourseName?: string | null;
  currentWeather?: Partial<WeatherData> | null;
  clubDistances?: Record<string, number>;
  onStartRound: () => void;
  onImportScorecard: () => void;
}

const CATEGORY_META: Record<NudgeCategory, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  putting: { label: 'Putting', color: '#E74C3C', icon: 'flag-outline' },
  approach: { label: 'Approach', color: '#3498DB', icon: 'analytics-outline' },
  tee: { label: 'Off The Tee', color: '#F39C12', icon: 'trending-up-outline' },
  strategy: { label: 'Strategy', color: '#9B59B6', icon: 'stats-chart-outline' },
  course: { label: 'Course Plan', color: '#1ABC9C', icon: 'map-outline' },
  mental: { label: 'Mindset', color: '#E67E22', icon: 'bulb-outline' },
};

const FIRST_PERSONAL_NUDGE_KEY = '@GolfSum:nudges:firstPersonalNudgeSeen';
const PRO_PROMPT_COUNTER_KEY = '@GolfSum:nudges:proPromptCounter';
const VERIFICATION_ACKNOWLEDGED = '@GolfSum:clubYardage:verificationAcknowledged';

const BADGE_LABELS: Record<string, string> = {
  'Your Game': 'Your Rounds',
  'Pre-Round': 'Today',
  Example: 'Example',
  Tip: 'Tip',
  Pro: 'More Stats',
};

function buildProNudge(rounds: SavedRound[]): CoachingNudgeCard {
  const holes = rounds.flatMap(r => r.holes || []);
  const shortMisses = holes.filter(h => h.greenHit === 'short').length;
  const misses = holes.filter(h => typeof h.greenHit === 'string').length;
  const shortPct = misses > 0 ? Math.round((shortMisses / misses) * 100) : 0;
  const body = shortPct > 0
    ? `${shortPct}% of your GIR misses are short. More tracked rounds make this sharper.`
    : 'Your rounds are starting to show where shots are getting away from you. More tracked rounds make this sharper.';

  return {
    id: 'pro_upsell_play',
    category: 'strategy',
    title: 'Keep Tracking Your Game',
    body,
    badge: 'Pro',
    ctaText: 'See full stat tracking',
    ctaAction: 'none',
  };
}

export const CoachingNudgeCarousel: React.FC<Props> = ({
  rounds,
  plannedCourseName,
  currentWeather,
  clubDistances,
  onStartRound,
  onImportScorecard,
}) => {
  const { isPremium } = useFeatureGate();
  const [cards, setCards] = useState<CoachingNudgeCard[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showPersonalNudgeHint, setShowPersonalNudgeHint] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const cardWidth = Math.max(320, Dimensions.get('window').width - 48);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const profile = await getUserProfile();
        let next = await getPlayTabNudges(
          rounds,
          plannedCourseName,
          currentWeather ?? null,
          (clubDistances ?? profile?.clubDistances ?? {}),
          profile?.coursePreferences?.typicalHandicap ?? null
        );

        if (!isPremium) {
          const counterRaw = await Storage.getItem(PRO_PROMPT_COUNTER_KEY);
          const counter = Number(counterRaw || '0') || 0;
          const nextCounter = counter + 1;
          await Storage.setItem(PRO_PROMPT_COUNTER_KEY, String(nextCounter));
          const shouldShowProCard = nextCounter % 3 === 0;
          if (shouldShowProCard && next.length > 0) {
            next = [...next.slice(0, Math.max(0, next.length - 1)), buildProNudge(rounds)];
          }
        }

        if (!isMounted) return;

        const startIndex = next.length > 1 ? Math.floor(Math.random() * next.length) : 0;

        const hasPersonalized = next.some(card => card.badge === 'Your Game' || card.badge === 'Pre-Round');
        const personalNudgeSeen = await Storage.getItem(FIRST_PERSONAL_NUDGE_KEY);
        const shouldShowPersonalHint = hasPersonalized && !personalNudgeSeen;
        if (shouldShowPersonalHint) await Storage.setItem(FIRST_PERSONAL_NUDGE_KEY, 'true');

        setCards(next);
        setShowPersonalNudgeHint(shouldShowPersonalHint);
        setActiveIndex(startIndex);
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ x: startIndex * cardWidth, y: 0, animated: false });
        });
      } catch (error) {
        logger.warn('Failed to load coaching nudges:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [isPremium, plannedCourseName, rounds, currentWeather, clubDistances]);

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = event.nativeEvent.contentOffset.x;
    const index = Math.round(x / cardWidth);
    setActiveIndex(Math.max(0, Math.min(cards.length - 1, index)));
  };

  const visibleCards = useMemo(() => cards.slice(0, 5), [cards]);

  const advanceCard = () => {
    if (!visibleCards.length) return;
    const next = (activeIndex + 1) % visibleCards.length;
    setActiveIndex(next);
    scrollRef.current?.scrollTo({ x: next * cardWidth, y: 0, animated: true });
  };

  useEffect(() => {
    if (visibleCards.length <= 1) return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % visibleCards.length;
        scrollRef.current?.scrollTo({ x: next * cardWidth, y: 0, animated: true });
        return next;
      });
    }, 10000);
    return () => clearInterval(timer);
  }, [cardWidth, visibleCards.length]);

  if (loading || visibleCards.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        horizontal
        pagingEnabled
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        contentContainerStyle={styles.row}
      >
        {visibleCards.map((card) => {
          const meta = CATEGORY_META[card.category];
          const personalBadge = card.badge === 'Your Game' || card.badge === 'Pre-Round';
          const proBadge = card.badge === 'Pro';
          return (
            <TouchableOpacity
              key={card.id}
              activeOpacity={0.95}
              style={[styles.card, { width: cardWidth }]}
              onPress={async () => {
                if (card.id === 'dy6') {
                  await Storage.setItem(VERIFICATION_ACKNOWLEDGED, new Date().toISOString());
                }
                advanceCard();
              }}
            >
              <View style={styles.header}>
                <View style={styles.category}>
                  <Ionicons name={meta.icon} size={14} color={meta.color} />
                  <Text style={[styles.categoryText, { color: meta.color }]}>{meta.label}</Text>
                </View>
                <View style={[styles.badge, personalBadge && styles.badgePersonal, proBadge && styles.badgePro]}>
                  <Text style={[styles.badgeText, personalBadge && styles.badgeTextPersonal, proBadge && styles.badgeTextPro]}>
                    {BADGE_LABELS[card.badge] || card.badge}
                  </Text>
                </View>
              </View>
              {card._brief ? (
                <CaddieBriefCard brief={card._brief} />
              ) : (
                <>
                  <Text style={styles.title} numberOfLines={1}>{card.title}</Text>
                  <Text style={styles.body} numberOfLines={3}>{card.body}</Text>
                </>
              )}
              {card.id === 'dt1' && card.adjustedClubs && card.adjustedClubs.length > 0 && (
                <View style={styles.adjustedYardageTable}>
                  <Text style={styles.adjustedYardageHeader}>Carry in these conditions</Text>
                  {card.adjustedClubs.slice(0, 5).map(club => (
                    <View key={club.club} style={styles.adjustedYardageRow}>
                      <Text style={styles.adjustedYardageClub}>{club.club}</Text>
                      <Text style={styles.adjustedYardageBase}>{club.baseYardage} yds</Text>
                      <Text style={styles.adjustedYardageArrow}>to</Text>
                      <Text
                        style={[
                          styles.adjustedYardageAdjusted,
                          club.yardageDiff < 0 && styles.adjustedYardageCold,
                          club.yardageDiff > 0 && styles.adjustedYardageHot,
                        ]}
                      >
                        {club.adjustedYardage} yds
                      </Text>
                    </View>
                  ))}
                  {typeof card.tempF === 'number' && (
                    <Text style={styles.adjustedYardageNote}>{card.tempF}F today</Text>
                  )}
                </View>
              )}
              {card.ctaText ? <Text style={styles.ctaText}>{card.ctaText} →</Text> : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {showPersonalNudgeHint ? (
        <Text style={styles.personalHint}>Tips now use your rounds.</Text>
      ) : null}
      <View style={styles.dots}>
        {visibleCards.map((card, index) => (
          <TouchableOpacity
            key={`${card.id}_dot`}
            onPress={() => {
              setActiveIndex(index);
              scrollRef.current?.scrollTo({ x: index * cardWidth, y: 0, animated: true });
            }}
            style={styles.dotTap}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View style={[styles.dot, index === activeIndex && styles.dotActive]} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginTop: 8,
    marginBottom: 16,
  },
  scroll: {
    width: '100%',
  },
  row: {
    alignItems: 'flex-start',
    paddingRight: 12,
  },
  card: {
    backgroundColor: '#131A23',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderRadius: 14,
    padding: 14,
    alignSelf: 'flex-start',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  category: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  badgePersonal: {
    backgroundColor: 'rgba(16,185,129,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.35)',
  },
  badgeText: {
    color: '#D1D5DB',
    fontSize: 11,
    fontWeight: '700',
  },
  badgeTextPersonal: {
    color: '#10B981',
  },
  badgePro: {
    backgroundColor: 'rgba(245,158,11,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
  },
  badgeTextPro: {
    color: '#F59E0B',
  },
  title: {
    color: '#F9FAFB',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
  body: {
    color: '#C7CED7',
    fontSize: 14,
    lineHeight: 20,
  },
  ctaText: {
    marginTop: 10,
    color: '#9FB0C4',
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  personalHint: {
    marginTop: 4,
    textAlign: 'center',
    color: '#10B981',
    fontSize: 12,
    fontWeight: '600',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  dotTap: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4B5563',
  },
  dotActive: {
    backgroundColor: '#10B981',
    width: 18,
    borderRadius: 5,
  },
  adjustedYardageTable: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#253140',
    gap: 4,
  },
  adjustedYardageHeader: {
    color: '#9FB0C4',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  adjustedYardageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  adjustedYardageClub: {
    color: '#F3F4F6',
    fontSize: 12,
    width: 36,
    fontWeight: '700',
  },
  adjustedYardageBase: {
    color: '#C7CED7',
    fontSize: 12,
    width: 58,
  },
  adjustedYardageArrow: {
    color: '#6B7280',
    fontSize: 12,
  },
  adjustedYardageAdjusted: {
    color: '#C7CED7',
    fontSize: 12,
    fontWeight: '700',
  },
  adjustedYardageCold: {
    color: '#60A5FA',
  },
  adjustedYardageHot: {
    color: '#F59E0B',
  },
  adjustedYardageNote: {
    marginTop: 4,
    color: '#9CA3AF',
    fontSize: 11,
  },
});
