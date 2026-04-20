/**
 * withWatchApp.js
 *
 * Syncs Swift sources from watch-src/ into targets/watch (for @bacons/apple-targets)
 * and Watch bridge + phone WatchSessionManager into the main iOS app folder, then
 * registers the bridge files with the main app's Xcode target so the Obj-C
 * RCT_EXTERN_MODULE actually gets compiled (otherwise NativeModules.GolfSumWatchBridge
 * is undefined at runtime — the .m file is silently excluded from Compile Sources
 * by default).
 *
 * Watch target is created by @bacons/apple-targets from targets/watch/expo-target.config.js.
 */

const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MAIN_APP_NAME = 'GolfSum';
const APP_DELEGATE_MARKER = 'WatchSessionManager.shared.start() // withWatchApp';
/** Bridge + shared sources that must end up in the main app target's Compile Sources. */
const PHONE_TARGET_SOURCES = [
  'GolfSumWatchBridge.m',
  'GolfSumWatchBridge.swift',
  'WatchSessionManager.swift',
  'ActiveRound.swift',
  'SharedRoundStore.swift',
];

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

function patchAppDelegate(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const original = fs.readFileSync(filePath, 'utf8');
  if (original.includes(APP_DELEGATE_MARKER)) {
    return;
  }

  let next = original;

  if (filePath.endsWith('.swift')) {
    next = next.replace(
      /((?:override\s+)?func\s+application\([^\n]*didFinishLaunchingWithOptions[^\n]*\)\s*->\s*Bool\s*\{\s*\n)/,
      `$1    ${APP_DELEGATE_MARKER}\n`
    );
  } else {
    next = next.replace(
      /(-\s*\(BOOL\)application:\(UIApplication \*\)application didFinishLaunchingWithOptions:\(NSDictionary \*\)launchOptions\s*\{\s*\n)/,
      `$1  ${APP_DELEGATE_MARKER}\n`
    );
  }

  if (next !== original) {
    fs.writeFileSync(filePath, next, 'utf8');
    console.log(`[withWatchApp] Patched AppDelegate startup: ${path.basename(filePath)}`);
  } else {
    console.warn(`[withWatchApp] WARNING: Could not patch AppDelegate automatically: ${filePath}`);
  }
}

/** Ensure a source file is registered with the main app target as both a file
 *  reference and a Compile Sources build phase entry. Idempotent: running the
 *  plugin multiple times won't create duplicates. */
function ensureSourceFileInTarget(pbxProject, fileName, group, target) {
  // Look for an existing file reference with this name anywhere in the project.
  const existing = Object.entries(pbxProject.hash.project.objects.PBXFileReference || {})
    .find(([, ref]) => ref && typeof ref === 'object' && ref.path === fileName);

  if (existing) {
    // File already referenced; make sure it's in the target's Compile Sources phase.
    const [fileRefKey] = existing;
    const sourcesPhase = pbxProject.pbxSourcesBuildPhaseObj(target);
    const alreadyInBuild = sourcesPhase && sourcesPhase.files && sourcesPhase.files.some((f) => {
      const bf = pbxProject.hash.project.objects.PBXBuildFile?.[f.value];
      return bf && bf.fileRef === fileRefKey;
    });
    if (!alreadyInBuild) {
      pbxProject.addToPbxBuildFileSection({
        uuid: pbxProject.generateUuid(),
        fileRef: fileRefKey,
        basename: fileName,
        group: 'Sources',
        target,
      });
      console.log(`[withWatchApp] Added existing file ref to Compile Sources: ${fileName}`);
    }
    return;
  }

  // Add a fresh file reference + build file entry to the target.
  pbxProject.addSourceFile(fileName, { target }, group);
  console.log(`[withWatchApp] Registered with Xcode target: ${fileName}`);
}

module.exports = function withWatchApp(config) {
  // Step 1: copy files into the generated iOS project and patch AppDelegate.
  config = withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const iosDir = modConfig.modRequest.platformProjectRoot;

      const watchSrcDir = path.join(projectRoot, 'watch-src');
      const watchSharedDir = path.join(projectRoot, 'watch-shared');
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

      ['ActiveRound.swift', 'SharedRoundStore.swift'].forEach((f) => {
        copyIfChanged(path.join(watchSharedDir, f), path.join(watchTargetsDir, f));
        copyIfChanged(path.join(watchSharedDir, f), path.join(mainIosDir, f));
      });

      // Phone: WCSession + RN bridge
      ['GolfSumWatchBridge.h', 'GolfSumWatchBridge.m', 'GolfSumWatchBridge.swift', 'WatchSessionManager.swift'].forEach((f) => {
        const src = path.join(phoneBridgeDir, f);
        if (fs.existsSync(src)) {
          copyIfChanged(src, path.join(mainIosDir, f));
        }
      });

      patchAppDelegate(path.join(mainIosDir, 'AppDelegate.swift'));
      patchAppDelegate(path.join(mainIosDir, 'AppDelegate.mm'));
      patchAppDelegate(path.join(mainIosDir, 'AppDelegate.m'));

      return modConfig;
    },
  ]);

  // Step 2: add the bridge files to the main app target's Compile Sources phase.
  // Without this, NativeModules.GolfSumWatchBridge is undefined because the .m
  // file never gets compiled (auto-linking doesn't cover locally-added sources).
  config = withXcodeProject(config, (modConfig) => {
    const pbxProject = modConfig.modResults;
    const mainTargetUuid = pbxProject.findTargetKey(MAIN_APP_NAME)
      || pbxProject.getFirstTarget()?.uuid;

    if (!mainTargetUuid) {
      console.warn('[withWatchApp] Could not locate main app target; skipping source registration.');
      return modConfig;
    }

    // Find (or create) a group inside the main app folder to host the files.
    let group = pbxProject.pbxGroupByName(MAIN_APP_NAME);
    if (!group) {
      console.warn('[withWatchApp] Could not locate main app group; skipping source registration.');
      return modConfig;
    }
    const groupKey = pbxProject.findPBXGroupKey({ name: MAIN_APP_NAME })
      || pbxProject.findPBXGroupKey({ path: MAIN_APP_NAME });

    PHONE_TARGET_SOURCES.forEach((fileName) => {
      try {
        ensureSourceFileInTarget(pbxProject, fileName, groupKey, mainTargetUuid);
      } catch (err) {
        console.warn(`[withWatchApp] Could not register ${fileName}: ${err.message}`);
      }
    });

    return modConfig;
  });

  return config;
};
