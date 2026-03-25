/**
 * Xcode 14+ signs Pod resource bundles; those targets need DEVELOPMENT_TEAM.
 * Inserts a post_install snippet (after the opening line) so bundle targets match your team.
 * Team is read from ENV["APPLE_TEAM_ID"] (set via EAS secrets or eas.json env) or from the user Xcode project after prebuild sets ios.appleTeamId.
 */

const { withPodfile, createRunOncePlugin } = require('@expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

const TAG = 'golfsum-pod-resource-bundle-signing';

const RUBY_LINES = [
  '  team_id = ENV["APPLE_TEAM_ID"]',
  '  if team_id.nil? || team_id.empty?',
  '    installer.aggregate_targets.each do |aggregate_target|',
  '      user_project = aggregate_target.user_project',
  '      next unless user_project',
  '      user_project.native_targets.each do |nt|',
  '        nt.build_configurations.each do |bc|',
  '          tid = bc.build_settings["DEVELOPMENT_TEAM"]',
  '          if tid && !tid.to_s.strip.empty? && tid.to_s.strip != "$(inherited)"',
  '            team_id = tid.to_s.strip',
  '            break',
  '          end',
  '        end',
  '        break if team_id && !team_id.empty?',
  '      end',
  '      break if team_id && !team_id.empty?',
  '    end',
  '  end',
  '  if team_id && !team_id.empty?',
  '    installer.pods_project.targets.each do |target|',
  '      next unless target.respond_to?(:product_type) && target.product_type == "com.apple.product-type.bundle"',
  '      target.build_configurations.each do |bc|',
  '        bc.build_settings["DEVELOPMENT_TEAM"] = team_id',
  '      end',
  '    end',
  '  end',
].join('\n');

function withPodResourceBundleSigning(config) {
  return withPodfile(config, (cfg) => {
    const contents = cfg.modResults.contents;
    let result;
    try {
      result = mergeContents({
        tag: TAG,
        src: contents,
        newSrc: RUBY_LINES,
        anchor: /^\s*post_install do \|installer\|\s*$/m,
        offset: 1,
        comment: '#',
      });
    } catch (e) {
      if (e && e.code === 'ERR_NO_MATCH') {
        throw new Error(
          '[withPodResourceBundleSigning] Could not find "post_install do |installer|" in ios/Podfile; update the plugin anchor or your Podfile template.',
        );
      }
      throw e;
    }
    if (result.didMerge || result.didClear) {
      cfg.modResults.contents = result.contents;
    }
    return cfg;
  });
}

module.exports = createRunOncePlugin(withPodResourceBundleSigning, 'withPodResourceBundleSigning', '1.0.0');
