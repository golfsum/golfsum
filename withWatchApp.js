/**
 * withWatchApp.js
 *
 * Syncs Swift sources from watch-src/ and live-activity-src/ into targets/watch
 * and targets/widget (for @bacons/apple-targets), and Watch bridge files into the
 * main iOS app folder.
 *
 * Watch + widget Xcode targets are created by @bacons/apple-targets from
 * each targets subfolder expo-target.config.js. Do not run add_watch_target.rb;
 * duplicate targets break prebuild (buildConfigurationList / removeFromProject).
 */

const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MAIN_APP_NAME = 'GolfSum';

function copyIfChanged(src, dst) {
  if (!fs.existsSync(src)) {
    console.warn(`[withWatchApp] WARNING: Source not found: ${src}`);
    return;
  }

  fs.mkdirSync(path.dirname(dst), { recursive: true });

  const content = fs.readFileSync(src, 'utf8');
  if (fs.existsSync(dst) && fs.readFileSync(dst, 'utf8') === content) {
    return;
  }

  fs.writeFileSync(dst, content, 'utf8');
  console.log(`[withWatchApp] Synced: ${path.basename(dst)}`);
}

module.exports = function withWatchApp(config) {
  return withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const iosDir = modConfig.modRequest.platformProjectRoot;

      const watchSrcDir = path.join(projectRoot, 'watch-src');
      const laSrcDir = path.join(projectRoot, 'live-activity-src');
      const watchTargetsDir = path.join(projectRoot, 'targets', 'watch');
      const widgetTargetsDir = path.join(projectRoot, 'targets', 'widget');
      const mainIosDir = path.join(iosDir, MAIN_APP_NAME);

      // Sync Watch Swift sources -> apple-targets watch folder
      ['GolfSumWatchApp.swift', 'ContentView.swift', 'WatchSessionManager.swift'].forEach((f) =>
        copyIfChanged(path.join(watchSrcDir, f), path.join(watchTargetsDir, f))
      );

      // Sync Watch ObjC bridge -> main app
      ['GolfSumWatchBridge.h', 'GolfSumWatchBridge.m'].forEach((f) =>
        copyIfChanged(path.join(watchSrcDir, 'bridge', f), path.join(mainIosDir, f))
      );

      // Sync Widget-only Swift sources -> apple-targets widget folder
      ['GolfSumWidget.swift', 'GolfSumLiveActivityBundle.swift'].forEach((f) =>
        copyIfChanged(path.join(laSrcDir, f), path.join(widgetTargetsDir, f))
      );

      ['GolfSumWidgetBridge.swift'].forEach((f) =>
        copyIfChanged(path.join(laSrcDir, 'bridge', f), path.join(mainIosDir, f))
      );

      return modConfig;
    },
  ]);
};