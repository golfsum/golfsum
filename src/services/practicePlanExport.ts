import { Platform, Share } from 'react-native';
import type { PracticePlan } from './patternInsights';

interface PracticePlanContext {
  playerName?: string | null;
  roundsCount?: number;
}

const formatHeaderLine = (title: string, value?: string | number) => {
  if (value === undefined || value === null || value === '') return title;
  return `${title}: ${value}`;
};

export const buildPracticePlanText = (
  plan: PracticePlan,
  context: PracticePlanContext = {}
) => {
  const lines: string[] = [];
  lines.push('GolfSum Practice Plan');
  lines.push('---------------------');
  if (context.playerName) {
    lines.push(formatHeaderLine('Player', context.playerName));
  }
  if (context.roundsCount !== undefined) {
    lines.push(formatHeaderLine('Based on rounds', context.roundsCount));
  }
  lines.push(formatHeaderLine('Total Duration', plan.totalDuration));
  lines.push('');

  plan.drills.forEach((drill, index) => {
    lines.push(`${index + 1}. ${drill.title} (${drill.duration})`);
    drill.steps.forEach(step => lines.push(`   - ${step}`));
    if (drill.constraints?.targetWindow || drill.constraints?.successGoal) {
      lines.push('   Targets:');
      if (drill.constraints.targetWindow) {
        lines.push(`   - Target: ${drill.constraints.targetWindow}`);
      }
      if (drill.constraints.successGoal) {
        lines.push(`   - Goal: ${drill.constraints.successGoal}`);
      }
    }
    lines.push('');
  });

  if (plan.quickWarmUp) {
    lines.push('Quick Warm-Up (5 min)');
    lines.push(`Duration: ${plan.quickWarmUp.duration}`);
    plan.quickWarmUp.steps.forEach(step => lines.push(`   - ${step}`));
  }

  return lines.join('\n');
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export const buildPracticePlanHtml = (
  plan: PracticePlan,
  context: PracticePlanContext = {}
) => {
  const drillsHtml = plan.drills
    .map((drill, index) => {
      const steps = drill.steps.map(step => `<li>${escapeHtml(step)}</li>`).join('');
      const constraints = drill.constraints
        ? `
          <div class="constraints">
            ${drill.constraints.targetWindow ? `<div><strong>Target:</strong> ${escapeHtml(drill.constraints.targetWindow)}</div>` : ''}
            ${drill.constraints.successGoal ? `<div><strong>Goal:</strong> ${escapeHtml(drill.constraints.successGoal)}</div>` : ''}
          </div>
        `
        : '';

      return `
        <div class="drill">
          <h3>${index + 1}. ${escapeHtml(drill.title)} <span>${escapeHtml(drill.duration)}</span></h3>
          <ul>${steps}</ul>
          ${constraints}
        </div>
      `;
    })
    .join('');

  const quickWarmUp = plan.quickWarmUp
    ? `
      <div class="warmup">
        <h3>Quick Warm-Up <span>${escapeHtml(plan.quickWarmUp.duration)}</span></h3>
        <ul>${plan.quickWarmUp.steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ul>
        <p class="note">Focus on feel and commitment, not perfection.</p>
      </div>
    `
    : '';

  return `
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          body {
            font-family: Arial, sans-serif;
            color: #111827;
            padding: 24px;
          }
          h1 {
            margin-bottom: 8px;
          }
          .meta {
            color: #6B7280;
            font-size: 12px;
            margin-bottom: 24px;
          }
          .drill, .warmup {
            margin-bottom: 18px;
            padding: 12px;
            border: 1px solid #E5E7EB;
            border-radius: 8px;
            background: #F9FAFB;
          }
          h3 {
            margin: 0 0 8px;
            font-size: 16px;
          }
          h3 span {
            font-weight: 400;
            font-size: 12px;
            color: #6B7280;
          }
          ul {
            margin: 0 0 8px 18px;
          }
          .constraints {
            font-size: 12px;
            color: #047857;
            margin-top: 6px;
          }
          .note {
            font-size: 12px;
            color: #6B7280;
            margin-top: 8px;
          }
        </style>
      </head>
      <body>
        <h1>GolfSum Practice Plan</h1>
        <div class="meta">
          ${context.playerName ? `<div>${escapeHtml(formatHeaderLine('Player', context.playerName))}</div>` : ''}
          ${context.roundsCount !== undefined ? `<div>${escapeHtml(formatHeaderLine('Based on rounds', context.roundsCount))}</div>` : ''}
          <div>${escapeHtml(formatHeaderLine('Total Duration', plan.totalDuration))}</div>
        </div>
        ${drillsHtml}
        ${quickWarmUp}
      </body>
    </html>
  `;
};

export const sharePracticePlanText = async (
  plan: PracticePlan,
  context?: PracticePlanContext
) => {
  const message = buildPracticePlanText(plan, context);
  await Share.share({ message });
};

export const exportPracticePlanPdf = async (
  plan: PracticePlan,
  context?: PracticePlanContext
) => {
  try {
    // Optional dependency: only invoked when user taps export.
    const Print = require('expo-print');
    const html = buildPracticePlanHtml(plan, context);
    const result = await Print.printToFileAsync({ html });
    const uri = result?.uri;
    if (!uri) {
      throw new Error('Failed to generate PDF');
    }

    try {
      const Sharing = require('expo-sharing');
      if (Sharing && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'GolfSum Practice Plan',
        });
        return;
      }
    } catch {
      // Fall back to Share/open.
    }

    if (Platform.OS === 'web') {
      window.open(uri, '_blank');
      return;
    }

    await Share.share({ url: uri, message: 'GolfSum Practice Plan' });
  } catch (error) {
    await sharePracticePlanText(plan, context);
  }
};
