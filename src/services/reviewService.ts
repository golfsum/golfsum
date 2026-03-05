import { Platform } from 'react-native';
import * as StoreReview from 'expo-store-review';
import Storage from './storage';
import { logger } from '../utils/logger';

const LAST_REVIEW_PROMPT_KEY = '@GolfSum:lastReviewPrompt';
const REVIEW_PROMPT_COUNT_KEY = '@GolfSum:reviewPromptCount';

const REVIEW_MAX_PROMPTS = 3;
const REVIEW_COOLDOWN_DAYS = 60;
const REVIEW_MIN_ROUNDS = 5;

type ReviewTrigger = 'personal_best' | 'insight_unlocked' | 'scorecard_import';

interface ReviewRequestContext {
  trigger: ReviewTrigger;
  roundsCount: number;
  isInRound?: boolean;
  upgradeSheetShownThisSession?: boolean;
}

const daysSince = (isoDate: string | null): number | null => {
  if (!isoDate) return null;
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.floor((Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24));
};

const getPromptState = async () => {
  const [lastPromptRaw, promptCountRaw] = await Storage.multiGet([
    LAST_REVIEW_PROMPT_KEY,
    REVIEW_PROMPT_COUNT_KEY,
  ]);
  const lastPrompt = lastPromptRaw?.[1] || null;
  const promptCount = Number(promptCountRaw?.[1] || '0') || 0;
  return { lastPrompt, promptCount };
};

const shouldRequestReview = async (ctx: ReviewRequestContext): Promise<boolean> => {
  if (Platform.OS === 'web') return false;
  if (ctx.isInRound) return false;
  if (ctx.upgradeSheetShownThisSession) return false;
  if (ctx.roundsCount < REVIEW_MIN_ROUNDS) return false;
  if (ctx.trigger !== 'personal_best' && ctx.trigger !== 'insight_unlocked') return false;

  const available = await StoreReview.isAvailableAsync();
  if (!available) return false;

  const { lastPrompt, promptCount } = await getPromptState();
  if (promptCount >= REVIEW_MAX_PROMPTS) return false;

  const days = daysSince(lastPrompt);
  if (days !== null && days < REVIEW_COOLDOWN_DAYS) return false;

  return true;
};

export const requestAppReviewIfEligible = async (ctx: ReviewRequestContext): Promise<boolean> => {
  try {
    const eligible = await shouldRequestReview(ctx);
    if (!eligible) return false;

    await StoreReview.requestReview();
    const nextPromptCount = (await getPromptState()).promptCount + 1;
    await Storage.multiSet([
      [LAST_REVIEW_PROMPT_KEY, new Date().toISOString()],
      [REVIEW_PROMPT_COUNT_KEY, String(nextPromptCount)],
    ]);
    return true;
  } catch (error) {
    logger.warn('Review request failed:', error);
    return false;
  }
};
