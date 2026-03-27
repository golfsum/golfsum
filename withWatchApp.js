/**
 * withWatchApp.js
 *
 * Syncs Swift sources from watch-src/ into targets/watch (for @bacons/apple-targets)
 * and Watch bridge + phone WatchSessionManager into the main iOS app folder.
 *
 * Watch target is created by @bacons/apple-targets from targets/watch/expo-target.config.js.
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
      const watchTargetsDir = path.join(projectRoot, 'targets', 'watch');
      const mainIosDir = path.join(iosDir, MAIN_APP_NAME);
      const phoneBridgeDir = path.join(projectRoot, 'watch', 'ios-bridge');

      // Avoid duplicate @main / stale templates from older prebuilds
      ['index.swift', 'content.swift'].forEach((f) => {
        const stale = path.join(watchTargetsDir, f);
        if (fs.existsSync(stale)) {
          fs.unlinkSync(stale);
          console.log(`[withWatchApp] Removed stale watch file: ${f}`);
        }
      });

      // Sync Watch Swift sources -> apple-targets watch folder
      ['GolfSumWatchApp.swift', 'ContentView.swift', 'WatchSessionManager.swift'].forEach((f) =>
        copyIfChanged(path.join(watchSrcDir, f), path.join(watchTargetsDir, f))
      );

      // Phone: WCSession + RN bridge
      ['GolfSumWatchBridge.h', 'GolfSumWatchBridge.m', 'GolfSumWatchBridge.swift', 'WatchSessionManager.swift'].forEach((f) => {
        const src = path.join(phoneBridgeDir, f);
        if (fs.existsSync(src)) {
          copyIfChanged(src, path.join(mainIosDir, f));
        }
      });

      return modConfig;
    },
  ]);
};
