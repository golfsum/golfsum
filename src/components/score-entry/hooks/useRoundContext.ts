import { useEffect, useState } from 'react';
import { getRounds } from '../../../services/roundsService';
import { buildScorePrediction, type ScorePrediction } from '../../../services/scorePredictionService';
import { findGhostRound, type GhostRound } from '../../../services/ghostRoundService';
import type { SavedRound } from '../../../types';
import type { WeatherData } from '../../../services/weatherService';
import type { TeeBox } from '../../../services/golfCourseApiService';
import { logger } from '../../../utils/logger';

interface UseRoundContextParams {
  courseId: string;
  selectedTeeBox: TeeBox | null;
  showTeeSelection: boolean;
  currentWeather: WeatherData | null;
}

export function useRoundContext({
  courseId,
  selectedTeeBox,
  showTeeSelection,
  currentWeather,
}: UseRoundContextParams) {
  const [historicalRounds, setHistoricalRounds] = useState<SavedRound[]>([]);
  const [scorePrediction, setScorePrediction] = useState<ScorePrediction | null>(null);
  const [ghostRound, setGhostRound] = useState<GhostRound | null>(null);
  const [historicalBaseline, setHistoricalBaseline] = useState<{
    avgGirRate: number;
    avgPuttsPerRound: number;
    avgFirRate: number;
  } | null>(null);
  const [preRoundTip, setPreRoundTip] = useState<string | null>(null);
  const [weatherContextTip, setWeatherContextTip] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedTeeBox || showTeeSelection) return;
    let isMounted = true;

    const buildTips = async () => {
      try {
        const rounds = await getRounds();
        if (!isMounted) return;
        setHistoricalRounds(rounds);

        if (courseId) {
          const courseRounds = rounds.filter((r) => r.courseId === courseId && r.score > 0);
          if (courseRounds.length >= 2) {
            const weatherTemp = currentWeather?.temp
              ? parseFloat(String(currentWeather.temp).replace(/[^0-9.-]/g, ''))
              : null;
            const prediction = buildScorePrediction(courseRounds, {
              tempF: Number.isFinite(weatherTemp) ? weatherTemp : null,
              windDesc: currentWeather?.wind ?? null,
              conditions: currentWeather?.conditions ?? null,
            });
            setScorePrediction(prediction);
          } else {
            setScorePrediction(null);
          }

          const ghost = findGhostRound(rounds, courseId);
          setGhostRound(ghost);
        }

        const recentRounds = rounds.slice(0, 12);
        const holes = recentRounds.flatMap((round) => round.holes || []);
        const baselineGirHoles = holes.filter(
          (hole) => hole.greenHit !== null && hole.greenHit !== undefined
        );
        const baselineFirHoles = holes.filter(
          (hole) => hole.par >= 4 && hole.fairwayHit !== null && hole.fairwayHit !== undefined
        );
        const baselinePuttRounds = recentRounds.filter((round) => (round.stats?.putts ?? 0) > 0);

        const avgGirRate =
          baselineGirHoles.length > 0
            ? baselineGirHoles.filter((hole) => hole.greenHit === true).length / baselineGirHoles.length
            : 0.35;
        const avgFirRate =
          baselineFirHoles.length > 0
            ? baselineFirHoles.filter((hole) => hole.fairwayHit === true).length / baselineFirHoles.length
            : 0.45;
        const avgPuttsPerRound =
          baselinePuttRounds.length > 0
            ? baselinePuttRounds.reduce((sum, round) => sum + (round.stats?.putts ?? 33), 0) /
              baselinePuttRounds.length
            : 33;

        setHistoricalBaseline({ avgGirRate, avgPuttsPerRound, avgFirRate });

        const par3Misses = holes.filter((hole) => hole.par === 3 && typeof hole.greenHit === 'string');
        const par3Left = par3Misses.filter((hole) => hole.greenHit === 'left').length;
        const par3Right = par3Misses.filter((hole) => hole.greenHit === 'right').length;
        const par3Total = par3Left + par3Right;
        const par3LeftPct = par3Total > 0 ? (par3Left / par3Total) * 100 : 0;
        const par3RightPct = par3Total > 0 ? (par3Right / par3Total) * 100 : 0;

        const roundsWithPutts = recentRounds.filter(
          (round) => round.stats.putts && (round.holes?.length || round.holeCount)
        );
        const puttsAverage =
          roundsWithPutts.length > 0
            ? roundsWithPutts.reduce((sum, round) => {
                const holeCount = round.holes?.length || round.holeCount || 18;
                return sum + (round.stats.putts || 0) / holeCount;
              }, 0) / roundsWithPutts.length
            : null;

        const roundsWithFir = recentRounds.filter((round) => round.stats.fairwaysPossible);
        const firAverage =
          roundsWithFir.length > 0
            ? roundsWithFir.reduce((sum, round) => {
                return sum + ((round.stats.fairways || 0) / (round.stats.fairwaysPossible || 1)) * 100;
              }, 0) / roundsWithFir.length
            : null;

        let tip: string | null = null;
        if (par3Total >= 6 && par3LeftPct >= 80) {
          tip = 'Aim at the right side of Par 3 greens and play for the draw.';
        } else if (par3Total >= 6 && par3RightPct >= 80) {
          tip = 'Aim at the left side of Par 3 greens and play for the fade.';
        } else if (puttsAverage !== null && puttsAverage >= 2.0) {
          tip = "Today's focus: read greens once, trust the line, and commit.";
        } else if (firAverage !== null && firAverage < 45) {
          tip = 'Commit to your start line off the tee and favor the wide side.';
        }

        if (!preRoundTip) {
          setPreRoundTip(tip);
        }

        if (currentWeather && !weatherContextTip) {
          const weatherRounds = rounds.filter((round) => round.weather?.conditions || round.weather?.wind);
          const isWindy = (wind?: string) =>
            wind === 'Moderate' || wind === 'Strong' || wind === 'Very Strong';
          const isCalmLike = (wind?: string) => wind === 'Calm' || wind === 'Light';
          const num = (value: unknown) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : 0;
          };
          const scored = (list: SavedRound[]) => list.filter((r) => num(r.score) > 0);
          let contextTip: string | null = null;

          if (isWindy(currentWeather.wind)) {
            const windyRounds = scored(weatherRounds.filter((r) => isWindy(r.weather?.wind)));
            const calmRounds = scored(weatherRounds.filter((r) => isCalmLike(r.weather?.wind)));

            if (windyRounds.length >= 2 && calmRounds.length >= 2) {
              const windyAvg = windyRounds.reduce((sum, r) => sum + num(r.score), 0) / windyRounds.length;
              const calmAvg = calmRounds.reduce((sum, r) => sum + num(r.score), 0) / calmRounds.length;
              const windyFwHit = windyRounds.reduce((sum, r) => sum + num(r.stats?.fairways), 0);
              const windyFwPossible = windyRounds.reduce(
                (sum, r) => sum + num(r.stats?.fairwaysPossible),
                0
              );
              const windyFwPct = windyFwPossible > 0 ? Math.round((windyFwHit / windyFwPossible) * 100) : null;

              contextTip =
                `Windy-day plan: you average ${windyAvg.toFixed(1)} in wind vs ${calmAvg.toFixed(1)} in calm${
                  windyFwPct !== null ? `. Fairways drop to ${windyFwPct}%` : ''
                }. Prioritize keeping tee shots in play.`;
            }
          }

          if (!contextTip) {
            const normalizedConditions = currentWeather.conditions?.toLowerCase() || '';
            const match = weatherRounds.find((round) => {
              const roundConditions = round.weather?.conditions?.toLowerCase() || '';
              const roundTemp = round.weather?.temp ? parseFloat(round.weather.temp) : null;
              const tempMatch =
                roundTemp !== null && currentWeather.temp !== undefined
                  ? Math.abs(roundTemp - currentWeather.temp) <= 8
                  : true;
              return roundConditions && normalizedConditions && roundConditions === normalizedConditions && tempMatch;
            });

            if (match) {
              const parts = [
                match.weather?.temp,
                match.weather?.conditions,
                match.weather?.wind ? `${match.weather.wind} wind` : null,
              ].filter(Boolean);
              contextTip = `Similar to your ${match.score} at ${match.courseName} - ${parts.join(' - ')}`;
            }
          }

          if (contextTip) {
            setWeatherContextTip(contextTip);
          }
        }
      } catch (error) {
        logger.warn('Failed to build pre-round tips:', error);
      }
    };

    buildTips();
    return () => {
      isMounted = false;
    };
  }, [courseId, currentWeather, preRoundTip, selectedTeeBox, showTeeSelection, weatherContextTip]);

  return {
    historicalRounds,
    scorePrediction,
    ghostRound,
    historicalBaseline,
    preRoundTip,
    weatherContextTip,
    setPreRoundTip,
    setWeatherContextTip,
  };
}
