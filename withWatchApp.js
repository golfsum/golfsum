/**
 * withWatchApp.js
 *
 * 1. Syncs Swift source files from watch-src/ and live-activity-src/ into ios/
 * 2. Calls scripts/add_watch_target.rb via execSync to add Watch + Widget
 *    targets to the Xcode project using the Xcodeproj gem.
 *
 * This runs during expo prebuild — no separate prebuildCommand needed.
 */

const { withDangerousMod } = require('@expo/config-plugins');
const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const WATCH_APP_NAME     = 'GolfSumWatch';
const LIVE_ACTIVITY_NAME = 'GolfSumLiveActivity';
const MAIN_APP_NAME      = 'GolfSum';

function copyIfChanged(src, dst) {
  if (!fs.existsSync(src)) {
    console.warn(`[withWatchApp] WARNING: Source not found: ${src}`);
    return;
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const content = fs.readFileSync(src, 'utf8');
  if (fs.existsSync(dst) && fs.readFileSync(dst, 'utf8') === content) return;
  fs.writeFileSync(dst, content, 'utf8');
  console.log(`[withWatchApp] Synced: ${path.basename(dst)}`);
}

module.exports = function withWatchApp(config) {
  return withDangerousMod(config, ['ios', async (modConfig) => {
    const projectRoot = modConfig.modRequest.projectRoot;
    const iosDir      = modConfig.modRequest.platformProjectRoot;

    const watchSrcDir  = path.join(projectRoot, 'watch-src');
    const laSrcDir     = path.join(projectRoot, 'live-activity-src');
    const watchIosDir  = path.join(iosDir, WATCH_APP_NAME);
    const laIosDir     = path.join(iosDir, LIVE_ACTIVITY_NAME);
    const mainIosDir   = path.join(iosDir, MAIN_APP_NAME);

    // ── Sync Watch Swift sources ─────────────────────────────────────────────
    ['GolfSumWatchApp.swift', 'ContentView.swift', 'WatchSessionManager.swift'].forEach(f =>
      copyIfChanged(path.join(watchSrcDir, f), path.join(watchIosDir, f))
    );

    // ── Sync Watch ObjC bridge → main app ────────────────────────────────────
    ['GolfSumWatchBridge.h', 'GolfSumWatchBridge.m'].forEach(f =>
      copyIfChanged(path.join(watchSrcDir, 'bridge', f), path.join(mainIosDir, f))
    );

    // ── Sync Live Activity + Widget Swift sources ─────────────────────────────
    [
      'GolfSumLiveActivityAttributes.swift',
      'GolfSumLiveActivity.swift',
      'GolfSumWidget.swift',
      'GolfSumLiveActivityBundle.swift',
    ].forEach(f =>
      copyIfChanged(path.join(laSrcDir, f), path.join(laIosDir, f))
    );

    // ── Sync Live Activity bridge → main app ─────────────────────────────────
    [
      'GolfSumLiveActivityBridge.h',
      'GolfSumLiveActivityBridge.m',
      'GolfSumLiveActivityManager.swift',
      'GolfSumWidgetBridge.swift',
    ].forEach(f =>
      copyIfChanged(path.join(laSrcDir, 'bridge', f), path.join(mainIosDir, f))
    );

    // ── Run Ruby script to add Xcode targets ─────────────────────────────────
    const rubyScript = path.join(projectRoot, 'scripts', 'add_watch_target.rb');

    if (!fs.existsSync(rubyScript)) {
      console.warn('[withWatchApp] Ruby script not found — skipping target setup');
      return modConfig;
    }

    console.log('[withWatchApp] Running add_watch_target.rb...');
    try {
      execSync(`ruby "${rubyScript}"`, {
        stdio: 'inherit',
        cwd: iosDir,   // run from ios/ so Dir.glob('*.xcodeproj') finds the project
      });
      console.log('[withWatchApp] Ruby script completed');
    } catch (err) {
      console.error('[withWatchApp] Ruby script failed:', err.message);
      // Don't throw — let the build continue and show the error in logs
    }

    return modConfig;
  }]);
};