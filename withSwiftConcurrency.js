const { withPodfile } = require('@expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

const TAG = 'golfsum-swift-concurrency';

module.exports = function withSwiftConcurrency(config) {
  return withPodfile(config, (cfg) => {
    const RUBY_LINES = [
      '  installer.pods_project.targets.each do |target|',
      '    target.build_configurations.each do |cfg|',
      '      # Xcode only honors SWIFT_VERSION values like 5.0 / 6.0 (not 5.10). Using an invalid',
      '      # value falls back to Swift 5.0 mode, where @MainActor is unknown and ExpoModulesCore fails.',
      "      cfg.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'off'",
      '      # SE-0411 (isolated default values) - keep for pods that still need it (e.g. Mapbox).',
      "      flags = cfg.build_settings['OTHER_SWIFT_FLAGS']",
      "      feature_flag = '-enable-upcoming-feature IsolatedDefaultValues'",
      '      if flags.nil?',
      "        cfg.build_settings['OTHER_SWIFT_FLAGS'] = feature_flag",
      '      elsif flags.is_a?(Array)',
      '        unless flags.join(" ").include?(feature_flag)',
      "          cfg.build_settings['OTHER_SWIFT_FLAGS'] = (flags + [feature_flag]).uniq",
      '        end',
      '      else',
      '        flags_str = flags.to_s',
      '        unless flags_str.include?(feature_flag)',
      "          cfg.build_settings['OTHER_SWIFT_FLAGS'] = \"#{flags_str} #{feature_flag}\".strip",
      '        end',
      '      end',
      '      # ExpoModulesCore / ExpoUI ship Swift 6 + @MainActor; must use Swift 6 language mode.',
      '      # Mapbox SDK also expects a modern Swift toolchain.',
      '      name = target.name.to_s',
      '      if name.include?("ExpoModules") || name.include?("ExpoUI") || name.include?("Mapbox")',
      "        cfg.build_settings['SWIFT_VERSION'] = '6.0'",
      '      else',
      "        cfg.build_settings['SWIFT_VERSION'] = '5.0'",
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