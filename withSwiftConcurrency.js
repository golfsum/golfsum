const { withPodfile } = require('@expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

const TAG = 'golfsum-swift-concurrency';

module.exports = function withSwiftConcurrency(config) {
  return withPodfile(config, (cfg) => {
    const RUBY_LINES = [
      '  installer.pods_project.targets.each do |target|',
      '    target.build_configurations.each do |cfg|',
      "      # Relax Swift 6 strict concurrency; expo-modules-core isn't Swift 6-clean yet.",
      "      cfg.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'off'",
      "      # SE-0411: isolated default value expressions",
      "      # Fixes \"main actor-isolated default value in a nonisolated context\".",
      "      flags = cfg.build_settings['OTHER_SWIFT_FLAGS']",
      "      feature_flag = '-enable-upcoming-feature IsolatedDefaultValues'",
      '      if flags.nil?',
      "        cfg.build_settings['OTHER_SWIFT_FLAGS'] = feature_flag",
      '      elsif flags.is_a?(Array)',
      '        unless flags.join(\" \").include?(feature_flag)',
      "          cfg.build_settings['OTHER_SWIFT_FLAGS'] = (flags + [feature_flag]).uniq",
      '        end',
      '      else',
      '        flags_str = flags.to_s',
      '        unless flags_str.include?(feature_flag)',
      "          cfg.build_settings['OTHER_SWIFT_FLAGS'] = \"#{flags_str} #{feature_flag}\".strip",
      '        end',
      '      end',
      "      if target.name && (target.name.include?('ExpoModulesCore') || target.name.include?('ExpoUI') || target.name.include?('Mapbox'))",
      "        cfg.build_settings['SWIFT_VERSION'] = '5.10'",
      '      else',
      "        cfg.build_settings['SWIFT_VERSION'] = '5'",
      '      end',
      '    end',
      '  end',
    ];

    const RUBY_LINES_STR = RUBY_LINES.join('\n');

    const result = mergeContents({
      tag: TAG,
      src: cfg.modResults.contents,
      newSrc: RUBY_LINES_STR,
      anchor: /^\s*post_install do \|installer\|\s*$/m,
      offset: 1,
      comment: '#',
    });

    if (result.didMerge || result.didClear) {
      cfg.modResults.contents = result.contents;
    }

    return cfg;
  });
};